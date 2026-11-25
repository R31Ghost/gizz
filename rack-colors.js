const palette=[
 {surface:'#f4dfd4',ink:'#90482f'}, {surface:'#d8ebe6',ink:'#25685b'},
 {surface:'#e5def2',ink:'#68518f'}, {surface:'#f4e9c8',ink:'#805f20'},
 {surface:'#dce7f5',ink:'#365f90'}, {surface:'#e4ebd4',ink:'#536c32'},
];
export function rackTone(id){const number=String(id).match(/\d+$/)?.[0];const index=number?Number(number)-1:[...String(id)].reduce((n,c)=>n+c.charCodeAt(0),0);return palette[Math.abs(index)%palette.length];}
export function sequenceGroup(state,id,ports){
 const member=id==='original'?'Sequencer':id;
 const owner=state.instruments?.find(g=>g.members.includes(member));if(owner)return owner;
 const outputs=[id==='original'?'seqGateOut':id+':seqGateOut',id==='original'?'seqPitchOut':id+':seqPitchOut'];
 const targets=Object.entries(state.patch||{}).filter(([,v])=>(Array.isArray(v)?v:[v]).some(source=>outputs.includes(source))).map(([input])=>ports.get(input)?.module);
 return state.instruments?.find(g=>g.members.some(member=>targets.includes(member)));
}
export function sequenceTone(state,id,ports){return rackTone(sequenceGroup(state,id,ports)?.id || 'track-'+(id==='original'?0:id));}
