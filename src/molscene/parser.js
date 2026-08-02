// Parser for the molscene text language. See docs/molscene-spec.md for the
// full grammar. Deliberately line-oriented (one statement per line) so a
// small LLM-authored snippet degrades gracefully: a mistake on one line
// produces one clear error instead of derailing the whole parse.

import { ELEMENTS } from './elements.js';

const RE_MOLECULE = /^molecule\s+(.+)$/i;
const RE_ATOM = /^atom\s+(\w+)\s*:\s*([A-Za-z]{1,2})\s*(.*)$/i;
const RE_BOND = /^bond\s+(\w+)\s*-\s*(\w+)\s*:\s*(single|double|triple|ionic|hydrogen|metallic)\s*(.*)$/i;
const RE_VIEW = /^view\s+(.*)$/i;
const RE_AT = /at\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i;
const RE_CHARGE = /charge\s+(-?\d+)/i;
const RE_LONEPAIRS = /lonepairs\s+(\d+)/i;

function parseKeyValueTail(tail){
  const out = {};
  const at = tail.match(RE_AT);
  if (at) out.pos = [parseFloat(at[1]), parseFloat(at[2]), parseFloat(at[3])];
  const charge = tail.match(RE_CHARGE);
  if (charge) out.charge = parseInt(charge[1], 10);
  const lp = tail.match(RE_LONEPAIRS);
  if (lp) out.lonepairs = parseInt(lp[1], 10);
  return out;
}

export function parseMolscene(text){
  const errors = [];
  const model = { name: 'molécula', atoms: [], bonds: [], view: null };
  const atomIds = new Set();

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++){
    const raw = lines[i];
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const lineNo = i + 1;

    let m;
    if ((m = line.match(RE_MOLECULE))){
      model.name = m[1].trim();
      continue;
    }
    if ((m = line.match(RE_ATOM))){
      const id = m[1];
      const element = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
      const extra = parseKeyValueTail(m[3] || '');
      if (atomIds.has(id)){
        errors.push('Línea ' + lineNo + ': átomo "' + id + '" declarado dos veces.');
        continue;
      }
      if (!ELEMENTS[element]){
        errors.push('Línea ' + lineNo + ': elemento desconocido "' + element + '". Soportados: ' + Object.keys(ELEMENTS).join(', ') + '.');
        continue;
      }
      atomIds.add(id);
      model.atoms.push({ id, element, charge: extra.charge || 0, lonepairsOverride: extra.lonepairs, pos: extra.pos || null, line: lineNo });
      continue;
    }
    if ((m = line.match(RE_BOND))){
      const a = m[1], b = m[2], order = m[3].toLowerCase();
      if (!atomIds.has(a)) errors.push('Línea ' + lineNo + ': el enlace usa "' + a + '" antes de declararlo con "atom ' + a + ': ...".');
      if (!atomIds.has(b)) errors.push('Línea ' + lineNo + ': el enlace usa "' + b + '" antes de declararlo con "atom ' + b + ': ...".');
      model.bonds.push({ a, b, order, line: lineNo });
      continue;
    }
    if ((m = line.match(RE_VIEW))){
      const tail = m[1];
      const az = tail.match(/azimuth\s+(-?[\d.]+)/i);
      const pol = tail.match(/polar\s+(-?[\d.]+)/i);
      const rad = tail.match(/radius\s+(-?[\d.]+)/i);
      model.view = {
        azimuth: az ? parseFloat(az[1]) : undefined,
        polar: pol ? parseFloat(pol[1]) : undefined,
        radius: rad ? parseFloat(rad[1]) : undefined
      };
      continue;
    }

    errors.push('Línea ' + lineNo + ': no reconocida: "' + raw.trim() + '". Se esperaba "molecule", "atom", "bond" o "view".');
  }

  if (model.atoms.length === 0) errors.push('No se declaró ningún átomo (falta al menos una línea "atom ...").');

  return { model, errors };
}
