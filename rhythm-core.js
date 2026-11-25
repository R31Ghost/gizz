export const rhythmDefaults = Object.freeze({
  bpm: 110, division: 2, duty: 45, playing: false, transportEpoch: 0,
  sequenceLength: 16, clockDivide: 1,
  steps: Object.freeze([0, 0, 7, 3, 0, 10, 7, 3, 0, 3, 7, 10, 12, 7, 3, 0].map((pitch, index) => Object.freeze({ pitch, on: index % 8 !== 3 && index % 8 !== 7 }))),
});

export function pulseIntervalMs(bpm, division) {
  return 60000 / (bpm * division);
}

export class ClockSignal {
  phase = 0;
  pulseOpen = true;
  config = rhythmDefaults;

  configure(config) {
    if (config.transportEpoch !== this.config.transportEpoch || (config.playing && !this.config.playing)) {
      this.phase = 0;
      this.pulseOpen = true;
    }
    this.config = config;
  }

  sample(sampleRate) {
    const { playing, bpm, division, duty } = this.config;
    if (!playing) return 0;
    this.pulseOpen &&= this.phase < duty / 100;
    const pulse = Number(this.pulseOpen);
    this.phase += 1000 / (pulseIntervalMs(bpm, division) * sampleRate);
    if (this.phase >= 1) {
      this.phase %= 1;
      this.pulseOpen = true;
    }
    return pulse;
  }
}

export class StepSequence {
  config = rhythmDefaults;
  index = -1;
  high = false;
  accepted = false;
  resetHigh = false;
  cooldown = 0;
  gate = 0;

  pulseCount = 0;
  pending = null;
  appliedToken = 0;
  patternToken = 0;

  configure(config) {
    const transportChanged = config.transportEpoch !== this.config.transportEpoch;
    if (transportChanged || config.sequenceEpoch !== this.config.sequenceEpoch) {
      this.index = -1; this.accepted = false; this.cooldown = 0;
      if (transportChanged) this.high = false;
    }
    if (transportChanged || config.sequenceEpoch !== this.config.sequenceEpoch || config.clockDivide !== this.config.clockDivide) this.pulseCount = 0;
    const request = config.patternChange;
    this.pending = request && request.token !== this.appliedToken ? request : null;
    // Until the UI acknowledges a completed audio-thread swap, late settings messages
    // still contain the old working steps. Never let them undo the performed swap.
    const performed = request && request.token === this.appliedToken;
    this.config = performed ? { ...config, steps: this.config.steps, sequenceLength: this.config.sequenceLength } : config;
  }

  sample(input, sampleRate, reset = 0) {
    if (this.config.sequencerPowered === false) {
      this.gate = 0;
      this.high = false;
      this.accepted = false;
      this.resetHigh = false;
      return 0;
    }
    const high = input >= (this.high ? 0.45 : 0.55);
    const resetHigh = reset >= (this.resetHigh ? 0.45 : 0.55);
    if (resetHigh && !this.resetHigh) {
      this.index = -1;
      this.pulseCount = 0;
      this.accepted = false;
      this.cooldown = 0;
    } else if (high && !this.high) {
      const valid = this.cooldown === 0;
      this.accepted = valid && this.pulseCount % (this.config.clockDivide || 1) === 0;
      if (valid) this.pulseCount++;
      if (this.accepted) {
        const length = this.config.sequenceLength ?? this.config.steps.length;
        if (this.pending && (this.pending.when === 'next' || this.index < 0 || this.index + 1 >= length)) {
          const request = this.pending;
          this.config = { ...this.config, steps: request.steps, sequenceLength: request.sequenceLength };
          this.appliedToken = this.patternToken = request.token; this.pending = null; this.index = -1;
        }
        const activeLength = this.config.sequenceLength ?? this.config.steps.length;
        this.index = this.index + 1 >= activeLength ? 0 : this.index + 1;
        this.cooldown = Math.round(sampleRate * 0.012);
      }
    } else if (!high) {
      this.accepted = false;
    }
    this.high = high;
    this.resetHigh = resetHigh;
    if (this.cooldown) this.cooldown--;
    const step = this.config.steps[this.index];
    this.gate = Number(Boolean(high && this.accepted && step?.on));
    return (step?.pitch ?? 0) / 12;
  }
}
