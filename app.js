import { createAudioEngine, outputGain, pitchHz } from './audio.js';
import { firstPatchExamples, populateExamples } from './examples.js';
import { addModuleDetails } from './module-details.js';

const get = (id) => document.getElementById(id);
const defaults = Object.freeze({
  patched: false,
  selected: false,
  muted: false,
  level: 25,
  pitch: 12,
  waveform: 'sine',
});

const wavePaths = {
  sine: 'M0 24 C12 2 22 2 34 24 S56 46 67 24 S89 2 100 24 S122 46 133 24 S155 2 167 24 S189 46 200 24',
  triangle: 'M0 24 L17 8 50 40 83 8 117 40 150 8 183 40 200 24',
  sawtooth: 'M0 38 L50 10 V38 L100 10 V38 L150 10 V38 L200 10',
  square: 'M0 9 H33 V39 H67 V9 H100 V39 H133 V9 H167 V39 H200',
};

const audioButton = get('enable-audio');
const source = get('source-port');
const input = get('input-port');
const bay = get('rack-bay');
const waveInputs = Array.from(document.querySelectorAll('input[name="waveform"]'));
const pitchControl = get('pitch');
const levelControl = get('level');
const muteButton = get('mute');
const heardAtPitch = new Map();

let state = { ...defaults };
let engine;
let audioPending = false;
let audioEnabled = false;
let audioError = '';
let compared = false;

function drawCable() {
  let path = '';
  if (state.patched) {
    const bounds = bay.getBoundingClientRect();
    const from = source.querySelector('.jack').getBoundingClientRect();
    const to = input.querySelector('.jack').getBoundingClientRect();
    const x1 = from.left + from.width / 2 - bounds.left;
    const y1 = from.top + from.height / 2 - bounds.top;
    const x2 = to.left + to.width / 2 - bounds.left;
    const y2 = to.top + to.height / 2 - bounds.top;
    const stacked = Math.abs(y2 - y1) > 35;
    path = stacked
      ? ['M', x1, y1, 'C', x1 + 23, y1 + 12, x2 + 23, y2 - 12, x2, y2].join(' ')
      : ['M', x1, y1, 'C', x1 + 13, y1 + 33, x2 - 13, y2 + 33, x2, y2].join(' ');
  }
  get('cable').setAttribute('d', path);
  get('cable-shadow').setAttribute('d', path);
}

function showStep(id, number, done) {
  const step = get(id);
  step.dataset.done = done;
  step.querySelector('.step-number').textContent = done ? '✓' : number;
  const heading = step.querySelector('h3');
  if (done) heading.setAttribute('aria-label', heading.textContent + ', complete');
  else heading.removeAttribute('aria-label');
}

function patchMessage(ready) {
  if (audioError) return audioError;
  if (state.selected) return 'Audio out selected. Choose Audio in to complete the patch.';
  if (!state.patched) return 'Select Audio out, then Audio in, to connect the modules.';
  if (!ready) return 'Cable connected. Enable audio to hear the oscillator.';
  if (state.muted) return 'Cable connected. Output is muted.';
  if (!state.level) return 'Cable connected. Raise the output level to hear the oscillator.';
  return 'Oscillator connected to output. Select either jack to remove the cable.';
}

function render() {
  const ready = audioEnabled && engine?.context.state === 'running';
  const sounding = ready && outputGain(state) > 0;
  audioButton.setAttribute('aria-disabled', audioPending);
  audioButton.setAttribute('aria-pressed', audioEnabled);
  audioButton.dataset.state = ready ? 'ready' : 'off';
  get('audio-label').textContent = audioPending ? (audioEnabled ? 'Starting audio…' : 'Stopping audio…') : audioEnabled ? 'Audio on · turn off' : 'Enable audio';
  audioButton.querySelector('.audio-icon').textContent = ready ? '✓' : '▶';

  source.setAttribute('aria-pressed', state.selected || state.patched);
  input.setAttribute('aria-pressed', state.patched);
  muteButton.setAttribute('aria-pressed', state.muted);
  get('patch-state').dataset.patched = state.patched;
  get('patch-state').textContent = state.patched ? 'PATCHED' : state.selected ? 'SELECTING' : 'UNPATCHED';
  const message = patchMessage(ready);
  if (get('patch-message').textContent !== message) get('patch-message').textContent = message;

  const frequency = Math.round(pitchHz(state.pitch)) + ' Hz';
  const level = state.level + '%';
  pitchControl.value = state.pitch;
  pitchControl.setAttribute('aria-valuetext', frequency);
  get('pitch-value').textContent = frequency;
  levelControl.value = state.level;
  levelControl.setAttribute('aria-valuetext', level);
  get('level-value').textContent = level;
  for (const option of waveInputs) option.checked = option.value === state.waveform;
  get('wave-shape').setAttribute('d', wavePaths[state.waveform]);

  document.querySelector('.output').dataset.sounding = sounding;
  get('signal-display').textContent = sounding ? 'OUTPUT ACTIVE' : state.muted ? 'MUTED' : 'NO OUTPUT';

  if (sounding) {
    const heard = heardAtPitch.get(state.pitch) ?? new Set();
    heard.add(state.waveform);
    heardAtPitch.set(state.pitch, heard);
    compared ||= heard.has('sine') && heard.has('sawtooth');
  }
  showStep('step-audio', '01', ready);
  showStep('step-patch', '02', state.patched);
  showStep('step-compare', '03', compared);
  drawCable();
}

function update(changes) {
  Object.assign(state, changes);
  if (audioEnabled && engine) {
    if (state.patched) {
      engine.apply(state);
      engine.context.resume().catch(() => {});
    } else {
      engine.apply(state);
      engine.context.suspend().catch(() => {});
    }
  }
  render();
}

audioButton.addEventListener('click', async () => {
  if (audioPending) return;
  audioPending = true;
  audioError = '';
  const turnOn = !audioEnabled;
  audioEnabled = turnOn;
  render();
  try {
    if (!turnOn) {
      engine.apply({ ...state, patched: false });
      await engine.context.suspend();
      return;
    }
    if (!engine) {
      engine = createAudioEngine();
      engine.context.addEventListener('statechange', render);
    }
    engine.apply(state);
    if (!state.patched) { await engine.context.suspend(); return; }
    await engine.context.resume();
    if (engine.context.state !== 'running') audioError = 'Audio is paused. Choose Enable audio to try again.';
  } catch {
    audioEnabled = turnOn && engine?.context.state === 'running';
    audioError = turnOn ? 'Audio could not start.' : 'Audio could not stop. Try again.';
  } finally {
    audioPending = false;
    render();
  }
});

source.addEventListener('click', () => {
  if (state.patched) update({ patched: false, selected: false });
  else update({ selected: !state.selected });
});
input.addEventListener('click', () => {
  if (state.patched) update({ patched: false, selected: false });
  else if (state.selected) update({ patched: true, selected: false });
  else source.focus();
});
bay.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.selected) update({ selected: false });
});

for (const option of waveInputs) {
  option.addEventListener('change', () => update({ waveform: option.value }));
}
pitchControl.addEventListener('input', () => update({ pitch: pitchControl.valueAsNumber }));
levelControl.addEventListener('input', () => update({ level: levelControl.valueAsNumber }));
muteButton.addEventListener('click', () => update({ muted: !state.muted }));
const exampleSelect = get('first-example');
const exampleHint = get('first-example-hint');
populateExamples(exampleSelect, firstPatchExamples);
exampleSelect.addEventListener('change', () => { exampleHint.hidden = true; });
get('load-first-example').addEventListener('click', () => {
  const example = firstPatchExamples[Number(exampleSelect.value)];
  update({ ...example.settings, patched: true, selected: false });
  exampleHint.textContent = example.hint;
  exampleHint.hidden = false;
});
get('reset').addEventListener('click', () => {
  exampleHint.hidden = true;
  heardAtPitch.clear();
  compared = false;
  update(defaults);
});

for (const heading of bay.querySelectorAll('.module-head h3')) addModuleDetails(heading);
new ResizeObserver(drawCable).observe(bay);
render();
