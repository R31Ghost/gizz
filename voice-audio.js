import { createInstanceAudio } from './instance-audio.js';
import { outputGain, setAudioTarget } from './audio.js';
import { EnvelopeTimeline } from './envelope.js';
import { createModulation } from './modulation.js';
import { createFreeRouting, sourcesAt } from './free-routing.js';
import { createSourceTools } from './source-tools.js';
import { createRhythm, workletConfig } from './rhythm.js';
import { createJackProbe } from './jack-meter.js';

export function noteHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export const voicePatch = Object.freeze({
  pitchIn: 'pitchOut',
  gateIn: 'gateOut',
  cvIn: 'envOut',
  vcaIn: 'oscOut',
  audioIn: 'vcaOut',
});

export const modulationPatch = Object.freeze({
  ...voicePatch, filterIn: 'oscOut', vcaIn: 'filterOut', attenIn: 'lfoOut', cutoffIn: 'attenOut',
});

export const studioPatch = Object.freeze({
  ...modulationPatch, filterIn: 'mixOut', mixInA: 'oscOut', mixInB: 'noiseOut', scopeInA: 'mixOut', scopeInB: 'envOut',
});

export function createVoiceEngine({ modulation = false, freeRouting = false, studio = false, onSequencePattern = () => {} } = {}) {
  const Context = window.AudioContext ?? window.webkitAudioContext;
  if (!Context) throw new Error('Web Audio is unavailable.');
  const context = new Context();
  const oscillator = context.createOscillator();
  const vca = context.createGain();
  const output = context.createGain();
  const envelope = context.createConstantSource();
  vca.gain.value = 0;
  output.gain.value = 0;
  envelope.offset.value = 0;
  output.connect(context.destination);
  oscillator.start();
  envelope.start();

  const extras = modulation ? createModulation(context, oscillator) : null;
  const free = freeRouting ? createFreeRouting(context, oscillator, vca, output, studio) : null;
  const sources = studio ? createSourceTools(context) : null;
  const envelopeOut = free ? context.createGain() : envelope;
  if (free) envelope.connect(envelopeOut);
  const inverted = freeRouting ? context.createGain() : null;
  if (inverted) {
    inverted.gain.value = -1;
    envelopeOut.connect(inverted);
  }
  const nodes = {
    oscOut: oscillator, vcaIn: vca, vcaOut: vca, audioIn: output,
    envOut: envelopeOut, cvIn: vca.gain,
    ...extras?.nodes,
    ...free?.nodes,
    ...sources?.nodes,
    ...(inverted ? { envInvOut: inverted } : {}),
  };
  const inputs = ['vcaIn', 'audioIn', 'cvIn', ...(extras?.inputs ?? []), ...(free?.inputs ?? []), ...(sources?.inputs ?? [])];
  const wired = {};
  let rhythm;
  let latestState;
  let configureEnvelope;
  let envelopeProbe;
  let envelopeEpoch = 0;
  const probes = new Map();
  const instances = new Map();
  let instanceWorklets = false;
  const timeline = new EnvelopeTimeline();

  function syncInstances(state) {
    const wanted = new Map((state.instances ?? []).filter((item) => !state.activeModules || state.activeModules.has(item.id)).map((item) => [item.id, item]));
    for (const [id, module] of instances) {
      if (wanted.get(id)?.type === module.type) continue;
      const belongs = (port) => port.startsWith(id + ':');
      // Disconnect incoming and outgoing cables before releasing any owned nodes.
      for (const [target, sources] of Object.entries(wired)) {
        for (const source of sources) if (belongs(target) || belongs(source)) nodes[source]?.disconnect(nodes[target]);
        if (belongs(target)) delete wired[target];
        else wired[target] = sources.filter((source) => !belongs(source));
      }
      for (const { probe } of probes.values()) probe.connect([]);
      module.close();
      for (const port of Object.keys(module.nodes)) delete nodes[port];
      for (const input of module.inputs) { const i = inputs.indexOf(input); if (i !== -1) inputs.splice(i, 1); }
      instances.delete(id);
    }
    for (const [id, item] of wanted) {
      if (instances.has(id)) continue;
      const module = createInstanceAudio(context, item, instanceWorklets, signal => onSequencePattern(item.id, signal));
      instances.set(id, module);
      Object.assign(nodes, module.nodes);
      inputs.push(...module.inputs);
    }
  }

  function wire(patch) {
    const changes = [];
    for (const target of inputs) {
      const previous = wired[target] ?? [];
      const next = sourcesAt(patch[target]).filter((source) => nodes[source]);
      if (previous.length === next.length && previous.every((source) => next.includes(source))) continue;
      changes.push({ target, previous, next });
      for (const source of previous) {
        if (!next.includes(source)) nodes[source].disconnect(nodes[target]);
      }
    }
    for (const { target, previous, next } of changes) {
      for (const source of next) {
        if (!previous.includes(source)) nodes[source].connect(nodes[target]);
      }
      wired[target] = next;
    }
    if (changes.length) wireProbes();
  }

  function wireProbes() {
    for (const [id, { direction, probe }] of probes) {
      const ids = direction === 'out' ? [id] : sourcesAt(latestState?.patch[id]);
      probe.connect(ids.map((source) => nodes[source]).filter(Boolean));
    }
  }

  function gateInputHigh(state) {
    const { patch, note } = state;
    return free ? free.gateHigh(patch.gateIn, state) : Boolean(patch.gateIn && note !== null);
  }

  function writeEnvelope(points) {
    if (!points) return;
    const [[now, level], ...ramps] = points;
    envelope.offset.cancelScheduledValues(now);
    envelope.offset.setValueAtTime(level, now);
    for (const [time, value] of ramps) {
      envelope.offset.linearRampToValueAtTime(value, time);
    }
  }

  return {
    context,
    async prepareWorklets({ sequencing, evolving }) {
      await context.audioWorklet.addModule(new URL('./rhythm-worklet.js', import.meta.url));
      instanceWorklets = true;
      const processor = new AudioWorkletNode(context, 'patchlab-envelope', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit',
      });
      envelopeProbe = createJackProbe(context);
      envelopeProbe.connect([envelopeOut]);
      nodes.gateIn.connect(processor);
      processor.connect(envelopeOut);
      envelope.disconnect(envelopeOut);
      envelope.stop();
      configureEnvelope = workletConfig(processor);
      if (sequencing) {
        rhythm = createRhythm(context, evolving, signal => onSequencePattern('original', signal));
        Object.assign(nodes, rhythm.nodes);
        inputs.push(...rhythm.inputs);
      }
    },
    inspectJacks(jacks) {
      for (const [id, { probe }] of probes) {
        if (jacks.some((jack) => jack.id === id)) continue;
        probe.close();
        probes.delete(id);
      }
      for (const { id, direction } of jacks) {
        if (!probes.has(id)) probes.set(id, { direction, probe: createJackProbe(context) });
      }
      wireProbes();
    },
    readJack(id) { return probes.get(id)?.probe.read() ?? 0; },
    rhythmSignal() { return rhythm?.signal; },
    rhythmStep() { return rhythm?.signal.step ?? -1; },
    apply(state) {
      latestState = state;
      const { patch, lastNote } = state;
      const now = context.currentTime;
      syncInstances(state);
      wire(patch);
      wireProbes();
      for (const item of state.instances ?? []) instances.get(item.id)?.apply(item.settings, state, envelopeEpoch);
      const active = (name) => !state.activeModules || state.activeModules.has(name);
      extras?.apply(state, now, active);
      if (active('Keyboard')) free?.apply(state, now);
      if (active('Mixer')) sources?.apply(state, now);
      rhythm?.apply(state, active);
      if (active('Oscillator')) {
        if (oscillator.type !== state.waveform) oscillator.type = state.waveform;
        setAudioTarget(oscillator.frequency, noteHz((!free && patch.pitchIn ? lastNote : 57) + (state.transpose ?? 0)), now, 0.008);
      }
      setAudioTarget(output.gain, outputGain({ ...state, patched: Boolean(patch.audioIn) }), now, 0.008);
      const envelopeActive = active('ADSR Envelope');
      if (configureEnvelope) {
        const { attack, decay, sustain, release } = state;
        configureEnvelope({ attack, decay, sustain, release, epoch: envelopeEpoch, active: envelopeActive });
      } else if (envelopeActive) {
        const sampled = free && patch.gateIn && patch.gateIn !== 'gateOut';
        writeEnvelope(timeline.update(now, sampled ? timeline.gate : gateInputHigh(state), state));
      } else if (timeline.gate || timeline.levelAt(now) > 0) {
        writeEnvelope(timeline.reset(now));
      }
    },
    sampleGate(state = latestState) {
      for (const module of instances.values()) module.sample();
      if (!configureEnvelope && free && state?.patch.gateIn && state.patch.gateIn !== 'gateOut') {
        writeEnvelope(timeline.update(context.currentTime, gateInputHigh(state), state));
      }
    },
    readInstance(id) {
      const item = latestState?.instances?.find((item) => item.id === id);
      return item ? instances.get(id)?.read(item.settings) : undefined;
    },
    readScope(milliseconds) {
      return sources?.readScope(milliseconds);
    },
    gateIsHigh() {
      return configureEnvelope ? Boolean(latestState && gateInputHigh(latestState)) : timeline.gate;
    },
    resetEnvelope() {
      envelopeEpoch++;
      if (!configureEnvelope) writeEnvelope(timeline.reset(context.currentTime));
    },
    envelopeLevel() {
      return configureEnvelope ? envelopeProbe.read() : timeline.levelAt(context.currentTime);
    },
  };
}
