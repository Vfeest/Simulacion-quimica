#!/usr/bin/env node
// Bundles src/molscene/*.js (and, for --mode=standalone/shell, vendor/three)
// into dependency-free output. Exists because the live demo (demo/) loads
// the engine as ~19 separate ES modules via a relative import graph, which
// only works when all of those files are actually reachable at those
// relative paths - true for this repo (or its GitHub Pages copy), false for
// a single pasted-in file such as an AI-authored chat artifact. This script
// flattens the same source files (no logic changes, just import/export
// stripped and concatenated in dependency order) into whichever shape the
// target host needs:
//
//   --mode=module     one ES module, keeps `import * as THREE from 'three'`.
//                      For hosts that already provide three.js as a package
//                      (e.g. claude.ai's React/HTML artifacts, which have it
//                      preinstalled) - just import { createViewer } from it.
//
//   --mode=standalone one full HTML document, everything inlined (three.js
//                      as a plain global script, the engine, the wiring,
//                      and one specific molecule's text) - zero network
//                      requests, zero other files. For strict-CSP sandboxes
//                      that block loading *any* external host, or any
//                      static file host/email/slide you want to drop a
//                      working viewer into as a single self-contained file.
//                      Reads a .molscene file (path given as a positional
//                      arg, defaults to examples/h2.molscene).
//
//   --mode=shell       an HTML + external .js pair (not inlined - see why
//                      below) that reads its molscene text from the URL
//                      fragment (location.hash) instead of having one baked
//                      in, for a caller that navigates an iframe's `src` to
//                      it with a different molecule each time:
//                      userscript/molscene-render.user.js and extension/
//                      both do this by setting
//                      `iframe.src = SHELL_URL + '#' + encodeURIComponent(text)`.
//                      Takes an output directory (default "dist") and
//                      writes <dir>/molscene-shell.html and
//                      <dir>/molscene-shell.js directly (two files, so no
//                      single stdout stream to redirect).
//
//                      Why not --mode=standalone's srcdoc+inline-script
//                      shape, just with a placeholder text block spliced in
//                      at runtime (what this used to do): an
//                      `iframe.srcdoc` document inherits the *embedding
//                      page's* Content-Security-Policy (browsers do this on
//                      purpose, so srcdoc/data:/blob: can't be used to
//                      dodge a page's CSP) - so on any chat site whose CSP
//                      disallows inline scripts (Gemini does; likely others
//                      too), the engine's inline <script> gets silently
//                      blocked. A real cross-origin navigation
//                      (`iframe.src = "https://..."` or
//                      `"chrome-extension://..."`) does NOT inherit the
//                      embedder's CSP - it gets its own origin's (GitHub
//                      Pages sets none; a packaged extension page gets the
//                      extension's own baseline CSP instead) - which is why
//                      this mode exists as a real navigation target rather
//                      than a string spliced into srcdoc. That baseline
//                      extension CSP still disallows *inline* scripts
//                      unconditionally (Chrome enforces this platform-wide,
//                      it can't be loosened via manifest.json), which is
//                      why the engine has to be an external .js file here
//                      specifically, unlike --mode=standalone.
//
// Usage:
//   node scripts/build-artifact.mjs --mode=module > dist/molscene-engine.module.js
//   node scripts/build-artifact.mjs --mode=standalone examples/glucose.molscene > out.html
//   node scripts/build-artifact.mjs --mode=shell dist
//
// Regenerate dist/ (and extension/dist/, its copy) after any change under
// src/molscene/ or vendor/three/:
//   npm run build:artifacts

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src', 'molscene');

// Dependency order: every file only refers to names defined earlier in this
// list (checked by hand against each file's `import { ... } from './x.js'`
// lines - see docs/architecture in README.md for the per-file responsibility
// table this mirrors).
const FILES = [
  'elements.js', 'geometry.js', 'roles.js', 'chemistry.js', 'layout.js',
  'bonds.js', 'lone-pairs.js', 'metallic.js', 'clusters.js', 'orbitals.js',
  'parser.js', 'resolve.js', 'scene-build.js', 'ball-stick.js',
  'camera-controls.js', 'electron-motion.js', 'reaction-scene.js',
  'reaction-motion.js', 'viewer.js'
];

const IMPORT_LINE = /^import\s.+;\s*$/;
const BARE_EXPORT_LINE = /^export\s*\{[^}]*\}(\s*from\s*'[^']+')?;\s*$/;
const EXPORT_PREFIX = /^export\s+(function|const|class|let)\b/;

function stripModuleSyntax(src){
  return src.split('\n')
    .filter(function(line){ return !IMPORT_LINE.test(line) && !BARE_EXPORT_LINE.test(line); })
    .map(function(line){ return line.replace(EXPORT_PREFIX, '$1'); })
    .join('\n');
}

function bundleEngine(){
  const parts = FILES.map(function(f){
    const src = readFileSync(join(SRC, f), 'utf8');
    return '// ---- src/molscene/' + f + ' ----\n' + stripModuleSyntax(src);
  });
  return parts.join('\n\n');
}

// vendor/three/three.module.js is a single file, zero internal imports, one
// trailing `export { A, B as C, ... };` - turn that into a plain global
// assignment (`X as Y` in an export means "Y = X" in an object literal, the
// reverse order of how it reads).
function bundleThreeAsGlobal(){
  const src = readFileSync(join(ROOT, 'vendor', 'three', 'three.module.js'), 'utf8');
  return src.replace(/export\s*\{([\s\S]*)\};\s*$/, function(_, names){
    const obj = names.replace(/(\w+)\s+as\s+(\w+)/g, '$2: $1');
    return 'window.THREE = {' + obj + '};';
  });
}

function buildModuleBundle(){
  return "// AUTO-GENERATED by scripts/build-artifact.mjs --mode=module - do not edit by hand.\n" +
    "// One flattened ES module version of src/molscene/, for hosts that already\n" +
    "// provide three.js as an importable package (e.g. claude.ai artifacts).\n" +
    "import * as THREE from 'three';\n\n" +
    bundleEngine() +
    "\n\nexport { createViewer, ROLE_LABELS, resolveMolscene };\n";
}

const PAGE_STYLE =
'  :root { color-scheme: dark; }\n' +
'  html, body { margin: 0; height: 100%; background: #070a10; font-family: system-ui, sans-serif; }\n' +
'  #stage { position: fixed; inset: 0; }\n' +
'  #panel { position: fixed; top: 12px; left: 12px; max-width: 340px; color: #e8ecf3; }\n' +
'  #panel h1 { font-size: 15px; margin: 0 0 4px; }\n' +
'  #description { font-size: 12.5px; line-height: 1.4; color: #b7c0d4; margin: 0 0 10px; white-space: pre-wrap; }\n' +
'  #modes button, #controls button { font: inherit; font-size: 12px; background: #141b2b; color: #e8ecf3; border: 1px solid #2a3550; border-radius: 6px; padding: 5px 10px; margin: 0 6px 6px 0; cursor: pointer; }\n' +
'  #modes button.active { background: #2f6fed; border-color: #2f6fed; }\n' +
'  #legend { font-size: 11.5px; margin-top: 8px; }\n' +
'  #legend .row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }\n' +
'  #legend .sw { width: 9px; height: 9px; border-radius: 50%; flex: none; }\n' +
'  #err { display: none; position: fixed; bottom: 12px; left: 12px; right: 12px; background: #401515; color: #ffb4b4; font-size: 12px; padding: 8px 10px; border-radius: 6px; white-space: pre-wrap; }\n' +
'  #reaction { display: none; margin-top: 8px; }\n' +
'  #reaction input { width: 100%; }\n';

const PAGE_BODY =
'<div id="stage"></div>\n' +
'<div id="panel">\n' +
'  <h1 id="name">molscene</h1>\n' +
'  <p id="description" style="display:none;"></p>\n' +
'  <div id="modes">\n' +
'    <button data-mode="cloud" class="active">Nube</button>\n' +
'    <button data-mode="atmosphere">Atmósfera</button>\n' +
'    <button data-mode="ballstick">Bola-palito</button>\n' +
'  </div>\n' +
'  <div id="controls">\n' +
'    <button id="playBtn">Pausar</button>\n' +
'    <button id="resetBtn">Reiniciar cámara</button>\n' +
'  </div>\n' +
'  <div id="reaction">\n' +
'    <button id="playReactionBtn">▶ Reproducir reacción</button>\n' +
'    <input id="reactionSlider" type="range" min="0" max="1" step="0.01" value="0">\n' +
'  </div>\n' +
'  <div id="legend"></div>\n' +
'</div>\n' +
'<div id="err"></div>\n';

// `readTextExpr` is a JS expression (as source text) evaluating to the
// molscene source the page should render - differs between standalone
// (a literal string baked in at build time) and shell (read from the URL
// fragment at load time).
function buildWiringJs(readTextExpr){
  return 'const THREE = window.THREE;\n' +
'const stage = document.getElementById("stage");\n' +
'const errBox = document.getElementById("err");\n' +
'const nameEl = document.getElementById("name");\n' +
'const descEl = document.getElementById("description");\n' +
'const legendEl = document.getElementById("legend");\n' +
'const reactionBox = document.getElementById("reaction");\n' +
'const viewer = createViewer(stage);\n' +
'function renderLegend(entries){\n' +
'  legendEl.innerHTML = "";\n' +
'  entries.forEach(function(e){\n' +
'    const row = document.createElement("div");\n' +
'    row.className = "row";\n' +
'    row.innerHTML = \'<span class="sw" style="background:\' + e.color + \'"></span><span>\' + e.label + \' — \' + e.count + \' e⁻</span>\';\n' +
'    legendEl.appendChild(row);\n' +
'  });\n' +
'}\n' +
'function reactionLabel(t){ if (t <= 0) return "reactivos"; if (t >= 1) return "productos"; return t < 0.5 ? "acercándose…" : "productos"; }\n' +
'const text = ' + readTextExpr + ';\n' +
'const resolved = viewer.load(text);\n' +
'if (resolved.errors.length){\n' +
'  errBox.style.display = "block";\n' +
'  errBox.textContent = resolved.errors.join("\\n");\n' +
'} else {\n' +
'  nameEl.textContent = resolved.name || "molscene";\n' +
'  if (resolved.description){ descEl.textContent = resolved.description; descEl.style.display = "block"; }\n' +
'  renderLegend(viewer.getLegend());\n' +
'  reactionBox.style.display = viewer.isReaction() ? "block" : "none";\n' +
'}\n' +
'document.querySelectorAll("#modes button").forEach(function(btn){\n' +
'  btn.addEventListener("click", function(){\n' +
'    viewer.setMode(btn.dataset.mode);\n' +
'    document.querySelectorAll("#modes button").forEach(function(b){ b.classList.toggle("active", b === btn); });\n' +
'  });\n' +
'});\n' +
'let playing = true;\n' +
'document.getElementById("playBtn").addEventListener("click", function(){\n' +
'  playing = !playing; viewer.setPlaying(playing);\n' +
'  this.textContent = playing ? "Pausar" : "Reproducir";\n' +
'});\n' +
'document.getElementById("resetBtn").addEventListener("click", function(){ viewer.resetCamera(); });\n' +
'document.getElementById("playReactionBtn").addEventListener("click", function(){ viewer.playReaction(); });\n' +
'const slider = document.getElementById("reactionSlider");\n' +
'slider.addEventListener("input", function(){ viewer.setReactionProgress(parseFloat(slider.value)); renderLegend(viewer.getLegend()); });\n' +
'setInterval(function(){\n' +
'  if (!viewer.isReaction()) return;\n' +
'  const t = viewer.getReactionProgress();\n' +
'  slider.value = String(t);\n' +
'  renderLegend(viewer.getLegend());\n' +
'}, 150);\n';
}

function buildStandaloneHtml(molsceneText){
  const engine = bundleEngine();
  const threeGlobal = bundleThreeAsGlobal();
  const wiring = buildWiringJs('document.getElementById("molscene-source").textContent');
  return '<!doctype html>\n' +
'<html lang="es">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>molscene — visor autónomo</title>\n' +
'<style>\n' + PAGE_STYLE + '</style>\n' +
'</head>\n' +
'<body>\n' +
PAGE_BODY +
'<!-- Edit ONLY this block to change the molecule/reaction - it is plain\n' +
'     molscene text, see docs/molscene-spec.md. Everything below it is the\n' +
'     bundled engine + three.js and should not need to change. -->\n' +
'<script id="molscene-source" type="text/plain">\n' +
molsceneText +
'\n</script>\n' +
'<script>\n' + threeGlobal + '\n</script>\n' +
'<script>\n(function(){\n' + engine + '\n' + wiring + '})();\n</script>\n' +
'</body>\n' +
'</html>\n';
}

// See the big comment at the top of this file for why this is HTML+external
// .js instead of --mode=standalone's all-inline shape.
function buildShellFiles(){
  const engine = bundleEngine();
  const threeGlobal = bundleThreeAsGlobal();
  const wiring = buildWiringJs('decodeURIComponent(location.hash.slice(1) || "")');
  const html = '<!doctype html>\n' +
'<html lang="es">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>molscene</title>\n' +
'<style>\n' + PAGE_STYLE + '</style>\n' +
'</head>\n' +
'<body>\n' +
PAGE_BODY +
'<script src="molscene-shell.js"></script>\n' +
'</body>\n' +
'</html>\n';
  const js = '// AUTO-GENERATED by scripts/build-artifact.mjs --mode=shell - do not edit by hand.\n' +
'// Reads its molscene text from the URL fragment - the caller navigates\n' +
'// here with `location.href = ".../molscene-shell.html#" + encodeURIComponent(text)`.\n' +
'(function(){\n' + threeGlobal + '\n' + engine + '\n' + wiring + '})();\n';
  return { html, js };
}

function main(){
  const args = process.argv.slice(2);
  const modeArg = args.find(function(a){ return a.startsWith('--mode='); });
  const mode = modeArg ? modeArg.slice('--mode='.length) : 'module';
  const positional = args.filter(function(a){ return !a.startsWith('--'); });

  if (mode === 'module'){
    process.stdout.write(buildModuleBundle());
  } else if (mode === 'standalone'){
    const molPath = positional[0] || join(ROOT, 'examples', 'h2.molscene');
    const molsceneText = readFileSync(molPath, 'utf8');
    process.stdout.write(buildStandaloneHtml(molsceneText));
  } else if (mode === 'shell'){
    const outDir = positional[0] || join(ROOT, 'dist');
    const { html, js } = buildShellFiles();
    writeFileSync(join(outDir, 'molscene-shell.html'), html);
    writeFileSync(join(outDir, 'molscene-shell.js'), js);
  } else {
    console.error('Unknown --mode="' + mode + '" (expected module|standalone|shell)');
    process.exit(1);
  }
}

main();
