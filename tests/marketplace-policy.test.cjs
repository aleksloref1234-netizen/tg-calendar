const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'../admin-task-marketplace.html'),'utf8');
const source = fs.readFileSync(path.join(__dirname,'../admin-task-marketplace.js'),'utf8');
const policyCss = fs.readFileSync(path.join(__dirname,'../admin-task-marketplace-policy.css'),'utf8');

function fixture() {
  return {viewer:{user_id:900,is_master:true,is_leader:true},wallet:{report_balance:1400,index_bonus_total:4,weekly_limit:1000,weekly_used:800,weekly_remaining:200,weekly_reset_at:'2026-11-08T21:00:00+00:00'},task_profile:{title:'Новичок',xp:80,next_level:{title:'Активный'},xp_to_next:20},templates:[],all_templates:[],assignments:[],own_assignments:[],evidence:[],level_settings:[],review_history:[],progress_events:[]};
}

function app(fetcher = async action => action === 'bootstrap' ? fixture() : {}) {
  const nodes = new Map(), stored = new Map(), calls = [], dialogs = [];
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector,{value:'',hidden:false,open:false,innerHTML:'',textContent:'',style:{},dataset:{},listeners:{},classList:{add(){},remove(){},toggle(){}},focus(){this.focused=true;},select(){this.selected=true;},addEventListener(type,fn){(this.listeners[type] ||= new Set()).add(fn);},removeEventListener(type,fn){this.listeners[type]?.delete(fn);},showModal(){this.open=true;if(selector === '#decision-dialog'){dialogs.push(nodes.get('#dialog-title').textContent);queueMicrotask(()=>{node('#dialog-reason').value='Обоснованная причина';this.returnValue='default';for(const fn of [...(this.listeners.close || [])])fn();});}},close(){this.open=false;for(const fn of [...(this.listeners.close || [])])fn();}});
    return nodes.get(selector);
  }
  const documentEvents = new Map();
  const document = {
    querySelector:selector=>selector.startsWith('[data-effort=')&&!nodes.has(selector)?null:node(selector),
    querySelectorAll:()=>[],addEventListener(type,listener){documentEvents.set(type,listener);}
  };
  const window = {Telegram:{WebApp:{initData:'signed-telegram-data',ready(){},expand(){}}}};
  const context = {window,document,Intl,Date,AbortController,CSS:{escape:s=>s},queueMicrotask,crypto:{randomUUID:()=>`uuid-${calls.length}`},sessionStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},setTimeout:()=>0,clearTimeout(){},fetch:async(_url, options)=>{const body=JSON.parse(options.body);calls.push({body,headers:options.headers});const data=await fetcher(body.action,body);return {ok:true,json:async()=>({status:'success',data})};}};
  const testSource = source.replace('  reload();\n})();', '  window.testApp = {state,reload,render,renderAdmin,renderLeader,renderCatalog,renderTaskFocus,renderLeaderboard,loadLeaderboard,templateCard,catalogRewards,takeTask,nightFields,effortPayload,policyBlock,memberAction,openTemplateEditor,moscowInput,askDecision,openWithdrawDialog,submitWithdrawal};\n})();');
  vm.runInNewContext(testSource,context);
  window.testApp.state.data=fixture();
  return {...window.testApp,node,calls,stored,dialogs,documentEvents};
}

test('non-reviewer only sees personal tasks and cannot switch to review or settings',async()=>{
  const data=fixture();data.viewer={user_id:710,is_master:false,is_leader:false};
  const page=app(async()=>data);
  await page.reload();
  assert.equal(page.node('#role-switch').hidden,true);
  assert.equal(page.node('#settings-role').hidden,true);
  for(const role of ['leader','settings']){
    await page.documentEvents.get('click')({target:{closest:selector=>selector === '[data-role]' ? {dataset:{role}} : null}});
    assert.equal(page.state.role,'admin');
    assert.equal(page.node('#leader-view').hidden,true);
    assert.equal(page.node('#settings-view').hidden,true);
  }
});

test('reviewer sees reviews but not master settings and role revocation resets navigation',async()=>{
  const data=fixture();data.viewer={user_id:710,is_master:false,is_leader:true};
  const page=app(async()=>data);
  await page.reload();
  assert.equal(page.node('#role-switch').hidden,false);
  assert.equal(page.node('#settings-role').hidden,true);
  page.state.role='leader';page.render();
  assert.equal(page.node('#leader-view').hidden,false);
  data.viewer.is_leader=false;
  await page.reload();
  assert.equal(page.state.role,'admin');
  assert.equal(page.node('#role-switch').hidden,true);
  assert.equal(page.node('#leader-view').hidden,true);
  assert.equal(page.node('#admin-view').hidden,false);
});

test('all static element bindings exist in the page',()=>{
  const ids=new Set([...(html + source).matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  for(const match of source.matchAll(/\$\('#([a-z0-9-]+)'\)/g)) assert.ok(ids.has(match[1]),`Missing #${match[1]}`);
});

test('task analytics opens lazily for master, escapes names, and supports period changes', async()=>{
  const data=fixture();
  data.supports_task_analytics=true;
  const snapshot=period=>({
    period,start:'2026-11-09',end:'2026-11-15',
    totals:{completed:1,reports:100,xp:20,urgent:0,participants:1},
    days:[{date:'2026-11-09',completed:1,reports:100,xp:20}],
    admins:[{label:'<Admin>',rights_level:'2 уровень',current_admin:true,completed:1,reports:100,xp:20}],
    rights_levels:[{label:'2 уровень',completed:1}], task_levels:[], templates:[],
  });
  const page=app(async(action,body)=>action==='bootstrap'?data:snapshot(body.period));
  await page.reload();
  assert.equal(page.node('#task-analytics-tab').hidden,false);
  assert.deepEqual(page.calls.map(call=>call.body.action),['bootstrap']);
  const tab={dataset:{tab:'task-analytics'},closest:()=>true};
  await page.documentEvents.get('click')({target:{closest:selector=>selector==='.tabs [data-tab]'?tab:null}});
  assert.equal(page.state.settingsTab,'task-analytics');
  assert.equal(page.calls[1].body.period,'week');
  assert.match(page.node('#task-analytics-result').innerHTML,/Выполнено заданий/);
  assert.match(page.node('#task-analytics-people').innerHTML,/&lt;Admin&gt;/);
  await page.documentEvents.get('click')({target:{closest:selector=>selector==='[data-ta-day]'?{dataset:{taDay:'0'}}:null}});
  assert.match(page.node('#task-analytics-day-detail').textContent,/09\.11\.2026 · заданий: 1/);
  const selector=page.node('#task-analytics-period');
  selector.value='month';
  for(const listener of selector.listeners.change) await listener();
  assert.equal(page.calls.at(-1).body.period,'month');
  data.viewer.is_master=false;
  await page.reload();
  assert.equal(page.node('#task-analytics-tab').hidden,true);
  assert.equal(page.node('#task-analytics-result').innerHTML,'');
  await page.documentEvents.get('click')({target:{closest:value=>value==='.tabs [data-tab]'?tab:null}});
  assert.equal(page.calls.at(-1).body.action,'bootstrap');
});

function rankingFixture(period='current') {
  return {period,period_label:'02.11 — 08.11.2026',total_participants:27,rewards_enabled:false,next_offset:20,
    self:{rank:23,nickname:'My_Admin',xp:10,completed:1,in_roster:true,xp_to_next_rank:20},
    entries:[{entry_id:'first',rank:1,nickname:'First_Admin',xp:100,completed:5,is_me:false}]};
}

test('ranking keeps own place visible outside top page and escapes participant names',()=>{
  const page=app();page.state.ranking=rankingFixture();page.state.ranking.entries[0].nickname='<img src=x>';
  page.renderLeaderboard();
  const view=page.node('#ranking-list').innerHTML;
  assert.match(view,/№23/);assert.match(view,/My_Admin/);assert.match(view,/До следующего места: 20 XP/);
  assert.match(view,/&lt;img/);assert.doesNotMatch(view,/<img src=x>/);
  assert.match(view,/автоматические призы пока не начисляются/);
});

test('ranking loads lazily and reuses a short client snapshot',async()=>{
  const page=app(async(action,payload)=>action==='leaderboard'?rankingFixture(payload.period):fixture());
  page.render();assert.equal(page.calls.length,0);
  await page.loadLeaderboard();await page.loadLeaderboard();
  assert.equal(page.calls.filter(call=>call.body.action==='leaderboard').length,1);
  page.state.rankingPeriod='previous';page.state.ranking=null;await page.loadLeaderboard();
  assert.equal(page.state.ranking.period,'previous');assert.equal(page.calls.length,2);
});

test('older ranking response cannot overwrite a newly selected week',async()=>{
  let release;
  const page=app(async(_action,payload)=>payload.period==='current'?await new Promise(resolve=>{release=()=>resolve(rankingFixture('current'));}):rankingFixture('previous'));
  const first=page.loadLeaderboard();
  for(let i=0;i<4;i++)await Promise.resolve();
  page.state.rankingPeriod='previous';page.state.ranking=null;
  await page.loadLeaderboard();release();await first;
  assert.equal(page.state.ranking.period,'previous');assert.equal(page.state.rankingLoading,false);
});

test('ranking error stays inside its tab and pagination deduplicates entries',async()=>{
  const page=app(async(_action,payload)=>{
    if(payload.offset===20)return {...rankingFixture(),entries:[{entry_id:'first',rank:1,nickname:'First_Admin',xp:100},{entry_id:'next',rank:21,nickname:'Next_Admin',xp:20}],next_offset:null};
    throw new Error('Состав временно недоступен');
  });
  await page.loadLeaderboard();
  assert.match(page.node('#ranking-list').innerHTML,/Состав временно недоступен/);
  assert.match(page.node('#ranking-list').innerHTML,/data-rank-retry/);
  page.state.ranking=rankingFixture();await page.loadLeaderboard({more:true});
  assert.equal(page.state.ranking.entries.length,2);
  assert.equal(page.state.ranking.next_offset,null);
});

test('only one own unfinished task blocks catalog takes including pending review',async()=>{
  for(const status of ['in_progress','pending_review']){
    const page=app();page.state.data.templates=[{template_id:'new',title:'Новое',target_count:1}];
    page.state.data.own_assignments=[{assignment_id:'current',template_id:'old',title:'Текущее',status,target_count:5,progress:2}];
    page.renderAdmin();
    assert.match(page.node('#available-list').innerHTML,/data-take="new" disabled/);
    assert.equal(page.node('#catalog-slot').textContent,'Слот занят');
    assert.equal(page.node('#active-count').textContent,1);
    await page.takeTask('new');
    assert.equal(page.calls.length,0);assert.equal(page.dialogs.length,0);
    assert.match(page.node('#task-focus').innerHTML,status==='pending_review'?/Ожидает проверки/:/40%/);
  }
});

test('another administrators review queue does not block own slot',()=>{
  const page=app();page.state.data.templates=[{template_id:'new',title:'Новое'}];
  page.state.data.assignments=[{assignment_id:'other',template_id:'new',status:'in_progress',admin_id:101}];
  page.renderAdmin();
  assert.doesNotMatch(page.node('#available-list').innerHTML,/data-take="new" disabled/);
  assert.equal(page.node('#catalog-slot').textContent,'1 свободный слот');
});

test('server slot state fails closed and legacy multiple tasks stay visible',async()=>{
  const page=app();page.state.data.assignment_limit={can_take:false,active_count:2,max_active:1};
  page.state.data.own_assignments=[{assignment_id:'old-1',title:'Первое',status:'in_progress'}, {assignment_id:'old-2',title:'Второе',status:'pending_review'}];
  page.renderAdmin();
  assert.match(page.node('#task-focus').innerHTML,/Ранее взято заданий: 2/);
  assert.match(page.node('#active-list').innerHTML,/Первое/);assert.match(page.node('#active-list').innerHTML,/Второе/);
  await page.takeTask('new');assert.equal(page.calls.length,0);
});

test('search and sorting are local and do not request metadata again',async()=>{
  const page=app();page.state.data.templates=[
    {template_id:'post',title:'Контроль поста',description:'Порядок',reward_reports:100,reward_index:2},
    {template_id:'events',title:'Мероприятия',description:'Провести пять',reward_reports:200,reward_index:1},
    {template_id:'night',title:'Ночное дежурство',description:'Ночь',reward_reports:50,reward_index:3}
  ];
  await page.documentEvents.get('change')({target:{id:'catalog-sort',value:'reports'}});
  assert.ok(page.node('#available-list').innerHTML.indexOf('Мероприятия')<page.node('#available-list').innerHTML.indexOf('Контроль поста'));
  await page.documentEvents.get('input')({target:{id:'catalog-search',value:'НОЧНОЕ'}});
  assert.match(page.node('#available-list').innerHTML,/Ночное дежурство/);
  assert.doesNotMatch(page.node('#available-list').innerHTML,/Мероприятия/);
  await page.documentEvents.get('input')({target:{id:'catalog-search',value:'Не существует'}});
  assert.match(page.node('#available-list').innerHTML,/ничего не найдено/);
  assert.equal(page.calls.length,0);
});

test('catalog shows meaningful rewards for index-only and hourly tasks and escapes text',()=>{
  const page=app();
  const index=page.catalogRewards({reward_reports:0,reward_index:4,reward_xp:30});
  assert.match(index,/до \+3/);assert.match(index,/7 дней/);assert.doesNotMatch(index,/\+0/);
  assert.match(page.catalogRewards({reward_steps:[150,250,350],reward_multiplier:1.25,reward_index:2}),/до \+940/);
  const card=page.templateCard({template_id:'<tag>',title:'<img src=x>',description:'<script>bad</script>',instructions:'one\ntwo',reward_reports:100},new Set());
  assert.doesNotMatch(card,/<img|<script>/);assert.match(card,/&lt;img/);
  assert.match(html,/admin-task-marketplace-catalog\.css\?v=20261106-2/);
});

test('bank shows only active capped index bonus, never the lifetime total',()=>{
  const page=app();page.state.data.wallet.index_bonus_total=28.5;
  page.state.data.wallet.index_bonus_active=0;page.renderAdmin();
  assert.equal(page.node('#wallet-index').textContent,'0');
  assert.match(page.node('#wallet-index-rule').textContent,/\+3 п.п. · 7 дней/);
  page.state.data.wallet.index_bonus_active=2.5;page.renderAdmin();
  assert.equal(page.node('#wallet-index').textContent,'2,5');
});

test('double take clicks send one request and success switches to current task',async()=>{
  const data=fixture();data.templates=[{template_id:'one',title:'Задание',description:'Работа'}];
  let release;
  const page=app(async action=>{
    if(action==='take_task') {await new Promise(resolve=>{release=resolve});data.own_assignments=[{assignment_id:'taken',template_id:'one',title:'Задание',status:'in_progress'}];return {assignment_id:'taken'};}
    return data;
  });
  page.state.data=data;
  const first=page.takeTask('one');
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(page.state.taking,true);
  await page.takeTask('one');
  assert.equal(page.calls.filter(call=>call.body.action==='take_task').length,1);
  release();await first;
  assert.equal(page.state.adminTab,'active');assert.equal(page.state.taking,false);
  assert.match(page.node('#available-list').innerHTML,/data-take="one" disabled/);
});

test('confirmation keeps paragraphs, list indentation and untrusted text as literal text',async()=>{
  const page=app();
  const text='Описание задания\n\nПравила:\n1. Первый пункт\n   Подпункт с отступом\n2. Второй пункт\n\nПримечание: <img src=x onerror=alert(1)>';
  await page.askDecision({title:'Взять задание?',text});
  assert.equal(page.node('#dialog-text').textContent,text);
  assert.equal(page.node('#dialog-text').innerHTML,'');
  assert.match(policyCss,/#dialog-text\s*\{[^}]*white-space:\s*pre-wrap/);
  assert.match(policyCss,/#dialog-text\s*\{[^}]*overflow-wrap:\s*anywhere/);
});

test('submission comment is optional and other confirmation dialogs do not expose it',async()=>{
  const page=app();
  const empty=await page.askDecision({title:'Отправить на проверку?',comment:true});
  assert.equal(empty.comment,'');
  assert.equal(page.node('#comment-wrap').hidden,false);
  assert.equal(page.node('#reason-wrap').hidden,true);
  const text='Первая строка\n\n<script> & пояснение';
  const result=await page.askDecision({title:'Отправить на проверку?',comment:true,commentValue:text});
  assert.equal(result.comment,text);
  assert.equal(page.node('#dialog-comment').value,text);
  await page.askDecision({title:'Взять задание?'});
  assert.equal(page.node('#comment-wrap').hidden,true);
  assert.match(html,/id="dialog-comment"[^>]*maxlength="1500"/);
  assert.doesNotMatch(html.match(/<textarea id="dialog-comment"[^>]*>/)[0],/\brequired\b/);
});

test('submit forwards optional comment, retains it on failure and never makes it mandatory',async()=>{
  const data=fixture();
  data.own_assignments=[{assignment_id:'commented',status:'in_progress',verification_mode:'manual_review',
    title:'Task',submission_comment:'Сохранённый комментарий'}];
  let fail=true;
  const page=app(async action=>{
    if(action==='submit'&&fail) throw new Error('Network failure');
    return data;
  });
  page.state.data=data;
  const button={dataset:{submit:'commented'},disabled:false};
  const event={target:{closest:selector=>selector==='[data-submit]'?button:null}};
  await page.documentEvents.get('click')(event);
  assert.equal(page.calls[0].body.submission_comment,'Сохранённый комментарий');
  assert.equal(page.state.submissionDraft.comment,'Сохранённый комментарий');
  assert.equal(button.disabled,false);
  fail=false;
  await page.documentEvents.get('click')(event);
  assert.equal(page.calls.filter(call=>call.body.action==='submit')[1].body.submission_comment,'Сохранённый комментарий');
  assert.equal(page.state.submissionDraft,null);
  data.own_assignments[0].submission_comment='';
  await page.documentEvents.get('click')(event);
  assert.equal(page.calls.filter(call=>call.body.action==='submit').at(-1).body.submission_comment,'');
});

test('reviewers and authors see escaped multiline comments on submissions, without placeholder blocks',()=>{
  const page=app();
  const assignment={assignment_id:'commented',title:'Task',status:'pending_review',verification_mode:'manual_review',
    admin_nickname:'Admin',submission_comment:'Первая строка\n\n<img src=x onerror=alert(1)>'};
  page.state.data.assignments=[assignment];
  page.state.data.own_assignments=[assignment];
  page.renderAdmin();
  page.renderLeader();
  for(const id of ['#active-list','#review-queue-list']){
    assert.match(page.node(id).innerHTML,/Комментарий/);
    assert.match(page.node(id).innerHTML,/Первая строка\n\n&lt;img/);
    assert.doesNotMatch(page.node(id).innerHTML,/<img src=x/);
  }
  assignment.submission_comment='';
  page.renderLeader();
  assert.doesNotMatch(page.node('#review-queue-list').innerHTML,/submission-comment/);
  assert.match(policyCss,/\.task-card \.submission-comment>p\{[^}]*white-space:pre-wrap/);
});

test('long confirmation rules scroll inside the viewport and load the updated style',()=>{
  assert.match(policyCss,/#decision-dialog\s*\{[^}]*max-height:\s*calc\(100dvh - 24px\)/);
  assert.match(policyCss,/#decision-dialog\s*\{[^}]*overflow:\s*auto/);
  assert.match(html,/admin-task-marketplace-policy\.css\?v=20261114-3/);
});

test('wallet renders stored bank separately from this week available amount',()=>{
  const page=app();page.renderAdmin();
  assert.equal(page.node('#wallet-reports').textContent,1400);
  assert.equal(page.node('#wallet-week-label').textContent,'800 / 1000 реп.');
  assert.match(page.node('#wallet-week-remaining').textContent,/200 репортов/);
  assert.equal(page.node('#wallet-week-progress').style.width,'80%');
  page.state.data.wallet.weekly_remaining=0;page.renderAdmin();
  assert.equal(page.node('#withdraw-button').disabled,true);
  assert.equal(page.node('#wallet-reports').textContent,1400);
});

test('manual level is clearly distinguished from XP progression',()=>{
  const page=app();page.state.data.task_profile.manual_level=true;page.renderAdmin();
  assert.match(page.node('#level-next').textContent,/назначен Master ID/);
});

test('pending review pauses deadline display and returned task shows fresh due date',()=>{
  const page=app();
  page.state.data.own_assignments=[{assignment_id:'report-1',template_id:'night',title:'Дежурство',verification_mode:'evidence_review',status:'pending_review',target_count:1,review_due_at:'2026-11-04T20:00:00Z'}];
  page.renderAdmin();
  assert.match(page.node('#active-list').innerHTML,/не расходует срок выполнения/);
  assert.match(page.node('#active-list').innerHTML,/data-cancel-assignment/);
  assert.doesNotMatch(page.node('#active-list').innerHTML,/data-submit/);
  page.state.data.own_assignments[0].status='in_progress';
  page.state.data.own_assignments[0].revision_count=1;
  page.state.data.own_assignments[0].deadline_at='2026-11-05T20:00:00Z';
  page.renderAdmin();assert.match(page.node('#active-list').innerHTML,/Доработать до/);
});

test('night report sends chosen hours and night date without starting a timer',()=>{
  const page=app();
  const report={assignment_id:'night-1',status:'in_progress',reward_steps:[150,250,350],reward_units:3};
  assert.match(page.nightFields(report),/Подтверждённые|Выполненные/);
  assert.match(page.nightFields(report),/value="3" selected/);
  page.node('[data-effort="night-1"]').value='3';page.node('[data-work-period="night-1"]').value='2026-11-03';
  assert.equal(JSON.stringify(page.effortPayload('night-1')),JSON.stringify({reward_units:3,work_period:'2026-11-03'}));
  page.node('[data-work-period="night-1"]').value='';assert.throws(()=>page.effortPayload('night-1'),/дату начала/);
});

test('publication input uses Moscow regardless of machine timezone and escapes task text',()=>{
  const page=app();
  assert.equal(page.moscowInput('2026-11-03T19:00:00Z'),'2026-11-03T22:00');
  const text=page.policyBlock({global_remaining:2,global_limit:3,min_level_key:'expert',min_level_title:'<img onerror=1>',reward_steps:[150,250,350]});
  assert.match(text,/Свободно мест: 2 из 3/);assert.match(text,/3-й час — 350/);assert.doesNotMatch(text,/<img/);
});

test('master decision history exposes revocation only for approved tasks',()=>{
  const page=app();
  page.state.data.review_history=[{assignment_id:'approved-1',status:'approved',admin_nickname:'Admin',title:'Пост'},{assignment_id:'revoked-1',status:'revoked',admin_nickname:'Admin',title:'Пост',decision_reason:'Ошибка'}];
  page.renderLeader();
  const markup=page.node('#decisions-list').innerHTML;
  assert.match(markup,/data-revoke-approval="approved-1"/);assert.doesNotMatch(markup,/data-revoke-approval="revoked-1"/);assert.match(markup,/Ошибка/);
});

test('one queue combines counters, manual reports and screenshots without losing their controls',()=>{
  const page=app();
  page.state.data.assignments=[
    {assignment_id:'counter-1',status:'in_progress',verification_mode:'leadership_counter',title:'Входы',admin_nickname:'Counter_Admin',target_count:5,taken_at:'2026-11-03T10:00:00Z'},
    {assignment_id:'manual-1',status:'pending_review',verification_mode:'manual_review',title:'Мероприятия',admin_nickname:'Manual_Admin',target_count:5,submitted_at:'2026-11-03T09:00:00Z'},
    {assignment_id:'proof-1',status:'pending_review',verification_mode:'evidence_review',title:'Пост',admin_nickname:'Proof_Admin',target_count:1,submitted_at:'2026-11-03T08:00:00Z',review_overdue:true},
    {assignment_id:'draft-1',status:'in_progress',verification_mode:'manual_review',title:'Ещё не отправлено',admin_nickname:'Draft_Admin',target_count:1},
    {assignment_id:'done-1',status:'approved',verification_mode:'manual_review',title:'Завершено',admin_nickname:'Done_Admin',target_count:1}
  ];
  page.state.data.evidence=[{assignment_id:'proof-1',view_url:'https://proof.invalid/one.png',file_name:'proof.png'}];
  page.renderLeader();
  const markup=page.node('#review-queue-list').innerHTML;
  assert.equal(page.node('#queue-count').textContent,3);assert.equal(page.node('#review-count').textContent,2);
  assert.ok(markup.indexOf('Proof_Admin') < markup.indexOf('Manual_Admin'));
  assert.ok(markup.indexOf('Manual_Admin') < markup.indexOf('Counter_Admin'));
  assert.match(markup,/data-mark="counter-1"/);assert.match(markup,/data-review="approve" data-id="manual-1"/);
  assert.match(markup,/data-review="approve" data-id="proof-1"/);assert.match(markup,/<img src="https:\/\/proof.invalid\/one.png"/);
  assert.doesNotMatch(markup,/Draft_Admin|Done_Admin/);
});

test('unified queue is empty cleanly and history stays master-only',()=>{
  const page=app();page.state.data.viewer.is_master=false;page.renderLeader();
  assert.match(page.node('#review-queue-list').innerHTML,/Очередь пуста/);
  assert.equal(page.node('#queue-count').textContent,0);assert.equal(page.node('#review-history').hidden,true);
});

test('bank reset has a reason, two confirmations, and reuses the operation after network failure',async()=>{
  let fail=true;
  const member={admin_id:101,admin_nickname:'Test_Admin',wallet:{report_balance:0,index_bonus_total:0},task_profile:{title:'Новичок',level_key:'novice',xp:0}};
  const page=app(async action=>{if(action==='reset_bank' && fail){fail=false;throw new Error('connection lost');}return action==='bootstrap'?fixture():action==='member_profile'?member:{};});
  page.state.member=member;
  const button={dataset:{memberAction:'reset_bank'}};
  await page.memberAction(button);
  await page.memberAction(button);
  const resets=page.calls.filter(call=>call.body.action==='reset_bank');
  assert.equal(resets.length,2);assert.equal(resets[0].body.operation_id,resets[1].body.operation_id);
  assert.equal(resets[0].body.reason,'Обоснованная причина');assert.equal(page.dialogs.length,4);
  assert.equal(resets[0].headers['X-Telegram-Init-Data'],'signed-telegram-data');
});

test('non-master cannot initiate owner resets in the interface',async()=>{
  const page=app();page.state.data.viewer.is_master=false;
  await page.memberAction({dataset:{memberAction:'reset_bank'}});
  assert.equal(page.calls.length,0);assert.equal(page.dialogs.length,0);
});

test('withdrawal opens an in-app dialog without a browser prompt or site heading',()=>{
  const page=app();page.openWithdrawDialog();
  assert.equal(page.node('#withdraw-dialog').open,true);
  assert.equal(page.node('#withdraw-amount').value,'200');
  assert.equal(page.node('#withdraw-amount').max,'200');
  assert.match(page.node('#withdraw-available').textContent,/200 репортов/);
  assert.equal(page.node('#withdraw-amount').focused,true);
  assert.doesNotMatch(source,/window\.prompt\s*\(/);
  const dialog=html.match(/<dialog id="withdraw-dialog"[\s\S]*?<\/dialog>/)[0];
  assert.doesNotMatch(dialog,/github\.io/);
  assert.match(dialog,/aria-labelledby="withdraw-title"/);
  assert.match(dialog,/>Отмена<|>Вывести</);
  assert.equal(page.calls.length,0);
});

test('withdrawal validates whole quantities and current weekly allowance before sending',async()=>{
  const page=app();page.openWithdrawDialog();
  for(const value of ['', '0', '-1', '2.5', '201', '2e2']){
    page.node('#withdraw-amount').value=value;
    await page.submitWithdrawal({preventDefault(){}});
    assert.equal(page.calls.length,0,value);
    assert.equal(page.node('#withdraw-error').hidden,false);
    assert.equal(page.node('#withdraw-dialog').open,true);
  }
  page.state.data.wallet.weekly_remaining=50;
  page.node('#withdraw-amount').value='100';
  await page.submitWithdrawal({preventDefault(){}});
  assert.match(page.node('#withdraw-error').textContent,/от 1 до 50/);
  assert.equal(page.node('#withdraw-amount').max,'50');
  assert.equal(page.calls.length,0);
  page.node('#withdraw-amount').value='50';
  await page.submitWithdrawal({preventDefault(){}});
  const request=page.calls.find(call=>call.body.action==='withdraw');
  assert.equal(request.body.amount,50);
  assert.equal(request.headers['X-Telegram-Init-Data'],'signed-telegram-data');
  assert.equal(page.node('#withdraw-dialog').open,false);
});

test('withdrawal cancellation never sends an operation',()=>{
  const page=app();page.openWithdrawDialog();
  for(const listener of page.node('#withdraw-cancel').listeners.click)listener();
  assert.equal(page.node('#withdraw-dialog').open,false);
  assert.equal(page.calls.length,0);
});

test('withdrawal timeout keeps the form and retries the same operation key',async()=>{
  let fail=true;
  const page=app(async action=>{
    if(action==='withdraw' && fail){fail=false;throw Object.assign(new Error('timeout'),{name:'AbortError'});}
    return action==='bootstrap'?fixture():{};
  });
  page.openWithdrawDialog();
  await page.submitWithdrawal({preventDefault(){}});
  assert.equal(page.node('#withdraw-dialog').open,true);
  assert.equal(page.node('#withdraw-confirm').disabled,false);
  assert.match(page.node('#withdraw-error').textContent,/не спишет репорты ещё раз/);
  await page.submitWithdrawal({preventDefault(){}});
  const withdrawals=page.calls.filter(call=>call.body.action==='withdraw');
  assert.equal(withdrawals.length,2);
  assert.equal(withdrawals[0].body.operation_id,withdrawals[1].body.operation_id);
  assert.equal(page.node('#withdraw-dialog').open,false);
  assert.equal(page.stored.size,0);
});

test('withdrawal blocks repeated submission and accidental closing while pending',async()=>{
  let resolveRequest;
  const page=app(async action=>action==='withdraw'?new Promise(resolve=>{resolveRequest=resolve;}):fixture());
  page.openWithdrawDialog();
  const first=page.submitWithdrawal({preventDefault(){}});
  assert.equal(page.state.withdrawing,true);
  assert.equal(page.node('#withdraw-confirm').disabled,true);
  await page.submitWithdrawal({preventDefault(){}});
  assert.equal(page.calls.filter(call=>call.body.action==='withdraw').length,1);
  for(const listener of page.node('#withdraw-cancel').listeners.click)listener();
  assert.equal(page.node('#withdraw-dialog').open,true);
  let prevented=false;
  for(const listener of page.node('#withdraw-dialog').listeners.cancel)listener({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  resolveRequest({});await first;
  assert.equal(page.state.withdrawing,false);
  assert.equal(page.node('#withdraw-dialog').open,false);
});
