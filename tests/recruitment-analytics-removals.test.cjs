const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../recruitment-analytics.html'), 'utf8');

test('recruitment analytics shows removals from the candidate path', () => {
  assert.match(html, /item\.path_removal/);
  assert.match(html, /Снят с кандидатуры:/);
  assert.match(html, /path_removal\.stage_label/);
  assert.match(html, /path_removal\.curator_nick/);
  assert.doesNotMatch(html, /p\.removed_from_path/);
});

test('removed candidates receive the red status style', () => {
  assert.match(html, /item\.path_removal\?'red'/);
});

test('recruitment analytics inline scripts parse after removal integration', () => {
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script);
  }
});
