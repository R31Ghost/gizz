import { sequenceGroup, sequenceTone } from './rack-colors.js';

export function orbitTracks(state) {
  return [{id:'original',name:'Sequencer',settings:state}, ...(state.instances||[]).filter(m=>m.type==='Sequencer').map(m=>({id:m.id,name:m.name,settings:m.settings}))];
}
export function orbitPoint(step,length,radius,center=200) {
  if(step < 0) return null;
  const angle=2*Math.PI*(step % length)/length-Math.PI/2;
  return {x:center+Math.cos(angle)*radius,y:center+Math.sin(angle)*radius};
}
export function setupOrbitPanel({docks,state,read,reveal,reset,overlays,ports=new Map()}) {
  const panel=document.createElement(overlays?'section':'details'); panel.className='orbit-panel'; panel.open=true;
  const summary=document.createElement(overlays?'h3':'summary'); summary.textContent='07 · Orbital sequencer';
  const explanation=document.createElement('p'); explanation.textContent='Each colored ring follows a real sequencer and matches the instrument it controls. One revolution is its complete loop, not necessarily one bar. Tap a ring or Edit to open its sequence. Collapse this window to keep patching.';
  const canvas=document.createElement('canvas'); canvas.width=400;canvas.height=400;canvas.setAttribute('aria-label','Independent sequence playheads');
  const list=document.createElement('div'); list.className='orbit-track-list';
  const restart=document.createElement('button');restart.type='button';restart.textContent='Reset tracks together';restart.addEventListener('click',reset);
  panel.append(summary,explanation,restart,canvas,list);
  const toggle=document.createElement('button');toggle.type='button';toggle.textContent='Orbits';
  docks.toolbar.querySelector('.rack-tools').append(toggle);
  let overlay, rows=[],signature='';
  toggle.addEventListener('click',()=>{if(overlay)overlay.toggle();else{panel.open=!panel.open;if(panel.open)panel.scrollIntoView({block:'nearest'});}});
  canvas.addEventListener('click',event=>{const rect=canvas.getBoundingClientRect();const radius=Math.hypot((event.clientX-rect.left)*400/rect.width-200,(event.clientY-rect.top)*400/rect.height-200);const index=Math.round((radius-36)/148*Math.max(1,rows.length-1));if(rows[index])reveal(rows[index].track.id);});
  const api = { update(){
    const tracks=orbitTracks(state), next=tracks.map(t=>t.id+':'+t.name).join('|');
    if(next!==signature){signature=next;list.replaceChildren();rows=tracks.map(track=>{const row=document.createElement('div'),button=document.createElement('button'),label=document.createElement('span'),name=document.createElement('strong'),pending=document.createElement('small');button.type='button';button.textContent='Edit '+track.name;button.addEventListener('click',()=>reveal(track.id));row.append(name,button,label,pending);list.append(row);return{track,row,name,label,pending};});}
    rows.forEach((row,i)=>{const track=tracks[i],tone=sequenceTone(state,track.id,ports),group=sequenceGroup(state,track.id,ports);row.row.style.setProperty('--rack-tint',tone.surface);row.row.style.setProperty('--rack-color',tone.ink);row.name.textContent=group?.name || track.name;});
    if(!panel.open || panel.hidden || overlay?.collapsed || overlay?.window.hidden)return;
    const ctx=canvas.getContext('2d');if(ctx){ctx.clearRect(0,0,400,400);ctx.fillStyle='#101b19';ctx.fillRect(0,0,400,400);}
    rows.forEach((row,i)=>{const track=tracks[i],signal=read(track.id),length=track.settings.sequenceLength,radius=36+i*148/Math.max(1,tracks.length-1),point=orbitPoint(signal?.step ?? -1,length,radius),tone=sequenceTone(state,track.id,ports);const clockInput=track.id==='original'?'seqClockIn':track.id+':seqClockIn';
      const duration=state.patch?.[clockInput]==='clockOut' ? ' · '+(length*(track.settings.clockDivide||1)/(state.division*4))+' bars (4/4, '+state.division+' pulses/beat)' : ' · external clock';
      row.label.textContent=length+' steps · /'+(track.settings.clockDivide||1)+' · '+(point?'step '+(signal.step+1):'idle / waiting')+duration;
      const queued=state.sequenceRuntime?.[track.id]?.request;row.pending.textContent=queued?'Next: '+queued.name:'No queued change';row.pending.title=row.pending.textContent;row.label.title=row.label.textContent;
      if(ctx){ctx.strokeStyle=tone.surface;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(200,200,radius,0,2*Math.PI);ctx.stroke();if(point){ctx.fillStyle=tone.surface;ctx.beginPath();ctx.arc(point.x,point.y,6,0,2*Math.PI);ctx.fill();}}
    });
  }};
  if(overlays){overlay=overlays.register({id:'orbits',title:'Orbital sequencer',content:panel,trigger:toggle,kind:'orbit',onVisibility(){api.update();}});}else{docks.workspace.before(panel);panel.addEventListener('toggle',()=>api.update());}
  api.update();return api;
}
