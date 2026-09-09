const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../training-center.html'), 'utf8');
const cardSource = html.slice(html.indexOf('    function entryTestCompleted('),
  html.indexOf('    function renderCourse('));
const context = vm.createContext({
  esc: value => String(value ?? ''),
  caseWord: () => 'кейс',
  statusLabel: status => ({failed:'Нужна пересдача',passed:'Пройдено',pending_review:'На проверке'}[status] || 'Не начато'),
});
vm.runInContext(cardSource, context);
const bank = {bank_id:'entry',bank_type:'entry',name:'Входной тест',available:true,
  ready:true,last_status:'',selection_mode:'configured',pass_score:80};

test('entry cards disable every submitted outcome, including stale available data', () => {
  for (const status of ['passed','failed','pending_review']) {
    const card = context.specialTestCard({...bank,last_status:status});
    assert.match(card, / disabled /);
    assert.doesNotMatch(card, /Доступна пересдача|Откроется по расписанию/);
    assert.match(card, status === 'pending_review' ? /На проверке/ : /Завершён · без пересдачи/);
  }
});

test('recorded entry completion takes precedence over later bank edits', () => {
  const card = context.specialTestCard({...bank,ready:false,available:false,
    single_attempt_completed:true,availability_reason:'entry_completed'});
  assert.match(card, / disabled /);
  assert.match(card, /Завершён · без пересдачи/);
  assert.doesNotMatch(card, /Проверьте состав банка|Откроется по расписанию/);
});

test('unsent entry, curator preview and a failed final remain startable', () => {
  for (const item of [bank,{...bank,last_status:'in_progress'},
    {...bank,last_status:'failed',availability_reason:'preview'},
    {...bank,bank_type:'final',last_status:'failed'}]) {
    assert.doesNotMatch(context.specialTestCard(item), / disabled /);
  }
});

test('entry results no longer request a retake; other test results still do', () => {
  assert.equal(context.specialTestStatus({...bank,last_status:'failed'}), 'Завершён');
  assert.equal(context.specialTestStatus({...bank,bank_type:'final',last_status:'failed'}), 'Нужна пересдача');
});

test('training center inline scripts parse', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  for (const [,source] of scripts) new vm.Script(source);
});
