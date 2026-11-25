// Keep overlay/cable positions consistent with the rack's independent scroll panes.
export function rackAnchorVisible(anchor) {
  if (!anchor?.getClientRects?.().length || anchor.closest?.('[hidden]')) return false;
  const viewport = anchor.closest?.('[data-rack-viewport]');
  if (!viewport) return true;
  const rect = anchor.getBoundingClientRect(), clip = viewport.getBoundingClientRect();
  return rect.bottom > clip.top && rect.top < clip.bottom && rect.right > clip.left && rect.left < clip.right;
}

export function rackCablePoint(button, panels = [], offset = 0) {
  const dock = panels.find(item => item.body.contains(button));
  if (dock && (dock.panel.hidden || dock.body.closest?.('[hidden]'))) {
    const rect = (dock.fallback || dock.toggle).getBoundingClientRect();
    return [rect.left + rect.width / 2 + offset, rect.bottom];
  }
  const rect = button.getBoundingClientRect();
  let x = rect.left + 14 + offset, y = rect.top + rect.height / 2;
  const viewport = button.closest?.('[data-rack-viewport]');
  if (viewport) {
    const clip = viewport.getBoundingClientRect(), margin = 6;
    x = Math.max(clip.left + margin, Math.min(clip.right - margin, x));
    y = Math.max(clip.top + margin, Math.min(clip.bottom - margin, y));
  }
  return [x, y];
}
