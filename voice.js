import { setupRackEditors } from './rack-editors.js';
import { sequenceTone } from './rack-colors.js';
import { setupOrbitPanel } from './orbit-panel.js';
import { rackCablePoint } from './rack-geometry.js';
import { sequenceRuntime, createPatternLibrary } from './sequence-patterns.js';
import { setupInstrumentRack } from './instrument-rack.js';
import { setupModuleController } from './module-controller.js';
import { setupSequencerMidi } from './sequencer-midi.js';
import { setupInstanceRack } from './instance-rack.js';
import { availableTypes, baseJack, instancePorts, readInstances } from './module-instances.js';
import { encodePatchFile, decodePatchFile } from './patch-file.js';
import { playableNotes, pointerNotes } from './play-keyboard.js';
import { createVoiceEngine, noteHz } from './voice-audio.js';
import { cutoffHz, modulationDefaults } from './modulation.js';
import { resolveCables, sourcesAt, toggleCable } from './free-routing.js';
import { setupRackLayout } from './rack-layout.js';
import { chooseHeld, keyboardDefaults, keyboardGate, parseMidi } from './keyboard-controller.js';
import { scopeWindowMs, sourceDefaults } from './source-tools.js';
import { drawScope } from './scope-view.js';
import { isCableDoubleTap, setupRackDocks } from './rack-docks.js';
import { controlReadout, lfoRateReadout, scopeTimeReadout } from './readouts.js';
import { capturePatch, readSavedPatches, restorePatch, saveNamedPatch } from './patch-state.js';
import { rhythmDefaults } from './rhythm-core.js';
import { accentDefaults } from './accent-core.js';
import { setupRhythmControls } from './rhythm-ui.js';
import { jackRange, setupJackMeters } from './jack-meter.js';
import { activeRoutes, SILENT_LIMIT_MS } from './activity.js';
import { addModuleDetails } from './module-details.js';
import { lessonExamples, lessonModuleOrder, orderModules, populateExamples } from './examples.js';

const get = (id) => document.getElementById(id);
const lesson = new URLSearchParams(window.location.search).get('lesson');
const orbital = lesson === '7';
const evolving = orbital || lesson === '6';
const sequencing = evolving || lesson === '5';
const studio = sequencing || lesson === '4';
const modulation = studio || lesson === '3';
const notes = playableNotes;
const byKey = new Map(notes.map(([key, , note]) => [key, note]));
const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (note) => noteNames[note % 12] + (Math.floor(note / 12) - 1);
const outlets = {
  pitchOut: ['pitch', 'Keyboard Pitch out'], gateOut: ['gate', 'Keyboard Gate out'],
  oscOut: ['audio', 'Oscillator Audio out'], envOut: ['cv', 'Envelope out'],
  vcaOut: ['audio', 'VCA Audio out'],
};
const inlets = {
  pitchIn: ['pitch', 'Oscillator Pitch in', ['pitchOut']],
  gateIn: ['gate', 'Envelope Gate in', ['gateOut']],
  vcaIn: ['audio', 'VCA Audio in', ['oscOut']],
  cvIn: ['cv', 'VCA CV in', ['envOut']],
  audioIn: ['audio', 'Output Audio in', ['oscOut', 'vcaOut']],
};
const envelopeControls = [
  ['attack', 'Attack time', 5, 2000, 10, 'ms'],
  ['decay', 'Decay time', 5, 2000, 180, 'ms'],
  ['sustain', 'Sustain level', 0, 100, 65, '%'],
  ['release', 'Release time', 5, 3000, 300, 'ms'],
];
const defaults = { note: null, lastNote: 57, octave: 0, level: 25, muted: false, waveform: 'sine', transpose: 0 };
for (const [key, , , , value] of envelopeControls) defaults[key] = value;

const bay = get('voice-bay');
const cables = get('voice-cables');
if (modulation) {
  Object.assign(defaults, modulationDefaults, { waveform: 'sawtooth' });
  Object.assign(outlets, {
    filterOut: ['audio', 'Filter Audio out'],
    lfoOut: ['cv', 'LFO CV out'],
    attenOut: ['cv', 'Attenuator CV out'],
    envInvOut: ['cv', 'Envelope Inverted out'],
  });
  Object.assign(inlets, {
    filterIn: ['audio', 'Filter Audio in', ['oscOut']],
    cutoffIn: ['cv', 'Filter Cutoff CV in', ['lfoOut', 'attenOut', 'envOut']],
    attenIn: ['cv', 'Attenuator CV in', ['lfoOut', 'envOut']],
    modPitchIn: ['cv', 'Oscillator Pitch CV in', ['lfoOut', 'attenOut']],
  });
  inlets.vcaIn[2].push('filterOut');
  inlets.audioIn[2].push('filterOut');

  document.title = studio ? 'Patchlab | See and mix' : 'Patchlab | Shape and move';
  document.querySelector('.lesson-nav [aria-current]').removeAttribute('aria-current');
  document.querySelector('.lesson-nav a[href="voice.html?lesson=' + lesson + '"]').setAttribute('aria-current', 'page');
  get('voice-eyebrow').innerHTML = '<span class="lesson-index">03</span> SHAPE THE TONE <span class="eyebrow-line"></span> PATCH 03';
  get('voice-title').innerHTML = 'Shape and <em>move.</em>';
  get('voice-description').textContent = 'Shape the harmonics with a low-pass filter, then use a slow oscillator to make the sound move.';
  get('voice-workbench').textContent = 'WORKBENCH / 03';
  get('voice-edition').textContent = '03 — FILTER + LFO + ATTENUATOR';
  get('voice-guide').replaceChildren(get('modulation-guide').content.cloneNode(true));

  const pitchJack = document.createElement('button');
  pitchJack.type = 'button';
  pitchJack.className = 'port';
  pitchJack.dataset.port = 'modPitchIn';
  pitchJack.textContent = 'Pitch CV in';
  bay.querySelector('.oscillator .port-strip').append(pitchJack);
  const invertedJack = document.createElement('button');
  invertedJack.type = 'button';
  invertedJack.className = 'port';
  invertedJack.dataset.port = 'envInvOut';
  invertedJack.textContent = 'Inverted out';
  bay.querySelector('.envelope-module .port-strip').append(invertedJack);
  bay.classList.add('modulation-bay');
  cables.before(get('modulation-modules').content.cloneNode(true));
  bay.querySelector('.envelope-module').before(bay.querySelector('.filter-module'));
}

if (studio) {
  Object.assign(defaults, keyboardDefaults, sourceDefaults);
  Object.assign(outlets, {
    bendOut: ['cv', 'Keyboard Bend out'],
    velocityOut: ['cv', 'Keyboard Velocity × Volume out'],
    controllerOut: ['cv', 'Keyboard Controller CV out'],
    mixOut: ['audio', 'Mixer Mix out'],
    noiseOut: ['audio', 'White noise out'],
    darkNoiseOut: ['audio', 'Dark noise out'],
    scopeThruA: ['signal', 'Scope Thru A'], scopeThruB: ['signal', 'Scope Thru B'],
  });
  Object.assign(inlets, {
    mixInA: ['audio', 'Mixer A in'], mixInB: ['audio', 'Mixer B in'], mixInC: ['audio', 'Mixer C in'], mixInD: ['audio', 'Mixer D in'],
    scopeInA: ['signal', 'Scope A in'], scopeInB: ['signal', 'Scope B in'],
  });
  get('voice-eyebrow').innerHTML = '<span class="lesson-index">04</span> MEASURE AND MIX <span class="eyebrow-line"></span> PATCH 04';
  get('voice-title').innerHTML = 'See and <em>mix.</em>';
  get('voice-description').textContent = 'Blend a pitched oscillator with white noise and look at the mix and envelope side by side.';
  get('voice-workbench').textContent = 'WORKBENCH / 04';
  get('voice-edition').textContent = '04 — SCOPE + MIXER + NOISE';
  get('voice-guide').replaceChildren(get('studio-guide').content.cloneNode(true));
  cables.before(get('studio-modules').content.cloneNode(true));
  bay.querySelector('.keys-module .module-controls').append(get('studio-keyboard').content.cloneNode(true));
  for (const [id, label] of [['bendOut', 'Bend out'], ['velocityOut', 'Velocity × Volume out'], ['controllerOut', 'Controller CV out']]) {
    const jack = document.createElement('button');
    jack.type = 'button';
    jack.className = 'port';
    jack.dataset.port = id;
    jack.textContent = label;
    bay.querySelector('.keys-module .port-strip').append(jack);
  }
}
if (sequencing) {
  Object.assign(defaults, rhythmDefaults);
  Object.assign(outlets, {
    clockOut: ['gate', 'Clock out'], seqPitchOut: ['pitch', 'Sequencer Pitch out'], seqGateOut: ['gate', 'Sequencer Gate out'],
  });
  inlets.seqClockIn = ['gate', 'Sequencer Clock in'];
  inlets.seqResetIn = ['gate', 'Sequencer Reset in'];
  document.title = 'Patchlab | Sequence a patch';
  get('voice-eyebrow').innerHTML = '<span class="lesson-index">05</span> BUILD A PATTERN <span class="eyebrow-line"></span> PATCH 05';
  get('voice-title').innerHTML = 'Sequence a <em>patch.</em>';
  get('voice-description').textContent = 'Build a repeating bassline with pitch and gate, then save your patch for another session.';
  get('voice-workbench').textContent = 'WORKBENCH / 05';
  get('voice-edition').textContent = '05 — CLOCK + SEQUENCER';
  get('voice-guide').replaceChildren(get('rhythm-guide').content.cloneNode(true));
  cables.before(get('rhythm-modules').content.cloneNode(true));
  bay.prepend(bay.querySelector('.sequencer-module'));
}
if (evolving) {
  Object.assign(defaults, accentDefaults);
  Object.assign(outlets, { dividerOut: ['gate', 'Clock Divider Divided out'], accentOut: ['audio', 'Accent Audio out'] });
  Object.assign(inlets, {
    dividerIn: ['gate', 'Clock Divider Clock in'],
    accentIn: ['audio', 'Accent Audio in'],
    accentTriggerIn: ['gate', 'Accent Trigger in'],
  });
  document.title = 'Patchlab | Build an evolving sequence';
  get('voice-eyebrow').innerHTML = '<span class="lesson-index">06</span> SHAPE A LIVE LOOP <span class="eyebrow-line"></span> PATCH 06';
  get('voice-title').innerHTML = 'Build an <em>evolving sequence.</em>';
  get('voice-description').textContent = 'Keep a bassline playing as you bring in a filter sweep and a slower noise accent.';
  get('voice-workbench').textContent = 'WORKBENCH / 06';
  get('voice-edition').textContent = '06 — CLOCK DIVIDER + ACCENT';
  get('voice-guide').replaceChildren(get('evolving-guide').content.cloneNode(true));
  cables.before(get('evolving-modules').content.cloneNode(true));
}
if (orbital) {
  document.title = 'Patchlab | Independent cycles';
  get('voice-eyebrow').textContent = '07 / INDEPENDENT TIMELINES';
  get('voice-title').textContent = 'Compose independent cycles.';
  get('voice-description').textContent = 'One clock, independent phrases. Keep sequencing outside sound instruments, then try a trigger-started internal phrase.';
  get('voice-workbench').textContent = 'WORKBENCH / 07';
  get('voice-edition').textContent = '07 — ORBITAL SEQUENCING + PHRASES';
  get('voice-guide').innerHTML = '<section class="lesson"><h2>One clock, several cycles</h2><ol><li>Load a Phase 07 example, Enable audio and Play clock.</li><li>Open Orbits. Each ring follows a real sequencer. Tap a ring to edit that track.</li><li>Compare 5 versus 7 steps, then a 128-step phrase at four pulses per beat: eight bars of 4/4.</li><li>In the triggered-phrase demo, tap a key. One trigger starts a whole phrase. Choose Restart or Ignore while playing.</li></ol><p>Sound instruments normally contain oscillators, envelopes and VCAs. Clocks and looping sequencers remain outside; Phrase is an optional triggered component inside a sound group.</p></section>';
}
if (modulation) get('rack-start').before(get('patch-shelf-template').content.cloneNode(true));
const audio = get('voice-audio');
const held = new Map();
const ports = new Map([...bay.querySelectorAll('[data-port]')].map((button) => [button.dataset.port, button]));
const state = { ...defaults, patch: {}, instances: [], instruments: [], sequenceRuntime: {} };
const patternLibrary = sequencing ? createPatternLibrary(localStorage) : null;
if (patternLibrary) {
  state.patternLibrary = patternLibrary.entries;
  patternLibrary.subscribe(() => { state.patternLibrary = patternLibrary.entries; });
}
let selected = null;
let engine;
let audioEnabled = false;
let engineReady = false;
let activity = { patch: {}, modules: new Set(), outputs: new Set() };
let silentDeadline = 0;
let silentTimer;
let scopeDisplayKey;
let timedOut = false;
let changingContext = false;
let rhythmControls;
let sequencerMidi;
let previousRhythmStep = -1;
let frame = 0;
let freeCables = [];
const undoStack = [];
let connections = [];
let docks;
const rackEditors = modulation ? setupRackEditors({toolbar:()=>docks?.toolbar,onChange:queueCables}) : null;
let instanceRack;
let instrumentRack;
let orbitPanel;
let syncingInstances = false;
let jackMeters;
let inspectedJacks = [];
let inspectionAnchor;
let cableFocus = null;
let frontCables;
let cableFrame = 0;
let lastTouch;
let retriggerTimer;
let lastNoteDevice;
let midiAccess;
let requestMidi;
let midiPending = false;
const midiInputs = new Map();
const sustainDevices = new Set();
const legatoDevices = new Set();
const rackPorts = new Map([...ports].map(([id, button]) => [id, {
  direction: outlets[id] ? 'out' : 'in',
  kind: (outlets[id] ?? inlets[id])[0],
  module: button.closest('.module').querySelector('h3').textContent,
}]));
const portLabel = (id) => (outlets[id] ?? inlets[id])?.[1] ?? id;
const crossTypeEffect = {
  pitchIn: 'Changes pitch at 1 volt per octave.',
  modPitchIn: 'Modulates pitch at 200 cents per unit.',
  cutoffIn: 'Modulates cutoff at 1200 cents per unit.',
  gateIn: 'A signal level of 0.5 or higher opens the gate.',
  cvIn: 'Controls gain. Negative values close the VCA.',
  audioIn: 'Plays through the output; steady voltage is blocked.',
  vcaIn: 'Enters the VCA as a waveform.',
  filterIn: 'Enters the filter as a waveform.',
  attenIn: 'Scales the waveform by the Depth setting.',
  mixInA: 'Scales the waveform and adds it to the mix.',
  mixInB: 'Scales the waveform and adds it to the mix.',
  mixInC: 'Scales the waveform and adds it to the mix.',
  mixInD: 'Scales the waveform and adds it to the mix.',
  scopeInA: 'Shows the waveform on channel A.',
  scopeInB: 'Shows the waveform on channel B.',
  seqClockIn: 'A rising threshold crossing advances the sequencer.',
  seqResetIn: 'A rising threshold crossing resets the sequencer.',
};

function announce(message) {
  get('voice-status').textContent = message;
}

function queueCables() {
  if (!cableFrame) cableFrame = requestAnimationFrame(() => {
    cableFrame = 0;
    drawCables();
  });
}

function drawCables() {
  const rack = (modulation ? cables.parentElement : bay).getBoundingClientRect();
  if(frontCables){frontCables.style.left=rack.left+'px';frontCables.style.top=rack.top+'px';frontCables.style.width=rack.width+'px';frontCables.style.height=rack.height+'px';}
  const drawn = modulation ? connections : Object.entries(state.patch).map(([input, source]) => ({ source, input }));
  const point = (id, index) => {
    const cord=drawn[index];
    const button = instrumentRack?.cableAnchor(id, cord.source===id ? cord.input : cord.source) || ports.get(id);
    const sharing = drawn.flatMap((cord, i) => cord.source === id || cord.input === id ? [i] : []);
    const offset = (sharing.indexOf(index) - (sharing.length - 1) / 2) * 3;
    const [x, y] = rackCablePoint(button, docks?.panels, offset);
    return [x - rack.left, y - rack.top];
  };
  const paths = drawn.flatMap(({ input, source: output, status, crossType }, index) => {
    const [x1, y1] = point(output, index);
    const [x2, y2] = point(input, index);
    const dip = 26 + index % 8 * 7;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'voice-cable');
    path.dataset.kind = rackPorts.get(output).kind;
    path.dataset.cord = JSON.stringify([output, input]);
    if ((status && status !== 'active')) path.dataset.inert = 'true';
    if (crossType) path.dataset.crossType = 'true';
    path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1 + dip) + ', ' + x2 + ' ' + (y2 + dip) + ', ' + x2 + ' ' + y2);
    if (!modulation) return [path];
    const hit = path.cloneNode();
    hit.setAttribute('class', 'cable-hit');
    hit.dataset.cord = JSON.stringify([output, input]);
    return [hit, path];
  });
  cables.replaceChildren(...paths);
  renderCableFocus();
  jackMeters?.position();
  sequencerMidi?.positionOverlay();
}

function renderCableFocus() {
  if (!frontCables) return;
  const highlighted = cableFocus?.jack
    ? connections.filter(({ source, input }) => source === cableFocus.jack || input === cableFocus.jack)
      .map(({ source, input }) => JSON.stringify([source, input]))
    : cableFocus?.cord ? [cableFocus.cord] : [];
  const paths = [...cables.querySelectorAll('.voice-cable')].filter((path) => highlighted.includes(path.dataset.cord));
  frontCables.replaceChildren(...paths.map((path) => path.cloneNode()));
}

function inspectJack(id) {
  const { direction, kind } = rackPorts.get(id);
  jackMeters.inspect({ id, direction, label: portLabel(id), range: jackRange(id, kind), anchor: inspectionAnchor?.id === id ? inspectionAnchor.anchor : ports.get(id) });
  updateJackReading();
}

function simulationRunning() {
  return engineReady && activity.modules.size > 0 && engine.context.state === 'running';
}

function syncJackProbes() {
  if (!engineReady) return;
  engine.inspectJacks(inspectedJacks.filter(({ id, direction }) =>
    direction === 'out' ? activity.outputs.has(id) : Boolean(activity.patch[id])));
}

function updateJackReading() {
  jackMeters?.update((id) => simulationRunning() && (activity.outputs.has(id) || activity.patch[id])
    ? engine.readJack(id) : undefined, performance.now());
}

function renderPatch() {
  sequencerMidi?.refreshTargets();
  docks?.showSelection(selected ? portLabel(selected) : '');
  if (modulation) get('rack-start').hidden = freeCables.length > 0;
  docks?.toolbar.querySelector('[data-rack-undo]').setAttribute('aria-disabled', !undoStack.length);
  for (const [id, button] of ports) {
    const count = modulation
      ? connections.filter(({ source, input }) => source === id || input === id).length
      : Number(inlets[id] ? Boolean(state.patch[id]) : Object.values(state.patch).includes(id));
    button.dataset.linked = count > 0;

    button.dataset.count = count;
    const mate = selected && rackPorts.get(selected);
    const port = rackPorts.get(id);
    button.dataset.match = Boolean(mate && mate.direction !== port.direction && (mate.kind === port.kind || [mate.kind, port.kind].includes('signal')));
    button.setAttribute('aria-pressed', id === selected || (!modulation && Boolean(inlets[id]) && count > 0));
    const label = portLabel(id);
    const cables = count ? ', ' + count + (count === 1 ? ' cable' : ' cables') : '';
    button.setAttribute('aria-label', label + cables);
  }
  instrumentRack?.syncPorts();
  if(rackEditors){for(const id of ['original',...state.instances.filter(m=>['Sequencer','Phrase'].includes(m.type)).map(m=>m.id)]){const tone=sequenceTone(state,id,rackPorts);rackEditors.theme('sequence:'+id,tone);const module=id==='original'?ports.get('seqClockIn')?.closest('.module'):ports.get(id+':seqPitchOut')?.closest('.module');if(module){rackEditors.get('sequence:'+id)?.setTitle('Edit '+module.querySelector('h3').textContent);module.style.setProperty('--rack-tint',tone.surface);module.style.setProperty('--rack-color',tone.ink);module.dataset.sequenceColored='';}}}
  drawCables();
}

function renderSignals() {
  for (const key of get('piano').children) {
    const note = Number(key.dataset.note) + (state.octave ?? 0) * 12;
    key.dataset.active = note === state.note;
    key.dataset.held = [...held.values()].some((entry) => entry.note === note);
    if (key.firstChild.textContent !== noteName(note)) {
      key.firstChild.textContent = noteName(note);
      key.setAttribute('aria-label', 'Play ' + noteName(note) + ' (' + key.dataset.shortcut + ')');
    }
  }
  get('octave-readout').textContent = 'Octave ' + (state.octave > 0 ? '+' : '') + state.octave;
  get('octave-down').disabled = state.octave <= -2;
  get('octave-up').disabled = state.octave >= 2;
  get('keyboard-readout').textContent = 'Last ' + noteName(state.lastNote) + ' · Gate ' + (keyboardGate(state) ? 'high' : 'low');
  const frequency = noteHz((state.patch.pitchIn ? state.lastNote + 57 - (state.referenceNote ?? 57) : 57) + state.transpose);
  const sequencedPitch = state.patch.pitchIn === 'seqPitchOut';
  const customPitch = modulation && sourcesAt(state.patch.pitchIn).some((source) => source !== 'pitchOut');
  const pitchLabel = customPitch || state.patch.modPitchIn ? 'base pitch + CV' : state.patch.pitchIn ? 'keyboard pitch' : 'fixed pitch';
  const step = engine?.rhythmStep() ?? -1;
  const base = sequencedPitch ? noteHz(57 + (state.steps[step]?.pitch ?? 0) + state.transpose) : customPitch ? noteHz(57 + state.transpose) : frequency;
  get('voice-frequency').textContent = Number(base.toFixed(2)) + ' Hz · ' + (sequencedPitch ? 'sequencer pitch' : pitchLabel);
}

function renderAudio() {
  const ready = audioEnabled;
  const action = ready ? 'Audio on · turn off' : 'Enable audio';
  audio.textContent = action;
  audio.dataset.state = ready ? 'ready' : 'off';
  audio.setAttribute('aria-pressed', Boolean(ready));
  const indicator = docks?.toolbar.querySelector('[data-simulation]');
  if (indicator) {
    const running = simulationRunning();
    indicator.dataset.state = timedOut ? 'paused' : running ? 'running' : 'idle';
    const label = timedOut ? 'Paused · enable audio' : running ? 'Simulation running' : 'Simulation idle';
    if (indicator.title !== label) {
      indicator.title = label;
      indicator.firstElementChild.textContent = label;
    }
  }
  const shortcut = docks?.toolbar.querySelector('[data-rack-audio]');
  if (shortcut) {
    shortcut.textContent = ready ? 'Audio on' : action;
    shortcut.title = ready ? 'Turn audio off' : 'Turn audio on';
    shortcut.setAttribute('aria-pressed', Boolean(ready));
    shortcut.dataset.active = Boolean(ready);
  }
}

function updateMeter() {
  updateJackReading();
  const running = simulationRunning();
  const livePatch = running ? activity.patch : {};
  if (running) engine.sampleGate();
  if (modulation) {
    const display = get('envelope-gate');
    const gate = running && engine.gateIsHigh() ? 'Gate high' : 'Gate low';
    if (display.textContent !== gate) display.textContent = gate;
  }
  const value = running && activity.modules.has('ADSR Envelope') ? engine.envelopeLevel() : 0;
  get('envelope-meter').value = value;
  const gainSources = sourcesAt(livePatch.cvIn);
  const cv = !gainSources.length ? 'Closed · no CV' : livePatch.cvIn === 'envOut' ? Math.round(value * 100) + '% gain' : 'Gain controlled by ' + gainSources.map(portLabel).join(' + ');
  const display = get('vca-readout');
  if (display.textContent !== cv) display.textContent = cv;
  if (studio) {
    const canvas = get('scope-screen');
    const scale = get('scope-scale');
    const range = get('scope-range-readout');
    const timeLabel = scopeTimeReadout(scopeWindowMs(state.scopeWindow, engine?.context.sampleRate));
    const rangeLabel = 'Vertical range ±' + state.scopeRange + ' signal units';
    if (scale.textContent !== timeLabel) scale.textContent = timeLabel;
    if (range.textContent !== rangeLabel) range.textContent = rangeLabel;
    const active = ['scopeInA', 'scopeInB'].map((id) => Boolean(livePatch[id]));
    const labels = ['scopeInA', 'scopeInB'].map((id, index) => (index === 0 ? 'A' : 'B') + ' · ' + (state.patch[id] ? sourcesAt(state.patch[id]).map(portLabel).join(' + ') : 'Unpatched'));
    const readout = get('scope-readout');
    const text = labels.join(' / ');
    if (readout.textContent !== text) readout.textContent = text;
    if (!canvas.closest('.module-collapsed, [hidden]')) {
      const traces = running && active.some(Boolean) ? engine.readScope(state.scopeWindow) : null;
      const key = state.scopeRange + ':' + active.join(',');
      if (traces || scopeDisplayKey !== key) drawScope(canvas, traces, active, state.scopeRange);
      scopeDisplayKey = key;
    }
  }
  if (sequencing) {
    const step = running && activity.modules.has('Sequencer') ? engine.rhythmStep() : -1;
    rhythmControls.update(step);
    const play = docks?.toolbar.querySelector('[data-rack-play]');
    if (play) {
      const action = state.playing ? 'Stop clock' : 'Play clock';
      if (play.textContent !== action) play.textContent = action;
      play.setAttribute('aria-pressed', state.playing);
      play.dataset.active = state.playing;
    }
    if (step !== previousRhythmStep && state.patch.pitchIn === 'seqPitchOut') renderSignals();
    previousRhythmStep = step;
  }
  instanceRack?.update();
  orbitPanel?.update();
  frame = running ? requestAnimationFrame(updateMeter) : 0;
}

function applySettings() {
  if (engineReady) engine.apply({ ...state, patch: activity.patch, activeModules: activity.modules });
  renderSignals();
  if (!frame) updateMeter();
  if (engine && activity.modules.size && engine.context.state !== 'running') reconcileContext();
}

function sequenceCanAdvance(id = 'original') {
  const module = id === 'original' ? 'Sequencer' : id;
  if (!simulationRunning() || !activity.modules.has(module)) return false;
  const visited = new Set();
  function sourceCanAdvance(source) {
    if (visited.has(source)) return false;
    visited.add(source);
    const port = rackPorts.get(source), type = port?.type || port?.module;
    if (type === 'Clock') return state.playing;
    if (type === 'Clock Divider') {
      const input = source.includes(':') ? port.module + ':dividerIn' : 'dividerIn';
      return sourcesAt(state.patch[input]).some(sourceCanAdvance);
    }
    return Boolean(port);
  }
  return sourcesAt(state.patch[id === 'original' ? 'seqClockIn' : id + ':seqClockIn']).some(sourceCanAdvance);
}

function refreshRouting() {
  if (syncingInstances) return;
  const visual = studio && !document.hidden && !get('scope-screen').closest('.module-collapsed, [hidden]');
  if (!audioEnabled && silentDeadline && Date.now() >= silentDeadline) timedOut = true;
  activity = activeRoutes(state.patch, rackPorts, { audio: audioEnabled, visual: visual && !timedOut, visualInputs: !document.hidden && !timedOut ? instanceRack?.visualInputs() ?? [] : [] });
  const wantsRun = activity.modules.size > 0;
  if (!audioEnabled && wantsRun && simulationRunning() && !silentDeadline) {
    silentDeadline = Date.now() + SILENT_LIMIT_MS;
    silentTimer = setTimeout(refreshRouting, SILENT_LIMIT_MS);
  } else if (!wantsRun || audioEnabled) {
    clearTimeout(silentTimer);
    silentDeadline = 0;
  }
  if (!wantsRun && frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  applySettings();
  syncJackProbes();
  renderAudio();
  reconcileContext();
}

async function reconcileContext() {
  if (changingContext) return;
  const wanted = activity.modules.size > 0;
  if ((!engine && !wanted) || (engineReady && engine.context.state === (wanted ? 'running' : 'suspended'))) return;
  changingContext = true;
  try {
    if (!engine) engine = createVoiceEngine({ modulation, freeRouting: modulation, studio,
      onSequencePattern(id, signal) {
        if (id === 'original') rhythmControls?.receive(signal);
        else instanceRack?.receiveSequence(id, signal);
      },
    });
    if (wanted) {
      await engine.context.resume();
      if (modulation && !engineReady) {
        try { await engine.prepareWorklets({ sequencing, evolving }); }
        catch {
          if (sequencing) announce('The browser could not start the clock and sequencer. Keyboard patches are still available.');
        }
      }
      engineReady = true;
    } else await engine.context.suspend();
  } catch {
    announce(wanted ? 'Simulation could not start. Try Enable audio.' : 'Simulation routes are disconnected.');
    return;
  } finally {
    changingContext = false;
  }
  if (wanted !== (activity.modules.size > 0) || engine.context.state === 'running') {
    applySettings();
    syncJackProbes();
    if (!audioEnabled && simulationRunning() && !silentDeadline) {
      silentDeadline = Date.now() + SILENT_LIMIT_MS;
      silentTimer = setTimeout(refreshRouting, SILENT_LIMIT_MS);
    }
    if (wanted !== (activity.modules.size > 0)) reconcileContext();
  }
  renderAudio();
}

function describeCable({ source, input, status, crossType }) {
  if (status === 'direction') return 'Inactive · same jack direction.';
  if (status === 'feedback') return 'Inactive · feedback loop.';
  return crossType ? crossTypeEffect[baseJack(input)] ?? 'Signal routed across types; the destination uses its voltage.' : 'Signal routed.';
}

function refreshFreePatch() {
  instrumentRack?.sync();
  lastTouch = undefined;
  ({ patch: state.patch, connections } = resolveCables(freeCables, rackPorts));
  refreshRouting();
  renderPatch();
  get('cable-count').textContent = connections.length;
  get('cable-list').replaceChildren(...connections.map((connection, index) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    const names = portLabel(connection.source) + (connection.status === 'direction' ? ' ↔ ' : ' → ') + portLabel(connection.input);
    label.textContent = names;
    const description = document.createElement('small');
    description.textContent = describeCable(connection);
    label.append(description);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'reset';
    remove.textContent = 'Unplug';
    remove.setAttribute('aria-label', 'Unplug ' + names);
    remove.addEventListener('click', () => {
      unplug(connection.source, connection.input);
      const list = get('cable-list');
      const next = list.children[Math.min(index, list.children.length - 1)]?.querySelector('button');
      (next ?? get('cable-panel').querySelector('summary')).focus();
    });
    item.append(label, remove);
    return item;
  }));
}

function rememberPatch(cablesOnly = false) {
  undoStack.push({ snapshot: capturePatch(state, defaults, freeCables), cablesOnly });
  if (undoStack.length > 24) undoStack.shift();
}

function applySnapshot(snapshot, { muteAudio = false } = {}) {
  readInstances(snapshot.instances, availableTypes(Number(lesson)));
  const { settings, cables, instances, instruments, patterns } = restorePatch(snapshot, defaults, rackPorts);
  patternLibrary?.merge(patterns);
  if (muteAudio) audioEnabled = false;
  held.clear();
  sustainDevices.clear();
  legatoDevices.clear();
  clearTimeout(retriggerTimer);
  const nextEpoch = (state.transportEpoch ?? 0) + 1;
  Object.assign(state, settings, { instances, instruments, sequenceRuntime: {} });
  syncingInstances = true;
  try { instanceRack?.sync(); } finally { syncingInstances = false; }
  state.lastNote += (state.octave ?? 0) * 12;
  lastNoteDevice = undefined;
  if (sequencing) state.transportEpoch = nextEpoch;
  engine?.resetEnvelope();
  selected = null;
  freeCables = cables;
  syncSliders.forEach((sync) => sync());
  syncOutput();
  if (studio) syncStudio();
  rhythmControls?.sync();
  refreshFreePatch();
}

function unplug(source, input) {
  rememberPatch(true);
  freeCables = freeCables.filter(([from, to]) => from !== source || to !== input);
  refreshFreePatch();
  announce('Cable unplugged.');
}

function unplugHit(hit) {
  const [source, input] = JSON.parse(hit.dataset.cord);
  unplug(source, input);
}

if (modulation) {
  cables.addEventListener('click', (event) => {
    const hit = event.target.closest('.cable-hit');
    if (!hit) return;
    cableFocus = { cord: hit.dataset.cord };
    renderCableFocus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.port, .rack-jack-meter, .rack-quick-controls, .rack-patch-selection')) jackMeters.dismiss();
    if (!cableFocus || event.target.closest('.port, .cable-hit, .rack-jack-meter')) return;
    cableFocus = null;
    renderCableFocus();
  });
  cables.addEventListener('dblclick', (event) => {
    const hit = event.target.closest('.cable-hit');
    if (hit) unplugHit(hit);
  });
  cables.addEventListener('pointerup', (event) => {
    const hit = event.target.closest('.cable-hit');
    if (!hit || event.pointerType === 'mouse' || !event.isPrimary) return;
    const tap = { cord: hit.dataset.cord, time: event.timeStamp, x: event.clientX, y: event.clientY };
    if (isCableDoubleTap(lastTouch, tap)) {
      unplugHit(hit);
    } else {
      lastTouch = tap;
    }
  });
}

function editFreePatch(id) {
  cableFocus = { jack: id };
  inspectJack(id);
  if (!selected || selected === id) {
    selected = selected ? null : id;
    renderPatch();
    announce(selected ? portLabel(id) + ' selected. Choose any other jack.' : 'Cable selection cleared.');
    return;
  }
  const first = selected;
  selected = null;
  rememberPatch(true);
  freeCables = toggleCable(freeCables, first, id, rackPorts);
  refreshFreePatch();
  const cord = connections.find(({ source, input }) => (source === first && input === id) || (source === id && input === first));
  announce(cord ? describeCable(cord) : 'Cable unplugged.');
}

function editPatch(id) {
  if (modulation) return editFreePatch(id);
  if (outlets[id]) {
    selected = selected === id ? null : id;
    announce(selected ? outlets[id][1] + ' selected. Choose a compatible input.' : 'Cable selection cleared.');
  } else if (selected) {
    if (!inlets[id][2].includes(selected)) {
      announce(inlets[id][1] + ' cannot accept ' + outlets[selected][1] + '. Choose a compatible input or press Escape.');
      return;
    }
    state.patch[id] = selected;
    announce(outlets[selected][1] + ' → ' + inlets[id][1] + ' connected.');
    selected = null;
  } else if (state.patch[id]) {
    delete state.patch[id];
    announce(inlets[id][1] + ' disconnected.');
  } else {
    announce('Select an output first, then choose ' + inlets[id][1] + '.');
  }
  refreshRouting();
  renderPatch();
}

function bindPort(id, button) {
  button.dataset.kind = (outlets[id] ?? inlets[id])[0];
  button.addEventListener('click', (event) => {
    if (modulation && id === 'audioIn' && !selected) {
      cableFocus = { jack: id };
      inspectJack(id);
      renderCableFocus();
      docks.output.togglePanel(event);
      return;
    }
    editPatch(id);
  });
  if (modulation) {
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' && jackMeters.focusPin(id)) event.preventDefault();
    });
  }
}
for (const [id, button] of ports) bindPort(id, button);

function syncHeldNotes() {
  const active = chooseHeld(held, state.priority ?? 'last');
  state.note = active?.note ?? null;
  if (active) {
    state.lastNote = active.note;
    lastNoteDevice = active.device;
    if (studio) state.velocity = active.velocity;
  }
  if (!active) {
    clearTimeout(retriggerTimer);
    state.retriggering = false;
  }
  applySettings();
}

function press(token, note, velocity = (state.keyVelocity ?? 80) / 100, device) {
  if (!simulationRunning() || !activity.modules.has('Keyboard')) return;
  if (held.has(token) && !device && held.get(token).note === note) return;
  const wasHeld = held.size > 0;
  held.delete(token);
  held.set(token, { note, velocity, device });
  if (wasHeld && state.retrigger && !legatoDevices.has(device)) {
    clearTimeout(retriggerTimer);
    state.retriggering = true;
    retriggerTimer = setTimeout(() => {
      state.retriggering = false;
      syncHeldNotes();
    }, 12);
  }
  syncHeldNotes();
}

function release(token) {
  if (held.delete(token)) syncHeldNotes();
}

function releaseAll(device) {
  let changed = false;
  for (const [token, key] of held) {
    if (key.device === device) {
      held.delete(token);
      changed = true;
    }
  }
  if (changed) syncHeldNotes();
}

function localNote(note) {
  return note + (state.octave ?? 0) * 12;
}

for (const [key, name, note, position, black] of notes) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'note-key' + (black ? ' black-key' : '');
  button.style.setProperty('--key-position', position);
  button.dataset.note = note;
  button.dataset.shortcut = key.toUpperCase();
  button.setAttribute('aria-label', 'Play ' + name + ' (' + key.toUpperCase() + ')');
  const shortcut = document.createElement('kbd');
  shortcut.textContent = key.toUpperCase();
  button.append(name, shortcut);
  button.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    press(event.code || event.key, localNote(note));
  });
  button.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    const token = Symbol();
    press(token, localNote(note));
    setTimeout(() => release(token), 200);
  });
  get('piano').append(button);
}

const piano = get('piano');
const fingers = pointerNotes((token, note) => press(token, localNote(note)), release);
function hitKey(element) {
  const key = element?.closest?.('.note-key');
  return key && piano.contains(key) ? Number(key.dataset.note) : null;
}
piano.addEventListener('pointerdown', (event) => {
  const note = hitKey(event.target);
  if (event.button !== 0 || note === null) return;
  event.preventDefault();
  piano.setPointerCapture(event.pointerId);
  fingers.start(event.pointerId, note);
});
piano.addEventListener('pointermove', (event) => {
  fingers.move(event.pointerId, hitKey(document.elementFromPoint(event.clientX, event.clientY)));
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  piano.addEventListener(type, (event) => fingers.end(event.pointerId));
}
function setOctave(value) {
  const next = Math.max(-2, Math.min(2, value));
  const shift = (next - state.octave) * 12;
  state.octave = next;
  for (const key of held.values()) if (key.device === undefined) key.note += shift;
  if (!held.size && lastNoteDevice === undefined) state.lastNote += shift;
  if (studio) get('octave').value = next;
  syncHeldNotes();
}
function releaseKeys() {
  fingers.clear();
  held.clear();
  sustainDevices.clear();
  legatoDevices.clear();
  syncHeldNotes();
}
get('octave-down').addEventListener('click', () => setOctave(state.octave - 1));
get('octave-up').addEventListener('click', () => setOctave(state.octave + 1));
get('release-keys').addEventListener('click', releaseKeys);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && event.target.closest?.('[data-rack-editor]')) return;
  if (event.key === 'Escape' && selected) {
    selected = null;
    renderPatch();
    announce('Cable selection cleared.');
    return;
  }
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
  if (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'x') {
    event.preventDefault();
    setOctave(state.octave + (event.key.toLowerCase() === 'x' ? 1 : -1));
    return;
  }
  const note = byKey.get(event.key.toLowerCase());
  if (note !== undefined) press(event.code || event.key.toLowerCase(), localNote(note));
});
window.addEventListener('keyup', (event) => release(event.code || event.key.toLowerCase()));
window.addEventListener('blur', () => { releaseKeys(); sequencerMidi?.resetHeld(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { releaseKeys(); sequencerMidi?.resetHeld(); }
});

function addSlider(container, [id, name, min, max, initial, unit, step = 1, display = (value) => value]) {
  const control = document.createElement('div');
  control.className = 'slider-control';
  control.innerHTML = '<div><label for="' + id + '">' + name + '</label><output for="' + id + '"></output></div>' +
    '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + initial + '">';
  get(container).append(control);
  const input = get(id);
  const output = control.querySelector('output');
  const sync = () => {
    if (input.valueAsNumber !== state[id]) input.value = state[id];
    output.value = controlReadout(display(state[id]), unit);
    input.setAttribute('aria-valuetext', output.value);
  };
  input.addEventListener('input', () => {
    state[id] = input.valueAsNumber;
    sync();
    if (id === 'keyVelocity') {
      const velocity = state.keyVelocity / 100;
      for (const key of held.values()) if (key.device === undefined) key.velocity = velocity;
      if (lastNoteDevice === undefined) state.velocity = velocity;
    }
    applySettings();
  });
  sync();
  return sync;
}
const syncSliders = envelopeControls.map((control) => addSlider('adsr-controls', control));
if (modulation) {
  syncSliders.push(
    addSlider('oscillator-controls', ['transpose', 'Transpose', -36, 36, 0, 'semitones']),
    addSlider('filter-controls', ['cutoffStep', 'Cutoff frequency', 0, 84, defaults.cutoffStep, 'Hz', 1, (step) => Math.round(cutoffHz(step))]),
    addSlider('filter-controls', ['resonance', 'Resonance', 0, 10, defaults.resonance, 'dB', 0.1]),
    addSlider('lfo-controls', ['lfoRate', 'Rate', 0.1, 12, defaults.lfoRate, '', 0.1, lfoRateReadout]),
    addSlider('attenuator-controls', ['attenuation', 'Depth', 0, 100, defaults.attenuation, '%']),
  );
  get('lfoShape').addEventListener('change', (event) => {
    state.lfoShape = event.target.value;
    applySettings();
  });
}

function syncStudio() {
  if (evolving) get('dividerRatio').value = state.dividerRatio;
  for (const id of ['octave', 'priority', 'midiChannel', 'ccNumber', 'referenceNote', 'scopeWindow', 'scopeRange']) get(id).value = state[id];
  for (const id of ['retrigger', 'invertGate', 'volumeVelocity', 'controllerVelocity']) get(id).checked = state[id];
}

if (studio) {
  syncSliders.push(
    ...['A', 'B', 'C', 'D'].map((channel) => addSlider('mixer-controls', ['mixer' + channel, 'Level ' + channel, 0, 100, defaults['mixer' + channel], '%'])),
    addSlider('performance-sliders', ['glide', 'Glide time', 0, 1000, defaults.glide, 'ms']),
    addSlider('performance-sliders', ['keyVelocity', 'Key velocity', 0, 100, defaults.keyVelocity, '%']),
    addSlider('performance-sliders', ['volume', 'Volume CV', 0, 100, defaults.volume, '%', 1, Math.round]),
    addSlider('performance-sliders', ['bend', 'Bend position', -1, 1, defaults.bend, '%', 0.01, (value) => Math.round(value * 100)]),
    addSlider('performance-sliders', ['controller', 'Controller position', 0, 1, defaults.controller, '%', 0.01, (value) => Math.round(value * 100)]),
  );
  for (const id of ['scopeWindow', 'scopeRange']) {
    get(id).addEventListener('change', (event) => {
      state[id] = Number(event.target.value);
      if (!frame) updateMeter();
    });
  }
  for (const id of ['octave', 'priority', 'midiChannel', 'ccNumber', 'referenceNote']) {
    get(id).addEventListener('change', (event) => {
      if (id === 'midiChannel') {
        for (const device of midiInputs.keys()) releaseAll(device);
        sustainDevices.clear();
        legatoDevices.clear();
      }
      const field = event.target;
      const previous = state[id];
      state[id] = id === 'priority' ? field.value : Number(field.value);
      if (['midiChannel', 'ccNumber', 'referenceNote'].includes(id)) {
        state[id] = Math.round(Math.max(Number(field.min), Math.min(Number(field.max), state[id])));
        field.value = state[id];
      }
      if (id === 'octave') {
        const next = state.octave;
        state.octave = previous;
        setOctave(next);
        return;
      }
      syncHeldNotes();
    });
  }
  for (const id of ['retrigger', 'invertGate', 'volumeVelocity', 'controllerVelocity']) {
    get(id).addEventListener('change', (event) => {
      state[id] = event.target.checked;
      applySettings();
    });
  }
}

if (modulation) {
  function onMidi(event, device) {
    if (sequencerMidi?.receive(event.data, device)) return;
    for (const [type, value, velocity] of parseMidi(event.data, state.midiChannel ?? 1, state.ccNumber ?? 1)) {
      const token = device + ':' + value;
      if (type === 'press') press(token, value, velocity, device);
      else if (type === 'release') {
        if (sustainDevices.has(device) && held.has(token)) held.get(token).sustained = true;
        else release(token);
      } else if (type === 'sustain') {
        if (value) sustainDevices.add(device);
        else {
          sustainDevices.delete(device);
          for (const [key, note] of held) if (note.device === device && note.sustained) held.delete(key);
          syncHeldNotes();
        }
      } else if (type === 'legato') {
        if (value) legatoDevices.add(device);
        else legatoDevices.delete(device);
      } else if (type === 'releaseDevice') releaseAll(device);
      else {
        state[type] = value;
        syncSliders.forEach((sync) => sync());
        applySettings();
      }
    }
  }
  function refreshMidi() {
    const active = new Set();
    for (const input of midiAccess.inputs.values()) {
      if (input.state === 'disconnected') continue;
      active.add(input.id);
      const prior = midiInputs.get(input.id);
      if (prior === input) continue;
      if (prior) {
        prior.onmidimessage = null;
        releaseAll(input.id);
      }
      input.onmidimessage = (event) => onMidi(event, input.id);
      midiInputs.set(input.id, input);
    }
    for (const [id, input] of midiInputs) {
      if (active.has(id)) continue;
      input.onmidimessage = null;
      midiInputs.delete(id);
      sustainDevices.delete(id);
      legatoDevices.delete(id);
      releaseAll(id);
    }
    sequencerMidi?.devices([...midiInputs.values()]);
    setMidiStatus(active.size ? active.size + ' MIDI input(s) connected.' : 'No MIDI input detected.',
      active.size ? 'MIDI connected' : 'MIDI · no device', Boolean(active.size));
  }
  function setMidiStatus(message, short, active = false) {
    if (get('midi-status')) get('midi-status').textContent = message;
    const quick = docks?.toolbar.querySelector('[data-rack-midi]');
    if (quick) {
      quick.textContent = short;
      quick.title = message;
      quick.setAttribute('aria-label', message);
      quick.dataset.active = active;
      quick.setAttribute('aria-disabled', midiPending);
    }
  }
  requestMidi = async () => {
    if (midiPending) return;
    if (!navigator.requestMIDIAccess) {
      setMidiStatus('Web MIDI is unavailable here. Use the on-screen or computer keys.', 'MIDI unavailable');
      return;
    }
    midiPending = true;
    setMidiStatus('Connecting MIDI…', 'Connecting MIDI…');
    try {
      midiAccess ??= await navigator.requestMIDIAccess();
      midiAccess.onstatechange = refreshMidi;
      midiPending = false;
      refreshMidi();
    } catch {
      midiPending = false;
      setMidiStatus('MIDI access was unavailable. On-screen and computer keys still work.', 'MIDI unavailable');
    }
  };
  get('enable-midi')?.addEventListener('click', requestMidi);
}

if (sequencing) {
  syncSliders.push(
    addSlider('clock-controls', ['bpm', 'Tempo', 40, 240, defaults.bpm, 'BPM']),
    addSlider('clock-controls', ['duty', 'Pulse width', 15, 85, defaults.duty, '%']),
  );
  if (evolving) {
    syncSliders.push(addSlider('accent-controls', ['accentDecay', 'Decay time', 10, 450, defaults.accentDecay, 'ms']));
    get('dividerRatio').addEventListener('change', (event) => {
      state.dividerRatio = Number(event.target.value);
      applySettings();
    });
  }
  rhythmControls = setupRhythmControls(state, noteName, applySettings, toggleTransport, {
    overlays: rackEditors, library: patternLibrary, beforeEdit: () => rememberPatch(),
    isRunning: () => sequenceCanAdvance('original'),
    signal: () => simulationRunning() && activity.modules.has('Sequencer') ? engine?.rhythmSignal() : { step: -1 },
    onPage: () => { sequencerMidi?.refreshTargets(); queueCables(); },
  });

}

if (modulation) {
  const moduleController = setupModuleController({
    rack: bay.closest('.rack'), editorHost:rackEditors?.host,
    play(slot, note, high, velocity) {
      const token = 'lpd8-pad:' + slot;
      if (high) press(token, Math.max(0, Math.min(127, localNote(note))), velocity);
      else release(token);
    },
    releasePads() { for (let slot = 0; slot < 8; slot++) release('lpd8-pad:' + slot); },
  });
  sequencerMidi = setupSequencerMidi({
    container: bay.closest('.rack'), connect: () => requestMidi(), releaseDevice: releaseAll,
    targets: moduleController.targets, focus: moduleController,
  });
}

if (modulation) {
  const currentLesson = Number(lesson);
  const list = get('saved-patches');
  const status = get('patch-storage-status');
  // Older saves have no lesson tag: show them only where all their jacks exist.
  function refreshSaved(selectedName = '') {
    try {
      const patches = readSavedPatches(localStorage).filter((patch) => patch.lesson ? patch.lesson === currentLesson : Array.isArray(patch.snapshot.cables) && patch.snapshot.cables.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((id) => rackPorts.has(id))));
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = patches.length ? 'Choose a patch' : 'No saved patches';
      list.replaceChildren(placeholder, ...patches.map(({ name }) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        return option;
      }));
      list.value = selectedName;
      get('open-patch').disabled = !list.value;
    } catch {
      status.textContent = 'Saved patches are unavailable in this browser.';
    }
  }
  list.addEventListener('change', () => { get('open-patch').disabled = !list.value; });
  get('save-patch').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = get('patch-name');
    try {
      const error = saveNamedPatch(localStorage, input.value, capturePatch(state, defaults, freeCables), currentLesson);
      status.textContent = error || 'Saved ' + input.value.trim() + '.';
      if (!error) refreshSaved(input.value.trim());
    } catch {
      status.textContent = 'The browser could not save this patch.';
    }
  });
  get('open-patch').addEventListener('click', () => {
    try {
      const saved = readSavedPatches(localStorage).find(({ name }) => name === list.value);
      if (!saved) {
        status.textContent = 'This patch is no longer available.';
        refreshSaved();
        return;
      }
      rememberPatch();
      applySnapshot(saved.snapshot);
      status.textContent = 'Opened ' + saved.name + (sequencing ? '. Press Play clock when ready.' : '. Play a key when ready.');
    } catch {
      status.textContent = 'The browser could not open this patch.';
    }
  });
  get('export-patch').addEventListener('click', () => {
    const name = get('patch-name').value.trim() || 'Lesson ' + currentLesson + ' patch';
    const data = encodePatchFile(name, currentLesson, capturePatch(state, defaults, freeCables));
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = (name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 48) || 'patch') + '.patchlab.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Exported ' + name + '. Keep the file as a backup or open it on another device.';
  });
  get('import-patch').addEventListener('change', async (event) => {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;
    try {
      if (file.size > 2000000) throw new Error('Patch files must be smaller than 2 MB.');
      const imported = decodePatchFile(await file.text(), currentLesson, defaults, rackPorts);
      rememberPatch();
      applySnapshot(imported.snapshot, { muteAudio: true });
      get('patch-name').value = imported.name;
      exampleHint.hidden = true;
      status.textContent = 'Imported ' + imported.name + '. Audio and clock are off. Save patch to keep a copy in this browser. Undo restores your previous patch.';
    } catch (error) {
      status.textContent = error.message || 'The patch could not be imported.';
    } finally {
      input.value = '';
    }
  });
  refreshSaved();
}

function syncOutput() {
  const level = get('voice-level');
  level.value = state.level;
  level.setAttribute('aria-valuetext', state.level + '%');
  get('voice-level-value').value = state.level + '%';
  get('voice-mute').setAttribute('aria-pressed', state.muted);
  get('voice-wave').value = state.waveform;
  if (modulation) get('lfoShape').value = state.lfoShape;
}

get('voice-level').addEventListener('input', (event) => {
  state.level = event.target.valueAsNumber;
  syncOutput();
  applySettings();
});
get('voice-wave').addEventListener('change', (event) => {
  state.waveform = event.target.value;
  applySettings();
});
get('voice-mute').addEventListener('click', () => {
  state.muted = !state.muted;
  syncOutput();
  applySettings();
});
const examples = lessonExamples[lesson] ?? lessonExamples[2];
const exampleSelect = get('voice-example');
const exampleHint = get('rack-example-hint');
get('example-picker').hidden = false;
populateExamples(exampleSelect, examples);
if (sequencing) exampleSelect.value = orbital ? 0 : examples.length - 1;
exampleSelect.addEventListener('change', () => { exampleHint.hidden = true; });

get('voice-preset').addEventListener('click', () => {
  const example = examples[Number(exampleSelect.value)];
  if (modulation) rememberPatch();
  selected = null;
  if (modulation) {
    const settings = capturePatch(defaults, defaults, []).settings;
    applySnapshot({
      settings: { ...settings, ...example.settings, level: state.level, muted: state.muted },
      instances: example.instances ?? [], instruments: example.instruments ?? [],
      cables: Object.entries(example.patch).map(([input, output]) => [output, input]),
    });
    if (!sequencing || example.revealSources) docks.sources.reveal();
  } else {
    Object.assign(state, example.settings, { patch: { ...example.patch } });
    syncSliders.forEach((sync) => sync());
    syncOutput();
    refreshRouting();
    renderPatch();
  }
  exampleHint.textContent = example.hint;
  exampleHint.hidden = false;
  announce(example.name + ' loaded. ' + example.hint);
});
get('voice-reset').addEventListener('click', () => {
  if (modulation) rememberPatch();
  exampleHint.hidden = true;
  held.clear();
  sustainDevices.clear();
  legatoDevices.clear();
  clearTimeout(retriggerTimer);
  const nextEpoch = (state.transportEpoch ?? 0) + 1;
  Object.assign(state, defaults, { patch: {}, instances: [], instruments: [], sequenceRuntime: {} });
  syncingInstances = true;
  try { instanceRack?.sync(); } finally { syncingInstances = false; }
  lastNoteDevice = undefined;
  if (sequencing) state.transportEpoch = nextEpoch;
  engine?.resetEnvelope();
  selected = null;
  syncSliders.forEach((sync) => sync());
  syncOutput();
  if (studio) syncStudio();
  rhythmControls?.sync();
  if (modulation) {
    freeCables = [];
    refreshFreePatch();
  } else {
    refreshRouting();
    renderPatch();
  }
  announce(modulation ? 'Patch cleared. Select any two jacks.' : 'Patch cleared. Select an output, then a compatible input.');
});
function toggleAudio() {
  const pending = changingContext;
  audioEnabled = !audioEnabled;
  if (audioEnabled) {
    timedOut = false;
    silentDeadline = 0;
    clearTimeout(silentTimer);
  }
  refreshRouting();
  // A direct gesture can unlock an already pending browser resume.
  if (pending && audioEnabled && activity.modules.size && engine?.context.state !== 'running') {
    engine?.context.resume().catch(() => {});
  }
  announce(audioEnabled ? 'Audio enabled.' : 'Audio muted.');
}

function toggleTransport() {
  state.playing = !state.playing;
  applySettings();
  announce(state.playing ? 'Clock armed. It advances when routed to an active output.' : 'Clock stopped.');
}

document.addEventListener('visibilitychange', refreshRouting);
audio.addEventListener('click', toggleAudio);

if (modulation) {
  const restore = get('restore-layout');
  restore.hidden = false;
  get('free-instructions').hidden = false;
  get('envelope-gate').hidden = false;
  get('cable-panel').hidden = false;
  const rack = bay.closest('.rack');
  rack.classList.add('docked-rack');
  frontCables = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  frontCables.setAttribute('class', 'cables cable-focus-layer floating-cable-focus');
  frontCables.setAttribute('aria-hidden', 'true');
  rack.append(cables); document.body.append(frontCables);
  docks = setupRackDocks(bay, queueCables, () => {
    selected = null;
    renderPatch();
    announce('Cable selection cleared.');
  }, ports.get('audioIn'), rackEditors);
  addModuleDetails(docks.output.panel.querySelector('h3'), 'Output');
  const order = lessonModuleOrder[lesson] || lessonModuleOrder[6];
  orderModules(bay, order.rack);
  orderModules(docks.sources.body, order.sources);
  jackMeters = setupJackMeters(docks.toolbar, (jacks) => {
    inspectedJacks = jacks;
    syncJackProbes();
  });
  const toolbarObserver = new ResizeObserver(() => {
    rack.style.setProperty('--rack-toolbar-offset', Math.ceil(docks.toolbar.getBoundingClientRect().height) + 16 + 'px');
    rackEditors?.reposition();
    queueCables();
  });
  toolbarObserver.observe(docks.toolbar);
  const previousLayout = studio ? 'patchlab-studio-layout-v1' : 'patchlab-rack-layout-v1';
  const layoutKey = evolving ? 'patchlab-evolving-layout-v1' : sequencing ? 'patchlab-rhythm-layout-v1' : previousLayout;
  const rackLayout = setupRackLayout(bay, null, restore, () => { if (!syncingInstances) { drawCables(); refreshRouting(); } }, layoutKey, evolving ? layoutKey : previousLayout);
  const sourceLayout = setupRackLayout(docks.sources.body, null, restore, queueCables, layoutKey + '-sources', evolving ? layoutKey + '-sources' : sequencing ? previousLayout + '-sources' : layoutKey);
  instanceRack = setupInstanceRack({
    state, overlays:rackEditors, patternLibrary, sequenceCanAdvance, onSequencePage: () => { sequencerMidi?.refreshTargets(); queueCables(); }, lesson: Number(lesson), bay, sources: docks.sources, layouts: { rack: rackLayout, sources: sourceLayout },
    register(item, module, labelsOnly = false) {
      for (const [id, port] of instancePorts([item])) {
        const jack = module.querySelector('[data-port="' + id + '"]');
        const existed = ports.has(id);
        ports.set(id, jack);
        rackPorts.set(id, port);
        (port.direction === 'out' ? outlets : inlets)[id] = [port.kind, port.label];
        if (!labelsOnly && !existed) bindPort(id, jack);
      }
    },
    unregister(item) {
      const ids = [...instancePorts([item]).keys()];
      jackMeters.forget(ids);
      for (const id of ids) { ports.delete(id); rackPorts.delete(id); delete outlets[id]; delete inlets[id]; }
      if (ids.includes(selected)) selected = null;
      cableFocus = null;
    },
    beforeEdit: () => rememberPatch(),
    changed(topology = true) { if (topology) refreshFreePatch(); else applySettings(); },
    removeCables(id) {
      freeCables = freeCables.filter((pair) => !pair.some((port) => port.startsWith(id + ':')));
      state.patch = resolveCables(freeCables, rackPorts).patch;
    },
    announce,
    read: (id) => engine?.readInstance(id),
    isActive: (id) => simulationRunning() && activity.modules.has(id),
    sampleRate: () => engine?.context.sampleRate,
    labelPort: portLabel,
  });
  instrumentRack = setupInstrumentRack({
    state, overlays:rackEditors, bay, docks, layouts: { rack: rackLayout, sources: sourceLayout }, ports, rackPorts,
    patchPort(id,anchor) { inspectionAnchor={id,anchor}; try { editPatch(id); } finally { inspectionAnchor=undefined; } },
    beforeEdit: () => rememberPatch(), changed: () => refreshFreePatch(), announce,
    onView() { queueCables(); refreshRouting(); }, onGeometry: queueCables,
    copy: {
      cables: () => freeCables,
      apply(result) {
        state.instances = result.instances; state.instruments = result.instruments; freeCables = result.cables;
        syncingInstances = true;
        try { instanceRack.sync(); } finally { syncingInstances = false; }
        refreshFreePatch();
      },
    },
  });
  if (orbital) orbitPanel = setupOrbitPanel({ docks, overlays:rackEditors, state, ports: rackPorts, reset() { for(const id of ['original',...state.instances.filter(m=>m.type==='Sequencer').map(m=>m.id)])sequenceRuntime(state,id).epoch++;state.playing=true;applySettings(); }, read: id => id === 'original' ? (simulationRunning() && activity.modules.has('Sequencer') ? engine?.rhythmSignal() : null) : (simulationRunning() && activity.modules.has(id) ? engine?.readInstance(id) : null), reveal: id => instrumentRack.revealMember(id === 'original' ? 'Sequencer' : id) });
  const tools = docks.toolbar;
  const instruments = document.createElement('button');
  instruments.type = 'button'; instruments.textContent = 'Instruments';
  instruments.addEventListener('click', () => instrumentRack.reveal());
  tools.querySelector('.rack-tools').append(instruments);
  const addModules = document.createElement('button');
  addModules.type = 'button'; addModules.textContent = 'Add modules';
  addModules.addEventListener('click', () => instanceRack.reveal());
  tools.querySelector('.rack-tools').append(addModules);
  tools.querySelector('.rack-tools').append(get('workspace-view'));
  const quick = tools.querySelector('.rack-quick-controls');
  if (modulation) {
    const midi = document.createElement('button');
    midi.type = 'button';
    midi.dataset.rackMidi = '';
    midi.textContent = 'Connect MIDI';
    midi.addEventListener('click', requestMidi);
    quick.append(midi);
    {
      const mapping = document.createElement('button'); mapping.type = 'button'; mapping.dataset.controllerConsole = ''; mapping.textContent = 'LPD8 controls';
      mapping.addEventListener('click', () => sequencerMidi.toggleOverlay());
      tools.querySelector('.rack-tools').append(mapping);
    }
  }
  tools.querySelector('[data-rack-audio]').addEventListener('click', toggleAudio);
  tools.querySelector('[data-rack-cables]').addEventListener('click', () => {
    const panel = get('cable-panel');
    panel.open = true;
    panel.scrollIntoView({ block: 'start' });
    panel.querySelector('summary').focus({ preventScroll: true });
  });
  tools.querySelector('[data-rack-undo]').addEventListener('click', () => {
    const entry = undoStack.pop();
    if (!entry) return;
    if (entry.cablesOnly) {
      freeCables = entry.snapshot.cables;
      selected = null;
      refreshFreePatch();
    } else applySnapshot(entry.snapshot);
    announce('Previous patch restored.');
  });
  let play;
  if (sequencing) {
    play = document.createElement('button');
    play.type = 'button';
    play.dataset.rackPlay = '';
    play.textContent = 'Play clock';
    play.addEventListener('click', toggleTransport);
    quick.insertBefore(play, quick.querySelector('[data-rack-midi]'));
  }
  {
    const patches = document.createElement('button');
    patches.type = 'button';
    patches.textContent = 'Patches';
    patches.addEventListener('click', () => {
      const shelf = get('patch-shelf');
      shelf.open = true;
      shelf.scrollIntoView({ block: 'start' });
      shelf.querySelector('summary').focus({ preventScroll: true });
    });
    tools.querySelector('.rack-tools').append(patches);
  }
  get('rack-example').addEventListener('click', () => {
    get('voice-preset').click();
    (audioEnabled && play ? play : tools.querySelector('[data-rack-audio]')).focus({ preventScroll: true });
  });
  announce('Choose any two jacks. Double-click or double-tap a cable to unplug it.');
}
if (!modulation) for (const heading of bay.querySelectorAll('.module-head h3')) addModuleDetails(heading);
const rackObserver = new ResizeObserver(queueCables);
rackObserver.observe(bay);
if (docks) { rackObserver.observe(docks.workspace); rackObserver.observe(docks.main); }
for (const dock of docks?.panels ?? []) rackObserver.observe(dock.panel);
syncOutput();
if (studio) {
  syncStudio();
  rhythmControls?.sync();
  updateMeter();
}
renderPatch();
renderAudio();
renderSignals();
