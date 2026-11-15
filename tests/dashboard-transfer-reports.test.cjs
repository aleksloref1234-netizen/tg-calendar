const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dashboard.html'), 'utf8');

test('dashboard contains a transfer reports card sourced from the API', () => {
  assert.match(html, /id="transfer-reports-card"[^>]*data-ui-block="transfer_reports"[^>]*hidden/);
  assert.match(html, /Репорты к переносу на следующую должность/);
  assert.match(html, /Number\(d\.transfer_reports\)/);
  assert.match(html, /transferReportsCard\.hidden = transferReports <= 0/);
});
