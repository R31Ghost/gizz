export const keyboardDefaults = Object.freeze({
  octave: 0, velocity: 0.8, keyVelocity: 80, volume: 100, bend: 0, controller: 0,
  glide: 0, priority: 'high', retrigger: false, retriggering: false, invertGate: false, midiChannel: 1, ccNumber: 1, referenceNote: 57, volumeVelocity: true, controllerVelocity: false,
});

export function chooseHeld(held, priority) {
  const keys = [...held.values()];
  if (priority === 'last') return keys.at(-1);
  return keys.reduce((winner, key) => {
    if (!winner) return key;
    return (priority === 'high' ? key.note >= winner.note : key.note <= winner.note) ? key : winner;
  }, undefined);
}

export function keyboardGate(state) {
  const pressed = state.note !== null && !state.retriggering;
  return state.invertGate ? !pressed : pressed;
}

export function parseMidi([status, key, value], channel, ccNumber) {
  if ((status & 15) + 1 !== channel) return [];
  switch (status & 240) {
    case 144: return value ? [['press', key, value / 127]] : [['release', key]];
    case 128: return [['release', key]];
    case 224: return [['bend', ((value << 7) + key - 8192) / 8192]];
    case 176: {
      const updates = [];
      if (key === 64) updates.push(['sustain', value >= 64]);
      if (key === 68) updates.push(['legato', value >= 64]);
      if (key === 7) updates.push(['volume', value * 100 / 127]);
      if (key === ccNumber) updates.push(['controller', value / 127]);
      if (key === 120 || key === 123) updates.push(['releaseDevice']);
      if (key === 121) updates.push(['bend', 0], ['controller', 0], ['sustain', false], ['legato', false]);
      return updates;
    }
    default: return [];
  }
}
