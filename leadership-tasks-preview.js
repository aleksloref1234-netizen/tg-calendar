(() => {
  'use strict';

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const APP_MODE = document.body.dataset.mode || 'team';
  const STORAGE_KEY = 'leadership-task-preview-v4';
  const API_URL = 'https://tg-admin-bot-1k1g.onrender.com/api/leadership/tasks';
  const URL_PARAMS = new URLSearchParams(window.location.search);
  const PREVIEW_MODE = URL_PARAMS.get('preview') === '1'
    || !tg || !tg.initData;
  const LOCAL_GA_VIEW = PREVIEW_MODE && URL_PARAMS.get('ga_view') === '1';

  let roles = [
    { id: 'main', nickname: 'Alexandr_Ermakov', title: 'Основной заместитель ГА', initials: 'AE' },
    { id: 'deputy', nickname: 'Maksim_River', title: 'Заместитель ГА', initials: 'MR' },
    { id: 'org', nickname: 'Dmitry_Orlov', title: 'Куратор организаций', initials: 'DO' },
    { id: 'admin', nickname: 'Ivan_Storm', title: 'Куратор администрации', initials: 'IS' },
    { id: 'support', nickname: 'Nikolay_West', title: 'Куратор агентов поддержки', initials: 'NW' }
  ];

  const templates = {
    main: [
      task('reports', 'Сдача всех отчётов', 'Отчётность', '22:00', 30, 'high', { days: allDays(), fixed: true, repeat: 'Ежедневно' }),
      task('forum', 'Проверка форума на просрочки', 'Форум', '20:00', 25, 'high', { day: 0 }),
      task('appeals', 'Рассмотрение обжалований', 'Контроль', '19:00', 35, 'medium', { day: 2 }),
      task('vk', 'Проверка личных сообщений ВКонтакте', 'Коммуникации', '18:30', 20, 'normal', { day: 4 }),
      task('blacklist', 'Просмотр форм на выдачу ЧС от главных следящих', 'Проверка', '20:30', 25, 'medium', { day: 1 }),
      task('leaders', 'Проверка рекламы и работы по набору лидеров', 'Набор', '21:00', 30, 'normal', { day: 3 }),
      task('meeting', 'Собрание руководящего состава', 'Собрание', '20:00', 45, 'high', { day: 6, fixed: true, repeat: 'По воскресеньям' })
    ],
    deputy: [
      task('control', 'Контроль работы администрации', 'Контроль', '22:00', 30, 'high', { days: allDays(), fixed: true, repeat: 'Ежедневно' }),
      task('curators', 'Проверка отчётности кураторов', 'Отчётность', '21:00', 40, 'high', { day: 0 }),
      task('messages', 'Проверка личных сообщений ВКонтакте', 'Коммуникации', '19:00', 20, 'normal', { day: 2 }),
      task('review', 'Сводка проблем по направлениям', 'Аналитика', '20:30', 35, 'medium', { day: 4 }),
      task('call', 'Созвон с руководителями направлений', 'Коммуникации', '20:00', 45, 'medium', { day: 6, fixed: true, repeat: 'По воскресеньям' })
    ],
    org: [
      task('server', 'Время на сервере', 'Сервер', '23:30', 75, 'high', { days: allDays(), fixed: true, repeat: 'Ежедневно' }),
      task('complaints', 'Рассмотрение жалоб на лидеров', 'Жалобы', '22:30', 35, 'high', { day: 0 }),
      task('applications', 'Проверка заявок на лидерские должности', 'Набор', '20:00', 30, 'medium', { day: 2 }),
      task('reports', 'Сбор отчётности следящих', 'Отчётность', '21:30', 40, 'medium', { day: 4 }),
      task('forum', 'Проверка лидерского раздела', 'Форум', '22:00', 30, 'normal', { day: 5 })
    ],
    admin: [
      task('inactive', 'Контроль неактивов и освобождений', 'Кадры', '19:30', 25, 'medium', { days: allDays(), fixed: true, repeat: 'Ежедневно' }),
      task('performance', 'Проверка недельной успеваемости администрации', 'Успеваемость', '20:00', 40, 'high', { day: 0 }),
      task('appeals', 'Проверка обращений администрации', 'Коммуникации', '21:00', 30, 'normal', { day: 2 }),
      task('violations', 'Подготовка сводки по нарушениям', 'Аналитика', '20:00', 35, 'medium', { day: 4 }),
      task('meeting', 'Подготовка материалов к собранию', 'Собрание', '18:00', 30, 'medium', { day: 6, fixed: true, repeat: 'По воскресеньям' })
    ],
    support: [
      task('server', 'Время на сервере', 'Сервер', '22:00', 70, 'high', { days: allDays(), fixed: true, repeat: 'Ежедневно' }),
      task('forum', 'Проверка раздела агентов поддержки', 'Форум', '20:30', 25, 'medium', { day: 0 }),
      task('logs', 'Проверка ответов агентов через логи', 'Контроль', '21:00', 35, 'medium', { day: 2 }),
      task('standard', 'Выставление норматива агентам поддержки', 'Норматив', '19:00', 30, 'normal', { day: 4 }),
      task('complaints', 'Рассмотрение жалоб на агентов поддержки', 'Жалобы', '21:30', 35, 'high', { day: 5 })
    ]
  };

  const state = {
    role: 'main',
    dateMode: 'week',
    planWeek: 0,
    masterPriority: 'all',
    masterStatus: 'all',
    masterRole: 'all',
    masterSearch: '',
    activeTask: null,
    viewer: null,
    persistence: PREVIEW_MODE ? {
      unsaved: 0,
      pending: 0,
      processing: 0,
      errors: 0,
      completed: 24,
      last_completed_at: new Date().toISOString(),
      recent: []
    } : null,
    loading: !PREVIEW_MODE,
    tasks: loadTasks()
  };

  function allDays() { return [0, 1, 2, 3, 4, 5, 6]; }

  function task(key, title, category, due, minutes, priority, schedule) {
    return {
      key,
      title,
      category,
      due,
      minutes,
      priority,
      fixed: false,
      repeat: 'Раз в неделю',
      description: `Выполнить задачу «${title}» и зафиксировать итоговый результат.`,
      ...schedule
    };
  }

  function localIso(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function todayIso() { return localIso(new Date()); }

  function moscowTodayIso() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  function canMarkTask(item) {
    return PREVIEW_MODE || item.date === moscowTodayIso();
  }

  function mondayOf(base = new Date(), weekOffset = 0) {
    const date = new Date(base);
    date.setHours(12, 0, 0, 0);
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1 + weekOffset * 7);
    return date;
  }

  function weekDates(weekOffset = 0) {
    const monday = mondayOf(new Date(), weekOffset);
    return allDays().map(index => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return localIso(date);
    });
  }

  function hash(value) {
    return String(value).split('').reduce((sum, character) => ((sum * 31) + character.charCodeAt(0)) >>> 0, 7);
  }

  function initialStatus(id, date) {
    const today = todayIso();
    if (date < today) return hash(id) % 7 === 0 ? 'failed' : 'done';
    if (date === today) return hash(id) % 3 === 0 ? 'done' : 'todo';
    return 'todo';
  }

  function buildWeek(roleId, weekOffset = 0, preview = false) {
    const dates = weekDates(weekOffset);
    const result = [];
    for (const definition of templates[roleId]) {
      const baseDays = definition.days || [definition.day];
      for (const baseDay of baseDays) {
        const plannedDay = weekOffset > 0 && !definition.fixed && !definition.days ? (baseDay + weekOffset) % 7 : baseDay;
        const id = `${roleId}-${definition.key}-${plannedDay}-${dates[0]}`;
        const status = preview ? 'todo' : initialStatus(id, dates[plannedDay]);
        result.push({
          ...definition,
          id,
          role: roleId,
          date: dates[plannedDay],
          baseDay,
          plannedDay,
          status,
          completedAt: status === 'done' ? `${formatDate(dates[plannedDay], { day: '2-digit', month: '2-digit' })} 20:14` : '',
          history: [{ at: `${formatDate(dates[plannedDay], { day: '2-digit', month: '2-digit' })} 09:00`, text: 'Задача добавлена в недельный план' }]
        });
      }
    }
    return result;
  }

  function seedTasks() {
    return roles.flatMap(role => buildWeek(role.id));
  }

  function loadTasks() {
    if (!PREVIEW_MODE) return [];
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(stored) && stored.length && stored.every(item => !item.transferredTo && item.role)) {
        return stored.map(item => ({
          description: `Выполнить задачу «${item.title}» и зафиксировать итоговый результат.`,
          history: [],
          ...item,
          history: Array.isArray(item.history) ? item.history : []
        }));
      }
    } catch (_) {}
    return seedTasks();
  }

  function saveTasks() {
    if (PREVIEW_MODE) localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  }

  function isGaTeamPreview() {
    return APP_MODE === 'team' && (LOCAL_GA_VIEW || Boolean(state.viewer?.is_ga));
  }

  async function apiRequest(action, payload = {}) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': tg ? (tg.initData || '') : ''
      },
      body: JSON.stringify({ action, ...payload })
    });
    let result = {};
    try { result = await response.json(); } catch (_) {}
    if (!response.ok || result.status !== 'success') {
      throw new Error(result.message || 'Не удалось обработать запрос');
    }
    return result.data || {};
  }

  async function loadLiveData({ quiet = false } = {}) {
    if (PREVIEW_MODE) return;
    try {
      const data = await apiRequest('bootstrap');
      if (APP_MODE === 'master' && !data.viewer?.is_ga) {
        throw new Error('Окно контроля доступно только ГА');
      }
      roles = Array.isArray(data.roles) && data.roles.length ? data.roles : roles;
      state.viewer = data.viewer || null;
      state.persistence = data.persistence || null;
      state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
      state.role = APP_MODE === 'master'
        ? (roles.some(role => role.id === state.role) ? state.role : roles[0].id)
        : (data.viewer?.is_ga
          ? (roles.some(role => role.id === state.role) ? state.role : roles[0].id)
          : (data.viewer?.role_id || roles[0].id));
      state.loading = false;
      initRoleSelect(true);
      initMasterRoleOptions();
      renderAll();
    } catch (error) {
      state.loading = false;
      if (!quiet) showFatalError(error.message || 'Не удалось загрузить задачник');
      else showToast(error.message || 'Не удалось обновить данные');
    }
  }

  function showFatalError(message) {
    const target = document.querySelector('main');
    if (!target) return;
    target.innerHTML = `<article class="card empty" style="margin-top:48px"><strong>Не удалось загрузить задачник</strong>${escapeHtml(message)}<div class="form-actions"><button class="btn primary" id="retry-load" type="button">Повторить</button></div></article>`;
    const retry = document.getElementById('retry-load');
    if (retry) retry.addEventListener('click', () => window.location.reload());
  }

  function nowStamp() {
    return new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function withHistory(item, text) {
    const history = Array.isArray(item.history) ? item.history.slice(-7) : [];
    history.push({ at: nowStamp(), text });
    return history;
  }

  function getRole(id = state.role) {
    return roles.find(role => role.id === id) || roles[0];
  }

  function formatDate(iso, options = {}) {
    return new Intl.DateTimeFormat('ru-RU', options).format(new Date(`${iso}T12:00:00`));
  }

  function statusLabel(status) {
    return ({ done: 'Выполнено', failed: 'Не выполнено', todo: 'К выполнению' })[status] || 'К выполнению';
  }

  function priorityLabel(priority) {
    return ({ high: 'Критический', medium: 'Высокий', normal: 'Плановый' })[priority] || 'Плановый';
  }

  function taskWord(number) {
    const value = Math.abs(Number(number)) % 100;
    const last = value % 10;
    if (value > 10 && value < 20) return 'задач';
    if (last === 1) return 'задача';
    if (last >= 2 && last <= 4) return 'задачи';
    return 'задач';
  }

  function visibleTasks() {
    const currentWeek = weekDates();
    const own = state.tasks.filter(item => item.role === state.role);
    return own.filter(item => state.dateMode === 'week'
      ? currentWeek.includes(item.date)
      : item.date === state.dateMode);
  }

  function initRoleSelect(refresh = false) {
    const select = document.getElementById('role-select');
    if (!select) return;
    select.innerHTML = roles.map(role => `<option value="${role.id}">${escapeHtml(role.title)}</option>`).join('');
    select.value = state.role;
    if (APP_MODE === 'team') {
      select.hidden = !isGaTeamPreview();
      const previewNote = document.getElementById('ga-preview-note');
      if (previewNote) previewNote.hidden = !isGaTeamPreview();
      const backLink = document.getElementById('portal-back-link');
      if (backLink) backLink.hidden = !isGaTeamPreview();
    }
    if (!select.dataset.bound) {
      select.dataset.bound = '1';
      select.addEventListener('change', () => {
        state.role = select.value;
        renderAll();
      });
    }
  }

  function renderIdentity() {
    const role = getRole();
    const avatar = document.getElementById('avatar');
    if (!avatar) return;
    if (APP_MODE === 'master') {
      avatar.textContent = 'ГА';
      document.getElementById('identity-name').textContent = state.viewer?.nickname || 'ГА';
      document.getElementById('identity-role').textContent = `Фильтр статистики: ${role.title}`;
      return;
    }
    if (isGaTeamPreview()) {
      avatar.textContent = role.initials;
      document.getElementById('identity-name').textContent = role.nickname;
      document.getElementById('identity-role').textContent = role.title;
      return;
    }
    avatar.textContent = state.viewer?.initials || role.initials;
    document.getElementById('identity-name').textContent = state.viewer?.nickname || role.nickname;
    document.getElementById('identity-role').textContent = state.viewer?.role_title || role.title;
  }

  function renderDateStrip() {
    const days = weekDates();
    if (state.dateMode !== 'week' && !days.includes(state.dateMode)) state.dateMode = 'week';
    const dates = [
      { mode: 'week', title: 'Вся неделя', label: `${formatDate(days[0], { day: '2-digit', month: '2-digit' })}–${formatDate(days[6], { day: '2-digit', month: '2-digit' })}` },
      ...days.map((date, index) => ({
        mode: date,
        title: DAY_NAMES[index],
        label: formatDate(date, { day: '2-digit', month: '2-digit' })
      }))
    ];
    document.getElementById('date-strip').innerHTML = dates.map(item => `<button class="date-chip ${state.dateMode === item.mode ? 'active' : ''}" data-date-mode="${item.mode}" aria-pressed="${state.dateMode === item.mode}" type="button"><strong>${item.title}</strong><span>${item.label}</span></button>`).join('');
    document.querySelectorAll('[data-date-mode]').forEach(button => button.addEventListener('click', () => {
      state.dateMode = button.dataset.dateMode;
      renderPersonal();
    }));
  }

  function renderPersonal() {
    renderDateStrip();
    const weekMode = state.dateMode === 'week';
    const byPriority = (a, b) => ({ high: 0, medium: 1, normal: 2 }[a.priority] - { high: 0, medium: 1, normal: 2 }[b.priority]) || a.due.localeCompare(b.due);
    const tasks = visibleTasks().sort((a, b) => (weekMode ? a.date.localeCompare(b.date) : 0) || byPriority(a, b));
    const done = tasks.filter(item => item.status === 'done').length;
    const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    document.getElementById('metric-total').textContent = tasks.length;
    document.getElementById('metric-done').textContent = done;
    document.getElementById('metric-scope').textContent = weekMode ? 'на текущую неделю' : `на ${formatDate(state.dateMode, { day: '2-digit', month: '2-digit' })}`;
    document.getElementById('progress-value').textContent = `${progress}%`;
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-note').textContent = weekMode ? `Выполнено ${done} из ${tasks.length}. Недельный КПД формируется автоматически.` : `Выполнено ${done} из ${tasks.length}. Отметка сразу попадает в недельную статистику.`;
    document.getElementById('tasks-heading').textContent = weekMode ? 'Расписание на неделю' : DAY_NAMES[weekDates().indexOf(state.dateMode)];
    document.getElementById('tasks-note').textContent = weekMode ? 'по дням' : tasks.length ? 'сначала срочные' : 'задач нет';
    const list = document.getElementById('tasks-list');
    if (!tasks.length && !weekMode) {
      list.innerHTML = '<div class="card empty"><strong>На этот период задач нет</strong>Следующая задача появится по недельному графику этой должности.</div>';
      return;
    }
    list.innerHTML = weekMode
      ? weekDates().map((date, index) => {
        const dayTasks = tasks.filter(item => item.date === date);
        return `<section class="day-group" aria-label="${DAY_NAMES[index]}">
          <div class="day-group-head"><h3>${DAY_NAMES[index]}</h3><span>${formatDate(date, { day: '2-digit', month: '2-digit' })} · ${dayTasks.length} ${taskWord(dayTasks.length)}</span></div>
          <div class="day-group-tasks">${dayTasks.length ? dayTasks.map(taskCard).join('') : '<div class="card day-empty">Задач нет</div>'}</div>
        </section>`;
      }).join('')
      : tasks.map(taskCard).join('');
    bindTaskActions();
  }

  function taskCard(item) {
    const statusClass = item.status === 'done' ? 'done' : item.status === 'failed' ? 'failed' : '';
    const markingOpen = canMarkTask(item);
    const disabled = item.status !== 'todo' || isGaTeamPreview() || !markingOpen ? 'disabled' : '';
    const completion = item.completedAt ? ` · отметка ${escapeHtml(item.completedAt)}` : '';
    const comment = item.comment ? `<div class="task-comment">${escapeHtml(item.comment)}</div>` : '';
    const category = visibleCategory(item.category);
    const categoryTag = category ? `<span class="tag">${escapeHtml(category)}</span>` : '';
    return `<article class="card task ${statusClass}" data-task-id="${item.id}" data-open-task="${item.id}" tabindex="0" role="button" aria-label="Открыть задачу ${escapeHtml(item.title)}">
      <div class="task-overline"><span class="tag ${item.priority}">${priorityLabel(item.priority)}</span>${categoryTag}<span class="tag ${item.status === 'done' ? 'done' : item.status === 'todo' ? 'blue' : 'high'}">${statusLabel(item.status)}</span></div>
      <div class="task-title">${escapeHtml(item.title)}</div>
      <div class="task-meta">${formatDate(item.date, { weekday: 'long', day: '2-digit', month: 'long' })} · ${escapeHtml(item.repeat)}${completion}</div>
      ${comment}
      ${!markingOpen && item.status === 'todo' ? '<div class="task-comment">Отметка доступна только в день задачи до 00:00 МСК.</div>' : ''}
      <div class="task-footer"><div class="task-time">До ${item.due}<span>Расчётное время: ${item.minutes} минут</span></div><div class="task-actions"><button class="btn danger" data-fail="${item.id}" ${disabled} type="button">Не выполнено</button><button class="btn success" data-done="${item.id}" ${disabled} type="button">Выполнено</button></div></div>
    </article>`;
  }

  function bindTaskActions() {
    document.querySelectorAll('[data-done]').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      updateTask(button.dataset.done, {
      status: 'done',
      completedAt: `${formatDate(todayIso(), { day: '2-digit', month: '2-digit' })} ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
      comment: ''
      }, 'Задача отмечена выполненной');
    }));
    document.querySelectorAll('[data-fail]').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      openFailure(button.dataset.fail);
    }));
    document.querySelectorAll('[data-open-task]').forEach(card => {
      card.addEventListener('click', () => openTaskDetails(card.dataset.openTask));
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openTaskDetails(card.dataset.openTask);
        }
      });
    });
  }

  async function updateTask(id, patch, message) {
    if (isGaTeamPreview()) {
      showToast('В режиме просмотра ГА отметки не изменяются');
      return;
    }
    const index = state.tasks.findIndex(item => item.id === id);
    if (index < 0) return;
    const current = state.tasks[index];
    if (!canMarkTask(current)) {
      showToast('Отметка доступна только в день задачи до 00:00 МСК');
      return;
    }
    state.tasks[index] = { ...current, ...patch, history: withHistory(current, message) };
    saveTasks();
    renderAll();
    if (PREVIEW_MODE) {
      showToast(message);
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      return;
    }
    showToast('Отметка принята');
    try {
      await apiRequest('set_status', {
        occurrence_id: current.id,
        task_id: current.task_id,
        status: patch.status,
        comment: patch.comment || ''
      });
      await loadLiveData({ quiet: true });
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      state.tasks[index] = current;
      renderAll();
      showToast(error.message || 'Не удалось сохранить отметку');
    }
  }

  function openFailure(id) {
    if (isGaTeamPreview()) {
      showToast('В режиме просмотра ГА отметки не изменяются');
      return;
    }
    const item = state.tasks.find(taskItem => taskItem.id === id);
    if (!item || !canMarkTask(item)) {
      showToast('Отметка доступна только в день задачи до 00:00 МСК');
      return;
    }
    state.activeTask = id;
    closeModal('task-detail-modal');
    document.getElementById('failure-reason').value = '';
    document.getElementById('failure-comment').value = '';
    document.getElementById('failure-modal').classList.add('open');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
  }

  function historyMarkup(item) {
    const history = Array.isArray(item.history) ? item.history.slice().reverse() : [];
    if (!history.length) return '<div class="history-item"><time>—</time><span>Изменений пока нет</span></div>';
    return history.map(entry => `<div class="history-item"><time>${escapeHtml(entry.at)}</time><span>${escapeHtml(entry.text)}</span></div>`).join('');
  }

  function visibleCategory(value) {
    const category = String(value || '').trim();
    return category.replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU') === 'импорт из таблицы'
      ? ''
      : category;
  }

  function openTaskDetails(id) {
    const item = state.tasks.find(taskItem => taskItem.id === id);
    if (!item) return;
    state.activeTask = id;
    if (APP_MODE === 'master') {
      openMasterTaskEditor(item);
      return;
    }
    const modal = document.getElementById('task-detail-modal');
    if (!modal) return;
    document.getElementById('task-detail-title').textContent = item.title;
    const category = visibleCategory(item.category);
    const categoryTag = category ? `<span class="tag">${escapeHtml(category)}</span>` : '';
    document.getElementById('task-detail-tags').innerHTML = `<span class="tag ${item.priority}">${priorityLabel(item.priority)}</span>${categoryTag}<span class="tag ${item.status === 'done' ? 'done' : item.status === 'failed' ? 'high' : 'blue'}">${statusLabel(item.status)}</span>`;
    document.getElementById('task-detail-grid').innerHTML = [
      ['Дата', formatDate(item.date, { weekday: 'long', day: '2-digit', month: 'long' })],
      ['Срок', item.due],
      ['Расчётное время', `${item.minutes} минут`],
      ['Повторение', item.repeat]
    ].map(([label, value]) => `<div class="detail-cell"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
    document.getElementById('task-detail-description').textContent = item.description || 'Описание для этой задачи пока не добавлено.';
    const readonly = isGaTeamPreview();
    const closedDay = !canMarkTask(item);
    document.getElementById('detail-reopen').hidden = readonly || closedDay || item.status === 'todo';
    document.getElementById('detail-fail').hidden = readonly || closedDay || item.status !== 'todo';
    document.getElementById('detail-done').hidden = readonly || closedDay || item.status !== 'todo';
    modal.classList.add('open');
  }

  function renderProgress() {
    const currentWeek = weekDates();
    const cards = roles.map(role => {
      const roleTasks = state.tasks.filter(item => item.role === role.id && currentWeek.includes(item.date));
      const done = roleTasks.filter(item => item.status === 'done').length;
      const risk = roleTasks.filter(item => item.status === 'failed' || (item.status === 'todo' && item.date < todayIso())).length;
      const minutes = roleTasks.reduce((sum, item) => sum + item.minutes, 0);
      return { role, tasks: roleTasks, done, risk, minutes, progress: roleTasks.length ? Math.round(done / roleTasks.length * 100) : 0 };
    });
    document.getElementById('team-total').textContent = cards.length;
    document.getElementById('team-done').textContent = cards.reduce((sum, card) => sum + card.done, 0);
    document.getElementById('team-risk').textContent = cards.reduce((sum, card) => sum + card.risk, 0);
    document.getElementById('leader-list').innerHTML = cards.map(card => `<article class="card leader ${card.role.id === state.role ? 'selected' : ''}" data-master-role="${card.role.id}"><div class="leader-head"><div><div class="leader-name">${escapeHtml(card.role.nickname)}</div><div class="leader-role">${escapeHtml(card.role.title)}</div></div><span class="load-badge ${card.minutes > 500 ? 'warn' : ''}">${card.minutes} мин/нед.</span></div><div class="leader-stats"><div class="leader-stat"><span>Всего</span><strong>${card.tasks.length}</strong></div><div class="leader-stat"><span>Готово</span><strong>${card.done}</strong></div><div class="leader-stat"><span>Риск</span><strong>${card.risk}</strong></div><div class="leader-stat"><span>КПД</span><strong>${card.progress}%</strong></div></div><div class="load-line"><div class="load-fill ${card.minutes > 500 ? 'warn' : ''}" style="width:${Math.min(100, card.minutes / 6)}%"></div></div><div class="leader-risk">${card.risk ? `Без результата: ${card.risk}. Требуется комментарий руководителя.` : 'Просроченных задач без результата нет.'}</div></article>`).join('');
    document.querySelectorAll('[data-master-role]').forEach(card => card.addEventListener('click', () => {
      state.role = card.dataset.masterRole;
      const select = document.getElementById('role-select');
      if (select) select.value = state.role;
      renderIdentity();
      renderProgress();
      showToast(`Открыта статистика: ${getRole().title}`);
    }));
    renderChart();
  }

  function renderPersistenceStatus() {
    const stateNode = document.getElementById('sync-state');
    if (!stateNode) return;
    const status = state.persistence || {
      unsaved: 0,
      errors: 0,
      last_completed_at: '',
      recent: []
    };
    const unsaved = Number(status.unsaved || 0);
    const errors = Number(status.errors || 0);
    stateNode.textContent = errors ? 'Требует внимания' : (unsaved ? 'Сохраняется' : 'Все сохранено');
    stateNode.classList.toggle('warn', Boolean(unsaved && !errors));
    stateNode.classList.toggle('error', Boolean(errors));
    document.getElementById('sync-unsaved').textContent = unsaved;
    document.getElementById('sync-errors').textContent = errors;
    const completedAt = String(status.last_completed_at || '');
    let lastLabel = '—';
    if (completedAt) {
      const parsed = new Date(completedAt);
      lastLabel = Number.isNaN(parsed.getTime())
        ? completedAt
        : parsed.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
    document.getElementById('sync-last').textContent = lastLabel;
    const recent = Array.isArray(status.recent) ? status.recent : [];
    const journal = document.getElementById('sync-journal');
    journal.innerHTML = recent.length
      ? recent.map(item => `<div class="sync-entry ${item.last_error ? 'error' : ''}"><strong>${item.kind === 'definition' ? 'Задача' : 'Отметка выполнения'} · попытка ${Number(item.attempts || 0)}</strong>${item.last_error ? escapeHtml(item.last_error) : 'Ожидает передачи в Google Sheets'}</div>`).join('')
      : '<div class="sync-empty">Несохранённых операций нет.</div>';
  }

  async function refreshPersistenceStatus() {
    if (PREVIEW_MODE) {
      renderPersistenceStatus();
      showToast('Все изменения сохранены');
      return;
    }
    const button = document.getElementById('sync-refresh');
    if (button) button.disabled = true;
    try {
      state.persistence = await apiRequest('persistence_status');
      renderPersistenceStatus();
      showToast(state.persistence.errors ? 'Есть операции для повторной отправки' : 'Состояние обновлено');
    } catch (error) {
      showToast(error.message || 'Не удалось обновить журнал');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function renderChart() {
    const dates = weekDates();
    const values = dates.map(date => {
      if (date > todayIso()) return null;
      const dayTasks = state.tasks.filter(item => item.role === state.role && item.date === date);
      const done = dayTasks.filter(item => item.status === 'done').length;
      return dayTasks.length ? Math.round(done / dayTasks.length * 100) : 0;
    });
    const actual = values.filter(value => value !== null);
    const kpi = actual.length ? Math.round(actual.reduce((sum, value) => sum + value, 0) / actual.length) : 0;
    document.getElementById('chart-title').textContent = getRole().title;
    document.getElementById('weekly-kpi').innerHTML = `${kpi}%<span>недельный КПД</span>`;
    const points = values.map((value, index) => ({ x: 50 + index * 88, y: value === null ? 174 : 24 + (100 - value) * 1.42, value, index }));
    const actualPoints = points.filter(point => point.value !== null);
    const line = actualPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    const area = actualPoints.length ? `${line} L ${actualPoints[actualPoints.length - 1].x} 174 L ${actualPoints[0].x} 174 Z` : '';
    document.getElementById('progress-chart').innerHTML = `<svg viewBox="0 0 640 210" role="img" aria-label="Прогресс по дням недели">
      <defs><linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3aa887" stop-opacity=".28"/><stop offset="1" stop-color="#3aa887" stop-opacity=".02"/></linearGradient></defs>
      ${[24, 74, 124, 174].map(y => `<line class="chart-grid" x1="36" y1="${y}" x2="602" y2="${y}"/>`).join('')}
      ${area ? `<path class="chart-area" d="${area}"/><path class="chart-line" d="${line}"/>` : ''}
      ${points.map(point => `<text class="chart-label" x="${point.x}" y="196" text-anchor="middle">${DAY_SHORT[point.index]}</text>${point.value === null ? `<text class="chart-value" x="${point.x}" y="166" text-anchor="middle">—</text>` : `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4"/><text class="chart-value" x="${point.x}" y="${Math.max(15, point.y - 10)}" text-anchor="middle">${point.value}%</text>`}`).join('')}
    </svg>`;
  }

  function renderMasterRegistry() {
    const list = document.getElementById('master-registry');
    if (!list) return;
    const query = state.masterSearch.trim().toLocaleLowerCase('ru-RU');
    const items = state.tasks
      .filter(item => weekDates().includes(item.date))
      .filter(item => state.masterPriority === 'all' || item.priority === state.masterPriority)
      .filter(item => state.masterStatus === 'all' || item.status === state.masterStatus)
      .filter(item => state.masterRole === 'all' || item.role === state.masterRole)
      .filter(item => !query || `${item.title} ${item.category} ${getRole(item.role).title}`.toLocaleLowerCase('ru-RU').includes(query))
      .sort((a, b) => ({ high: 0, medium: 1, normal: 2 }[a.priority] - { high: 0, medium: 1, normal: 2 }[b.priority]) || a.date.localeCompare(b.date) || a.due.localeCompare(b.due));
    const count = document.getElementById('registry-count');
    if (count) count.textContent = `${items.length} ${taskWord(items.length)}`;
    if (!items.length) {
      list.innerHTML = '<div class="card empty"><strong>Задачи не найдены</strong>Измените фильтры или создайте новую задачу.</div>';
      return;
    }
    list.innerHTML = items.map(item => `<article class="card registry-item" data-edit-task="${item.id}" tabindex="0" role="button" aria-label="Открыть и изменить задачу ${escapeHtml(item.title)}">
      <div class="registry-top"><div><div class="task-overline"><span class="tag ${item.priority}">${priorityLabel(item.priority)}</span><span class="tag">${escapeHtml(getRole(item.role).title)}</span><span class="tag ${item.status === 'done' ? 'done' : item.status === 'failed' ? 'high' : 'blue'}">${statusLabel(item.status)}</span></div><div class="task-title">${escapeHtml(item.title)}</div></div><div class="registry-date">${formatDate(item.date, { weekday: 'short', day: '2-digit', month: '2-digit' })}<strong>${item.due}</strong></div></div>
      <div class="task-meta">${[visibleCategory(item.category), item.fixed ? 'фиксированный день' : 'разрешена недельная ротация', 'нажмите, чтобы изменить'].filter(Boolean).map(escapeHtml).join(' · ')}</div>
    </article>`).join('');
    document.querySelectorAll('[data-edit-task]').forEach(card => {
      card.addEventListener('click', () => openTaskDetails(card.dataset.editTask));
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openTaskDetails(card.dataset.editTask);
        }
      });
    });
  }

  function openMasterTaskEditor(item) {
    const modal = document.getElementById('master-task-modal');
    if (!modal) return;
    state.activeTask = item.id;
    document.getElementById('master-task-modal-title').textContent = item.title;
    document.getElementById('edit-task-title').value = item.title;
    document.getElementById('edit-task-description').value = item.description || '';
    document.getElementById('edit-task-role').value = item.role;
    document.getElementById('edit-task-priority').value = item.priority;
    document.getElementById('edit-task-date').value = item.date;
    document.getElementById('edit-task-due').value = item.due;
    document.getElementById('edit-task-minutes').value = item.minutes;
    document.getElementById('edit-task-status').value = item.status;
    const rotation = document.getElementById('edit-task-rotation');
    rotation.checked = !item.fixed;
    rotation.disabled = item.priority === 'high';
    document.getElementById('edit-task-history').innerHTML = historyMarkup(item);
    modal.classList.add('open');
  }

  async function saveMasterTask() {
    const index = state.tasks.findIndex(item => item.id === state.activeTask);
    if (index < 0) return;
    const current = state.tasks[index];
    const title = document.getElementById('edit-task-title').value.trim();
    const date = document.getElementById('edit-task-date').value;
    const due = document.getElementById('edit-task-due').value;
    const minutes = Number(document.getElementById('edit-task-minutes').value);
    if (!title || !date || !due || !Number.isFinite(minutes) || minutes < 5 || minutes > 480) {
      showToast('Проверьте название, дату, срок и расчётное время');
      return;
    }
    const priority = document.getElementById('edit-task-priority').value;
    const status = document.getElementById('edit-task-status').value;
    if (!PREVIEW_MODE) {
      closeModal('master-task-modal');
      showToast('Изменения приняты');
      try {
        await apiRequest('update_task', {
          occurrence_id: current.id,
          task_id: current.task_id,
          title,
          description: document.getElementById('edit-task-description').value.trim(),
          priority,
          date,
          due_time: due,
          duration_minutes: minutes,
          rotation_allowed: priority !== 'high' && document.getElementById('edit-task-rotation').checked,
          status,
          comment: current.comment || (status === 'failed' ? 'Отмечено ГА' : '')
        });
        await loadLiveData({ quiet: true });
        showToast('Изменения сохранены');
      } catch (error) {
        showToast(error.message || 'Не удалось сохранить изменения');
      }
      return;
    }
    const previousDate = current.date;
    const previousStatus = current.status;
    const changes = [];
    if (previousDate !== date) changes.push(`дата: ${formatDate(previousDate, { day: '2-digit', month: '2-digit' })} → ${formatDate(date, { day: '2-digit', month: '2-digit' })}`);
    if (previousStatus !== status) changes.push(`статус: ${statusLabel(previousStatus)} → ${statusLabel(status)}`);
    state.tasks[index] = {
      ...current,
      title,
      description: document.getElementById('edit-task-description').value.trim(),
      priority,
      date,
      due,
      minutes,
      plannedDay: (new Date(`${date}T12:00:00`).getDay() + 6) % 7,
      status,
      fixed: priority === 'high' || !document.getElementById('edit-task-rotation').checked,
      completedAt: status === 'done' ? (current.completedAt || nowStamp()) : '',
      history: withHistory(current, changes.length ? `Изменено: ${changes.join('; ')}` : 'Карточка задачи обновлена')
    };
    saveTasks();
    closeModal('master-task-modal');
    renderAll();
    showToast(previousDate !== date ? 'Задача перенесена. Ответственный не изменён' : 'Изменения сохранены');
  }

  async function duplicateMasterTask() {
    const current = state.tasks.find(item => item.id === state.activeTask);
    if (!current) return;
    if (!PREVIEW_MODE) {
      closeModal('master-task-modal');
      showToast('Копия создаётся');
      try {
        await apiRequest('duplicate_task', { task_id: current.task_id });
        await loadLiveData({ quiet: true });
        showToast('Копия задачи добавлена в реестр');
      } catch (error) {
        showToast(error.message || 'Не удалось создать копию');
      }
      return;
    }
    const copy = {
      ...current,
      id: `copy-${Date.now()}`,
      key: `copy-${Date.now()}`,
      title: `${current.title} — копия`,
      status: 'todo',
      completedAt: '',
      comment: '',
      history: [{ at: nowStamp(), text: `Создано копированием задачи «${current.title}»` }]
    };
    state.tasks.push(copy);
    saveTasks();
    closeModal('master-task-modal');
    renderAll();
    showToast('Копия задачи добавлена в реестр');
  }

  async function deleteMasterTask() {
    const current = state.tasks.find(item => item.id === state.activeTask);
    if (!current) return;
    if (!window.confirm(`Удалить задачу «${current.title}»?`)) return;
    if (!PREVIEW_MODE) {
      closeModal('master-task-modal');
      try {
        await apiRequest('archive_task', { task_id: current.task_id });
        await loadLiveData({ quiet: true });
        showToast('Задача удалена');
      } catch (error) {
        showToast(error.message || 'Не удалось удалить задачу');
      }
      return;
    }
    state.tasks = state.tasks.filter(item => item.id !== current.id);
    saveTasks();
    closeModal('master-task-modal');
    renderAll();
    showToast('Задача удалена');
  }

  function initMasterRoleOptions() {
    const roleSelect = document.getElementById('task-role');
    if (roleSelect) roleSelect.innerHTML = roles.map(role => `<option value="${role.id}">${escapeHtml(role.title)}</option>`).join('');
    const editRoleSelect = document.getElementById('edit-task-role');
    if (editRoleSelect) editRoleSelect.innerHTML = roles.map(role => `<option value="${role.id}">${escapeHtml(role.title)}</option>`).join('');
    const registryRoleFilter = document.getElementById('master-role-filter');
    if (registryRoleFilter) {
      const selected = registryRoleFilter.value || 'all';
      registryRoleFilter.innerHTML = '<option value="all">Все должности</option>' + roles.map(role => `<option value="${role.id}">${escapeHtml(role.title)}</option>`).join('');
      registryRoleFilter.value = roles.some(role => role.id === selected) ? selected : 'all';
    }
  }

  function initMasterControls() {
    const form = document.getElementById('master-task-form');
    if (!form) return;
    const roleSelect = document.getElementById('task-role');
    initMasterRoleOptions();
    const registryRoleFilter = document.getElementById('master-role-filter');
    const daySelect = document.getElementById('task-day');
    daySelect.innerHTML = DAY_NAMES.map((day, index) => `<option value="${index}">${day}</option>`).join('');
    daySelect.value = String((new Date().getDay() + 6) % 7);
    const prioritySelect = document.getElementById('task-priority');
    const rotationCheckbox = document.getElementById('task-rotation');
    const applyPriorityRule = () => {
      const critical = prioritySelect.value === 'high';
      rotationCheckbox.disabled = critical;
      if (critical) rotationCheckbox.checked = false;
    };
    prioritySelect.addEventListener('change', applyPriorityRule);
    applyPriorityRule();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const title = document.getElementById('task-title').value.trim();
      if (!title) {
        showToast('Укажите название задачи');
        return;
      }
      const role = roleSelect.value;
      const plannedDay = Number(document.getElementById('task-day').value);
      const priority = prioritySelect.value;
      const allowRotation = priority !== 'high' && rotationCheckbox.checked;
      const date = weekDates()[plannedDay];
      if (!PREVIEW_MODE) {
        showToast('Задача принята');
        try {
          await apiRequest('create_task', {
            title,
            description: document.getElementById('task-description').value.trim(),
            role_id: role,
            date,
            due_time: document.getElementById('task-due').value || '20:00',
            duration_minutes: Math.max(5, Math.min(480, Number(document.getElementById('task-minutes').value) || 30)),
            priority,
            rotation_allowed: allowRotation
          });
          form.reset();
          document.getElementById('task-due').value = '20:00';
          document.getElementById('task-minutes').value = '30';
          daySelect.value = String((new Date().getDay() + 6) % 7);
          applyPriorityRule();
          await loadLiveData({ quiet: true });
          openView('registry');
          showToast('Задача добавлена в реестр');
        } catch (error) {
          showToast(error.message || 'Не удалось добавить задачу');
        }
        return;
      }
      state.tasks.push({
        id: `custom-${Date.now()}`,
        key: `custom-${Date.now()}`,
        role,
        date,
        baseDay: plannedDay,
        plannedDay,
        title,
        description: document.getElementById('task-description').value.trim(),
        category: 'Поручение ГА',
        due: document.getElementById('task-due').value || '20:00',
        minutes: Math.max(5, Math.min(480, Number(document.getElementById('task-minutes').value) || 30)),
        priority,
        fixed: !allowRotation,
        repeat: allowRotation ? 'Раз в неделю с ротацией' : 'Фиксированный день',
        status: 'todo',
        completedAt: '',
        history: [{ at: nowStamp(), text: 'Задача поставлена ГА' }]
      });
      saveTasks();
      form.reset();
      document.getElementById('task-due').value = '20:00';
      document.getElementById('task-minutes').value = '30';
      daySelect.value = String((new Date().getDay() + 6) % 7);
      applyPriorityRule();
      renderAll();
      openView('registry');
      showToast('Задача добавлена в реестр');
    });

    const priorityFilter = document.getElementById('master-priority-filter');
    if (priorityFilter) priorityFilter.addEventListener('change', () => {
      state.masterPriority = priorityFilter.value;
      renderMasterRegistry();
    });
    const statusFilter = document.getElementById('master-status-filter');
    if (statusFilter) statusFilter.addEventListener('change', () => {
      state.masterStatus = statusFilter.value;
      renderMasterRegistry();
    });
    if (registryRoleFilter) registryRoleFilter.addEventListener('change', () => {
      state.masterRole = registryRoleFilter.value;
      renderMasterRegistry();
    });
    const searchFilter = document.getElementById('master-search-filter');
    if (searchFilter) searchFilter.addEventListener('input', () => {
      state.masterSearch = searchFilter.value;
      renderMasterRegistry();
    });
    const editPriority = document.getElementById('edit-task-priority');
    if (editPriority) editPriority.addEventListener('change', () => {
      const rotation = document.getElementById('edit-task-rotation');
      const critical = editPriority.value === 'high';
      rotation.disabled = critical;
      if (critical) rotation.checked = false;
    });
  }

  function plannedTasks() {
    const dates = weekDates(state.planWeek);
    const loaded = state.tasks.filter(
      item => item.role === state.role && dates.includes(item.date)
    );
    if (loaded.length || !PREVIEW_MODE || state.planWeek === 0) return loaded;
    return buildWeek(state.role, 1, true);
  }

  function renderPlan() {
    document.getElementById('plan-current').classList.toggle('active', state.planWeek === 0);
    document.getElementById('plan-next').classList.toggle('active', state.planWeek === 1);
    const dates = weekDates(state.planWeek);
    const tasks = plannedTasks();
    document.getElementById('plan-scope').textContent = `${getRole().title} · ${state.planWeek ? 'следующая неделя' : 'эта неделя'}`;
    document.getElementById('week-board').innerHTML = dates.map((date, index) => {
      const dayTasks = tasks.filter(item => item.date === date);
      const minutes = dayTasks.reduce((sum, item) => sum + item.minutes, 0);
      return `<article class="card day-row" data-day-date="${date}" tabindex="0" role="button" aria-label="Открыть задачи за ${DAY_NAMES[index]}"><div class="day-name">${DAY_NAMES[index]}<span>${formatDate(date, { day: '2-digit', month: '2-digit' })}</span></div><div class="day-load"><span style="width:${Math.min(100, minutes / 2.2)}%"></span></div><div class="day-count">${dayTasks.length} ${taskWord(dayTasks.length)} · ${minutes} м</div></article>`;
    }).join('');
    const currentTasks = state.tasks.filter(
      item => item.role === state.role && weekDates(0).includes(item.date) && !item.fixed
    );
    const nextTasks = state.tasks.filter(
      item => item.role === state.role && weekDates(1).includes(item.date) && !item.fixed
    );
    const rotations = [];
    const seen = new Set();
    for (const item of currentTasks) {
      const key = item.task_id || item.key;
      if (seen.has(key)) continue;
      seen.add(key);
      const next = nextTasks.find(candidate => (candidate.task_id || candidate.key) === key);
      rotations.push({ item, next });
    }
    const rotationList = document.getElementById('rotation-list');
    rotationList.innerHTML = rotations.length ? rotations.map(({ item, next }) => {
      const currentDay = new Date(`${item.date}T12:00:00`).getDay();
      const nextDay = next ? new Date(`${next.date}T12:00:00`).getDay() : currentDay;
      return `<article class="card rotation-item"><div class="rotation-title">${escapeHtml(item.title)}</div><div class="rotation-route"><div class="rotation-day"><span>Эта неделя</span><strong>${DAY_NAMES[(currentDay + 6) % 7]}</strong></div><div class="rotation-arrow">→</div><div class="rotation-day"><span>Следующая неделя</span><strong>${DAY_NAMES[(nextDay + 6) % 7]}</strong></div></div><div class="fixed-note">Меняется только день. Ответственный руководитель остаётся прежним.</div></article>`;
    }).join('') : '<div class="card empty"><strong>Перестановок нет</strong>ГА ещё не разрешил недельную ротацию ни для одной задачи этой должности.</div>';
    document.querySelectorAll('[data-day-date]').forEach(row => {
      row.addEventListener('click', () => openDayDetails(row.dataset.dayDate));
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDayDetails(row.dataset.dayDate);
        }
      });
    });
  }

  function openDayDetails(date) {
    const modal = document.getElementById('day-detail-modal');
    if (!modal) return;
    const items = plannedTasks().filter(item => item.date === date).sort((a, b) => a.due.localeCompare(b.due));
    document.getElementById('day-detail-title').textContent = formatDate(date, { weekday: 'long', day: '2-digit', month: 'long' });
    document.getElementById('day-detail-list').innerHTML = items.length
      ? items.map(item => `<div class="day-detail-item" data-day-task="${item.id}"><div><strong>${escapeHtml(item.title)}</strong><span>${priorityLabel(item.priority)} · ${statusLabel(item.status)} · ${item.minutes} минут</span></div><b>${escapeHtml(item.due)}</b></div>`).join('')
      : '<div class="empty"><strong>Задач нет</strong>На этот день ничего не назначено.</div>';
    document.querySelectorAll('[data-day-task]').forEach(card => card.addEventListener('click', () => {
      closeModal('day-detail-modal');
      const taskItem = state.tasks.find(item => item.id === card.dataset.dayTask);
      if (taskItem) openTaskDetails(taskItem.id);
      else showToast('Это предварительный план следующей недели');
    }));
    modal.classList.add('open');
  }

  function resetDemo() {
    state.tasks = seedTasks();
    localStorage.removeItem(STORAGE_KEY);
    renderAll();
    showToast('Демонстрационные данные восстановлены');
  }

  function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  let toastTimer;
  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function openView(name) {
    document.querySelectorAll('.nav-btn').forEach(item => item.classList.toggle('active', item.dataset.view === name));
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.nav-btn').forEach(button => button.addEventListener('click', () => openView(button.dataset.view)));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal(backdrop.id);
  }));
  const confirmFailure = document.getElementById('confirm-failure');
  if (confirmFailure) confirmFailure.addEventListener('click', () => {
    const reason = document.getElementById('failure-reason').value;
    const comment = document.getElementById('failure-comment').value.trim();
    if (!reason || !comment) {
      showToast('Выберите причину и добавьте комментарий');
      return;
    }
    closeModal('failure-modal');
    updateTask(state.activeTask, { status: 'failed', comment: `${reason}. ${comment}` }, 'Причина сохранена');
  });
  const detailDone = document.getElementById('detail-done');
  if (detailDone) detailDone.addEventListener('click', () => {
    closeModal('task-detail-modal');
    updateTask(state.activeTask, { status: 'done', completedAt: nowStamp(), comment: '' }, 'Задача отмечена выполненной');
  });
  const detailFail = document.getElementById('detail-fail');
  if (detailFail) detailFail.addEventListener('click', () => openFailure(state.activeTask));
  const detailReopen = document.getElementById('detail-reopen');
  if (detailReopen) detailReopen.addEventListener('click', () => {
    closeModal('task-detail-modal');
    updateTask(state.activeTask, { status: 'todo', completedAt: '', comment: '' }, 'Задача возвращена в работу');
  });
  const saveTaskButton = document.getElementById('save-task');
  if (saveTaskButton) saveTaskButton.addEventListener('click', saveMasterTask);
  const duplicateTaskButton = document.getElementById('duplicate-task');
  if (duplicateTaskButton) duplicateTaskButton.addEventListener('click', duplicateMasterTask);
  const deleteTaskButton = document.getElementById('delete-task');
  if (deleteTaskButton) deleteTaskButton.addEventListener('click', deleteMasterTask);
  const planCurrent = document.getElementById('plan-current');
  if (planCurrent) planCurrent.addEventListener('click', () => { state.planWeek = 0; renderPlan(); });
  const planNext = document.getElementById('plan-next');
  if (planNext) planNext.addEventListener('click', () => { state.planWeek = 1; renderPlan(); });
  const resetButton = document.getElementById('reset-btn');
  if (resetButton) resetButton.addEventListener('click', resetDemo);
  const syncRefresh = document.getElementById('sync-refresh');
  if (syncRefresh) syncRefresh.addEventListener('click', refreshPersistenceStatus);
  document.querySelectorAll('.toggle').forEach(toggle => toggle.addEventListener('click', () => {
    toggle.classList.toggle('on');
    showToast('Настройка изменена в демонстрационном режиме');
  }));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.modal-backdrop.open').forEach(modal => closeModal(modal.id));
  });

  function renderAll() {
    renderIdentity();
    if (document.getElementById('view-personal')) renderPersonal();
    if (document.getElementById('view-progress')) renderProgress();
    renderPersistenceStatus();
    if (document.getElementById('view-plan')) renderPlan();
    renderMasterRegistry();
  }

  initRoleSelect();
  initMasterControls();
  if (PREVIEW_MODE) renderAll();
  else loadLiveData();
  window.addEventListener('storage', event => {
    if (!PREVIEW_MODE) return;
    if (event.key !== STORAGE_KEY) return;
    state.tasks = loadTasks();
    renderAll();
  });
})();
