const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../training-curator.html'), 'utf8');
const source = html.slice(html.indexOf('    function dailyReportingPanel('), html.indexOf('    function openEditor('));
function setup(enabled, allowed = true) {
  const calls = [];
  const context = vm.createContext({
    state: {permissions: {daily_reports_manage: allowed}, system: {daily_report_enabled: enabled}},
    setBusy() {}, async reload() {}, renderSettings() {}, tg: null,
    async api(url, body) { calls.push({url, body}); },
  });
  vm.runInContext(source, context);
  return {context, calls};
}

test('only owner sees the reporting switch', () => {
  assert.equal(setup(true, false).context.dailyReportingPanel(), '');
  const {context} = setup(true);
  context.state.system = null;
  assert.equal(context.dailyReportingPanel(), '');
});

test('older backend without the setting does not show a misleading switch', () => {
  assert.equal(setup(undefined).context.dailyReportingPanel(), '');
});

test('reporting switch reflects enabled and disabled states', () => {
  assert.match(setup(true).context.dailyReportingPanel(), /aria-checked="true"/);
  assert.match(setup(true).context.dailyReportingPanel(), /Отключить отчётность/);
  assert.match(setup(false).context.dailyReportingPanel(), /aria-checked="false"/);
  assert.match(setup(false).context.dailyReportingPanel(), /Включить отчётность/);
});

test('reporting action sends explicit desired state, safe for retries', async () => {
  const {context, calls} = setup(true);
  await context.systemAction('daily_report_set', {}, {enabled: false});
  assert.equal(calls[0].url, '/api/training/curator/system/action');
  assert.equal(calls[0].body.enabled, false);
  assert.equal(calls[0].body.action, 'daily_report_set');
});

test('preview API persists switch state through reload', async () => {
  const previewSource = html.slice(html.indexOf('    const previewState='), html.indexOf('    async function api('));
  const context = vm.createContext({structuredClone});
  vm.runInContext(previewSource, context);
  await context.previewApi('/system/action', {action: 'daily_report_set', enabled: false});
  assert.equal((await context.previewApi('/bootstrap')).system.daily_report_enabled, false);
});

test('curator inline scripts parse', () => {
  for (const [,source] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(source);
});
