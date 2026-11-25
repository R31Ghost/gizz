import { setupSequenceEditor } from './sequence-editor.js';
import { pulseIntervalMs } from './rhythm-core.js';

export function setupRhythmControls(state, noteName, apply, onTransport, options = {}) {
  const get = (id) => document.getElementById(id);
  const controls = get('sequencer-steps');
  const division = get('division');
  const editor = setupSequenceEditor({
    container: controls, id: 'original', state, settings: () => state,
    edit(change) { Object.assign(state, change); apply(); }, apply, noteName,
    ...options,
  });

  division.addEventListener('change', () => {
    state.division = Number(division.value);
    apply();
  });
  get('clock-transport').addEventListener('click', onTransport);


  return {
    receive: editor.update,
    sync() {
      division.value = state.division;
      editor.sync();
    },
    update(step) {
      const interval = Math.round(pulseIntervalMs(state.bpm, state.division)) + ' ms between pulses';
      const clock = get('clock-interval');
      if (clock.textContent !== interval) clock.textContent = interval;
      const transport = get('clock-transport');
      const action = state.playing ? 'Stop clock' : 'Play clock';
      if (transport.textContent !== action) transport.textContent = action;
      transport.setAttribute('aria-pressed', state.playing);
      editor.update(options.signal?.() ?? { step });
    },
  };
}
