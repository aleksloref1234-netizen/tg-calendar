const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../admin-task-marketplace.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '../admin-task-marketplace.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../admin-task-marketplace.css'), 'utf8');

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

test('take confirmation does not show an unnecessary comment field', () => {
  assert.match(script, /\$\('#reason-wrap'\)\.hidden = !reason/);
  assert.match(script, /title:'Взять задание\?'[^\n]+confirm:'Взять'/);
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.match(html, /admin-task-marketplace\.css\?v=20261020-2/);
});

test('task levels show XP progress and are configurable by master', () => {
  assert.match(html, /id="level-title"/);
  assert.match(html, /id="level-progress"/);
  assert.match(html, /data-tab="levels"/);
  assert.match(script, /save_level_settings/);
  assert.match(script, /data-level-xp/);
  assert.match(script, /data-level-multiplier/);
  assert.match(script, /reward_xp/);
  assert.match(css, /\.level-card/);
});

test('master can define and edit exact instructions for every task', () => {
  assert.match(html, /id="create-description"/);
  assert.match(html, /id="create-instructions"/);
  assert.match(script, /function rulesBlock/);
  assert.match(script, /Подробное описание и правила/);
  assert.match(script, /update_template/);
  assert.match(script, /data-edit-template/);
  assert.match(script, /data-toggle-template/);
  assert.match(css, /\.task-rules/);
});

test('admin task cards do not expose internal verification mode labels', () => {
  const source = script.match(/function templateCard[\s\S]*?\n  }/)[0];
  assert.doesNotMatch(source, /typeLabel\(/);
  assert.match(html, /admin-task-marketplace\.js\?v=20261020-3/);
});

test('marketplace script parses', () => {
  new vm.Script(script);
});
