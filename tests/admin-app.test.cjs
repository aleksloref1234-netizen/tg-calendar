const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const model=require('../admin-app-model.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const base='https://example.test/tg-calendar/';
const items=model.sections([
  {id:'my-statistics',title:'Моя статистика',description:'Личный норматив',group:'personal',allowed:true,path:'dashboard.html'},
  {id:'administration',title:'Администрация',group:'analytics',allowed:false,path:null},
  {id:'norm-check',title:'Проверка нормы',group:'management',allowed:false,path:null},
  {id:'additional-tasks',title:'Дополнительные задания',group:'personal',allowed:false,path:null},
  {id:'leadership-tasks',title:'Задачник',group:'management',allowed:true,path:'leadership-tasks-team-preview.html'},
  {id:'calendar',title:'Календарь',group:'workflow',allowed:false,contextual:true,path:null},
]);

test('no closed section is made navigable by its title or a supplied path',()=>{
  assert.equal(model.target('norm-check.html',items,base),null);
  assert.equal(model.target('admin-task-marketplace.html',items,base),null);
  assert.equal(model.target('training-center.html',items,base),null);
  assert.equal(model.sections([{id:'evil',path:'https://attacker.test/',allowed:true}])[0].allowed,false);
});
test('private admin statistics cannot be opened through personal statistics access',()=>{
  assert.equal(model.target('dashboard.html?admin_id=202',items,base,{telegram_id:101}),null);
  assert.equal(model.target('dashboard.html?admin_id=101',items,base,{telegram_id:101}).section.id,'my-statistics');
  const admin=items.map(s=>s.id==='administration'?{...s,allowed:true,path:'admin-overview.html'}:s);
  assert.equal(model.target('dashboard.html?admin_id=202',admin,base,{telegram_id:101}).section.id,'administration');
});
test('module URLs reject external origins, traversal, demo modes and bad IDs',()=>{
  for(const url of ['https://attacker.test/dashboard.html','/dashboard.html','../dashboard.html','javascript:alert(1)','dashboard.html?preview=1','dashboard.html?admin_id=abc','dashboard.html?admin_id=-1'])assert.equal(model.target(url,items,base,{telegram_id:101}),null,url);
  const target=model.target('dashboard.html?ignored=secret#tgWebAppData=do-not-copy',items,base);
  assert.equal(target.url.href,base+'dashboard.html');
});
test('non-master cannot switch to the master leadership task editor',()=>{
  assert.equal(model.target('leadership-tasks-preview.html',items,base,{is_master:false}),null);
  assert.equal(model.target('leadership-tasks-team-preview.html?ga_view=1&role=main',items,base,{is_master:false}).url.search,'');
});
test('catalog search and categories include closed entries but contextual pickers stay out of the default directory',()=>{
  assert.equal(model.filter(items).length,items.length-1);
  assert.equal(model.filter(items,{search:'нормы'})[0].id,'norm-check');
  assert.equal(model.filter(items,{group:'workflow'})[0].id,'calendar');
  assert.equal(model.filter(items,{group:'analytics'})[0].allowed,false);
});
test('profile names and descriptions are escaped, not interpreted as markup',()=>{
  assert.equal(model.escape('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('busy work takes priority over a discard prompt, and clean pages leave directly',()=>{
  assert.equal(model.leaveDecision({busy:true,dirty:true}),'busy');
  assert.equal(model.leaveDecision({dirty:true}),'confirm');
  assert.equal(model.leaveDecision({dirty:false}),'allow');
});

function bridgeHarness({active=true,crossOrigin=false}={}){
  const listeners=new Map(),events=new Map(),classes=new Set(),links=[];
  const nativeButton={hidden:0,show(){return this;},onClick(fn){events.set('mainButtonClicked',fn);return this;},offClick(fn){if(events.get('mainButtonClicked')===fn)events.delete('mainButtonClicked');},hide(){this.hidden++;return this;}};
  const native={initData:'signed-not-for-storage',MainButton:nativeButton,onEvent(name,fn){events.set(name,fn);},offEvent(name,fn){if(events.get(name)===fn)events.delete(name);},ready(){return this.initData;}};
  const context={telegram:native,viewer:{telegram_id:101,nickname:'Test_Admin'},preferences:{reduce_motion:true}};
  const host={getContext(){if(crossOrigin)throw new Error('origin');return active?context:null;},navigate(){return false;}};
  const win={parent:{AdminControlApp:host},Telegram:{WebApp:{initData:''}},addEventListener(name,fn){listeners.set(name,fn);}};
  const doc={readyState:'complete',documentElement:{dataset:{},classList:{add(name){classes.add(name);},toggle(name,enabled){if(enabled)classes.add(name);else classes.delete(name);}}},createElement(){return {};},head:{append(el){links.push(el);}},addEventListener(name,fn){listeners.set(name,fn);}};
  vm.runInNewContext(read('admin-app-bridge.js'),{window:win,document:doc,URL,location:{href:base+'dashboard.html'}});
  return {win,native,nativeButton,events,listeners,classes,links};
}
test('embedded child inherits signed transport only from its active same-origin host',()=>{
  const h=bridgeHarness();
  assert.equal(h.win.Telegram.WebApp.initData,'signed-not-for-storage');
  assert.equal(h.win.Telegram.WebApp.ready(),'signed-not-for-storage');
  assert.equal(h.win.AdminControlEmbed.viewer.nickname,'Test_Admin');
  assert.ok(h.classes.has('admin-app-reduce-motion'));
  assert.equal(bridgeHarness({active:false}).win.Telegram.WebApp.initData,'');
  assert.equal(bridgeHarness({crossOrigin:true}).win.Telegram.WebApp.initData,'');
});
test('leaving a module removes its native button subscriptions and hides its buttons',()=>{
  const h=bridgeHarness();const listener=()=>{};
  h.win.Telegram.WebApp.onEvent('event',listener);
  h.win.Telegram.WebApp.MainButton.show().onClick(listener);
  assert.equal(h.events.size,2);
  h.win.AdminControlEmbed.dispose();h.win.AdminControlEmbed.dispose();
  assert.equal(h.events.size,0);
  assert.equal(h.nativeButton.hidden,1);
});
test('child leave state contains booleans only and resets on disposal',()=>{
  const h=bridgeHarness();h.win.AdminControlEmbed.setLeaveState({dirty:true,busy:false,initData:'never-forward'});
  assert.equal(h.win.AdminControlEmbed.getLeaveState().dirty,true);
  assert.equal(h.win.AdminControlEmbed.getLeaveState().initData,undefined);
  h.win.AdminControlEmbed.dispose();h.win.AdminControlEmbed.setLeaveState({dirty:true,busy:true});assert.equal(h.win.AdminControlEmbed.getLeaveState().dirty,false);
});
test('all existing non-training module pages install the bridge after the Telegram SDK',()=>{
  for(const file of model.FILES){const html=read(file);assert.ok(html.indexOf('telegram-web-app.js')<html.indexOf('admin-app-bridge.js'),file);assert.match(html,/admin-app-bridge\.js/);}
  for(const file of ['training-center.html','training-curator.html','training-editor.html'])assert.doesNotMatch(read(file),/admin-app-bridge/);
});
test('unified app has no production preview bypass or persisted authentication data',()=>{
  const js=read('admin-app.js'),bridge=read('admin-app-bridge.js'),html=read('app.html');
  for(const script of [js,bridge,read('admin-app-model.js')])new vm.Script(script);
  assert.match(js,/X-Telegram-Init-Data/);
  assert.doesNotMatch(js,/PREVIEW_MODE|fixture|mock|preview=1/);
  assert.match(html,/frame-src 'self'/);
  assert.doesNotMatch(bridge,/postMessage\(|localStorage\.|sessionStorage\./);
  assert.match(js,/state\.frame\.remove\(\)/);
  assert.match(js,/clearTimeout\(frameTimer\)/);
});
