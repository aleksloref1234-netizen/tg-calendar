const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../training-curator.html'), 'utf8');
const source = html.slice(html.indexOf('    function courseAccessButton('), html.indexOf('    async function changeLessonProgress('));
const esc = value => String(value ?? '').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

function fixture(permission = true) {
  const reason = {value: 'Досрочное открытие'};
  const calls = [];
  let modal = '';
  const student = {user: {telegram_id: '1001', display_name: '<Helper>'}, lessons: [
    {lesson_id:'lecture_3', order:'3', title:'Лекция 3', status:'', available:false, personal_access:'auto'},
  ], tests:{final:{bank_id:'final_custom', name:'Финальный тест', active:true, personal_access:'open', available:true}}};
  const context = vm.createContext({
    state:{permissions:{progress_manage:permission, course_access_manage:permission}, overview:{students:[student]}},
    esc, lessonProgressLabel:()=> 'Не открыта', showModal:value=> {modal=value;},
    document:{querySelectorAll:()=>[]}, $:()=>reason,
    confirm:()=>true, setBusy:()=>{}, api:async(...args)=>{calls.push(args);},
    reload:async()=>{}, renderOverview:()=>{}, tg:{showAlert:()=>{}},
  });
  vm.runInContext(source, context);
  return {context, student, calls, modal:()=>modal};
}

test('owner has separate open/automatic buttons for a lesson and a real final bank', () => {
  const f = fixture();
  f.context.showLessonProgressModal('1001');
  assert.match(f.modal(), /Лекции и финальный тест/);
  assert.match(f.modal(), /data-course-access="open"[^>]+data-target-type="lesson"/);
  assert.match(f.modal(), /data-course-access="auto"[^>]+data-target-id="final_custom"/);
  assert.match(f.modal(), /Открыть вручную/);
  assert.match(f.modal(), /Вернуть автоматику/);
  assert.match(f.modal(), /не засчитывает прохождение и не меняет расписание/);
  assert.match(f.modal(), /&lt;Helper>/);
  assert.match(f.modal(), /data-lesson-progress="pass"/);
});

test('non-owner has neither manual-access controls nor progress modal', () => {
  const f = fixture(false);
  assert.equal(f.context.courseAccessButton('1001','lesson','lecture_3'), '');
  f.context.showLessonProgressModal('1001');
  assert.equal(f.modal(), '');
});

test('manual opening calls only the access endpoint and preserves results', async () => {
  const f = fixture(), before = JSON.stringify(f.student);
  await f.context.changeCourseAccess({dataset:{courseAccess:'open', telegramId:'1001', targetType:'final_test', targetId:'final_custom'}});
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], '/api/training/curator/access/course');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0][1])), {telegram_id:'1001', target_type:'final_test', target_id:'final_custom', state:'open', reason:'Досрочное открытие'});
  assert.equal(JSON.stringify(f.student), before);
});

test('cancelled manual access does not submit a change', async () => {
  const f = fixture();
  f.context.confirm=()=>false;
  await f.context.changeCourseAccess({dataset:{courseAccess:'auto'}});
  assert.equal(f.calls.length, 0);
});

test('inactive or unconfigured final tests are not offered an open button', () => {
  const f=fixture();
  f.student.tests.final.active=false;
  f.context.showLessonProgressModal('1001');
  assert.match(f.modal(), /Выключен в настройках курса/);
  assert.doesNotMatch(f.modal(), /data-target-type="final_test"/);
  delete f.student.tests.final.bank_id;
  f.context.showLessonProgressModal('1001');
  assert.match(f.modal(), /Финальный тест ещё не настроен/);
});
