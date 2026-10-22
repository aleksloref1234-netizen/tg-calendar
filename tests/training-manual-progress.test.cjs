const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const centerHtml = fs.readFileSync(path.join(__dirname, '../training-center.html'), 'utf8');
const curatorHtml = fs.readFileSync(path.join(__dirname, '../training-curator.html'), 'utf8');

const lessonButtonSource = centerHtml.slice(
  centerHtml.indexOf('    function lessonTestButtonHtml('),
  centerHtml.indexOf('    function bindLessonTestButton('),
);

function lessonButton(bank) {
  const context = vm.createContext({currentBank: bank});
  vm.runInContext(lessonButtonSource, context);
  return context.lessonTestButtonHtml();
}

test('completed lesson stays readable without offering a duplicate test', () => {
  const html = lessonButton({passed: true, last_status: 'passed', available: false, ready: true});
  assert.match(html, /disabled/);
  assert.match(html, /лекцию можно перечитать/);
  assert.doesNotMatch(html, /id="startTest"/);
});

test('reset lesson offers its test again', () => {
  const html = lessonButton({passed: false, last_status: '', available: true, ready: true});
  assert.match(html, /id="startTest"/);
  assert.match(html, /Пройти тест/);
});

test('manual progress controls are owner-only and call the dedicated endpoint', () => {
  assert.match(curatorHtml, /progress_manage:true/);
  assert.match(curatorHtml, /state\.permissions\.progress_manage/);
  assert.match(curatorHtml, /\/api\/training\/curator\/progress\/lesson/);
  assert.match(curatorHtml, /data-lesson-progress="pass"/);
  assert.match(curatorHtml, /data-lesson-progress="reset"/);
});

test('updated training pages keep valid inline JavaScript', () => {
  for (const html of [centerHtml, curatorHtml]) {
    for (const [,source] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      new vm.Script(source);
    }
  }
});
