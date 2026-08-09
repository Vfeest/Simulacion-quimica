// Electron bookkeeping: turns declared atoms/bonds/charges into the
// standard "steric number -> hybridization" call every intro chemistry
// course teaches (VSEPR / valence bond theory), plus lone pairs and
// leftover unpaired (radical) electrons. No 3D vectors here on purpose -
// this module only counts electrons; geometry.js/resolve.js turn the
// counts into directions.

import { elementData } from './elements.js';

const HYBRID_TABLE = {
  0: { label: 'none', sFrac: 1 },
  1: { label: 'none', sFrac: 1 },
  2: { label: 'sp', sFrac: 0.5 },
  3: { label: 'sp2', sFrac: 1/3 },
  4: { label: 'sp3', sFrac: 0.25 },
  5: { label: 'sp3d', sFrac: 0.2 },
  6: { label: 'sp3d2', sFrac: 1/6 }
};

export function resolveChemistry(model){
  const warnings = [];
  const atomsById = new Map();
  model.atoms.forEach(function(a){ atomsById.set(a.id, { def: a, covalent: [], ionic: [], hydrogen: [], metallic: [] }); });

  model.bonds.forEach(function(b){
    const A = atomsById.get(b.a), B = atomsById.get(b.b);
    if (!A || !B) return; // already reported by the parser
    if (b.a === b.b){ warnings.push('Línea ' + b.line + ': un átomo no puede enlazarse consigo mismo.'); return; }
    const order = b.order === 'single' ? 1 : b.order === 'double' ? 2 : b.order === 'triple' ? 3 : 1;
    if (b.order === 'ionic'){
      A.ionic.push({ id: b.b, line: b.line }); B.ionic.push({ id: b.a, line: b.line });
    } else if (b.order === 'hydrogen'){
      A.hydrogen.push({ id: b.b, line: b.line }); B.hydrogen.push({ id: b.a, line: b.line });
    } else if (b.order === 'metallic'){
      A.metallic.push({ id: b.b, line: b.line }); B.metallic.push({ id: b.a, line: b.line });
    } else {
      A.covalent.push({ id: b.b, order, line: b.line }); B.covalent.push({ id: b.a, order, line: b.line });
    }
  });

  const atoms = new Map();
  atomsById.forEach(function(rec, id){
    const el = elementData(rec.def.element);
    const valenceElectrons = el.valence - rec.def.charge;
    const sigmaCount = rec.covalent.length;
    const piCount = rec.covalent.reduce(function(sum, n){ return sum + (n.order - 1); }, 0);
    const electronsInBonds = sigmaCount + piCount;

    const hasMetallic = rec.metallic.length > 0;
    let lonePairs, radicals, poolElectrons = 0;
    if (rec.def.lonepairsOverride != null){
      lonePairs = rec.def.lonepairsOverride;
      radicals = 0;
    } else {
      let remaining = valenceElectrons - electronsInBonds;
      if (remaining < 0){
        warnings.push('Átomo "' + id + '" (línea ' + rec.def.line + '): tiene más enlaces de los que sus electrones de valencia permiten; revisá el orden de enlace o la carga.');
        remaining = 0;
      }
      if (hasMetallic){
        // Electrons not already spent on covalent bonds join the shared
        // "electron sea" of the metallic cluster instead of staying as
        // this atom's own lone pairs - see metallic.js.
        poolElectrons = remaining;
        lonePairs = 0; radicals = 0;
      } else {
        lonePairs = Math.floor(remaining / 2);
        radicals = remaining % 2;
      }
    }

    const isHydrogenLike = rec.def.element === 'H' || rec.def.element === 'He';
    const stericNumber = sigmaCount === 0 ? 0 : sigmaCount + lonePairs;
    const hybrid = isHydrogenLike
      ? { label: 's', sFrac: 1 }
      : (sigmaCount === 0 ? { label: 'none', sFrac: 1 } : (HYBRID_TABLE[Math.min(6, stericNumber)] || HYBRID_TABLE[6]));

    atoms.set(id, {
      id, element: rec.def.element, charge: rec.def.charge, explicitPos: rec.def.pos,
      valenceElectrons, sigmaCount, piCount, lonePairs, radicals, poolElectrons,
      stericNumber, hybridLabel: hybrid.label, sFrac: hybrid.sFrac,
      covalent: rec.covalent, ionic: rec.ionic, hydrogen: rec.hydrogen, metallic: rec.metallic
    });
  });

  return { atoms, warnings };
}
