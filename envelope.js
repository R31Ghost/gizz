export function envelopeAt(points, time) {
  for (let i = 1; i < points.length; i++) {
    const [end, target] = points[i];
    if (time < end) {
      const [start, value] = points[i - 1];
      return value + (target - value) * Math.max(0, (time - start) / (end - start));
    }
  }
  return points[points.length - 1][1];
}

export function envelopePoints(now, value, gate, { attack, decay, sustain, release }) {
  if (!gate) return [[now, value], [now + release / 1000, 0]];
  const peak = now + attack / 1000;
  return [[now, value], [peak, 1], [peak + decay / 1000, sustain / 100]];
}

// One timeline drives both native AudioParam ramps and the free-rack processor.
export class EnvelopeTimeline {
  points = [[0, 0]];
  gate = false;
  settings;
  sustainAdjustment = false;

  reset(now) {
    this.gate = false;
    this.sustainAdjustment = false;
    this.points = [[now, 0]];
    return this.points;
  }

  levelAt(now) {
    return envelopeAt(this.points, now);
  }

  update(now, gate, { attack, decay, sustain, release }) {
    const previous = this.settings;
    const gateChanged = gate !== this.gate;
    const attackChanged = attack !== previous?.attack;
    const decayChanged = decay !== previous?.decay;
    const sustainChanged = sustain !== previous?.sustain;
    const releaseChanged = release !== previous?.release;
    if (!gateChanged && !attackChanged && !decayChanged && !sustainChanged && !releaseChanged) return null;
    this.settings = { attack, decay, sustain, release };

    const value = this.levelAt(now);
    if (gateChanged) {
      this.gate = gate;
      this.sustainAdjustment = false;
      return this.points = envelopePoints(now, value, gate, this.settings);
    }
    if (!previous) return null;

    const end = this.points.at(-1)[0];
    if (!gate) {
      if (!releaseChanged || now >= end) return null;
      const remaining = (end - now) * release / previous.release;
      return this.points = [[now, value], [now + remaining, 0]];
    }
    if (this.points.length === 3 && now < this.points[1][0]) {
      if (!attackChanged && !decayChanged && !sustainChanged) return null;
      const remaining = (this.points[1][0] - now) * attack / previous.attack;
      const peak = now + remaining;
      return this.points = [[now, value], [peak, 1], [peak + decay / 1000, sustain / 100]];
    }
    if (!this.sustainAdjustment && now < end) {
      if (!decayChanged && !sustainChanged) return null;
      const remaining = (end - now) * decay / previous.decay;
      return this.points = [[now, value], [now + remaining, sustain / 100]];
    }
    if (!sustainChanged) return null;
    this.sustainAdjustment = true;
    return this.points = [[now, value], [now + 0.02, sustain / 100]];
  }
}
