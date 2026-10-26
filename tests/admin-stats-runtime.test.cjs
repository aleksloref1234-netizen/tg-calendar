const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../admin-stats-runtime.js'), 'utf8');
function harness(fetch, {signed=true, embedded=false}={}) {
  const events=new Map(), stored=new Map();
  const window={Telegram:{WebApp:{initData:signed?'signed-data':'',initDataUnsafe:{user:{id:101}}}},location:{href:''},addEventListener:(n,f)=>events.set(n,f)};
  if(embedded)window.AdminControlEmbed={navigate:()=>false};
  const createElement=()=>({children:[],append(...items){this.children.push(...items)},addEventListener(n,f){this[n]=f},setAttribute(){},replaceChildren(){this.children=[]}});
  vm.runInNewContext(source,{window,fetch,AbortController,setTimeout,clearTimeout,document:{createElement},sessionStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)}});
  return {api:window.AdminStats,events,stored,window,createElement};
}
const ok=data=>({ok:true,status:200,json:async()=>({status:'success',data})});
test('simultaneous reads share one request, but a subsequent explicit refresh is fresh',async()=>{
  let calls=0,options;
  const h=harness(async(u,o)=>{calls++;options=o;return ok({total:3})});
  const a=h.api.request('/stats'),b=h.api.request('/stats');
  assert.equal(a,b);assert.equal((await a).total,3);assert.equal(calls,1);
  assert.equal(options.headers['X-Telegram-Init-Data'],'signed-data');assert.equal(options.cache,'no-store');
  await h.api.request('/stats');assert.equal(calls,2);
});
test('denied access is never retried automatically and no request is made without Telegram',async()=>{
  let calls=0;const fetch=async()=>{calls++;return {ok:false,status:403,json:async()=>({status:'error',message:'Закрыто'})}};
  await assert.rejects(harness(fetch).api.request('/stats'),e=>e.status===403);
  await assert.rejects(harness(fetch,{signed:false}).api.request('/stats'),/Telegram/);
  assert.equal(calls,1);
});
test('timeout and page exit abort pending requests rather than accumulating readers',async()=>{
  const fetch=(u,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
  const h=harness(fetch);
  await assert.rejects(h.api.request('/slow',{timeout:5}),/слишком долго/);
  const pending=h.api.request('/other');await Promise.resolve();h.events.get('pagehide')();
  await assert.rejects(pending,/aborted/);
  await assert.rejects(h.api.request('/third'),/закрыта/);
});
test('invalid JSON and malformed data are errors, not successful empty statistics',async()=>{
  await assert.rejects(harness(async()=>({ok:false,status:503,json:async()=>{throw new Error('html')}})).api.request('/stats'),/некорректный/);
  await assert.rejects(harness(async()=>ok(null)).api.request('/stats'),/не передал/);
});
test('synchronous transport errors do not poison the next manual retry',async()=>{
  let calls=0;const h=harness(()=>{if(++calls===1)throw new Error('offline');return Promise.resolve(ok({total:2}))});
  await assert.rejects(h.api.request('/stats'),/offline/);
  assert.equal((await h.api.request('/stats')).total,2);
});
test('server error strings are displayed as text, with a single manual retry button',()=>{
  const h=harness(async()=>ok({})),el=h.createElement();let retries=0;
  h.api.showError(el,'<img src=x>','<script>bad()</script>',()=>retries++);
  const box=el.children[0];assert.equal(box.children[0].textContent,'<img src=x>');assert.equal(box.children[1].textContent,'<script>bad()</script>');
  box.children[2].click();assert.equal(retries,1);assert.equal(box.children[2].disabled,true);
  assert.equal(box.innerHTML,undefined);
});
test('list interface state is viewer-scoped and bounded; no credentials or API data are persisted',()=>{
  const h=harness(async()=>ok({}));h.api.writeState('administration',{view:'admins',zone:'reduced',search:'x'.repeat(200),initData:'secret',admins:[1,2]});
  const raw=h.stored.get('admin-stats-ui:101:administration');assert.equal(JSON.parse(raw).search.length,100);assert.doesNotMatch(raw,/secret|initData|admins.*1/);
  assert.equal(h.api.readState('administration').zone,'reduced');
  h.stored.set('admin-stats-ui:101:administration','{"view":"evil","zone":"evil"}');assert.equal(h.api.readState('administration').view,'overview');
});
test('embedded navigation cannot fall back to an unapproved frame URL',()=>{
  const h=harness(async()=>ok({}),{embedded:true});assert.equal(h.api.navigate('closed.html'),false);assert.equal(h.window.location.href,'');
});
test('the three statistics pages use bounded transport and keep their existing visibility settings',()=>{
  for(const file of ['dashboard.html','admin-overview.html','inactive-overview.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');assert.match(html,/admin-stats-runtime\.js/);assert.match(html,/AdminStats\.request\(/);assert.match(html,/applyUiConfig\(/);
    for(const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script);
  }
});
