import { readPatternLibrary, validSteps } from './sequence-patterns.js';
import { readInstruments, instrumentModuleIds } from './instruments.js';
import { availableTypes, readInstances, instancePorts } from './module-instances.js';
const format = 'patchlab-patch';
const maxLength = 2000000;
const limits = {
  transpose: [-36, 36], level: [0, 100], octave: [-2, 2], attack: [5, 2000], decay: [5, 2000], sustain: [0, 100], release: [5, 3000],
  cutoffStep: [0, 84], resonance: [0, 10], lfoRate: [0.1, 12], attenuation: [0, 100],
  mixerA: [0, 100], mixerB: [0, 100], mixerC: [0, 100], mixerD: [0, 100], glide: [0, 1000],
  keyVelocity: [0, 100], volume: [0, 100], bend: [-1, 1], controller: [0, 1], midiChannel: [1, 16],
  ccNumber: [0, 127], referenceNote: [0, 127], bpm: [40, 240], duty: [15, 85], accentDecay: [10, 450], sequenceLength: [1, 128],
};
const choices = {
  waveform: ['sine', 'triangle', 'sawtooth', 'square'], lfoShape: ['sine', 'triangle'],
  priority: ['high', 'last', 'low'], scopeWindow: [5, 25, 100, 250], scopeRange: [1, 2, 5],
  clockDivide: [1,2,4,8], division: [1, 2, 4], dividerRatio: [2, 3, 4, 8],
};
const integers = new Set(['transpose', 'octave', 'cutoffStep', 'midiChannel', 'ccNumber', 'referenceNote', 'sequenceLength']);
const runtime = new Set(['note', 'lastNote', 'velocity', 'retriggering', 'playing', 'transportEpoch']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function encodePatchFile(name, lesson, snapshot) {
  return JSON.stringify({ format, version: snapshot.settings.clockDivide !== undefined || snapshot.instances?.some(m=>m.settings?.clockDivide !== undefined) || snapshot.instruments?.some(g=>g.ports?.length) || snapshot.settings.steps?.length > 16 || snapshot.patterns?.some(p => p.steps.length > 16) || snapshot.instances?.some(m => m.type === 'Phrase' || m.settings.steps?.length > 16) ? 5 : snapshot.settings.sequenceLength !== undefined || snapshot.settings.steps?.length === 16 || snapshot.patterns?.length || snapshot.instances?.some(item => item.type === 'Sequencer' && (item.settings.sequenceLength !== undefined || item.settings.steps?.length === 16)) ? 4 : snapshot.instruments?.length ? 3 : snapshot.instances?.length ? 2 : 1, lesson, name: name.trim().slice(0, 48) || 'Untitled patch', snapshot }, null, 2);
}

export function decodePatchFile(text, lesson, defaults, ports) {
  if (text.length > maxLength) throw new Error('Patch files must be smaller than 2 MB.');
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (!object(file) || file.format !== format || ![1, 2, 3, 4, 5].includes(file.version)) throw new Error('Choose a supported Patchlab patch file (version 1, 2, 3, 4 or 5).');
  if (file.lesson !== lesson) throw new Error('This patch belongs to Lesson ' + file.lesson + '. Open that lesson to import it.');
  if (typeof file.name !== 'string' || !file.name.trim() || file.name.length > 48) throw new Error('The patch name is invalid.');
  const snapshot = file.snapshot;
  if (!object(snapshot) || !object(snapshot.settings) || !Array.isArray(snapshot.cables)) throw new Error('The patch data is incomplete or too large.');
  if (file.version < 5 && (snapshot.settings.clockDivide !== undefined || (Array.isArray(snapshot.instances) && snapshot.instances.some(m=>m?.settings?.clockDivide !== undefined)) || snapshot.instruments?.some(g=>g.ports?.length) || snapshot.settings.steps?.length > 16 || snapshot.patterns?.some(p => p.steps?.length > 16) || (Array.isArray(snapshot.instances) && snapshot.instances.some(m => m?.type === 'Phrase' || m?.settings?.steps?.length > 16)))) throw new Error('Long phrases require version 5.');
  const patterns = readPatternLibrary(snapshot.patterns);
  if (file.version < 4 && (patterns.length || snapshot.settings.sequenceLength !== undefined || snapshot.settings.steps?.length === 16 || (Array.isArray(snapshot.instances) && snapshot.instances.some(item => item?.type === 'Sequencer' && (item.settings?.sequenceLength !== undefined || item.settings?.steps?.length === 16))))) throw new Error('Sixteen-step patterns require a version 4 patch file.');
  const instances = readInstances(snapshot.instances, availableTypes(lesson));
  if (file.version === 1 && instances.length) throw new Error('Added modules require a version 2 patch file.');
  const instruments = readInstruments(snapshot.instruments, instrumentModuleIds(ports, instances), new Map([...ports].filter(([id])=>!id.includes(':')).concat([...instancePorts(instances)])));
  if (file.version < 3 && instruments.length) throw new Error('Instruments require a version 3 patch file.');
  const allPorts = new Map([...ports].filter(([id]) => !id.includes(':')).concat([...instancePorts(instances)]));
  for (const [key, value] of Object.entries(snapshot.settings)) {
    if (!Object.hasOwn(defaults, key) || runtime.has(key)) throw new Error('Unknown or temporary setting: ' + key + '.');
    let valid;
    if (key === 'steps') valid = validSteps(value);
    else if (key === 'sequenceLength') valid = Number.isInteger(value) && value >= 1 && value <= Math.max(16, snapshot.settings.steps?.length || 16);
    else if (choices[key]) valid = choices[key].includes(value);
    else if (limits[key]) valid = Number.isFinite(value) && value >= limits[key][0] && value <= limits[key][1] && (!integers.has(key) || Number.isInteger(value));
    else valid = typeof defaults[key] === 'boolean' && typeof value === 'boolean';
    if (!valid) throw new Error('Invalid value for ' + key + '.');
  }
  for (const pair of snapshot.cables) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1] || !pair.every((id) => allPorts.has(id))) throw new Error('The patch contains an unknown or invalid jack.');
  }
  // Imported settings are applied only after every field has passed validation.
  return { name: file.name, snapshot };
}
