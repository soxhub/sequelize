import Pooling from 'generic-pool';
import { createPoolMetrics } from '../../../telemetry.js';

/**
 * A `generic-pool` pool that reports the OpenTelemetry `db.client.connection.*` metrics for itself.
 *
 * Timing `acquire` is the whole reason this is a subclass rather than a wrapper around a pool
 * created by `Pooling.createPool`: overriding the method keeps the instrumentation part of the pool
 * instead of something installed onto it afterwards, and covers every caller — including
 * `Pool#use`, which calls `this.acquire` internally. Timing at the connection manager's call sites
 * would miss that, and would also split the timing across the three places a pool is acquired from.
 *
 * `generic-pool` offers no acquire event to hang this off; it emits only `factoryCreateError` and
 * `factoryDestroyError`.
 */
export class InstrumentedPool extends Pooling.Pool {
  /**
   * @param {Object} factory `generic-pool` factory: `create`, `destroy` and `validate`
   * @param {Object} options `generic-pool` options
   * @param {Object} attributes Attributes to report this pool's measurements under
   */
  constructor(factory, options, attributes) {
    // `Pooling.createPool` is a one-line wrapper around this constructor, and every collaborator it
    // passes is a documented top-level export, so calling it directly costs nothing but the arity.
    super(Pooling.DefaultEvictor, Pooling.Deque, Pooling.PriorityQueue, factory, options);

    this.metrics = createPoolMetrics(this, attributes);

    /**
     * When each checked out resource was handed to its borrower.
     *
     * `generic-pool` tracks the same thing on the loan it keeps per borrowed resource, but only
     * under private names and as a wall clock `Date.now()`. Keeping our own leaves the timing on
     * the monotonic clock `wait_time` already uses, and off `generic-pool` internals. A weak map
     * so that a resource abandoned without being released — a caller that never returns it, a pool
     * thrown away mid-loan — is collectable and simply goes unrecorded.
     */
    this.checkoutStarts = new WeakMap();
  }

  /**
   * Acquire a resource, recording how long the caller waited for it.
   *
   * A wait that ends in a timeout is counted as a timeout rather than recorded as a wait, so the
   * histogram describes waits that actually produced a connection instead of piling up at the
   * configured `acquire` timeout.
   *
   * @param {Number} [priority] See https://github.com/coopernurse/node-pool#priority-queueing
   * @return {Promise<Object>} The acquired resource
   */
  async acquire(...args) {
    const start = performance.now();

    try {
      const resource = await super.acquire(...args);

      this.metrics.recordWaitTime((performance.now() - start) / 1000);
      this.checkoutStarts.set(resource, performance.now());

      return resource;
    } catch (err) {
      // Matching on the name is how `generic-pool` itself recognizes these; the error class is
      // internal to the package and not reachable from here.
      if (err.name === 'TimeoutError') {
        this.metrics.recordTimeout();
      }

      throw err;
    }
  }

  /**
   * Return a resource to the pool, recording how long it was checked out.
   *
   * @param {Object} resource The resource to return
   * @return {Promise} Resolves once the resource is back in the pool
   */
  release(resource) {
    this.recordCheckIn(resource);

    return super.release(resource);
  }

  /**
   * Destroy a checked out resource, recording how long it was checked out.
   *
   * A connection that is thrown away rather than returned was still held for as long as it was
   * held, so it belongs in the histogram — leaving it out would drop exactly the checkouts that
   * ended badly, which are the ones worth seeing.
   *
   * @param {Object} resource The resource to destroy
   * @return {Promise} Resolves once the resource is destroyed
   */
  destroy(resource) {
    this.recordCheckIn(resource);

    return super.destroy(resource);
  }

  /**
   * Record the checkout that `resource` is at the end of, if this pool started one for it.
   *
   * Clearing the start time as it is recorded is what keeps a resource from being counted twice:
   * a second `release` of the same resource — which `generic-pool` rejects anyway — finds nothing
   * to record, as does a `release` of something this pool never handed out.
   *
   * @param {Object} resource A resource being returned or destroyed
   */
  recordCheckIn(resource) {
    const start = this.checkoutStarts.get(resource);

    if (start === undefined) {
      return;
    }

    this.checkoutStarts.delete(resource);
    this.metrics.recordUseTime((performance.now() - start) / 1000);
  }

  /**
   * Stop reporting this pool's metrics. Call it when the pool is closed, so its observable
   * callbacks don't keep it alive or keep reporting a frozen queue depth.
   */
  detachMetrics() {
    this.metrics.detach();
  }
}

export default InstrumentedPool;
