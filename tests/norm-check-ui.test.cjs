const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../norm-check.html'), 'utf8');
const source = html.slice(html.indexOf('    const factFields='), html.indexOf('    function nextUnchecked('));

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
  setFacts({report: 30, minutes: 68, events: 2, reactions: 12});
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Норма натянута');
  assert.equal(nodes.get('discipline').classList.contains('hidden'), true);
  setFacts({report: 40, minutes: 90, events: 2, reactions: 15});
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Норма выполнена');
  assert.equal(nodes.get('discipline').classList.contains('hidden'), true);
});

test('250 reports with completed requirements is shown as overcompleted', () => {
  const {context, nodes} = fixture();
  const facts = {report: 250, minutes: 90, events: 2, reactions: 15};
  for (const [id, value] of Object.entries(facts)) nodes.get(id).value = String(value);
  context.evaluate();
  assert.equal(nodes.get('result').textContent, 'Перенорма выполнена');
  assert.equal(nodes.get('result-note').textContent, 'За 250 репортов в таблицу будет записано 450.');
  assert.equal(nodes.get('percent').className, 'zone magenta');
  assert.equal(nodes.get('discipline').classList.contains('hidden'), true);
});

test('the reprimand block is hidden in the initial markup', () => {
  assert.match(html, /class="discipline hidden" id="discipline"/);
});

test('failed result asks about punishment and sends the new API field', () => {
  assert.match(html, /<b>Выдать наказание\?<\/b>/);
  assert.doesNotMatch(html, /Выдать выговор\?/);
  assert.match(html, /issue_punishment:disciplineDecision/);
});

test('dynamic norm entitlement is visible to the curator', () => {
  assert.match(html, /class="discount hidden" id="discount"/);
  assert.match(html, /Сокращённый норматив активен/);
  assert.match(html, /находится в зелёной зоне/);
  assert.doesNotMatch(html, /льготн/i);
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
