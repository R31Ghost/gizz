export const MAX_GAIN = 0.15;
const audioTargets = new WeakMap();

export function setAudioTarget(parameter, value, time, timeConstant) {
  const previous = audioTargets.get(parameter);
  if (previous?.value === value && previous.timeConstant === timeConstant) return;
  parameter.setTargetAtTime(value, time, timeConstant);
  audioTargets.set(parameter, { value, timeConstant });
}

export function pitchHz(semitones) {
  return 110 * 2 ** (semitones / 12);
}

export function outputGain({ patched, muted, level }) {
  return patched && !muted ? MAX_GAIN * (level / 100) : 0;
}

export function createAudioEngine() {
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) throw new Error('Web Audio is unavailable in this browser.');

  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const output = context.createGain();
  output.gain.value = 0;
  oscillator.connect(output);
  output.connect(context.destination);
  oscillator.start();

  return {
    context,
    apply(state) {
      const now = context.currentTime;
      if (oscillator.type !== state.waveform) oscillator.type = state.waveform;
      setAudioTarget(oscillator.frequency, pitchHz(state.pitch), now, 0.01);
      setAudioTarget(output.gain, outputGain(state), now, 0.008);
    },
  };
}
