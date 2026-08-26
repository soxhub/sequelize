import { chai, should } from 'vitest';
import chaiDatetime from './support/chai-datetime.js';

// Vitest's `expect` is chai, so the local datetime matchers register the same way they did when the
// suite imported chai directly. This lives in `setupFiles` rather than `test/support.js` because a
// handful of unit files never import support, and a matcher that exists only for some files is worse
// than one that always exists.
chai.use(chaiDatetime);
chai.config.includeStack = true;
should();
