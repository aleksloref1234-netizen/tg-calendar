const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'training-curator.html'),
  'utf8',
);

test('review cards identify the role of the person who submitted the test', () => {
  assert.match(html, /studentRole=roleLabels\[user\.role\]/);
  assert.match(html, /\$\{esc\(studentRole\)\} · \$\{esc\(lesson\.title/);
});

test('review queue explains that curators can review every support agent', () => {
  assert.match(html, /Куратору доступны тесты всех Агентов Поддержки/);
});
