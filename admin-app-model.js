(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AdminAppModel=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FILES=new Set(['dashboard.html','admin-task-marketplace.html','admin-overview.html','inactive-overview.html','calls-statistics.html','complaints.html','violations.html','recruitment-analytics.html','supervisors.html','candidate-center.html','norm-check.html','leadership-tasks-preview.html','leadership-tasks-master-preview.html','leadership-tasks-team-preview.html','duties.html','norm-settings.html','webapp-settings.html','logs.html']);
  const GROUPS={personal:'Личное',analytics:'Аналитика',management:'Управление',settings:'Настройки',workflow:'Сервисные окна'};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function sections(value){if(!Array.isArray(value))throw new Error('Сервер не вернул каталог разделов.');const seen=new Set();return value.filter(item=>item&&typeof item.id==='string'&&!seen.has(item.id)&&seen.add(item.id)).map(item=>({...item,allowed:item.allowed===true&&FILES.has(item.path),path:FILES.has(item.path)?item.path:null}));}
  function filter(items,{group='all',search=''}={}){const query=String(search).trim().toLocaleLowerCase('ru');return items.filter(s=>(group==='all'||s.group===group)&&(!s.contextual||query||group==='workflow')&&(!query||`${s.title} ${s.description} ${GROUPS[s.group]||''}`.toLocaleLowerCase('ru').includes(query)));}
  function target(raw,items,base,viewer={}){
    let url;try{url=new URL(raw,base);}catch{return null;}
    const baseUrl=new URL(base);if(url.origin!==baseUrl.origin)return null;
    const filename=url.pathname.split('/').pop();if(!FILES.has(filename)||url.pathname!==new URL(filename,baseUrl).pathname)return null;
    if(url.searchParams.has('preview'))return null;
    const selectedAdmin=url.searchParams.get('admin_id');let section;
    if(filename==='dashboard.html'&&selectedAdmin){if(!/^[1-9][0-9]{0,15}$/.test(selectedAdmin))return null;section=String(selectedAdmin)===String(viewer.telegram_id)?items.find(s=>s.id==='my-statistics'):items.find(s=>s.id==='administration');}
    else if(filename.startsWith('leadership-tasks-')){section=items.find(s=>s.id==='leadership-tasks');if(!viewer.is_master&&filename!==section?.path)return null;}
    else section=items.find(s=>s.path===filename);
    if(!section?.allowed)return null;
    const clean=new URL(filename,baseUrl);
    if(selectedAdmin)clean.searchParams.set('admin_id',selectedAdmin);
    if(filename==='supervisors.html'&&url.searchParams.get('view')==='management')clean.searchParams.set('view','management');
    if(viewer.is_master&&filename.startsWith('leadership-tasks-'))for(const key of ['role','ga_view']){const val=url.searchParams.get(key);if(val&&/^[a-z0-9_-]{1,40}$/.test(val))clean.searchParams.set(key,val);}
    return {section,url:clean};
  }
  const leaveDecision=value=>value?.busy===true?'busy':value?.dirty===true?'confirm':'allow';
  return Object.freeze({FILES,GROUPS,escape,sections,filter,target,leaveDecision});
});
