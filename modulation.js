import { setAudioTarget } from './audio.js';

export const modulationDefaults = Object.freeze({
  cutoffStep: 36, resonance: 2, lfoRate: 2, lfoShape: 'sine', attenuation: 50,
});

export function cutoffHz(step) {
  return 55 * 2 ** (step / 12);
}

export function createModulation(context, oscillator) {
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  const lfo = context.createOscillator();
  lfo.frequency.value = modulationDefaults.lfoRate;
  const attenuator = context.createGain();

  // These adapters convert normalized CV to the destination's cents scale.
  const pitchDepth = context.createGain();
  pitchDepth.gain.value = 200;
  pitchDepth.connect(oscillator.detune);
  const cutoffDepth = context.createGain();
  cutoffDepth.gain.value = 1200;
  cutoffDepth.connect(filter.detune);
  lfo.start();

  return {
    nodes: {
      filterIn: filter, filterOut: filter, cutoffIn: cutoffDepth,
      lfoOut: lfo, attenIn: attenuator, attenOut: attenuator, modPitchIn: pitchDepth,
    },
    inputs: ['filterIn', 'cutoffIn', 'attenIn', 'modPitchIn'],
    apply(state, now, active = () => true) {
      if (active('Low-pass filter')) {
        setAudioTarget(filter.frequency, cutoffHz(state.cutoffStep), now, 0.015);
        setAudioTarget(filter.Q, state.resonance, now, 0.015);
      }
      if (active('LFO')) {
        setAudioTarget(lfo.frequency, state.lfoRate, now, 0.015);
        if (lfo.type !== state.lfoShape) lfo.type = state.lfoShape;
      }
      if (active('Attenuator')) setAudioTarget(attenuator.gain, state.attenuation / 100, now, 0.015);
    },
  };
}
