const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../candidate-center.html'), 'utf8');

test('candidate center exposes only the approved, call and appointed stages', () => {
  assert.match(html, /Заявка одобрена/);
  assert.match(html, />Обзвон</);
  assert.match(html, /Назначены/);
  assert.doesNotMatch(html, /data-filter="connection"/);
  assert.doesNotMatch(html, /Проверка подключения/);
});

test('candidate removal contains the agreed reasons and conditional other text', () => {
  assert.match(html, /Снять с кандидатуры/);
  assert.match(html, /reasonCode==='other'&&!reasonText/);
  assert.match(html, /\$\('reason-text'\)\.required=other/);
  assert.match(html, /application_id:selected\.application_id/);
});

test('candidate path stages are automatic and removal keeps an idempotency key', () => {
  assert.match(html, /action:'snapshot'/);
  assert.match(html, /action:'remove'/);
  assert.match(html, /request_id:requestIdFor\(selected\.application_id\)/);
  assert.match(html, /localStorage\.setItem\(key,created\)/);
  assert.match(html, /crypto\?\.randomUUID/);
});

test('candidate removal is accepted into a background queue and rendered optimistically', () => {
  assert.match(html, /candidate_nick:selected\.candidate_nick/);
  assert.match(html, /applyQueuedRemoval\(selected,result\.event\|\|\{\}\)/);
  assert.match(html, /Передаю в очередь/);
  assert.match(html, /Ожидает записи в таблицу/);
  assert.match(html, /Запись появится в таблице автоматически/);
});

test('candidate center requires Telegram initData and protected API', () => {
  assert.match(html, /\/api\/candidates/);
  assert.match(html, /X-Telegram-Init-Data/);
  assert.match(html, /Откройте центр кандидатов кнопкой из Telegram-бота/);
});

test('candidate center inline scripts parse', () => {
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script);
  }
});
