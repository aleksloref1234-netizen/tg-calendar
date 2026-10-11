const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../norm-settings.html'), 'utf8');

test('norm settings round every configurable metric before display and save', () => {
  assert.match(html, /const whole=value=>/);
  assert.match(html, /value="\$\{whole\(row\[key\]\)\}"/);
  assert.match(html, /next\[input\.dataset\.field\]=whole\(input\.value\)/);
  assert.match(html, /reactions:whole\(\$\('p-reactions'\)\.value\)/);
  assert.match(html, /type="number" min="0" step="1"/);
});

test('norm settings inline scripts parse', () => {
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script);
  }
});
