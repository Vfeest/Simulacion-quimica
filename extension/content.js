// Chrome extension counterpart to userscript/molscene-render.user.js - same
// idea (find a molscene code block in an AI chat, render it), packaged as a
// native Manifest V3 extension instead of a Tampermonkey script, with one
// behavior difference on top: instead of adding the viewer *below* the
// code block, this replaces it - the raw molscene text is hidden by
// default, with a toolbar to copy it or flip back to see it.
//
// Why a second, separate implementation instead of sharing one file with
// the userscript: the two environments fetch the engine differently
// (GM_xmlhttpRequest against GitHub Pages vs. a resource bundled into this
// extension, see dist/molscene-shell.html and manifest.json's
// web_accessible_resources) and that's the one part not worth abstracting
// over for ~100 lines of code. Detection logic (looksLikeMolscene) is
// intentionally identical to the userscript's - keep them in sync if it
// changes.

(function () {
  'use strict';

  const SHELL_URL = chrome.runtime.getURL('dist/molscene-shell.html');
  const PLACEHOLDER = '{{MOLSCENE_SOURCE}}';
  const DEBOUNCE_MS = 500;

  let shellPromise = null;
  function loadShell() {
    if (!shellPromise) {
      shellPromise = fetch(SHELL_URL).then(function (res) {
        if (!res.ok) throw new Error('molscene shell: HTTP ' + res.status);
        return res.text();
      });
    }
    return shellPromise;
  }

  // Same content-sniff as the userscript: molscene's own grammar always
  // starts with one of these two keywords, so this works regardless of how
  // (or whether) a given chat site tags the code block's language.
  function looksLikeMolscene(text) {
    const firstMeaningful = text.split('\n').map(function (l) { return l.trim(); })
      .find(function (l) { return l && l[0] !== '#'; });
    if (!firstMeaningful || !/^(molecule|reaction)\b/i.test(firstMeaningful)) return false;
    return /\batom\s+\w+\s*:/i.test(text) || /\breactants\b/i.test(text);
  }

  function findCandidates() {
    const seen = new Set();
    const out = [];
    document.querySelectorAll('pre code').forEach(function (el) {
      if (!seen.has(el) && looksLikeMolscene(el.textContent)) { seen.add(el); out.push(el); }
    });
    return out;
  }

  function moleculeName(text) {
    const m = text.match(/^\s*(?:molecule|reaction)\s+(.+)$/m);
    return m ? m[1].trim() : 'molscene';
  }

  const lastText = new WeakMap();
  const cardOf = new WeakMap();

  function buildCard(codeEl) {
    const host = codeEl.closest('pre') || codeEl;
    host.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'molscene-card';

    const toolbar = document.createElement('div');
    toolbar.className = 'molscene-toolbar';

    const nameEl = document.createElement('span');
    nameEl.className = 'molscene-name';
    toolbar.appendChild(nameEl);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.textContent = 'Ver código';
    toggleBtn.addEventListener('click', function () {
      const showingRaw = card.classList.toggle('showing-raw');
      toggleBtn.textContent = showingRaw ? 'Ver simulación' : 'Ver código';
    });
    toolbar.appendChild(toggleBtn);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copiar código';
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(lastText.get(codeEl) || '').then(function () {
        const original = copyBtn.textContent;
        copyBtn.textContent = 'Copiado ✓';
        setTimeout(function () { copyBtn.textContent = original; }, 1200);
      });
    });
    toolbar.appendChild(copyBtn);

    card.appendChild(toolbar);

    const frameWrap = document.createElement('div');
    frameWrap.className = 'molscene-frame-wrap';
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    frameWrap.appendChild(iframe);
    card.appendChild(frameWrap);

    const raw = document.createElement('div');
    raw.className = 'molscene-raw';
    const rawPre = document.createElement('pre');
    rawPre.style.cssText = 'margin:0;padding:10px;white-space:pre-wrap;font-size:12.5px;';
    raw.appendChild(rawPre);
    card.appendChild(raw);

    host.insertAdjacentElement('afterend', card);
    return { card, iframe, nameEl, rawPre };
  }

  async function renderInto(codeEl) {
    const text = codeEl.textContent.trim();
    if (!text || lastText.get(codeEl) === text) return;
    lastText.set(codeEl, text);

    let shell;
    try { shell = await loadShell(); }
    catch (e) { console.error('[molscene]', e); return; }

    const safeText = text.split('</script').join('<\\/script');
    const html = shell.split(PLACEHOLDER).join(safeText);

    let refs = cardOf.get(codeEl);
    if (!refs) { refs = buildCard(codeEl); cardOf.set(codeEl, refs); }

    refs.nameEl.textContent = moleculeName(text);
    refs.rawPre.textContent = text;
    refs.iframe.srcdoc = html;
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
