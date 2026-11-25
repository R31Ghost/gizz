import { sequenceSettings, validSteps } from './sequence-patterns.js';
import { cutoffHz } from './modulation.js';
import { lfoRateReadout } from './readouts.js';

const slider = (key, label, min, max, value, unit = '%', step = 1, display) => ({ key, label, min, max, value, unit, step, display });
const choice = (key, label, values, value, labels = values) => ({ key, label, values, value, labels });
const port = (key, label, kind, direction, thru) => ({ key, label, kind, direction, ...(thru ? { thru } : {}) });
const input = (key, label, kind) => port(key, label, kind, 'in');
const output = (key, label, kind, thru) => port(key, label, kind, 'out', thru);
const waves = ['sine', 'triangle', 'sawtooth', 'square'];
export const moduleCatalog = {
  Oscillator: { phase: 3, source: true, css: 'oscillator', controls: [choice('waveform', 'Waveform', waves, 'sine', ['Sine', 'Triangle', 'Saw', 'Square']), slider('transpose', 'Transpose', -36, 36, 0, 'semitones')], ports: [input('pitchIn', 'Pitch in', 'pitch'), input('modPitchIn', 'Pitch CV in', 'cv'), output('oscOut', 'Audio out', 'audio')] },
  'ADSR Envelope': { phase: 3, css: 'envelope-module', controls: [slider('attack', 'Attack time', 5, 2000, 10, 'ms'), slider('decay', 'Decay time', 5, 2000, 180, 'ms'), slider('sustain', 'Sustain level', 0, 100, 65), slider('release', 'Release time', 5, 3000, 300, 'ms')], ports: [input('gateIn', 'Gate in', 'gate'), output('envOut', 'Envelope out', 'cv'), output('envInvOut', 'Inverted out', 'cv')] },
  VCA: { phase: 3, css: 'vca-module', controls: [], ports: [input('vcaIn', 'Audio in', 'audio'), input('cvIn', 'CV in', 'cv'), output('vcaOut', 'Audio out', 'audio')] },
  'Low-pass filter': { phase: 3, css: 'filter-module', controls: [slider('cutoffStep', 'Cutoff frequency', 0, 84, 36, 'Hz', 1, (value) => Math.round(cutoffHz(value))), slider('resonance', 'Resonance', 0, 10, 2, 'dB', 0.1)], ports: [input('filterIn', 'Audio in', 'audio'), input('cutoffIn', 'Cutoff CV in', 'cv'), output('filterOut', 'Audio out', 'audio')] },
  LFO: { phase: 3, source: true, css: 'lfo-module', controls: [choice('lfoShape', 'Waveform', ['sine', 'triangle'], 'sine', ['Sine', 'Triangle']), slider('lfoRate', 'Rate', 0.1, 12, 2, '', 0.1, lfoRateReadout)], ports: [output('lfoOut', 'CV out', 'cv')] },
  Attenuator: { phase: 3, css: 'attenuator-module', controls: [slider('attenuation', 'Depth', 0, 100, 50)], ports: [input('attenIn', 'CV in', 'cv'), output('attenOut', 'CV out', 'cv')] },
  Mixer: { phase: 4, css: 'mixer-module', controls: ['A', 'B', 'C', 'D'].map((c) => slider('mixer' + c, 'Level ' + c, 0, 100, c === 'A' ? 70 : c === 'B' ? 20 : 0)), ports: [...['A', 'B', 'C', 'D'].map((c) => input('mixIn' + c, c + ' in', 'audio')), output('mixOut', 'Mix out', 'audio')] },
  Noise: { phase: 4, source: true, css: 'noise-module', controls: [], ports: [output('noiseOut', 'White out', 'audio'), output('darkNoiseOut', 'Dark out', 'audio')] },
  Scope: { phase: 4, css: 'scope-module', controls: [choice('scopeWindow', 'Time window', [5, 25, 100, 250], 25, ['5 ms', '25 ms', '100 ms', '250 ms']), choice('scopeRange', 'Vertical range', [1, 2, 5], 1, ['±1', '±2', '±5'])], ports: [input('scopeInA', 'A in', 'signal'), input('scopeInB', 'B in', 'signal'), output('scopeThruA', 'Thru A', 'signal', 'scopeInA'), output('scopeThruB', 'Thru B', 'signal', 'scopeInB')] },
  Clock: { phase: 5, source: true, css: 'clock-module', controls: [slider('bpm', 'Tempo', 40, 240, 110, 'BPM'), slider('duty', 'Pulse width', 15, 85, 45), choice('division', 'Pulses per beat', [1, 2, 4], 2)], ports: [output('clockOut', 'Clock out', 'gate')] },
  Sequencer: { phase: 5, css: 'sequencer-module', controls: [], ports: [input('seqClockIn', 'Clock in', 'gate'), input('seqResetIn', 'Reset in', 'gate'), output('seqPitchOut', 'Pitch out', 'pitch'), output('seqGateOut', 'Gate out', 'gate')] },
  'Clock Divider': { phase: 6, css: 'divider-module', controls: [choice('dividerRatio', 'Divide by', [2, 3, 4, 8], 4)], ports: [input('dividerIn', 'Clock in', 'gate'), output('dividerOut', 'Divided out', 'gate')] },
  Phrase: { phase: 7, css: 'phrase-module', controls: [choice('retrigger', 'Retrigger while playing', ['restart', 'ignore'], 'restart', ['Restart phrase', 'Ignore trigger'])], ports: [input('phraseTriggerIn', 'Trigger in', 'gate'), output('seqPitchOut', 'Pitch out', 'pitch'), output('seqGateOut', 'Gate out', 'gate')] },
  Accent: { phase: 6, css: 'accent-module', controls: [slider('accentDecay', 'Decay time', 10, 450, 95, 'ms')], ports: [input('accentIn', 'Audio in', 'audio'), input('accentTriggerIn', 'Trigger in', 'gate'), output('accentOut', 'Audio out', 'audio')] },
};
export const MAX_INSTANCES = 24;
export const instanceJack = (id, key) => id + ':' + key;
export const baseJack = (id) => id.split(':').at(-1);
export const availableTypes = (lesson) => Object.keys(moduleCatalog).filter((type) => moduleCatalog[type].phase <= lesson);
export function instanceDefaults(type) {
  const values = Object.fromEntries(moduleCatalog[type].controls.map(({ key, value }) => [key, value]));
  if (['Sequencer', 'Phrase'].includes(type)) Object.assign(values, sequenceSettings({ steps: [0, 0, 7, 3, 0, 10, 7, 3, 0, 3, 7, 10, 12, 7, 3, 0].map((pitch, index) => ({ pitch, on: index % 8 !== 3 && index % 8 !== 7 })) }));
  if (type === 'Sequencer') values.clockDivide = 1;
  return values;
}
export function createModuleInstance(type, id, name, settings = {}) {
  return { id, type, name: (name || type).trim().slice(0, 48), settings: { ...instanceDefaults(type), ...structuredClone(settings), ...(['Sequencer', 'Phrase'].includes(type) ? sequenceSettings({ ...instanceDefaults(type), ...settings, sequenceLength: settings.sequenceLength ?? settings.steps?.length ?? 16 }) : {}) } };
}
export function readInstances(value = [], types = Object.keys(moduleCatalog)) {
  if (!Array.isArray(value) || value.length > MAX_INSTANCES) throw new Error('A patch can add up to ' + MAX_INSTANCES + ' modules.');
  const ids = new Set();
  return value.map((item) => {
    if (!item || !/^m[1-9]\d{0,5}$/.test(item.id) || ids.has(item.id) || !types.includes(item.type)) throw new Error('Invalid or duplicate module identity.');
    ids.add(item.id);
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 48) throw new Error('Module names must be 1–48 characters.');
    if (!item.settings || typeof item.settings !== 'object' || Array.isArray(item.settings)) throw new Error('Invalid module settings.');
    const defaults = instanceDefaults(item.type);
    for (const [key, v] of Object.entries(item.settings)) {
      const control = moduleCatalog[item.type].controls.find((c) => c.key === key);
      const valid = key === 'clockDivide' && item.type === 'Sequencer' ? [1,2,4,8].includes(v) : key === 'sequenceLength' && ['Sequencer', 'Phrase'].includes(item.type) ? Number.isInteger(v) && v >= 1 && v <= Math.max(16, item.settings.steps?.length || 16) : key === 'steps' && ['Sequencer', 'Phrase'].includes(item.type)
        ? validSteps(v)
        : control?.values ? control.values.includes(v) : control && Number.isFinite(v) && v >= control.min && v <= control.max && Math.abs((v - control.min) / control.step - Math.round((v - control.min) / control.step)) < 0.00001;
      if (!Object.hasOwn(defaults, key) || !valid) throw new Error('Invalid ' + item.type + ' setting: ' + key + '.');
    }
    return createModuleInstance(item.type, item.id, item.name.trim(), item.settings);
  });
}
export function instancePorts(instances) {
  return new Map(instances.flatMap((item) => moduleCatalog[item.type].ports.map(({ key, thru, ...port }) => [instanceJack(item.id, key), {
    ...port, module: item.id, type: item.type, label: item.name + ' · ' + port.label, base: key,
    ...(thru ? { thru: instanceJack(item.id, thru) } : {}),
  }])));
}
