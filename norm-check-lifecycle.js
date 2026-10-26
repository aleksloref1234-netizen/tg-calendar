/* Form lifecycle only; norm thresholds, bonuses and penalties remain on the
   existing page and authoritative server. No draft/result persistence here. */
(() => {
  'use strict';
  const tg=window.Telegram?.WebApp;
  let snapshot=()=>({editable:false}), baseline='', busy=false, gone=false, confirming=false;
  const controllers=new Set();
  const signature=()=>JSON.stringify(snapshot());
  const dirty=()=>snapshot().editable===true && signature()!==baseline;
  function update(){const state=gone?{dirty:false,busy:false}:{dirty:dirty(),busy};window.AdminControlEmbed?.setLeaveState(state);try{if(!window.AdminControlEmbed){if(state.dirty||state.busy)tg?.enableClosingConfirmation?.();else tg?.disableClosingConfirmation?.();}}catch{}}
  function markClean(){baseline=signature();update();}
  function configure(reader){snapshot=reader;markClean();}
  function lockControls(){const previous=[...document.querySelectorAll('input,button')].map(el=>[el,el.disabled]);previous.forEach(([el])=>el.disabled=true);return()=>previous.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});}
  async function request(url,payload){
    if(busy)throw new Error('Дождитесь завершения текущей операции.');
    if(gone)throw new Error('Страница уже закрыта.');
    if(!tg?.initData)throw new Error('Откройте проверку из Telegram-бота.');
    busy=true;update();const unlock=lockControls();const started=Date.now();
    const delays=[0,700,1600,3000];let lastError;
    // Same immutable payload/operation_id for all retry attempts.
    try{
      const body=JSON.stringify(payload);
      for(let attempt=0;attempt<delays.length;attempt++){
        if(delays[attempt])await new Promise(resolve=>setTimeout(resolve,delays[attempt]));
        if(gone)throw new Error('Страница уже закрыта.');
        const remaining=30000-(Date.now()-started);
        if(remaining<=0)throw new Error('Сервер отвечает слишком долго. Повторите запрос.');
        const controller=new AbortController();controllers.add(controller);
        const timer=setTimeout(()=>controller.abort(),Math.min(12000,remaining));
        try{
          const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':tg.initData},body,signal:controller.signal,cache:'no-store'});
          let result={};try{result=await response.json();}catch{}
          if(response.ok&&result.status==='success')return result.data;
          const error=new Error(result.message||`HTTP ${response.status}`);
          // Never replay a forbidden/bad request even if a proxy adds retryable.
          error.retryable=![400,401,403,404,409].includes(response.status)&&(result.retryable===true||[429,502,503,504].includes(response.status));
          throw error;
        }catch(error){
          lastError=error.name==='AbortError'?new Error('Сервер отвечает слишком долго. Повторите запрос.'):error;
          if(gone||error.retryable===false||attempt===delays.length-1)throw lastError;
        }finally{clearTimeout(timer);controllers.delete(controller);}
      }
      throw lastError||new Error('Не удалось связаться с ботом.');
    }finally{busy=false;unlock();update();}
  }
  async function confirmDiscard(){if(busy||confirming)return false;if(!dirty())return true;confirming=true;try{return await new Promise(resolve=>{const text='Введённые показатели не сохранены. Перейти без сохранения?';if(tg?.showConfirm)tg.showConfirm(text,resolve);else resolve(window.confirm(text));});}finally{confirming=false;}}
  function moscowDate(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  window.addEventListener('pagehide',()=>{gone=true;for(const controller of controllers)controller.abort();controllers.clear();clearTimeout(window.notify?.t);},{once:true});
  window.addEventListener('beforeunload',event=>{if(dirty()||busy){event.preventDefault();event.returnValue='';}});
  window.NormLifecycle=Object.freeze({configure,markClean,update,confirmDiscard,request,moscowDate,isDirty:dirty});
})();
