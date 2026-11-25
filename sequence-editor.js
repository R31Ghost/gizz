import { patternMatches, sequenceRuntime, queuePattern, sequenceSettings } from './sequence-patterns.js';
const make = (tag, css, text) => { const node = document.createElement(tag); if (css) node.className = css; if (text !== undefined) node.textContent = text; return node; };
const button = (text, action) => { const node = make('button', 'reset', text); node.type = 'button'; node.addEventListener('click', action); return node; };
const fingerprint = settings => JSON.stringify(sequenceSettings(settings));

export function setupSequenceEditor({ container, id, state, settings, edit, beforeEdit = () => {}, apply, library, noteName, isRunning = () => false, overlays, onPage = () => {} }) {
  const editor = make('div', 'sequence-editor'); container.append(editor);
  let libraryEntries = library.entries;
  let page = 0, playingStep = -1, loadedId = '', clean = fingerprint(settings()), discardedTarget;
  const runtime = () => sequenceRuntime(state, id);
  let lastRuntime = runtime();
  const pages = make('div', 'sequence-pages'); pages.setAttribute('role', 'group'); pages.setAttribute('aria-label', 'Sequencer edit page');
  let pageButtons = [];
  const pageChoices = make('span', 'sequence-page-choices'); pages.append(pageChoices);
  const followLabel = make('label', 'sequence-follow'), follow = make('input'); follow.type = 'checkbox'; follow.dataset.controllerIgnore = '';
  followLabel.append(follow, make('span', '', 'Follow playhead')); pages.append(followLabel);
  follow.addEventListener('change', () => { if (follow.checked && playingStep >= 0) showPage(Math.floor(playingStep / 8)); });
  const overview = make('div', 'sequence-overview'); overview.setAttribute('role', 'group'); overview.setAttribute('aria-label', 'Full 16-step pattern');
  let dots = [];
  const row = make('div', 'voice-control sequence-length');
  const lengthLabel = make('label', '', 'Loop length'), length = make('select'); length.id = id + '-sequence-length'; lengthLabel.htmlFor = length.id; length.dataset.controllerAutoIgnore = '';

  length.addEventListener('change', () => change({ sequenceLength: Number(length.value) }));
  const extend = button('Copy 1–8 → 9–16', () => { beforeEdit(); const s = settings(); change({ steps: [...s.steps.slice(0, 8), ...structuredClone(s.steps.slice(0, 8))], sequenceLength: 16 }); });
  const restart = button('Restart this sequence', () => { runtime().epoch++; apply(); }); restart.id = id === 'original' ? 'sequence-restart' : id + '-restart'; restart.dataset.sequenceAction = '';
  row.append(lengthLabel, length, extend, restart);
  if(settings().clockDivide !== undefined) {
    const rateLabel=make('label','','Clock division'), rate=make('select'); rate.id=id+'-clock-divide';rateLabel.htmlFor=rate.id;rate.dataset.controllerAutoIgnore='';
    for(const value of [1,2,4,8]){const option=make('option','','/'+value);option.value=value;rate.append(option);}rate.value=settings().clockDivide;
    rate.addEventListener('change',()=>change({clockDivide:Number(rate.value)}));row.append(rateLabel,rate);
  }
  for (const capacity of [32,64,128]) row.append(button('Extend to ' + capacity, () => { if(settings().steps.length >= capacity) return; beforeEdit(); change({steps:Array.from({length:capacity},(_,i)=>({...settings().steps[i % settings().steps.length]})),sequenceLength:capacity}); onPage(); }));
  const steps = make('div', 'sequencer-steps');
  let cards = [];
  function rebuild(count) {
    steps.replaceChildren(); overview.replaceChildren(); length.replaceChildren(); pageChoices.replaceChildren();
    pageButtons = Array.from({length:count/8}, (_,index) => { const node=button('Steps ' +(index*8+1)+'–'+(index*8+8),()=>showPage(index)); node.id=id+'-page-'+index; node.dataset.sequenceAction=''; pageChoices.append(node); return node; });
    dots = Array.from({length:count},(_,index)=>{ const node=button(String(index+1),()=>showPage(Math.floor(index/8))); node.setAttribute('aria-label','View step '+(index+1)); overview.append(node); return node; });
    overview.setAttribute('aria-label','Full '+count+'-step pattern');
    for(let i=1;i<=count;i++){const option=make('option','',i+' steps');option.value=i;length.append(option);}
    cards = Array.from({ length: count }, (_, index) => {
    const card = make('div', 'sequence-step'); card.dataset.sequenceStep = String(index);
    const label = make('label', '', 'Step ' + (index + 1)), pitch = make('select');
    pitch.id = id === 'original' ? 'sequence-pitch-' + index : id + '-step-' + index; label.htmlFor = pitch.id;
    for (let offset = -12; offset <= 24; offset++) { const option = make('option', '', noteName(57 + offset)); option.value = offset; pitch.append(option); }
    const gate = button('Gate on', () => { const current = settings().steps; change({ steps: current.map((step, i) => i === index ? { ...step, on: !step.on } : step) }); });
    gate.setAttribute('aria-label', 'Step ' + (index + 1) + ' gate');
    pitch.addEventListener('change', () => { const current = settings().steps; change({ steps: current.map((step, i) => i === index ? { ...step, pitch: Number(pitch.value) } : step) }); });
    card.append(label, pitch, gate); steps.append(card); return { card, pitch, gate };
  });
    showPage(Math.min(page,count/8-1), false);
  }
  const readout = make('p', 'readout sequence-readout'); readout.setAttribute('aria-label', 'Sequencer playhead and working pattern');
  const bank = make('details', 'sequence-patterns'); bank.append(make('summary', '', 'Patterns · Save and switch'));
  const description = make('p', '', 'Named patterns are saved in this browser and shared by all Sequencers. Patch exports include the library. Saving a pattern keeps pitch, gates and loop length; clock tempo and cables stay separate.');
  const saveRow = make('div', 'patch-shelf-controls'), nameLabel = make('label', '', 'Pattern name'), name = make('input'); name.type = 'text'; name.maxLength = 48; name.id = id + '-pattern-name'; nameLabel.htmlFor = name.id;
  const save = button('Save new pattern', () => savePattern(false)), replace = button('Replace selected', () => savePattern(true));
  saveRow.append(nameLabel, name, save, replace);
  const loadRow = make('div', 'patch-shelf-controls'), chooseLabel = make('label', '', 'Saved pattern'), choose = make('select'); choose.id = id + '-saved-pattern'; choose.dataset.controllerIgnore = ''; chooseLabel.htmlFor = choose.id;
  const whenLabel = make('label', '', 'Switch'), when = make('select'); when.id = id + '-pattern-timing'; when.dataset.controllerIgnore = ''; whenLabel.htmlFor = when.id;
  for (const [value, label] of [['end', 'At end of loop'], ['next', 'On next pulse']]) { const option = make('option', '', label); option.value = value; when.append(option); } when.value = 'end';
  const load = button('Load pattern', () => requestLoad(false));
  const cancel = button('Cancel queued change', () => { runtime().request = null; apply(); sync(); });
  const discard = button('Discard edits and load', () => requestLoad(true)); discard.hidden = true;
  const remove = button('Delete selected', () => safely(() => library.remove(choose.value)));
  const undo = button('Undo library edit', () => safely(() => library.undo()));
  loadRow.append(chooseLabel, choose, whenLabel, when, load, cancel, discard, remove, undo);
  const status = make('p', 'readout'); status.setAttribute('role', 'status');
  bank.append(description, saveRow, loadRow, status); editor.append(pages, overview, row, steps, readout, bank);
  choose.addEventListener('change', () => { discard.hidden = true; renderLibrary(); });
  function safely(action) { try { action(); } catch (error) { status.textContent = error.message; } }
  function savePattern(overwrite) {
    safely(() => {
      const selected = libraryEntries.find(item => item.id === choose.value);
      if (overwrite && !selected) throw new Error('Select a saved pattern to replace.');
      const saved = library.save(overwrite ? selected.name : name.value, settings(), overwrite);
      loadedId = saved.id; clean = fingerprint(settings()); name.value = saved.name;
      renderLibrary(saved.id); status.textContent = saved.name + ' saved in this browser.'; sync();
    });
  }
  function requestLoad(discardEdits) {
    const target = libraryEntries.find(item => item.id === choose.value); if (!target) return;
    if (isDirty() && !discardEdits) {
      discardedTarget = target.id; discard.hidden = false; status.textContent = 'Unsaved edits. Save them first, or choose Discard edits and load.'; return;
    }
    if (discardEdits && discardedTarget !== target.id) return;
    beforeEdit(); discard.hidden = true;
    if (isRunning()) {
      queuePattern(state, id, target, when.value); apply(); status.textContent = target.name + (when.value === 'next' ? ' queued for the next pulse.' : ' queued for the end of this loop.'); sync();
    } else perform(target, true);
  }
  function perform(pattern, restartSequence = false) {
    runtime().request = null; if (restartSequence) runtime().epoch++;
    loadedId = pattern.id; clean = fingerprint(pattern); name.value = pattern.name;
    edit(sequenceSettings(pattern)); sync(); status.textContent = pattern.name + ' loaded.';
  }
  function change(change) {
    if (runtime().request) status.textContent = 'Queued change canceled by your edit.';
    runtime().request = null; discard.hidden = true; edit(change); sync();
  }
  function showPage(next, notify = true) {
    page = next; editor.dataset.sequencePage = String(page);
    pageButtons.forEach((node, i) => node.setAttribute('aria-pressed', i === page));
    cards.forEach(({ card }, i) => { card.hidden = Math.floor(i / 8) !== page; });
    if (notify) onPage();
  }
  function renderLibrary(selected = choose.value) {
    const placeholder = make('option', '', libraryEntries.length ? 'Choose a saved pattern' : 'No saved patterns'); placeholder.value = '';
    choose.replaceChildren(placeholder, ...libraryEntries.map(item => { const option = make('option', '', item.name + ' · ' + item.sequenceLength + ' steps'); option.value = item.id; return option; }));
    choose.value = libraryEntries.some(item => item.id === selected) ? selected : '';
    load.disabled = replace.disabled = remove.disabled = !choose.value; undo.disabled = !library.canUndo;
    if (library.error) status.textContent = library.error;
  }
  function sync() {
    const s = settings();
    if (cards.length !== s.steps.length) rebuild(s.steps.length);
    if (lastRuntime !== runtime()) {
      lastRuntime = runtime(); clean = fingerprint(s); loadedId = libraryEntries.find(item => patternMatches(item, s))?.id || ''; playingStep = -1; discard.hidden = true;
    }
    length.value = s.sequenceLength;
    const rate=editor.querySelector('#'+id+'-clock-divide');if(rate)rate.value=s.clockDivide;
    cards.forEach(({ card, pitch, gate }, i) => {
      pitch.value = s.steps[i].pitch; gate.textContent = s.steps[i].on ? 'Gate on' : 'Rest'; gate.setAttribute('aria-pressed', s.steps[i].on);
      card.dataset.outsideLoop = i >= s.sequenceLength;
      dots[i].dataset.gate = s.steps[i].on; dots[i].dataset.outsideLoop = i >= s.sequenceLength;
    });
    renderReadout();
  }
  function isDirty() {
    const named = libraryEntries.find(item => item.id === loadedId);
    return named ? !patternMatches(named, settings()) : fingerprint(settings()) !== clean;
  }
  function renderReadout() {
    const s = settings();
    const named = libraryEntries.find(item => item.id === loadedId);
    const dirty = isDirty();
    const pending = runtime().request;
    const text = (playingStep >= 0 ? 'Playing ' + (playingStep + 1) + ' / ' + s.sequenceLength : 'Waiting for clock · ' + s.sequenceLength + ' steps') + ' · ' + (named?.name || 'Working pattern') + (dirty ? ' · Unsaved edits' : '') + (pending ? ' · Next: ' + pending.name : '');
    if (readout.textContent !== text) readout.textContent = text;
    if(editor.compactSummary && editor.compactSummary.textContent!==text)editor.compactSummary.textContent=text;
    cancel.hidden = !pending;
  }
  const unsubscribe = library.subscribe(() => { libraryEntries = library.entries; renderLibrary(); renderReadout(); });
  renderLibrary(); sync();
  let overlay;
  if(overlays){
    const launcher=button('Edit sequence',()=>overlay.toggle());launcher.className='reset sequence-launcher';
    const summary=make('p','readout sequence-compact-status');
    editor.before(launcher,summary);editor.dataset.moduleOwner=id;
    overlay=overlays.register({id:'sequence:'+id,title:'Edit '+(id==='original'?'Sequencer':id),kind:'sequence',content:editor,trigger:launcher});
    editor.compactSummary=summary;renderReadout();
  }
  return {
    sync, destroy(){unsubscribe();overlay?.destroy();},
    update(signal) {
      const pending = runtime().request;
      if (pending && (signal?.patternToken === pending.token || !isRunning())) perform(pending, signal?.patternToken !== pending.token);
      playingStep = signal?.step ?? -1;
      cards.forEach(({ card }, i) => { if (i === playingStep) card.setAttribute('aria-current', 'step'); else card.removeAttribute('aria-current'); });
      dots.forEach((node, i) => { if (i === playingStep) node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current'); });
      if (follow.checked && playingStep >= 0 && Math.floor(playingStep / 8) !== page) showPage(Math.floor(playingStep / 8));
      renderReadout();
      if (signal?.unavailable) readout.textContent = 'AudioWorklet unavailable · pattern editing and saving are available';
    },
  };
}
