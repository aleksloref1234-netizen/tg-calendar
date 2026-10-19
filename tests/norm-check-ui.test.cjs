const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../norm-check.html'), 'utf8');
const source = html.slice(html.indexOf('    const whole='), html.indexOf('    function nextUnchecked('));

function fixture() {
  const nodes = new Map();
  const makeNode = id => {
    const classes = new Set(id === 'discipline' ? ['hidden'] : []);
    return {
      value: '', textContent: '', className: '', style: {},
      classList: {
        add(value) { classes.add(value); },
        contains(value) { return classes.has(value); },
        toggle(value, force) {
          const enabled = force === undefined ? !classes.has(value) : Boolean(force);
          enabled ? classes.add(value) : classes.delete(value);
          return enabled;
        },
      },
    };
  };
  const context = vm.createContext({
    admins: [{
      telegram_id: 1,
      locked: false,
      check: null,
      norm: {reports: 40, minutes: 90, events: 2, reactions: 15},
    }],
    selected: 1,
    disciplineDecision: null,
    overNorm: {threshold_reports: 250, bonus_reports: 200},
    partialNorm: {
      reports_deficit: 30,
      minutes_deficit: 30,
      reduced_reports_deficit: 15,
      reduced_minutes_deficit: 15,
      reduced_factor: 0.5,
    },
    eventBonus: {starts_after: 2, reports_per_event: 50},
    $: id => {
      if (!nodes.has(id)) nodes.set(id, makeNode(id));
      return nodes.get(id);
    },
  });
  vm.runInContext(source, context);
  for (const id of ['report', 'minutes', 'events', 'reactions']) context.$(id);
  return {context, nodes};
}

test('reprimand choice is hidden before all four facts are entered', () => {
  const {context, nodes} = fixture();
  nodes.get('report').value = '0';
  nodes.get('minutes').value = '0';
  nodes.get('events').value = '0';
  context.evaluate();
  assert.equal(nodes.get('discipline').classList.contains('hidden'), true);
  assert.equal(nodes.get('result').textContent, 'Заполните все показатели');
  assert.equal(nodes.get('percent').textContent, '—');
});

test('reprimand choice appears only after a complete failed result', () => {
  const {context, nodes} = fixture();
  for (const id of ['report', 'minutes', 'events', 'reactions']) nodes.get(id).value = '0';
  context.evaluate();
  assert.equal(nodes.get('discipline').classList.contains('hidden'), false);
  assert.equal(nodes.get('result').textContent, 'Норма не выполнена');
  assert.equal(nodes.get('percent').textContent, '0%');
});

test('completed and partial results do not show the reprimand choice', () => {
  const {context, nodes} = fixture();
  const setFacts = values => Object.entries(values).forEach(([id, value]) => { nodes.get(id).value = String(value); });
  setFacts({report: 10, minutes: 60, events: 2, reactions: 15});
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Норма натянута');
  assert.equal(nodes.get('percent').textContent, '25%');
  assert.match(nodes.get('result-note').textContent, /до 30 репортов и 30 минут/);
  assert.equal(nodes.get('discipline').classList.contains('hidden'), true);
  setFacts({report: 40, minutes: 90, events: 2, reactions: 15});
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Норма выполнена');
  assert.equal(nodes.get('discipline').classList.contains('hidden'), true);
});

test('partial result fails beyond the fixed deficit or without all secondary metrics', () => {
  const {context, nodes} = fixture();
  const setFacts = values => Object.entries(values).forEach(([id, value]) => { nodes.get(id).value = String(value); });
  setFacts({report: 9, minutes: 60, events: 2, reactions: 15});
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Норма не выполнена');
  assert.equal(nodes.get('discipline').classList.contains('hidden'), false);
  setFacts({report: 10, minutes: 60, events: 2, reactions: 14});
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Норма не выполнена');
});

test('reduced norm halves both partial deficit limits', () => {
  const {context, nodes} = fixture();
  context.admins[0].norm.dynamic_discount = {applied: true};
  const setFacts = values => Object.entries(values).forEach(([id, value]) => { nodes.get(id).value = String(value); });
  setFacts({report: 25, minutes: 75, events: 2, reactions: 15});
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Норма натянута');
  assert.match(nodes.get('result-note').textContent, /до 15 репортов и 15 минут/);
  setFacts({report: 24, minutes: 75, events: 2, reactions: 15});
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Норма не выполнена');
});

test('preview uses the partial deficit values returned by settings', () => {
  const {context, nodes} = fixture();
  context.partialNorm.reports_deficit = 8;
  context.partialNorm.minutes_deficit = 12;
  const setFacts = values => Object.entries(values).forEach(([id, value]) => { nodes.get(id).value = String(value); });
  setFacts({report: 32, minutes: 78, events: 2, reactions: 15});
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Норма натянута');
  assert.match(nodes.get('result-note').textContent, /до 8 репортов и 12 минут/);
  setFacts({report: 31, minutes: 78, events: 2, reactions: 15});
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Норма не выполнена');
});

test('each event after the second adds 50 reports to the exported daily value', () => {
  const {context, nodes} = fixture();
  const facts = {report: 40, minutes: 90, events: 4, reactions: 15};
  for (const [id, value] of Object.entries(facts)) nodes.get(id).value = String(value);
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Норма выполнена');
  assert.equal(
    nodes.get('result-note').textContent,
    'В таблицу будет записано 140 репортов: 40 фактически + 100 за 2 доп. МП.',
  );
});

test('fractional requirements and entered facts are rounded to whole numbers', () => {
  const {context, nodes} = fixture();
  context.admins[0].norm.reactions = 7.5;
  nodes.get('report').value = '40';
  nodes.get('minutes').value = '90';
  nodes.get('events').value = '2';
  nodes.get('reactions').value = '7.5';

  context.evaluate();

  assert.equal(vm.runInContext('whole(7.5)', context), 8);
  assert.equal(vm.runInContext('values().reactions', context), 8);
  assert.equal(nodes.get('result').textContent, 'Норма выполнена');
});

test('250 reports with completed requirements is shown as overcompleted', () => {
  const {context, nodes} = fixture();
  const facts = {report: 250, minutes: 90, events: 2, reactions: 15};
  for (const [id, value] of Object.entries(facts)) nodes.get(id).value = String(value);
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Перенорма выполнена');
  assert.equal(nodes.get('result-note').textContent, 'В таблицу будет записано 450 репортов: 250 фактически + 200 за перенорму.');
  assert.equal(nodes.get('percent').className, 'zone magenta');
  assert.equal(nodes.get('discipline').classList.contains('hidden'), true);
});

test('the reprimand block is hidden in the initial markup', () => {
  assert.match(html, /class="discipline hidden" id="discipline"/);
});

test('failed result asks about a warning and sends the explicit API field', () => {
  assert.match(html, /<b>Начислить предупреждение\?<\/b>/);
  assert.doesNotMatch(html, /Выдать (?:выговор|наказание)\?/);
  assert.match(html, /issue_warning:disciplineDecision/);
});

test('submit retries transient failures with one stable operation id', () => {
  assert.match(html, /const delays=\[0,700,1600,3000\]/);
  assert.match(html, /\[429,502,503,504\]\.includes\(response\.status\)/);
  assert.match(html, /const operationId=makeOperationId\(\)/);
  assert.match(html, /operation_id:operationId/);
  assert.match(html, /randomUUID/);
});

test('dynamic norm entitlement is visible to the curator', () => {
  assert.match(html, /class="discount hidden" id="discount"/);
  assert.match(html, /Сокращённый норматив активен/);
  assert.match(html, /находится в зелёной зоне/);
  assert.doesNotMatch(html, /льготн/i);
});

test('weekly reduced-norm lock is explained to the curator', () => {
  assert.match(html, /Сокращённый норматив приостановлен/);
  assert.match(html, /До следующего понедельника применяется стандартный норматив/);
  assert.match(html, /dynamic\.weekly_locked/);
  assert.match(html, /dynamic\.weekly_lock_reasons/);
});

test('status badges use soft translucent colors', () => {
  assert.match(html, /--status-done-bg:rgba\([^)]*,\.14\)/);
  assert.match(html, /--status-partial-bg:rgba\([^)]*,\.16\)/);
  assert.match(html, /--status-failed-bg:rgba\([^)]*,\.13\)/);
  assert.match(html, /--status-over-bg:rgba\([^)]*,\.13\)/);
  assert.match(html, /\.state\.completed\{[^}]*background:var\(--status-done-bg\)/);
  assert.match(html, /\.state\.partial\{[^}]*background:var\(--status-partial-bg\)/);
  assert.match(html, /\.state\.failed\{[^}]*background:var\(--status-failed-bg\)/);
  assert.match(html, /\.state\.overcompleted\{[^}]*background:var\(--status-over-bg\)/);
});

test('norm check inline scripts parse', () => {
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script);
  }
});
