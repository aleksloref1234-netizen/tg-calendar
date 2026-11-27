const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');

const source = readFileSync(path.join(__dirname, '..', 'supervisor-payouts.js'), 'utf8');
const html = readFileSync(path.join(__dirname, '..', 'supervisors.html'), 'utf8');

function fixture({enabled = true} = {}) {
  const elements = new Map();
  function getElementById(id) {
    if (!elements.has(id)) {
      const listeners = {};
      elements.set(id, {
        id, value:'', textContent:'', hidden:false, open:false,
        addEventListener:(event, callback) => { listeners[event] = callback; },
        fire:(event, args) => listeners[event]?.(args),
        showModal(){ this.open = true; }, close(){ this.open = false; },
        removeAttribute(name){ delete this[name]; }, reportValidity(){ return true; },
      });
    }
    return elements.get(id);
  }
  const saved = new Map(), requests = [], responses = [];
  const row = {assignment_id:'forum-100', applicant_nick:'Example_Admin', position_title:'Следящий за форумом'};
  const document = {getElementById, querySelector:() => null};
  const window = {};
  vm.runInNewContext(source, {
    window, document, crypto:webcrypto, AbortController, setTimeout, clearTimeout,
    localStorage:{getItem:k => saved.get(k), setItem:(k,v) => saved.set(k,v), removeItem:k => saved.delete(k)},
    fetch:async (_url, request) => {
      requests.push({authorization:request.headers['X-Telegram-Init-Data'], ...JSON.parse(request.body)});
      const next = responses.shift();
      if (next instanceof Error) throw next;
      assert.ok(next, 'test must provide a response');
      return {ok:next[0] === 200, status:next[0], json:async () => next[1]};
    },
  });
  const controls = window.createSupervisorPayouts({
    api:'https://local.invalid', tg:{initData:'signed-init', initDataUnsafe:{user:{id:300}}},
    esc:String, getOverview:() => ({payout_enabled:enabled, active_assignments:[row]}), renderAssignments:() => {},
  });
  const turn = () => new Promise(resolve => setImmediate(resolve));
  return {get:getElementById, requests, responses, controls, row, saved, turn};
}

test('roster shows only authorized payout controls and does not describe the limits', async () => {
  const readonly = fixture({enabled:false});
  readonly.controls.update();
  readonly.get('payout-refresh').fire('click');
  assert.equal(readonly.get('payout-banner').hidden, true);
  assert.equal(readonly.controls.badge(readonly.row), '');
  assert.equal(readonly.requests.length, 0);
  assert.match(html, /aria-labelledby="payout-title"/);
  assert.match(html, /репорт отправится напрямую в статистику администратора/);
  assert.doesNotMatch(html, /После зачисления бот уведомит/);
  assert.doesNotMatch(source + html, /750|1500|раз в неделю/i);
});

test('lost response preserves the draft; retry uses the same id and displays queued not exported', async () => {
  const f = fixture();
  f.responses.push([200, {status:'success', data:{payouts:{'forum-100':{status:'available', max_amount:750}}}}]);
  f.get('payout-refresh').fire('click');
  await f.turn();
  assert.match(f.controls.badge(f.row), /Вывести репорты/);
  f.get('assignments').fire('click', {target:{closest:() => ({dataset:{payout:'forum-100'}})}});
  assert.equal(f.get('payout-dialog').open, true);
  assert.equal(f.get('payout-nick').textContent, 'Example_Admin');
  f.get('payout-amount').value = '450';
  f.responses.push(new Error('network broke'));
  await f.get('payout-form').fire('submit', {preventDefault(){}});
  assert.equal(f.get('payout-dialog').open, true);
  assert.equal(f.saved.size, 1);
  assert.equal(f.get('payout-amount').readOnly, true);
  assert.match(f.get('payout-error').textContent, /не подтверждён/);
  f.responses.push([200, {status:'success', data:{status:'queued', amount:450}}]);
  await f.get('payout-form').fire('submit', {preventDefault(){}});
  assert.equal(f.requests[1].request_id, f.requests[2].request_id);
  assert.equal(f.requests[2].amount, 450);
  assert.equal(f.requests[2].authorization, 'signed-init');
  assert.equal(f.get('payout-dialog').open, false);
  assert.equal(f.saved.size, 0);
  assert.match(f.controls.badge(f.row), /В очереди · 450 реп/);
  assert.doesNotMatch(f.controls.badge(f.row), /Выведено/);
});

test('confirmed rollback sends the existing payout id and reason, and shows pending reversal', async () => {
  const f = fixture();
  f.responses.push([200, {status:'success', data:{payouts:{
    'forum-100':{status:'exported', amount:450, payout_id:'existing-payout'},
  }}}]);
  f.get('payout-refresh').fire('click');
  await f.turn();
  assert.match(f.controls.badge(f.row), /Выведено · 450 реп/);
  assert.match(f.controls.badge(f.row), /Откатить/);
  f.get('assignments').fire('click', {target:{closest:(selector) =>
    selector === '[data-rollback]' ? {dataset:{rollback:'forum-100'}} : null,
  }});
  assert.equal(f.get('payout-rollback-dialog').open, true);
  assert.match(f.get('payout-rollback-amount').textContent, /450/);
  await f.get('payout-rollback-form').fire('submit', {preventDefault(){}});
  assert.equal(f.requests.length, 1);
  f.get('payout-rollback-reason').value = 'Неверная сумма';
  f.responses.push([200, {status:'success', data:{status:'reversing'}}]);
  await f.get('payout-rollback-form').fire('submit', {preventDefault(){}});
  assert.deepEqual(f.requests.at(-1), {
    authorization:'signed-init',action:'rollback_payout',payout_id:'existing-payout',reason:'Неверная сумма',
  });
  assert.match(f.controls.badge(f.row), /Откат в очереди/);
  assert.equal(f.get('payout-rollback-dialog').open, false);
});
