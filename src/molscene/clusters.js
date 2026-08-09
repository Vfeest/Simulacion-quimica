// Which atoms of a resolved molecule belong to the same rigid body (i.e.
// are structurally connected). Used by reaction-scene.js: during the
// "approach" phase of a reaction animation, each original molecule moves
// as one rigid piece rather than atom-by-atom.

import { connectedComponents } from './geometry.js';

export function computeClusters(resolved){
  const adjacency = new Map();
  resolved.atoms.forEach(function(a){ adjacency.set(a.id, []); });
  function edge(a, b){ adjacency.get(a).push(b); adjacency.get(b).push(a); }

  resolved.connectors.forEach(function(c){ edge(c.a, c.b); });
  resolved.groups.filter(function(g){ return g.role === 'sigma'; }).forEach(function(g){
    edge(g.participants[0].atomId, g.participants[1].atomId);
  });

  return connectedComponents(resolved.atoms.map(function(a){ return a.id; }), adjacency);
}
