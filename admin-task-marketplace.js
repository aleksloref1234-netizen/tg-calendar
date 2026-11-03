(() => {
  'use strict';

  const API_URL = 'https://tg-admin-bot-1k1g.onrender.com/api/admin/tasks';
  const tg = window.Telegram?.WebApp;
  const state = { data: null, role: 'admin', adminTab: 'available', settingsTab: 'templates', levelUpShowing: '' };
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const dateText = value => value ? new Intl.DateTimeFormat('ru-RU', {timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'}).format(new Date(value)) + ' МСК' : 'Без ограничения';
  function moscowInput(value) {
    if (!value) return '';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(part => [part.type,part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }
  function nightFields(item, review = false) {
    if (!item.reward_steps?.length || (!review && item.status !== 'in_progress')) return '';
    return `<div class="effort-fields"><label>${review ? 'Подтверждённые' : 'Выполненные'} полные часы<select data-effort="${esc(item.assignment_id)}">${item.reward_steps.map((_,index) => `<option value="${index+1}" ${Number(item.reward_units || 1) === index+1 ? 'selected' : ''}>${index+1} ч.</option>`).join('')}</select></label><label>Дата начала ночи<input type="date" data-work-period="${esc(item.assignment_id)}" value="${esc(item.work_period || '')}"></label><small>Ночь: 22:00–06:00 МСК. Сумма рассчитывается по уже оплаченным часам этой ночи. Время и условия проверяет куратор по скриншотам.</small></div>`;
  }
  function effortPayload(id) {
    const hours = document.querySelector(`[data-effort="${CSS.escape(id)}"]`);
    const day = document.querySelector(`[data-work-period="${CSS.escape(id)}"]`);
    if (!hours) return {};
    if (!day?.value) throw new Error('Укажите дату начала ночного дежурства.');
    return {reward_units:Number(hours.value),work_period:day.value};
  }

  tg?.ready();
  tg?.expand();

  async function api(action, payload = {}) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': tg?.initData || ''
      },
      body: JSON.stringify({ action, ...payload })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.status !== 'success') {
      const error = new Error(body.message || 'Не удалось выполнить операцию.');
      error.status = response.status;
      throw error;
    }
    return body.data;
  }

  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.hidden = true; }, 3200);
  }

  function showPendingLevelUp() {
    const event = state.data?.pending_level_up;
    if (!event || state.levelUpShowing === event.assignment_id) return;
    const before = event.from_level || {};
    const after = event.to_level || {};
    const multiplier = Number(after.reward_multiplier || 1).toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    $('#level-up-title').textContent = after.title || 'Новый уровень';
    $('#level-up-from').textContent = before.title || 'Предыдущий уровень';
    $('#level-up-to').textContent = after.title || 'Новый уровень';
    $('#level-up-xp').textContent = `${Number(event.xp || 0)} XP`;
    $('#level-up-multiplier').textContent = `×${multiplier}`;
    $('#level-up-message').textContent = event.manual ? 'Master ID повысил ваш уровень. Новые задания будут учитывать новый коэффициент.' : `Уровень повышен за задание «${event.task_title || 'Дополнительное задание'}». Новые задания теперь приносят больше бонусных репортов.`;
    state.levelUpShowing = event.assignment_id;
    const dialog = $('#level-up-dialog');
    dialog.classList.remove('celebrate');
    void dialog.offsetWidth;
    dialog.classList.add('celebrate');
    dialog.showModal();
    tg?.HapticFeedback?.notificationOccurred?.('success');
  }

  async function reload({ quiet = false } = {}) {
    try {
      state.data = await api('bootstrap');
      if (state.role === 'settings' && !state.data.viewer.is_master) state.role = 'admin';
      $('#loading-gate').hidden = true;
      $('#closed-gate').hidden = true;
      $('#app').hidden = false;
      $('#role-switch').hidden = !state.data.viewer.is_leader;
      $('#settings-role').hidden = !state.data.viewer.is_master;
      render();
      showPendingLevelUp();
    } catch (error) {
      $('#loading-gate').hidden = true;
      $('#app').hidden = true;
      $('#closed-gate').hidden = false;
      $('#closed-message').textContent = error.message || 'Раздел пока недоступен.';
      if (!quiet && error.status !== 403 && error.status !== 404) toast(error.message);
    }
  }

  function typeLabel(mode) {
    return ({
      leadership_counter: 'Отметки руководства',
      manual_review: 'Ручная проверка',
      evidence_review: 'Проверка со скриншотами'
    })[mode] || 'Проверка';
  }

  function statusLabel(status) {
    return ({
      in_progress: 'В работе', pending_review: 'На проверке', approved: 'Выполнено',
      rejected: 'Отклонено', expired: 'Истёк срок', cancelled:'Отменено', revoked:'Одобрение отменено'
    })[status] || status;
  }

  function statusClass(status) {
    if (status === 'approved') return 'ok';
    if (status === 'pending_review') return 'wait';
    if (['rejected', 'expired', 'cancelled', 'revoked'].includes(status)) return 'bad';
    return '';
  }

  function progressBlock(item) {
    const target = Math.max(1, Number(item.target_count || 1));
    const progress = Math.min(target, Number(item.progress || 0));
    return `<div class="progress-head"><span>Прогресс</span><b>${progress} из ${target}</b></div><div class="progress"><i style="width:${Math.round(progress / target * 100)}%"></i></div>`;
  }

  function reward(item) {
    const multiplier = Number(item.reward_multiplier || 1);
    const multiplierLabel = multiplier > 1 ? ` · ×${multiplier.toLocaleString('ru-RU', {maximumFractionDigits:2})}` : '';
    const reportLabel = item.reward_steps?.length && !['pending_review','approved','revoked'].includes(item.status)
      ? 'Репорты по подтверждённым часам' : `+${Number(item.reward_reports || 0)} репортов${multiplierLabel}`;
    return `<div class="reward-row"><span class="reward">${reportLabel}</span><span class="reward">+${Number(item.reward_index || 0).toLocaleString('ru-RU')}% к индексу</span><span class="reward">+${Number(item.reward_xp || 10)} XP</span></div>`;
  }

  function rulesBlock(item) {
    return policyBlock(item) + (item.instructions ? `<details class="task-rules"><summary>Подробное описание и правила</summary><p>${esc(item.instructions)}</p></details>` : '');
  }

  function policyBlock(item) {
    const pieces = [];
    if (item.global_remaining != null) pieces.push(`Свободно мест: ${item.global_remaining} из ${item.global_limit}`);
    if (item.min_level_key && item.min_level_key !== 'novice') pieces.push(`С уровня «${item.min_level_title}»`);
    if (item.publish_until) pieces.push(`Публикация до ${dateText(item.publish_until)}`);
    if (item.reward_steps?.length) pieces.push(`Тарифы за ночь: ${item.reward_steps.map((amount,index) => `${index+1}-й час — ${amount}`).join('; ')} реп.`);
    if (item.publication_message && state.role === 'settings') pieces.push(item.publication_message);
    return pieces.length ? `<div class="time-rule"><b>${pieces.map(esc).join('<br>')}</b></div>` : '';
  }

  function timeRuleBlock(item, assignment = false) {
    if (!item.time_rule_summary) return '';
    let detail = item.time_rule_summary;
    if (!assignment && Number.isFinite(Number(item.limit_remaining))) {
      detail += ` · доступно: ${Number(item.limit_remaining)}`;
    }
    return `<div class="time-rule"><span>✦</span><b>${esc(detail)}</b></div>`;
  }

  function templateLimitLabel(item) {
    const limit = Number(item.completion_limit || 0);
    if (!limit) return 'Без ограничения по количеству';
    const period = ({day:'за сутки',week:'за неделю',night:'за ночь'})[item.limit_period] || 'за период';
    return `До ${limit} ${item.reward_steps?.length ? 'оплачиваемых часов' : 'выполнений'} ${period}`;
  }

  function templateCard(item, takenIds) {
    const taken = takenIds.has(item.template_id);
    const limitReached = item.time_rule_key && Number(item.limit_remaining) <= 0;
    const disabled = taken || limitReached;
    const buttonLabel = taken ? 'Уже в работе' : limitReached ? 'Лимит исчерпан' : 'Взять задание';
    return `<article class="task-card"><div class="task-top"><span class="task-icon">${item.verification_mode === 'leadership_counter' ? '⚡' : item.verification_mode === 'evidence_review' ? '▣' : '✓'}</span><div class="task-copy"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></div></div>${timeRuleBlock(item)}${rulesBlock(item)}${reward(item)}<div class="meta-row"><span class="meta">Цель: ${item.target_count}</span>${item.time_rule_key ? '' : `<span class="meta">Срок: ${item.deadline_hours} ч.</span>`}</div>${item.time_rule_message && !limitReached ? `<div class="time-hint">${esc(item.time_rule_message)}</div>` : ''}<div class="actions"><button class="button primary" data-take="${esc(item.template_id)}" ${disabled ? 'disabled' : ''}>${buttonLabel}</button></div></article>`;
  }

  function adminAssignmentCard(item, evidenceByAssignment) {
    const evidence = evidenceByAssignment.get(item.assignment_id) || [];
    const canSubmit = item.status === 'in_progress' && item.verification_mode !== 'leadership_counter';
    const upload = item.status === 'in_progress' && item.verification_mode === 'evidence_review'
      ? `<label class="upload">＋ Добавить скриншоты<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-upload="${esc(item.assignment_id)}"></label>` : '';
    const evidenceList = evidence.length ? `<div class="evidence-grid">${evidence.map(file => `<span class="meta">${esc(file.file_name)}</span>`).join('')}</div>` : '';
    const canCancel = ['in_progress','pending_review'].includes(item.status);
    const deadline = item.status === 'pending_review'
      ? `Ожидание проверки не расходует срок выполнения. Проверка до ${dateText(item.review_due_at)}.`
      : item.status === 'in_progress' ? `${item.revision_count ? 'Доработать' : 'Выполнить'} до ${dateText(item.deadline_at)}.` : '';
    return `<article class="task-card"><div class="task-top"><span class="task-icon">${item.verification_mode === 'leadership_counter' ? '⚡' : '✓'}</span><div class="task-copy"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></div><span class="status ${statusClass(item.status)}">${statusLabel(item.status)}</span></div>${timeRuleBlock(item, true)}${rulesBlock(item)}${reward(item)}${progressBlock(item)}${deadline ? `<p class="decision-details">${esc(deadline)}</p>` : ''}${evidenceList}${upload}${nightFields(item)}<div class="actions">${canSubmit ? `<button class="button primary" data-submit="${esc(item.assignment_id)}">Задание выполнено</button>` : ''}${canCancel ? `<button class="button ghost" data-cancel-assignment="${esc(item.assignment_id)}">Отказаться от задания</button>` : ''}</div>${item.decision_reason ? `<div class="meta-row"><span class="meta">${esc(item.decision_reason)}</span></div>` : ''}</article>`;
  }

  function renderAdmin() {
    const { templates, wallet, evidence, task_profile: profile } = state.data;
    const assignments = state.data.own_assignments || state.data.assignments;
    $('#wallet-reports').textContent = Number(wallet.report_balance || 0);
    $('#wallet-index').textContent = Number(wallet.index_bonus_total || 0).toLocaleString('ru-RU');
    const weeklyLimit = Number(wallet.weekly_limit ?? 1000);
    const weeklyUsed = Number(wallet.weekly_used || 0);
    const available = Math.min(Number(wallet.report_balance || 0),Number(wallet.weekly_remaining ?? weeklyLimit));
    $('#wallet-week-label').textContent = `${weeklyUsed} / ${weeklyLimit} реп.`;
    $('#wallet-week-progress').style.width = `${Math.min(100,weeklyUsed / Math.max(1,weeklyLimit) * 100)}%`;
    $('#wallet-week-remaining').textContent = `Сейчас можно вывести: ${available} репортов. Остаток банка не сгорает. Выплаты в очереди сохраняют резерв лимита до исполнения.`;
    $('#wallet-week-reset').textContent = wallet.weekly_reset_at ? `Новый лимит: ${dateText(wallet.weekly_reset_at)}` : '';
    $('#wallet-debt').hidden = !Number(wallet.report_debt || 0);
    $('#wallet-debt').textContent = `Корректировка: ${Number(wallet.report_debt || 0)} репортов погасится будущими начислениями.`;
    $('#withdraw-button').disabled = available <= 0;
    $('#level-title').textContent = profile?.title || 'Новичок';
    $('#level-multiplier').textContent = `×${Number(profile?.reward_multiplier || 1).toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    $('#level-progress').style.width = `${Math.max(0, Math.min(100, Number(profile?.progress_percent || 0)))}%`;
    $('#level-xp').textContent = `${Number(profile?.xp || 0)} XP`;
    $('#level-approved').textContent = `Выполнено заданий: ${Number(profile?.approved_tasks || 0)}`;
    $('#level-next').textContent = profile?.next_level
      ? `До «${profile.next_level.title}»: ${Number(profile.xp_to_next || 0)} XP`
      : 'Максимальный уровень достигнут';
    if (profile?.manual_level) $('#level-next').textContent = 'Уровень назначен Master ID · автоматический рост приостановлен';
    const active = assignments.filter(item => ['in_progress', 'pending_review'].includes(item.status));
    const history = assignments.filter(item => !['in_progress', 'pending_review'].includes(item.status));
    const takenIds = new Set(active.map(item => item.template_id));
    const evidenceByAssignment = new Map();
    const ownIds = new Set(assignments.map(item => item.assignment_id));
    evidence.filter(file => ownIds.has(file.assignment_id)).forEach(file => {
      const list = evidenceByAssignment.get(file.assignment_id) || [];
      list.push(file); evidenceByAssignment.set(file.assignment_id, list);
    });
    const availableTemplates = templates.filter(item => !item.time_rule_key || Number(item.limit_remaining) > 0);
    $('#available-list').innerHTML = availableTemplates.length ? availableTemplates.map(item => templateCard(item, takenIds)).join('') : empty('Нет доступных заданий');
    $('#active-list').innerHTML = active.length ? active.map(item => adminAssignmentCard(item, evidenceByAssignment)).join('') : empty('Нет заданий в работе');
    $('#history-list').innerHTML = history.length ? history.map(item => adminAssignmentCard(item, evidenceByAssignment)).join('') : empty('История пока пуста');
    if (state.data.history_next_cursor) $('#history-list').innerHTML += '<button class="button secondary" data-history-more>Показать ещё</button>';
  }

  function leaderCard(item, evidenceByAssignment) {
    const files = evidenceByAssignment.get(item.assignment_id) || [];
    const fileHtml = files.length ? `<div class="evidence-grid">${files.map(file => file.view_url ? `<a href="${esc(file.view_url)}" target="_blank" rel="noopener"><img src="${esc(file.view_url)}" alt="${esc(file.file_name)}"></a>` : `<span class="meta">${esc(file.file_name)}</span>`).join('')}</div>` : '';
    const controls = item.verification_mode === 'leadership_counter'
      ? `<div class="actions"><button class="button primary" data-mark="${esc(item.assignment_id)}">Засчитать вход</button><button class="button ghost" data-undo="${esc(item.assignment_id)}">Отменить отметку</button></div>`
      : item.status === 'pending_review'
        ? `<div class="actions"><button class="button primary" data-review="approve" data-id="${esc(item.assignment_id)}">Принять</button><button class="button secondary" data-review="return" data-id="${esc(item.assignment_id)}">Вернуть</button><button class="button danger" data-review="reject" data-id="${esc(item.assignment_id)}">Отклонить</button></div>` : '';
    return `<article class="task-card ${item.review_overdue ? 'review-overdue' : ''}"><div class="person"><span class="avatar">${esc((item.admin_nickname || 'ID').slice(0,2).toUpperCase())}</span><div class="task-copy"><h3>${esc(item.admin_nickname || `ID ${item.admin_id}`)}</h3><small>${esc(item.title)}</small></div><span class="status ${statusClass(item.status)}">${statusLabel(item.status)}</span></div><p>${esc(item.description)}</p>${timeRuleBlock(item, true)}${rulesBlock(item)}${reward(item)}${progressBlock(item)}${item.submitted_at ? `<p class="decision-details">Отправлено: ${esc(dateText(item.submitted_at))}<br>Проверить до: ${esc(dateText(item.review_due_at))}${item.review_overdue ? ' · проверка просрочена' : ''}</p>` : ''}${fileHtml}${item.status === 'pending_review' ? nightFields(item,true) : ''}${controls}</article>`;
  }

  function renderLeader() {
    const assignments = state.data.assignments;
    const evidenceByAssignment = new Map();
    state.data.evidence.forEach(file => {
      const list = evidenceByAssignment.get(file.assignment_id) || [];
      list.push(file); evidenceByAssignment.set(file.assignment_id, list);
    });
    const priority = item => item.status === 'pending_review' ? (item.review_overdue ? 0 : 1) : 2;
    const queue = assignments.filter(item => item.status === 'pending_review' ||
      (item.verification_mode === 'leadership_counter' && item.status === 'in_progress'))
      .sort((a,b) => priority(a) - priority(b) ||
        (Date.parse(a.submitted_at || a.taken_at || a.updated_at) || 0) - (Date.parse(b.submitted_at || b.taken_at || b.updated_at) || 0) ||
        String(a.assignment_id).localeCompare(String(b.assignment_id)));
    $('#queue-count').textContent = queue.length;
    $('#review-count').textContent = queue.filter(item => item.status === 'pending_review').length;
    $('#review-queue-list').innerHTML = queue.length ? queue.map(item => leaderCard(item, evidenceByAssignment)).join('') : empty('Очередь пуста: новых заданий для проверки нет');
    const overdue = Number(state.data.review_summary?.overdue_count || 0);
    $('#overdue-summary').hidden = !overdue;
    $('#overdue-summary').textContent = `Просрочено проверок: ${overdue}. Задания администраторов остаются в очереди.`;
    $('#review-history').hidden = !state.data.viewer.is_master;
    if (state.data.viewer.is_master) {
      const decisions = state.data.review_history || [];
      $('#decisions-list').innerHTML = decisions.length ? decisions.map(item => `<article class="task-card"><div class="task-top"><div class="task-copy"><h3>${esc(item.admin_nickname || item.admin_id)}</h3><p>${esc(item.title)}</p></div><span class="status ${statusClass(item.status)}">${statusLabel(item.status)}</span></div>${reward(item)}<p class="decision-details">Проверено: ${esc(dateText(item.reviewed_at))}${item.decision_reason ? `<br>${esc(item.decision_reason)}` : ''}</p>${item.status === 'approved' ? `<div class="actions"><button class="button danger" data-revoke-approval="${esc(item.assignment_id)}">Отменить одобрение</button></div>` : ''}</article>`).join('') : empty('Подтверждённых выполнений пока нет');
      if (state.data.review_history_next_cursor) $('#decisions-list').innerHTML += '<button class="button secondary" data-decisions-more>Показать ещё</button>';
    }
  }

  function renderSettings() {
    if (!state.data.viewer.is_master) return;
    const templates = state.data.all_templates || state.data.templates;
    $('#templates-list').innerHTML = `<div class="settings-note">Здесь настраивается полный каталог заданий. Лимит 0 означает, что задание можно выполнять без ограничения по количеству.</div><div class="actions"><button class="button primary" id="open-create">＋ Создать задание</button></div>${templates.map(item => `<article class="task-card"><div class="task-top"><span class="task-icon">✦</span><div class="task-copy"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><span class="type">${typeLabel(item.verification_mode)} · цель ${item.target_count}</span><span class="template-limit">${esc(templateLimitLabel(item))}</span></div><span class="status ${item.enabled ? 'ok' : 'bad'}">${item.enabled ? 'Активно' : 'Выключено'}</span></div>${rulesBlock(item)}${reward({...item,reward_reports:item.base_reward_reports ?? item.reward_reports,reward_multiplier:1})}<div class="actions"><button class="button secondary" data-edit-template="${esc(item.template_id)}">Редактировать</button><button class="button ghost" data-toggle-template="${esc(item.template_id)}" data-enabled="${item.enabled ? '1' : '0'}">${item.enabled ? 'Выключить' : 'Включить'}</button></div></article>`).join('')}`;
    const levels = state.data.level_settings || [];
    $('#levels-list').innerHTML = `<div class="settings-note">Уровень определяется по накопленному XP. Новые коэффициенты применяются только к заданиям, взятым после сохранения.</div>${levels.map(level => `<article class="task-card level-settings" data-level="${esc(level.level_key)}"><div class="level-name"><b>${esc(level.title)}</b><small>${level.level_key === 'novice' ? 'Начальный уровень' : 'Порог повышения'}</small></div><label>Требуется XP<input data-level-xp type="number" min="0" step="1" value="${Number(level.min_xp || 0)}" ${level.level_key === 'novice' ? 'readonly' : ''}></label><label>Коэффициент<input data-level-multiplier type="number" min="1" max="5" step="0.05" value="${Number(level.report_multiplier || 1)}"></label></article>`).join('')}<button class="button primary level-save" id="save-levels">Сохранить уровни</button>`;
  }

  function empty(text) { return `<div class="empty">${esc(text)}</div>`; }

  async function loadMemberList() {
    const result = await api('members',{query:$('#member-query').value.trim()});
    $('#member-select').innerHTML = '<option value="">Выберите участника или введите ID ниже</option>' + result.members.map(member => `<option value="${Number(member.admin_id)}">${esc(member.nickname || 'Telegram ID')} · ${Number(member.admin_id)}</option>`).join('');
  }

  async function loadMember() {
    const id = $('#member-id').value.trim();
    if (!/^[1-9]\d{0,12}$/.test(id)) throw new Error('Укажите корректный Telegram ID администратора.');
    state.member = await api('member_profile',{admin_id:id});
    const {task_profile:profile,wallet} = state.member;
    $('#member-profile').hidden = false;
    $('#member-name').textContent = `${state.member.admin_nickname} · ${state.member.admin_id}`;
    $('#member-stats').textContent = `${profile.title} · ${profile.xp} XP · банк ${wallet.report_balance} реп. · бонус индекса +${wallet.index_bonus_total}%${Number(wallet.report_debt || 0) ? ` · корректировка к погашению ${wallet.report_debt} реп.` : ''}`;
    $('#member-level').value = profile.manual_level ? profile.level_key : '';
  }

  async function memberAction(button) {
    if (!state.data.viewer.is_master || !state.member) return;
    const action = button.dataset.memberAction;
    const labels = {set_level:'Изменить уровень?',reset_bank:'Обнулить банк и бонус индекса?',reset_progress:'Сбросить прогресс администратора?'};
    const details = {set_level:'XP сохраняется. Ручной уровень действует до возврата автоматического режима. Уже взятые награды не меняются.',reset_bank:'Обнулятся доступные бонусные репорты и бонус индекса. Уже выведенные репорты, поручения в очереди и существующий корректировочный долг сохранятся. Прежние награды не будут списаны повторно после этого расчётного обнуления.',reset_progress:'XP и уровень сбросятся, незавершённые задания отменятся. Банк, бонус индекса и вся история останутся.'};
    const reason = await askDecision({eyebrow:'Только Master ID',title:labels[action],text:`${state.member.admin_nickname} · ID ${state.member.admin_id}\n\n${details[action]}`,reason:true,confirm:'Продолжить'});
    if (!reason) return;
    if (action !== 'set_level') {
      const confirmed = await askDecision({eyebrow:'Окончательное подтверждение',title:labels[action],text:`Администратор: ${state.member.admin_nickname} · ID ${state.member.admin_id}\nПричина: ${reason}\n\nИстория сохранится, но операция изменит текущие показатели.`,confirm:'Подтвердить сброс'});
      if (confirmed === null) return;
    }
    const payload = {admin_id:state.member.admin_id,reason,level_key:$('#member-level').value};
    const opName = `admin-task-owner:${action}:${state.member.admin_id}`;
    const fingerprint = JSON.stringify(payload);
    let operation = null;
    try { operation = JSON.parse(sessionStorage.getItem(opName) || 'null'); } catch {}
    if (!operation || operation.fingerprint !== fingerprint) operation = {fingerprint,id:`owner:${crypto.randomUUID()}`};
    sessionStorage.setItem(opName,JSON.stringify(operation));
    button.disabled = true;
    try {
      await api(action,{...payload,operation_id:operation.id});
      sessionStorage.removeItem(opName);
      await reload({quiet:true}); await loadMember();
      toast('Изменение сохранено в истории');
    } catch(error) { toast(error.message); }
    finally { button.disabled = false; }
  }

  function render() {
    $('#admin-view').hidden = state.role !== 'admin';
    $('#leader-view').hidden = state.role !== 'leader';
    $('#settings-view').hidden = state.role !== 'settings';
    document.querySelectorAll('#role-switch button').forEach(button => button.classList.toggle('active', button.dataset.role === state.role));
    renderAdmin();
    if (state.data.viewer.is_leader) renderLeader();
    if (state.data.viewer.is_master) renderSettings();
    switchTab('admin', state.adminTab);
    if (state.data.viewer.is_master) switchTab('settings', state.settingsTab);
  }

  function switchTab(area, tab) {
    const stateKey = area === 'admin' ? 'adminTab' : 'settingsTab';
    state[stateKey] = tab;
    document.querySelectorAll(`#${area}-tabs button`).forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    const ids = area === 'admin' ? ['available','active','history'] : ['templates','levels','members','wallet-settings'];
    ids.forEach(id => { $(`#${id}-list`).hidden = id !== tab; });
  }

  function askDecision({ eyebrow = 'Подтверждение', title, text, reason = false, confirm = 'Подтвердить' }) {
    return new Promise(resolve => {
      const dialog = $('#decision-dialog');
      $('#dialog-eyebrow').textContent = eyebrow;
      $('#dialog-title').textContent = title;
      $('#dialog-text').textContent = text || '';
      $('#reason-wrap').hidden = !reason;
      $('#dialog-reason').value = '';
      $('#dialog-confirm').textContent = confirm;
      const finish = () => {
        dialog.removeEventListener('close', finish);
        resolve(dialog.returnValue === 'default' ? $('#dialog-reason').value.trim() : null);
      };
      dialog.addEventListener('close', finish);
      dialog.showModal();
    });
  }

  $('#level-up-dialog').addEventListener('cancel', event => event.preventDefault());
  $('#level-up-confirm').addEventListener('click', async () => {
    const event = state.data?.pending_level_up;
    if (!event) return $('#level-up-dialog').close();
    const button = $('#level-up-confirm');
    button.disabled = true;
    try {
      await api('ack_level_up', {assignment_id:event.assignment_id});
      state.data.pending_level_up = null;
      state.levelUpShowing = '';
      $('#level-up-dialog').close();
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });

  async function compressImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('Можно прикрепить только изображение.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .82));
    if (!blob) throw new Error('Не удалось подготовить изображение.');
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.webp', type: 'image/webp' };
  }

  async function uploadEvidence(assignmentId, files) {
    for (const source of [...files].slice(0, 5)) {
      const prepared = await compressImage(source);
      const reservation = await api('create_evidence_upload', {
        assignment_id: assignmentId, file_name: prepared.name, mime_type: prepared.type
      });
      if (prepared.blob.size > reservation.max_bytes) throw new Error('Скриншот слишком большой.');
      const response = await fetch(reservation.upload_url, {
        method: 'PUT', headers: {'Content-Type': prepared.type}, body: prepared.blob
      });
      if (!response.ok) throw new Error('Не удалось загрузить скриншот в хранилище.');
      await api('confirm_evidence_upload', { evidence_id: reservation.evidence_id });
    }
  }

  function openTemplateEditor(item = null) {
    $('#template-id').value = item?.template_id || '';
    $('#create-title').value = item?.title || '';
    $('#create-description').value = item?.description || '';
    $('#create-instructions').value = item?.instructions || '';
    $('#create-mode').value = item?.verification_mode || 'leadership_counter';
    $('#create-target').value = Number(item?.target_count || 1);
    $('#create-deadline').value = Number(item?.deadline_hours || 24);
    $('#create-reports').value = Number(item?.reward_reports || 50);
    $('#create-index').value = Number(item?.reward_index || 1);
    $('#create-xp').value = Number(item?.reward_xp || 10);
    $('#create-limit').value = Number(item?.completion_limit || 0);
    $('#create-limit-period').value = item?.limit_period || 'none';
    $('#create-global-limit').value = Number(item?.global_limit || 0);
    $('#create-min-level').value = item?.min_level_key || 'novice';
    $('#create-publish-from').value = moscowInput(item?.publish_from);
    $('#create-publish-until').value = moscowInput(item?.publish_until);
    $('#create-review-hours').value = Number(item?.review_hours || 24);
    $('#create-revision-hours').value = Number(item?.revision_hours || 24);
    $('#create-stepped').checked = !!item?.reward_steps?.length;
    [150,250,350].forEach((amount,index) => { $(`#create-hour-${index+1}`).value = Number(item?.reward_steps?.[index] || amount); });
    $('#template-dialog-eyebrow').textContent = item ? 'Редактирование' : 'Новый шаблон';
    $('#template-dialog-title').textContent = item ? 'Настроить задание' : 'Создать задание';
    $('#template-submit').textContent = item ? 'Сохранить изменения' : 'Создать шаблон';
    $('#create-dialog').showModal();
  }

  document.addEventListener('click', async event => {
    const role = event.target.closest('[data-role]');
    if (role) {
      if (role.dataset.role === 'settings' && !state.data.viewer.is_master) return;
      state.role = role.dataset.role; render(); return;
    }
    const tab = event.target.closest('.tabs [data-tab]');
    if (tab) {
      const area = tab.closest('#settings-tabs') ? 'settings' : 'admin';
      switchTab(area, tab.dataset.tab);
      try {
        if (area === 'settings' && tab.dataset.tab === 'members') await loadMemberList();
        if (area === 'settings' && tab.dataset.tab === 'wallet-settings') {
          const settings = await api('wallet_settings');
          $('#weekly-withdrawal-limit').value = settings.weekly_withdrawal_limit;
        }
      } catch(error) { toast(error.message); }
      return;
    }
    if (event.target.closest('#find-members')) { try { await loadMemberList(); } catch(error) { toast(error.message); } return; }
    if (event.target.closest('#load-member')) { try { await loadMember(); } catch(error) { toast(error.message); } return; }
    const ownerButton = event.target.closest('[data-member-action]');
    if (ownerButton) { await memberAction(ownerButton); return; }
    if (event.target.closest('#save-wallet-settings')) {
      const button = event.target.closest('#save-wallet-settings'); button.disabled = true;
      try { await api('save_wallet_settings',{weekly_withdrawal_limit:Number($('#weekly-withdrawal-limit').value)}); await reload({quiet:true}); toast('Недельный лимит сохранён'); }
      catch(error) { toast(error.message); } finally { button.disabled = false; }
      return;
    }
    const cancel = event.target.closest('[data-cancel-assignment]');
    if (cancel) {
      const accepted = await askDecision({title:'Отказаться от задания?',text:'Награда не начислится. Прогресс останется в истории, а занятое место освободится.',confirm:'Отказаться'});
      if (accepted === null) return;
      cancel.disabled = true;
      try { await api('cancel',{assignment_id:cancel.dataset.cancelAssignment}); await reload({quiet:true}); toast('Задание отменено'); }
      catch(error) { cancel.disabled = false; toast(error.message); }
      return;
    }
    const revoke = event.target.closest('[data-revoke-approval]');
    if (revoke) {
      const reason = await askDecision({title:'Отменить одобрение?',text:'Награда, XP и бонус индекса будут скорректированы. Если репорты уже выведены, недостающая сумма погасится будущими начислениями. История решения сохранится.',reason:true,confirm:'Отменить одобрение'});
      if (!reason) return;
      revoke.disabled = true;
      try { await api('revoke_approval',{assignment_id:revoke.dataset.revokeApproval,reason}); await reload({quiet:true}); toast('Одобрение отменено'); }
      catch(error) { revoke.disabled = false; toast(error.message); }
      return;
    }
    const decisionsMore = event.target.closest('[data-decisions-more]');
    if (decisionsMore) {
      decisionsMore.disabled = true;
      try { const page = await api('moderation_history',{before:state.data.review_history_next_cursor}); const known = new Set((state.data.review_history || []).map(item => item.assignment_id)); state.data.review_history.push(...page.assignments.filter(item => !known.has(item.assignment_id))); state.data.review_history_next_cursor = page.next_cursor; renderLeader(); }
      catch(error) { decisionsMore.disabled = false; toast(error.message); }
      return;
    }
    const historyMore = event.target.closest('[data-history-more]');
    if (historyMore) {
      historyMore.disabled = true;
      try {
        const page = await api('history', {before:state.data.history_next_cursor});
        const known = new Set(state.data.own_assignments.map(item => item.assignment_id));
        state.data.own_assignments.push(...page.assignments.filter(item => !known.has(item.assignment_id)));
        state.data.history_next_cursor = page.next_cursor;
        render();
      } catch (error) { historyMore.disabled = false; toast(error.message); }
      return;
    }
    const take = event.target.closest('[data-take]');
    if (take) {
      const template = state.data.templates.find(item => item.template_id === take.dataset.take);
      const details = template
        ? `${template.description}${template.instructions ? `\n\nПравила:\n${template.instructions}` : ''}`
        : 'После подтверждения оно появится во вкладке «В работе».';
      const accepted = await askDecision({ title:'Взять задание?', text:details, confirm:'Взять' });
      if (accepted === null) return;
      try { await api('take_task', {template_id:take.dataset.take}); await reload({quiet:true}); toast('Задание взято'); } catch (error) { toast(error.message); }
      return;
    }
    const submit = event.target.closest('[data-submit]');
    if (submit) {
      const accepted = await askDecision({ title:'Отправить на проверку?', text:'Награда будет начислена только после решения руководства.', confirm:'Отправить' });
      if (accepted === null) return;
      submit.disabled = true;
      try { await api('submit', {assignment_id:submit.dataset.submit,...effortPayload(submit.dataset.submit)}); await reload({quiet:true}); toast('Задание отправлено на проверку'); } catch (error) { submit.disabled = false; toast(error.message); }
      return;
    }
    const mark = event.target.closest('[data-mark]');
    if (mark) {
      const operationName = `admin-task-entry:${mark.dataset.mark}`;
      const sourceKey = sessionStorage.getItem(operationName) || `entry:${mark.dataset.mark}:${crypto.randomUUID()}`;
      sessionStorage.setItem(operationName, sourceKey);
      mark.disabled = true;
      try {
        const result = await api('mark_progress', {assignment_id:mark.dataset.mark,source_key:sourceKey});
        sessionStorage.removeItem(operationName);
        await reload({quiet:true});
        toast(result.duplicate ? 'Этот вход уже был засчитан' : 'Вход засчитан');
      } catch (error) {
        mark.disabled = false;
        toast(error.message);
      }
      return;
    }
    const undo = event.target.closest('[data-undo]');
    if (undo) {
      const reason = await askDecision({eyebrow:'Исправление',title:'Отменить последнюю отметку?',text:'Причина сохранится в истории.',reason:true,confirm:'Отменить отметку'});
      if (!reason) return;
      try { await api('undo_progress',{assignment_id:undo.dataset.undo,reason}); await reload({quiet:true}); toast('Отметка отменена'); } catch (error) { toast(error.message); }
      return;
    }
    const review = event.target.closest('[data-review]');
    if (review) {
      const decision = review.dataset.review;
      const requiresReason = decision !== 'approve';
      const reason = await askDecision({eyebrow:'Модерация',title:decision === 'approve' ? 'Принять выполнение?' : decision === 'return' ? 'Вернуть на доработку?' : 'Отклонить отчёт?',text:decision === 'approve' ? 'Репорты поступят в банк, а процент применится к индексу.' : 'Администратор увидит указанную причину.',reason:requiresReason,confirm:decision === 'approve' ? 'Принять' : 'Сохранить решение'});
      if (reason === null || (requiresReason && !reason)) return;
      review.disabled = true;
      try { await api('review',{assignment_id:review.dataset.id,decision,reason,...(decision === 'approve' ? effortPayload(review.dataset.id) : {})}); await reload({quiet:true}); toast('Решение сохранено'); } catch (error) { review.disabled = false; toast(error.message); }
      return;
    }
    if (event.target.closest('#save-levels')) {
      const levels = [...document.querySelectorAll('[data-level]')].map(card => ({
        level_key: card.dataset.level,
        min_xp: Number(card.querySelector('[data-level-xp]').value),
        report_multiplier: Number(card.querySelector('[data-level-multiplier]').value)
      }));
      const button = event.target.closest('#save-levels');
      button.disabled = true;
      try {
        await api('save_level_settings', {levels});
        await reload({quiet:true});
        state.role = 'settings'; state.settingsTab = 'levels'; render();
        toast('Уровни и коэффициенты сохранены');
      } catch (error) { toast(error.message); }
      finally { button.disabled = false; }
      return;
    }
    const editTemplate = event.target.closest('[data-edit-template]');
    if (editTemplate) {
      const item = (state.data.all_templates || state.data.templates)
        .find(template => template.template_id === editTemplate.dataset.editTemplate);
      if (item) openTemplateEditor(item);
      return;
    }
    const toggleTemplate = event.target.closest('[data-toggle-template]');
    if (toggleTemplate) {
      const enabled = toggleTemplate.dataset.enabled !== '1';
      toggleTemplate.disabled = true;
      try {
        await api('set_template_enabled', {template_id:toggleTemplate.dataset.toggleTemplate,enabled});
        await reload({quiet:true});
        state.role = 'settings'; state.settingsTab = 'templates'; render();
        toast(enabled ? 'Задание включено' : 'Задание выключено');
      } catch (error) { toast(error.message); }
      finally { toggleTemplate.disabled = false; }
      return;
    }
    if (event.target.closest('#open-create')) { openTemplateEditor(); return; }
  });

  document.addEventListener('change', async event => {
    if (event.target.matches('#create-limit')) {
      const limit = Number(event.target.value || 0);
      if (limit <= 0) $('#create-limit-period').value = 'none';
      else if ($('#create-limit-period').value === 'none') $('#create-limit-period').value = 'day';
      return;
    }
    if (event.target.matches('#create-limit-period')) {
      if (event.target.value === 'none') $('#create-limit').value = 0;
      else if (Number($('#create-limit').value || 0) <= 0) $('#create-limit').value = 1;
      return;
    }
    const input = event.target.closest('[data-upload]');
    if (!input || !input.files?.length) return;
    input.disabled = true;
    try { await uploadEvidence(input.dataset.upload, input.files); await reload({quiet:true}); toast('Скриншоты добавлены'); } catch (error) { toast(error.message); } finally { input.disabled = false; input.value = ''; }
  });

  $('#withdraw-button').addEventListener('click', async () => {
    const available = Math.min(Number(state.data.wallet.report_balance || 0),Number(state.data.wallet.weekly_remaining ?? state.data.wallet.report_balance ?? 0));
    if (!available) return toast('На балансе пока нет бонусных репортов');
    const raw = window.prompt(`Сколько репортов вывести? Доступно: ${available}`, String(available));
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount < 1 || amount > available) return toast('Укажите корректное количество');
    const opName = `admin-task-withdraw:${state.data.viewer.user_id}:${amount}`;
    const operationId = sessionStorage.getItem(opName) || `withdraw:${state.data.viewer.user_id}:${crypto.randomUUID()}`;
    sessionStorage.setItem(opName,operationId);
    $('#withdraw-button').disabled = true;
    try { await api('withdraw',{amount,operation_id:operationId}); sessionStorage.removeItem(opName); await reload({quiet:true}); toast('Репорты поставлены в очередь на вывод'); } catch (error) { $('#withdraw-button').disabled = false; toast(error.message); }
  });

  $('#member-select').addEventListener('change', () => { if ($('#member-select').value) $('#member-id').value = $('#member-select').value; });
  $('#create-stepped').addEventListener('change', () => {
    if (!$('#create-stepped').checked) return;
    $('#create-mode').value = 'evidence_review'; $('#create-limit-period').value = 'night'; $('#create-limit').value = 3;
  });

  $('#create-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const templateId = $('#template-id').value;
      const action = templateId ? 'update_template' : 'create_template';
      await api(action, {
        template_id:templateId,title:$('#create-title').value.trim(),description:$('#create-description').value.trim(),instructions:$('#create-instructions').value.trim(),verification_mode:$('#create-mode').value,
        target_count:Number($('#create-target').value),deadline_hours:Number($('#create-deadline').value),reward_reports:$('#create-stepped').checked ? Number($('#create-hour-1').value) : Number($('#create-reports').value),reward_index:Number($('#create-index').value),reward_xp:Number($('#create-xp').value),completion_limit:Number($('#create-limit').value),limit_period:$('#create-limit-period').value,
        global_limit:Number($('#create-global-limit').value),min_level_key:$('#create-min-level').value,publish_from:$('#create-publish-from').value,publish_until:$('#create-publish-until').value,review_hours:Number($('#create-review-hours').value),revision_hours:Number($('#create-revision-hours').value),reward_steps:$('#create-stepped').checked ? [1,2,3].map(hour => Number($(`#create-hour-${hour}`).value)) : []
      });
      $('#create-dialog').close(); await reload({quiet:true});
      state.role = 'settings'; state.settingsTab = 'templates'; render();
      toast(templateId ? 'Задание обновлено' : 'Шаблон создан');
    } catch (error) { toast(error.message); }
  });

  reload();
})();
