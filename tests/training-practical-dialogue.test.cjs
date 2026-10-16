const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const center = fs.readFileSync(path.join(__dirname, '..', 'training-center.html'), 'utf8');
const curator = fs.readFileSync(path.join(__dirname, '..', 'training-curator.html'), 'utf8');

test('lecture test flow opens the embedded report before regular questions', () => {
  assert.match(
    center,
    /function beginTestFlow\(\)\{if\(currentPractical\?\.required&&!currentPractical\.completed\)renderPracticalTest\(\);else renderTest\(\)\}/,
  );
  assert.ok(center.indexOf('Практическая обработка обращения') < center.indexOf('function testQuestionHtml'));
  assert.match(center, /этап 1 из 2/);
  assert.match(center, /Перейти к обычным вопросам/);
});

test('report prototype follows the supplied game window controls', () => {
  for (const label of [
    'ПОДДЕРЖКА',
    'АДМИН-ПАНЕЛЬ',
    'Очередь обращений',
    'Информация об игроке',
    'В очереди',
    'Список очереди',
    'Закрыть обращение',
    'Наблюдать',
    'Телепортироваться к игроку',
    'Телепортировать игрока к себе',
    'Взять',
    'Что вы сделаете дальше?',
    'Учебный тренажёр обработки обращений',
  ]) {
    assert.ok(center.includes(label), `missing ${label}`);
  }
  assert.match(center, /reportTemplateToggle/);
  assert.match(center, /max_message_length\|\|128/);
  assert.match(center, /\/dialogue\/start/);
  assert.match(center, /\/dialogue\/step/);
  assert.match(center, /\/dialogue\/close/);
  assert.match(center, /data-report-choice/);
  assert.match(center, /practicalState\?\.player/);
  assert.match(center, /practicalPendingAction/);
});

test('curator chooses the final 0-5 score and a helper-facing feedback mode', () => {
  assert.match(curator, /Предварительная оценка ИИ/);
  assert.match(curator, /score-decision/);
  assert.match(curator, /awarded_points:awarded/);
  assert.match(curator, /Комментарий обязателен, если выставлен не максимальный балл/);
  assert.match(curator, /Отправить обратную связь Агенту Поддержки/);
  assert.match(curator, /Отправить свою обратную связь/);
  assert.match(curator, /feedback_mode:feedbackMode/);
  assert.match(curator, /feedback_text:feedbackMode==='custom'\?feedbackText:''/);
});
