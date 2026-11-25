import { instrumentInterface, duplicateInstrument, nextInstrumentId } from './instruments.js';
import { MAX_INSTANCES, moduleCatalog } from './module-instances.js';
import { rackTone } from './rack-colors.js';

const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (text, action, className = 'reset') => {
  const node = make('button', className, text); node.type = 'button';
  node.addEventListener('click', action); return node;
};

// Instruments own membership and presentation. The existing modules still own DSP and jacks.
export function setupInstrumentRack({ state, bay, docks, layouts, ports, rackPorts, beforeEdit, changed, copy, announce, onView, onGeometry = onView, patchPort, overlays }) {
  const panels = new Map();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onGeometry);
  const host = make('div', 'instrument-panels'); host.hidden = true;
  docks.main.prepend(host);
  const tabs = make('div', 'instrument-tabs');
  tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Instruments');
  docks.toolbar.querySelector('.rack-dock-tabs').append(tabs);
  const shelf = make('details', 'patch-shelf instrument-shelf'); shelf.id = 'instrument-shelf';
  const summary = make('summary', '', 'Instruments');
  const intro = make('p', '', 'Select two or more modules, name your instrument, then group them in a separate panel. Their jacks and cables keep working. Keyboard and Output stay shared. Clocks and looping sequencers stay outside sound instruments; add Phrase for a trigger-started internal sequence.');
  const fields = make('div', 'patch-shelf-controls');
  const groupLabel = make('label', '', 'Edit');
  const select = make('select'); select.id = 'instrument-select'; groupLabel.htmlFor = select.id;
  const nameLabel = make('label', '', 'Name');
  const name = make('input'); name.type = 'text'; name.id = 'instrument-name'; name.maxLength = 48; nameLabel.htmlFor = name.id;
  const choices = make('fieldset', 'instrument-choices');
  const status = make('p', 'readout'); status.setAttribute('role', 'status');
  const save = button('Create instrument', saveGroup);
  fields.append(groupLabel, select, nameLabel, name, save);
  const advancedLabel = make('label', 'instrument-choice'), includeTiming = make('input'); includeTiming.type='checkbox';
  advancedLabel.append(includeTiming, make('span','','Include timing modules (advanced custom group)'));
  includeTiming.addEventListener('change',()=>renderBuilder());
  shelf.append(summary, intro, advancedLabel, fields, choices, status);
  const builder = overlays?.register({id:'instrument-groups',title:'Group instruments',content:shelf,kind:'groups'});
  if (!builder) document.getElementById('rack-start').before(shelf);
  let editing = '', signature = '';
  const drafts = new Set();
  select.addEventListener('change', () => { editing = select.value; drafts.clear(); renderBuilder(); });

  function descriptors() {
    const result = new Map();
    for (const [portId, port] of rackPorts) {
      const module = ports.get(portId)?.closest('.module');
      const instance = state.instances.find(item => item.id === port.module);
      const type = instance?.type || port.module;
      if (!module || !Object.hasOwn(moduleCatalog, type) || result.has(port.module)) continue;
      result.set(port.module, { id: port.module, type, name: instance?.name || type, module,
        home: moduleCatalog[type].source ? docks.sources.body : bay });
    }
    return result;
  }
  function message(text) { status.textContent = text; announce(text); }
  function reveal(id) {
    if(builder && id===undefined){shelf.open=true;builder.toggle();if(!builder.collapsed)name.focus({preventScroll:true});return;}
    editing = id || ''; drafts.clear(); renderBuilder(); shelf.open = true;
    if (builder) builder.open(); else shelf.scrollIntoView({ block: 'start' });
    name.focus({ preventScroll: true });
  }
  function renderBuilder() {
    if (!state.instruments.some(item => item.id === editing)) editing = '';
    select.replaceChildren();
    for (const item of [{ id: '', name: 'New instrument' }, ...state.instruments]) {
      const option = make('option', '', item.name); option.value = item.id; select.append(option);
    }
    select.value = editing;
    const current = state.instruments.find(item => item.id === editing);
    name.value = current?.name || 'Instrument ' + (state.instruments.length + 1);
    save.textContent = current ? 'Save instrument' : 'Create instrument';
    const selected = new Set(current?.members || drafts);
    choices.replaceChildren(make('legend', '', 'Modules'));
    const assigned = new Set(state.instruments.filter(item => item.id !== editing).flatMap(item => item.members));
    for (const [id, item] of descriptors()) {
      if (assigned.has(id) || (!includeTiming.checked && !current?.members.includes(id) && ['Clock','Sequencer','Clock Divider'].includes(item.type))) continue;
      const label = make('label', 'instrument-choice');
      const check = make('input'); check.type = 'checkbox'; check.value = id; check.checked = selected.has(id);
      check.addEventListener('change', () => { if (check.checked) drafts.add(id); else drafts.delete(id); });
      label.append(check, make('span', '', item.name)); choices.append(label);
    }
  }
  function saveGroup() {
    const members = [...choices.querySelectorAll('input')].filter(input => input.checked).map(input => input.value);
    if (members.length < (editing ? 1 : 2)) { message(editing ? 'Keep at least one module, or use Ungroup.' : 'Select at least two modules to create an instrument.'); return; }
    const clean = name.value.trim();
    if (!clean || clean.length > 48) { message('Enter an instrument name up to 48 characters.'); return; }
    beforeEdit();
    const previous = state.instruments.find(item => item.id === editing);
    // Retain the order of existing members; newly selected modules follow them.
    const ordered = [...(previous?.members || []).filter(id => members.includes(id)), ...members.filter(id => !previous?.members.includes(id))];
    const item = { id: editing || nextInstrumentId(state.instruments, 'i'), name: clean, members: ordered, ports: (previous?.ports || instrumentInterface(ordered,rackPorts)).filter(p=>ordered.includes(rackPorts.get(p.jack)?.module)) };
    state.instruments = editing ? state.instruments.map(group => group.id === editing ? item : group) : [...state.instruments, item];
    editing = item.id; changed(); panels.get(item.id)?.show(true);
    builder?.hide();
    message(clean + ' saved. Edit modules opens its floating editor; its patch jacks stay in the rack.');
  }
  function ungroup(id) {
    const item = state.instruments.find(group => group.id === id); if (!item) return;
    beforeEdit(); state.instruments = state.instruments.filter(group => group.id !== id); changed();
    message(item.name + ' ungrouped. Modules and cables remain. Undo restores the group.');
  }
  function duplicate(id, external) {
    try {
      const result = duplicateInstrument(state, copy.cables(), id, descriptors(), rackPorts, external);
      beforeEdit(); copy.apply(result); panels.get(result.instrument.id)?.show(true);
      message(result.instrument.name + ' created with independent settings and ' + (external ? 'shared external connections.' : 'internal cables only.'));
    } catch (error) { message(error.message); }
  }
  function updateHost() {
    host.hidden = ![...panels.values()].some(entry => !entry.panel.hidden);
    docks.workspace.classList.toggle('has-open-instruments', !host.hidden);
  }
  function createPanel(id) {
    const panel = make('section', 'rack-section instrument-panel'); panel.id = 'instrument-' + id;
    panel.dataset.side = 'instrument'; panel.tabIndex = -1;
    const header = make('header', 'instrument-head');
    const title = make('h3', 'dock-heading'); title.id = panel.id + '-title'; panel.setAttribute('aria-labelledby', title.id);
    const toggle = button('', () => editor ? editor.toggle() : show(panel.hidden), 'dock-toggle'); toggle.setAttribute('aria-controls', panel.id);
    const close = button('Close', () => { show(false); toggle.focus({ preventScroll: true }); });
    const edit = button('Edit group', () => reveal(id));
    const tools = make('details', 'instrument-tools');
    const shareLabel = make('label', 'instrument-choice'); const share = make('input'); share.type = 'checkbox'; share.checked = true;
    shareLabel.append(share, make('span', '', 'Share external connections when duplicating'));
    const explanation = make('small', '', 'Copies always keep internal cables. Sharing also connects the copy to the same external inputs and destinations.');
    const duplicateButton = button('Duplicate instrument', () => duplicate(id, share.checked));
    tools.append(make('summary', '', 'Instrument actions'), shareLabel, explanation, duplicateButton, button('Ungroup', () => ungroup(id)));
    const launch = button('Edit modules', () => editor.toggle());
    const editorTools = make('div','instrument-editor-tools'); editorTools.append(edit,tools);
    header.append(title, ...(overlays ? [launch] : [close,edit,tools]));
    const exposed=make('div','port-strip instrument-ports');header.append(exposed);
    const body = make('div', 'voice-bay modulation-bay dock-modules instrument-modules'); panel.append(header, body);
    host.append(panel); tabs.append(toggle); observer?.observe(panel);
    let editor;
    if(overlays){
      const content=make('div','instrument-editor-content');content.append(editorTools,body);
      editor=overlays.register({id:'instrument:'+id,title:'Instrument',content,trigger:launch,onVisibility(open){toggle.setAttribute('aria-expanded',open);onView();}});
      toggle.setAttribute('aria-controls',editor.window.id);
    }
    function show(open) {
      if(editor){if(open)editor.open();else editor.collapse();return;}
      panel.hidden = !open;
      if (open) docks.main.scrollTop = Math.max(0, docks.main.scrollTop + panel.getBoundingClientRect().top - docks.main.getBoundingClientRect().top);
      toggle.setAttribute('aria-expanded', open); updateHost(); onView();
    }
    panel.addEventListener('keydown', event => {
      if (editor || event.key !== 'Escape' || event.target.closest('input, select, .port')) return;
      show(false); toggle.focus({ preventScroll: true });
    });
    const entry = { panel, body, toggle, title, duplicateButton, show, exposed, editor, fallback:launch, aliases:new Map(), portSignature:'' }; panels.set(id, entry); docks.panels.push(entry);
    panel.hidden = false; toggle.setAttribute('aria-expanded', !editor); return entry;
  }
  function moveMember(groupId, member, delta) {
    const group = state.instruments.find(item => item.id === groupId);
    const index = group.members.indexOf(member), destination = index + delta;
    if (destination < 0 || destination >= group.members.length) return;
    beforeEdit(); const members = [...group.members]; [members[index], members[destination]] = [members[destination], members[index]];
    state.instruments = state.instruments.map(item => item.id === groupId ? { ...item, members } : item); changed();
  }
  function sync() {
    const modules = descriptors();
    // Removing an individual copy trims its membership and removes empty groups.
    state.instruments = (state.instruments || []).map(item => ({ ...item, members: item.members.filter(id => modules.has(id)) })).filter(item => item.members.length);
    const grouped = new Map(state.instruments.flatMap(item => item.members.map(id => [id, item.id])));
    for (const [id, item] of modules) {
      if (grouped.get(id) === item.module.dataset.instrumentId) continue;
      if (item.module.dataset.instrumentId) {
        delete item.module.dataset.instrumentId;
        item.module.querySelector('.instrument-member-actions')?.remove(); item.home.append(item.module);
      }
    }
    for (const item of state.instruments) {
      const entry = panels.get(item.id) || createPanel(item.id);
      if(item.ports)item.ports=item.ports.filter(p=>item.members.includes(rackPorts.get(p.jack)?.module));
      const interfacePorts=item.ports || instrumentInterface(item.members,rackPorts), portSignature=JSON.stringify(interfacePorts);
      if(entry.portSignature!==portSignature){entry.portSignature=portSignature;entry.exposed.replaceChildren();entry.aliases.clear();for(const p of interfacePorts){const alias=button(p.label,()=>patchPort ? patchPort(p.jack,alias) : ports.get(p.jack)?.click(),'port');alias.dataset.kind=rackPorts.get(p.jack).kind;alias.setAttribute('aria-label',item.name+' '+p.label);entry.exposed.append(alias);entry.aliases.set(p.jack,alias);}}
      entry.title.textContent = item.name + ' · ' + item.members.length + ' modules'; entry.toggle.textContent = item.name;
      const tone=rackTone(item.id);
      for(const node of [entry.panel,entry.toggle,entry.body]){node.style.setProperty('--rack-tint',tone.surface);node.style.setProperty('--rack-color',tone.ink);}
      entry.editor?.setTitle(item.name + ' · instrument'); entry.editor?.setTheme(tone);
      entry.toggle.setAttribute('aria-label', 'Toggle instrument ' + item.name);
      const full = MAX_INSTANCES - state.instances.length < item.members.length;
      entry.duplicateButton.disabled = full;
      entry.duplicateButton.textContent = full ? 'Duplicate (needs ' + item.members.length + ' free slots)' : 'Duplicate instrument';
      for (const [index, id] of item.members.entries()) {
        const module = modules.get(id).module; module.dataset.instrumentId = item.id;
        if (entry.body.children[index] !== module) entry.body.insertBefore(module, entry.body.children[index] || null);
        let actions = module.querySelector('.instrument-member-actions');
        if (!actions) {
          actions = make('span', 'instrument-member-actions');
          actions.append(button('↑', () => moveMember(module.dataset.instrumentId, id, -1)), button('↓', () => moveMember(module.dataset.instrumentId, id, 1)));
          module.querySelector('.module-actions').append(actions);
        }
        const [up, down] = actions.children;
        up.disabled = index === 0; down.disabled = index === item.members.length - 1;
        up.setAttribute('aria-label', 'Move ' + modules.get(id).name + ' up in instrument');
        down.setAttribute('aria-label', 'Move ' + modules.get(id).name + ' down in instrument');
      }
    }
    for (const [id, entry] of panels) if (!state.instruments.some(item => item.id === id)) {
      observer?.unobserve(entry.panel); entry.editor?.destroy(); entry.panel.remove(); entry.toggle.remove(); panels.delete(id);
      docks.panels.splice(docks.panels.indexOf(entry), 1);
    }
    layouts.rack.refresh(false); layouts.sources.refresh(false); updateHost();
    const nextSignature = JSON.stringify([state.instruments, [...modules].map(([id, item]) => [id, item.name])]);
    if (nextSignature !== signature) { signature = nextSignature; renderBuilder(); }
  }
  sync();
  return { sync, reveal, descriptors, syncPorts(){ for(const entry of panels.values())for(const[id,alias]of entry.aliases){const real=ports.get(id);for(const key of ['linked','count','match'])alias.dataset[key]=real?.dataset[key];alias.setAttribute('aria-pressed',real?.getAttribute('aria-pressed') || 'false');} }, cableAnchor(id,other){const group=state.instruments.find(g=>g.members.includes(rackPorts.get(id)?.module));if(!group || group.members.includes(rackPorts.get(other)?.module))return ports.get(id);const entry=panels.get(group.id);return !entry?.panel.hidden ? entry?.aliases.get(id) || ports.get(id) : ports.get(id);}, revealMember(id) {
    const group = state.instruments.find(item => item.members.includes(id));
    if (group) panels.get(group.id)?.show(true);
    const module = descriptors().get(id)?.module;
    if (module) { if(overlays){overlays.revealModule(id==='Sequencer'?'original':id);onView();}else{module.classList.remove('module-collapsed');module.scrollIntoView({block:'nearest'}); module.querySelector('h3')?.focus({preventScroll:true});} }
  } };
}
