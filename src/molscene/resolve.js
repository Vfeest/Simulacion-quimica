// Orchestrates parser -> chemistry -> 3D. Produces a fully resolved
// "scene model": every atom has a position, every bonding/lone/radical
// electron group has a color, a participant list, and the 3D axis each
// participant's orbital points along. orbitals.js and viewer.js only
// consume this output - they don't know about molscene syntax at all.

import { parseMolscene } from './parser.js';
import { resolveChemistry } from './chemistry.js';
import { elementData, ANGSTROM_PER_A0 } from './elements.js';
import { v3, sub, normalize, scale, add, length, solveDirections, perpFrame } from './geometry.js';

export const ROLE_COLORS = {
  sigma: 0xffb454,
  pi1: 0x4cd6c2,
  pi2: 0xe07de0,
  lone: 0x9d8cf0,
  radical: 0xff6b6b,
  ionicLone: 0xff7fb0
};

const ORDER_LENGTH_FACTOR = { 1: 1.0, 2: 0.87, 3: 0.78 };

function bondLength(elA, elB, kind, order){
  const base = (elementData(elA).covalentRadius + elementData(elB).covalentRadius) / ANGSTROM_PER_A0;
  if (kind === 'ionic') return base * 1.15;
  if (kind === 'hydrogen') return base * 1.7;
  return base * (ORDER_LENGTH_FACTOR[order] || 1.0);
}

function allEdges(atomId, atom){
  const out = [];
  atom.covalent.forEach(function(n){ out.push({ to: n.id, kind: 'covalent', order: n.order }); });
  atom.ionic.forEach(function(n){ out.push({ to: n.id, kind: 'ionic', order: 1 }); });
  atom.hydrogen.forEach(function(n){ out.push({ to: n.id, kind: 'hydrogen', order: 1 }); });
  return out;
}

function layoutPositions(chem){
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
      const edges = allEdges(curId, cur);
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

export function resolveMolscene(text){
  const { model, errors: parseErrors } = parseMolscene(text);
  if (parseErrors.length) return { errors: parseErrors, warnings: [], atoms: [], groups: [], connectors: [], name: model.name, view: model.view };

  const chem = resolveChemistry(model);
  const positions = layoutPositions(chem);

  const atoms = [];
  const sigmaAxis = new Map(); // atomId -> Map(neighborId -> unit axis)
  chem.atoms.forEach(function(atom, id){
    sigmaAxis.set(id, new Map());
    atoms.push({ id, element: atom.element, charge: atom.charge, pos: positions.get(id), color: elementData(atom.element).color });
  });

  const groups = [];
  const connectors = [];

  // Sigma + pi domains, from real bond geometry.
  model.bonds.forEach(function(b){
    const A = chem.atoms.get(b.a), B = chem.atoms.get(b.b);
    if (!A || !B) return;
    const posA = positions.get(b.a), posB = positions.get(b.b);
    const axisLine = normalize(sub(posB, posA));

    if (b.order === 'ionic' || b.order === 'hydrogen'){
      connectors.push({ a: b.a, b: b.b, kind: b.order });
      return;
    }

    const dirAtoB = axisLine, dirBtoA = scale(axisLine, -1);
    sigmaAxis.get(b.a).set(b.b, dirAtoB);
    sigmaAxis.get(b.b).set(b.a, dirBtoA);

    groups.push({
      id: 'sigma:' + b.a + '-' + b.b, role: 'sigma', color: ROLE_COLORS.sigma, count: 2,
      participants: [
        { atomId: b.a, axis: dirAtoB, sFrac: chem.atoms.get(b.a).sFrac },
        { atomId: b.b, axis: dirBtoA, sFrac: chem.atoms.get(b.b).sFrac }
      ]
    });

    const order = b.order === 'single' ? 1 : b.order === 'double' ? 2 : 3;
    const piCount = order - 1;
    if (piCount > 0){
      const [p1, p2] = perpFrame(axisLine);
      const piAxes = [p1, p2].slice(0, piCount);
      const piRoles = ['pi1', 'pi2'];
      piAxes.forEach(function(axis, i){
        groups.push({
          id: 'pi' + (i+1) + ':' + b.a + '-' + b.b, role: piRoles[i], color: ROLE_COLORS[piRoles[i]], count: 2,
          participants: [
            { atomId: b.a, axis, sFrac: 0 },
            { atomId: b.b, axis, sFrac: 0 }
          ]
        });
      });
    }
  });

  // Lone pairs / radicals / ionic connectors, from whatever's left after bonding.
  chem.atoms.forEach(function(atom, id){
    const fixed = [];
    sigmaAxis.get(id).forEach(function(axis){ fixed.push(axis); });
    atom.ionic.forEach(function(n){ fixed.push(normalize(sub(positions.get(n.id), positions.get(id)))); });
    atom.hydrogen.forEach(function(n){ fixed.push(normalize(sub(positions.get(n.id), positions.get(id)))); });

    const freeCount = atom.lonePairs + atom.radicals;
    const free = solveDirections(fixed, freeCount);
    const isIonicOnly = atom.sigmaCount === 0 && atom.ionic.length > 0;

    for (let i = 0; i < atom.lonePairs; i++){
      groups.push({
        id: 'lone:' + id + ':' + i, role: isIonicOnly ? 'ionicLone' : 'lone',
        color: isIonicOnly ? ROLE_COLORS.ionicLone : ROLE_COLORS.lone, count: 2,
        participants: [{ atomId: id, axis: free[i], sFrac: atom.sFrac }]
      });
    }
    for (let i = 0; i < atom.radicals; i++){
      groups.push({
        id: 'radical:' + id + ':' + i, role: 'radical', color: ROLE_COLORS.radical, count: 1,
        participants: [{ atomId: id, axis: free[atom.lonePairs + i], sFrac: atom.sFrac }]
      });
    }
  });

  return { errors: [], warnings: chem.warnings, name: model.name, atoms, groups, connectors, view: model.view };
}

export { length };
