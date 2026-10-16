const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(
  path.join(root, 'leadership-tasks-master-preview.html'),
  'utf8'
);
const script = fs.readFileSync(
  path.join(root, 'leadership-tasks-preview.js'),
  'utf8'
);

test('master task card exposes a reasoned completion revoke flow', () => {
  assert.match(html, /id="revoke-task-completion"[^>]*hidden/);
  assert.match(html, /id="revoke-completion-reason"[^>]*maxlength="1000"/);
  assert.match(html, /id="confirm-revoke-completion"/);
  assert.match(script, /item\.status !== 'done'/);
  assert.match(script, /apiRequest\('revoke_completion'/);
  assert.match(script, /Укажите причину отмены выполнения/);
});
