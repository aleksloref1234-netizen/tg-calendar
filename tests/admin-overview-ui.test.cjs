const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../admin-overview.html'), 'utf8');

test('admin overview has a separate reduced norm category', () => {
  assert.match(html, /Администраторы с сокращённой нормой/);
  assert.match(html, /data-zone="reduced"/);
  assert.match(html, /zone==='reduced'\?item\.reduced_norm/);
  assert.match(html, /data\.reduced_norm_count/);
});

test('reduced norm admins have a visible card marker', () => {
  assert.match(html, /Сокращённая норма −50%/);
  assert.match(html, /class="norm-tag"/);
});

test('admin overview inline scripts parse', () => {
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script);
  }
});
