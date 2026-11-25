import { rackAnchorVisible } from './rack-geometry.js';
// Translate controller positions into the same DOM events used by manual edits.
export function midiControlValue(control, value) {
  const fraction = Math.max(0, Math.min(127, value)) / 127;
  if (control.tagName.toLowerCase() === 'select') return control.options[Math.round(fraction * (control.options.length - 1))]?.value;
  const min = Number(control.min), max = Number(control.max), step = Number(control.step) || 1;
  return Math.min(max, Math.max(min, Number((min + Math.round((max - min) * fraction / step) * step).toFixed(6))));
}
export function controllerOverlayPosition(anchor, size, viewport) {
  const margin = 8, gap = 8;
  const width = Math.min(size.width, Math.max(0, viewport.width - 2 * margin));
  const maxLeft = Math.max(margin, viewport.width - width - margin);
  const below = anchor.bottom + gap;
  const left = anchor.right + gap + width <= viewport.width - margin ? anchor.right + gap
    : anchor.left - gap - width >= margin ? anchor.left - gap - width : anchor.left;
  const top = below + size.height <= viewport.height - margin ? below : anchor.top - gap - size.height;
  return { left: Math.min(maxLeft, Math.max(margin, left)), top: Math.min(Math.max(margin, viewport.height - size.height - margin), Math.max(margin, top)) };
}
export function setupModuleController({ rack, editorHost, play, releasePads }) {
  let selected;
  let available = false;
  let overlayOpen = false;
  let openSettings = () => {};
  let choose = () => {};
  let custom = {};
  try { custom = JSON.parse(localStorage.getItem('patchlab-module-controls-v1')) ?? {}; } catch {}
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) custom = {};
  const held = new Map();
  const registry = new Map();
  const strip = document.createElement('aside'); strip.className = 'controller-module-map';
  strip.id = 'controller-overlay'; strip.hidden = true;
  strip.setAttribute('aria-label', 'Controller assignments');
  const heading = document.createElement('div'); heading.className = 'controller-overlay-head';
  const caption = document.createElement('strong');
  const settings = document.createElement('button'); settings.type = 'button'; settings.textContent = 'Assignments';
  settings.addEventListener('click', () => openSettings());
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '×';
  close.setAttribute('aria-label', 'Hide controller overlay');
  close.addEventListener('click', () => hideOverlay(true));
  heading.append(caption, settings, close);
  const chips = document.createElement('div'); chips.className = 'controller-chips'; strip.append(heading, chips);
  document.body.append(strip);
  function hideOverlay(restoreFocus = false) {
    overlayOpen = false; render();
    if (restoreFocus) registry.get(selected)?.module.querySelector('[data-controller-select]')?.focus({ preventScroll: true });
  }
  strip.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation?.(); hideOverlay(true);
  });
  function position() {
    strip.hidden = !available || !overlayOpen;
    if (strip.hidden) return;
    const anchor = registry.get(selected)?.module.querySelector('[data-controller-select]');
    if (!rackAnchorVisible(anchor)) { strip.hidden = true; return; }
    const rect = anchor.getBoundingClientRect();
    const toolbar = rack.querySelector('.rack-docks')?.getBoundingClientRect();
    if (rect.bottom < (toolbar?.bottom ?? 0) || rect.top >= window.innerHeight) { strip.hidden = true; return; }
    const at = controllerOverlayPosition(rect, { width: strip.offsetWidth, height: strip.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
    strip.style.left = at.left + 'px'; strip.style.top = at.top + 'px';
  }
  if (typeof window !== 'undefined') {
    window.addEventListener?.('scroll', position, true);
    window.addEventListener?.('resize', position);
    window.visualViewport?.addEventListener('resize', position);
  }
  document.addEventListener?.('keydown', (event) => { if (overlayOpen && event.key === 'Escape') hideOverlay(); });
  const save = () => { try { localStorage.setItem('patchlab-module-controls-v1', JSON.stringify(custom)); } catch {} };
  function all() {
    registry.clear();
    for (const module of new Set([...rack.querySelectorAll('.module'), ...editorHost?.querySelectorAll('.module') || []])) {
      const type = module.dataset.moduleType || module.querySelector('h3')?.textContent || (module.classList.contains('output') ? 'Output' : 'Module');
      const id = module.dataset.moduleId || (type === 'Sequencer' ? 'original' : type);
      registry.set(id, { id, type, name: module.querySelector('h3')?.textContent || type, module });
      if (!module.querySelector('[data-controller-select]')) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'reset controller-select'; b.dataset.controllerSelect = '';
        b.textContent = 'Control'; b.title = 'Control this module with the LPD8';
        b.hidden = !available;
        b.setAttribute('aria-controls', strip.id);
        b.addEventListener('click', () => { if (available) choose(id, { toggle: true }); });
        (module.querySelector('.module-actions') || module.querySelector('.module-head') || module.querySelector('.module-controls')).append(b);
      }
    }
    decorate();
    return [...registry.values()].map(({ id, name }) => ({ id, name }));
  }
  function capabilities(id) {
    const item = registry.get(id); if (!item) return { knobs: [], pads: [] };
    const module = item.module;
    const roots=[module,...[...editorHost?.querySelectorAll('[data-module-owner]') || []].filter(node=>node.dataset.moduleOwner===id)];
    const query=selector=>[...new Set(roots.flatMap(root=>[...root.querySelectorAll(selector)]))];
    const label = (input) => query('label').find((l) => l.htmlFor === input.id)?.textContent || input.getAttribute('aria-label') || input.id;
    const fields = query('input, select').filter((e) => e.dataset.controllerIgnore === undefined && (e.tagName.toLowerCase() === 'select' || e.type === 'range'));
    const knobs = fields.map((input) => ({ id: input.id, label: label(input), input }));
    const pads = [];
    if (item.type === 'Keyboard') {
      for (let note = 0; note < 128; note++) pads.push({ id: 'note:' + note, label: 'Play ' + ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][note % 12] + (Math.floor(note / 12) - 1), note });
    }
    for (const input of query('input')) if (input.type === 'checkbox' && input.dataset.controllerIgnore === undefined) pads.push({ id: input.id, label: label(input), input });
    for (const [i, b] of query('.sequence-step button').entries()) pads.push({ id: 'gate:' + i, label: 'Step ' + (i + 1) + ' gate', button: b });
    for (const id of ['clock-transport','sequence-restart','voice-mute','release-keys','octave-down','octave-up']) {
      const b = query('#' + id)[0]; if (b) pads.push({ id, label: b.textContent.trim(), button: b });
    }
    for (const b of query('[data-sequence-action]')) if (!pads.some(option => option.id === b.id)) pads.push({ id: b.id, label: b.textContent.trim(), button: b });
    const visible = option => {
      const card = option.input?.closest('.sequence-step') || option.button?.closest('.sequence-step');
      return !card?.hidden && option.input?.dataset.controllerAutoIgnore === undefined;
    };
    return { knobs, pads, automaticKnobs: knobs.filter(visible), automaticPads: pads.filter(visible) };
  }
  function assignments(id) {
    const item = registry.get(id); const options = capabilities(id);
    const key = item ? item.type + '/' + id : '';
    const values = Array.from({ length: 16 }, (_, i) => {
      const automatic = i < 8 ? item?.type === 'Keyboard' ? 'note:' + [57,59,60,62,64,65,67,69][i] : options.automaticPads[i]?.id : options.automaticKnobs[i - 8]?.id;
      const saved = custom[key]?.[i];
      const candidate = typeof saved === 'string' ? saved : automatic;
      return (i < 8 ? options.pads : options.knobs).some((o) => o.id === candidate) ? candidate : '';
    });
    return { ...options, values, key };
  }
  function clearHeld() { held.clear(); releasePads(); }
  function decorate() {
    for (const [id, item] of registry) {
      const active = available && id === selected;
      item.module.dataset.controllerSelected = active;
      const b = item.module.querySelector('[data-controller-select]');
      if (!b) continue;
      b.hidden = !available;
      b.setAttribute('aria-pressed', active);
      b.setAttribute('aria-expanded', active && overlayOpen);
      b.textContent = active ? 'Controlling' : 'Control';
    }
    const consoleButton = rack.querySelector('[data-controller-console]');
    if (consoleButton) {
      consoleButton.textContent = available ? 'LPD8 → ' + (registry.get(selected)?.name ?? 'controls') : 'LPD8 setup';
      consoleButton.setAttribute('aria-expanded', available && overlayOpen);
    }
  }
  function render() {
    decorate();
    if (!available || !overlayOpen) { strip.hidden = true; return; }
    const item = registry.get(selected); if (!item) { strip.hidden = true; return; }
    caption.textContent = 'LPD8 → ' + item.name;
    const a = assignments(selected);
    chips.replaceChildren(...a.values.map((id, index) => {
      const chip = document.createElement('span');
      const option = (index < 8 ? a.pads : a.knobs).find((o) => o.id === id);
      const display = option?.input ? option.input.tagName.toLowerCase() === 'select' ? option.input.selectedOptions?.[0]?.textContent || option.input.value : option.input.value : '';
      chip.textContent = (index < 8 ? 'P' + (index + 1) : 'K' + (index - 7)) + ' ' + (option?.label || '—') + (display ? ' · ' + display : '');
      chip.dataset.assigned = Boolean(option); return chip;
    }));
    if (!a.values.some(Boolean)) { const help = document.createElement('span'); help.textContent = 'No adjustable panel controls; use this module’s signal jacks.'; chips.append(help); }
    position();
  }
  const selectFromHeader = (event) => {
    if (!available) return;
    const header = event.target.closest('.module-head');
    if (!header || event.target.closest('button, input, select, textarea, a, summary, .module-actions, .module-handle, .port')) return;
    const module = header.closest('.module');
    const item = [...registry.values()].find((item) => item.module === module);
    if (item) choose(item.id, { show: true });
  };
  rack.addEventListener('click', selectFromHeader);
  editorHost?.addEventListener('click', selectFromHeader);
  return {
    targets: all,
    bindSelect(fn) { choose = fn; },
    bindSettings(fn) { openSettings = fn; },
    setAvailable(value) {
      const next = Boolean(value);
      if (available && !next) { clearHeld(); overlayOpen = false; }
      available = next; render();
    },
    positionOverlay: position,
    toggleOverlay() { if (available) { overlayOpen = !overlayOpen || strip.hidden; render(); } },
    select(id, { toggle = false, show = false } = {}) {
      const same = selected === id;
      if (!same) clearHeld();
      selected = id;
      if (available && toggle) overlayOpen = same ? !overlayOpen || strip.hidden : true;
      else if (available && show) overlayOpen = true;
      render();
    },
    describe(id, index) { const a = assignments(id); return (index < 8 ? a.pads : a.knobs).find((o) => o.id === a.values[index])?.label || 'Unassigned'; },
    options(id, index) { const a = assignments(id); return (index < 8 ? a.pads : a.knobs).map(({ id, label }) => ({ id, label })); },
    assigned(id, index) { return assignments(id).values[index]; },
    assign(id, index, value) {
      clearHeld(); const a = assignments(id);
      if (value && !(index < 8 ? a.pads : a.knobs).some((o) => o.id === value)) return;
      custom[a.key] = { ...(custom[a.key] || {}), [index]: value }; save(); render();
    },
    automatic(id) { clearHeld(); delete custom[assignments(id).key]; save(); render(); },
    clearHeld,
    apply(id, slot, action, value) {
      const index = action === 'knob' ? slot + 8 : slot;
      const a = assignments(id); const option = (index < 8 ? a.pads : a.knobs).find((o) => o.id === a.values[index]);
      if (action === 'release') { if (held.has(slot)) { play(slot, held.get(slot), false, 0); held.delete(slot); } return true; }
      if (!option) return true;
      if (action === 'knob') {
        option.input.value = midiControlValue(option.input, value);
        option.input.dispatchEvent(new Event(option.input.tagName.toLowerCase() === 'select' ? 'change' : 'input', { bubbles: true }));
      } else if (option.note !== undefined) { held.set(slot, option.note); play(slot, option.note, true, value); }
      else if (option.input) { option.input.checked = !option.input.checked; option.input.dispatchEvent(new Event('change', { bubbles: true })); }
      else option.button?.click();
      render(); return true;
    },
  };
}
