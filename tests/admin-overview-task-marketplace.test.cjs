const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../admin-overview.html'), 'utf8');

test('additional tasks entry is hidden until the backend grants access', () => {
  assert.match(
    html,
    /id="admin-task-marketplace-entry"[^>]*hidden/,
  );
  assert.match(
    html,
    /applyFeatureAccess\(data\.feature_access\|\|\{\}\)/,
  );
  assert.match(
    html,
    /access\.admin_task_marketplace!==true/,
  );
});

test('additional tasks entry opens the marketplace page', () => {
  assert.match(html, />Дополнительные задания</);
  assert.match(
    html,
    /AdminStats\.navigate\('admin-task-marketplace\.html'\)/,
  );
});

test('admin overview inline scripts parse', () => {
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script);
  }
});
