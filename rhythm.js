export function workletConfig(node) {
  let previous;
  return (config) => {
    if (previous && Object.keys(config).every((key) => config[key] === previous[key])) return;
    node.port.postMessage(config);
    previous = config;
  };
}

export function createRhythm(context, evolving = false, onPattern = () => {}) {
  const clock = new AudioWorkletNode(context, 'patchlab-clock', {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
  });
  const sequencer = new AudioWorkletNode(context, 'patchlab-sequencer', {
    numberOfInputs: 2, numberOfOutputs: 2, outputChannelCount: [1, 1], channelCount: 1, channelCountMode: 'explicit',
  });
  const reset = context.createGain();
  reset.connect(sequencer, 0, 1);
  const pitch = context.createGain();
  const gate = context.createGain();
  sequencer.connect(pitch, 0);
  sequencer.connect(gate, 1);
  const silent = context.createGain();
  silent.gain.value = 0;
  clock.connect(silent);
  pitch.connect(silent);
  gate.connect(silent);
  silent.connect(context.destination);
  const signal = { step: -1, gate: false };
  sequencer.port.onmessage = ({ data }) => {
    const changed = data.patternToken && data.patternToken !== signal.patternToken;
    Object.assign(signal, data);
    if (changed) onPattern(data);
  };

  const nodes = { clockOut: clock, seqClockIn: sequencer, seqResetIn: reset, seqPitchOut: pitch, seqGateOut: gate };
  const inputs = ['seqClockIn', 'seqResetIn'];
  const configureClock = workletConfig(clock);
  const configureSequence = workletConfig(sequencer);
  let configureDivider;
  let configureAccent;
  if (evolving) {
    const options = { numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' };
    const divider = new AudioWorkletNode(context, 'patchlab-divider', { ...options, numberOfInputs: 1 });
    const accent = new AudioWorkletNode(context, 'patchlab-accent', { ...options, numberOfInputs: 2 });
    const trigger = context.createGain();
    trigger.connect(accent, 0, 1);
    Object.assign(nodes, { dividerIn: divider, dividerOut: divider, accentIn: accent, accentTriggerIn: trigger, accentOut: accent });
    inputs.push('dividerIn', 'accentIn', 'accentTriggerIn');
    configureDivider = workletConfig(divider);
    configureAccent = workletConfig(accent);
  }

  return {
    nodes, inputs,
    signal,
    apply({ bpm, division, duty, playing, transportEpoch, steps, sequenceLength, clockDivide, sequenceRuntime, dividerRatio, accentDecay }, active) {
      configureClock({ bpm, division, duty, transportEpoch, playing: playing && active('Clock') });
      configureSequence({ steps, sequenceLength, clockDivide, sequenceEpoch: sequenceRuntime?.original?.epoch, patternChange: sequenceRuntime?.original?.request, transportEpoch, sequencerPowered: active('Sequencer') });
      configureDivider?.({ dividerRatio, transportEpoch, dividerActive: active('Clock Divider') });
      configureAccent?.({ accentDecay, transportEpoch, accentActive: active('Accent') });
    },
  };
}
