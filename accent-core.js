export const accentDefaults = Object.freeze({ dividerRatio: 4, accentDecay: 95 });

function gateHigh(sample, wasHigh) {
  return sample >= (wasHigh ? 0.45 : 0.55);
}

export class ClockDivider {
  count = 0;
  high = false;
  passing = false;
  config = {};

  configure(config) {
    if (config.transportEpoch !== this.config.transportEpoch || !config.dividerActive) {
      this.count = 0;
      this.high = false;
      this.passing = false;
    }
    this.config = config;
  }

  sample(clock) {
    if (!this.config.dividerActive) return 0;
    const high = gateHigh(clock, this.high);
    if (high && !this.high) {
      const ratio = [2, 3, 4, 8].includes(this.config.dividerRatio) ? this.config.dividerRatio : 4;
      this.passing = this.count % ratio === 0;
      this.count++;
    }
    this.high = high;
    return Number(high && this.passing);
  }
}

export class AccentVoice {
  high = false;
  remaining = 0;
  duration = 1;
  decay;
  config = {};

  configure(config) {
    if (config.transportEpoch !== this.config.transportEpoch || !config.accentActive) {
      this.high = false;
      this.remaining = 0;
    }
    this.config = config;
  }

  sample(input, trigger, sampleRate) {
    if (!this.config.accentActive) return 0;
    const high = gateHigh(trigger, this.high);
    const triggered = high && !this.high;
    const decay = this.config.accentDecay ?? accentDefaults.accentDecay;
    if (triggered || decay !== this.decay) {
      const duration = Math.max(1, Math.round(Math.max(10, Math.min(450, decay)) * sampleRate / 1000));
      this.remaining = triggered ? duration : this.remaining * duration / this.duration;
      this.duration = duration;
      this.decay = decay;
    }
    this.high = high;
    if (!this.remaining) return 0;
    const value = input * this.remaining / this.duration;
    this.remaining = Math.max(0, this.remaining - 1);
    return value;
  }
}
