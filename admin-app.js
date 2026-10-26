(() => {
  'use strict';
  const API='https://tg-admin-bot-1k1g.onrender.com/api/app';
  const tg=window.Telegram?.WebApp, model=window.AdminAppModel;
  const $=id=>document.getElementById(id), esc=model.escape;
  const base=new URL('.',location.href);
  const state={data:null,view:'home',group:'all',search:'',section:null,moduleURL:null,frame:null,loadedAt:0,recent:[],preferenceBusy:false};
  let bootstrapRequest=null,frameTimer=null,toastTimer=null,bootstrapSerial=0;
  let leaveAction=null;
  function leaveDecision(){try{return model.leaveDecision(state.frame?.contentWindow?.AdminControlEmbed?.getLeaveState());}catch{return 'allow';}}
  function guarded(action){const decision=leaveDecision();if(decision==='busy'){toast('Дождитесь завершения текущей операции.');return;}if(decision==='confirm'){if(!$('leave-dialog').open){leaveAction=action;$('leave-dialog').showModal();}return;}action();}
  const paths={
    home:'M3 10 12 3l9 7v10H7V10m3 10v-7h4v7',user:'M20 21a8 8 0 0 0-16 0m12-14a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M13 3a4 4 0 0 1 0 8M11 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    layout:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
    sparkles:'m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Zm7 0v4m-2-2h4',
    bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6',
    calendar:'M3 5h18v16H3zm0 5h18M7 3v4m10-4v4',
    chart:'M3 3v18h18M7 16v-5m5 5V7m5 9V4',
    phone:'M6 3 3 5c0 8 8 16 16 16l2-3-5-3-2 2-7-7 2-2Z',
    messages:'M3 3h18v14H8l-5 4Z',network:'M9 3h6v5H9zm-6 13h6v5H3zm12 0h6v5h-6zM12 8v4H6v4m6-4h6v4',
    clipboard:'M8 3h8v4H8zm0 2H4v16h16V5h-4M8 13l3 3 5-6',
    checklist:'m3 6 1 1 2-3m3 2h12M3 13l1 1 2-3m3 2h12M3 20l1 1 2-3m3 2h12',
    route:'M5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m14 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4M5 7v8a4 4 0 0 0 4 4h8M7 5h8a4 4 0 0 1 0 8h-3',
    moon:'M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10',sliders:'M4 3v7m0 4v7M12 3v2m0 4v12M20 3v11m0 4v3M1 10h6m2-5h6m2 9h6',
    history:'M3 3v6h6M3 9a9 9 0 1 1 1 9M12 7v5l4 2',lock:'M6 10h12v11H6zm3 0V6a3 3 0 0 1 6 0v4m-3 5v2',
    'arrow-left':'m14 5-7 7 7 7M7 12h14','arrow-right':'m9 5 7 7-7 7M3 12h13',chevron:'m9 5 7 7-7 7',x:'m6 6 12 12M18 6 6 18',refresh:'M20 4v6h-6M4 20v-6h6m9-6A8 8 0 0 0 5 5m0 11a8 8 0 0 0 14 3',
    waves:'M3 7q3-4 6 0t6 0 6 0M3 12q3-4 6 0t6 0 6 0M3 17q3-4 6 0t6 0 6 0',info:'M12 11v6m0-10v.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  };
  const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.layout}"></path></svg>`;
  function initIcons(){document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}
  function initials(viewer){return String(viewer.nickname||viewer.first_name||'AC').split(/[_\s]+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase();}
  function avatarMarkup(){return `<span>${esc(initials(state.data.viewer))}</span>`;}
  function avatars(){const viewer=state.data.viewer;document.querySelectorAll('[data-avatar]').forEach(el=>{el.innerHTML=avatarMarkup();if(!viewer.photo_url)return;const img=document.createElement('img');img.alt='';img.referrerPolicy='no-referrer';img.addEventListener('load',()=>img.classList.add('loaded'),{once:true});img.addEventListener('error',()=>img.remove(),{once:true});img.src=viewer.photo_url;el.append(img);});}
  function toast(text){clearTimeout(toastTimer);$('app-toast').textContent=text;$('app-toast').hidden=false;toastTimer=setTimeout(()=>$('app-toast').hidden=true,3500);}
  async function api(action,payload={},signal){const controller=new AbortController();const stop=()=>controller.abort();signal?.addEventListener('abort',stop,{once:true});const timer=setTimeout(stop,15000);try{const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':tg?.initData||''},body:JSON.stringify({action,...payload}),signal:controller.signal,cache:'no-store'});let result;try{result=await response.json();}catch{throw new Error(`Сервер вернул неверный ответ (HTTP ${response.status}).`);}if(!response.ok||result.status!=='success'){const error=new Error(result.message||`HTTP ${response.status}`);error.status=response.status;throw error;}return result.data;}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}}
  function applyPreferences(){document.documentElement.classList.toggle('reduce-motion',state.data?.preferences?.reduce_motion===true);}
  function rememberSection(id){state.recent=[id,...state.recent.filter(key=>key!==id)].slice(0,6);try{sessionStorage.setItem(`admin-app-recent:${state.data.viewer.telegram_id}`,JSON.stringify(state.recent));}catch{}}
  function readRecent(){try{const ids=JSON.parse(sessionStorage.getItem(`admin-app-recent:${state.data.viewer.telegram_id}`)||'[]');state.recent=Array.isArray(ids)?ids.filter(id=>state.data.sections.some(s=>s.id===id&&s.allowed)).slice(0,6):[];}catch{state.recent=[];}}
  function closeFrame(){clearTimeout(frameTimer);frameTimer=null;if(state.frame){try{state.frame.contentWindow?.AdminControlEmbed?.dispose();}catch{}state.frame.remove();state.frame=null;}$('module-container').replaceChildren();$('module-view').hidden=true;state.section=null;state.moduleURL=null;document.body.classList.remove('module-open');}
  function lockSection(section){$('access-title').textContent=section?.title||'Раздел закрыт';$('access-reason').textContent=section?.reason||'Доступ к разделу не выдан вашей должности.';$('access-dialog').showModal();}
  function tool(section){return `<button type="button" class="tool ${section.allowed?'':'locked'}" data-section="${esc(section.id)}"><span class="tool-top"><span class="tool-icon">${icon(section.icon)}</span><span class="tool-hint">${section.allowed?icon('arrow-right'):`${icon('lock')} Закрыт`}</span></span><b>${esc(section.title)}</b><small>${esc(section.description)}</small></button>`;}
  function listRow(title,description,glyph,attrs){return `<button type="button" class="list-row" ${attrs}><span class="tool-icon">${icon(glyph)}</span><span class="row-copy"><b>${esc(title)}</b><small>${esc(description)}</small></span>${icon('chevron')}</button>`;}
  function roleBadge(){return `<span class="role-badge">${icon('shield')}${esc(state.data.viewer.is_master?'Master ID':state.data.viewer.role_title)}</span>`;}
  function home(){const viewer=state.data.viewer;const available=state.data.sections.filter(s=>s.allowed&&!s.contextual);const preferred=['administration','my-statistics','norm-check','candidates','supervisors','additional-tasks'];let featured=preferred.map(id=>available.find(s=>s.id===id)).filter(Boolean).slice(0,6);if(featured.length<4)featured=[...featured,...available.filter(s=>!featured.some(f=>f.id===s.id))].slice(0,6);const recent=state.recent.map(id=>available.find(s=>s.id===id)).filter(Boolean).slice(0,3);return `<button type="button" class="welcome" data-view="profile"><span class="avatar" data-avatar></span><span><b>${esc(viewer.nickname||[viewer.first_name,viewer.last_name].filter(Boolean).join(' ')||'Личный кабинет')}</b><small>${esc(viewer.role_title)}</small></span></button><p class="eyebrow">${esc(state.data.server.name)} · ${esc(state.data.server.number)}</p><h1 class="page-heading">Центр управления</h1><p class="page-description">Одна система. Ваши разделы и рабочие инструменты.</p><section class="home-intro"><h2>Ваше рабочее пространство</h2><p>Доступ определяется назначенной должностью. Внутри разделов сохраняются действующие проверки, настройки и ограничения.</p><span class="intro-meta"><i></i> Доступно разделов: ${available.length}</span></section><div class="section-head"><h2>Быстрый переход</h2><button type="button" class="text-button" data-view="catalog">Все разделы ${icon('arrow-right')}</button></div><div class="tool-grid">${featured.map(tool).join('')}</div>${recent.length?`<div class="section-head"><h2>Недавно открытые</h2></div><div class="list-group">${recent.map(s=>listRow(s.title,s.description,s.icon,`data-section="${esc(s.id)}"`)).join('')}</div>`:''}<p class="home-note">${icon('lock')} Настройки системы доступны только Master ID.</p>`;}
  function catalog(){return `<p class="eyebrow">Рабочие инструменты</p><h1 class="page-heading">Все разделы</h1><p class="page-description">Закрытые разделы отмечены замком. Учебный центр работает в отдельном боте.</p><div class="catalog-controls"><label for="catalog-search" class="eyebrow">Найти раздел</label><input id="catalog-search" class="catalog-search" type="search" maxlength="100" placeholder="Название или назначение…" value="${esc(state.search)}"><div class="filters" aria-label="Категория разделов"><button type="button" class="filter ${state.group==='all'?'active':''}" data-group="all">Все</button>${Object.entries(model.GROUPS).filter(([id])=>id!=='workflow').map(([id,title])=>`<button type="button" class="filter ${state.group===id?'active':''}" data-group="${id}">${title}</button>`).join('')}</div></div><div id="catalog-results"></div>`;}
  function renderCatalogResults(){const rows=model.filter(state.data.sections,{group:state.group,search:state.search});$('catalog-results').innerHTML=rows.length?Object.entries(model.GROUPS).map(([id,title])=>{const selected=rows.filter(s=>s.group===id);return selected.length?`<section class="catalog-group"><h2>${title}</h2><div class="tool-grid">${selected.map(tool).join('')}</div></section>`:'';}).join(''):'<p class="empty">По вашему запросу ничего не найдено.</p>';}
  function preferenceRow(key,title,description,glyph){const checked=state.data.preferences[key]===true;return `<button type="button" class="list-row" role="switch" aria-checked="${checked}" data-preference="${key}" ${!state.data.preferences_available||state.preferenceBusy?'disabled':''}><span class="tool-icon">${icon(glyph)}</span><span class="row-copy"><b>${title}</b><small>${description}</small></span><span class="switch" aria-hidden="true"></span></button>`;}
  function preferences(){return `${!state.data.preferences_available?'<p class="preference-warning">Настройки профиля временно не загрузились. Изменение выключено, чтобы не перезаписать сохранённые значения.</p>':''}<div class="list-group">${preferenceRow('task_notifications','Дополнительные задания','Результаты проверок, прогресс и повышение уровня','sparkles')}${preferenceRow('norm_notifications','Сокращённый норматив','Личные уведомления о включении и отмене','bell')}${preferenceRow('reduce_motion','Уменьшить движение','Без анимации переходов и появления элементов','waves')}</div><p class="preference-note">Служебные ответы, обязательные сообщения безопасности и работа с заявлениями не отключаются. Эти переключатели не меняют ваши доступы.</p>`;}
  function profile(){const v=state.data.viewer;return `<section class="profile-hero"><div class="avatar" data-avatar></div><h1>${esc(v.nickname||[v.first_name,v.last_name].filter(Boolean).join(' ')||'Личный кабинет')}</h1>${v.username?`<p>@${esc(v.username)}</p>`:''}${roleBadge()}<small>Telegram ID: ${v.telegram_id}</small></section><div class="profile-content"><div class="list-group">${listRow('Моя статистика','Личные показатели и норматив','chart','data-section="my-statistics"')}${listRow('Дополнительные задания','Бонусный баланс и история','sparkles','data-section="additional-tasks"')}${listRow('Все разделы','Каталог доступных и закрытых инструментов','layout','data-view="catalog"')}${v.is_master?listRow('Настройки системы','Нормативы, видимость и журнал','sliders','data-settings'):''}</div><div class="section-head"><h2>Личные настройки</h2></div>${preferences()}<p class="profile-footer">ADMIN CONTROL · YAROSLAVL 68</p></div>`;}
  function notifications(){return `<div class="profile-content"><p class="eyebrow">Личные настройки</p><h1 class="page-heading">Уведомления</h1><p class="page-description">Управляйте необязательными личными сообщениями и эффектами интерфейса.</p>${preferences()}</div>`;}
  function updateDock(selected){const index=selected==='home'?0:selected==='catalog'?1:selected==='additional-tasks'?2:3;$('admin-app').querySelectorAll('.app-dock>button').forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});document.querySelector('.dock-selection').style.transform=`translateX(${index*100}%)`;}
  function updateNativeBack(show){try{if(show)tg?.BackButton?.show();else tg?.BackButton?.hide();}catch{}}
  function showView(view){if(!state.data)return;closeFrame();state.view=['home','profile','notifications','catalog'].includes(view)?view:'home';$('app-main').hidden=false;$('app-main').classList.remove('enter');$('app-main').innerHTML=state.view==='home'?home():state.view==='profile'?profile():state.view==='notifications'?notifications():catalog();if(state.view==='catalog')renderCatalogResults();avatars();void $('app-main').offsetWidth;$('app-main').classList.add('enter');updateDock(state.view==='notifications'?'profile':state.view);updateNativeBack(state.view!=='home');window.scrollTo({top:0,behavior:'instant'});}
  function resolveTarget(raw){return model.target(raw,state.data.sections,base,state.data.viewer);}
  function moduleBack(){try{const dialog=state.frame?.contentDocument?.querySelector('dialog[open]');if(dialog){dialog.close();return;}}catch{}guarded(()=>{if(state.moduleURL){const current=new URL(state.moduleURL);if(current.pathname.endsWith('/dashboard.html')&&current.searchParams.has('admin_id')&&state.data?.sections.some(s=>s.id==='administration'&&s.allowed)){void openSection('administration').catch(e=>toast(e.message));return;}}showView('catalog');});}
  function frameError(text){closeFrame();$('app-main').hidden=false;$('app-main').replaceChildren();const panel=document.createElement('div');panel.className='module-error';panel.textContent=text;const button=document.createElement('button');button.type='button';button.className='primary-button';button.textContent='К разделам';button.addEventListener('click',()=>showView('catalog'));panel.append(document.createElement('br'),button);$('app-main').append(panel);}
  function mountModule(target) {
    closeFrame();
    state.section=target.section;
    state.moduleURL=target.url.href;
    state.view='module';
    $('app-main').hidden=true;
    $('module-view').hidden=false;
    $('module-title').textContent=target.section.title;
    $('module-subtitle').textContent=model.GROUPS[target.section.group]||'Раздел';
    $('module-loading').textContent='Открываем раздел…';
    $('module-loading').hidden=false;
    document.body.classList.add('module-open');
    const frame=document.createElement('iframe');
    frame.title=target.section.title;
    frame.referrerPolicy='no-referrer';
    frame.setAttribute('allow','clipboard-write');
    state.frame=frame;
    frame.addEventListener('load',()=>{
      if(state.frame!==frame)return;
      clearTimeout(frameTimer);
      try {
        const current=resolveTarget(frame.contentWindow.location.href);
        if(!current){frameError('Этот переход недоступен в едином приложении.');return;}
        state.section=current.section;
        state.moduleURL=current.url.href;
        $('module-title').textContent=current.section.title;
        $('module-subtitle').textContent=model.GROUPS[current.section.group]||'Раздел';
      } catch {
        frameError('Переход за пределы приложения заблокирован.');return;
      }
      $('module-loading').hidden=true;
      frame.classList.add('frame-enter');
    });
    frame.src=target.url.href;
    $('module-container').replaceChildren(frame);
    frameTimer=setTimeout(()=>{
      if(state.frame!==frame)return;
      $('module-loading').hidden=false;
      $('module-loading').textContent='Раздел загружается дольше обычного. Можно обновить его кнопкой справа.';
    },20000);
    rememberSection(target.section.id);
    updateDock(target.section.id==='additional-tasks'?'additional-tasks':'catalog');
    updateNativeBack(true);
  }
  async function openSection(id,raw=null){const section=state.data?.sections.find(s=>s.id===id);if(!section?.allowed){lockSection(section);return;}if(Date.now()-state.loadedAt>60000){await bootstrap(true);if(!state.data?.sections.find(s=>s.id===id)?.allowed){lockSection(state.data?.sections.find(s=>s.id===id));return;}}const fresh=state.data.sections.find(s=>s.id===id);const target=resolveTarget(raw||fresh.path);if(!target){lockSection(fresh);return;}mountModule(target);}
  async function bootstrap(quiet=false){const serial=++bootstrapSerial;bootstrapRequest?.abort();const controller=new AbortController();bootstrapRequest=controller;if(!quiet){$('gate-message').textContent='Проверяем профиль и должностные доступы…';$('retry-bootstrap').hidden=true;}$('app-gate').hidden=quiet;try{if(!tg?.initData)throw new Error('Откройте приложение из Telegram-бота. Обычная ссылка не подтверждает личность.');const data=await api('bootstrap',{},controller.signal);if(serial!==bootstrapSerial)return;data.sections=model.sections(data.sections);state.data=data;state.loadedAt=Date.now();applyPreferences();readRecent();$('server-label').textContent=`${data.server.name} · ${data.server.number}`;$('app-gate').hidden=true;$('admin-app').hidden=false;if(!quiet){showView('home');const section=new URLSearchParams(location.search).get('section');if(section){const matching=data.sections.find(s=>s.id===section);if(matching?.allowed)await openSection(section);else lockSection(matching);}}else{const current=state.section;if(current&&!data.sections.find(s=>s.id===current.id)?.allowed){showView('catalog');toast('Доступ изменился. Раздел закрыт.');}}}catch(error){if(serial!==bootstrapSerial)return;if(quiet){if(error.status===403){state.data=null;closeFrame();$('admin-app').hidden=true;$('app-gate').hidden=false;$('gate-message').textContent=error.message;}else toast('Не удалось обновить доступы. Повторите попытку.');throw error;}$('app-gate').hidden=false;$('admin-app').hidden=true;$('gate-message').textContent=error.name==='AbortError'?'Сервер отвечает слишком долго. Повторите запрос.':error.message;$('retry-bootstrap').hidden=false;}finally{if(serial===bootstrapSerial)bootstrapRequest=null;}}
  // Same-origin, active-document-only bridge.  Not an authorization proof:
  // every feature request still carries signed initData to its existing API.
  window.AdminControlApp=Object.freeze({
    getContext(child){if(!state.frame||state.frame.contentWindow!==child||!state.data)return null;try{if(!resolveTarget(child.location.href))return null;}catch{return null;}return {telegram:tg,viewer:{...state.data.viewer},preferences:{...state.data.preferences}};},
    navigate(raw){const target=state.data&&resolveTarget(raw);if(!target)return false;guarded(()=>void openSection(target.section.id,target.url.href).catch(e=>toast(e.message)));return true;},
  });
  document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;if(button.dataset.view){guarded(()=>showView(button.dataset.view));return;}if(button.dataset.section){guarded(()=>void openSection(button.dataset.section).catch(e=>toast(e.message)));return;}if(button.dataset.group){state.group=button.dataset.group;showView('catalog');return;}if(button.hasAttribute('data-settings')){guarded(()=>{state.group='settings';state.search='';showView('catalog');});return;}if(button.dataset.preference){void savePreference(button.dataset.preference);}});
  async function savePreference(key){if(state.preferenceBusy||!state.data.preferences_available)return;state.preferenceBusy=true;const value=!state.data.preferences[key];document.querySelectorAll('[data-preference]').forEach(b=>b.disabled=true);try{const result=await api('save_preferences',{preferences:{[key]:value}});state.data.preferences=result.preferences;applyPreferences();showView(state.view);toast('Настройка сохранена');}catch(error){toast(`Настройка не сохранена: ${error.message}`);}finally{state.preferenceBusy=false;document.querySelectorAll('[data-preference]').forEach(b=>b.disabled=!state.data.preferences_available);}}
  document.addEventListener('input',event=>{if(event.target.id==='catalog-search'){state.search=event.target.value;renderCatalogResults();}});
  $('retry-bootstrap').addEventListener('click',()=>void bootstrap());
  $('module-back').addEventListener('click',moduleBack);
  $('module-reload').addEventListener('click',()=>guarded(()=>{if(state.frame){const target=resolveTarget(state.moduleURL||state.frame.src);if(target)mountModule(target);}}));
  $('cancel-leave').addEventListener('click',()=>$('leave-dialog').close());
  $('confirm-leave').addEventListener('click',()=>{const action=leaveAction;leaveAction=null;$('leave-dialog').close();action?.();});
  $('leave-dialog').addEventListener('close',()=>{leaveAction=null;});
  window.addEventListener('beforeunload',event=>{if(leaveDecision()!=='allow'){event.preventDefault();event.returnValue='';}});
  for(const id of ['close-access','confirm-access'])$(id).addEventListener('click',()=>$('access-dialog').close());
  $('access-dialog').addEventListener('click',event=>{if(event.target===$('access-dialog'))$('access-dialog').close();});
  tg?.ready();tg?.expand();try{tg?.setHeaderColor?.('#0b1528');tg?.setBackgroundColor?.('#0b1528');tg?.setBottomBarColor?.('#0b1528');}catch{}
  tg?.onEvent?.('backButtonClicked',()=>{if($('leave-dialog').open){$('leave-dialog').close();return;}if($('access-dialog').open){$('access-dialog').close();return;}if(state.view==='module')moduleBack();else showView('home');});
  window.addEventListener('pagehide',()=>{bootstrapRequest?.abort();closeFrame();clearTimeout(toastTimer);});
  initIcons();void bootstrap();
})();
