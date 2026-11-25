export const MAX_STEPS = 128;
export const MAX_PATTERNS = 64;
export function validSteps(value) {
  return Array.isArray(value) && [8, 16, 32, 64, 128].includes(value.length) && value.every(step => step && Number.isInteger(step.pitch) && step.pitch >= -12 && step.pitch <= 24 && typeof step.on === 'boolean');
}
export function sequenceSettings(value) {
  if (!value || !validSteps(value.steps)) throw new Error('A sequence needs 8 legacy steps or 16/32/64/128 steps with valid pitches and gates.');
  const sequenceLength = value.sequenceLength ?? value.steps.length;
  if (!Number.isInteger(sequenceLength) || sequenceLength < 1 || sequenceLength > Math.max(16, value.steps.length)) throw new Error('Sequence length must be 1–128.');
  const steps = Array.from({ length: Math.max(16, value.steps.length) }, (_, i) => ({ pitch: value.steps[i]?.pitch ?? 0, on: value.steps[i]?.on ?? false }));
  return { steps, sequenceLength };
}
export function readPatternLibrary(value = []) {
  if (!Array.isArray(value) || value.length > MAX_PATTERNS) throw new Error('The pattern library holds up to 64 patterns.');
  const ids = new Set(), names = new Set();
  return value.map(item => {
    if (!item || !/^p[1-9]\d{0,5}$/.test(item.id) || ids.has(item.id)) throw new Error('Invalid or duplicate pattern identity.');
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 48 || names.has(item.name.trim().toLowerCase())) throw new Error('Use a unique pattern name of 1–48 characters.');
    ids.add(item.id); names.add(item.name.trim().toLowerCase());
    return { id: item.id, name: item.name.trim(), ...sequenceSettings(item) };
  });
}
const nextId = items => { let i = 1; while (items.some(item => item.id === 'p' + i)) i++; return 'p' + i; };
const same = (a, b) => a.sequenceLength === b.sequenceLength && JSON.stringify(a.steps) === JSON.stringify(b.steps);
export const patternMatches = (pattern, settings) => Boolean(pattern && same(pattern, sequenceSettings(settings)));
export function mergePatternLibraries(current, incoming) {
  const result = readPatternLibrary(current);
  for (const item of readPatternLibrary(incoming)) {
    let name = item.name, suffix = 2, existing;
    while ((existing = result.find(old => old.name.toLowerCase() === name.toLowerCase())) && !same(existing, item)) name = item.name.slice(0, 40) + ' (' + suffix++ + ')';
    if (existing) continue;
    result.push({ ...item, id: nextId(result), name });
  }
  return readPatternLibrary(result);
}
export function createPatternLibrary(storage) {
  const key = 'patchlab-sequence-patterns-v1', subscribers = new Set(), history = [];
  let entries = [], error = '';
  try {
    const saved = JSON.parse(storage?.getItem(key) || 'null');
    if (saved !== null) {
      if (saved.version !== 1) throw new Error('Unsupported pattern library version.');
      entries = readPatternLibrary(saved.patterns);
    }
  } catch { error = 'Saved patterns could not be read. Export your current patch before changing browser storage.'; }
  function commit(next, record = true) {
    const clean = readPatternLibrary(next);
    if (!storage) throw new Error('Pattern saving is unavailable in this browser.');
    storage.setItem(key, JSON.stringify({ version: 1, patterns: clean }));
    if (record) { history.push(entries); if (history.length > 16) history.shift(); }
    entries = clean; error = ''; for (const fn of subscribers) fn();
  }
  return {
    get entries() { return structuredClone(entries); }, get error() { return error; }, get canUndo() { return history.length > 0; },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    save(name, settings, replace = false) {
      const clean = name.trim();
      if (!clean || clean.length > 48) throw new Error('Enter a pattern name up to 48 characters.');
      const existing = entries.find(item => item.name.toLowerCase() === clean.toLowerCase());
      if (existing && !replace) throw new Error('That name is saved. Use Replace saved, or choose another name.');
      const item = { id: existing?.id || nextId(entries), name: clean, ...sequenceSettings(settings) };
      commit(existing ? entries.map(old => old.id === existing.id ? item : old) : [...entries, item]); return item;
    },
    remove(id) { if (entries.some(item => item.id === id)) commit(entries.filter(item => item.id !== id)); },
    merge(incoming) { const next = mergePatternLibraries(entries, incoming); if (JSON.stringify(next) !== JSON.stringify(entries)) commit(next); },
    undo() { if (!history.length) return; const previous = history.at(-1); commit(previous, false); history.pop(); for (const fn of subscribers) fn(); },
  };
}
let requestSerial = 0;
export function sequenceRuntime(state, id) {
  state.sequenceRuntime ||= {};
  return state.sequenceRuntime[id] ||= { epoch: 0, request: null };
}
export function queuePattern(state, id, pattern, when) {
  const runtime = sequenceRuntime(state, id);
  runtime.request = { ...structuredClone(pattern), when, token: ++requestSerial };
  return runtime.request;
}
