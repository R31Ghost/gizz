import { setAudioTarget } from './audio.js';
import { EnvelopeTimeline } from './envelope.js';
import { keyboardGate } from './keyboard-controller.js';
import { cutoffHz } from './modulation.js';
import { createJackProbe } from './jack-meter.js';
import { workletConfig } from './rhythm.js';
import { instanceJack, moduleCatalog } from './module-instances.js';

// One allocation owns one module. No oscillator, timeline or worklet is shared.
export function createInstanceAudio(context, item, worklets = false, onPattern = () => {}) {
  const owned = new Set();
  const started = new Set();
  const probes = [];
  const local = {};
  let apply = () => {};
  let sample = () => {};
  let read = () => ({});
  const own = (node) => { owned.add(node); return node; };
  const start = (node) => { node.start(); started.add(node); return node; };
  const gain = (value = 1) => { const node = own(context.createGain()); node.gain.value = value; return node; };
  const probe = (node) => { const p = createJackProbe(context); p.connect([node]); probes.push(p); return p; };
  const processor = (name, numberOfInputs = 1, numberOfOutputs = 1) => own(new AudioWorkletNode(context, name, {
    numberOfInputs, numberOfOutputs, outputChannelCount: Array(numberOfOutputs).fill(1), channelCount: 1, channelCountMode: 'explicit',
  }));
  const now = () => context.currentTime;
  const target = (param, value) => setAudioTarget(param, value, now(), 0.008);
  const audioSource = (type) => {
    const oscillator = own(context.createOscillator());
    oscillator.type = type;
    start(oscillator);
    return oscillator;
  };
  if (item.type === 'Oscillator') {
    const osc = audioSource(item.settings.waveform);
    const pitch = gain(1200);
    const fm = gain(200);
    pitch.connect(osc.detune);
    fm.connect(osc.detune);
    Object.assign(local, { oscOut: osc, pitchIn: pitch, modPitchIn: fm });
    apply = (s) => { osc.type = s.waveform; target(osc.frequency, 220 * 2 ** (s.transpose / 12)); };
  } else if (item.type === 'ADSR Envelope') {
    const gate = gain();
    const normal = gain();
    const inverse = gain(-1);
    normal.connect(inverse);
    const gateProbe = probe(gate);
    Object.assign(local, { gateIn: gate, envOut: normal, envInvOut: inverse });
    if (worklets) {
      const envelope = processor('patchlab-envelope');
      gate.connect(envelope);
      envelope.connect(normal);
      const configure = workletConfig(envelope);
      const meter = probe(normal);
      apply = (s, _state, epoch) => configure({ ...s, active: true, epoch });
      read = () => ({ level: meter.read(), gate: gateProbe.read() >= 0.5 });
    } else {
      const source = own(context.createConstantSource());
      source.offset.value = 0;
      source.connect(normal);
      start(source);
      const timeline = new EnvelopeTimeline();
      let previousEpoch;
      let settings;
      let latestState;
      const write = (points) => {
        if (!points) return;
        const [[time, level], ...ramps] = points;
        source.offset.cancelScheduledValues(time);
        source.offset.setValueAtTime(level, time);
        for (const [end, value] of ramps) source.offset.linearRampToValueAtTime(value, end);
      };
      const gateHigh = () => latestState.patch[instanceJack(item.id, 'gateIn')] === 'gateOut' ? keyboardGate(latestState) : gateProbe.read() >= 0.5;
      sample = () => { if (settings) write(timeline.update(now(), gateHigh(), settings)); };
      apply = (s, state, epoch) => {
        settings = s; latestState = state;
        if (epoch !== previousEpoch) { write(timeline.reset(now())); previousEpoch = epoch; }
        sample();
      };
      read = () => ({ level: timeline.levelAt(now()), gate: timeline.gate });
    }
  } else if (item.type === 'VCA') {
    const vca = gain(0);
    const control = own(context.createWaveShaper());
    control.curve = Float32Array.of(0, 0, 1);
    control.connect(vca.gain);
    Object.assign(local, { vcaIn: vca, vcaOut: vca, cvIn: control });
  } else if (item.type === 'Low-pass filter') {
    const filter = own(context.createBiquadFilter());
    filter.type = 'lowpass';
    const cv = gain(1200);
    cv.connect(filter.detune);
    Object.assign(local, { filterIn: filter, filterOut: filter, cutoffIn: cv });
    apply = (s) => { target(filter.frequency, cutoffHz(s.cutoffStep)); target(filter.Q, s.resonance); };
  } else if (item.type === 'LFO') {
    const lfo = audioSource(item.settings.lfoShape);
    local.lfoOut = lfo;
    apply = (s) => { lfo.type = s.lfoShape; target(lfo.frequency, s.lfoRate); };
  } else if (item.type === 'Attenuator') {
    const attenuator = gain(0);
    Object.assign(local, { attenIn: attenuator, attenOut: attenuator });
    apply = (s) => target(attenuator.gain, s.attenuation / 100);
  } else if (item.type === 'Mixer') {
    const mix = gain();
    local.mixOut = mix;
    for (const c of ['A', 'B', 'C', 'D']) { const channel = gain(0); channel.connect(mix); local['mixIn' + c] = channel; }
    apply = (s) => { for (const c of ['A', 'B', 'C', 'D']) target(local['mixIn' + c].gain, s['mixer' + c] / 100); };
  } else if (item.type === 'Noise') {
    const noise = own(context.createBufferSource());
    const buffer = context.createBuffer(1, 4 * context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    noise.loop = true;
    start(noise);
    const dark = own(context.createBiquadFilter());
    dark.type = 'lowpass'; dark.frequency.value = 900; dark.Q.value = 0;
    noise.connect(dark);
    Object.assign(local, { noiseOut: noise, darkNoiseOut: dark });
  } else if (item.type === 'Scope') {
    const silent = gain(0);
    silent.connect(context.destination);
    const channels = ['A', 'B'].map((c) => {
      const analyser = own(context.createAnalyser());
      analyser.fftSize = 32768;
      analyser.connect(silent);
      local['scopeIn' + c] = local['scopeThru' + c] = analyser;
      return { analyser, buffer: new Float32Array(32768) };
    });
    read = (settings) => ({ traces: channels.map(({ analyser, buffer }) => {
      analyser.getFloatTimeDomainData(buffer);
      const count = Math.min(buffer.length, Math.max(2, Math.round(settings.scopeWindow * context.sampleRate / 1000)));
      return buffer.subarray(buffer.length - count);
    }) });
  } else if (worklets) {
    if (item.type === 'Clock') {
      const clock = processor('patchlab-clock', 0);
      local.clockOut = clock;
      const configure = workletConfig(clock);
      apply = (s, state) => configure({ ...s, playing: state.playing, transportEpoch: state.transportEpoch });
    } else if (item.type === 'Sequencer') {
      const sequence = processor('patchlab-sequencer', 2, 2);
      const reset = gain(); reset.connect(sequence, 0, 1);
      const pitch = gain(); sequence.connect(pitch, 0);
      const gate = gain(); sequence.connect(gate, 1);
      Object.assign(local, { seqClockIn: sequence, seqResetIn: reset, seqPitchOut: pitch, seqGateOut: gate });
      const configure = workletConfig(sequence);
      const signal = { step: -1, gate: false };
      sequence.port.onmessage = ({ data }) => {
        const changed = data.patternToken && data.patternToken !== signal.patternToken;
        Object.assign(signal, data);
        if (changed) onPattern(data);
      };
      apply = (s, state) => configure({ steps: s.steps, sequenceLength: s.sequenceLength, clockDivide: s.clockDivide, sequenceEpoch: state.sequenceRuntime?.[item.id]?.epoch, patternChange: state.sequenceRuntime?.[item.id]?.request, sequencerPowered: true, transportEpoch: state.transportEpoch });
      read = () => signal;
    } else if (item.type === 'Phrase') {
      const phrase = processor('patchlab-phrase', 1, 2), pitch = gain(), gate = gain();
      phrase.connect(pitch,0); phrase.connect(gate,1);
      Object.assign(local,{phraseTriggerIn:phrase,seqPitchOut:pitch,seqGateOut:gate});
      const configure = workletConfig(phrase), signal = {step:-1,running:false};
      phrase.port.onmessage = ({data}) => Object.assign(signal,data);
      apply = (s,state) => configure({...s,sequenceEpoch:state.sequenceRuntime?.[item.id]?.epoch,bpm:state.bpm,division:state.division,duty:state.duty,playing:state.playing,transportEpoch:state.transportEpoch});
      read = () => signal;
    } else if (item.type === 'Clock Divider') {
      const divider = processor('patchlab-divider');
      Object.assign(local, { dividerIn: divider, dividerOut: divider });
      const configure = workletConfig(divider);
      apply = (s, state) => configure({ ...s, dividerActive: true, transportEpoch: state.transportEpoch });
    } else if (item.type === 'Accent') {
      const accent = processor('patchlab-accent', 2);
      const trigger = gain(); trigger.connect(accent, 0, 1);
      Object.assign(local, { accentIn: accent, accentTriggerIn: trigger, accentOut: accent });
      const configure = workletConfig(accent);
      apply = (s, state) => configure({ ...s, accentActive: true, transportEpoch: state.transportEpoch });
    }
  } else {
    // Match the existing rack's explicit unavailable-worklet fallback.
    for (const { key } of moduleCatalog[item.type].ports) local[key] = gain(0);
    read = () => ({ unavailable: true });
  }
  return {
    type: item.type,
    nodes: Object.fromEntries(Object.entries(local).map(([key, node]) => [instanceJack(item.id, key), node])),
    inputs: moduleCatalog[item.type].ports.filter((port) => port.direction === 'in').map(({ key }) => instanceJack(item.id, key)),
    apply, sample, read,
    close() {
      for (const p of probes) p.close();
      for (const node of started) node.stop();
      for (const node of owned) { node.disconnect(); if (node.port) { node.port.onmessage = null; node.port.close?.(); } }
    },
  };
}
