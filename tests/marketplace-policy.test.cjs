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
    if (!nodes.has(selector)) nodes.set(selector,{value:'',hidden:false,innerHTML:'',textContent:'',style:{},dataset:{},listeners:{},classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){(this.listeners[type] ||= new Set()).add(fn);},removeEventListener(type,fn){this.listeners[type]?.delete(fn);},showModal(){if(selector === '#decision-dialog'){dialogs.push(nodes.get('#dialog-title').textContent);queueMicrotask(()=>{node('#dialog-reason').value='Обоснованная причина';this.returnValue='default';for(const fn of [...(this.listeners.close || [])])fn();});}},close(){for(const fn of [...(this.listeners.close || [])])fn();}});
    return nodes.get(selector);
  }
  const document = {querySelector:node,querySelectorAll:()=>[],addEventListener(){}};
  const window = {Telegram:{WebApp:{initData:'signed-telegram-data',ready(){},expand(){}}}};
  const context = {window,document,Intl,Date,CSS:{escape:s=>s},queueMicrotask,crypto:{randomUUID:()=>`uuid-${calls.length}`},sessionStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},setTimeout:()=>0,clearTimeout(){},fetch:async(_url, options)=>{const body=JSON.parse(options.body);calls.push({body,headers:options.headers});return {ok:true,json:async()=>({status:'success',data:await fetcher(body.action,body)})};}};
  const testSource = source.replace('  reload();\n})();', '  window.testApp = {state,render,renderAdmin,renderLeader,nightFields,effortPayload,policyBlock,memberAction,openTemplateEditor,moscowInput,askDecision};\n})();');
  vm.runInNewContext(testSource,context);
  window.testApp.state.data=fixture();
  return {...window.testApp,node,calls,stored,dialogs};
}

test('all static element bindings exist in the page',()=>{
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  for(const match of source.matchAll(/\$\('#([a-z0-9-]+)'\)/g)) assert.ok(ids.has(match[1]),`Missing #${match[1]}`);
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

test('long confirmation rules scroll inside the viewport and load the updated style',()=>{
  assert.match(policyCss,/#decision-dialog\s*\{[^}]*max-height:\s*calc\(100dvh - 24px\)/);
  assert.match(policyCss,/#decision-dialog\s*\{[^}]*overflow:\s*auto/);
  assert.match(html,/admin-task-marketplace-policy\.css\?v=20261103-3/);
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
