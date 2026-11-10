const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../admin-task-marketplace.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '../admin-task-marketplace.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../admin-task-marketplace.css'), 'utf8');

test('additional assignments page stays behind Telegram and the protected API', () => {
  assert.match(script, /\/api\/admin\/tasks/);
  assert.match(script, /X-Telegram-Init-Data/);
  assert.match(html, /Раздел недоступен/);
  assert.match(html, /Для администраторов/);
  assert.doesNotMatch(html, /закрыт(?:ый|ому) тест/i);
});

test('all three agreed verification flows are present', () => {
  assert.match(script, /leadership_counter/);
  assert.match(script, /manual_review/);
  assert.match(script, /evidence_review/);
  assert.match(script, /Засчитать вход/);
  assert.match(html, /id="review-queue-list"/);
  assert.doesNotMatch(html, /id="leader-tabs"|>Без файлов<|>Со скринами</);
});

test('screenshots upload directly to object storage and rewards use a wallet', () => {
  assert.match(script, /method:\s*'PUT'/);
  assert.match(script, /confirm_evidence_upload/);
  assert.match(html, /Бонусный банк/);
  assert.match(html, /Бонус к индексу/);
  assert.match(script, /`withdraw:\$\{state.data.viewer.user_id\}/);
  assert.match(script, /operation_id:operationId/);
});

test('the picker uploads ten files and respects remaining assignment capacity', async () => {
  const source = script.match(/async function uploadEvidence\([\s\S]*?\n  }/)[0];
  const confirmed = [];
  const state = {data: {max_evidence_files: 10, evidence: [{assignment_id: 'other'}]}};
  const context = {
    state,
    compressImage: async name => ({name, type: 'image/webp', blob: {size: 1}}),
    api: async (action, payload) => {
      if (action === 'create_evidence_upload') {
        return {upload_url: '/storage', max_bytes: 5 * 1024 * 1024, evidence_id: payload.file_name};
      }
      assert.equal(action, 'confirm_evidence_upload');
      confirmed.push(payload.evidence_id);
    },
    fetch: async () => ({ok: true}),
  };
  vm.runInNewContext(source, context);
  const files = Array.from({length: 10}, (_, index) => `proof-${index}`);
  await context.uploadEvidence('task', files);
  assert.deepEqual(confirmed, files);

  state.data.evidence.push({assignment_id: 'task'});
  await assert.rejects(context.uploadEvidence('task', files), /не более 10 файлов/);
  assert.equal(confirmed.length, 10); // No partial upload on selection overflow.
  await context.uploadEvidence('task', files.slice(0, 9));
  assert.equal(confirmed.length, 19);
});

test('leadership entry retry reuses one idempotency key', () => {
  assert.match(script, /sessionStorage\.getItem\(operationName\)/);
  assert.match(script, /sessionStorage\.removeItem\(operationName\)/);
  assert.match(script, /result\.duplicate/);
});

test('take confirmation does not show an unnecessary comment field', () => {
  assert.match(script, /\$\('#reason-wrap'\)\.hidden = !reason/);
  assert.match(script, /title:'Взять задание\?'[^\n]+confirm:'Взять'/);
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.match(html, /admin-task-marketplace\.css\?v=20261103-1/);
});

test('task levels show XP progress and are configurable by master', () => {
  assert.match(html, /id="level-title"/);
  assert.match(html, /id="level-progress"/);
  assert.match(html, /data-tab="levels"/);
  assert.match(script, /save_level_settings/);
  assert.match(script, /data-level-xp/);
  assert.match(script, /data-level-multiplier/);
  assert.match(script, /reward_xp/);
  assert.match(css, /\.level-card/);
});

test('master can define and edit exact instructions for every task', () => {
  assert.match(html, /id="create-description"/);
  assert.match(html, /id="create-instructions"/);
  assert.match(script, /function rulesBlock/);
  assert.match(script, /Подробное описание и правила/);
  assert.match(script, /update_template/);
  assert.match(script, /data-edit-template/);
  assert.match(script, /data-toggle-template/);
  assert.match(css, /\.task-rules/);
});

test('admin task cards do not expose internal verification mode labels', () => {
  const source = script.match(/function templateCard[\s\S]*?\n  }/)[0];
  assert.doesNotMatch(source, /typeLabel\(/);
  assert.match(html, /admin-task-marketplace\.js\?v=20261110-1/);
});

test('hot cards use custom content, hide the player until take, and keep sparks running', () => {
  const urgentCss = fs.readFileSync(path.join(__dirname, '../admin-task-marketplace-urgent.css'), 'utf8');
  assert.match(html, /id="create-urgent"/);
  assert.match(html, /id="create-player"/);
  assert.match(urgentCss, /animation:hot-border-spark [^;{}]+infinite/);
  assert.match(urgentCss, /prefers-reduced-motion:reduce/);
  const source = ['templateCard', 'urgentAssignmentDetails'].map(name =>
    script.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n  }`))[0]).join('\n');
  const context = {
    esc: value => String(value).replaceAll('<', '&lt;'),
    state: {taking:false}, slotOccupied: () => false,
    urgentBadge: () => 'Горячее', urgentRewards: () => '',
    rulesBlock: () => '', dateText: () => '22:00 МСК',
  };
  vm.runInNewContext(source, context);
  const item = {is_urgent:1,title:'Моё название',description:'Мой текст',template_id:'a',has_player:true,player_nickname:'Hidden_Nickname',private_details:'<private>'};
  const card = context.templateCard(item, new Set());
  assert.match(card, /Моё название.*Мой текст/);
  assert.match(card, /hot-sparks/);
  assert.match(card, /Ник игрока откроется после принятия/);
  assert.doesNotMatch(card, /Hidden_Nickname|private|античит|сигнал/i);
  const busy = context.templateCard({...item,publication_available:false}, new Set());
  assert.match(busy, /Уже в работе/);
  assert.doesNotMatch(busy, /hot-sparks|Hidden_Nickname/);
  const taken = context.urgentAssignmentDetails(item);
  assert.match(taken, /<code dir="ltr">Hidden_Nickname<\/code>/);
  assert.match(taken, /&lt;private>/);
});

test('limited assignments show reward caps without an automatic timer', () => {
  assert.match(script, /function timeRuleBlock/);
  assert.match(script, /limit_remaining/);
  assert.doesNotMatch(script, /submit_available_at/);
  assert.doesNotMatch(script, /timedSubmitState/);
  assert.match(css, /\.time-rule/);
  assert.match(css, /\.time-hint/);
});

test('master settings contain templates, levels and configurable task limits', () => {
  assert.match(html, /data-role="settings"[^>]*hidden>\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438/);
  assert.match(html, /id="settings-view"/);
  assert.match(html, /id="create-limit"/);
  assert.match(html, /id="create-limit-period"/);
  assert.match(script, /viewer\.is_master/);
  assert.match(script, /completion_limit/);
  assert.match(script, /limit_period/);
});

test('tasks disappear from available list after their configured limit is exhausted', () => {
  assert.match(script, /templates\s*=\s*\(state.data.templates \|\| \[\]\)\.filter/);
  assert.match(script, /Number\(item\.limit_remaining\)\s*>\s*0/);
  assert.match(script, /filtered\.map/);
});

test('pending level-up is celebrated once and acknowledged through the API', () => {
  assert.match(html, /id="level-up-dialog"/);
  assert.match(html, /id="level-up-multiplier"/);
  assert.match(script, /pending_level_up/);
  assert.match(script, /ack_level_up/);
  assert.match(script, /notificationOccurred\?\.\('success'\)/);
  assert.match(css, /@keyframes level-card-in/);
  assert.match(css, /\.level-particles/);
});

test('marketplace script parses', () => {
  new vm.Script(script);
});

test('old task history is loaded in pages without hiding earlier records', () => {
  assert.match(script, /history_next_cursor/);
  assert.match(script, /data-history-more/);
  assert.match(script, /api\('history', \{before:/);
  assert.match(script, /known\.has\(item\.assignment_id\)/);
});

test('approval confirmation calls the reward destination a bank', () => {
  assert.match(script, /Репорты поступят в банк, а процент применится к индексу\./);
  assert.doesNotMatch(script, /Репорты поступят в кошелёк/);
});
