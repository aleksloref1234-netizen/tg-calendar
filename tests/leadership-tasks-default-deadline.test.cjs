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

test('leadership tasks use midnight as the default deadline', () => {
  assert.match(html, /id="task-due"[^>]*value="00:00"/);
  assert.match(script, /const DEFAULT_DUE_TIME = '00:00'/);
  assert.doesNotMatch(script, /task\([^\n]+, '[0-2][0-9]:[0-5][0-9]',/);
  assert.doesNotMatch(script, /task-due'\)\.value \|\| '20:00'/);
});
