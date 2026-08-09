// Metallic bonding: unlike a covalent pair, the electrons a metal atom
// gives up aren't shared with one specific neighbor - they're free to
// roam the whole cluster ("electron sea"). So instead of one group per
// bond, every metallic-connected component of atoms becomes a single
// group whose participants are *all* the atoms in that cluster, each
// contributing a plain spherical (sFrac=1) character - no bond axis, the
// point is exactly that these electrons don't belong to one direction.
//
// The sphere radius and the density's effective radius (a0) are both
// scaled from the cluster's nearest-neighbor spacing so adjacent atoms'
// spheres overlap - without that, electrons would just be trapped near
// whichever atom they started next to instead of actually roaming.

import { ROLE_COLORS } from './roles.js';
import { sub, length, connectedComponents } from './geometry.js';

export function buildMetallicGroups(model, chem, positions){
  const edges = model.bonds.filter(function(b){ return b.order === 'metallic' && chem.atoms.has(b.a) && chem.atoms.has(b.b); });
  if (edges.length === 0) return { groups: [], connectors: [] };

  const adjacency = new Map();
  edges.forEach(function(b){
    if (!adjacency.has(b.a)) adjacency.set(b.a, []);
    if (!adjacency.has(b.b)) adjacency.set(b.b, []);
    adjacency.get(b.a).push(b.b);
    adjacency.get(b.b).push(b.a);
  });

  const connectors = edges.map(function(b){ return { a: b.a, b: b.b, kind: 'metallic' }; });

  const groups = connectedComponents(Array.from(adjacency.keys()), adjacency).map(function(atomIds, idx){
    let minSpacing = Infinity;
    edges.forEach(function(b){
      if (atomIds.indexOf(b.a) === -1 || atomIds.indexOf(b.b) === -1) return;
      minSpacing = Math.min(minSpacing, length(sub(positions.get(b.a), positions.get(b.b))));
    });
    if (!isFinite(minSpacing)) minSpacing = 3;
    const radius = minSpacing * 0.62; // overlaps with same-radius neighbor spheres along every declared bond
    const a0 = minSpacing * 0.55;     // wide enough that |ψ|² stays non-negligible between adjacent nuclei

    const count = atomIds.reduce(function(sum, id){ return sum + chem.atoms.get(id).poolElectrons; }, 0);

    return {
      id: 'metallic:' + idx, role: 'metallic', color: ROLE_COLORS.metallic, count: Math.max(1, count),
      participants: atomIds.map(function(id){ return { atomId: id, axis: null, sFrac: 1, radius, a0 }; })
    };
  });

  return { groups, connectors };
}
