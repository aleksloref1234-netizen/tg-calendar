const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function harness({supported=true,fullscreen=false,throwRequest=false}={}){
  const events=new Map(),timers=new Map(),style=new Map(),classes=new Set(),notices=[];
  let serial=0,enters=0,exits=0,expands=0,externalExits=0;
  const telegram={isFullscreen:fullscreen,isVersionAtLeast:()=>supported,
    safeAreaInset:{top:24,bottom:18,left:0,right:0},contentSafeAreaInset:{top:48,bottom:0,left:0,right:0},
    expand(){expands++;},requestFullscreen(){enters++;if(throwRequest)throw new Error('unsupported');},exitFullscreen(){exits++;},
    onEvent(event,fn){events.set(event,fn);},offEvent(event,fn){if(events.get(event)===fn)events.delete(event);},
  };
  const sandbox={setTimeout(fn){const id=++serial;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','admin-app-viewport.js'),'utf8'),sandbox);
  const controller=sandbox.AdminAppViewport.create({telegram,root:{style:{setProperty(key,value){style.set(key,value);}},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}},onExit(){externalExits++;},onNotice(value){notices.push(value);}});
  return {controller,telegram,events,timers,style,classes,notices,
    emit(event,arg){events.get(event)?.(arg);},full(on){telegram.isFullscreen=on;events.get('fullscreenChanged')?.();},
    get enters(){return enters;},get exits(){return exits;},get expands(){return expands;},get externalExits(){return externalExits;}};
}

test('fullscreen is never requested on construction and requires an 8.0 client',()=>{
  const h=harness();assert.equal(h.enters,0);h.controller.enter();assert.equal(h.enters,1);assert.equal(h.expands,1);h.controller.destroy();
  const old=harness({supported:false});old.controller.enter();assert.equal(old.enters,0);assert.equal(old.expands,1);assert.equal(old.timers.size,0);
  const missing=harness();delete missing.telegram.requestFullscreen;missing.controller.enter();assert.equal(missing.enters,0);
});

test('success, restore, and external exit reconcile without a reload',()=>{
  const h=harness();h.controller.enter();h.full(true);assert.equal(h.timers.size,0);assert.ok(h.classes.has('telegram-fullscreen'));
  h.controller.leave({force:true});assert.equal(h.exits,1);h.full(false);assert.equal(h.timers.size,0);assert.ok(!h.classes.has('telegram-fullscreen'));
  h.controller.enter();h.full(true);h.full(false);assert.equal(h.externalExits,1);assert.equal(h.enters,2);
});

test('leaving before a delayed enter confirmation exits as soon as it arrives',()=>{
  const h=harness();h.controller.enter();h.controller.leave();assert.equal(h.exits,0);h.full(true);assert.equal(h.exits,1);h.full(false);assert.equal(h.timers.size,0);
});

test('rapid repeated toggles serialize native operations',()=>{
  const h=harness();h.controller.enter();h.controller.enter();assert.equal(h.enters,1);
  h.full(true);h.controller.leave();h.controller.enter();assert.equal(h.exits,1);assert.equal(h.enters,1);
  h.full(false);assert.equal(h.enters,2);assert.equal(h.externalExits,0);h.full(true);h.controller.destroy();
});

test('unsupported native mode and synchronous errors retain compact fallback without retries',()=>{
  const h=harness();h.controller.enter();h.emit('fullscreenFailed',{error:'UNSUPPORTED'});
  assert.equal(h.timers.size,0);assert.equal(h.notices.length,1);h.controller.leave();h.controller.enter();assert.equal(h.enters,1);
  const thrown=harness({throwRequest:true});assert.doesNotThrow(()=>thrown.controller.enter());assert.equal(thrown.timers.size,0);
  thrown.controller.enter();assert.equal(thrown.enters,1);
});

test('timeout does not poll or prevent cleanup of a late success',()=>{
  const h=harness();h.controller.enter();[...h.timers.values()][0]();
  assert.equal(h.timers.size,0);assert.equal(h.notices.length,1);assert.equal(h.enters,1);
  h.controller.leave();h.full(true);assert.equal(h.exits,1);h.full(false);assert.equal(h.timers.size,0);
});

test('already fullscreen does not issue a second enter and is not exited on ordinary cleanup',()=>{
  const h=harness({fullscreen:true});h.controller.enter();assert.equal(h.enters,0);h.controller.leave();assert.equal(h.exits,0);
  h.controller.leave({force:true});assert.equal(h.exits,1);h.full(false);
  const pending=harness();pending.controller.enter();pending.telegram.isFullscreen=true;
  pending.emit('fullscreenFailed',{error:'ALREADY_FULLSCREEN'});assert.equal(pending.notices.length,0);assert.equal(pending.timers.size,0);
});

test('safe areas update on rotation, reject bad values and allow returning to zero',()=>{
  const h=harness();assert.equal(h.style.get('--app-device-top'),'24px');assert.equal(h.style.get('--app-content-top'),'48px');
  h.telegram.safeAreaInset={top:0,bottom:0,left:36,right:12};h.telegram.contentSafeAreaInset={top:0,bottom:0,left:0,right:0};
  h.emit('safeAreaChanged');h.emit('contentSafeAreaChanged');assert.equal(h.style.get('--app-device-left'),'36px');assert.equal(h.style.get('--app-content-top'),'0px');
  h.telegram.safeAreaInset={top:Infinity,left:-10,right:'bad',bottom:9999};h.emit('viewportChanged');
  assert.equal(h.style.get('--app-device-top'),'0px');assert.equal(h.style.get('--app-device-left'),'0px');assert.equal(h.style.get('--app-device-right'),'0px');assert.equal(h.style.get('--app-device-bottom'),'1000px');
});

test('disposal unsubscribes all native events and removes pending timers',()=>{
  const h=harness();h.controller.enter();assert.equal(h.events.size,5);h.controller.destroy();h.controller.destroy();
  assert.equal(h.events.size,0);assert.equal(h.timers.size,0);h.controller.enter();assert.equal(h.enters,1);
});
