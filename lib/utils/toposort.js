// Topological sort of a dependency graph. Replaces toposort-class
// (https://github.com/gustavohenke/toposort, MIT), which this codebase only used to order
// models by their foreign key constraints. Ordering, including how ties between independent
// nodes are broken, matches that package.

/**
 * Sorts a dependency graph so that every item comes before the items it depends on.
 *
 * Items that are only ever named as a dependency are included in the result too, so the
 * caller sees names it never added as keys.
 *
 * @param graph Maps an item to the items it depends on. Iteration order of the map, and of
 *              each dependency list, decides the relative order of independent items.
 *
 * @returns Every item and dependency, each exactly once, dependents before their dependencies
 * @throws {Error} If the graph contains a cycle
 */
export function toposort(graph) {
  // Accumulate unique nodes, in the order they are first named.
  const nodes = [];
  const seen = new Set();

  for (const [item, deps] of graph) {
    for (const node of [item, ...deps]) {
      if (!seen.has(node)) {
        seen.add(node);
        nodes.push(node);
      }
    }
  }

  // Fill the result from the end: a node is placed once all of its dependencies have been
  // placed behind it.
  const sorted = Array.from({ length: nodes.length });
  let place = nodes.length;
  const visited = new Set();

  const visit = (node, predecessors) => {
    if (predecessors.includes(node)) {
      throw new Error(
        `Cyclic dependency found. ${node} is dependent of itself.\nDependency chain: ${predecessors.join(' -> ')} => ${node}`
      );
    }

    if (visited.has(node)) {
      return;
    }
    visited.add(node);

    const deps = graph.get(node);
    if (deps) {
      for (const dep of deps) {
        visit(dep, [...predecessors, node]);
      }
    }

    sorted[--place] = node;
  };

  for (const node of nodes) {
    visit(node, []);
  }

  return sorted;
}
