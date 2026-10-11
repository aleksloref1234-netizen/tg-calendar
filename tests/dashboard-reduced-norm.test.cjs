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

test('dashboard inline scripts parse', () => {
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script);
  }
});
