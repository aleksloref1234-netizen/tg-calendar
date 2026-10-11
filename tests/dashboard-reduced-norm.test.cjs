const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dashboard.html'), 'utf8');

test('personal dashboard contains a restrained reduced norm card', () => {
  assert.match(html, /id="reduced-norm-card" hidden/);
  assert.match(html, /Сокращённая норма действует/);
  assert.match(html, /Показатели соответствуют условиям зелёной зоны/);
  assert.match(html, /class="reduced-norm-badge">−50%/);
});

test('reduced norm card renders all effective daily requirements', () => {
  assert.match(html, /renderReducedNorm\(d\.reduced_norm\)/);
  assert.match(html, /profile\?\.available && profile\?\.active/);
  for (const field of ['reports', 'minutes', 'events', 'reactions']) {
    assert.match(html, new RegExp(`norm\\.${field}`));
  }
});

test('reduced norm requirements are always displayed as whole numbers', () => {
  const nodes = new Map();
  const document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, {hidden: true, innerText: ''});
      return nodes.get(id);
    },
  };
  const source = html.slice(
    html.indexOf('        function renderReducedNorm('),
    html.indexOf('        function renderPerformanceIndex('),
  );
  const context = vm.createContext({document, Math, Number, String});
  vm.runInContext(source, context);

  context.renderReducedNorm({
    available: true,
    active: true,
    category_title: 'Модераторы',
    effective_norm: {reports: 37.5, minutes: 45, events: 0.5, reactions: 7.5},
  });

  assert.equal(nodes.get('reduced-reports').innerText, '38');
  assert.equal(nodes.get('reduced-minutes').innerText, '45');
  assert.equal(nodes.get('reduced-events').innerText, '1');
  assert.equal(nodes.get('reduced-reactions').innerText, '8');
});

test('dashboard inline scripts parse', () => {
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script);
  }
});
