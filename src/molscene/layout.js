// Auto-layout: assigns a 3D position to every atom that didn't get an
// explicit `at (x, y, z)` in the source text, by walking the bond graph
// breadth-first and placing each new atom along one of its parent's
// free VSEPR-solved directions (geometry.js), at the real covalent (or
// ionic/hydrogen/metallic) bond length for that pair of elements.

import { elementData, ANGSTROM_PER_A0 } from './elements.js';
import { v3, sub, normalize, scale, add, solveDirections } from './geometry.js';

const ORDER_LENGTH_FACTOR = { 1: 1.0, 2: 0.87, 3: 0.78 };

export function bondLength(elA, elB, kind, order){
  const base = (elementData(elA).covalentRadius + elementData(elB).covalentRadius) / ANGSTROM_PER_A0;
  if (kind === 'ionic') return base * 1.15;
  if (kind === 'hydrogen') return base * 1.7;
  if (kind === 'metallic') return base * 1.05;
  return base * (ORDER_LENGTH_FACTOR[order] || 1.0);
}

export function allEdges(atom){
  const out = [];
  atom.covalent.forEach(function(n){ out.push({ to: n.id, kind: 'covalent', order: n.order }); });
  atom.ionic.forEach(function(n){ out.push({ to: n.id, kind: 'ionic', order: 1 }); });
  atom.hydrogen.forEach(function(n){ out.push({ to: n.id, kind: 'hydrogen', order: 1 }); });
  atom.metallic.forEach(function(n){ out.push({ to: n.id, kind: 'metallic', order: 1 }); });
  return out;
}

export function layoutPositions(chem){
  const positions = new Map();
  const visited = new Set();
  let component = 0;

  chem.atoms.forEach(function(atom, id){
    if (visited.has(id)) return;
    const root = atom.explicitPos ? v3(atom.explicitPos[0], atom.explicitPos[1], atom.explicitPos[2])
                                   : v3(component * 4.5, 0, 0);
    positions.set(id, root);
    visited.add(id);
    component++;

    const queue = [id];
    while (queue.length){
      const curId = queue.shift();
      const cur = chem.atoms.get(curId);
      const edges = allEdges(cur);
      const totalDomains = edges.length + cur.lonePairs + cur.radicals;

      for (const edge of edges){
        if (visited.has(edge.to)) continue;
        const placedDirs = edges
          .filter(function(e){ return visited.has(e.to); })
          .map(function(e){ return normalize(sub(positions.get(e.to), positions.get(curId))); });
        const free = solveDirections(placedDirs, Math.max(1, totalDomains - placedDirs.length));
        const dir = free[0] || v3(1, 0, 0);

        const neighbor = chem.atoms.get(edge.to);
        const explicit = neighbor.explicitPos;
        const pos = explicit
          ? v3(explicit[0], explicit[1], explicit[2])
          : add(positions.get(curId), scale(dir, bondLength(cur.element, neighbor.element, edge.kind, edge.order)));
        positions.set(edge.to, pos);
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  });

  return positions;
}
