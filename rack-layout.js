import { addModuleDetails } from './module-details.js';

export function setupRackLayout(bay, cableLayer, restoreButton, onChange, storageKey = 'patchlab-rack-layout-v1', fallbackKey = storageKey) {
  const modules = [...bay.querySelectorAll('.module')];
  const keyOf = (module) => module.dataset.moduleId || module.querySelector('h3').textContent;
  const names = new Map(modules.map((module) => [keyOf(module), module]));
  const original = [...names.keys()];
  let order = [...original];
  let collapsed = new Set();
  let pointer;
  let savedOrder = [];
  let savedCollapsed = new Set();

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? localStorage.getItem(fallbackKey));
    if (Array.isArray(saved?.order)) {
      savedOrder = saved.order.filter((key) => typeof key === 'string');
      order = [...new Set([...saved.order.filter((name) => names.has(name)), ...original])];
    }
    if (Array.isArray(saved?.collapsed)) {
      savedCollapsed = new Set(saved.collapsed);
      collapsed = new Set(saved.collapsed.filter((name) => names.has(name)));
    }
  } catch {
    // Layout changes still work without browser storage.
  }

  const actions = new Map();
  function button(text, label, handler) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    element.setAttribute('aria-label', label);
    element.addEventListener('click', handler);
    return element;
  }

  function render(notify = true) {
    let position = 0;
    order.forEach((name) => {
      const module = names.get(name);
      const { fold, handle } = actions.get(name);
      const label = module.querySelector('h3').textContent;
      handle.setAttribute('aria-label', 'Move ' + label + '. Use arrow keys or drag.');
      const closed = collapsed.has(name);
      module.classList.toggle('module-collapsed', closed);
      fold.textContent = closed ? 'Expand' : 'Collapse';
      fold.setAttribute('aria-label', (closed ? 'Expand ' : 'Collapse ') + label);
      fold.setAttribute('aria-expanded', !closed);
      if (module.dataset.instrumentId) return;
      if (bay.children[position] !== module) bay.insertBefore(module, bay.children[position] ?? cableLayer);
      position++;
    });
    if (notify) onChange();
  }

  function save() {
    try {
      savedOrder = [...order];
      savedCollapsed = new Set(collapsed);
      localStorage.setItem(storageKey, JSON.stringify({ order, collapsed: [...collapsed] }));
    } catch {
      // Layout changes still work without browser storage.
    }
  }

  function move(name, index) {
    if (index < 0 || index >= order.length || order[index] === name) return;
    order = order.filter((item) => item !== name);
    order.splice(index, 0, name);
    render();
    save();
  }

  function install(name, module) {
    const controls = document.createElement('div');
    controls.className = 'module-actions';
    const handle = document.createElement('span');
    handle.textContent = '⠿';
    handle.className = 'module-handle';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'button');
    handle.title = 'Drag to move ' + name;
    handle.setAttribute('aria-label', 'Move ' + name + '. Use arrow keys or drag.');
    const fold = button('Collapse', 'Collapse ' + name, () => {
      if (!collapsed.delete(name)) collapsed.add(name);
      render();
      save();
    });
    const body = module.querySelector('.module-controls');
    body.id ||= 'rack-body-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    fold.setAttribute('aria-controls', body.id);
    controls.append(handle, fold);
    const header = module.querySelector('.module-head');
    header.prepend(controls);
    addModuleDetails(header.querySelector('h3'), module.dataset.moduleType || header.querySelector('h3')?.textContent);
    actions.set(name, { fold, handle });
    handle.addEventListener('keydown', (event) => {
      const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      move(name, order.indexOf(name) + delta);
      handle.focus();
    });
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || pointer) return;
      handle.setPointerCapture(event.pointerId);
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    function destination(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 5) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.module');
      return target?.parentElement === bay ? target : undefined;
    }
    handle.addEventListener('pointermove', (event) => {
      const target = destination(event);
      for (const candidate of names.values()) candidate.dataset.dropTarget = candidate === target && candidate !== module;
    });
    const finish = (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const target = event.type === 'pointerup' ? destination(event) : undefined;
      pointer = undefined;
      for (const candidate of names.values()) delete candidate.dataset.dropTarget;
      if (target) move(name, order.indexOf(keyOf(target)));
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
  }

  for (const [name, module] of names) install(name, module);

  restoreButton.addEventListener('click', () => {
    order = [...original];
    collapsed.clear();
    render();
    save();
  });
  render();
  if (fallbackKey !== storageKey) save();
  return {
    add(module, renderNow = true) {
      const key = keyOf(module);
      if (names.has(key)) return;
      names.set(key, module);
      const type = module.dataset.moduleType;
      const sibling = type && order.findLast((id) => {
        const candidate = names.get(id);
        return candidate !== module && (candidate.dataset.moduleType || candidate.querySelector('h3').textContent) === type;
      });
      original.splice(sibling ? original.indexOf(sibling) + 1 : original.length, 0, key);
      order.splice(sibling ? order.indexOf(sibling) + 1 : order.length, 0, key);
      if (savedOrder.includes(key)) order = [...new Set([...savedOrder.filter((id) => names.has(id)), ...order])];
      if (savedCollapsed.has(key)) collapsed.add(key);
      install(key, module);
      if (renderNow) render();
    },
    remove(key, renderNow = true) {
      names.delete(key);
      actions.delete(key);
      order = order.filter((id) => id !== key);
      const index = original.indexOf(key);
      if (index !== -1) original.splice(index, 1);
      collapsed.delete(key);
      if (renderNow) render();
    },
    refresh(notify = true) { render(notify); },
  };
}
