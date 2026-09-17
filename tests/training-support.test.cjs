const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../training-center.html'), 'utf8');
const source = html.slice(html.indexOf('    function supportMessageHtml('), html.indexOf('    function formatDuration('));
function fixture(support, api = async () => {throw new Error('Unexpected request');}) {
  const nodes = new Map();
  const context = vm.createContext({
    dashboard:{support},supportMessages:[],supportSending:false,lastSupportQuestion:'',lastSupportAnswer:'',
    supportQuotaTimer:0,supportQuotaRefreshing:false,api,
    esc:value => String(value ?? ''),
    $:id => {if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',focus(){}});return nodes.get(id);},
    document:{querySelectorAll:() => []},
    tg:{showAlert(){}},requestAnimationFrame(){},setTimeout:() => 1,clearTimeout(){},
  });
  vm.runInContext(source, context);
  return context;
}
const quota = {enabled:true,quota_available:true,ai_available:true,daily_limit:5,remaining_today:5,timezone:'Europe/Moscow'};

test('five replies exhaust the UI allowance and the sixth makes no request', async () => {
  let calls = 0;
  const page = fixture({...quota}, async () => ({answer:'Ответ',quota:{remaining_today:5-++calls}}));
  for(let index=0;index<6;index++)await page.sendSupportMessage('Вопрос');
  assert.equal(calls,5);
  const rendered = page.$('supportView').innerHTML;
  assert.match(rendered,/Лимит на сегодня исчерпан/);
  assert.match(rendered,/<button type="submit" disabled/);
  assert.doesNotMatch(rendered,/<textarea[^>]*disabled/);
  assert.match(rendered,/в 00:00 по Москве/);
});

test('missing server support does not send a request to an unavailable route', async () => {
  const page = fixture(undefined);
  page.renderSupport();
  await page.sendSupportMessage('Вопрос');
  assert.match(page.$('supportView').innerHTML,/Поддержка временно недоступна/);
  assert.match(page.$('supportView').innerHTML,/<button type="submit" disabled/);
});

test('server quota wins when another device has already used the allowance', async () => {
  const page = fixture({...quota}, async () => {throw Object.assign(new Error('Лимит'), {
    status:429,code:'support_daily_limit',data:{quota:{remaining_today:0,reset_at:'2026-09-18T00:00:00+03:00'}},
  });});
  await page.sendSupportMessage('Вопрос');
  assert.equal(page.dashboard.support.remaining_today,0);
  assert.match(page.$('supportView').innerHTML,/<button type="submit" disabled/);
});

test('next-day refresh restores questions and preserves the draft', async () => {
  const page = fixture({...quota,remaining_today:0}, async route => {
    assert.equal(route,'/api/training/bootstrap');
    return {support:{...quota,remaining_today:5}};
  });
  page.$('supportInput').value='Черновик';
  await page.refreshSupportQuota();
  assert.match(page.$('supportView').innerHTML,/Осталось 5 из 5 вопросов/);
  assert.doesNotMatch(page.$('supportView').innerHTML,/<button type="submit" disabled/);
  assert.equal(page.$('supportInput').value,'Черновик');
});

test('a new question can still be sent to a curator after exhausting AI allowance', async () => {
  const page = fixture({...quota,remaining_today:0}, async (route,body) => {
    assert.equal(route,'/api/training/support/escalate');
    assert.equal(body.message,'Новый вопрос куратору');
    assert.equal(body.assistant_answer,'');
    return {message:'Передано'};
  });
  page.lastSupportQuestion='Старый вопрос';
  page.lastSupportAnswer='Старый ответ';
  page.$('supportInput').value='Новый вопрос куратору';
  await page.escalateSupport();
  assert.equal(page.$('supportInput').value,'');
});

test('owner uses explicit server unlimited flag and can ask more than five questions', async () => {
  let calls=0;
  const unlimited={unlimited:true,daily_limit:null,remaining_today:null,used_today:null,reset_at:null};
  const page=fixture({...quota,...unlimited},async()=>{calls++;return {answer:'Ответ',quota:unlimited}});
  for(let i=0;i<8;i++)await page.sendSupportMessage('Вопрос');
  assert.equal(calls,8);
  assert.match(page.$('supportView').innerHTML,/Без дневного лимита/);
  assert.doesNotMatch(page.$('supportView').innerHTML,/До 5 вопросов|Лимит обновляется|<button type="submit" disabled/);
});

test('role name alone does not bypass quota and server can revoke unlimited access', async()=>{
  const page=fixture({...quota,remaining_today:0});
  page.dashboard.user={role:'owner'};
  assert.equal(page.supportQuotaState().limitReached,true);
  page.dashboard.support.unlimited=true;
  assert.equal(page.supportQuotaState().limitReached,false);
  page.api=async()=>({support:{...quota,unlimited:false,remaining_today:0}});
  await page.refreshSupportQuota();
  assert.equal(page.supportQuotaState().limitReached,true);
});

test('server actions distinguish lecture and block links and preserve them after sending',async()=>{
  const actions=[{type:'lesson',lesson_id:'lesson_2',lesson_title:'Лекция 2'},
    {type:'block',lesson_id:'lesson_2',block_id:'block_dm',lesson_title:'Лекция 2',block_title:'Ответный DM'}];
  const page=fixture({...quota},async()=>({answer:'Откройте материал',actions}));
  await page.sendSupportMessage('Вопрос');
  const rendered=page.$('supportView').innerHTML;
  assert.match(rendered,/Открыть лекцию/);
  assert.match(rendered,/Открыть раздел/);
  assert.match(rendered,/data-support-block="block_dm"/);
  assert.match(rendered,/Ответный DM/);
  const button={dataset:{supportLesson:'lesson_2',supportBlock:'block_dm'}};
  let target;
  page.document.querySelectorAll=selector=>selector==='[data-support-lesson]'?[button]:[];
  page.openLesson=(id,options)=>{target={id,...options}};
  page.bindSupport();button.onclick();
  assert.deepEqual(target,{id:'lesson_2',blockId:'block_dm',returnTo:'support'});
});

test('explicit empty actions do not fall back to links to inaccessible sources',()=>{
  const page=fixture({...quota});
  const rendered=page.supportMessageHtml({role:'assistant',text:'Закрытая лекция',actions:[],sources:[{lesson_id:'closed',source_id:'b1'}]},0);
  assert.doesNotMatch(rendered,/data-support-lesson/);
});

const lessonSource=html.slice(html.indexOf('    function anchoredArticleBlockHtml('),html.indexOf('    async function startBankTest('));
function lessonFixture(api){
  const classes=new Set(),views=[],alerts=[],scrolls=[];
  const target={isConnected:true,dataset:{lectureBlock:'block_dm'},classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},focus(){this.focused=true},scrollIntoView:options=>scrolls.push(options)};
  const nodes={lessonView:{innerHTML:'',querySelectorAll:()=>[target]},lessonBack:{}};
  const page=vm.createContext({api,$:id=>nodes[id],esc:value=>String(value??''),document:{querySelectorAll:()=>[]},tg:{showAlert:value=>alerts.push(value)},
    currentLesson:null,currentBank:null,currentAttempt:null,completedLessonMediaIds:new Set(),
    stopReadingTracker(){},startReadingTracker(){},switchView:name=>views.push(name),
    formatDuration:()=>'',articleBlockHtml:item=>`<section>${item.title}</section>`,materialHtml:()=>'',lessonTestButtonHtml:()=>'',bindLessonTestButton(){},loadArticleMedia(){},
    requestAnimationFrame:cb=>cb(),setTimeout:()=>1,
  });
  vm.runInContext(lessonSource,page);
  return {page,nodes,target,classes,views,alerts,scrolls};
}

test('block link opens the normal protected endpoint, scrolls, highlights and returns to support',async()=>{
  const fixture=lessonFixture(async route=>{
    assert.equal(route,'/api/training/lesson/lesson_2');
    return {lesson:{lesson_id:'lesson_2',title:'Лекция'},blocks:[{block_id:'block_dm',title:'Ответный DM'}]};
  });
  await fixture.page.openLesson('lesson_2',{blockId:'block_dm',returnTo:'support'});
  assert.match(fixture.nodes.lessonView.innerHTML,/data-lecture-block="block_dm"/);
  assert.equal(fixture.target.focused,true);
  assert.equal(fixture.scrolls.length,1);
  assert.equal(fixture.classes.has('support-highlight'),true);
  assert.match(fixture.nodes.lessonView.innerHTML,/К поддержке/);
  fixture.nodes.lessonBack.onclick();
  assert.deepEqual(fixture.views,['lesson','support']);
});

test('stale lesson permissions show the server error with return to support',async()=>{
  const fixture=lessonFixture(async()=>{throw new Error('Лекция закрыта')});
  await fixture.page.openLesson('lesson_2',{blockId:'block_dm',returnTo:'support'});
  assert.match(fixture.nodes.lessonView.innerHTML,/Лекция закрыта/);
  assert.equal(fixture.scrolls.length,0);
  fixture.nodes.lessonBack.onclick();
  assert.equal(fixture.views.at(-1),'support');
});

test('removed block falls back to the lecture with a clear notice',async()=>{
  const fixture=lessonFixture(async()=>({lesson:{title:'Лекция'},blocks:[]}));
  await fixture.page.openLesson('lesson_2',{blockId:'removed'});
  assert.equal(fixture.scrolls.length,0);
  assert.match(fixture.alerts[0],/изменён или удалён/);
  fixture.nodes.lessonBack.onclick();
  assert.equal(fixture.views.at(-1),'course');
});
