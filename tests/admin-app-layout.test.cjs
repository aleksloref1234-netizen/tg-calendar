const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const model=require('../admin-app-model.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const base='https://example.test/tg-calendar/';

function harness(){
  const nodes=new Map(),timers=new Map(),frames=[];
  let timerId=0,expandCalls=0,fetchCalls=0;
  function node(){
    const attributes=new Map(),classes=new Set(),events=new Map();
    return {
      attributes,classes,events,hidden:false,open:false,style:{},dataset:{},children:[],removed:0,
      classList:{add(name){classes.add(name);},remove(name){classes.delete(name);},toggle(name,on){if(on)classes.add(name);else classes.delete(name);}},
      setAttribute(key,value){attributes.set(key,String(value));},getAttribute(key){return attributes.get(key);},removeAttribute(key){attributes.delete(key);},
      addEventListener(name,fn){events.set(name,fn);},
      replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);},
      remove(){this.removed++;},querySelectorAll(){return [];},
      showModal(){this.open=true;},close(){this.open=false;events.get('close')?.();},
    };
  }
  const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
  const body=node(),dock=node(),buttons=Array.from({length:4},node);
  get('admin-app').querySelectorAll=()=>buttons;
  const document={body,documentElement:node(),getElementById:get,querySelector:()=>dock,querySelectorAll:()=>[],addEventListener(){},createElement(tag){
    const el=node();
    if(tag==='iframe'){
      el.leave={dirty:false,busy:false};el.disposed=0;el.dialog=null;
      el.contentWindow={location:{href:''},AdminControlEmbed:{getLeaveState:()=>el.leave,dispose(){el.disposed++;}}};
      el.contentDocument={querySelector:()=>el.dialog};
      Object.defineProperty(el,'src',{get(){return this.contentWindow.location.href;},set(value){this.contentWindow.location.href=value;}});
      frames.push(el);
    }
    return el;
  }};
  const window={AdminAppModel:model,Telegram:{WebApp:{ready(){},expand(){expandCalls++;},BackButton:{show(){},hide(){}}}},addEventListener(){},scrollTo(){}};
  const storage=new Map();
  const source=read('admin-app.js').replace('initIcons();void bootstrap();','window.layoutTest={state,mountModule,closeFrame,setModuleExpanded,moduleBack,showView,guarded};');
  assert.ok(source.includes('window.layoutTest='));
  vm.runInNewContext(source,{window,document,location:{href:base+'app.html'},URL,URLSearchParams,AbortController,Date,
    setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
    sessionStorage:{getItem:key=>storage.get(key),setItem(key,value){storage.set(key,value);}},
    fetch(){fetchCalls++;throw new Error('Unexpected network request');},
  });
  const app=window.layoutTest;
  app.state.data={viewer:{telegram_id:101,nickname:'Test_Admin'},preferences:{},server:{name:'Test',number:'68'},sections:model.sections([
    {id:'additional-tasks',title:'Дополнительные задания',group:'personal',path:'admin-task-marketplace.html',allowed:true},
    {id:'my-statistics',title:'Моя статистика',group:'personal',path:'dashboard.html',allowed:true},
  ])};
  app.state.loadedAt=Date.now();
  const target=id=>{const section=app.state.data.sections.find(row=>row.id===id);return model.target(section.path,app.state.data.sections,base,app.state.data.viewer);};
  return {app,get,body,frames,timers,target,window,get expandCalls(){return expandCalls;},get fetchCalls(){return fetchCalls;}};
}

test('opening a section compacts the shell without changing the embedded target',()=>{
  const h=harness();h.app.mountModule(h.target('additional-tasks'));
  assert.ok(h.body.classes.has('module-open'));
  assert.ok(!h.body.classes.has('module-expanded'));
  assert.equal(h.app.state.frame.src,base+'admin-task-marketplace.html');
  assert.equal(h.get('module-view').hidden,false);
  assert.equal(h.get('module-expand').getAttribute('aria-pressed'),'false');
});

test('expanding and restoring keeps the same frame, unsaved form and scroll without network calls',()=>{
  const h=harness();h.app.mountModule(h.target('additional-tasks'));
  const frame=h.app.state.frame;frame.leave.dirty=true;frame.scrollY=450;
  const initialExpand=h.expandCalls;
  h.get('module-expand').events.get('click')();
  assert.equal(h.app.state.frame,frame);
  assert.equal(frame.disposed,0);assert.equal(frame.removed,0);
  assert.equal(frame.leave.dirty,true);assert.equal(frame.scrollY,450);
  assert.equal(h.get('module-expand').getAttribute('aria-pressed'),'true');
  assert.equal(h.get('module-expand').getAttribute('aria-label'),'Вернуть нижнее меню');
  assert.ok(h.body.classes.has('module-expanded'));
  assert.equal(h.expandCalls,initialExpand+1);
  h.get('module-expand').events.get('click')();
  assert.equal(h.app.state.frame,frame);
  assert.equal(h.app.state.moduleExpanded,false);
  assert.equal(h.get('module-expand').getAttribute('aria-label'),'Развернуть раздел');
  assert.ok(!h.body.classes.has('module-expanded'));
  assert.equal(h.fetchCalls,0);
});

test('closing a section disposes its frame and restores ordinary shell mode',()=>{
  const h=harness();h.app.mountModule(h.target('additional-tasks'));h.app.setModuleExpanded(true);
  const frame=h.app.state.frame;h.app.closeFrame();
  assert.equal(frame.disposed,1);assert.equal(frame.removed,1);
  assert.equal(h.app.state.frame,null);assert.equal(h.app.state.moduleExpanded,false);
  assert.ok(!h.body.classes.has('module-open'));assert.ok(!h.body.classes.has('module-expanded'));
  assert.equal(h.get('module-container').children.length,0);
  assert.equal(h.timers.size,0);
  h.app.setModuleExpanded(true);
  assert.equal(h.app.state.moduleExpanded,false);
});

test('reload and in-section navigation retain expanded mode but a fresh entry does not',()=>{
  const h=harness();h.app.mountModule(h.target('additional-tasks'));h.app.setModuleExpanded(true);
  const first=h.app.state.frame;
  h.get('module-reload').events.get('click')();
  assert.notEqual(h.app.state.frame,first);assert.equal(first.disposed,1);
  assert.equal(h.app.state.moduleExpanded,true);
  h.app.mountModule(h.target('my-statistics'));
  assert.equal(h.app.state.moduleExpanded,true);
  h.app.closeFrame();h.app.mountModule(h.target('additional-tasks'));
  assert.equal(h.app.state.moduleExpanded,false);
});

test('busy and dirty leave/reload protections still apply in expanded mode',()=>{
  const h=harness();h.app.mountModule(h.target('additional-tasks'));h.app.setModuleExpanded(true);
  const frame=h.app.state.frame;
  frame.leave.busy=true;frame.leave.dirty=true;
  h.app.moduleBack();h.get('module-reload').events.get('click')();
  assert.equal(h.app.state.frame,frame);assert.equal(h.get('leave-dialog').open,false);
  assert.match(h.get('app-toast').textContent,/Дождитесь/);
  frame.leave.busy=false;h.app.moduleBack();
  assert.equal(h.get('leave-dialog').open,true);assert.equal(h.app.state.frame,frame);
  h.get('cancel-leave').events.get('click')();
  assert.equal(h.app.state.frame,frame);assert.equal(h.app.state.moduleExpanded,true);
  h.app.moduleBack();h.get('confirm-leave').events.get('click')();
  assert.equal(h.app.state.frame,null);assert.equal(h.app.state.view,'catalog');
  assert.equal(h.app.state.moduleExpanded,false);
});

test('back closes a child dialog before leaving the expanded section',()=>{
  const h=harness();h.app.mountModule(h.target('additional-tasks'));h.app.setModuleExpanded(true);
  const frame=h.app.state.frame;let closed=0;frame.dialog={close(){closed++;}};
  h.app.moduleBack();assert.equal(closed,1);assert.equal(h.app.state.frame,frame);
  assert.equal(h.app.state.moduleExpanded,true);
});

test('late load events of removed frames cannot overwrite the current layout',()=>{
  const h=harness();h.app.mountModule(h.target('additional-tasks'));
  const old=h.app.state.frame;h.app.setModuleExpanded(true);h.app.mountModule(h.target('my-statistics'));
  old.events.get('load')();
  assert.equal(h.app.state.section.id,'my-statistics');assert.equal(h.app.state.moduleExpanded,true);
  h.app.state.frame.events.get('load')();
  assert.equal(h.get('module-loading').hidden,true);
});

test('layout rules keep back and reload controls accessible and version their assets',()=>{
  const html=read('app.html'),css=read('admin-app.css');
  assert.match(html,/id="module-expand"[^>]+aria-pressed="false"[^>]+aria-controls="module-container"/);
  assert.match(html,/admin-app\.css\?v=20261106-1/);assert.match(html,/admin-app\.js\?v=20261106-1/);
  assert.match(css,/body\.module-open\{--app-header:0px\}/);
  assert.match(css,/\.module-open \.app-header\{display:none\}/);
  assert.match(css,/body\.module-expanded\{--app-dock:0px\}/);
  assert.match(css,/@media\(pointer:coarse\)\{\.module-open \.module-toolbar \.icon-button\{width:40px;min-height:40px\}/);
  assert.doesNotMatch(css,/#module-(?:back|reload)\s*\{[^}]*display:none/);
});
