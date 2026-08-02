// Orchestrates parser -> chemistry -> 3D. Produces a fully resolved
// "scene model": every atom has a position, every electron group (bonding,
// lone pair, radical, metallic pool) has a color, participants, and the
// axis each participant's orbital points along. orbitals.js and viewer.js
// only consume this output - they don't know about molscene syntax, and
// this file doesn't know about Three.js.

import { parseMolscene } from './parser.js';
import { resolveChemistry } from './chemistry.js';
import { elementData } from './elements.js';
import { layoutPositions } from './layout.js';
import { buildBondGroups } from './bonds.js';
import { buildLoneGroups } from './lone-pairs.js';
import { buildMetallicGroups } from './metallic.js';

export { ROLE_COLORS, ROLE_LABELS } from './roles.js';

export function resolveMolscene(text){
  const { model, errors: parseErrors } = parseMolscene(text);
  if (parseErrors.length){
    return { errors: parseErrors, warnings: [], atoms: [], groups: [], connectors: [], name: model.name, view: model.view };
  }

  const chem = resolveChemistry(model);
  const positions = layoutPositions(chem);

  const atoms = Array.from(chem.atoms.values()).map(function(atom){
    return { id: atom.id, element: atom.element, charge: atom.charge, pos: positions.get(atom.id), color: elementData(atom.element).color };
  });

  const bonds = buildBondGroups(model, chem, positions);
  const lone = buildLoneGroups(chem, positions, bonds.sigmaAxis);
  const metallic = buildMetallicGroups(model, chem, positions);

  return {
    errors: [],
    warnings: chem.warnings,
    name: model.name,
    atoms,
    groups: bonds.groups.concat(lone, metallic.groups),
    connectors: bonds.connectors.concat(metallic.connectors),
    view: model.view
  };
}
