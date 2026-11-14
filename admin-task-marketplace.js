(() => {
  'use strict';

  const API_URL = 'https://tg-admin-bot-1k1g.onrender.com/api/admin/tasks';
  const tg = window.Telegram?.WebApp;
  const state = { data: null, role: 'admin', adminTab: 'available', settingsTab: 'templates', levelUpShowing: '', withdrawing: false, taking: false, catalogQuery: '', catalogSort: 'default', catalogHasRendered: false, ranking: null, rankingPeriod:'current', rankingLoading:false, rankingError:'', rankingRequest:0, rankingFetchedAt:0 };
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

  async function api(action, payload = {}, {signal} = {}) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': tg?.initData || ''
      },
      body: JSON.stringify({ action, ...payload }),
      signal
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
      const serverTime = Date.parse(state.data.generated_at);
      state.serverClockOffset = Number.isFinite(serverTime) ? serverTime - Date.now() : 0;
      if (state.role === 'settings' && !state.data.viewer.is_master) state.role = 'admin';
      if (state.role === 'leader' && !state.data.viewer.is_leader) state.role = 'admin';
      if (!canViewTaskAnalytics()) {
        state.taskAnalytics = null;
        state.taskAnalyticsController?.abort();
        $('#task-analytics-result').innerHTML = '';
        if (state.settingsTab === 'task-analytics') state.settingsTab = 'templates';
      }
      $('#loading-gate').hidden = true;
      $('#closed-gate').hidden = true;
      $('#app').hidden = false;
      $('#role-switch').hidden = !state.data.viewer.is_leader;
      $('#settings-role').hidden = !state.data.viewer.is_master;
      $('#task-analytics-tab').hidden = !canViewTaskAnalytics();
      state.ranking = null;
      state.rankingRequest++;
      state.rankingLoading = false;
      render();
      scheduleUrgentExpiry();
      if (state.role === 'admin' && state.adminTab === 'ranking') await loadLeaderboard();
      if (state.role === 'settings' && state.settingsTab === 'task-analytics') await loadTaskAnalytics();
      showPendingLevelUp();
    } catch (error) {
      state.taskAnalytics = null;
      state.taskAnalyticsController?.abort();
      $('#task-analytics-result').innerHTML = '';
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
    return `<div class="reward-row"><span class="reward">${reportLabel}</span><span class="reward">до +${effectiveRewardIndex(item).toLocaleString('ru-RU')} п.п. · 7 дней</span><span class="reward">+${Number(item.reward_xp ?? 10)} XP</span></div>`;
  }

  function effectiveRewardIndex(item) {
    return Math.min(Number(state.data?.wallet?.index_bonus_cap ?? 3), Math.max(0, Number(item.reward_index || 0)));
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

  function activeAssignments() {
    return (state.data?.own_assignments || state.data?.assignments || [])
      .filter(item => ['in_progress', 'pending_review'].includes(item.status));
  }

  function slotOccupied() {
    return activeAssignments().length > 0 || state.data?.assignment_limit?.can_take === false;
  }

  function taskIcon(item) {
    const paths = item.reward_steps?.length ? '<path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/>'
      : item.verification_mode === 'leadership_counter' ? '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>'
      : item.verification_mode === 'evidence_review' ? '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>'
      : '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  function catalogReportAmount(item) {
    return item.reward_steps?.length
      ? Math.round(item.reward_steps.reduce((total, value) => total + Number(value), 0) * Number(item.reward_multiplier || 1) / 5) * 5
      : Number(item.reward_reports || 0);
  }

  function catalogRewards(item) {
    const reports = catalogReportAmount(item);
    const index = effectiveRewardIndex(item);
    const xp = Number(item.reward_xp ?? 10);
    const primary = reports > 0 ? `${item.reward_steps?.length ? 'до ' : ''}+${reports.toLocaleString('ru-RU')}`
      : index > 0 ? `до +${index.toLocaleString('ru-RU')}` : `+${xp}`;
    const label = reports > 0 ? 'репортов в банк' : index > 0 ? 'п.п. к индексу · 7 дней' : 'опыта';
    const extras = [reports > 0 && index > 0 ? `до +${index.toLocaleString('ru-RU')} п.п. · 7 дней` : '',
      reports > 0 || index > 0 ? `+${xp} XP` : ''].filter(Boolean);
    return `<div class="catalog-rewards"><div class="catalog-payout"><strong>${primary}</strong><span>${label}</span></div><div class="catalog-extras">${extras.map(value => `<span>${esc(value)}</span>`).join('')}</div></div>${reports > 0 && Number(item.reward_multiplier) > 1 ? `<p class="catalog-multiplier">Ваш коэффициент ×${Number(item.reward_multiplier).toLocaleString('ru-RU', {maximumFractionDigits:2})} уже учтён</p>` : ''}`;
  }

  function urgentBadge() {
    return '<span class="hot-badge"><span aria-hidden="true">✦</span> Горящее</span>';
  }

  function urgentPublicationEnded(item, now = Date.now() + (state.serverClockOffset || 0)) {
    return Boolean(item.is_urgent && Date.parse(item.publish_until) <= now);
  }

  function scheduleUrgentExpiry() {
    clearTimeout(state.urgentExpiryTimer);
    const now = Date.now() + (state.serverClockOffset || 0);
    let nearest = Infinity;
    for (const item of [...(state.data?.templates || []), ...(state.data?.all_templates || [])]) {
      const end = item.is_urgent ? Date.parse(item.publish_until) : NaN;
      if (end > now && end < nearest) nearest = end;
    }
    if (!Number.isFinite(nearest)) return;
    state.urgentExpiryTimer = setTimeout(() => {
      renderCatalog();
      if (state.role === 'settings') renderSettings();
      scheduleUrgentExpiry();
    }, Math.min(2147483647, nearest - now + 25));
  }

  function urgentRewards(item) {
    const format = amount => Number(amount).toLocaleString('ru-RU', {maximumFractionDigits:2});
    return `<dl class="hot-rewards" aria-label="Награда за задание">
      <div><dt>Репорты в банк</dt><dd>+${format(catalogReportAmount(item))}</dd></div>
      <div><dt>Опыт</dt><dd>+${format(item.reward_xp ?? 10)} XP</dd></div>
      <div><dt>К индексу · 7 дней</dt><dd>${effectiveRewardIndex(item) > 0 ? 'до ' : ''}+${format(effectiveRewardIndex(item))} п.п.</dd></div>
    </dl>`;
  }

  function urgentAssignmentDetails(item) {
    if (!item.is_urgent) return '';
    const player = item.player_nickname ? `<div class="hot-player"><span class="hot-player-icon" aria-hidden="true">◎</span><div><span>Ник игрока</span><code dir="ltr">${esc(item.player_nickname)}</code></div></div>` : '';
    const details = item.private_details ? `<details class="task-rules hot-details"><summary>Закрытые детали</summary><p>${esc(item.private_details)}</p></details>` : '';
    const report = item.urgent_report && item.status !== 'in_progress'
      ? `<div class="hot-report"><b>Отчёт администратора</b><p>${esc(item.urgent_report)}</p></div>` : '';
    return player + details + report;
  }

  function renderTaskFocus(active) {
    const item = active[0];
    if (!item) {
      $('#task-focus').innerHTML = '<div class="focus-ring focus-free"><span>01</span></div><div class="focus-copy"><p class="eyebrow">Один шаг за раз</p><h2>Место для нового задания</h2><p>Выберите задание, завершите его и получите награду.</p></div><button class="button secondary" data-open-task-tab="available">Выбрать задание <span aria-hidden="true">↗</span></button>';
      return;
    }
    const pending = item.status === 'pending_review';
    const percent = Math.max(0, Math.min(100, Math.round(Number(item.progress || 0) / Math.max(1, Number(item.target_count || 1)) * 100)));
    const detail = active.length > 1 ? `Ранее взято заданий: ${active.length}. Они сохранены. Завершите их, чтобы освободить слот.`
      : pending ? 'Отчёт у руководства. Пока проверка не завершена, слот остаётся занят.'
      : item.revision_count ? 'Отчёт возвращён на доработку. Исправьте его и отправьте повторно.'
      : `Прогресс: ${Number(item.progress || 0)} из ${Number(item.target_count || 1)}. Продолжите выполнение во вкладке «В работе».`;
    $('#task-focus').innerHTML = `<div class="focus-ring ${pending ? 'focus-pending' : ''}" style="--focus-progress:${percent * 3.6}deg"><span>${pending ? '···' : `${percent}%`}</span></div><div class="focus-copy"><p class="eyebrow">${pending ? 'Ожидает проверки' : 'В фокусе'}</p><h2>${esc(item.title)}</h2><p>${esc(detail)}</p></div><button class="button secondary" data-open-task-tab="active">${active.length > 1 ? 'Открыть задания' : pending ? 'Открыть отчёт' : 'Продолжить'} <span aria-hidden="true">↗</span></button>`;
  }

  function renderCatalog() {
    const templates = (state.data.templates || []).filter(item =>
      !urgentPublicationEnded(item) && (!item.time_rule_key || Number(item.limit_remaining) > 0));
    const query = state.catalogQuery.trim().toLocaleLowerCase('ru-RU');
    const filtered = templates.filter(item => `${item.title} ${item.description}`.toLocaleLowerCase('ru-RU').includes(query));
    const sortKey = {reports:'reward_reports',index:'reward_index',xp:'reward_xp'}[state.catalogSort];
    if (sortKey) filtered.sort((a,b) => (sortKey === 'reward_reports' ? catalogReportAmount(b) - catalogReportAmount(a) : sortKey === 'reward_index' ? effectiveRewardIndex(b) - effectiveRewardIndex(a) : Number(b[sortKey] || 0) - Number(a[sortKey] || 0)) || String(a.template_id).localeCompare(String(b.template_id)));
    filtered.sort((a,b) => Number(Boolean(b.is_urgent)) - Number(Boolean(a.is_urgent)));
    const occupied = slotOccupied();
    const takenIds = new Set(activeAssignments().map(item => item.template_id));
    $('#available-count').textContent = templates.length;
    $('#catalog-slot').textContent = occupied ? 'Слот занят' : '1 свободный слот';
    $('#catalog-slot').classList.toggle('occupied', occupied);
    $('#catalog-lock').hidden = !occupied;
    $('#catalog-lock').textContent = 'Можно просматривать каталог. Новое задание — после завершения или отмены текущего; отчёт на проверке тоже занимает слот.';
    $('#available-list').classList.toggle('catalog-enter', !state.catalogHasRendered);
    state.catalogHasRendered = true;
    $('#available-list').innerHTML = filtered.length ? filtered.map((item,index) => templateCard(item, takenIds, index)).join('') : empty(query ? 'По вашему запросу ничего не найдено' : 'Новых заданий пока нет. Загляните позже.');
  }

  function renderLeaderboard() {
    const data = state.ranking;
    const own = data?.self;
    const rankText = Number(own?.rank) > 0 ? `№${Number(own.rank)}` : '—';
    const standing = own?.rank === 1 ? 'Вы в лидирующей группе'
      : own?.xp_to_next_rank != null ? `До следующего места: ${Number(own.xp_to_next_rank)} XP`
      : own?.in_roster === false ? 'Вашего профиля нет в актуальном составе'
      : 'Место появится после первого подтверждённого задания';
    const entries = data?.entries || [];
    const participantCount = Number(data?.total_participants || 0);
    const participantWord = participantCount % 100 >= 11 && participantCount % 100 <= 14 ? 'участников' : participantCount % 10 === 1 ? 'участник' : [2,3,4].includes(participantCount % 10) ? 'участника' : 'участников';
    $('#ranking-list').innerHTML = `<div class="ranking-head"><div><p class="eyebrow">Активность состава</p><h2>Рейтинг недели</h2><p>${data ? `${esc(data.period_label)} · МСК` : 'Подтверждённые задания за неделю'}</p></div><span class="slot-label">${Number(data?.total_participants || 0)} участников</span></div><div class="ranking-periods" aria-label="Период рейтинга"><button data-rank-period="current" aria-pressed="${state.rankingPeriod === 'current'}">Эта неделя</button><button data-rank-period="previous" aria-pressed="${state.rankingPeriod === 'previous'}">Прошлая</button></div>${data ? `<div class="ranking-self"><strong class="ranking-place">${rankText}</strong><div><p class="eyebrow">Ваше место</p><h3>${esc(own?.nickname || 'Ваш профиль')}</h3><p>${esc(standing)}</p></div><div class="ranking-own-score"><strong>${Number(own?.xp || 0)}<small> XP</small></strong><span>Подтверждено: ${Number(own?.completed || 0)}</span></div></div>` : ''}${state.rankingError ? `<div class="empty" role="alert">${esc(state.rankingError)}<div class="actions"><button class="button secondary" data-rank-retry>Повторить</button></div></div>` : ''}${!data && state.rankingLoading ? '<div class="empty">Загружаем рейтинг…</div>' : data ? entries.length ? `<ol class="ranking-rows">${entries.map(item => `<li class="ranking-row ${item.is_me ? 'is-me' : ''}" value="${Number(item.rank)}"><span class="ranking-number ${Number(item.rank) <= 3 ? 'is-top' : ''}">${Number(item.rank)}</span><div class="ranking-person"><strong>${esc(item.nickname)}${item.is_me ? '<small>Вы</small>' : ''}</strong><span>Подтверждено заданий: ${Number(item.completed)}</span></div><strong class="ranking-score">${Number(item.xp)}<small> XP</small></strong></li>`).join('')}</ol>` : '<div class="empty">За эту неделю пока нет подтверждённых заданий. Первое одобрение откроет рейтинг.</div>' : ''}${data?.next_offset != null ? `<button class="button secondary ranking-more" data-ranking-more ${state.rankingLoading ? 'disabled' : ''}>${state.rankingLoading ? 'Загружаем…' : 'Показать ещё'}</button>` : ''}<details class="task-rules ranking-rules"><summary>Как считаются места</summary><p>Учитывается XP только из подтверждённых заданий текущего состава. Банк, выплаты и коэффициент уровня не дают преимущества.<br>Неделя — с понедельника по воскресенье, МСК. Задание относится к неделе сдачи; если проверка задержалась, после одобрения оно попадёт в свою неделю.<br>При одинаковом XP место одинаковое. Отменённые одобрения исключаются. За позиции автоматические призы пока не начисляются.</p></details>`;
    $('#ranking-list .slot-label').textContent = `${participantCount} ${participantWord}`;
  }

  async function loadLeaderboard({more = false, force = false} = {}) {
    if (more && (state.rankingLoading || state.ranking?.next_offset == null)) return;
    if (!more && !force && state.ranking?.period === state.rankingPeriod && Date.now() - state.rankingFetchedAt < 60000) { renderLeaderboard(); return; }
    const request = ++state.rankingRequest;
    const period = state.rankingPeriod;
    const offset = more ? state.ranking.next_offset : 0;
    state.rankingLoading = true;
    state.rankingError = '';
    renderLeaderboard();
    try {
      const data = await api('leaderboard', {period,offset});
      if (request !== state.rankingRequest || period !== state.rankingPeriod) return;
      if (more && state.ranking?.period === period) {
        const known = new Set(state.ranking.entries.map(item => item.entry_id));
        data.entries = [...state.ranking.entries, ...data.entries.filter(item => !known.has(item.entry_id))];
      }
      state.ranking = data;
      state.rankingFetchedAt = Date.now();
    } catch(error) {
      if (request === state.rankingRequest) state.rankingError = error.message;
    } finally {
      if (request === state.rankingRequest) { state.rankingLoading = false; renderLeaderboard(); }
    }
  }

  function templateCard(item, takenIds, index = 0) {
    const taken = takenIds.has(item.template_id);
    const limitReached = item.time_rule_key && Number(item.limit_remaining) <= 0;
    const unavailable = item.publication_available === false;
    const disabled = taken || unavailable || limitReached || slotOccupied() || state.taking;
    const buttonLabel = taken || unavailable ? 'Уже в работе' : limitReached ? 'Лимит исчерпан' : state.taking ? 'Подождите…' : slotOccupied() ? 'Сначала текущее задание' : 'Взять задание';
    if (item.is_urgent) {
      const live = !taken && !unavailable;
      const places = unavailable ? 'Места заняты' : `Мест свободно: ${Number(item.global_remaining ?? 0)}`;
      return `<article class="task-card catalog-card hot-card ${live ? 'hot-live' : 'hot-occupied'}">
        ${live ? '<div class="hot-sparks" aria-hidden="true"><i></i><i></i><i></i></div>' : ''}
        <div class="hot-meta">${urgentBadge()}<span>${esc(places)}</span></div>
        <div class="task-copy"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></div>
        ${urgentRewards(item)}
        <div class="meta-row"><span class="meta">Взять до: ${esc(dateText(item.publish_until))}</span><span class="meta">На выполнение: ${Number(item.deadline_hours || 24)} ч.</span></div>
        ${item.has_player ? '<p class="hot-lock-note">Ник игрока откроется после принятия</p>' : ''}
        ${rulesBlock(item)}
        <div class="actions"><button class="button primary" data-take="${esc(item.template_id)}" ${disabled ? 'disabled' : ''}>${buttonLabel}${disabled ? '' : '<span aria-hidden="true">↗</span>'}</button></div>
      </article>`;
    }
    return `<article class="task-card catalog-card ${taken ? 'is-current' : ''}" style="--card-order:${Math.min(index, 6)}"><div class="catalog-card-head"><span class="task-icon">${taskIcon(item)}</span><span class="catalog-number">${String(index + 1).padStart(2, '0')}</span></div><div class="task-copy"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></div>${catalogRewards(item)}<div class="meta-row"><span class="meta">Цель: ${Number(item.target_count || 1)}</span>${item.time_rule_key ? '' : `<span class="meta">Срок: ${Number(item.deadline_hours || 24)} ч.</span>`}</div>${timeRuleBlock(item)}${rulesBlock(item)}${item.time_rule_message && !limitReached ? `<div class="time-hint">${esc(item.time_rule_message)}</div>` : ''}<div class="actions"><button class="button primary" data-take="${esc(item.template_id)}" ${disabled ? 'disabled' : ''}>${buttonLabel}${disabled ? '' : '<span aria-hidden="true">↗</span>'}</button></div></article>`;
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
    return `<article class="task-card"><div class="task-top"><span class="task-icon">${item.verification_mode === 'leadership_counter' ? '⚡' : '✓'}</span><div class="task-copy"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></div><span class="status ${statusClass(item.status)}">${statusLabel(item.status)}</span></div>${urgentAssignmentDetails(item)}${timeRuleBlock(item, true)}${rulesBlock(item)}${reward(item)}${progressBlock(item)}${deadline ? `<p class="decision-details">${esc(deadline)}</p>` : ''}${evidenceList}${upload}${nightFields(item)}<div class="actions">${canSubmit ? `<button class="button primary" data-submit="${esc(item.assignment_id)}">${item.is_urgent ? 'Отправить отчёт' : 'Задание выполнено'}</button>` : ''}${canCancel ? `<button class="button ghost" data-cancel-assignment="${esc(item.assignment_id)}">Отказаться от задания</button>` : ''}</div>${item.decision_reason ? `<div class="meta-row"><span class="meta">${esc(item.decision_reason)}</span></div>` : ''}</article>`;
  }

  function renderAdmin() {
    const { wallet, evidence, task_profile: profile } = state.data;
    const assignments = state.data.own_assignments || state.data.assignments;
    $('#wallet-reports').textContent = Number(wallet.report_balance || 0);
    $('#wallet-index').textContent = Math.min(Number(wallet.index_bonus_cap ?? 3), Number(wallet.index_bonus_active ?? wallet.index_bonus_total ?? 0)).toLocaleString('ru-RU');
    $('#wallet-index-rule').textContent = `Максимум +${Number(wallet.index_bonus_cap ?? 3)} п.п. · ${Number(wallet.index_bonus_window_days ?? 7)} дней`;
    $('#wallet-index-rule').title = wallet.index_bonus_next_expiry_at ? `Ближайшее истечение начисления: ${dateText(wallet.index_bonus_next_expiry_at)}` : 'Сумма действующих начислений за последние 7 дней после одобрения.';
    const weeklyLimit = Number(wallet.weekly_limit ?? 1000);
    const weeklyUsed = Number(wallet.weekly_used || 0);
    const available = Math.min(Number(wallet.report_balance || 0),Number(wallet.weekly_remaining ?? weeklyLimit));
    $('#wallet-week-label').textContent = `${weeklyUsed} / ${weeklyLimit} реп.`;
    $('#wallet-week-progress').style.width = `${Math.min(100,weeklyUsed / Math.max(1,weeklyLimit) * 100)}%`;
    $('#wallet-week-remaining').textContent = `Сейчас можно вывести: ${available} репортов. Остаток банка не сгорает. Выплаты в очереди сохраняют резерв лимита до исполнения.`;
    $('#wallet-week-reset').textContent = wallet.weekly_reset_at ? `Новый лимит: ${dateText(wallet.weekly_reset_at)}` : '';
    $('#wallet-debt').hidden = !Number(wallet.report_debt || 0);
    $('#wallet-debt').textContent = `Корректировка: ${Number(wallet.report_debt || 0)} репортов погасится будущими начислениями.`;
    $('#withdraw-button').disabled = state.withdrawing || available <= 0;
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
    const evidenceByAssignment = new Map();
    const ownIds = new Set(assignments.map(item => item.assignment_id));
    evidence.filter(file => ownIds.has(file.assignment_id)).forEach(file => {
      const list = evidenceByAssignment.get(file.assignment_id) || [];
      list.push(file); evidenceByAssignment.set(file.assignment_id, list);
    });
    renderTaskFocus(active);
    renderCatalog();
    $('#active-count').textContent = active.length;
    $('#history-count').textContent = state.data.history_next_cursor ? `${history.length}+` : history.length;
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
    return `<article class="task-card ${item.review_overdue ? 'review-overdue' : ''}"><div class="person"><span class="avatar">${esc((item.admin_nickname || 'ID').slice(0,2).toUpperCase())}</span><div class="task-copy"><h3>${esc(item.admin_nickname || `ID ${item.admin_id}`)}</h3><small>${esc(item.title)}</small></div><span class="status ${statusClass(item.status)}">${statusLabel(item.status)}</span></div><p>${esc(item.description)}</p>${urgentAssignmentDetails(item)}${timeRuleBlock(item, true)}${rulesBlock(item)}${reward(item)}${progressBlock(item)}${item.submitted_at ? `<p class="decision-details">Отправлено: ${esc(dateText(item.submitted_at))}<br>Проверить до: ${esc(dateText(item.review_due_at))}${item.review_overdue ? ' · проверка просрочена' : ''}</p>` : ''}${fileHtml}${item.status === 'pending_review' ? nightFields(item,true) : ''}${controls}</article>`;
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
    const templates = [...(state.data.all_templates || state.data.templates)].sort((a,b) =>
      Number(Boolean(b.is_urgent)) - Number(Boolean(a.is_urgent)) ||
      (a.is_urgent && b.is_urgent ? String(b.created_at || '').localeCompare(String(a.created_at || '')) : 0));
    $('#templates-list').innerHTML = `<div class="settings-note">Здесь настраивается полный каталог заданий. Лимит 0 означает, что задание можно выполнять без ограничения по количеству.</div><div class="actions"><button class="button primary" id="open-create">＋ Создать задание</button></div>${templates.map(settingsTemplateCard).join('')}`;
    const levels = state.data.level_settings || [];
    $('#levels-list').innerHTML = `<div class="settings-note">Уровень определяется по накопленному XP. Новые коэффициенты применяются только к заданиям, взятым после сохранения.</div>${levels.map(level => `<article class="task-card level-settings" data-level="${esc(level.level_key)}"><div class="level-name"><b>${esc(level.title)}</b><small>${level.level_key === 'novice' ? 'Начальный уровень' : 'Порог повышения'}</small></div><label>Требуется XP<input data-level-xp type="number" min="0" step="1" value="${Number(level.min_xp || 0)}" ${level.level_key === 'novice' ? 'readonly' : ''}></label><label>Коэффициент<input data-level-multiplier type="number" min="1" max="5" step="0.05" value="${Number(level.report_multiplier || 1)}"></label></article>`).join('')}<button class="button primary level-save" id="save-levels">Сохранить уровни</button>`;
  }

  function settingsTemplateCard(item) {
    const expired = urgentPublicationEnded(item);
    const id = esc(item.template_id);
    const status = expired ? 'Публикация завершена' : item.enabled ? 'Активно' : 'Выключено';
    const schedule = item.is_urgent ? `<div class="meta-row">${urgentBadge()}<span class="meta">Мест: ${Number(item.global_limit)}</span><span class="meta">До ${esc(dateText(item.publish_until))}</span></div>` : '';
    return `<article class="task-card"><div class="task-top"><span class="task-icon">✦</span><div class="task-copy"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><span class="type">${typeLabel(item.verification_mode)} · цель ${item.target_count}</span><span class="template-limit">${esc(templateLimitLabel(item))}</span></div><span class="status ${item.enabled && !expired ? 'ok' : 'bad'}">${status}</span></div>${schedule}${rulesBlock(item)}${reward({...item,reward_reports:item.base_reward_reports ?? item.reward_reports,reward_multiplier:1})}<div class="actions"><button class="button secondary" data-edit-template="${id}">Редактировать</button>${expired ? `<button class="button primary" data-republish-template="${id}">Опубликовать снова</button>` : `<button class="button ghost" data-toggle-template="${id}" data-enabled="${item.enabled ? '1' : '0'}">${item.enabled ? 'Выключить' : 'Включить'}</button>`}</div></article>`;
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
    $('#member-stats').textContent = `${profile.title} · ${profile.xp} XP · банк ${wallet.report_balance} реп. · действующий бонус +${Math.min(Number(wallet.index_bonus_cap ?? 3), Number(wallet.index_bonus_active ?? wallet.index_bonus_total ?? 0))} п.п.${Number(wallet.report_debt || 0) ? ` · корректировка к погашению ${wallet.report_debt} реп.` : ''}`;
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
    if (state.adminTab === 'ranking') renderLeaderboard();
    if (state.data.viewer.is_leader) renderLeader();
    if (state.data.viewer.is_master) renderSettings();
    switchTab('admin', state.adminTab);
    if (state.data.viewer.is_master) switchTab('settings', state.settingsTab);
  }

  function switchTab(area, tab) {
    const stateKey = area === 'admin' ? 'adminTab' : 'settingsTab';
    state[stateKey] = tab;
    document.querySelectorAll(`#${area}-tabs button`).forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    const ids = area === 'admin' ? ['available','active','history','ranking'] : ['templates','levels','members','wallet-settings','task-analytics'];
    ids.forEach(id => { $(`#${id}-list`).hidden = id !== tab; });
    if (area === 'admin') $('#catalog-tools').hidden = tab !== 'available';
  }

  function canViewTaskAnalytics() {
    return Boolean(state.data?.viewer?.is_master && state.data?.supports_task_analytics);
  }

  const analyticsNumber = value => new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
  const analyticsDate = value => String(value || '').split('-').reverse().join('.');

  function analyticsRows(rows, {people = false} = {}) {
    if (!rows.length) return empty(people ? 'Администраторы не найдены' : 'Нет выполнений за выбранный период');
    return `<div class="ta-table-wrap"><table class="ta-table"><thead><tr><th scope="col">${people ? 'Администратор' : 'Категория'}</th><th scope="col">Выполнено</th><th scope="col">Репорты</th><th scope="col">XP</th></tr></thead><tbody>
      ${rows.map(row => `<tr><th scope="row">${esc(row.label)}${people ? `<small>${esc(row.rights_level)}${row.current_admin ? '' : ' · вне текущего состава'}</small>` : ''}</th><td>${analyticsNumber(row.completed)}</td><td>${analyticsNumber(row.reports)}</td><td>${analyticsNumber(row.xp)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  function renderAnalyticsPeople() {
    if (!canViewTaskAnalytics() || !state.taskAnalytics) return;
    const container = $('#task-analytics-people');
    if (!container) return;
    const query = ($('#task-analytics-search')?.value || '').trim().toLocaleLowerCase('ru-RU');
    const rights = $('#task-analytics-rights')?.value || '';
    const rows = state.taskAnalytics.admins.filter(row =>
      (!rights || row.rights_level === rights) && row.label.toLocaleLowerCase('ru-RU').includes(query));
    const limit = state.taskAnalyticsPeopleLimit || 20;
    container.innerHTML = analyticsRows(rows.slice(0, limit), {people:true}) +
      (rows.length > limit ? '<button class="button secondary ta-more" type="button" data-ta-more>Показать ещё</button>' : '');
  }

  function renderTaskAnalytics() {
    const data = state.taskAnalytics;
    if (!canViewTaskAnalytics() || !data) return;
    const {totals} = data;
    const metrics = [
      ['Выполнено заданий', totals.completed], ['Участников', totals.participants],
      ['Начислено репортов', totals.reports], ['Начислено XP', totals.xp], ['Горящих выполнено', totals.urgent],
    ];
    $('#task-analytics-result').innerHTML = `
      <p class="ta-range">${esc(analyticsDate(data.start))} — ${esc(analyticsDate(data.end))} · МСК</p>
      <div class="ta-metrics">${metrics.map(([label,value]) => `<div><span>${label}</span><strong>${analyticsNumber(value)}</strong></div>`).join('')}</div>
      <section class="task-card ta-card"><div class="ta-chart-head"><h3>Динамика по дням</h3>
        <select id="task-analytics-metric" aria-label="Показатель графика"><option value="completed">Выполнения</option><option value="reports">Репорты</option><option value="xp">Опыт (XP)</option></select></div>
        <div id="task-analytics-chart"></div>
      </section>
      <section class="task-card ta-card"><h3>По администраторам</h3>
        <div class="ta-filters"><label>Ник<input id="task-analytics-search" aria-label="Поиск по нику" type="search" placeholder="Найти администратора" maxlength="120"></label>
        <label>Уровень админправ<select id="task-analytics-rights" aria-label="Уровень админправ"><option value="">Все уровни</option>
        ${data.rights_levels.map(row => `<option value="${esc(row.label)}">${esc(row.label)}</option>`).join('')}</select></label></div>
        <div id="task-analytics-people"></div>
      </section>
      <div class="ta-breakdowns">
        <section class="task-card ta-card"><h3>По уровням админправ</h3><p>По текущему составу. Если данных нет, уровень не указан.</p>${analyticsRows(data.rights_levels)}</section>
        <section class="task-card ta-card"><h3>По уровням заданий</h3><p>Уровень на момент взятия задания.</p>${analyticsRows(data.task_levels)}</section>
      </div>
      <details class="task-card ta-card"><summary>По видам заданий</summary>${analyticsRows(data.templates)}</details>
      <p class="ta-note">Только подтверждённые выполнения без отменённых наград. Отчёты учитываются по дате сдачи, задания со счётчиком — по дате подтверждения. Репорты — начисления за задания, а не выводы из банка.</p>`;
    state.taskAnalyticsPeopleLimit = 20;
    renderAnalyticsChart();
    renderAnalyticsPeople();
  }

  function renderAnalyticsChart() {
    if (!canViewTaskAnalytics() || !state.taskAnalytics) return;
    const container = $('#task-analytics-chart');
    if (!container) return;
    const days = state.taskAnalytics.days;
    const metric = ({completed:'completed',reports:'reports',xp:'xp'})[$('#task-analytics-metric')?.value] || 'completed';
    const max = Math.max(0, ...days.map(item => Number(item[metric]) || 0));
    const late = days.length > 15;
    container.innerHTML = max > 0 ? `<div class="ta-chart ${late ? 'ta-many-days' : ''}" role="group" aria-label="Показатели по дням">
      ${days.map((item,index) => `<button class="ta-day" type="button" data-ta-day="${index}" aria-pressed="false" aria-label="${esc(analyticsDate(item.date))}: ${analyticsNumber(item[metric])}">
        <span class="ta-bar-track"><i class="ta-bar" style="--ta-height:${100 * (Number(item[metric]) || 0) / max}%"></i></span>
        <span class="ta-axis" aria-hidden="true">${esc(item.date.slice(-2))}</span></button>`).join('')}
    </div><p class="ta-chart-detail" id="task-analytics-day-detail" aria-live="polite">Выберите день на графике</p>` : empty('По этому показателю за выбранный период нет данных');
  }

  async function loadTaskAnalytics({force = false} = {}) {
    if (!canViewTaskAnalytics()) return;
    const period = $('#task-analytics-period').value || 'week';
    if (!force && state.taskAnalytics?.period === period && Date.now() - state.taskAnalyticsFetchedAt < 60000) return;
    if (!force && state.taskAnalyticsPending === period && !state.taskAnalyticsController?.signal.aborted) return;
    state.taskAnalyticsController?.abort();
    const controller = new AbortController();
    state.taskAnalyticsController = controller;
    state.taskAnalyticsPending = period;
    state.taskAnalytics = null;
    const status = $('#task-analytics-status');
    status.hidden = false;
    status.textContent = 'Загружаем статистику…';
    $('#task-analytics-result').innerHTML = '';
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const data = await api('task_analytics', {period}, {signal:controller.signal});
      if (controller.signal.aborted || state.taskAnalyticsController !== controller || !canViewTaskAnalytics()) return;
      state.taskAnalytics = data;
      state.taskAnalyticsFetchedAt = Date.now();
      renderTaskAnalytics();
      status.hidden = true;
    } catch (error) {
      if (state.taskAnalyticsController === controller && canViewTaskAnalytics()) {
        state.taskAnalytics = null;
        status.textContent = controller.signal.aborted ? 'Статистика не ответила вовремя. Нажмите «Обновить».' : error.message;
      }
    } finally {
      clearTimeout(timeout);
      if (state.taskAnalyticsController === controller) state.taskAnalyticsPending = null;
    }
  }

  async function takeTask(templateId) {
    if (state.taking) return;
    if (slotOccupied()) { toast('Сначала завершите текущее задание или дождитесь его проверки.'); return; }
    const template = state.data.templates.find(item => item.template_id === templateId);
    if (!template || urgentPublicationEnded(template) || template.publication_available === false) return;
    state.taking = true;
    renderCatalog();
    try {
      const details = `${template.description}${template.instructions ? `\n\nПравила:\n${template.instructions}` : ''}\n\nОдновременно можно выполнять одно задание. Отчёт на проверке тоже занимает слот.`;
      const accepted = await askDecision({ title:'Взять задание?', text:details, confirm:'Взять' });
      if (accepted === null) return;
      await api('take_task', {template_id:templateId});
      await reload({quiet:true});
      switchTab('admin', 'active');
      toast('Задание взято. Оно появилось во вкладке «В работе».');
    } catch (error) {
      toast(error.message);
      await reload({quiet:true});
    } finally {
      state.taking = false;
      if (state.data) renderCatalog();
    }
  }

  function askDecision({ eyebrow = 'Подтверждение', title, text, reason = false, confirm = 'Подтвердить',
    reasonLabel = 'Причина', reasonValue = '', requireText = false } = {}) {
    return new Promise(resolve => {
      const dialog = $('#decision-dialog');
      $('#dialog-eyebrow').textContent = eyebrow;
      $('#dialog-title').textContent = title;
      $('#dialog-text').textContent = text || '';
      $('#reason-wrap').hidden = !reason;
      $('#dialog-reason-label').textContent = reasonLabel;
      const textarea = $('#dialog-reason');
      textarea.value = reasonValue;
      textarea.required = requireText;
      textarea.maxLength = requireText ? 1500 : 1000;
      textarea.placeholder = requireText ? 'Кратко опишите результат' : 'Обязательный комментарий';
      $('#dialog-confirm').textContent = confirm;
      dialog.returnValue = 'cancel';
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
    // A previously deployed server may not expose its upload limit yet.
    const limit = state.data?.max_evidence_files ?? 5;
    const attached = (state.data?.evidence || []).filter(file => file.assignment_id === assignmentId).length;
    if (files.length > Math.max(0, limit - attached)) {
      throw new Error(`Можно прикрепить не более ${limit} файлов на одно задание.`);
    }
    for (const source of files) {
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

  function openTemplateEditor(item = null, {republish = false} = {}) {
    state.republishingTemplate = republish;
    $('#template-id').value = item?.template_id || '';
    $('#create-title').value = item?.title || '';
    $('#create-description').value = item?.description || '';
    $('#create-instructions').value = item?.instructions || '';
    $('#create-mode').value = item?.verification_mode || 'leadership_counter';
    $('#create-target').value = Number(item?.target_count || 1);
    $('#create-deadline').value = Number(item?.deadline_hours || 24);
    $('#create-reports').value = Number(item?.reward_reports ?? 50);
    $('#create-index').value = Number(item?.reward_index ?? 1);
    $('#create-xp').value = Number(item?.reward_xp || 10);
    $('#create-limit').value = Number(item?.completion_limit || 0);
    $('#create-limit-period').value = item?.limit_period || 'none';
    $('#create-global-limit').value = Number(item?.global_limit || 0);
    $('#create-min-level').value = item?.min_level_key || 'novice';
    $('#create-publish-from').value = republish ? '' : moscowInput(item?.publish_from);
    $('#create-publish-from').disabled = republish;
    $('#create-publish-until').value = republish ? '' : moscowInput(item?.publish_until);
    $('#create-review-hours').value = Number(item?.review_hours || 24);
    $('#create-revision-hours').value = Number(item?.revision_hours || 24);
    $('#create-stepped').checked = !!item?.reward_steps?.length;
    [150,250,350].forEach((amount,index) => { $(`#create-hour-${index+1}`).value = Number(item?.reward_steps?.[index] || amount); });
    $('#create-urgent-wrap').hidden = !state.data.supports_urgent_tasks;
    $('#create-urgent').checked = !!item?.is_urgent;
    $('#create-urgent').disabled = republish;
    $('#create-player').value = item?.player_nickname || '';
    $('#create-private-details').value = item?.private_details || '';
    syncUrgentTemplateForm({defaults:republish});
    $('#template-dialog-eyebrow').textContent = republish ? 'Горящее задание' : item ? 'Редактирование' : 'Новый шаблон';
    $('#template-dialog-title').textContent = republish ? 'Новая публикация' : item ? 'Настроить задание' : 'Создать задание';
    $('#template-submit').textContent = republish ? 'Опубликовать снова' : item ? 'Сохранить изменения' : 'Создать шаблон';
    $('#create-dialog').showModal();
  }

  function syncUrgentTemplateForm({defaults = false} = {}) {
    const urgent = $('#create-urgent').checked;
    const places = $('#create-global-limit');
    const until = $('#create-publish-until');
    const maxUrgentPlaces = Number(state.data?.urgent_task_max_places) || 10;
    $('#create-hot-details').hidden = !urgent;
    $('#create-min-level').disabled = urgent;
    $('#create-mode option[value="leadership_counter"]').disabled = urgent;
    $('#create-night-settings').hidden = urgent;
    places.min = urgent ? '1' : '0';
    places.max = urgent ? String(maxUrgentPlaces) : '10000';
    places.required = urgent;
    $('#create-global-limit-hint').textContent = urgent
      ? `От 1 до ${maxUrgentPlaces} разных исполнителей. Подтверждённый отчёт занимает место.`
      : '0 — без ограничения. Отказ освобождает место; подтверждённое выполнение занимает его.';
    until.required = urgent;
    if (!urgent) return;
    $('#create-min-level').value = 'novice';
    $('#create-stepped').checked = false;
    if ($('#create-mode').value === 'leadership_counter') $('#create-mode').value = 'manual_review';
    if (defaults && (!Number(places.value) || Number(places.value) > maxUrgentPlaces)) places.value = String(maxUrgentPlaces);
    if (defaults && !until.value) until.value = moscowInput(new Date(Date.now() + 4 * 3600000));
  }

  document.addEventListener('click', async event => {
    const rankPeriod = event.target.closest('[data-rank-period]');
    if (rankPeriod) { if (state.rankingPeriod !== rankPeriod.dataset.rankPeriod) {state.rankingPeriod = rankPeriod.dataset.rankPeriod; state.ranking = null;} else if (state.rankingLoading) return; await loadLeaderboard(); return; }
    if (event.target.closest('[data-rank-retry]')) { await loadLeaderboard({force:true}); return; }
    if (event.target.closest('[data-ranking-more]')) { await loadLeaderboard({more:true}); return; }
    const taskTab = event.target.closest('[data-open-task-tab]');
    if (taskTab) { switchTab('admin', taskTab.dataset.openTaskTab); $('#admin-tabs').scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'instant' : 'smooth', block:'start'}); return; }
    const role = event.target.closest('[data-role]');
    if (role) {
      if (role.dataset.role === 'settings' && !state.data.viewer.is_master) return;
      if (role.dataset.role === 'leader' && !state.data.viewer.is_leader) return;
      state.role = role.dataset.role; render(); return;
    }
    const tab = event.target.closest('.tabs [data-tab]');
    if (tab) {
      const area = tab.closest('#settings-tabs') ? 'settings' : 'admin';
      if (area === 'settings' && tab.dataset.tab === 'task-analytics' && !canViewTaskAnalytics()) return;
      switchTab(area, tab.dataset.tab);
      try {
        if (area === 'admin' && tab.dataset.tab === 'ranking') await loadLeaderboard();
        if (area === 'settings' && tab.dataset.tab === 'members') await loadMemberList();
        if (area === 'settings' && tab.dataset.tab === 'task-analytics') await loadTaskAnalytics();
        if (area === 'settings' && tab.dataset.tab === 'wallet-settings') {
          const settings = await api('wallet_settings');
          $('#weekly-withdrawal-limit').value = settings.weekly_withdrawal_limit;
        }
      } catch(error) { toast(error.message); }
      return;
    }
    if (event.target.closest('#task-analytics-refresh') && canViewTaskAnalytics()) {
      await loadTaskAnalytics({force:true});
      return;
    }
    if (event.target.closest('[data-ta-more]') && canViewTaskAnalytics()) {
      state.taskAnalyticsPeopleLimit = (state.taskAnalyticsPeopleLimit || 20) + 20;
      renderAnalyticsPeople();
      return;
    }
    const chartDay = event.target.closest('[data-ta-day]');
    if (chartDay && canViewTaskAnalytics() && state.taskAnalytics) {
      const item = state.taskAnalytics.days[Number(chartDay.dataset.taDay)];
      if (item) {
        $('#task-analytics-day-detail').textContent =
          `${analyticsDate(item.date)} · заданий: ${analyticsNumber(item.completed)} · репортов: ${analyticsNumber(item.reports)} · XP: ${analyticsNumber(item.xp)}`;
        const selected = $('#task-analytics-chart [aria-pressed="true"]');
        selected?.setAttribute?.('aria-pressed', 'false');
        chartDay.setAttribute?.('aria-pressed', 'true');
      }
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
      await takeTask(take.dataset.take);
      return;
    }
    const submit = event.target.closest('[data-submit]');
    if (submit) {
      const assignmentId = submit.dataset.submit;
      const item = activeAssignments().find(row => row.assignment_id === assignmentId);
      const urgent = !!item?.is_urgent;
      const accepted = await askDecision({
        title:'Отправить на проверку?', text:'Награда будет начислена только после решения руководства.',
        confirm:'Отправить',
        ...(urgent ? {reason:true, reasonLabel:'Итог выполнения', requireText:true,
          reasonValue:state.urgentDraft?.id === assignmentId ? state.urgentDraft.text : item.urgent_report || ''} : {}),
      });
      if (accepted === null) return;
      if (urgent && !accepted) { toast('Укажите итог выполнения задания.'); return; }
      submit.disabled = true;
      if (urgent) state.urgentDraft = {id:assignmentId, text:accepted};
      try {
        await api('submit', {assignment_id:assignmentId,...effortPayload(assignmentId),...(urgent ? {urgent_report:accepted} : {})});
        if (urgent) state.urgentDraft = null;
        await reload({quiet:true}); toast('Задание отправлено на проверку');
      } catch (error) { submit.disabled = false; toast(error.message); }
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
    const republishTemplate = event.target.closest('[data-republish-template]');
    if (republishTemplate && state.data.viewer.is_master) {
      const item = state.data.all_templates.find(template => template.template_id === republishTemplate.dataset.republishTemplate);
      if (item && urgentPublicationEnded(item)) openTemplateEditor(item, {republish:true});
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

  document.addEventListener('input', event => {
    if (event.target.id !== 'catalog-search') return;
    state.catalogQuery = event.target.value.slice(0, 100);
    renderCatalog();
  });

  document.addEventListener('change', async event => {
    if (event.target.id === 'catalog-sort') {
      state.catalogSort = event.target.value;
      renderCatalog();
      return;
    }
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

  function withdrawableAmount() {
    const wallet = state.data?.wallet || {};
    return Math.max(0, Math.min(Number(wallet.report_balance || 0),Number(wallet.weekly_remaining ?? wallet.report_balance ?? 0)));
  }

  function openWithdrawDialog() {
    if (state.withdrawing || $('#withdraw-dialog').open) return;
    const available = withdrawableAmount();
    if (!available) return toast(Number(state.data?.wallet?.report_balance || 0) ? 'Недельный лимит вывода исчерпан. Остаток сохранён в банке.' : 'В банке пока нет бонусных репортов');
    $('#withdraw-available').textContent = `Сейчас доступно к выводу: ${available} репортов.`;
    $('#withdraw-amount').max = String(available);
    $('#withdraw-amount').value = String(available);
    $('#withdraw-error').hidden = true;
    $('#withdraw-error').textContent = '';
    $('#withdraw-dialog').showModal();
    $('#withdraw-amount').focus();
    $('#withdraw-amount').select();
  }

  function setWithdrawalBusy(busy) {
    state.withdrawing = busy;
    ['#withdraw-amount','#withdraw-confirm','#withdraw-close','#withdraw-cancel'].forEach(id => { $(id).disabled = busy; });
    $('#withdraw-button').disabled = busy || withdrawableAmount() <= 0;
    $('#withdraw-confirm').textContent = busy ? 'Отправляем…' : 'Вывести';
  }

  async function submitWithdrawal(event) {
    event.preventDefault();
    if (state.withdrawing) return;
    const available = withdrawableAmount();
    $('#withdraw-amount').max = String(available);
    $('#withdraw-available').textContent = `Сейчас доступно к выводу: ${available} репортов.`;
    const raw = $('#withdraw-amount').value.trim();
    const amount = Number(raw);
    $('#withdraw-error').hidden = true;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(amount) || amount < 1 || amount > available) {
      $('#withdraw-error').textContent = available > 0 ? `Укажите целое число от 1 до ${available}.` : 'Недельный лимит вывода исчерпан. Остаток сохранён в банке.';
      $('#withdraw-error').hidden = false;
      $('#withdraw-amount').focus();
      return;
    }
    const opName = `admin-task-withdraw:${state.data.viewer.user_id}:${amount}`;
    const operationId = sessionStorage.getItem(opName) || `withdraw:${state.data.viewer.user_id}:${crypto.randomUUID()}`;
    sessionStorage.setItem(opName,operationId);
    setWithdrawalBusy(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      await api('withdraw',{amount,operation_id:operationId},{signal:controller.signal});
      sessionStorage.removeItem(opName);
      $('#withdraw-dialog').close();
      await reload({quiet:true});
      toast('Репорты поставлены в очередь на вывод');
    } catch (error) {
      $('#withdraw-error').textContent = error.name === 'AbortError'
        ? 'Подтверждение вывода задержалось. Повторите попытку — повторный запрос не спишет репорты ещё раз.' : error.message;
      $('#withdraw-error').hidden = false;
    } finally { clearTimeout(timeout); setWithdrawalBusy(false); }
  }

  $('#withdraw-button').addEventListener('click', openWithdrawDialog);
  $('#withdraw-form').addEventListener('submit', submitWithdrawal);
  ['#withdraw-close','#withdraw-cancel'].forEach(id => $(id).addEventListener('click', () => {
    if (!state.withdrawing) $('#withdraw-dialog').close();
  }));
  $('#withdraw-dialog').addEventListener('cancel', event => { if (state.withdrawing) event.preventDefault(); });

  $('#task-analytics-period').addEventListener('change', () => loadTaskAnalytics());
  $('#task-analytics-result').addEventListener('input', event => {
    if (event.target.id === 'task-analytics-search') {
      state.taskAnalyticsPeopleLimit = 20;
      renderAnalyticsPeople();
    }
  });
  $('#task-analytics-result').addEventListener('change', event => {
    if (event.target.id === 'task-analytics-metric') renderAnalyticsChart();
    if (event.target.id === 'task-analytics-rights') {
      state.taskAnalyticsPeopleLimit = 20;
      renderAnalyticsPeople();
    }
  });
  $('#member-select').addEventListener('change', () => { if ($('#member-select').value) $('#member-id').value = $('#member-select').value; });
  $('#create-stepped').addEventListener('change', () => {
    if (!$('#create-stepped').checked) return;
    $('#create-mode').value = 'evidence_review'; $('#create-limit-period').value = 'night'; $('#create-limit').value = 3;
  });

  $('#create-urgent').addEventListener('change', () => syncUrgentTemplateForm({defaults:true}));
  $('#create-close').addEventListener('click', () => $('#create-dialog').close());
  $('#create-form').addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = $('#template-submit');
    if (submitButton.disabled) return;
    submitButton.disabled = true;
    try {
      const templateId = $('#template-id').value;
      const republish = state.republishingTemplate && templateId;
      const action = republish ? 'republish_urgent_template' : templateId ? 'update_template' : 'create_template';
      const urgent = $('#create-urgent').checked;
      await api(action, {
        template_id:templateId,title:$('#create-title').value.trim(),description:$('#create-description').value.trim(),instructions:$('#create-instructions').value.trim(),verification_mode:$('#create-mode').value,
        target_count:Number($('#create-target').value),deadline_hours:Number($('#create-deadline').value),reward_reports:$('#create-stepped').checked ? Number($('#create-hour-1').value) : Number($('#create-reports').value),reward_index:Number($('#create-index').value),reward_xp:Number($('#create-xp').value),completion_limit:Number($('#create-limit').value),limit_period:$('#create-limit-period').value,
        global_limit:Number($('#create-global-limit').value),min_level_key:$('#create-min-level').value,publish_from:$('#create-publish-from').value,publish_until:$('#create-publish-until').value,review_hours:Number($('#create-review-hours').value),revision_hours:Number($('#create-revision-hours').value),reward_steps:$('#create-stepped').checked ? [1,2,3].map(hour => Number($(`#create-hour-${hour}`).value)) : [],
        ...(state.data.supports_urgent_tasks ? {is_urgent:urgent,player_nickname:urgent ? $('#create-player').value.trim() : '',
          private_details:urgent ? $('#create-private-details').value.trim() : ''} : {}),
      });
      $('#create-dialog').close(); await reload({quiet:true});
      state.role = 'settings'; state.settingsTab = 'templates'; render();
      toast(republish ? 'Задание опубликовано снова' : templateId ? 'Задание обновлено' : 'Шаблон создан');
    } catch (error) { toast(error.message); }
    finally { submitButton.disabled = false; }
  });

  reload();
})();
