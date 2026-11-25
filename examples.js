import { createModuleInstance } from './module-instances.js';
import { modulationPatch, studioPatch, voicePatch } from './voice-audio.js';

export const firstPatchExamples = [
  { name: 'Compare waveforms', settings: { pitch: 12, waveform: 'sine' }, hint: 'Enable audio and switch from Sine to Saw at 220 Hz. Listen for the brighter tone at the same pitch.' },
  { name: 'Hear an octave', settings: { pitch: 24, waveform: 'sine' }, hint: 'Enable audio. This starts at 440 Hz. Move Pitch down to 220 Hz and listen for the same note one octave lower.' },
];

const plainLoop = {
  seqClockIn: 'clockOut', pitchIn: 'seqPitchOut', gateIn: 'seqGateOut',
  filterIn: 'oscOut', vcaIn: 'filterOut', cvIn: 'envOut',
  mixInA: 'vcaOut', audioIn: 'mixOut', scopeInA: 'clockOut',
};

const loopSettings = { bpm: 112, division: 2, cutoffStep: 40, resonance: 3, mixerA: 72, mixerB: 0, decay: 95, release: 90, scopeWindow: 250 };

export const lessonExamples = {
  2: [
    {
      name: 'Short pluck', patch: voicePatch,
      settings: { waveform: 'triangle', attack: 5, decay: 180, sustain: 0, release: 90 },
      hint: 'Enable audio and hold A3. The note fades while the key stays down. Raise Sustain to hear it hold a level.',
    },
    {
      name: 'Slow swell', patch: voicePatch,
      settings: { waveform: 'sine', attack: 850, decay: 180, sustain: 85, release: 1200 },
      hint: 'Enable audio and hold a note until it swells, then release it. Shorten Release to hear the same note end sooner.',
    },
  ],
  3: [
    { name: 'Repeating filter sweep', patch: modulationPatch, settings: { lfoRate: 0.7, resonance: 5, attenuation: 55 }, hint: 'Hold a key. Turn Attenuator Depth down and listen to the brightness sweep get smaller.' },
    {
      name: 'Envelope filter pluck',
      patch: {
        pitchIn: 'pitchOut', gateIn: 'gateOut', filterIn: 'oscOut', cutoffIn: 'envOut',
        vcaIn: 'filterOut', cvIn: 'envOut', audioIn: 'vcaOut',
      },
      settings: { waveform: 'sawtooth', cutoffStep: 32, resonance: 4, attack: 8, decay: 180, sustain: 15, release: 115 },
      hint: 'Hold a note. One envelope opens both the filter and VCA. Shorten Decay and listen to the brightness fade faster.',
    },
    {
      name: 'Pitch vibrato',
      patch: { ...voicePatch, attenIn: 'lfoOut', modPitchIn: 'attenOut' },
      settings: { waveform: 'sine', lfoRate: 4.5, attenuation: 20 },
      hint: 'Hold a note. The LFO bends pitch by about 40 cents each way. Raise Depth for a wider bend, then change Rate to hear it speed up.',
    },
  ],
  4: [
    { name: 'Oscillator and noise blend', patch: studioPatch, settings: { attenuation: 0, mixerA: 70, mixerB: 20, cutoffStep: 54 }, hint: 'Hold a key and turn Mixer B from 20% to 60%. Scope A shows the tone and noise mixed together. Scope B shows the envelope.' },
    {
      name: 'Noise percussion',
      patch: {
        mixInA: 'darkNoiseOut', mixInB: 'noiseOut', filterIn: 'mixOut', vcaIn: 'filterOut', gateIn: 'gateOut',
        cvIn: 'envOut', audioIn: 'vcaOut', scopeInA: 'vcaOut', scopeInB: 'envOut',
      },
      settings: { mixerA: 0, mixerB: 70, cutoffStep: 66, attack: 5, decay: 145, sustain: 0, release: 55, scopeWindow: 250 },
      hint: 'Tap a key for a white-noise hit. Swap the mixer levels so A is 70% and B is 0% to hear the same hit with darker noise.',
    },
    {
      name: 'Monitor a signal inline',
      patch: {
        pitchIn: 'pitchOut', gateIn: 'gateOut', scopeInA: 'oscOut', filterIn: 'scopeThruA',
        vcaIn: 'filterOut', cvIn: 'envOut', audioIn: 'vcaOut',
      },
      settings: { waveform: 'sawtooth', cutoffStep: 44, scopeWindow: 25 },
      hint: 'Hold a key and watch Scope A. Sweep the filter cutoff: the sound changes, while Scope A still shows the oscillator before the filter.',
    },
  ],
  5: [
    {
      name: 'Sixteen-step call and response',
      patch: { ...voicePatch, seqClockIn: 'clockOut', pitchIn: 'seqPitchOut', gateIn: 'seqGateOut', filterIn: 'oscOut', vcaIn: 'filterOut', scopeInA: 'seqPitchOut' },
      settings: { sequenceLength: 16, steps: [0, 0, 7, 3, 0, 10, 7, 3, 12, 10, 7, 3, 5, 3, 0, 0].map((pitch, i) => ({ pitch, on: ![3, 7, 11, 15].includes(i) })), cutoffStep: 39, decay: 90, release: 95, scopeWindow: 250 },
      hint: 'Press Play clock. Hear steps 1–8 ask a phrase and 9–16 answer it. Change edit pages or enable Follow playhead. Save the pattern, change the second phrase, save a variation, then load either at the end of the loop.',
    },
    {
      name: 'Syncopated pulses',
      patch: {
        seqClockIn: 'clockOut', gateIn: 'seqGateOut',
        filterIn: 'oscOut', vcaIn: 'filterOut', cvIn: 'envOut', audioIn: 'vcaOut',
        scopeInA: 'clockOut', scopeInB: 'seqGateOut',
      },
      settings: {
        bpm: 96, division: 4, duty: 32, waveform: 'square', cutoffStep: 49,
        attack: 5, decay: 60, sustain: 45, release: 65, scopeWindow: 250,
        steps: [0, 0, 7, 0, 3, 0, 10, 7].map((pitch, index) => ({ pitch, on: [0, 2, 4, 6, 7].includes(index) })),
      },
      hint: 'Press Play clock. The oscillator stays at 220 Hz while the gate pattern creates the rhythm. Scope A shows every pulse. Scope B shows the steps that play.',
    },
    {
      name: 'Reset the sequence with a key',
      patch: {
        seqClockIn: 'clockOut', seqResetIn: 'gateOut', pitchIn: 'seqPitchOut', gateIn: 'seqGateOut',
        filterIn: 'oscOut', vcaIn: 'filterOut', cvIn: 'envOut', audioIn: 'vcaOut',
        scopeInA: 'clockOut', scopeInB: 'gateOut',
      },
      settings: { bpm: 100, division: 2, scopeWindow: 250 },
      hint: 'Press Play clock, then open Sources and tap a key midway through the pattern. The next clock pulse starts at step 1 while the clock keeps its pace.',
    },
  ],
  6: [
    {
      name: 'Evolving groove',
      patch: {
        ...plainLoop, attenIn: 'lfoOut', cutoffIn: 'attenOut',
        dividerIn: 'clockOut', accentTriggerIn: 'dividerOut', accentIn: 'noiseOut',
        mixInB: 'accentOut', scopeInB: 'dividerOut',
      },
      settings: { ...loopSettings, lfoRate: 0.4, attenuation: 25, mixerB: 30 },
      hint: 'Enable audio and play the clock. The bass sweeps gently and a noise accent lands every fourth pulse. Lower Mixer B to isolate the bass, then bring the accent back.',
    },
    {
      name: 'Pitched percussion',
      patch: {
        seqClockIn: 'clockOut', pitchIn: 'seqPitchOut', accentIn: 'oscOut',
        accentTriggerIn: 'seqGateOut', audioIn: 'accentOut', scopeInA: 'seqGateOut', scopeInB: 'accentOut',
      },
      settings: { bpm: 92, division: 2, waveform: 'triangle', accentDecay: 85, scopeWindow: 250 },
      hint: 'Press Play clock. Change Accent Decay to hear the same pitched steps as short clicks or longer hits. Scope A shows the triggers, and B shows the decaying tone.',
    },
    {
      name: 'Clock the sequencer through a divider',
      patch: {
        ...plainLoop, dividerIn: 'clockOut', seqClockIn: 'dividerOut', scopeInB: 'dividerOut',
      },
      settings: { ...loopSettings, bpm: 144, division: 4, dividerRatio: 2 },
      hint: 'Press Play clock and change Divide by from 2 to 4. The sequencer advances less often. Scope A keeps showing the original clock while B shows the pulses reaching the sequencer.',
    },
  ],
};

const keyboardVoice = (settings = {}) => [
  createModuleInstance('Oscillator', 'm1', 'Keyboard oscillator', { waveform: 'triangle', transpose: 12, ...settings.oscillator }),
  createModuleInstance('ADSR Envelope', 'm2', 'Keyboard envelope', { attack: 12, decay: 100, sustain: 80, release: 450, ...settings.envelope }),
  createModuleInstance('VCA', 'm3', 'Keyboard VCA'),
];
const keyboardVoicePatch = {
  'm1:pitchIn': 'pitchOut', 'm2:gateIn': 'gateOut',
  'm3:vcaIn': 'm1:oscOut', 'm3:cvIn': 'm2:envOut',
};
lessonExamples[3].push({
  name: 'Separate loudness and brightness',
  instances: [createModuleInstance('ADSR Envelope', 'm1', 'Filter envelope', { attack: 5, decay: 220, sustain: 0, release: 150 })],
  patch: { ...voicePatch, filterIn: 'oscOut', vcaIn: 'filterOut', 'm1:gateIn': 'gateOut', cutoffIn: 'm1:envOut' },
  settings: { waveform: 'sawtooth', cutoffStep: 29, resonance: 4, attack: 15, decay: 120, sustain: 80, release: 650 },
  hint: 'Hold a key. The original ADSR holds loudness while Filter envelope makes brightness fade. Change Filter envelope Decay, then change the original ADSR Release: they shape different parts of the same note.',
});
lessonExamples[5].push({
  name: 'Play keys over a bassline',
  instances: keyboardVoice(), revealSources: true,
  patch: { ...plainLoop, ...keyboardVoicePatch, mixInB: 'm3:vcaOut', scopeInA: 'envOut', scopeInB: 'm2:envOut' },
  settings: { ...loopSettings, waveform: 'sawtooth', transpose: -12, sustain: 55, release: 65, mixerA: 60, mixerB: 35 },
  hint: 'Enable audio and Play clock, then hold a keyboard key. The sequencer has its own oscillator, ADSR and VCA; the keyboard uses the three named copies. Change Keyboard envelope Release while the bass keeps its short notes. Mixer A is bass; B is keyboard. Scope A and B compare the two envelopes.',
});
lessonExamples[6].push({
  name: 'Lead over an evolving groove',
  instances: keyboardVoice({ oscillator: { waveform: 'sine', transpose: 0 }, envelope: { attack: 100, decay: 200, sustain: 65, release: 700 } }), revealSources: true,
  patch: { ...lessonExamples[6][0].patch, ...keyboardVoicePatch, mixInC: 'm3:vcaOut', scopeInA: 'envOut', scopeInB: 'm2:envOut' },
  settings: { ...lessonExamples[6][0].settings, transpose: -12, mixerA: 60, mixerB: 20, mixerC: 35 },
  hint: 'Enable audio and Play clock. Play a slow lead over the bass and divided noise accents. Mixer A is bass, B is percussion, C is keyboard. Change the Keyboard envelope without changing the rhythmic envelope. Compare both envelopes on the Scope.',
});

// Existing teaching patterns retain their eight-pulse loops; only the new
// call-and-response example deliberately extends its phrase to sixteen.
for (const lesson of [5, 6]) for (const example of lessonExamples[lesson]) {
  example.settings.sequenceLength ??= 8;
}

const orbitSteps = (count, length) => Array.from({length:count},(_,i)=>({pitch:[0,3,7,10,12,7,5,3][Math.floor(i/4)%8],on:i<length && i%4!==3}));
const cycleVoice = [createModuleInstance('Sequencer','m5','Percussion sequence',{sequenceLength:3}),createModuleInstance('Sequencer','m4','Answer sequence',{sequenceLength:7}), ...keyboardVoice().map(m=>({...m,name:m.name.replace('Keyboard','Answer')}))];
const cyclePatch = {...plainLoop, ...keyboardVoicePatch, 'm1:pitchIn':'m4:seqPitchOut','m2:gateIn':'m4:seqGateOut','m4:seqClockIn':'clockOut',mixInB:'m3:vcaOut','m5:seqClockIn':'clockOut',accentTriggerIn:'m5:seqGateOut',accentIn:'noiseOut',mixInC:'accentOut'};
const soundGroups=[{id:'i1',name:'Bass instrument',members:['Oscillator','ADSR Envelope','VCA']},{id:'i2',name:'Answer instrument',members:['m1','m2','m3']},{id:'i3',name:'Percussion instrument',members:['Noise','Accent']}];
lessonExamples[7]=[
 {name:'Five against seven',instances:cycleVoice,instruments:soundGroups,patch:cyclePatch,settings:{...loopSettings,division:4,sequenceLength:5,mixerA:40,mixerB:30,mixerC:15},hint:'Enable audio and Play clock. Both sequencers receive the same clock but loop at 5 and 7 steps. The 5/7 pair realigns after 35 pulses; the 3-step percussion joins them after 105. Orbits opens either step editor.'},
 {name:'Eight-bar answering phrase',instances:cycleVoice.map(m=>m.id==='m4'?createModuleInstance('Sequencer','m4','Eight-bar phrase',{steps:orbitSteps(128,128),sequenceLength:128}):m),instruments:soundGroups,patch:cyclePatch,settings:{...loopSettings,division:4,sequenceLength:16,mixerA:40,mixerB:30,mixerC:15},hint:'The bass repeats every bar. The answering sequence has 128 actual steps: eight bars at four pulses per beat. Edit later pages without slowing the clock.'},
 {name:'One key starts a phrase',instances:[...keyboardVoice().map(m=>({...m,name:m.name.replace('Keyboard','Phrase')})),createModuleInstance('Phrase','m4','Internal phrase',{steps:orbitSteps(16,8),sequenceLength:8,retrigger:'restart'})],instruments:[{id:'i1',name:'Triggered instrument',members:['m4','m1','m2','m3']}],patch:{...keyboardVoicePatch,'m1:pitchIn':'m4:seqPitchOut','m2:gateIn':'m4:seqGateOut','m4:phraseTriggerIn':'gateOut',audioIn:'m3:vcaOut'},revealSources:true,settings:{division:4,bpm:110},hint:'Enable audio, Play clock, then press a key. One rising trigger starts an eight-step one-shot; holding the key does not repeat it. Retrigger while playing restarts or is ignored according to the Phrase setting. No clock cable is required inside the instrument.'},
];
export function populateExamples(select, examples) {
  for (const [index, example] of examples.entries()) {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = example.name;
    select.append(option);
  }
}

export const lessonModuleOrder = {
  7: { sources: ['Keyboard','Clock','Oscillator','LFO','Noise'], rack: ['Sequencer','Mixer','Scope','ADSR Envelope','VCA','Low-pass filter','Attenuator','Clock Divider','Accent'] },
  6: { sources: ['Keyboard', 'Clock', 'Oscillator', 'LFO', 'Noise'], rack: ['Sequencer', 'Attenuator', 'Mixer', 'Clock Divider', 'Accent', 'Scope', 'Low-pass filter', 'ADSR Envelope', 'VCA'] },
  3: { sources: ['Keyboard', 'Oscillator', 'LFO'], rack: ['Low-pass filter', 'ADSR Envelope', 'VCA', 'Attenuator'] },
  4: { sources: ['Keyboard', 'Oscillator', 'Noise', 'LFO'], rack: ['Mixer', 'Low-pass filter', 'ADSR Envelope', 'VCA', 'Scope', 'Attenuator'] },
  5: { sources: ['Keyboard', 'Clock', 'Oscillator', 'Noise', 'LFO'], rack: ['Sequencer', 'Scope', 'Mixer', 'Low-pass filter', 'ADSR Envelope', 'VCA', 'Attenuator'] },
};

export function orderModules(container, order) {
  const modules = new Map([...container.querySelectorAll('.module')].map((module) => [module.querySelector('h3').textContent, module]));
  for (const name of order) {
    const module = modules.get(name);
    if (module) {
      container.append(module);
      modules.delete(name);
    }
  }
  container.append(...modules.values());
}
