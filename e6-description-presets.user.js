// ==UserScript==
// @name         e6* Description Presets
// @namespace    https://github.com/C6Yfd-dfY6C/e6-description-presets
// @version      1.1.1
// @description  Add your own custom preset description text easily to posts on e621, e6AI, and Blep.
// @author       C6Yfd-dfY6C, Qwen 3.8 27B
// @homepageURL  https://github.com/C6Yfd-dfY6C/e6-description-presets
// @updateURL    https://github.com/C6Yfd-dfY6C/e6-description-presets/releases/latest/download/e6-description-presets.user.js
// @downloadURL  https://github.com/C6Yfd-dfY6C/e6-description-presets/releases/latest/download/e6-description-presets.user.js
// @match        *://e6ai.net/*
// @match        *://www.e6ai.net/*
// @match        *://e621.net/*
// @match        *://www.e621.net/*
// @match        *://blep.art/*
// @match        *://www.blep.art/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // Keep in sync with @version above.
  const SCRIPT_VERSION = '1.1.1';

  /* ======================================================================
   *  DEFAULT PRESETS (seed values)
   *
   *  These are only used on the very first run. From then on, presets are
   *  stored in localStorage and can be edited from the panel — no need to
   *  edit this file. Max 99 presets, min 1 preset.
   *
   *  Each preset: { name: "button label", text: "text to fill in" }
   * ====================================================================== */
  const MAX_PRESETS = 99;
  const MIN_PRESETS = 1;

  const DEFAULT_PRESETS = [
    {
      name: 'Preset 1',
      text: `Your first preset text goes here.\nYou can use multiple lines.`,
    },
    {
      name: 'Preset 2',
      text: `Your second preset text goes here.`,
    },
  ];

  const LS_PRESETS = 'e6dp-presets-v1';

  function loadPresets() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_PRESETS) || 'null');
      if (Array.isArray(raw)) {
        return raw
          .map((p) => ({
            name: p && typeof p.name === 'string' ? p.name : '',
            text: p && typeof p.text === 'string' ? p.text : '',
          }))
          .filter((p) => p.name !== '' || p.text !== '')
          .slice(0, MAX_PRESETS);
      }
    } catch (_) {}
    return DEFAULT_PRESETS.map((p) => ({ ...p }));
  }

  function savePresets(list) {
    try {
      localStorage.setItem(LS_PRESETS, JSON.stringify(list.slice(0, MAX_PRESETS)));
    } catch (_) {}
  }

  let presets = loadPresets();

  /* ------------------- chip color theme (Default/Dark) -------------- */

  const LS_CHIP_COLOR = 'e6dp-chip-color-v1';

  function loadChipColor() {
    try {
      const v = localStorage.getItem(LS_CHIP_COLOR);
      if (v === 'default' || v === 'dark') return v;
    } catch (_) {}
    return 'default';
  }

  let chipColorTheme = loadChipColor();

  function setChipColorTheme(v) {
    chipColorTheme = v === 'dark' ? 'dark' : 'default';
    try { localStorage.setItem(LS_CHIP_COLOR, chipColorTheme); } catch (_) {}
    applyChipColorTheme();
  }

  function applyChipColorTheme() {
    if (!chipGroup) return;
    chipGroup.classList.toggle('e6dp-color-dark', chipColorTheme === 'dark');
    chipGroup.classList.toggle('e6dp-color-default', chipColorTheme !== 'dark');
  }

  /* ======================================================================
   *  ADVANCED (usually leave as-is)
   *
   *  descriptionSelectors: if auto-detection picks the wrong box, put a CSS
   *  selector for the exact element here and it will always be used.
   *  e.g. ['textarea[name="description"]'] or ['#post_description']
   * ====================================================================== */
  const DESCRIPTION_SELECTORS = []; // <- add selectors here if needed

  /* ---------------------------- internals ----------------------------- */

  let trigger, panel, statusEl, editView, chipGroup, pinTimer = null;

  /* Pencil-on-paper icon — same style as the site's icons:
     24x24 viewBox, stroke=currentColor, width 2, round caps/joins. */
  const PEN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" name="pencil_paper"><rect x="3.5" y="2.5" width="15" height="19" rx="2.5"></rect><line x1="7" y1="8" x2="15" y2="8"></line><line x1="7" y1="12" x2="13" y2="12"></line><path d="m10.2 19.6 1.2 1.2 8.4-8.4-1.2-1.2z"></path><path d="m20.4 10.5 1.2 1.2"></path></svg>`;

  function css() {
    return `
      #e6dp-trigger, #e6dp-panel, #e6dp-panel * { box-sizing: border-box; font-family: system-ui, sans-serif; }
      #e6dp-trigger {
        display: inline-flex !important; align-items: center; justify-content: center;
        cursor: pointer; text-decoration: none;
        width: 100%; height: 100%; padding: 0 8px;
      }
      #e6dp-trigger svg { width: 22px; height: 22px; display: block; transition: stroke .3s ease; }
      #e6dp-trigger.e6dp-saved-flash svg { stroke: #22c55e !important; }
      #e6dp-panel {
        position: fixed; z-index: 2147483000;
        background: #111827; color: #f9fafb; border: 1px solid #374151;
        border-radius: 10px; padding: 10px; width: 300px;
        box-shadow: 0 8px 24px rgba(0,0,0,.4); display: none;
        flex-direction: column; overflow: hidden;
      }
      #e6dp-panel.open { display: flex; }
      #e6dp-title {
        font-size: 12px; text-transform: uppercase; letter-spacing: .05em;
        color: #9ca3af; margin: 0 4px 8px; display: flex; justify-content: space-between; align-items: center;
        flex: 0 0 auto; gap: 6px;
      }
      #e6dp-title-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #e6dp-count { text-decoration: underline; cursor: pointer; }
      #e6dp-count-input {
        width: 4.5em; background: #1f2937; color: #f9fafb;
        border: 1px solid #374151; border-radius: 4px; padding: 0 4px;
        font-size: 12px; font-family: inherit; text-align: center;
        -moz-appearance: textfield;
      }
      #e6dp-count-input::-webkit-outer-spin-button,
      #e6dp-count-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .e6dp-title-btn {
        width: 22px; height: 22px; border-radius: 4px; border: none; cursor: pointer;
        font-size: 15px; font-weight: bold; display: inline-flex; align-items: center; justify-content: center;
        line-height: 1; padding: 0; flex: 0 0 auto;
      }
      .e6dp-title-btn:disabled { opacity: .4; cursor: not-allowed; }
      #e6dp-minus { background: #dc2626; color: #fff; }
      #e6dp-minus:hover:not(:disabled) { background: #ef4444; }
      #e6dp-plus { background: #16a34a; color: #fff; }
      #e6dp-plus:hover:not(:disabled) { background: #22c55e; }
      #e6dp-close { background: none; color: #9ca3af; cursor: pointer; font-size: 14px; padding: 0 4px; flex: 0 0 auto; }
      #e6dp-close:hover { color: #f9fafb; }
      #e6dp-edit-view { display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; min-height: 0; overflow-y: auto; }
      .e6dp-row, .e6dp-settings-row { border: 1px solid #374151; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px; background: #0b1220; }
      .e6dp-row-top { display: flex; gap: 6px; align-items: center; }
      .e6dp-row input, .e6dp-row textarea {
        width: 100%; min-width: 0; background: #1f2937; color: #f9fafb;
        border: 1px solid #374151; border-radius: 6px; padding: 6px 8px;
        font-size: 12px; font-family: inherit; resize: vertical;
      }
      .e6dp-row textarea { min-height: 64px; }
      .e6dp-row input::placeholder, .e6dp-row textarea::placeholder { color: #6b7280; }
      .e6dp-settings-row label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9ca3af; }
      .e6dp-settings-row select {
        width: 100%; background: #1f2937; color: #f9fafb;
        border: 1px solid #374151; border-radius: 6px; padding: 6px 8px;
        font-size: 12px; font-family: inherit; cursor: pointer;
      }

      #e6dp-edit-actions { display: flex; gap: 6px; align-items: center; flex: 0 0 auto; padding-top: 4px; }
      .e6dp-version { flex: 0 0 auto; padding: 2px 0 0; font-size: 11px; color: #6b7280; }
      #e6dp-cancel {
        background: #1f2937; color: #f9fafb; border: 1px solid #374151;
        border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 12px;
      }
      #e6dp-cancel:hover { background: #374151; }
      #e6dp-save {
        background: #16a34a; color: #fff; border: 1px solid #16a34a;
        border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 12px;
      }
      #e6dp-save:hover { background: #22c55e; }
      .e6dp-icon-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 30px; height: 30px; padding: 0; flex: 0 0 auto;
        background: #1f2937; color: #f9fafb; border: 1px solid #374151;
        border-radius: 8px; cursor: pointer;
      }
      .e6dp-icon-btn:hover { background: #374151; color: #F68B00; }
      .e6dp-icon-btn svg { width: 16px; height: 16px; display: block; }
      #e6dp-status {
        margin: 8px 4px 0; font-size: 12px; color: #9ca3af; min-height: 14px;
        flex: 0 0 auto;
      }
      #e6dp-status:empty { display: none; }
      #e6dp-status.ok { color: #34d399; }
      #e6dp-status.err { color: #f87171; }
      /* Inline preset chips.
         The site's own .toggle-button rules are scoped to the uploader, so we
         style OUR elements directly via the #e6dp-chips id — this beats any
         class-scoped site rule on every page and never touches the site's real
         toggle buttons. Shared shape lives on .e6dp-chip; the color scheme is
         picked by a class on #e6dp-chips (see "Preset Button Color" in the
         editor): .e6dp-color-default = the site's native look (black text on
         #E9E9ED, matching the Male/Female/etc. toggle buttons),
         .e6dp-color-dark = the old dark-mode-style look. */
      #e6dp-chips {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: wrap !important;
        gap: 8px !important;
        align-items: center;
        margin-top: 8px;
      }
      #e6dp-chips .e6dp-chip {
        cursor: pointer;
        border-radius: 4px !important;
        padding: 2.8px 8px !important;
        font-size: 16px !important;
        line-height: 1.2;
      }
      #e6dp-chips.e6dp-color-default .e6dp-chip {
        background: #E9E9ED !important;
        color: #000 !important;
        border: none !important;
      }
      #e6dp-chips.e6dp-color-default .e6dp-chip:hover {
        filter: brightness(0.895);
      }
      #e6dp-chips.e6dp-color-dark .e6dp-chip {
        background: rgb(43, 42, 51) !important;
        color: rgb(251, 251, 254) !important;
        border: none !important;
      }
      #e6dp-chips.e6dp-color-dark .e6dp-chip:hover {
        filter: brightness(1.2);
      }
    `;
  }

  /* --------------------- find the description box -------------------- */

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function contextText(el) {
    let host = el.closest('form, [role="group"], section, fieldset');
    if (!host) host = el.parentElement;
    const labelEl = host ? host.querySelector('label, legend, h1, h2, h3, h4, p') : null;
    return (labelEl ? labelEl.textContent : '') + ' ' +
      (el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' +
      (el.name || '') + ' ' + (el.id || '');
  }

  function findDescriptionField() {
    if (DESCRIPTION_SELECTORS.length) {
      for (const sel of DESCRIPTION_SELECTORS) {
        try {
          const el = document.querySelector(sel);
          if (el && isVisible(el)) return el;
        } catch (_) {}
      }
    }

    const candidates = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]')
    ).filter((el) => {
      if (el.closest('form.auth-form, form[id^="auth-"]')) return false; // auth forms (login/register modals)
      if (!isVisible(el)) return false;
      if (el.closest('#e6dp-panel')) return false; // never pick our own editor fields
      const hay = ((el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.name || '')).toLowerCase();
      if (hay.includes('search')) return false;
      if (/password|username|user name|email/.test(hay)) return false; // auth fields (e.g. login modal)
      if (/(sign in|log ?in|welcome|remember me|create an account)/.test(contextText(el))) return false; // auth forms
      return true;
    });

    let best = null, bestScore = -1;
    for (const el of candidates) {
      const own = ((el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.name || '') + ' ' + (el.id || '')).toLowerCase();
      if (el.closest('form.auth-form, form[id^="auth-"]')) continue; // never score auth forms
      if (/password|username|user name|email/.test(own)) continue; // never score auth fields
      if (/(sign in|log ?in|welcome|remember me|create an account)/.test(contextText(el))) continue;
      let score = 0;
      if (own.includes('description')) score = 100;
      else if (contextText(el).toLowerCase().includes('description')) score = 90;
      else if (el.tagName === 'TEXTAREA') score = 10;
      else if (el.isContentEditable) score = 5;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  /* ------------------------ fill the field --------------------------- */

  function fillField(el, text, append) {
    if (el.isContentEditable) {
      el.focus();
      if (!append) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (_) {}
      if (!ok) {
        el.textContent = append ? (el.textContent + text) : text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, append ? (el.value + text) : text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /* -------------------- inline preset chips --------------------------- */

  function makeChipButtons() {
    return presets.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toggle-button e6dp-chip';
      b.textContent = p.name;
      b.title = 'Fill description (Shift+click to append)';
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const target = findDescriptionField() || chipGroup._field;
        if (!target) return;
        fillField(target, p.text, e.shiftKey);
      });
      return b;
    });
  }

  function refreshChipButtons() {
    if (!chipGroup) return;
    chipGroup.innerHTML = '';
    makeChipButtons().forEach((b) => chipGroup.appendChild(b));
  }

  // Only show the preset chips on post pages: /uploads/new or /posts/<number>
  function isPostPage() {
    return /^\/uploads\/new$/.test(location.pathname) ||
           /^\/posts\/\d+$/.test(location.pathname);
  }

  function syncChips() {
    if (!chipGroup) return;
    if (!isPostPage()) { if (chipGroup.isConnected) chipGroup.remove(); return; }
    const field = findDescriptionField();
    if (!field) { if (chipGroup.isConnected) chipGroup.remove(); return; }
    const host = field.closest('.dtext-formatter') || field.parentElement;
    if (!host) return;
    chipGroup._field = field;

    // .dtext-formatter is a CSS grid that pins its footer (hint + counter) to a
    // named track ("df-footer"). Auto-placed children can land in an explicit
    // row ABOVE the footer, so force the chips onto the first row below all
    // explicit tracks — guaranteeing they render under the footer line.
    if (getComputedStyle(host).display.startsWith('grid')) {
      const tracks = getComputedStyle(host).gridTemplateRows.split(/\s+/).filter(Boolean);
      chipGroup.style.gridRowStart = tracks.length ? String(tracks.length + 1) : '';
    }

    // Place chips below the "DText formatting supported" / character-counter row.
    const scope = host.parentElement || host;
    const marker = scope.querySelector('.dtext-formatter-hint') || scope.querySelector('.dtext-formatter-counter');
    if (marker) {
      const row = marker.parentElement;
      if (row && row !== host && row.parentElement) {
        if (chipGroup.parentElement === row.parentElement && chipGroup.previousElementSibling === row) return;
        row.insertAdjacentElement('afterend', chipGroup);
      } else {
        if (chipGroup.parentElement === host && chipGroup.nextSibling === null) return;
        host.appendChild(chipGroup);
      }
    } else {
      // Fallback: append to end of host
      if (chipGroup.parentElement === host && chipGroup.nextSibling === null) return;
      host.appendChild(chipGroup);
    }
  }

  /* ------------------------------ UI --------------------------------- */

  function buildUI() {
    const style = document.createElement('style');
    style.textContent = css();
    document.head.appendChild(style);

    trigger = makeNavButton();
    pinTrigger();
    chipGroup = document.createElement('div');
    chipGroup.className = 'toggle-button-group e6dp-chips';
    chipGroup.id = 'e6dp-chips';
    // Inline fallback in case the <style> tag hasn't been parsed yet; the
    // stylesheet rules (with !important) are the source of truth.
    chipGroup.style.display = 'flex';
    chipGroup.style.flexDirection = 'row';
    chipGroup.style.flexWrap = 'wrap';
    chipGroup.style.gap = '8px';
    chipGroup.style.alignItems = 'center';
    chipGroup.style.gridColumn = '1 / -1';
    applyChipColorTheme();
    refreshChipButtons();

    const mo = new MutationObserver(() => {
      if (pinTimer) return;
      pinTimer = setTimeout(() => { pinTimer = null; pinTrigger(); syncChips(); }, 0);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    panel = document.createElement('div');
    panel.id = 'e6dp-panel';
    panel.innerHTML =
      '<div id="e6dp-title">' +
        '<span id="e6dp-title-text"></span>' +
        '<button class="e6dp-title-btn" id="e6dp-minus" title="Remove last preset">−</button>' +
        '<button class="e6dp-title-btn" id="e6dp-plus" title="Add preset">+</button>' +
        '<button id="e6dp-close" title="Close">✕</button>' +
      '</div>' +
      '<div id="e6dp-edit-view"></div>' +
      '<div id="e6dp-status"></div>';
    document.body.appendChild(panel);

    statusEl = panel.querySelector('#e6dp-status');
    editView = panel.querySelector('#e6dp-edit-view');

    // Populate editor with current presets
    populateEditor();

    // Title bar buttons
    panel.querySelector('#e6dp-minus').addEventListener('click', () => removeLastRow());
    panel.querySelector('#e6dp-plus').addEventListener('click', () => addRowToEditor());
    panel.querySelector('#e6dp-close').addEventListener('click', () => {
      panel.classList.remove('open');
    });

    // Clicking the underlined count in the title bar lets the user type a new preset count.
    panel.querySelector('#e6dp-title-text').addEventListener('click', (e) => {
      if (e.target && e.target.id === 'e6dp-count') startCountEdit();
    });

    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const open = panel.classList.toggle('open');
      if (open) {
        populateEditor(); // refresh from saved presets each time we open
        setStatus('', false); // clear any stale "Saved ✓" / error from last session
        positionPanel();
      } else {
        setStatus('', false);
      }
    });

    window.addEventListener('resize', () => {
      if (panel.classList.contains('open')) positionPanel();
    });

    syncChips();
  }

  function populateEditor() {
    editView.innerHTML = '';
    editView.appendChild(makeColorRow());
    presets.forEach((p) => addRowToEditor(p));
    const actions = document.createElement('div');
    actions.id = 'e6dp-edit-actions';

    // Import / Export — icon buttons on the left, Cancel/Save stay right.
    const importBtn = makeIconButton(
      'Import',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>'
    );
    const exportBtn = makeIconButton(
      'Export',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="m7 8 5-5 5 5"></path><path d="M5 21h14"></path></svg>'
    );
    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = 'application/json,.json';
    importInput.style.display = 'none';
    actions.appendChild(importBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(importInput);

    const spacer = document.createElement('div');
    spacer.style.flex = '1 1 auto';
    actions.appendChild(spacer);

    const cancel = makeTextButton('Cancel', 'e6dp-cancel');
    const save   = makeTextButton('Save',   'e6dp-save');
    actions.appendChild(cancel);
    actions.appendChild(save);
    editView.appendChild(actions);

    const version = document.createElement('div');
    version.className = 'e6dp-version';
    version.textContent = 'v' + SCRIPT_VERSION;
    editView.appendChild(version);

    importBtn.addEventListener('click', () => importInput.click());
    exportBtn.addEventListener('click', exportPresets);
    importInput.addEventListener('change', (e) => { handleImport(e); });
    cancel.addEventListener('click', () => { panel.classList.remove('open'); });
    save.addEventListener('click', () => commitEditor());
    syncTitleBar();
  }

  function makeIconButton(title, svgMarkup) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'e6dp-icon-btn';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = svgMarkup;
    return b;
  }

  function makeTextButton(label, id) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.textContent = label;
    return b;
  }

  /* ------------------------- import / export -------------------------- */

  function validatePresetList(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const list = raw.slice(0, MAX_PRESETS).map((p) => ({
      name: p && typeof p.name === 'string' ? p.name.trim() : '',
      text: p && typeof p.text === 'string' ? p.text : '',
    })).filter((p) => p.name !== '' || p.text !== '');
    return list.length ? list : null;
  }

  function exportPresets() {
    try {
      // Object format (v1): presets + chip color, so an import restores both.
      // Legacy bare-array files are still accepted on import.
      const config = { version: 1, chipColor: chipColorTheme, presets };
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'e6dp-config.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setStatus('Export failed: ' + err.message, true);
    }
  }

  function handleImport(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); }
      catch (_) { setStatus('Import failed: not valid JSON', true); return; }
      let list, color;
      if (Array.isArray(data)) {
        // Legacy export format: bare array of presets (no chip color).
        list = validatePresetList(data);
      } else if (data && typeof data === 'object' && Array.isArray(data.presets)) {
        list = validatePresetList(data.presets);
        color = (data.chipColor === 'default' || data.chipColor === 'dark') ? data.chipColor : null;
      } else {
        list = null;
      }
      if (!list) {
        setStatus('Import failed: expected a preset array or {presets: [...]} object', true);
        return;
      }
      presets = list;
      savePresets(presets);
      if (color) setChipColorTheme(color);
      populateEditor();
      refreshChipButtons();
      syncChips();
      flashTriggerSaved();
      panel.classList.remove('open');
    };
    reader.onerror = () => { setStatus('Import failed: could not read file', true); };
    reader.readAsText(file);
    e.target.value = ''; // allow re-selecting the same file later
  }

  function makeColorRow() {
    const row = document.createElement('div');
    row.className = 'e6dp-settings-row';

    const label = document.createElement('label');
    label.htmlFor = 'e6dp-chip-color';
    label.textContent = 'Preset Button Color';

    const sel = document.createElement('select');
    sel.id = 'e6dp-chip-color';
    const optDefault = document.createElement('option');
    optDefault.value = 'default';
    optDefault.textContent = 'Default';
    const optDark = document.createElement('option');
    optDark.value = 'dark';
    optDark.textContent = 'Dark';
    sel.appendChild(optDefault);
    sel.appendChild(optDark);
    sel.value = chipColorTheme;
    // No change listener: the selection is committed by Save (commitEditor)
    // and discarded if the panel is closed without saving.

    row.appendChild(label);
    row.appendChild(sel);
    return row;
  }

  function addRowToEditor(preset) {
    const p = preset || { name: '', text: '' };
    const row = document.createElement('div');
    row.className = 'e6dp-row';

    const top = document.createElement('div');
    top.className = 'e6dp-row-top';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Name (button label)';
    nameInput.maxLength = 32;
    nameInput.value = p.name;
    top.appendChild(nameInput);

    const textArea = document.createElement('textarea');
    textArea.placeholder = 'Preset text…';
    textArea.maxLength = 50000;
    textArea.value = p.text;

    row.appendChild(top);
    row.appendChild(textArea);
    // Insert before the actions bar
    const actions = editView.querySelector('#e6dp-edit-actions');
    if (actions) editView.insertBefore(row, actions);
    else editView.appendChild(row);

    syncTitleBar();
  }

  function removeLastRow() {
    const rows = editView.querySelectorAll('.e6dp-row');
    if (rows.length <= MIN_PRESETS) return;
    rows[rows.length - 1].remove();
    syncTitleBar();
  }

  function syncTitleBar() {
    const count = editView.querySelectorAll('.e6dp-row').length;
    panel.querySelector('#e6dp-title-text').innerHTML =
      `Description presets (<span id="e6dp-count" title="Click to set the number of presets">${count}</span>/${MAX_PRESETS})`;
    panel.querySelector('#e6dp-minus').disabled = count <= MIN_PRESETS;
    panel.querySelector('#e6dp-plus').disabled = count >= MAX_PRESETS;
  }

  function startCountEdit() {
    const titleText = panel.querySelector('#e6dp-title-text');
    if (titleText.querySelector('#e6dp-count-input')) return; // already editing
    const count = editView.querySelectorAll('.e6dp-row').length;
    const input = document.createElement('input');
    input.type = 'number';
    input.id = 'e6dp-count-input';
    input.min = MIN_PRESETS;
    input.max = MAX_PRESETS;
    input.value = count;
    titleText.querySelector('#e6dp-count').replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      if (commit) {
        const v = parseInt(input.value, 10);
        if (!Number.isNaN(v)) setRowCount(Math.min(MAX_PRESETS, Math.max(MIN_PRESETS, v)));
      }
      syncTitleBar(); // restore the underlined number
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    // Clicking / tabbing away commits the typed number.
    input.addEventListener('blur', () => finish(true));
  }

  function setRowCount(n) {
    while (editView.querySelectorAll('.e6dp-row').length < n) addRowToEditor();
    while (editView.querySelectorAll('.e6dp-row').length > n) removeLastRow();
  }

  function commitEditor() {
    const colorSel = editView.querySelector('#e6dp-chip-color');
    if (colorSel) setChipColorTheme(colorSel.value);
    const next = [];
    editView.querySelectorAll('.e6dp-row').forEach((row, i) => {
      next.push({
        name: row.querySelector('input').value.trim() || `Preset ${i + 1}`,
        text: row.querySelector('textarea').value,
      });
    });
    presets = next.slice(0, MAX_PRESETS);
    if (presets.length < MIN_PRESETS) {
      // safety: shouldn't happen but just in case
      while (presets.length < MIN_PRESETS) {
        presets.push({ name: `Preset ${presets.length + 1}`, text: '' });
      }
    }
    savePresets(presets);
    refreshChipButtons();
    syncChips();
    flashTriggerSaved();
    panel.classList.remove('open');
  }

  let flashTimer = null;
  function flashTriggerSaved() {
    // `trigger` is the <li> wrapper; the CSS rule targets the <a id="e6dp-trigger"> inside it.
    const a = trigger && (trigger.id === 'e6dp-trigger' ? trigger : trigger.querySelector('#e6dp-trigger'));
    if (!a) return;
    a.classList.add('e6dp-saved-flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => a.classList.remove('e6dp-saved-flash'), 1000);
  }

  function makeNavButton() {
    const li = document.createElement('li');
    li.id = 'e6dp-presets';
    li.className = 'nav-tools-themes';
    const a = document.createElement('a');
    a.id = 'e6dp-trigger';
    a.href = '#';
    a.title = 'Description Presets';
    a.setAttribute('role', 'button');
    a.innerHTML = PEN_ICON;
    li.appendChild(a);
    return li;
  }

  let pinGuard = 0;
  function pinTrigger() {
    const themeLi = document.getElementById('nav-themes');
    const host = themeLi ? themeLi.parentElement : document.querySelector('menu.nav-tools');
    if (!host) return;
    if (host.contains(trigger)) {
      if (trigger.previousSibling) {
        if (++pinGuard > 3) return;
        host.insertBefore(trigger, host.firstChild);
      }
      return;
    }
    pinGuard = 0;
    host.insertBefore(trigger, themeLi || host.firstChild);
  }

  function positionPanel() {
    const fr = trigger.getBoundingClientRect();
    const pw = panel.offsetWidth;

    let x = fr.left + fr.width - pw;
    x = Math.max(4, Math.min(x, window.innerWidth - pw - 4));

    const prevMax = panel.style.maxHeight;
    panel.style.maxHeight = 'none';
    const naturalH = panel.offsetHeight;
    panel.style.maxHeight = prevMax;

    const gap = 8;
    const MARGIN = 4;
    const roomAbove = fr.top - MARGIN;
    const roomBelow = window.innerHeight - fr.bottom - MARGIN;
    let y;
    if (naturalH + gap <= roomAbove) {
      y = Math.max(MARGIN, fr.top - naturalH - gap);
    } else if (naturalH <= roomBelow) {
      y = fr.bottom + gap;
    } else {
      y = MARGIN;
    }

    panel.style.left = x + 'px';
    panel.style.top = y + 'px';

    const maxH = Math.max(120, window.innerHeight - y - MARGIN);
    panel.style.maxHeight = maxH + 'px';
  }

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || '';
    statusEl.className = isErr ? 'err' : 'ok';
  }

  /* --------------------------- bootstrap ----------------------------- */

  if (document.body) buildUI();
  else document.addEventListener('DOMContentLoaded', buildUI, { once: true });
})();
