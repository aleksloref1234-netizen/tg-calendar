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
