export const moduleDetails = {
  Keyboard: 'A monophonic controller: 13 chromatic keys, slide-to-play, and ±2 octave shifts. Pitch is 1 simulated V/octave; Gate is 0 or 1. Lessons 04–06 also provide bend, velocity × volume and assignable controller CV.',
  Oscillator: 'Pitch in sets 1 V/octave. Pitch CV in adds 200 cents per unit. Audio out carries the selected waveform at nominal ±1 simulated V.',
  'ADSR Envelope': 'Gate in starts the envelope. Attack, decay and release are times, sustain is a level. The normal output is 0–1 V and Inverted out is −1–0 V.',
  VCA: 'Audio out is Audio in multiplied by the CV in value, clamped to 0–1. No CV closes the signal path.',
  'Low-pass filter': 'Cutoff is in Hz, resonance is the filter setting in dB, and cutoff CV adds 1,200 cents per unit. The digital low-pass slope is 12 dB/octave.',
  LFO: 'A repeating bipolar control signal at nominal ±1 V. Rate is in Hz and the readout also shows the duration of one cycle.',
  Attenuator: 'Depth scales CV in from 0% to 100%, retaining polarity. It can also scale an audio signal.',
  Output: 'Output in is the speaker destination. The rack removes DC and limits its signal before applying listening level and mute.',
  Scope: 'Shows two signals against the same time grid. Each Thru jack passes its own input onward. Time and range affect the display.',
  Mixer: 'Four independently scaled inputs sum into Mix out. Each channel level is a percentage and the sum can exceed one signal unit.',
  Noise: 'White out uses a repeating random sample buffer. Dark out rolls off highs with a 900 Hz low-pass filter.',
  Clock: 'Clock out switches between 0 and 1 V. BPM and division set the interval, and pulse width sets how much of that interval stays high.',
  'Clock Divider': 'Counts rising clock edges. The first pulse and then every Nth pulse passes through. Divide by sets N.',
  Accent: 'A rising trigger starts a linear decay. Audio out is the incoming signal multiplied by that decay, so noise becomes a short hit.',
  Phrase: 'One rising trigger starts one stored phrase using the shared tempo. Restart retriggers; Ignore lets it finish. Held gates never loop it. Arm Play clock and patch its outputs into the sound voice.',
  Sequencer: 'A rising Clock in edge advances a 1–128-step loop. Edit steps in two pages of eight. Pitch out holds the step pitch; Gate out follows enabled pulses. Patterns saves named variations and recalls at a loop boundary. Reset in queues step 1.',
};

export function addModuleDetails(heading, name = heading?.textContent) {
  if (!heading || !moduleDetails[name]) return;
  const info = document.createElement('details');
  info.className = 'module-info';
  const summary = document.createElement('summary');
  const detail = document.createElement('p');
  detail.textContent = moduleDetails[name];
  heading.before(info);
  summary.append(heading);
  info.append(summary, detail);
}
