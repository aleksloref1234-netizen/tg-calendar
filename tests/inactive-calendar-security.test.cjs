const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../inactive-calendar.js'),'utf8');
function setup({query=true,ok=true}={}){
  const events=new Map(),nodes=new Map(),sent=[],calls=[],alerts=[];
  let closed=0;
  const nativeButton={setParams(){},show(){},hide(){},enable(){},disable(){},showProgress(){},hideProgress(){}};
  const tg={platform:'tdesktop',initData:query?'signed-calendar-data':'',initDataUnsafe:query?{query_id:'own-query'}:{},MainButton:nativeButton,HapticFeedback:{notificationOccurred(){}},onEvent(k,fn){events.set(k,fn);},offEvent(){},ready(){},expand(){},sendData(value){sent.push(JSON.parse(value));},close(){closed++;},showAlert(value){alerts.push(value);}};
  const win={Telegram:{WebApp:tg},addEventListener(){},alert(value){alerts.push(value);}};
  let options,picker;
  vm.runInNewContext(script,{window:win,document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{style:{},textContent:''});return nodes.get(id);}},flatpickr(_target,opts){options=opts;picker={formatDate(d){return [String(d.getDate()).padStart(2,'0'),String(d.getMonth()+1).padStart(2,'0'),d.getFullYear()].join('.');},setDate(dates){options.onChange(dates,'',picker);}};return picker;},fetch:async(url,opts)=>{calls.push({url,opts});return {ok,status:ok?200:409,json:async()=>ok?{status:'success',data:{accepted:true}}:{status:'error',message:'Заявление отменено'}};},AbortController,setTimeout,clearTimeout,Date});
  return {win,tg,calls,sent,alerts,submit:()=>events.get('mainButtonClicked')(),get closed(){return closed;}};
}
test('legacy calendar contains no bot credentials or direct Bot API invocation',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.doesNotMatch(html+script,/\d{7,}:[A-Za-z0-9_-]{25,}|api\.telegram\.org\/bot|BOT_TOKEN/);
  assert.match(html,/inactive-calendar\.js/);
});
test('inline query goes through the signed server relay without a user-supplied query ID',async()=>{
  const h=setup();h.win.selectDays(3);await h.submit();
  assert.equal(h.calls.length,1);assert.equal(h.closed,1);
  assert.match(h.calls[0].url,/\/api\/webapp\/inactive-calendar$/);
  assert.equal(h.calls[0].opts.headers['X-Telegram-Init-Data'],'signed-calendar-data');
  assert.deepEqual(Object.keys(JSON.parse(h.calls[0].opts.body)).sort(),['end_date','start_date']);
});
test('keyboard button flow still works with empty initData through native sendData',async()=>{
  const h=setup({query:false});h.win.selectToday();await h.submit();
  assert.equal(h.calls.length,0);assert.equal(h.sent.length,1);assert.equal(h.closed,1);
});
test('failed or cancelled application does not silently close the calendar',async()=>{
  const h=setup({ok:false});h.win.selectToday();await h.submit();
  assert.equal(h.closed,0);assert.equal(h.alerts[0],'Заявление отменено');
});
