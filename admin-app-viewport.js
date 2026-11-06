(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AdminAppViewport=api;
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  function create({telegram:tg,root,onExit=()=>{},onNotice=()=>{}}){
    let wanted=false,owned=false,wasFullscreen=tg?.isFullscreen===true;
    let pending=null,timer=null,disposed=false,unsupported=false;
    const subscriptions=[];
    const supported=()=>{
      try{return !unsupported&&typeof tg?.requestFullscreen==='function'&&typeof tg?.exitFullscreen==='function'&&tg.isVersionAtLeast?.('8.0')===true;}catch{return false;}
    };
    function syncInsets(){
      if(disposed)return;
      for(const [prefix,value] of [['device',tg?.safeAreaInset],['content',tg?.contentSafeAreaInset]]){
        for(const side of ['top','right','bottom','left']){
          const number=Number(value?.[side]??0);
          root.style.setProperty(`--app-${prefix}-${side}`,`${Number.isFinite(number)?Math.max(0,Math.min(1000,number)):0}px`);
        }
      }
      root.classList.toggle('telegram-fullscreen',tg?.isFullscreen===true);
    }
    function clearPending(){clearTimeout(timer);timer=null;pending=null;}
    function track(operation){
      clearPending();pending=operation;
      timer=setTimeout(()=>{
        const operation=pending;clearPending();syncInsets();
        if(operation==='enter'&&wanted&&tg?.isFullscreen!==true)onNotice('Раздел развёрнут. Telegram пока не подтвердил полноэкранный режим.');
      },5000);
    }
    function exitNative(){
      if(disposed||!supported()||pending==='exit'||tg?.isFullscreen!==true)return;
      track('exit');
      try{tg.exitFullscreen();}catch{clearPending();}
    }
    function enter(){
      if(disposed)return;
      wanted=true;
      try{tg?.expand?.();}catch{}
      if(!supported()||tg.isFullscreen===true||pending)return;
      owned=true;track('enter');
      try{tg.requestFullscreen();}catch{clearPending();owned=false;unsupported=true;}
    }
    function leave({force=false}={}){
      wanted=false;
      if(force&&tg?.isFullscreen===true)owned=true;
      if(owned)exitNative();
      // Keep ownership of an unconfirmed request: a late enter event must
      // immediately exit if the user already restored the menu or left.
    }
    function changed(){
      if(disposed)return;
      const full=tg?.isFullscreen===true;
      const operation=pending;
      clearPending();syncInsets();
      if(full){if(!wanted&&owned)exitNative();}
      else{
        owned=false;
        if(wanted&&operation==='exit'){wasFullscreen=false;enter();return;}
        if(wanted&&wasFullscreen){wanted=false;onExit();}
      }
      wasFullscreen=full;
    }
    function failed(event){
      if(disposed||!pending)return;
      const operation=pending;clearPending();syncInsets();
      if(event?.error==='ALREADY_FULLSCREEN'){
        wasFullscreen=tg?.isFullscreen===true;
        if(!wanted&&owned)exitNative();
        return;
      }
      if(operation==='enter'){
        owned=false;
        if(event?.error==='UNSUPPORTED')unsupported=true;
        if(wanted)onNotice('Раздел развёрнут внутри приложения. Полноэкранный режим недоступен в этом клиенте Telegram.');
      }
    }
    for(const [event,handler] of [['fullscreenChanged',changed],['fullscreenFailed',failed],['safeAreaChanged',syncInsets],['contentSafeAreaChanged',syncInsets],['viewportChanged',syncInsets]]){
      try{if(tg?.onEvent){tg.onEvent(event,handler);subscriptions.push([event,handler]);}}catch{}
    }
    syncInsets();
    return Object.freeze({enter,leave,syncInsets,destroy(){
      if(disposed)return;disposed=true;clearPending();
      for(const [event,handler] of subscriptions.splice(0)){try{tg?.offEvent?.(event,handler);}catch{}}
    }});
  }
  return Object.freeze({create});
});
