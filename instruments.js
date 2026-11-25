import { createModuleInstance, instanceDefaults, instanceJack, MAX_INSTANCES, moduleCatalog } from './module-instances.js';

export function instrumentModuleIds(ports, instances) {
  const ids = new Set(instances.map((item) => item.id));
  for (const [id, port] of ports instanceof Map ? ports : []) {
    if (!id.includes(':') && port && Object.hasOwn(moduleCatalog, port.module)) ids.add(port.module);
  }
  return ids;
}
export function readInstruments(value = [], modules, ports = new Map()) {
  if (!Array.isArray(value) || value.length > MAX_INSTANCES + Object.keys(moduleCatalog).length) throw new Error('Invalid instrument list.');
  const ids = new Set(), members = new Set();
  return value.map((item) => {
    if (!item || !/^i[1-9]\d{0,5}$/.test(item.id) || ids.has(item.id)) throw new Error('Invalid or duplicate instrument ID.');
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 48) throw new Error('Instrument names must be 1–48 characters.');
    if (!Array.isArray(item.members) || !item.members.length) throw new Error('An instrument needs modules.');
    ids.add(item.id);
    for (const member of item.members) {
      if (!modules.has(member) || members.has(member)) throw new Error('Unknown or multiply grouped instrument module.');
      members.add(member);
    }
    if (item.ports !== undefined && (!Array.isArray(item.ports) || item.ports.length > 8 || item.ports.some(p => !p || typeof p.label !== 'string' || !p.label.trim() || p.label.length > 32 || !item.members.includes(ports.get(p.jack)?.module)) || new Set(item.ports.map(p=>p.label)).size !== item.ports.length)) throw new Error('Invalid instrument interface port.');
    return { id: item.id, name: item.name.trim(), members: [...item.members], ...(item.ports ? {ports:item.ports.map(p=>({label:p.label,jack:p.jack}))} : {}) };
  });
}
export function nextInstrumentId(items, prefix) {
  const used = new Set(items.map((item) => item.id));
  for (let i = 1; i <= 999999; i++) if (!used.has(prefix + i)) return prefix + i;
  throw new Error('No module identity available.');
}

// Plan the entire copy before mutating live state, history, nodes or cables.
export function duplicateInstrument(state, cables, id, descriptors, ports, external = true) {
  const original = state.instruments.find((item) => item.id === id);
  if (!original) throw new Error('Instrument no longer exists.');
  const available = MAX_INSTANCES - state.instances.length;
  if (original.members.length > available) throw new Error('This instrument needs ' + original.members.length + ' free module slots; ' + available + ' available.');
  const instances = [...state.instances];
  const remap = new Map();
  const members = [];
  for (const member of original.members) {
    const descriptor = descriptors.get(member);
    if (!descriptor || !Object.hasOwn(moduleCatalog, descriptor.type)) throw new Error('This instrument contains an unavailable module.');
    const existing = state.instances.find((item) => item.id === member);
    const settings = existing ? existing.settings : Object.fromEntries(Object.entries(instanceDefaults(descriptor.type)).map(([key, initial]) => [key, state[key] ?? initial]));
    const copy = createModuleInstance(descriptor.type, nextInstrumentId(instances, 'm'), descriptor.name + ' copy', settings);
    instances.push(copy); members.push(copy.id);
    for (const [portId, port] of ports) if (port.module === member) remap.set(portId, instanceJack(copy.id, port.base || portId));
  }
  const duplicated = cables.flatMap(([from, to]) => {
    const a = remap.has(from), b = remap.has(to);
    if (!(a && b) && !(external && (a || b))) return [];
    return [[remap.get(from) ?? from, remap.get(to) ?? to]];
  });
  const instrument = { id: nextInstrumentId(state.instruments, 'i'), name: (original.name + ' copy').slice(0, 48), members, ...(original.ports ? {ports:original.ports.map(p=>({...p,jack:remap.get(p.jack)}))} : {}) };
  return { instances, instruments: [...state.instruments, instrument], cables: [...cables.map((pair) => [...pair]), ...duplicated], instrument };
}

export function instrumentInterface(members, ports) {
  const candidates=[...ports].filter(([,port])=>members.includes(port.module));
  const find=keys=>{for(const key of keys){const found=candidates.find(([id,port])=>(port.base || id)===key);if(found)return found[0];}};
  return [['Trigger / Gate',find(['phraseTriggerIn','gateIn','accentTriggerIn'])],['Pitch',find(['pitchIn'])],['Audio out',find(['vcaOut','accentOut','filterOut','oscOut','noiseOut'])]].filter(([,jack])=>jack).map(([label,jack])=>({label,jack}));
}
