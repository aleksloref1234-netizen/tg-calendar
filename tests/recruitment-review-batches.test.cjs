const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../recruitment-analytics.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const flush = () => new Promise(resolve => setImmediate(resolve));

function preview(provideBatches) {
  const requests = [];
  const nodes = new Map();
  const element = () => ({
    value: '', innerHTML: '', hidden: false, listeners: {},
    classList: {toggle() {}},
    addEventListener(event, listener) { this.listeners[event] = listener; },
  });
  function getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  }
  const buttons = Object.fromEntries(['7', '30', '90', 'month', 'custom'].map(period =>
    [period, {...element(), dataset: {period}}]
  ));
  class FixedDate extends Date {
    // Still the 22nd in Moscow, already the 23rd in Novosibirsk.
    static now() { return Date.parse('2026-11-22T20:30:00Z'); }
  }
  const document = {
    getElementById,
    querySelectorAll: selector => selector === '.period' ? Object.values(buttons) : [],
  };
  const fetch = async (_url, request) => {
    const {date_from, date_to} = JSON.parse(request.body);
    requests.push([date_from, date_to]);
    const review_batches = provideBatches(date_from, date_to);
    return {ok: true, json: async () => ({
      status: 'success',
      data: {
        period: {date_from, date_to},
        application_period: {applications_count: 0},
        review_batches,
      },
    })};
  };
  vm.runInNewContext(script, {
    window: {Telegram: {WebApp: {initData: 'fixture', ready() {}, expand() {}}}},
    document, fetch, AbortController, Date: FixedDate,
    setTimeout: () => 1, clearTimeout() {},
  });
  return {
    requests,
    select: async period => {buttons[period].listeners.click(); await flush();},
    chart: () => getElementById('review-batches-chart').innerHTML,
  };
}

test('7, 30 and 90 days recalculate both shown dates and vertical scale', async () => {
  const rows = [
    {date: '2026-11-22', count: 15},
    {date: '2026-09-02', count: 51},
    {date: '2026-11-19', count: 10},
    {date: '2026-10-30', count: 27},
  ];
  const page = preview((from, to) => rows.filter(row => from <= row.date && row.date <= to));
  await flush();
  assert.deepEqual(page.requests, [['2026-10-24', '2026-11-22']]);
  assert.match(page.chart(), /--review-days:3/);
  assert.match(page.chart(), /<span>30<\/span><span>20<\/span><span>10<\/span><span>0<\/span>/);
  assert.match(page.chart(), /Заявок за период: <b>52<\/b>/);

  await page.select('7');
  assert.deepEqual(page.requests.at(-1), ['2026-11-16', '2026-11-22']);
  assert.deepEqual([...page.chart().matchAll(/datetime="([^"]+)"/g)].map(m => m[1]), ['2026-11-19', '2026-11-22']);
  assert.match(page.chart(), /<span>15<\/span><span>10<\/span><span>5<\/span><span>0<\/span>/);
  assert.match(page.chart(), /--review-height:100%/);
  assert.match(page.chart(), /Заявок за период: <b>25<\/b>/);

  await page.select('90');
  assert.deepEqual(page.requests.at(-1), ['2026-08-25', '2026-11-22']);
  assert.match(page.chart(), /--review-days:4/);
  assert.match(page.chart(), /<span>60<\/span><span>40<\/span><span>20<\/span><span>0<\/span>/);
  assert.match(page.chart(), /Заявок за период: <b>103<\/b>/);
});

test('missing history is distinguished from a period with no review batches', async () => {
  const missing = preview(() => undefined);
  const empty = preview(() => []);
  await flush();
  assert.match(missing.chart(), /пока недоступны/);
  assert.match(empty.chart(), /нет заявок с датой внесения/);
  assert.doesNotMatch(missing.chart()+empty.chart(), /class="review-series"/);
});

test('bad values cannot become bars or HTML', async () => {
  const page = preview(() => [
    {date: '2026-11-20', count: 0},
    {date: '<img src=x>', count: 3},
    {date: '2026-11-21', count: '1'},
    {date: '2026-11-22', count: 1},
  ]);
  await flush();
  assert.match(page.chart(), /--review-days:1/);
  assert.match(page.chart(), /<span>1<\/span><span>0<\/span>/);
  assert.doesNotMatch(page.chart(), /<img|2026-11-20|2026-11-21/);
});
