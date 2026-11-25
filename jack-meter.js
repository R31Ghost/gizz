import { rackAnchorVisible } from './rack-geometry.js';
const ranges = {
  audio: [-1, 1], cv: [-1, 1], gate: [0, 1], pitch: [-5, 5], signal: [-5, 5],
};
const jackRanges = {
  envOut: [0, 1], envInvOut: [-1, 0], cvIn: [0, 1], bendOut: [-2.5, 2.5],
  velocityOut: [0, 1], controllerOut: [0, 1], seqPitchOut: [-1, 2],
  mixOut: [-4, 4],
};

export function jackRange(id, kind) {
  return jackRanges[id.split(':').at(-1)] ?? ranges[kind];
}

export function meterPosition(value, [min, max]) {
  const percent = (sample) => 100 * (Math.min(max, Math.max(min, sample)) - min) / (max - min);
  const zero = percent(0);
  const reading = percent(value);
  return { zero, reading, start: Math.min(zero, reading), width: Math.abs(zero - reading), over: value < min || value > max };
}

export function createJackProbe(context) {
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  const samples = new Float32Array(analyser.fftSize);
  const silent = context.createGain();
  silent.gain.value = 0;
  analyser.connect(silent);
  silent.connect(context.destination);
  let sources = [];

  const probe = {
    connect(next) {
      const unique = [...new Set(next)];
      for (const source of sources) {
        if (!unique.includes(source)) source.disconnect(analyser);
      }
      for (const source of unique) {
        if (!sources.includes(source)) source.connect(analyser);
      }
      sources = unique;
    },
    close() {
      probe.connect([]);
      analyser.disconnect(silent);
      silent.disconnect(context.destination);
    },
    read() {
      if (!sources.length) return 0;
      analyser.getFloatTimeDomainData(samples);
      return samples.at(-1);
    },
  };
  return probe;
}

export function positionJackMeter(anchor, size, viewport, occupied = []) {
  const margin = 8;
  const left = Math.min(Math.max(margin, anchor.left), Math.max(margin, viewport.width - size.width - margin));
  const bottomLimit = viewport.height - size.height - margin;
  const minTop = Math.max(margin, Math.min(viewport.top ?? margin, bottomLimit));
  const below = Math.max(minTop, anchor.bottom + 6);
  const above = anchor.top - size.height - 6;
  const candidates = [below, ...occupied.map((box) => box.bottom + 6), above, ...occupied.map((box) => box.top - size.height - 6)];
  const top = candidates.find((y) => y >= minTop && y <= bottomLimit && !occupied.some((box) =>
    left < box.right && left + size.width > box.left && y < box.bottom && y + size.height > box.top));
  return { left, top: top ?? Math.max(minTop, Math.min(below, bottomLimit)) };
}

export function setupJackMeters(toolbar, onChange) {
  const layer = document.createElement('div');
  layer.className = 'jack-popovers';
  document.body.append(layer);
  const entries = new Map();
  let transient;

  function notify() {
    onChange([...entries.values()].map(({ id, direction }) => ({ id, direction })));
  }

  function remove(id) {
    const entry = entries.get(id);
    if (!entry) return;
    entry.panel.remove();
    entry.anchor.removeAttribute('aria-keyshortcuts');
    entries.delete(id);
    if (transient === id) transient = undefined;
    notify();
  }

  function position() {
    if (!entries.size) return;
    const toolbarRect = toolbar.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight, top: Math.max(8, toolbarRect.bottom + 4) };
    const occupied = [];
    for (const { anchor, panel } of entries.values()) {
      const rect = anchor.getBoundingClientRect();
      panel.hidden = !rackAnchorVisible(anchor) || rect.bottom <= 0 || rect.top >= viewport.height ||
        (!toolbar.contains(anchor) && rect.bottom < toolbarRect.bottom);
      if (panel.hidden) continue;
      const size = { width: panel.offsetWidth, height: panel.offsetHeight };
      const { left, top } = positionJackMeter(rect, size, viewport, occupied);
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      occupied.push({ left, top, right: left + size.width, bottom: top + size.height });
    }
  }

  function dismiss() {
    if (transient) remove(transient);
  }

  return {
    position,
    dismiss,
    forget(ids) { for (const id of ids) remove(id); },
    focusPin(id) {
      const entry = entries.get(id);
      if (!entry || entry.panel.hidden) return false;
      entry.panel.querySelector('button').focus({ preventScroll: true });
      return true;
    },
    inspect(jack) {
      if (transient !== jack.id) dismiss();
      if (entries.has(jack.id)) {
        position();
        return;
      }
      const { id, label: name, range } = jack;
      const panel = document.createElement('aside');
      panel.className = 'rack-jack-meter';
      panel.setAttribute('aria-label', name + ' voltage');
      panel.innerHTML = `
        <div class="jack-meter-head"><strong></strong><output class="jack-reading">—</output><button type="button" aria-pressed="false">Pin</button></div>
        <div class="jack-track" role="meter" aria-valuenow="0"><span class="jack-fill"></span><span class="jack-zero"></span></div>
        <div class="jack-scale"><span></span><span>Simulated volts</span><span></span></div>`;
      const [min, max] = range;
      const track = panel.querySelector('.jack-track');
      const pin = panel.querySelector('button');
      panel.querySelector('strong').textContent = name;
      track.setAttribute('aria-label', name + ' voltage');
      track.setAttribute('aria-valuemin', min);
      track.setAttribute('aria-valuemax', max);
      panel.querySelector('.jack-zero').style.left = meterPosition(0, range).zero + '%';
      const scale = panel.querySelector('.jack-scale');
      scale.firstElementChild.textContent = min + ' V';
      scale.lastElementChild.textContent = (max > 0 ? '+' : '') + max + ' V';

      const entry = { ...jack, panel, track, reading: panel.querySelector('output'), fill: panel.querySelector('.jack-fill'), lastText: -Infinity, pinned: false };
      entries.set(id, entry);
      jack.anchor.setAttribute('aria-keyshortcuts', 'ArrowDown');
      transient = id;
      pin.setAttribute('aria-label', 'Pin ' + name + ' meter');
      pin.addEventListener('click', () => {
        entry.pinned = !entry.pinned;
        if (entry.pinned) {
          transient = undefined;
        } else {
          dismiss();
          transient = id;
        }
        pin.textContent = entry.pinned ? 'Unpin' : 'Pin';
        pin.setAttribute('aria-label', (entry.pinned ? 'Unpin ' : 'Pin ') + name + ' meter');
        pin.setAttribute('aria-pressed', entry.pinned);
        panel.dataset.pinned = entry.pinned;
        position();
      });
      panel.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        remove(id);
        jack.anchor.focus({ preventScroll: true });
      });
      layer.append(panel);
      notify();
      position();
    },
    update(read, time) {
      for (const entry of entries.values()) {
        const { id, range, panel, track, reading, fill } = entry;
        if (panel.hidden) continue;
        const value = read(id);
        const valid = Number.isFinite(value);
        const { start, width, over } = meterPosition(valid ? value : 0, range);
        fill.style.left = start + '%';
        fill.style.width = width + '%';
        track.dataset.over = over;
        if (time - entry.lastText < 85) continue;
        entry.lastText = time;
        if (!valid) {
          reading.textContent = 'Signal idle';
          track.setAttribute('aria-valuenow', '0');
          track.setAttribute('aria-valuetext', reading.textContent);
        } else {
          const [min, max] = range;
          const formatted = (Math.abs(value) < 0.005 ? 0 : value).toFixed(2) + ' V';
          reading.textContent = formatted + (over ? ' · over range' : '');
          track.setAttribute('aria-valuenow', Math.min(max, Math.max(min, value)));
          track.setAttribute('aria-valuetext', reading.textContent);
        }
      }
    },
  };
}
