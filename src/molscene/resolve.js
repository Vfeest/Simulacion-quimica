// Orchestrates parser -> chemistry -> 3D. Produces a fully resolved
// "scene model": every atom has a position, every electron group (bonding,
// lone pair, radical, metallic pool) has a color, participants, and the
// axis each participant's orbital points along. orbitals.js and viewer.js
// only consume this output - they don't know about molscene syntax, and
// this file doesn't know about Three.js.
//
// A regular molecule resolves to { kind:'molecule', atoms, groups,
// connectors }. A reaction resolves to { kind:'reaction', reactants,
// products } - each side is itself a full molecule resolution, sharing
// atom ids so the renderer can animate one into the other.

import { parseReactionOrMolecule } from './parser.js';
import { resolveChemistry } from './chemistry.js';
import { elementData } from './elements.js';
import { layoutPositions } from './layout.js';
import { buildBondGroups } from './bonds.js';
import { buildLoneGroups } from './lone-pairs.js';
import { buildMetallicGroups } from './metallic.js';

export { ROLE_COLORS, ROLE_LABELS } from './roles.js';

function resolveModel(model){
  const chem = resolveChemistry(model);
  const positions = layoutPositions(chem);

  const atoms = Array.from(chem.atoms.values()).map(function(atom){
    return { id: atom.id, element: atom.element, charge: atom.charge, pos: positions.get(atom.id), color: elementData(atom.element).color };
  });

  const bonds = buildBondGroups(model, chem, positions);
  const lone = buildLoneGroups(chem, positions, bonds.sigmaAxis);
  const metallic = buildMetallicGroups(model, chem, positions);

  return {
    warnings: chem.warnings, name: model.name, atoms,
    groups: bonds.groups.concat(lone, metallic.groups),
    connectors: bonds.connectors.concat(metallic.connectors),
    view: model.view
  };
}

export function resolveMolscene(text){
  const parsed = parseReactionOrMolecule(text);

  if (parsed.kind === 'molecule'){
    if (parsed.errors.length){
      return { kind: 'molecule', errors: parsed.errors, warnings: [], atoms: [], groups: [], connectors: [], name: parsed.model.name, view: parsed.model.view };
    }
    return Object.assign({ kind: 'molecule', errors: [] }, resolveModel(parsed.model));
  }

  if (parsed.errors.length){
    return { kind: 'reaction', errors: parsed.errors, warnings: [], name: parsed.name, reactants: null, products: null };
  }

  const reactants = resolveModel(parsed.reactants);
  const products = resolveModel(parsed.products);
  const idsA = new Set(reactants.atoms.map(function(a){ return a.id; }));
  const idsB = new Set(products.atoms.map(function(a){ return a.id; }));
  const warnings = reactants.warnings.concat(products.warnings);
  idsA.forEach(function(id){ if (!idsB.has(id)) warnings.push('El átomo "' + id + '" está en "reactants" pero no en "products".'); });
  idsB.forEach(function(id){ if (!idsA.has(id)) warnings.push('El átomo "' + id + '" está en "products" pero no en "reactants".'); });

  return { kind: 'reaction', errors: [], warnings, name: parsed.name, reactants, products };
}
