import { setAudioTarget } from './audio.js';
import { keyboardGate } from './keyboard-controller.js';

function endpoints([first, second], ports) {
  return ports.get(first).direction === 'out' ? [first, second] : [second, first];
}

export function toggleCable(cables, first, second, ports) {
  const pair = endpoints([first, second], ports);
  const sameCable = cables.findIndex((cable) => cable.includes(first) && cable.includes(second));
  if (sameCable !== -1) return cables.filter((_, index) => index !== sameCable);
  return [...cables, pair];
}

export function sourcesAt(connection) {
  return Array.isArray(connection) ? connection : connection ? [connection] : [];
}

export function resolveCables(cables, ports) {
  const graph = new Map();
  const patch = {};
  function reaches(module, target) {
    return module === target || (graph.get(module) ?? []).some((next) => reaches(next, target));
  }

  const connections = cables.map(([source, input]) => {
    const from = ports.get(source);
    const to = ports.get(input);
    let status = 'active';
    if (from.direction === to.direction) status = 'direction';
    else if (reaches(to.module, from.module)) status = 'feedback';
    else {
      graph.set(from.module, [...(graph.get(from.module) ?? []), to.module]);
      patch[input] = patch[input] ? [...sourcesAt(patch[input]), source] : source;
    }
    return { source, input, status, crossType: from.kind !== to.kind };
  });
  return { patch, connections };
}

export function createFreeRouting(context, oscillator, vca, output, studio) {
  const pitch = context.createConstantSource();
  const gate = context.createConstantSource();
  let lastGate = false;
  const pitchInput = context.createGain();
  pitchInput.gain.value = 1200;
  pitchInput.connect(oscillator.detune);

  const gateInput = context.createAnalyser();
  gateInput.fftSize = 128;
  const samples = new Float32Array(gateInput.fftSize);
  const silent = context.createGain();
  silent.gain.value = 0;
  gateInput.connect(silent);
  silent.connect(context.destination);

  const vcaControl = context.createWaveShaper();
  vcaControl.curve = Float32Array.of(0, 0, 1);
  vcaControl.connect(vca.gain);

  const dcBlock = context.createBiquadFilter();
  dcBlock.type = 'highpass';
  dcBlock.frequency.value = 20;
  dcBlock.Q.value = 0;
  const limiter = context.createWaveShaper();
  limiter.curve = Float32Array.of(-1, 0, 1);
  dcBlock.connect(limiter);
  limiter.connect(output);

  pitch.offset.value = 0;
  gate.offset.value = 0;
  pitch.start();
  gate.start();

  const performance = {};
  if (studio) {
    for (const name of ['bendOut', 'velocityOut', 'controllerOut']) {
      const source = context.createConstantSource();
      source.offset.value = 0;
      source.start();
      performance[name] = source;
    }
  }

  return {
    nodes: { ...performance, pitchOut: pitch, gateOut: gate, pitchIn: pitchInput, gateIn: gateInput, audioIn: dcBlock, cvIn: vcaControl },
    inputs: ['pitchIn', 'gateIn'],
    apply(state, now) {
      setAudioTarget(pitch.offset, (state.lastNote - (state.referenceNote ?? 57)) / 12, now, studio ? Math.max(0.001, state.glide / 3000) : 0.008);
      const high = keyboardGate(state);
      if (high !== lastGate) {
        gate.offset.setValueAtTime(high ? 1 : 0, now);
        lastGate = high;
      }
      if (studio) {
        setAudioTarget(performance.bendOut.offset, state.bend * 2.5, now, 0.008);
        setAudioTarget(performance.velocityOut.offset, (state.volumeVelocity ? state.velocity : 1) * state.volume / 100, now, 0.008);
        setAudioTarget(performance.controllerOut.offset, state.controller * (state.controllerVelocity ? state.velocity : 1), now, 0.008);
      }
    },
    gateHigh(source, state) {
      if (!source) return false;
      if (source === 'gateOut') return keyboardGate(state);
      gateInput.getFloatTimeDomainData(samples);
      return samples.at(-1) >= 0.5;
    },
  };
}
