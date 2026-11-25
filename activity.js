import { sourcesAt } from './free-routing.js';

export const SILENT_LIMIT_MS = 10 * 60 * 1000;

export function activeRoutes(patch, ports, { audio, visual, visualInputs = [] }) {
  const live = {};
  const modules = new Set();
  const outputs = new Set();
  function visit(input) {
    if (!patch[input] || Object.hasOwn(live, input)) return;
    live[input] = patch[input];
    modules.add(ports.get(input).module);
    for (const source of sourcesAt(patch[input])) {
      if (outputs.has(source)) continue;
      outputs.add(source);
      const { module } = ports.get(source);
      modules.add(module);
      const thru = ports.get(source).thru ?? { scopeThruA: 'scopeInA', scopeThruB: 'scopeInB' }[source];
      for (const [id, port] of ports) {
        if (port.direction === 'in' && port.module === module && (!thru || id === thru)) visit(id);
      }
    }
  }
  if (audio) visit('audioIn');
  if (visual) {
    visit('scopeInA');
    visit('scopeInB');
  }
  for (const input of visualInputs) visit(input);
  return { patch: live, modules, outputs };
}
