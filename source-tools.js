import { setAudioTarget } from './audio.js';

export const sourceDefaults = Object.freeze({ mixerA: 70, mixerB: 20, mixerC: 0, mixerD: 0, scopeWindow: 25, scopeRange: 1 });

const scopeHistory = 32768;

function scopeSampleCount(milliseconds, sampleRate) {
  return Math.min(scopeHistory, Math.max(2, Math.round(sampleRate * milliseconds / 1000)));
}

export function scopeWindowMs(milliseconds, sampleRate = 48000) {
  return scopeSampleCount(milliseconds, sampleRate) * 1000 / sampleRate;
}

export function createSourceTools(context) {
  const mixer = context.createGain();
  const mixerInputs = ['mixInA', 'mixInB', 'mixInC', 'mixInD'].map((id) => {
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(mixer);
    return [id, gain];
  });

  const noise = context.createBufferSource();
  const buffer = context.createBuffer(1, 4 * context.sampleRate, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;
  noise.loop = true;
  noise.start();
  const darkNoise = context.createBiquadFilter();
  darkNoise.type = 'lowpass';
  darkNoise.frequency.value = 900;
  darkNoise.Q.value = 0;
  noise.connect(darkNoise);

  const silent = context.createGain();
  silent.gain.value = 0;
  silent.connect(context.destination);
  const scope = ['scopeInA', 'scopeInB'].map((id) => {
    const analyser = context.createAnalyser();
    analyser.fftSize = scopeHistory;
    analyser.connect(silent);
    return [id, analyser, new Float32Array(analyser.fftSize)];
  });

  return {
    nodes: {
      ...Object.fromEntries(mixerInputs), ...Object.fromEntries(scope), mixOut: mixer, noiseOut: noise,
      darkNoiseOut: darkNoise, scopeThruA: scope[0][1], scopeThruB: scope[1][1],
    },
    inputs: [...mixerInputs, ...scope].map(([id]) => id),
    apply(state, now) {
      for (const [index, key] of ['mixerA', 'mixerB', 'mixerC', 'mixerD'].entries()) {
        setAudioTarget(mixerInputs[index][1].gain, state[key] / 100, now, 0.012);
      }
    },
    readScope(milliseconds) {
      const count = scopeSampleCount(milliseconds, context.sampleRate);
      return scope.map(([, analyser, history]) => {
        analyser.getFloatTimeDomainData(history);
        return history.subarray(history.length - count);
      });
    },
  };
}
