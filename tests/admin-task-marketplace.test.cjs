const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../admin-task-marketplace.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '../admin-task-marketplace.js'), 'utf8');

test('additional assignments page stays behind Telegram and the protected API', () => {
  assert.match(script, /\/api\/admin\/tasks/);
  assert.match(script, /X-Telegram-Init-Data/);
  assert.match(html, /Доступ пока закрыт/);
  assert.match(html, /Закрытый тест/);
});

test('all three agreed verification flows are present', () => {
  assert.match(script, /leadership_counter/);
  assert.match(script, /manual_review/);
  assert.match(script, /evidence_review/);
  assert.match(script, /Засчитать вход/);
  assert.match(html, /Без файлов/);
  assert.match(html, /Со скринами/);
});

test('screenshots upload directly to object storage and rewards use a wallet', () => {
  assert.match(script, /method:\s*'PUT'/);
  assert.match(script, /confirm_evidence_upload/);
  assert.match(html, /Доступно к выводу/);
  assert.match(html, /Добавлено к индексу/);
  assert.match(script, /operation_id:`withdraw:/);
});

test('leadership entry retry reuses one idempotency key', () => {
  assert.match(script, /sessionStorage\.getItem\(operationName\)/);
  assert.match(script, /sessionStorage\.removeItem\(operationName\)/);
  assert.match(script, /result\.duplicate/);
});

test('marketplace script parses', () => {
  new vm.Script(script);
});
