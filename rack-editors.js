// Editors are modeless, mounted once outside rack layout/containment.
export function setupRackEditors({ toolbar = () => null, onChange = () => {} } = {}) {
  const host = document.createElement('div'); host.className = 'rack-editor-host'; document.body.append(host);
  const entries = new Map(); let front = 40;
  const makeButton = (text, label, action) => { const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.addEventListener('click',action);return b; };
  function register({ id, title, content, trigger, onVisibility = () => {}, kind = 'instrument' }) {
    if(entries.has(id)) return entries.get(id);
    const window=document.createElement('section'); window.className='rack-editor';window.dataset.rackEditor=id;window.dataset.kind=kind;window.hidden=true;
    window.setAttribute('role','region');window.setAttribute('aria-label',title);
    const header=document.createElement('header');header.className='rack-editor-head';header.tabIndex=0;header.setAttribute('aria-label','Move '+title+' with arrow keys');header.title='Drag to move · − collapse · × close';
    const caption=document.createElement('strong');caption.textContent=title;
    const body=document.createElement('div');body.className='rack-editor-body';body.dataset.rackViewport='';body.append(content);content.hidden=true;
    const fold=makeButton('−','Collapse '+title,()=>setCollapsed(!entry.collapsed));
    const close=makeButton('×','Close '+title,()=>hide(true));header.append(caption,fold,close);window.append(header,body);host.append(window);
    const entry={id,window,body,content,trigger,collapsed:false,open,hide,toggle,collapse:()=>setCollapsed(true),destroy,setTitle(value){caption.textContent=value;window.setAttribute('aria-label',value);header.setAttribute('aria-label','Move '+value+' with arrow keys');fold.setAttribute('aria-label',(entry.collapsed?'Expand ':'Collapse ')+value);close.setAttribute('aria-label','Close '+value);},setTheme(tone){for(const n of [window,trigger].filter(Boolean)){n.style.setProperty('--rack-tint',tone.surface);n.style.setProperty('--rack-color',tone.ink);}}};
    entries.set(id,entry);
    function notify(){trigger?.setAttribute('aria-expanded',!window.hidden&&!entry.collapsed);onVisibility(!window.hidden&&!entry.collapsed);onChange();}
    function raise(){window.style.zIndex=String(++front);}
    function clamp(){
      const width=Math.min(entry.collapsed?340:kind==='orbit'?480:680,globalThis.window.innerWidth-16), minTop=Math.min(globalThis.window.innerHeight-54,Math.max(8,(toolbar()?.getBoundingClientRect().bottom||0)+8));
      const fullHeight=['instrument','sequence','orbit'].includes(kind), height=entry.collapsed?46:Math.min(fullHeight?(kind==='orbit'?740:600):Math.max(48,window.getBoundingClientRect().height),globalThis.window.innerHeight-minTop-8);
      const left=Math.max(8,Math.min(globalThis.window.innerWidth-width-8,Number(window.dataset.x)||globalThis.window.innerWidth-width-8));
      const top=Math.max(minTop,Math.min(globalThis.window.innerHeight-height-8,Number(window.dataset.y)||minTop));
      window.style.left=left+'px';window.style.top=top+'px';window.style.maxHeight=Math.max(48,globalThis.window.innerHeight-top-8)+'px';
      if(fullHeight && !entry.collapsed)window.style.height=height+'px';
      window.dataset.x=String(left);window.dataset.y=String(top);
    }
    function open(){window.hidden=false;entry.collapsed=false;window.classList.remove('is-collapsed');content.hidden=false;body.hidden=false;fold.textContent='−';fold.setAttribute('aria-label','Collapse '+caption.textContent);raise();clamp();notify();}
    function hide(restoreFocus=false){window.hidden=true;content.hidden=true;notify();if(restoreFocus && trigger && !trigger.closest('[hidden]'))trigger.focus({preventScroll:true});}
    function toggle(){if(window.hidden||entry.collapsed)open();else setCollapsed(true);}
    function setCollapsed(value){if(value && body.contains(document.activeElement))header.focus({preventScroll:true});entry.collapsed=value;window.classList.toggle('is-collapsed',value);content.hidden=value;body.hidden=value;fold.textContent=value?'+':'−';fold.setAttribute('aria-label',(value?'Expand ':'Collapse ')+caption.textContent);clamp();notify();}
    function destroy(){entries.delete(id);window.remove();onChange();}
    trigger?.setAttribute('aria-controls','rack-editor-'+id);window.id='rack-editor-'+id;trigger?.setAttribute('aria-expanded','false');
    let drag;
    header.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;raise();clamp();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:Number(window.dataset.x),top:Number(window.dataset.y)};header.setPointerCapture(e.pointerId);e.preventDefault();});
    header.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;window.dataset.x=String(drag.left+e.clientX-drag.x);window.dataset.y=String(drag.top+e.clientY-drag.y);clamp();onChange();});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])header.addEventListener(type,()=>drag=undefined);
    window.addEventListener('pointerdown',raise);
    window.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.stopPropagation();if(!e.target.closest('input, select, textarea')){e.preventDefault();setCollapsed(true);}return;}
      if(e.target!==header)return;const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];if(!delta)return;e.preventDefault();clamp();window.dataset.x=String(Number(window.dataset.x)+delta[0]);window.dataset.y=String(Number(window.dataset.y)+delta[1]);clamp();onChange();
    });
    window.addEventListener('scroll',onChange,{capture:true,passive:true});
    entry.reposition=()=>{if(!window.hidden){clamp();onChange();}};
    return entry;
  }
  globalThis.window?.addEventListener('resize',()=>{for(const entry of entries.values())entry.reposition();});
  return {host,register,get:id=>entries.get(id),destroy:id=>entries.get(id)?.destroy(),reposition(){for(const entry of entries.values())entry.reposition();},theme(id,tone){entries.get(id)?.setTheme(tone);},revealModule(id){entries.get('sequence:'+id)?.open();}};
}
