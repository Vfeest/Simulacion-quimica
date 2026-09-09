// ==UserScript==
// @name         molscene inline renderer
// @namespace    https://github.com/Vfeest/Simulacion-quimica
// @version      1.0.0
// @description  Renders molscene chemistry code blocks (molecules, orbitals, reactions) inline wherever an AI chat prints one - the same way some tools render Mermaid diagrams.
// @author       Vfeest
// @match        https://claude.ai/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gemini.google.com/*
// @grant        GM_xmlhttpRequest
// @connect      vfeest.github.io
// @run-at       document-idle
// ==/UserScript==

// How this works, and why: an AI in a normal chat tab can't render 3D itself
// - it can only print text. This script watches the page for a code block
// whose text is molscene (see docs/molscene-spec.md in the repo), and drops
// a rendered viewer right below it.
//
// The viewer runs inside a *sandboxed iframe* with its own self-contained
// document (three.js + the engine, both inlined - see
// scripts/build-artifact.mjs, --mode=shell) instead of injecting into the
// host page directly. Two reasons: the iframe's document has no relation to
// the host page's Content-Security-Policy, so this works even on a host
// that would otherwise block loading three.js; and `sandbox="allow-scripts"`
// (no allow-same-origin) means the rendered molecule can never read the
// host page's DOM, cookies, or session - it only ever sees the molscene
// text we hand it.
//
// The shell (engine + three.js, ~1.2 MB) is fetched once per page load from
// GitHub Pages via GM_xmlhttpRequest - a privileged request Tampermonkey
// makes outside the host page's CSP - and cached in memory; each detected
// code block only costs a small string splice after that.

(function () {
  'use strict';

  const SHELL_URL = 'https://vfeest.github.io/Simulacion-quimica/dist/molscene-shell.html';
  const PLACEHOLDER = '{{MOLSCENE_SOURCE}}';
  const DEBOUNCE_MS = 500;

  let shellPromise = null;
  function loadShell() {
    if (!shellPromise) {
      shellPromise = new Promise(function (resolve, reject) {
        GM_xmlhttpRequest({
          method: 'GET',
          url: SHELL_URL,
          onload: function (res) {
            if (res.status >= 200 && res.status < 300) resolve(res.responseText);
            else reject(new Error('molscene shell: HTTP ' + res.status));
          },
          onerror: function () { reject(new Error('molscene shell: network error')); }
        });
      });
    }
    return shellPromise;
  }

  // Content-sniffed instead of relying on a language tag on the <code>
  // element, because every chat site's markdown renderer marks fenced code
  // blocks differently (or not at all) - but molscene's own grammar always
  // starts with one of these two keywords, so this is a reliable,
  // site-independent signal. "atom "/"reactants" is required too, so plain
  // prose that happens to start with the word "molecule" doesn't false-fire.
  function looksLikeMolscene(text) {
    const firstMeaningful = text.split('\n').map(function (l) { return l.trim(); })
      .find(function (l) { return l && l[0] !== '#'; });
    if (!firstMeaningful || !/^(molecule|reaction)\b/i.test(firstMeaningful)) return false;
    return /\batom\s+\w+\s*:/i.test(text) || /\breactants\b/i.test(text);
  }

  function findCandidates() {
    const seen = new Set();
    const out = [];
    function add(el) { if (!seen.has(el)) { seen.add(el); out.push(el); } }
    document.querySelectorAll('code[class*="language-molscene"], code[class*="lang-molscene"]').forEach(add);
    document.querySelectorAll('pre code').forEach(function (el) {
      if (!seen.has(el) && looksLikeMolscene(el.textContent)) add(el);
    });
    return out;
  }

  const lastText = new WeakMap();
  const containerOf = new WeakMap();

  async function renderInto(codeEl) {
    const text = codeEl.textContent.trim();
    if (!text || lastText.get(codeEl) === text) return;
    lastText.set(codeEl, text);

    let shell;
    try { shell = await loadShell(); }
    catch (e) { console.error('[molscene]', e); return; }

    const safeText = text.split('</script').join('<\\/script');
    const html = shell.split(PLACEHOLDER).join(safeText);

    let container = containerOf.get(codeEl);
    if (!container) {
      container = document.createElement('div');
      container.style.cssText = 'margin:8px 0;position:relative;';
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.style.cssText = 'width:100%;height:480px;border:1px solid #2a3550;border-radius:8px;display:block;background:#070a10;';
      container.appendChild(iframe);
      containerOf.set(codeEl, container);
      const host = codeEl.closest('pre') || codeEl;
      host.insertAdjacentElement('afterend', container);
    }
    container.querySelector('iframe').srcdoc = html;
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      findCandidates().forEach(renderInto);
    }, DEBOUNCE_MS);
  }

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  schedule();
})();
