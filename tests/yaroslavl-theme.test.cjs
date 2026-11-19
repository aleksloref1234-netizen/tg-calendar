const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');

const pages = [
  'app', 'admin-overview', 'admin-task-marketplace', 'calls-calendar', 'calls-statistics',
  'candidate-center', 'complaints', 'dashboard', 'duties', 'inactive-overview', 'index',
  'leadership-tasks-master-preview', 'leadership-tasks-preview', 'leadership-tasks-team-preview',
  'logs', 'norm-check', 'norm-settings', 'recruitment-analytics', 'supervisors', 'training-center',
  'training-curator', 'training-editor', 'violations', 'webapp-settings',
];

test('published Mini App entry pages opt into the same versioned shell and module theme', () => {
  for (const page of pages) {
    const html = read(page + '.html');
    assert.match(html, /<html\b[^>]*\bdata-ac-theme="(?:shell|module|paper|tasks)"/, page);
    assert.match(html, /<link rel="stylesheet" href="yaroslavl-theme\.css\?v=20261119-1">/, page);
    assert.doesNotMatch(html, /<meta name="theme-color" content="(?!#08080a)/, page);
  }
  const css = read('yaroslavl-theme.css');
  assert.match(css, /--ac-red:\s*#d80000/);
  assert.match(css, /--ac-bg:\s*#08080a/);
  assert.match(css, /\.app-dock\s*\{[^}]*backdrop-filter:\s*blur\(/);
  assert.match(read('admin-app-modules.css'), /background:var\(--ac-canvas\)/);
  assert.match(read('admin-app-bridge.js'), /admin-app-modules\.css\?v=20261119-1/);
});

test('the approved Black Russia mark is a local, passive image with its original proportions', () => {
  const svg = read('yaroslavl-black-russia.svg');
  assert.match(svg, /viewBox="0 0 1200 216"/);
  assert.doesNotMatch(svg, /<script\b|<foreignObject\b|\bonload\s*=/i);
  const png = Buffer.from(svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)"/)[1], 'base64');
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 216);
});
