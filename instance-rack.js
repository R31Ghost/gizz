import { setupSequenceEditor } from './sequence-editor.js';
import { createPatternLibrary } from './sequence-patterns.js';
import { availableTypes, createModuleInstance, instanceDefaults, instanceJack, MAX_INSTANCES, moduleCatalog } from './module-instances.js';
import { controlReadout, scopeTimeReadout } from './readouts.js';
import { scopeWindowMs } from './source-tools.js';
import { drawScope } from './scope-view.js';

const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const button = (text, action) => {
  const element = make('button', 'reset', text);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
};
const noteName = (note) => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][note % 12] + (Math.floor(note / 12) - 1);

export function setupInstanceRack({ state, lesson, bay, sources, layouts, register, unregister, beforeEdit, changed, removeCables, announce, read, isActive, sampleRate, labelPort, patternLibrary, overlays, sequenceCanAdvance, onSequencePage = () => {} }) {
  const entries = new Map();
  const library = patternLibrary || createPatternLibrary({ getItem: () => null, setItem() {} });
  let nextId = 1;
  const types = availableTypes(lesson);
  const shelf = make('details', 'patch-shelf module-shelf');
  shelf.id = 'module-shelf';
  const summary = make('summary', '', 'Add modules');
  const controls = make('div', 'patch-shelf-controls');
  const label = make('label', '', 'Module type');
  const select = make('select');
  select.id = 'module-type'; label.htmlFor = select.id;
  for (const type of types) { const option = make('option', '', type); option.value = type; select.append(option); }
  const add = button('Add module', () => addModule(select.value));
  const status = make('p', 'readout', 'Add an independent module, or use Duplicate on a module. New modules start unpatched. Keyboard and Output remain shared connection points.');
  status.setAttribute('role', 'status');
  controls.append(label, select, add);
  shelf.append(summary, controls, status);
  const shelfEditor=overlays?.register({id:'add-modules',title:'Add modules',content:shelf,kind:'modules'});
  if(!shelfEditor)document.getElementById('rack-start').before(shelf);
  const stateOf = (id) => state.instances.find((item) => item.id === id);
  const commit = () => { changed(); status.textContent = state.instances.length + ' added modules · limit ' + MAX_INSTANCES + '.'; add.disabled = state.instances.length >= MAX_INSTANCES; };

  function duplicateButton(handler) {
    const copy = button('Duplicate', handler);
    copy.dataset.duplicateModule = '';
    return copy;
  }
  function syncLimit() {
    const full = state.instances.length >= MAX_INSTANCES;
    add.disabled = full;
    for (const copy of document.querySelectorAll('[data-duplicate-module]')) {
      copy.disabled = full;
      copy.textContent = full ? 'Duplicate (limit)' : 'Duplicate';
      copy.title = full ? '24 added modules reached. Remove a copy to add another.' : 'Create an independent, unpatched copy';
    }
  }

  function addModule(type, settings = {}, name) {
    if (state.instances.length >= MAX_INSTANCES) { announce('This patch already has ' + MAX_INSTANCES + ' added modules.'); return; }
    beforeEdit();
    const ordinal = state.instances.filter((item) => item.type === type).length + 2;
    if (nextId > 999999) nextId = 1;
    while (state.instances.some((item) => item.id === 'm' + nextId)) nextId++;
    const item = createModuleInstance(type, 'm' + nextId++, name || type + ' ' + ordinal, settings);
    state.instances = [...state.instances, item];
    sync();
    commit();
    shelfEditor?.hide();
    if (moduleCatalog[type].source) sources.reveal();
    const module = entries.get(item.id).module;
    module.scrollIntoView({ block: 'nearest' });
    module.querySelector('h3').focus({ preventScroll: true });
    announce(item.name + ' added with independent settings and jacks.');
  }

  function duplicateBase(type) {
    const settings = instanceDefaults(type);
    for (const key of Object.keys(settings)) if (state[key] !== undefined) settings[key] = structuredClone(state[key]);
    addModule(type, settings);
  }

  function createEntry(item) {
    const spec = moduleCatalog[item.type];
    const module = make('article', 'module instance-module ' + spec.css);
    module.dataset.moduleId = item.id;
    module.dataset.moduleType = item.type;
    const header = make('header', 'module-head');
    const index = make('span', 'module-index', item.type + ' / ' + item.id);
    const title = make('h3', '', item.name);
    title.tabIndex = -1;
    const description = make('p', '', item.type === 'Clock' ? 'Follows Play clock. Tempo and pulse width belong to this copy.' : 'Independent ' + item.type.toLowerCase() + ' · rename it for its role in your patch.');
    const body = make('div', 'module-controls');
    body.id = 'body-' + item.id;
    const strip = make('div', 'port-strip');
    const syncs = [];
    const entry = { item, module, title, syncs, update() {} };
    const editSettings = (change) => {
      const current = stateOf(item.id);
      current.settings = { ...current.settings, ...change };
      entry.item = current;
      for (const sync of syncs) sync();
      changed(false);
    };
    for (const control of spec.controls) {
      const row = make('div', control.values ? 'voice-control' : 'slider-control');
      const fieldLabel = make('label', '', control.label);
      const field = make(control.values ? 'select' : 'input');
      if (control.key === 'retrigger') field.dataset.controllerAutoIgnore = '';
      field.id = item.id + '-' + control.key;
      fieldLabel.htmlFor = field.id;
      let display;
      if (control.values) {
        control.values.forEach((value, i) => { const option = make('option', '', control.labels[i]); option.value = value; field.append(option); });
        row.append(fieldLabel, field);
      } else {
        display = make('output'); display.htmlFor = field.id;
        const caption = make('div'); caption.append(fieldLabel, display);
        field.type = 'range'; field.min = control.min; field.max = control.max; field.step = control.step;
        row.append(caption, field);
      }
      field.addEventListener(control.values ? 'change' : 'input', () => {
        const value = typeof control.value === 'number' ? Number(field.value) : field.value;
        editSettings({ [control.key]: value });
      });
      syncs.push(() => {
        const value = entry.item.settings[control.key];
        field.value = value;
        if (display) {
          display.value = controlReadout(control.display ? control.display(value) : value, control.unit);
          field.setAttribute('aria-valuetext', display.value);
        }
      });
      body.append(row);
    }
    const readout = make('p', 'readout');
    if (item.type === 'ADSR Envelope') {
      const meter = make('meter'); meter.min = 0; meter.max = 1; meter.value = 0;
      meter.setAttribute('aria-label', item.name + ' envelope level');
      const row = make('div', 'envelope-meter'); row.append('Envelope level ', meter, readout); body.prepend(row);
      entry.update = (signal) => { meter.value = signal?.level ?? 0; readout.textContent = signal?.gate ? 'Gate high' : 'Gate low'; };
    } else if (['Sequencer', 'Phrase'].includes(item.type)) {
      const editor = setupSequenceEditor({
        container: body, overlays, id: item.id, state, settings: () => entry.item.settings,
        edit: editSettings, beforeEdit, apply: () => changed(false), library, noteName,
        isRunning: () => item.type === 'Phrase' ? false : sequenceCanAdvance ? sequenceCanAdvance(item.id) : Boolean(state.playing && isActive(item.id)), onPage: onSequencePage,
      });
      syncs.push(editor.sync); entry.update = editor.update; entry.destroy = editor.destroy;
    } else if (item.type === 'Scope') {
      const canvas = make('canvas', 'scope-screen'); canvas.width = 520; canvas.height = 170; canvas.setAttribute('aria-label', item.name + ' traces A and B');
      body.prepend(canvas, readout);
      let lastKey;
      entry.update = (signal) => {
        const s = entry.item.settings;
        const ids = ['scopeInA', 'scopeInB'].map((key) => instanceJack(item.id, key));
        const active = ids.map((id) => Boolean(state.patch[id]));
        const key = s.scopeRange + ':' + active.join(',');
        if (!module.closest('.module-collapsed, [hidden]') && (signal?.traces || key !== lastKey)) drawScope(canvas, signal?.traces ?? null, active, s.scopeRange);
        lastKey = key;
        readout.textContent = scopeTimeReadout(scopeWindowMs(s.scopeWindow, sampleRate())) + ' · ±' + s.scopeRange;
      };
    } else if (item.type === 'VCA') {
      body.append(readout);
      entry.update = () => {
        const source = state.patch[instanceJack(item.id, 'cvIn')];
        readout.textContent = source ? 'Gain from ' + (Array.isArray(source) ? source.map(labelPort).join(' + ') : labelPort(source)) : 'Closed · no CV';
      };
    } else if (item.type === 'Oscillator') {
      body.append(readout);
      entry.update = () => {
        const hz = 220 * 2 ** (entry.item.settings.transpose / 12);
        readout.textContent = Number(hz.toFixed(2)) + ' Hz · ' + (state.patch[instanceJack(item.id, 'pitchIn')] ? 'base pitch + Pitch in' : 'base pitch');
      };
    }
    for (const { key, label } of spec.ports) { const jack = make('button', 'port', label); jack.type = 'button'; jack.dataset.port = instanceJack(item.id, key); strip.append(jack); }
    const rename = make('details', 'instance-name');
    const renameSummary = make('summary', '', 'Rename');
    const nameLabel = make('label', '', 'Module name');
    const name = make('input'); name.id = item.id + '-name'; name.maxLength = 48; name.value = item.name; nameLabel.htmlFor = name.id;
    name.addEventListener('change', () => {
      const clean = name.value.trim();
      if (!clean) { name.value = entry.item.name; return; }
      beforeEdit();
      entry.item.name = clean;
      title.textContent = clean;
      register(entry.item, module, true);
      changed();
      announce('Module renamed to ' + clean + '.');
    });
    rename.append(renameSummary, nameLabel, name);
    header.append(index, title, description, rename);
    module.append(header, body, strip);
    const container = spec.source ? sources.body : bay;
    container.append(module);
    register(item, module);
    const layout = spec.source ? layouts.sources : layouts.rack;
    layout.add(module, false);
    const actions = module.querySelector('.module-actions');
    actions.append(duplicateButton(() => addModule(entry.item.type, entry.item.settings, entry.item.name + ' copy')));
    const remove = button('Remove', () => {
      beforeEdit();
      state.instances = state.instances.filter((candidate) => candidate.id !== item.id);
      removeCables(item.id);
      sync(); commit();
      announce(entry.item.name + ' removed. Undo restores its settings and cables.');
    });
    actions.append(remove);
    syncs.push(() => { title.textContent = entry.item.name; name.value = entry.item.name; });
    entries.set(item.id, entry);
    return entry;
  }

  function sync() {
    const wanted = new Map(state.instances.map((item) => [item.id, item]));
    for (const [id, entry] of entries) {
      if (wanted.get(id)?.type === entry.item.type) continue;
      unregister(entry.item);
      (moduleCatalog[entry.item.type].source ? layouts.sources : layouts.rack).remove(id, false);
      entry.destroy?.(); delete state.sequenceRuntime?.[id];
      entry.module.remove(); entries.delete(id);
    }
    for (const item of state.instances) {
      nextId = Math.max(nextId, Number(item.id.slice(1)) + 1);
      const entry = entries.get(item.id) ?? createEntry(item);
      entry.item = item;
      for (const update of entry.syncs) update();
      register(item, entry.module, true);
    }
    layouts.rack.refresh(false); layouts.sources.refresh(false);
    syncLimit();
  }
  for (const type of types) {
    const module = [...document.querySelectorAll('.module')].find((module) => !module.dataset.moduleId && module.querySelector('h3')?.textContent === type);
    module?.querySelector('.module-actions')?.append(duplicateButton(() => duplicateBase(type)));
  }
  syncLimit();
  return {
    sync,
    receiveSequence(id, signal) { if (['Sequencer', 'Phrase'].includes(entries.get(id)?.item.type)) entries.get(id).update(signal); },
    syncControls() { for (const entry of entries.values()) for (const sync of entry.syncs) sync(); },
    add: addModule,
    reveal() { shelf.open = true; if(shelfEditor)shelfEditor.open();else shelf.scrollIntoView({ block: 'start' }); select.focus({ preventScroll: true }); },
    visualInputs() {
      return [...entries.values()].filter(({ item, module }) => item.type === 'Scope' && !module.closest('.module-collapsed, [hidden]')).flatMap(({ item }) => ['scopeInA', 'scopeInB'].map((key) => instanceJack(item.id, key)));
    },
    update() { for (const [id, entry] of entries) entry.update(isActive(id) ? read(id) : null); },
  };
}
