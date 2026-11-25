import { PhraseSignal } from './phrase-core.js';
import { AccentVoice, ClockDivider } from './accent-core.js';
import { EnvelopeTimeline } from './envelope.js';
import { ClockSignal, StepSequence } from './rhythm-core.js';

class PatchEnvelope extends AudioWorkletProcessor {
  timeline = new EnvelopeTimeline();
  settings = { active: false };
  resetPending = true;

  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      this.resetPending ||= !data.active || data.epoch !== this.settings.epoch;
      this.settings = data;
    };
  }

  process(inputs, outputs) {
    const gate = inputs[0]?.[0];
    const envelope = outputs[0][0];
    if (!this.settings.active) {
      envelope.fill(0);
      return true;
    }
    const firstFrame = currentFrame;
    if (this.resetPending) {
      this.timeline.reset(firstFrame / sampleRate);
      this.resetPending = false;
    }
    for (let i = 0; i < envelope.length; i++) {
      const time = (firstFrame + i) / sampleRate;
      const high = (gate?.[i] ?? 0) >= 0.5;
      if (i === 0 || high !== this.timeline.gate) this.timeline.update(time, high, this.settings);
      envelope[i] = this.timeline.levelAt(time);
    }
    return true;
  }
}

registerProcessor('patchlab-envelope', PatchEnvelope);

class PatchClock extends AudioWorkletProcessor {
  signal = new ClockSignal();

  constructor() {
    super();
    this.port.onmessage = ({ data }) => this.signal.configure(data);
  }

  process(_inputs, outputs) {
    const pulse = outputs[0][0];
    for (let i = 0; i < pulse.length; i++) pulse[i] = this.signal.sample(sampleRate);
    return true;
  }
}

class PatchSequencer extends AudioWorkletProcessor {
  sequence = new StepSequence();
  lastIndex = -1;
  lastGate = 0;
  lastPatternToken = 0;

  constructor() {
    super();
    this.port.onmessage = ({ data }) => this.sequence.configure(data);
  }

  process(inputs, outputs) {
    const input = inputs[0][0];
    const reset = inputs[1]?.[0];
    const pitch = outputs[0][0];
    const gate = outputs[1][0];
    for (let i = 0; i < pitch.length; i++) {
      pitch[i] = this.sequence.sample(input?.[i] ?? 0, sampleRate, reset?.[i] ?? 0);
      gate[i] = this.sequence.gate;
      if (this.sequence.index !== this.lastIndex || gate[i] !== this.lastGate || this.sequence.patternToken !== this.lastPatternToken) {
        this.lastIndex = this.sequence.index;
        this.lastGate = gate[i];
        this.lastPatternToken = this.sequence.patternToken;
        this.port.postMessage({ step: this.lastIndex, gate: Boolean(this.lastGate), ...(this.lastPatternToken ? { patternToken: this.lastPatternToken } : {}) });
      }
    }
    return true;
  }
}

registerProcessor('patchlab-clock', PatchClock);
registerProcessor('patchlab-sequencer', PatchSequencer);

class PatchClockDivider extends AudioWorkletProcessor {
  divider = new ClockDivider();

  constructor() {
    super();
    this.port.onmessage = ({ data }) => this.divider.configure(data);
  }

  process(inputs, outputs) {
    const clock = inputs[0][0];
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) output[i] = this.divider.sample(clock?.[i] ?? 0);
    return true;
  }
}

class PatchAccent extends AudioWorkletProcessor {
  voice = new AccentVoice();

  constructor() {
    super();
    this.port.onmessage = ({ data }) => this.voice.configure(data);
  }

  process(inputs, outputs) {
    const input = inputs[0][0];
    const trigger = inputs[1][0];
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) output[i] = this.voice.sample(input?.[i] ?? 0, trigger?.[i] ?? 0, sampleRate);
    return true;
  }
}

registerProcessor('patchlab-divider', PatchClockDivider);
registerProcessor('patchlab-accent', PatchAccent);

class PatchPhrase extends AudioWorkletProcessor {
  phrase = new PhraseSignal(); last = '';
  constructor() { super(); this.port.onmessage = ({data}) => this.phrase.configure(data); }
  process(inputs, outputs) {
    const trigger = inputs[0]?.[0], pitch = outputs[0][0], gate = outputs[1][0];
    for (let i=0;i<pitch.length;i++) { pitch[i]=this.phrase.sample(trigger?.[i] || 0,sampleRate); gate[i]=this.phrase.gate; }
    const key = this.phrase.index + ':' + this.phrase.running;
    if(key!==this.last) { this.last=key; this.port.postMessage({step:this.phrase.running ? this.phrase.index : -1, running:this.phrase.running}); }
    return true;
  }
}
registerProcessor('patchlab-phrase', PatchPhrase);
