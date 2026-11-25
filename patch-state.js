import { readPatternLibrary, sequenceSettings, validSteps } from './sequence-patterns.js';
import { readInstruments, instrumentModuleIds } from './instruments.js';
import { readInstances, instancePorts } from './module-instances.js';
export function capturePatch(state, defaults, cables) {
  const keys = Object.keys(defaults).filter((key) => !['note', 'lastNote', 'velocity', 'retriggering', 'playing', 'transportEpoch'].includes(key));
  const settings = Object.fromEntries(keys.map((key) => [key, state[key]]));
  return structuredClone({ settings, cables, ...(state.instances?.length ? { instances: state.instances } : {}), ...(state.instruments?.length ? { instruments: state.instruments } : {}), ...(state.patternLibrary?.length ? { patterns: state.patternLibrary } : {}) });
}

export function restorePatch(snapshot, defaults, ports) {
  const instances = readInstances(snapshot.instances);
  const patterns = readPatternLibrary(snapshot.patterns);
  const instruments = readInstruments(snapshot.instruments, instrumentModuleIds(ports, instances), new Map((ports instanceof Map ? [...ports] : []).filter(([id])=>!id.includes(':')).concat([...instancePorts(instances)])));
  const allPorts = new Set([...ports.keys()].filter((id) => !id.includes(':')).concat([...instancePorts(instances).keys()]));
  const settings = structuredClone(defaults);
  for (const [key, initial] of Object.entries(defaults)) {
    const value = snapshot.settings?.[key];
    if (key === 'steps') {
      if (validSteps(value)) settings.steps = structuredClone(value);
    } else if (typeof value === typeof initial && (typeof value !== 'number' || Number.isFinite(value))) {
      settings[key] = value;
    }
  }
  if (validSteps(settings.steps)) Object.assign(settings, sequenceSettings({ steps: settings.steps, sequenceLength: snapshot.settings?.sequenceLength ?? (validSteps(snapshot.settings?.steps) ? snapshot.settings.steps.length : settings.sequenceLength) }));
  if ('bpm' in settings) settings.bpm = Math.min(240, Math.max(40, settings.bpm));
  if ('duty' in settings) settings.duty = Math.min(85, Math.max(15, settings.duty));
  if ('accentDecay' in settings) settings.accentDecay = Math.min(450, Math.max(10, settings.accentDecay));
  if ('dividerRatio' in settings && ![2, 3, 4, 8].includes(settings.dividerRatio)) settings.dividerRatio = defaults.dividerRatio;
  if ('division' in settings && ![1, 2, 4].includes(settings.division)) settings.division = defaults.division;
  if ('keyVelocity' in settings) settings.velocity = settings.keyVelocity / 100;
  settings.note = null;
  settings.retriggering = false;
  settings.playing = false;
  const seen = new Set();
  const cables = Array.isArray(snapshot.cables) ? snapshot.cables.filter((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1] || !pair.every((port) => allPorts.has(port))) return false;
    const key = JSON.stringify([...pair].sort());
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) : [];
  return { settings, cables, instances, instruments, patterns };
}

export function readSavedPatches(storage) {
  const data = JSON.parse(storage.getItem('patchlab-patches-v1') ?? 'null');
  if (data?.version !== 1 || !Array.isArray(data.patches)) return [];
  return data.patches.filter((item) => typeof item?.name === 'string' && item.snapshot && typeof item.snapshot === 'object');
}

export function saveNamedPatch(storage, name, snapshot, lesson) {
  const patches = readSavedPatches(storage);
  const clean = name.trim();
  if (!clean || clean.length > 48) return 'Enter a patch name up to 48 characters.';
  if (patches.some((patch) => patch.name.toLowerCase() === clean.toLowerCase())) return 'That name is already saved. Choose another name.';
  storage.setItem('patchlab-patches-v1', JSON.stringify({ version: 1, patches: [...patches, { name: clean, snapshot, ...(lesson ? { lesson } : {}) }] }));
  return '';
}
