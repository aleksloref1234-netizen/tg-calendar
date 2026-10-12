const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dashboard.html'), 'utf8');

test('dashboard shows the index composition and a separate help rating card', () => {
  assert.match(html, /Индекс успеваемости/);
  assert.match(html, /Рейтинг качества помощи/);
  assert.match(html, /performance-fill-norm/);
  assert.match(html, /performance-fill-rating/);
  assert.match(html, /performance-fill-meetings/);
  assert.match(html, /performance-fill-discipline/);
  assert.match(html, /performance-fill-violations/);
  assert.doesNotMatch(html, /Основано на .*оценк/);
});

test('factor vessels fill from live component scores and show earned points', () => {
  const nodes = new Map();
  const document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, {innerText: '', style: {}});
      return nodes.get(id);
    },
  };
  const source = html.slice(
    html.indexOf('        function renderPerformanceIndex('),
    html.indexOf('        function renderTestResults('),
  );
  const context = vm.createContext({document, Math, Number, String, Array, Map});
  vm.runInContext(source, context);

  context.renderPerformanceIndex({
    has_data: true,
    value: 87,
    help_rating: 4.7,
    components: [
      {key: 'norm', available: true, score_percent: 80, points: 32, max_points: 40},
      {key: 'rating', available: true, score_percent: 94, points: 23.5, max_points: 25},
      {key: 'meetings', available: true, score_percent: 75, points: 15, max_points: 20},
      {key: 'discipline', available: true, score_percent: 100, points: 10, max_points: 10},
      {key: 'violations', available: true, score_percent: 60, points: 3, max_points: 5},
    ],
  });

  assert.equal(nodes.get('performance-value').innerText, '87%');
  assert.equal(nodes.get('performance-fill-norm').style.width, '80%');
  assert.equal(nodes.get('performance-fill-rating').style.width, '94%');
  assert.equal(nodes.get('performance-fill-violations').style.width, '60%');
  assert.equal(nodes.get('performance-points-rating').innerText, '23,5% из 25%');
  assert.equal(nodes.get('performance-contribution').innerText, 'Рейтинг даёт 23,5% из 25%');
  assert.equal(nodes.get('help-rating-value').innerText, '4,7');
  assert.equal(nodes.get('help-rating-level').innerText, 'Высокий');
  assert.equal(nodes.get('help-rating-fill').style.width, '94%');
});

test('unavailable components stay empty instead of pretending to be zero', () => {
  const nodes = new Map();
  const document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, {innerText: '', style: {}});
      return nodes.get(id);
    },
  };
  const source = html.slice(
    html.indexOf('        function renderPerformanceIndex('),
    html.indexOf('        function renderTestResults('),
  );
  const context = vm.createContext({document, Math, Number, String, Array, Map});
  vm.runInContext(source, context);

  context.renderPerformanceIndex({has_data: false, value: null, help_rating: null, components: []});

  assert.equal(nodes.get('performance-value').innerText, '—');
  assert.equal(nodes.get('performance-fill-norm').style.width, '0%');
  assert.equal(nodes.get('performance-points-norm').innerText, '— из 40%');
  assert.equal(nodes.get('help-rating-value').innerText, '—');
  assert.equal(nodes.get('help-rating-level').innerText, 'Нет данных');
});
