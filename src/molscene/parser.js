// Parser for the molscene text language. See docs/molscene-spec.md for the
// full grammar. Deliberately line-oriented (one statement per line) so a
// small LLM-authored snippet degrades gracefully: a mistake on one line
// produces one clear error instead of derailing the whole parse.

import { ELEMENTS } from './elements.js';

const RE_MOLECULE = /^molecule\s+(.+)$/i;
const RE_ATOM = /^atom\s+(\w+)\s*:\s*([A-Za-z]{1,2})\s*(.*)$/i;
const RE_BOND = /^bond\s+(\w+)\s*-\s*(\w+)\s*:\s*(single|double|triple|ionic|hydrogen|metallic)\s*(.*)$/i;
const RE_VIEW = /^view\s+(.*)$/i;
const RE_DESCRIBE = /^describe\s*$/i;
const RE_END = /^end\s*$/i;
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
  const model = { name: 'molécula', description: '', atoms: [], bonds: [], view: null };
  const atomIds = new Set();

  let inDescribe = false;
  let describeLines = [];

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++){
    const raw = lines[i];
    const line = raw.replace(/#.*$/, '').trim();
    const lineNo = i + 1;

    if (inDescribe){
      if (RE_END.test(line)){ model.description = describeLines.join('\n').trim(); inDescribe = false; describeLines = []; }
      else describeLines.push(raw);
      continue;
    }
    if (!line) continue;

    let m;
    if (RE_DESCRIBE.test(line)){ inDescribe = true; describeLines = []; continue; }
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

    errors.push('Línea ' + lineNo + ': no reconocida: "' + raw.trim() + '". Se esperaba "molecule", "atom", "bond", "view" o "describe".');
  }
  if (inDescribe) errors.push('Falta "end" para cerrar el bloque "describe".');

  if (model.atoms.length === 0) errors.push('No se declaró ningún átomo (falta al menos una línea "atom ...").');

  return { model, errors };
}

const RE_REACTION = /^reaction\s+(.+)$/i;
const RE_REACTANTS = /^reactants\s*$/i;
const RE_PRODUCTS = /^products\s*$/i;

// A reaction is molscene's before/after: two independent molecule bodies
// (parsed with parseMolscene, unchanged) sharing atom ids between them so
// the renderer can animate each shared atom from its "reactants" position
// to its "products" position. Anything without a "reaction" line is just
// a regular molecule, parsed exactly as before.
export function parseReactionOrMolecule(text){
  const lines = text.split('\n');
  const isReaction = lines.some(function(l){ return RE_REACTION.test(l.replace(/#.*$/, '').trim()); });
  if (!isReaction) return Object.assign({ kind: 'molecule' }, parseMolscene(text));

  let name = 'reacción';
  let description = '';
  let reactantsLines = null, productsLines = null;
  let current = null;
  let buffer = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++){
    const raw = lines[i];
    const line = raw.replace(/#.*$/, '').trim();
    const lineNo = i + 1;
    if (!line){ if (current) buffer.push(''); continue; }

    if (current === null){
      let m;
      if ((m = line.match(RE_REACTION))){ name = m[1].trim(); continue; }
      if (RE_DESCRIBE.test(line)){ current = 'describe'; buffer = []; continue; }
      if (RE_REACTANTS.test(line)){ current = 'reactants'; buffer = []; continue; }
      if (RE_PRODUCTS.test(line)){ current = 'products'; buffer = []; continue; }
      errors.push('Línea ' + lineNo + ': se esperaba "describe", "reactants" o "products" para abrir un bloque de la reacción.');
      continue;
    }
    if (RE_END.test(line)){
      if (current === 'describe') description = buffer.join('\n').trim();
      else if (current === 'reactants') reactantsLines = buffer;
      else productsLines = buffer;
      current = null; buffer = [];
      continue;
    }
    buffer.push(raw);
  }
  if (current !== null) errors.push('Falta "end" para cerrar el bloque "' + current + '".');
  if (reactantsLines === null) errors.push('Falta el bloque "reactants ... end".');
  if (productsLines === null) errors.push('Falta el bloque "products ... end".');
  if (errors.length) return { kind: 'reaction', name, description, errors, reactants: null, products: null };

  const r = parseMolscene(reactantsLines.join('\n'));
  const p = parseMolscene(productsLines.join('\n'));
  r.errors.forEach(function(e){ errors.push('En "reactants": ' + e); });
  p.errors.forEach(function(e){ errors.push('En "products": ' + e); });
  if (errors.length) return { kind: 'reaction', name, description, errors, reactants: null, products: null };

  return { kind: 'reaction', name, description, errors: [], reactants: r.model, products: p.model };
}
