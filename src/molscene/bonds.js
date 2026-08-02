// Turns covalent bonds into sigma/pi electron groups (real geometry: each
// hybrid orbital points straight at the actual bonded neighbor, so no
// sign convention has to be hand-picked - see docs/molscene-spec.md).
// Ionic and hydrogen bonds don't produce a shared orbital in this model;
// they only contribute a connector line for the renderer. Metallic bonds
// are handled entirely by metallic.js.

import { normalize, sub, scale, perpFrame } from './geometry.js';
import { ROLE_COLORS } from './roles.js';

const PI_ROLES = ['pi1', 'pi2'];

export function buildBondGroups(model, chem, positions){
  const groups = [];
  const connectors = [];
  const covalentBonds = [];
  const sigmaAxis = new Map();
  chem.atoms.forEach(function(_, id){ sigmaAxis.set(id, new Map()); });

  model.bonds.forEach(function(b){
    const A = chem.atoms.get(b.a), B = chem.atoms.get(b.b);
    if (!A || !B || b.order === 'metallic') return;

    if (b.order === 'ionic' || b.order === 'hydrogen'){
      connectors.push({ a: b.a, b: b.b, kind: b.order });
      return;
    }

    const order = b.order === 'single' ? 1 : b.order === 'double' ? 2 : 3;
    covalentBonds.push({ a: b.a, b: b.b, order });

    const axisLine = normalize(sub(positions.get(b.b), positions.get(b.a)));
    const dirAtoB = axisLine, dirBtoA = scale(axisLine, -1);
    sigmaAxis.get(b.a).set(b.b, dirAtoB);
    sigmaAxis.get(b.b).set(b.a, dirBtoA);

    groups.push({
      id: 'sigma:' + b.a + '-' + b.b, role: 'sigma', color: ROLE_COLORS.sigma, count: 2,
      participants: [
        { atomId: b.a, axis: dirAtoB, sFrac: A.sFrac },
        { atomId: b.b, axis: dirBtoA, sFrac: B.sFrac }
      ]
    });

    const piCount = order - 1;
    if (piCount > 0){
      perpFrame(axisLine).slice(0, piCount).forEach(function(axis, i){
        const role = PI_ROLES[i];
        groups.push({
          id: 'pi' + (i+1) + ':' + b.a + '-' + b.b, role, color: ROLE_COLORS[role], count: 2,
          participants: [
            { atomId: b.a, axis, sFrac: 0 },
            { atomId: b.b, axis, sFrac: 0 }
          ]
        });
      });
    }
  });

  return { groups, connectors, covalentBonds, sigmaAxis };
}
