const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../norm-check-lifecycle.js'),'utf8');
function fixture(fetch, {confirm=true,timers=setTimeout,date=Date}={}){
  const events=new Map(),states=[],controls=[{disabled:false,isConnected:true},{disabled:true,isConnected:true}];
  let form={editable:true,value:'',choice:null};
  const window={Telegram:{WebApp:{initData:'signed-data',showConfirm:(text,fn)=>fn(confirm)}},AdminControlEmbed:{setLeaveState:value=>states.push({...value})},addEventListener:(n,fn)=>events.set(n,fn)};
  vm.runInNewContext(source,{window,document:{querySelectorAll:()=>controls},fetch,AbortController,setTimeout:timers,clearTimeout,Date:date,Intl});
  window.NormLifecycle.configure(()=>form);
  return{api:window.NormLifecycle,window,events,states,controls,set:value=>form={...form,...value}};
}
const ok=()=>({ok:true,status:200,json:async()=>({status:'success',data:{saved:true}})});
test('edited values and warning choice are dirty; a recorded selection starts clean',async()=>{
  const h=fixture(async()=>ok());assert.equal(h.api.isDirty(),false);
  h.set({value:'20'});h.api.update();assert.equal(h.states.at(-1).dirty,true);
  h.api.markClean();assert.equal(h.api.isDirty(),false);
  h.set({choice:false});assert.equal(h.api.isDirty(),true);
  h.set({editable:false});assert.equal(h.api.isDirty(),false);
});
test('declining discard retains the original form; confirming permits navigation',async()=>{
  const h=fixture(async()=>ok(),{confirm:false});h.set({value:'20'});assert.equal(await h.api.confirmDiscard(),false);assert.equal(h.api.isDirty(),true);
  const yes=fixture(async()=>ok());yes.set({value:'20'});assert.equal(await yes.api.confirmDiscard(),true);
});
test('pending work locks controls and blocks leaving, then restores previous disabled states',async()=>{
  let resolve;const h=fixture(()=>new Promise(r=>resolve=r));
  const pending=h.api.request('/norms',{action:'submit_daily',operation_id:'same'});
  assert.equal(h.states.at(-1).busy,true);assert.equal(h.controls[0].disabled,true);
  assert.equal(await h.api.confirmDiscard(),false);
  await assert.rejects(h.api.request('/norms',{}),/Дождитесь/);
  resolve(ok());await pending;assert.equal(h.states.at(-1).busy,false);assert.equal(h.controls[0].disabled,false);assert.equal(h.controls[1].disabled,true);
});
test('transient retries send the exact same immutable operation payload',async()=>{
  const sent=[];let calls=0;
  const h=fixture(async(url,options)=>{sent.push(options.body);return ++calls===1?{ok:false,status:503,json:async()=>({status:'error'})}:ok()},{timers:(fn,ms)=>setTimeout(fn,ms<4000?0:ms)});
  const payload={operation_id:'stable',reports:20};const pending=h.api.request('/norms',payload);payload.reports=999;
  await pending;assert.equal(calls,2);assert.equal(sent[0],sent[1]);assert.equal(JSON.parse(sent[0]).reports,20);
});
test('forbidden requests never retry even with a retryable flag',async()=>{
  let calls=0;const h=fixture(async()=>{calls++;return{ok:false,status:403,json:async()=>({status:'error',message:'Нет доступа',retryable:true})}});
  await assert.rejects(h.api.request('/norms',{}),/Нет доступа/);assert.equal(calls,1);
});
test('page disposal aborts transport and prevents delayed retry attempts',async()=>{
  let calls=0;const h=fixture((url,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))});
  const pending=h.api.request('/norms',{});h.events.get('pagehide')();await assert.rejects(pending,/aborted/);assert.equal(calls,1);assert.equal(h.states.at(-1).busy,false);
});
test('overall deadline bounds a connection which repeatedly hangs',async()=>{
  let now=0,calls=0;const h=fixture((url,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>{const e=new Error();e.name='AbortError';reject(e)}))},{date:{now:()=>now+=10000},timers:(fn)=>setTimeout(fn,1)});
  await assert.rejects(h.api.request('/norms',{}),/слишком долго/);assert.equal(calls,2);assert.equal(h.states.at(-1).busy,false);
});
test('browser date is Moscow calendar date, not UTC ISO conversion',()=>{
  const h=fixture(async()=>ok());assert.match(h.api.moscowDate(),/^\d{4}-\d{2}-\d{2}$/);assert.match(source,/timeZone:'Europe\/Moscow'/);
});
