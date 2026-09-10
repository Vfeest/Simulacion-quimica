// ==UserScript==
// @name         molscene inline renderer
// @namespace    https://github.com/Vfeest/Simulacion-quimica
// @version      1.1.0
// @description  Renders molscene chemistry code blocks (molecules, orbitals, reactions) inline wherever an AI chat prints one - the same way some tools render Mermaid diagrams.
// @author       Vfeest
// @match        https://claude.ai/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gemini.google.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// How this works, and why: an AI in a normal chat tab can't render 3D itself
// - it can only print text. This script watches the page for a code block
// whose text is molscene (see docs/molscene-spec.md in the repo), and drops
// a rendered viewer right below it.
//
// The viewer runs inside a sandboxed iframe navigated to a real URL
// (`iframe.src = SHELL_URL + '#' + encodeURIComponent(text)`) - never given
// `srcdoc` with the engine spliced in as a string. Why that distinction
// matters: an `iframe.srcdoc` document inherits the *host page's*
// Content-Security-Policy (browsers do this on purpose, so srcdoc can't be
// used to dodge a page's CSP) - and several chat sites' CSP blocks inline
// scripts outright, which used to make this silently render nothing there.
// A genuine cross-origin navigation gets GitHub Pages' own (permissive)
// CSP instead, regardless of the host page's. `sandbox="allow-scripts"`
// (no allow-same-origin) means the rendered molecule can never read the
// host page's DOM, cookies, or session - it only ever sees the molscene
// text baked into that URL fragment.
//
// dist/molscene-shell.html + molscene-shell.js (its engine, as an external
// file - see scripts/build-artifact.mjs) are static files on GitHub Pages,
// so no special permission is needed to load them - hence @grant none.

(function () {
  'use strict';

  const SHELL_URL = 'https://vfeest.github.io/Simulacion-quimica/dist/molscene-shell.html';
  const DEBOUNCE_MS = 500;

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

  function renderInto(codeEl) {
    const text = codeEl.textContent.trim();
    if (!text || lastText.get(codeEl) === text) return;
    lastText.set(codeEl, text);

    let container = containerOf.get(codeEl);
    if (!container) {
      container = document.createElement('div');
      container.style.cssText = 'margin:8px 0;position:relative;height:480px;';
      containerOf.set(codeEl, container);
      const host = codeEl.closest('pre') || codeEl;
      host.insertAdjacentElement('afterend', container);
    }

    // A fresh iframe per render (instead of reassigning .src on the same
    // one) sidesteps any ambiguity between a full navigation and an
    // in-document fragment update - guarantees the engine actually
    // reinitializes for the new molecule every time.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.cssText = 'width:100%;height:100%;border:1px solid #2a3550;border-radius:8px;display:block;background:#070a10;';
    iframe.src = SHELL_URL + '#' + encodeURIComponent(text);
    container.replaceChildren(iframe);
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
