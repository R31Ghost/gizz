// Triggered one-shot pitch/gate phrase timed by the shared transport, not a UI timer.
export class PhraseSignal {
  config = {}; launch = false; index = -1; phase = 0; high = false; running = false; gate = 0;
  configure(config) {
    if (config.transportEpoch !== this.config.transportEpoch || !config.playing) { this.running = false; this.index = -1; }
    if (this.config.sequenceEpoch !== undefined && config.sequenceEpoch !== this.config.sequenceEpoch) this.launch = true;
    this.config = config;
  }
  sample(trigger, sampleRate) {
    const manual = this.launch; this.launch=false;
    const high = trigger >= (this.high ? .45 : .55), rise = (high && !this.high) || manual; this.high = high;
    const s = this.config;
    if (!s.playing) { this.gate = 0; return 0; }
    if (rise && (!this.running || s.retrigger === 'restart' || manual)) { const retrigger=this.running && this.gate; this.running=true;this.index=0;this.phase=0; if(retrigger){this.gate=0;return (s.steps[0].pitch || 0)/12;} }
    if (!this.running) { this.gate = 0; return (s.steps?.[Math.max(0,this.index)]?.pitch || 0) / 12; }
    const step = s.steps[this.index];
    this.gate = Number(Boolean(step?.on && this.phase < (s.duty ?? 45) / 100));
    const pitch = (step?.pitch || 0) / 12;
    this.phase += (s.bpm || 110) * (s.division || 4) / (60 * sampleRate);
    if (this.phase >= 1) { this.phase %= 1; this.index++; if (this.index >= s.sequenceLength) { this.index = s.sequenceLength - 1; this.running = false; } }
    return pitch;
  }
}
