const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dashboard.html'), 'utf8');

test('personal statistics keeps the additional tasks button hidden by default', () => {
  assert.match(
    html,
    /id="admin-task-marketplace-entry"[^>]*hidden/,
  );
  assert.match(
    html,
    /applyFeatureAccess\(d\.feature_access \|\| \{\}\)/,
  );
  assert.match(html, /access\.admin_task_marketplace !== true/);
});

test('personal statistics button opens the additional tasks page', () => {
  assert.match(html, />Дополнительные задания</);
  assert.match(
    html,
    /window\.location\.href = 'admin-task-marketplace\.html'/,
  );
});

test('dashboard inline scripts still parse', () => {
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script);
  }
});
