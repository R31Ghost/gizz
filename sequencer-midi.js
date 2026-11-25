export const midiPitch = (value) => Math.round(-12 + Math.max(0, Math.min(127, value)) * 36 / 127);
const validBinding = (b, index) => b && ['note', 'cc'].includes(b.kind) && (index < 8 || b.kind === 'cc') && Number.isInteger(b.channel) && b.channel >= 1 && b.channel <= 16 && Number.isInteger(b.number) && b.number >= 0 && b.number <= 127;
const address = (b) => b.kind + ':' + b.channel + ':' + b.number;
export function readControllerProfile(storage) {
  try {
    const p = JSON.parse(storage.getItem('patchlab-sequencer-midi-v1'));
    if (p?.version !== 1 || !Array.isArray(p.bindings) || p.bindings.length !== 16) return null;
    const seen = new Set();
    return { deviceName: typeof p.deviceName === 'string' ? p.deviceName : '', bindings: p.bindings.map((b, i) => {
      if (!validBinding(b, i) || seen.has(address(b))) return null;
      seen.add(address(b)); return b;
    }) };
  } catch { return null; }
}
export function createSequencerMidi({ bindings = Array(16).fill(null), edit, raw = false, notify = () => {} }) {
  let queue = [];
  const down = new Set();
  const map = [...bindings];
  return {
    bindings: map,
    get learning() { return queue[0]; },
    learn(indices) { queue = [...indices]; down.clear(); },
    cancel() { queue = []; },
    resetHeld() { down.clear(); },
    clear() { map.fill(null); queue = []; down.clear(); },
    receive(data) {
      if (data.length < 3) return;
      const [status, number, value] = data;
      if (![status, number, value].every(Number.isInteger) || number < 0 || number > 127 || value < 0 || value > 127) return;
      const command = status & 240;
      if (![128, 144, 176].includes(command)) return;
      const binding = { kind: command === 176 ? 'cc' : 'note', channel: (status & 15) + 1, number };
      const key = address(binding);
      const high = binding.kind === 'note' ? command === 144 && value > 0 : value >= 64;
      const wasDown = down.has(key);
      const rising = high && !wasDown;
      if (high) down.add(key); else down.delete(key);
      if (queue.length) {
        const index = queue[0];
        if (index < 8 ? !rising : binding.kind !== 'cc') return;
        const duplicate = map.findIndex((b, i) => i !== index && b && address(b) === key);
        if (duplicate !== -1) { notify('That control is already assigned. Use a different pad or knob.'); return; }
        map[index] = binding;
        queue.shift();
        notify('learned');
        return;
      }
      const index = map.findIndex((b) => b && address(b) === key);
      if (index === -1) return;
      if (raw) {
        if (index >= 8) edit(index - 8, 'knob', value);
        else if (rising) edit(index, 'press', value / 127);
        else if (!high && wasDown) edit(index, 'release', 0);
      } else if (index < 8) { if (rising) edit(index, 'gate'); }
      else edit(index - 8, 'pitch', midiPitch(value));
    },
  };
}

export function setupSequencerMidi({ container, connect, targets, edit, storage, releaseDevice, focus }) {
  const make = (tag, text) => { const e = document.createElement(tag); if (text) e.textContent = text; return e; };
  if (!storage) {
    try { storage = globalThis.localStorage; } catch {}
    storage ??= { getItem: () => null, setItem() { throw new Error('Storage unavailable'); } };
  }
  const profile = readControllerProfile(storage);
  let devices = [];
  let deviceId = '';
  let deviceName = profile?.deviceName ?? '';
  let target = 'original';
  const panel = make('details'); panel.className = 'patch-shelf sequencer-midi'; panel.id = 'sequencer-midi';
  panel.append(make('summary', focus ? 'LPD8 · Module control and assignments' : 'LPD8 · Sequencer controller'));
  const explanation = make('p', 'Connect MIDI, choose your LPD8, then Learn all: tap pads 1–8 and turn knobs 1–8 in that order. Pads toggle step gates; knobs set step pitches (−12 to +24 semitones). Use NOTE mode and momentary pads.');
  if (focus) explanation.textContent = '1. Connect MIDI. 2. Once connected, click Control on a module to show or hide its overlay. Knobs follow its controls in display order; Keyboard pads play notes. Choose assignments below for a custom layout. Your learned hardware bindings are reused. Load a patched example and enable audio to hear changes. For the Sequencer, also press Play clock.';
  const controls = make('div'); controls.className = 'patch-shelf-controls';
  const connectButton = make('button', 'Connect MIDI'); connectButton.type = 'button'; connectButton.className = 'reset'; connectButton.addEventListener('click', connect);
  const enabled = make('input'); enabled.type = 'checkbox'; enabled.checked = true;
  const enableLabel = make('label'); enableLabel.append(enabled, focus ? 'Controller on' : 'Control sequencer');
  const deviceSelect = make('select'); deviceSelect.id = 'sequence-midi-device';
  const deviceLabel = make('label', 'MIDI input'); deviceLabel.htmlFor = deviceSelect.id;
  const targetSelect = make('select'); targetSelect.id = 'sequence-midi-target';
  const targetLabel = make('label', focus ? 'Selected module' : 'Sequencer'); targetLabel.htmlFor = targetSelect.id;
  controls.append(connectButton, enableLabel, deviceLabel, deviceSelect, targetLabel, targetSelect);
  const actions = make('div'); actions.className = 'patch-shelf-controls';
  const status = make('p', 'Connect MIDI to detect your controller.'); status.className = 'readout'; status.setAttribute('role', 'status');
  const monitor = make('p', 'No MIDI received yet.'); monitor.className = 'readout';
  const grid = make('div'); grid.className = 'midi-map-grid';
  const rows = [];
  const persist = () => { try { storage.setItem('patchlab-sequencer-midi-v1', JSON.stringify({ version: 1, deviceName, bindings: controller.bindings })); } catch { status.textContent = 'Mapping works for this session; browser storage is unavailable.'; } };
  const prompt = () => {
    const index = controller.learning;
    status.textContent = index === undefined ? focus ? 'Ready. Click Control on a module; toggle its P1–P8 / K1–K8 overlay. Enable audio to listen.' : 'Ready. Pads toggle gates; knobs change pitches. Enable audio and Play clock to listen.' : index < 8 ? 'Tap pad ' + (index + 1) + (focus ? ' to learn its MIDI address.' : ' to control step ' + (index + 1) + ' gate.') : 'Turn knob ' + (index - 7) + (focus ? ' to learn its MIDI address.' : ' to control step ' + (index - 7) + ' pitch.');
  };
  const controller = createSequencerMidi({ bindings: profile?.bindings, raw: Boolean(focus), edit: (step, type, value) => {
    if ((focus ? focus.apply(target, step, type, value) : edit(target, step, type, value)) === false) { status.textContent = 'Target no longer exists. Choose a sequencer.'; return; }
    if (focus) { status.textContent = (type === 'release' ? 'Released · ' : 'Controlling · ') + focus.describe(target, type === 'knob' ? step + 8 : step); return; }
    status.textContent = 'Step ' + (step + 1) + (type === 'gate' ? ' gate toggled.' : ' pitch: ' + value + ' semitones.');
  }, notify(message) { if (message === 'learned') { renderMap(); prompt(); persist(); } else status.textContent = message; } });
  function renderMap() {
    rows.forEach(({ text, learn }, i) => {
      const b = controller.bindings[i];
      text.textContent = b ? (b.kind === 'note' ? 'Note ' : 'CC ') + b.number + ' · ch ' + b.channel : 'Unassigned';
      learn.setAttribute('aria-pressed', controller.learning === i);
    });
  }
  const learnButton = (label, handler) => { const b = make('button', label); b.type = 'button'; b.className = 'reset'; b.addEventListener('click', handler); return b; };
  actions.append(learnButton('Learn all 16 controls', () => { if (!deviceId || !enabled.checked) { status.textContent = 'Connect/select a MIDI input and enable Control sequencer first.'; return; } controller.learn(Array.from({ length: 16 }, (_, i) => i)); renderMap(); prompt(); }), learnButton('Cancel learning', () => { controller.cancel(); renderMap(); prompt(); }), learnButton('Clear mapping', () => { controller.clear(); renderMap(); persist(); status.textContent = 'Mapping cleared. Use Learn all to assign your controls.'; }));
  for (let i = 0; i < 16; i++) {
    const row = make('div'); const text = make('span');
    const learn = learnButton('Learn', () => { if (!deviceId || !enabled.checked) { status.textContent = 'Select a connected input and enable Control sequencer first.'; return; } controller.learn([i]); renderMap(); prompt(); });
    learn.setAttribute('aria-label', 'Learn ' + (i < 8 ? 'pad ' + (i + 1) : 'knob ' + (i - 7)));
    row.append(make('strong', focus ? (i < 8 ? 'Pad ' + (i + 1) : 'Knob ' + (i - 7)) : (i < 8 ? 'Pad ' + (i + 1) + ' → gate ' : 'Knob ' + (i - 7) + ' → pitch ') + (i % 8 + 1)), text, learn); grid.append(row); rows.push({ text, learn });
  }
  const updateAvailability = () => focus?.setAvailable?.(Boolean(deviceId && enabled.checked));
  enabled.addEventListener('change', () => { updateAvailability(); controller.cancel(); controller.resetHeld(); focus?.clearHeld(); if (deviceId) releaseDevice(deviceId); renderMap(); status.textContent = enabled.checked ? focus ? 'Controller on. Select a module to control.' : 'Sequencer control on. This input is reserved for sequencer control.' : 'Sequencer control off. MIDI returns to the Keyboard interface.'; });
  deviceSelect.addEventListener('change', () => { focus?.clearHeld(); if (deviceId) releaseDevice(deviceId); deviceId = deviceSelect.value; updateAvailability(); deviceName = devices.find((d) => d.id === deviceId)?.name ?? ''; controller.cancel(); controller.resetHeld(); renderMap(); persist(); prompt(); });
  function selectTarget(id, presentation = {}) {
    if (!targets().some((item) => item.id === id)) return;
    if (target !== id || controller.learning !== undefined) { focus?.clearHeld(); controller.cancel(); controller.resetHeld(); }
    target = id; targetSelect.value = id; focus?.select(id, presentation); renderAssignments(); renderMap(); prompt();
  }
  targetSelect.addEventListener('change', () => selectTarget(targetSelect.value));
  focus?.bindSelect(selectTarget);
  const assignmentPanel = make('div'); assignmentPanel.className = 'midi-map-grid module-assignments';
  function renderAssignments() {
    if (!focus) return;
    assignmentPanel.replaceChildren();
    for (let i = 0; i < 16; i++) {
      const row = make('div'); const label = make('label', i < 8 ? 'Pad ' + (i + 1) : 'Knob ' + (i - 7));
      const assignment = make('select'); assignment.id = 'module-assignment-' + i; label.htmlFor = assignment.id;
      const empty = make('option', 'Unassigned'); empty.value = '';
      assignment.append(empty, ...focus.options(target, i).map(({ id, label }) => { const option = make('option', label); option.value = id; return option; }));
      assignment.value = focus.assigned(target, i);
      assignment.addEventListener('change', () => { controller.resetHeld(); focus.assign(target, i, assignment.value); prompt(); });
      row.append(label, assignment); assignmentPanel.append(row);
    }
  }
  if (!globalThis.navigator?.requestMIDIAccess) status.textContent = 'Web MIDI is unavailable in this browser. Connect the controller in a browser with Web MIDI support.';
  if (focus) {
    const automatic = learnButton('Automatic assignments for this module', () => { focus.automatic(target); renderAssignments(); });
    const hardware = make('details'); hardware.className = 'controller-hardware'; hardware.append(make('summary', 'Hardware setup · learn pads and knobs'), actions, monitor, grid);
    panel.append(explanation, controls, status, automatic, assignmentPanel, hardware);
  } else panel.append(explanation, controls, actions, status, monitor, grid);
  container.append(panel);
  const openPanel = () => { panel.open = true; panel.scrollIntoView({ block: 'start' }); };
  focus?.bindSettings?.(openPanel);
  updateAvailability();
  function refreshTargets() {
    const list = targets(); const key = JSON.stringify(list);
    if (targetSelect.dataset.list === key) return;
    targetSelect.dataset.list = key;
    targetSelect.replaceChildren(...list.map(({ id, name }) => { const option = make('option', name); option.value = id; return option; }));
    if (!list.some((item) => item.id === target)) { target = list.some((item) => item.id === 'original') ? 'original' : list[0]?.id || ''; focus?.clearHeld(); controller.cancel(); controller.resetHeld(); renderMap(); status.textContent = focus ? 'Module removed; controller moved to the first available module.' : 'Target removed; controlling the original sequencer.'; }
    targetSelect.value = target; focus?.select(target); renderAssignments();
  }
  refreshTargets(); renderMap();
  return {
    panel, refreshTargets,
    positionOverlay() { focus?.positionOverlay?.(); },
    toggleOverlay() { if (deviceId && enabled.checked && focus) focus.toggleOverlay(); else openPanel(); },
    devices(inputs) {
      devices = [...inputs];
      const previous = deviceId;
      if (!devices.some((d) => d.id === deviceId)) deviceId = devices.find((d) => deviceName ? d.name === deviceName : /lpd8/i.test(d.name ?? ''))?.id ?? '';
      if (previous !== deviceId) { focus?.clearHeld(); controller.cancel(); controller.resetHeld(); renderMap(); }
      updateAvailability();
      if (deviceId) deviceName = devices.find((d) => d.id === deviceId).name;
      const empty = make('option', deviceName && !deviceId ? deviceName + ' · disconnected' : 'Choose controller'); empty.value = '';
      deviceSelect.replaceChildren(empty, ...devices.map((d) => { const option = make('option', d.name || 'MIDI input'); option.value = d.id; return option; })); deviceSelect.value = deviceId;
      status.textContent = deviceId ? deviceName + ' connected. ' + (controller.bindings.some(Boolean) ? 'Mapping ready.' : 'Use Learn all to map its current program.') : 'Controller not detected. Connect MIDI and select your LPD8.';
      if (deviceId && enabled.checked) releaseDevice(deviceId);
    },
    receive(data, device) {
      if (!enabled.checked || !deviceId || device !== deviceId) return false;
      monitor.textContent = 'Received: ' + [...data].map((v) => v.toString(16).padStart(2, '0')).join(' ').toUpperCase();
      if ((data[0] & 240) === 192) status.textContent = 'Program Change received. Switch the pads to NOTE mode, then learn them.';
      controller.receive(data); return true;
    },
    resetHeld() { controller.resetHeld(); focus?.clearHeld(); },
  };
}
