import { describe, it, expect } from 'vitest';
import { toposort } from '../../../lib/utils/toposort.js';

const graph = (entries) => new Map(entries);

describe('Utils.toposort', () => {
  it('returns an empty array for an empty graph', () => {
    expect(toposort(graph([]))).to.deep.equal([]);
  });

  it('places a dependent before its dependency', () => {
    expect(toposort(graph([['a', ['b']]]))).to.deep.equal(['a', 'b']);
  });

  it('includes items that are only named as a dependency', () => {
    const sorted = toposort(graph([['a', ['b', 'c']]]));

    expect(sorted).to.have.members(['a', 'b', 'c']);
    expect(sorted[0]).to.equal('a');
  });

  it('orders a dependency chain', () => {
    const sorted = toposort(
      graph([
        ['c', ['b']],
        ['b', ['a']],
        ['a', []]
      ])
    );

    expect(sorted).to.deep.equal(['c', 'b', 'a']);
  });

  it('orders a chain given out of order', () => {
    const sorted = toposort(
      graph([
        ['a', []],
        ['b', ['a']],
        ['c', ['b']]
      ])
    );

    expect(sorted).to.deep.equal(['c', 'b', 'a']);
  });

  it('lists each item once when it is reachable by several paths', () => {
    const sorted = toposort(
      graph([
        ['a', ['b', 'c']],
        ['b', ['d']],
        ['c', ['d']],
        ['d', []]
      ])
    );

    // The shared dependency is placed first (at the end), so the branches come out in
    // reverse order behind their dependent.
    expect(sorted).to.deep.equal(['a', 'c', 'b', 'd']);
  });

  it('returns independent items in reverse add order', () => {
    expect(
      toposort(
        graph([
          ['a', []],
          ['b', []],
          ['c', []]
        ])
      )
    ).to.deep.equal(['c', 'b', 'a']);
  });

  it('throws on a cycle', () => {
    expect(() =>
      toposort(
        graph([
          ['a', ['b']],
          ['b', ['a']]
        ])
      )
    ).to.throw('Cyclic dependency found. a is dependent of itself.');
  });

  it('throws on a self dependency', () => {
    expect(() => toposort(graph([['a', ['a']]]))).to.throw('Cyclic dependency found. a is dependent of itself.');
  });

  it('reports the chain that formed the cycle', () => {
    expect(() =>
      toposort(
        graph([
          ['a', ['b']],
          ['b', ['c']],
          ['c', ['a']]
        ])
      )
    ).to.throw('Dependency chain: a -> b -> c => a');
  });
});
