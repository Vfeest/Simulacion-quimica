// Turns each atom's leftover lone pairs / unpaired (radical) electrons
// into groups, pointed away from whatever the atom is already bonded to
// (see geometry.js's repulsion relaxation). Atoms in a metallic cluster
// never reach here with lonePairs > 0 - chemistry.js routes their
// leftover electrons into the shared pool instead (metallic.js).

import { normalize, sub, solveDirections } from './geometry.js';
import { ROLE_COLORS } from './roles.js';

export function buildLoneGroups(chem, positions, sigmaAxis){
  const groups = [];

  chem.atoms.forEach(function(atom, id){
    const fixed = [];
    sigmaAxis.get(id).forEach(function(axis){ fixed.push(axis); });
    atom.ionic.forEach(function(n){ fixed.push(normalize(sub(positions.get(n.id), positions.get(id)))); });
    atom.hydrogen.forEach(function(n){ fixed.push(normalize(sub(positions.get(n.id), positions.get(id)))); });
    atom.metallic.forEach(function(n){ fixed.push(normalize(sub(positions.get(n.id), positions.get(id)))); });

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

  return groups;
}
