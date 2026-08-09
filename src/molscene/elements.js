// Periodic data used by the engine. Deliberately limited to what's needed
// for bonding/geometry inference and rendering, not a full periodic table.
//
// valence: electrons available for bonding/lone pairs (main-group rule:
//   group 1-2 -> group number, group 13-18 -> group number - 10).
// covalentRadius: single-bond covalent radius in angstrom (Pyykko/Cordero,
//   rounded), used only to scale auto-layout bond lengths.
// dBlock: true marks transition metals, for which automatic Lewis/VSEPR
//   inference is not attempted (see docs/molscene-spec.md, "Limitations").

export const ELEMENTS = {
  H:  { z: 1,  valence: 1, covalentRadius: 0.31, color: '#d7e2f0' },
  He: { z: 2,  valence: 2, covalentRadius: 0.28, color: '#8fd6e0' },
  Li: { z: 3,  valence: 1, covalentRadius: 1.28, color: '#b08fe0' },
  Be: { z: 4,  valence: 2, covalentRadius: 0.96, color: '#7fbf7f' },
  B:  { z: 5,  valence: 3, covalentRadius: 0.84, color: '#e0a05f' },
  C:  { z: 6,  valence: 4, covalentRadius: 0.76, color: '#8a93a3' },
  N:  { z: 7,  valence: 5, covalentRadius: 0.71, color: '#4f7fe0' },
  O:  { z: 8,  valence: 6, covalentRadius: 0.66, color: '#e0483a' },
  F:  { z: 9,  valence: 7, covalentRadius: 0.57, color: '#5fd66b' },
  Ne: { z: 10, valence: 8, covalentRadius: 0.58, color: '#8fd6e0' },
  Na: { z: 11, valence: 1, covalentRadius: 1.66, color: '#a97fe0' },
  Mg: { z: 12, valence: 2, covalentRadius: 1.41, color: '#7fbf7f' },
  Al: { z: 13, valence: 3, covalentRadius: 1.21, color: '#a3a9b5' },
  Si: { z: 14, valence: 4, covalentRadius: 1.11, color: '#e0c93f' },
  P:  { z: 15, valence: 5, covalentRadius: 1.07, color: '#e0863f' },
  S:  { z: 16, valence: 6, covalentRadius: 1.05, color: '#e0c93f' },
  Cl: { z: 17, valence: 7, covalentRadius: 1.02, color: '#3fae55' },
  Ar: { z: 18, valence: 8, covalentRadius: 1.06, color: '#8fd6e0' },
  K:  { z: 19, valence: 1, covalentRadius: 2.03, color: '#a97fe0' },
  Ca: { z: 20, valence: 2, covalentRadius: 1.76, color: '#7fbf7f' },
  Br: { z: 35, valence: 7, covalentRadius: 1.20, color: '#b0523f' },
  I:  { z: 53, valence: 7, covalentRadius: 1.39, color: '#8f5fbf' },
  Fe: { z: 26, valence: 2, covalentRadius: 1.32, color: '#d68f3f', dBlock: true },
  Cu: { z: 29, valence: 2, covalentRadius: 1.32, color: '#d68f5f', dBlock: true },
  Zn: { z: 30, valence: 2, covalentRadius: 1.22, color: '#a3a9b5', dBlock: true },
  Ag: { z: 47, valence: 1, covalentRadius: 1.45, color: '#c7ccd6', dBlock: true }
};

export function elementData(symbol){
  const el = ELEMENTS[symbol];
  if (!el) throw new Error('Elemento desconocido en molscene: "' + symbol + '". Agregalo a src/molscene/elements.js.');
  return el;
}

// Bohr radius in angstrom - the unit conversion between real bond lengths
// and the a0=1 scene units the orbital math is expressed in.
export const ANGSTROM_PER_A0 = 0.529;
