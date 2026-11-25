const button = document.getElementById('workspace-view');
if (button) {
  let compact = false;
  try { compact = localStorage.getItem('patchlab-compact-view') === 'true'; } catch { /* Optional preference. */ }
  const render = () => {
    document.body.classList.toggle('compact-view', compact);
    button.textContent = compact ? 'Show lesson' : 'Compact view';
    button.setAttribute('aria-pressed', String(compact));
    button.title = compact ? 'Show lesson text and full module descriptions' : 'Make room for the instrument; keep every control and jack';
  };
  button.addEventListener('click', () => {
    compact = !compact;
    render();
    try { localStorage.setItem('patchlab-compact-view', String(compact)); } catch { /* Still works without storage. */ }
    document.querySelector('.rack').scrollIntoView({ block: 'start' });
  });
  render();
}
