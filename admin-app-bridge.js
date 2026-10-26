(() => {
  'use strict';
  if(window.parent===window)return;
  let host,context;
  try{host=window.parent.AdminControlApp;context=host?.getContext(window);}catch{return;}
  if(!context?.telegram?.initData)return;
  const native=context.telegram;
  const subscriptions=[];
  let disposed=false;
  let leaveState={dirty:false,busy:false};
  function setLeaveState(value){if(disposed)return;leaveState={dirty:value?.dirty===true,busy:value?.busy===true};try{if(leaveState.dirty||leaveState.busy)native.enableClosingConfirmation?.();else native.disableClosingConfirmation?.();}catch{}}
  const trackedButton=button=>{if(!button)return button;const proxy=new Proxy(button,{get(target,key){
    if(key==='onClick')return callback=>{target.onClick(callback);subscriptions.push(()=>target.offClick(callback));return proxy;};
    const value=Reflect.get(target,key);return typeof value==='function'?function(...args){const result=value.apply(target,args);return result===target?proxy:result;}:value;
  }});return proxy;};
  const main=trackedButton(native.MainButton),secondary=trackedButton(native.SecondaryButton),back=trackedButton(native.BackButton);
  const webApp=new Proxy(native,{get(target,key){
    if(key==='MainButton')return main;
    if(key==='SecondaryButton')return secondary;
    if(key==='BackButton')return back;
    if(key==='onEvent')return (event,callback)=>{target.onEvent(event,callback);subscriptions.push(()=>target.offEvent(event,callback));return webApp;};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  // The child uses the parent's native Telegram transport, not a second SDK
  // session.  initData is never copied to a URL, localStorage or postMessage.
  window.Telegram=window.Telegram||{};
  window.Telegram.WebApp=webApp;
  document.documentElement.classList.add('admin-app-embedded');
  document.documentElement.dataset.adminPage=new URL(location.href).pathname.split('/').pop().replace('.html','');
  document.documentElement.classList.toggle('admin-app-reduce-motion',context.preferences.reduce_motion===true);
  const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='admin-app-modules.css?v=20261026-1';
  function attachStyles(){document.head.append(stylesheet);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attachStyles,{once:true});else attachStyles();
  function dispose(){if(disposed)return;setLeaveState({});disposed=true;for(const unsubscribe of subscriptions.splice(0)){try{unsubscribe();}catch{}}try{native.MainButton?.hide();native.SecondaryButton?.hide();}catch{}}
  window.AdminControlEmbed=Object.freeze({viewer:Object.freeze({...context.viewer}),navigate:raw=>host.navigate(new URL(raw,location.href).href),setLeaveState,getLeaveState:()=>({...leaveState}),dispose});
  window.addEventListener('pagehide',dispose,{once:true});
  document.addEventListener('click',event=>{const anchor=event.target.closest('a[href]');if(!anchor||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||anchor.target==='_blank'||anchor.hasAttribute('download'))return;const href=anchor.getAttribute('href');if(!href||href.startsWith('#'))return;if(host.navigate(new URL(href,location.href).href))event.preventDefault();});
})();
