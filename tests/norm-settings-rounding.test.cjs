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

test('master can edit partial thresholds for every role', () => {
  assert.match(html, /partial_reports_deficit/);
  assert.match(html, /partial_minutes_deficit/);
  assert.match(html, /Натяг<br>репортов/);
  assert.match(html, /Натяг<br>минут/);
  assert.match(html, /action:'save_rules'/);
});

test('master can edit over-norm and extra-event report bonuses', () => {
  assert.match(html, /data-tab="bonus"/);
  assert.match(html, /id="over-reports"/);
  assert.match(html, /id="over-bonus"/);
  assert.match(html, /id="event-start"/);
  assert.match(html, /id="event-bonus"/);
  assert.match(html, /action:'save_bonus_settings'/);
  assert.match(html, /bonus_settings:payload/);
});

test('norm settings inline scripts parse', () => {
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script);
  }
});
