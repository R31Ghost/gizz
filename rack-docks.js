export function setupRackDocks(bay, onChange, onCancel, outputJack, overlays) {
  const toolbar = document.createElement('div');
  toolbar.className = 'rack-docks';
  toolbar.innerHTML = `
    <div class="rack-dock-tabs" role="group" aria-label="Rack sections">
      <span class="simulation-status" data-simulation title="Simulation idle" role="status"><span>Simulation idle</span></span>
      <button type="button" class="dock-toggle" id="sources-toggle" aria-expanded="false" aria-controls="sources-bay"><span aria-hidden="true">↳</span> Sources</button>
      <div class="rack-quick-controls" role="group" aria-label="Quick controls"><button type="button" data-rack-audio>Enable audio</button></div>
      <div class="rack-output-port" role="group" aria-label="Output patch jack"></div>
    </div>
    <div class="rack-tools"><button type="button" data-rack-cables>Cables</button></div><div class="rack-history"><button type="button" data-rack-undo aria-disabled="true">Undo</button></div>
    <div class="rack-patch-selection" hidden><span></span><button type="button">Cancel</button></div>`;
  const workspace = document.createElement('div');
  workspace.className = 'rack-workspace';
  bay.before(toolbar, workspace);
  const main = document.createElement('div');
  main.className = 'rack-main';
  main.dataset.rackViewport = '';
  main.tabIndex = 0;
  main.setAttribute('role', 'region');
  main.setAttribute('aria-label', 'Instruments and processing modules. Scroll to reach more modules.');
  workspace.append(main);
  main.append(bay);
  bay.tabIndex = -1;
  bay.setAttribute('role', 'region');
  bay.setAttribute('aria-label', 'Processing rack');

  function addPanel(side, id, label, toggleId, modules) {
    const panel = document.createElement('section');
    panel.className = 'rack-section';
    panel.dataset.side = side;
    panel.id = id;
    panel.hidden = true;
    panel.tabIndex = -1;
    panel.setAttribute('aria-labelledby', id + '-title');
    panel.innerHTML = '<h3 class="dock-heading" id="' + id + '-title">' + label + '</h3>' +
      '<div class="voice-bay modulation-bay dock-modules"></div>';
    const body = panel.querySelector('.dock-modules');
    const toggle = side === 'top' ? outputJack : toolbar.querySelector('#' + toggleId);
    for (const selector of modules) {
      const module = bay.querySelector(selector);
      if (module) body.append(module);
    }
    if (side === 'left') {
      panel.dataset.rackViewport = ''; panel.tabIndex = 0;
      workspace.insertBefore(panel, main);
    }
    else if(!overlays) workspace.before(panel);
    const editor = side === 'top' ? overlays?.register({id:'output',title:'Output level and mute',content:panel,kind:'output',trigger:toggle}) : null;

    function show(expanded) {
      if(editor){if(expanded)editor.open();else editor.collapse();return;}
      panel.hidden = !expanded;
      toggle.setAttribute('aria-expanded', expanded);
      if (side === 'left') workspace.classList.toggle('has-open-sources', expanded);
      onChange();
    }
    const togglePanel = (event) => {
      if(editor){editor.toggle();return;}
      const opening = panel.hidden;
      show(opening);
      if (!opening) return;
      const top = panel.getBoundingClientRect().top;
      if (top < toolbar.getBoundingClientRect().bottom || top > window.innerHeight - 96) {
        panel.scrollIntoView({ block: 'start' });
      }
      if (event.detail === 0) panel.focus({ preventScroll: true });
    };
    if (side !== 'top') toggle.addEventListener('click', togglePanel);
    panel.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !selection.hidden) return;
      show(false);
      toggle.focus();
    });
    return { panel, body, toggle, togglePanel, reveal: () => { if (panel.hidden) show(true); } };
  }

  const selection = toolbar.querySelector('.rack-patch-selection');
  const label = selection.querySelector('span');
  selection.querySelector('button').addEventListener('click', () => {
    onCancel();
    toolbar.querySelector('#sources-toggle').focus({ preventScroll: true });
  });
  const sources = addPanel('left', 'sources-bay', 'Audio and control sources', 'sources-toggle', ['.keys-module', '.oscillator', '.lfo-module', '.noise-module', '.clock-module']);
  const output = addPanel('top', 'output-bay', 'Listening level and mute', 'output-toggle', ['.output']);

  const strip = outputJack.parentElement;
  outputJack.textContent = 'Output in';
  toolbar.querySelector('.rack-output-port').append(outputJack);
  if (!strip.children.length) strip.remove();
  output.body.querySelector('.module-head')?.remove();

  outputJack.setAttribute('aria-controls', 'output-bay');
  outputJack.setAttribute('aria-expanded', 'false');
  // Scroll does not bubble. Capture it so either pane redraws cables and overlays.
  workspace.addEventListener('scroll', onChange, { capture: true, passive: true });
  window.addEventListener('scroll', onChange, { passive: true });

  return {
    toolbar, workspace, main, sources, output, panels: [sources, output],
    showSelection(port) {
      selection.hidden = !port;
      label.textContent = port ? 'Selected ' + port + ' · choose another jack' : '';
    },
  };
}

export function isCableDoubleTap(previous, next) {
  return Boolean(previous && previous.cord === next.cord && next.time - previous.time < 380 &&
    Math.hypot(next.x - previous.x, next.y - previous.y) < 28);
}
