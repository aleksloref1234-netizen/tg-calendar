const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../calls-statistics.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('const API_URL'));

function harness(search = '') {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {hidden: false, textContent: '', classList: {toggle() {}}, addEventListener() {}});
    return elements.get(id);
  };
  let requests = [];
  const sandbox = {
    window: {Telegram: {WebApp: {initData: 'signed-data', ready() {}, expand() {}}}},
    location: {search}, URLSearchParams, AbortController, setTimeout, clearTimeout, console,
    document: {getElementById: get, querySelectorAll: () => []},
    fetch: async (url, options) => {
      requests.push({url, options});
      return {ok: true, json: async () => ({status: 'success', data: {periods: {report_day: {days: 1, date_from: '28.10.2026', total: 5}}}})};
    },
  };
  // Keep the complete function definitions; omit only the bottom event wiring.
  const source = script.slice(0, script.lastIndexOf("document.querySelectorAll('.period').forEach(button => {"));
  vm.runInNewContext(source + `
    renderAll = () => {};
    globalThis.api = {
      getPeriodData, renderOverview, load,
      setData: value => data = value,
      setPeriod: value => activePeriod = value,
    };`, sandbox);
  return {api: sandbox.api, elements, requests};
}

test('daily selectors exist and the entire page script parses', () => {
  for (const period of ['today', 'yesterday', 'before_yesterday']) assert.ok(html.includes(`data-period="${period}"`));
  new vm.Script(script);
});

test('choosing a daily period uses existing response data with no extra requests', () => {
  const h = harness();
  h.api.setData({periods: {today: {total: 2}, yesterday: {total: 7}}});
  h.api.setPeriod('yesterday');
  assert.equal(h.api.getPeriodData().total, 7);
  h.api.setPeriod('today');
  assert.equal(h.api.getPeriodData().total, 2);
  assert.equal(h.requests.length, 0);
});

test('an image link carries the exact report date and signed Telegram access', async () => {
  const h = harness('?day=2026-10-28');
  await h.api.load();
  assert.equal(h.requests.length, 1);
  assert.match(h.requests[0].url, /\?day=2026-10-28$/);
  assert.equal(h.requests[0].options.headers['X-Telegram-Init-Data'], 'signed-data');
  assert.equal(h.elements.get('report-day').hidden, false);
  assert.equal(h.elements.get('report-day').textContent, '28.10.2026');
  assert.equal(h.api.getPeriodData().total, 5);
});
