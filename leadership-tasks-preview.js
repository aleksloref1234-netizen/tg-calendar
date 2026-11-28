(() => {
  'use strict';

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const DEFAULT_DUE_TIME = '00:00';
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
      task('reports', 'Сдача всех отчётов', 'Отчётность', DEFAULT_DUE_TIME, 30, 'high', { days: allDays(), fixed: true, repeat: 'Ежедневно' }),
      task('forum', 'Проверка форума на просрочки', 'Форум', DEFAULT_DUE_TIME, 25, 'high', { day: 0 }),
      task('appeals', 'Рассмотрение обжалований', 'Контроль', DEFAULT_DUE_TIME, 35, 'medium', { day: 2 }),
      task('vk', 'Проверка личных сообщений ВКонтакте', 'Коммуникации', DEFAULT_DUE_TIME, 20, 'normal', { day: 4 }),
      task('blacklist', 'Просмотр форм на выдачу ЧС от главных следящих', 'Проверка', DEFAULT_DUE_TIME, 25, 'medium', { day: 1 }),
      task('leaders', 'Проверка рекламы и работы по набору лидеров', 'Набор', DEFAULT_DUE_TIME, 30, 'normal', { day: 3 }),
      task('meeting', 'Собрание руководящего состава', 'Собрание', DEFAULT_DUE_TIME, 45, 'high', { day: 6, fixed: true, repeat: 'По воскресеньям' })
    ],
    deputy: [
      task('control', 'Контроль работы администрации', 'Контроль', DEFAULT_DUE_TIME, 30, 'high', { days: allDays(), fixed: true, repeat: 'Ежедневно' }),
      task('curators', 'Проверка отчётности кураторов', 'Отчётность', DEFAULT_DUE_TIME, 40, 'high', { day: 0 }),
      task('messages', 'Проверка личных сообщений ВКонтакте', 'Коммуникации', DEFAULT_DUE_TIME, 20, 'normal', { day: 2 }),
      task('review', 'Сводка проблем по направлениям', 'Аналитика', DEFAULT_DUE_TIME, 35, 'medium', { day: 4 }),
      task('call', 'Созвон с руководителями направлений', 'Коммуникации', DEFAULT_DUE_TIME, 45, 'medium', { day: 6, fixed: true, repeat: 'По воскресеньям' })
    ],
    org: [
      task('server', 'Время на сервере', 'Сервер', DEFAULT_DUE_TIME, 75, 'high', { days: allDays(), fixed: true, repeat: 'Ежедневно' }),
      task('complaints', 'Рассмотрение жалоб на лидеров', 'Жалобы', DEFAULT_DUE_TIME, 35, 'high', { day: 0 }),
      task('applications', 'Проверка заявок на лидерские должности', 'Набор', DEFAULT_DUE_TIME, 30, 'medium', { day: 2 }),
      task('reports', 'Сбор отчётности следящих', 'Отчётность', DEFAULT_DUE_TIME, 40, 'medium', { day: 4 }),
      task('forum', 'Проверка лидерского раздела', 'Форум', DEFAULT_DUE_TIME, 30, 'normal', { day: 5 })
    ],
    admin: [
      task('inactive', 'Контроль неактивов и освобождений', 'Кадры', DEFAULT_DUE_TIME, 25, 'medium', { days: allDays(), fixed: true, repeat: 'Ежедневно' }),
      task('performance', 'Проверка недельной успеваемости администрации', 'Успеваемость', DEFAULT_DUE_TIME, 40, 'high', { day: 0 }),
      task('appeals', 'Проверка обращений администрации', 'Коммуникации', DEFAULT_DUE_TIME, 30, 'normal', { day: 2 }),
      task('violations', 'Подготовка сводки по нарушениям', 'Аналитика', DEFAULT_DUE_TIME, 35, 'medium', { day: 4 }),
      task('meeting', 'Подготовка материалов к собранию', 'Собрание', DEFAULT_DUE_TIME, 30, 'medium', { day: 6, fixed: true, repeat: 'По воскресеньям' })
    ],
    support: [
      task('server', 'Время на сервере', 'Сервер', DEFAULT_DUE_TIME, 70, 'high', { days: allDays(), fixed: true, repeat: 'Ежедневно' }),
      task('forum', 'Проверка раздела агентов поддержки', 'Форум', DEFAULT_DUE_TIME, 25, 'medium', { day: 0 }),
      task('logs', 'Проверка ответов агентов через логи', 'Контроль', DEFAULT_DUE_TIME, 35, 'medium', { day: 2 }),
      task('standard', 'Выставление норматива агентам поддержки', 'Норматив', DEFAULT_DUE_TIME, 30, 'normal', { day: 4 }),
      task('complaints', 'Рассмотрение жалоб на агентов поддержки', 'Жалобы', DEFAULT_DUE_TIME, 35, 'high', { day: 5 })
    ]
  };

  let liveWeekStart = null;
  let progressTimer;
  const state = {
    role: 'main',
    dateMode: PREVIEW_MODE ? todayIso() : moscowTodayIso(),
    planWeek: 0,
    masterPriority: 'all',
    masterStatus: 'all',
    masterRole: 'all',
    masterSearch: '',
    boardRole: 'all',
    boardLate: false,
    boardExpanded: new Set(),
    progress: {},
    pending: new Map(),
    markPaused: false,
    markStorageUnavailable: false,
    markError: '',
    markSaved: false,
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

  const icons = {
    list:'<path d="m3 7 2 2 4-4m3 2h9M3 16l2 2 4-4m3 2h9"/>',
    check:'<path d="m5 12 4 4 10-10"/>',
    square:'<rect x="5" y="5" width="14" height="14" rx="3"/>',
    clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    alert:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4m0 3v.2"/>',
    calendar:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-11 5h6"/>',
    board:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14m6-14v14"/>',
    chart:'<path d="M4 4v16h16M8 15l4-5 4 2 4-6"/>',
    shield:'<path d="m12 3 7 3v5c0 4-3 7-7 10-4-3-7-6-7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
    messages:'<path d="M20 11.5a8 8 0 0 1-8 7.5c-1.3 0-2.5-.3-3.6-.8L4 20l1.5-4A7.2 7.2 0 0 1 4 11.5 8 8 0 0 1 12 4a8 8 0 0 1 8 7.5Z"/><path d="M8 11.5h8"/>',
    phone:'<path d="M7 3H4a1 1 0 0 0-1 1 17 17 0 0 0 17 17 1 1 0 0 0 1-1v-3l-4-2-1.5 1.5a13 13 0 0 1-8-8L9 7Z"/>',
    users:'<circle cx="10" cy="8" r="3"/><path d="M4 19v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1m1-14a3 3 0 0 1 0 6m1 3a4 4 0 0 1 3 4v1"/>',
    report:'<path d="M6 3h8l4 4v14H6Zm8 0v5h5M9 12h6m-6 4h6"/>',
    flag:'<path d="M5 21V4m0 1c5-4 8 4 14 0v9c-6 4-9-4-14 0"/>',
    plus:'<path d="M12 5v14M5 12h14"/>'
  };
  const taskIcons = {
    list:['Задача','mint'], calendar:['Календарь','blue'], shield:['Контроль','mint'],
    messages:['Чат','blue'], phone:['Созвон','mint'], users:['Состав','lilac'],
    report:['Отчёт','blue'], flag:['Приоритет','rose'], chart:['Аналитика','amber']
  };
  function icon(name) {
    return '<svg class="tracker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] || icons.list) + '</svg>';
  }
  function taskIconKey(value) { return typeof value === 'string' && Object.prototype.hasOwnProperty.call(taskIcons,value) ? value : 'list'; }
  function taskBadge(value, { effect = false, mark = '' } = {}) {
    const key = taskIconKey(value);
    return '<span class="tracker-task-badge' + (effect ? ' tracker-icon-pop' : '') + '" data-task-icon="' + key
      + '" data-tone="' + taskIcons[key][1] + '" aria-hidden="true">' + icon(key)
      + (mark ? '<span class="tracker-badge-mark" data-mark="' + mark + '">' + icon(mark) + '</span>' : '') + '</span>';
  }
  function chosenTaskIcon(prefix) {
    return taskIconKey(document.querySelector('input[name="' + prefix + '-icon"]:checked')?.value);
  }
  function renderIconSample(prefix, effect) {
    const value = chosenTaskIcon(prefix);
    const sample = document.getElementById(prefix + '-icon-sample');
    if (sample) sample.innerHTML = taskBadge(value,{ effect }) + '<span>' + taskIcons[value][0] + '</span>';
    const heading = document.getElementById(prefix + '-heading-icon');
    if (heading) heading.innerHTML = taskBadge(value,{ effect });
  }
  function setTaskIcon(prefix, value, effect = false) {
    const radio = document.querySelector('input[name="' + prefix + '-icon"][value="' + taskIconKey(value) + '"]');
    if (radio) radio.checked = true;
    renderIconSample(prefix, effect);
  }
  for (const picker of document.querySelectorAll('[data-icon-picker]')) {
    const prefix = picker.dataset.iconPicker;
    document.getElementById(prefix + '-icon-picker').innerHTML = Object.entries(taskIcons).map(([key,[label]]) =>
      '<label class="tracker-icon-choice"><input type="radio" name="' + prefix + '-icon" value="' + key
      + '"' + (key === 'list' ? ' checked' : '') + '><span>' + taskBadge(key) + '<small>' + label + '</small></span></label>'
    ).join('');
    picker.addEventListener('change', () => renderIconSample(prefix, true));
    renderIconSample(prefix, false);
  }
  document.querySelectorAll('[data-tracker-icon]').forEach(node => { node.innerHTML = icon(node.dataset.trackerIcon); });

  let localMarkStorage;
  try { localMarkStorage = window.localStorage; } catch (_) {}
  const markQueue = PREVIEW_MODE ? null : window.LeadershipTaskMarks.create({
    storage: localMarkStorage,
    send: apiRequest,
    onChange({ entries, paused, storageUnavailable }) {
      state.pending = new Map(entries.map(item => [item.occurrence_id, item]));
      state.markPaused = paused;
      state.markStorageUnavailable = storageUnavailable;
      if (!state.loading) renderAll();
    },
    onProgress: applyLiveProgress,
    onConfirmed(item, result) {
      const index = state.tasks.findIndex(task => task.id === item.occurrence_id);
      if (index >= 0 && result) state.tasks[index] = {
        ...state.tasks[index],
        status: result.status,
        comment: result.comment,
        completedAt: result.completed_at,
        markRevision: result.mark_revision
      };
      state.markSaved = true;
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    },
    onRejected(_item, error) { state.markError = error.message; showToast(error.message); },
    onResync() { loadLiveData({ quiet: true }); }
  });

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

  function currentToday() { return PREVIEW_MODE ? todayIso() : moscowTodayIso(); }

  function mondayOf(base = new Date(), weekOffset = 0) {
    const date = new Date(base);
    date.setHours(12, 0, 0, 0);
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1 + weekOffset * 7);
    return date;
  }

  function weekDates(weekOffset = 0) {
    const monday = liveWeekStart && !PREVIEW_MODE
      ? new Date(liveWeekStart + 'T12:00:00')
      : mondayOf(new Date(currentToday() + 'T12:00:00'));
    monday.setDate(monday.getDate() + 7 * weekOffset);
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': tg ? (tg.initData || '') : ''
      },
        body: JSON.stringify({ action, ...payload }),
        signal: controller.signal
      });
      let result = {};
      try { result = await response.json(); } catch (_) {}
      if (!response.ok || result.status !== 'success') {
        const error = new Error(result.message || 'Не удалось обработать запрос');
        error.status = response.status;
        throw error;
      }
      return result.data || {};
    } finally {
      clearTimeout(timeout);
    }
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
      applyLiveProgress(data);
      state.role = APP_MODE === 'master'
        ? (roles.some(role => role.id === state.role) ? state.role : roles[0].id)
        : (data.viewer?.is_ga
          ? (roles.some(role => role.id === state.role) ? state.role : roles[0].id)
          : (data.viewer?.role_id || roles[0].id));
      state.loading = false;
      markQueue.useViewer(state.viewer?.user_id);
      initRoleSelect(true);
      initMasterRoleOptions();
      renderAll();
      watchPendingProgress();
    } catch (error) {
      state.loading = false;
      if (!quiet) showFatalError(error.message || 'Не удалось загрузить задачник');
      else showToast(error.message || 'Не удалось обновить данные');
    }
  }

  function applyLiveProgress(data) {
    if (data.week_start && data.week_start !== liveWeekStart) {
      liveWeekStart = data.week_start;
      state.progress = {};
    }
    for (const [role, next] of Object.entries(data.progress || {})) {
      state.progress[role] = next.updating ? { ...state.progress[role], updating: true } : next;
    }
  }

  function watchPendingProgress(attempt = 0) {
    clearTimeout(progressTimer);
    const incomplete = Object.values(state.progress).some(role => role.updating);
    if (PREVIEW_MODE || state.pending.size || !incomplete || attempt >= 7) return;
    progressTimer = setTimeout(async () => {
      if (document.hidden || state.pending.size) return;
      try {
        applyLiveProgress(await apiRequest('task_sync_status', { keys: [] }));
        renderAll();
      } catch (error) {
        if (error.status === 403 || error.status === 400) return;
      }
      watchPendingProgress(attempt + 1);
    }, Math.min(30000, 7000 * (attempt + 1)));
  }

  function progressLabel(role, fallback) {
    if (PREVIEW_MODE) return { value: fallback + '%', note: 'КПД недели' };
    const value = state.progress[role];
    const pending = [...state.pending.keys()].some(id => state.tasks.some(task => task.id === id && task.role === role));
    return {
      value: value?.total_tasks ? Math.round(value.kpi_value * 100) + '%' : '—',
      note: value?.updating || pending ? 'КПД обновляется' : 'КПД недели'
    };
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

  function isRisk(item) {
    return item.status === 'failed' || (item.status === 'todo' && item.date < currentToday());
  }

  function timeLabel(item) {
    return item.due === DEFAULT_DUE_TIME ? 'до 00:00' : 'до ' + item.due;
  }

  function effectiveTask(task) {
    const pending = state.pending.get(task.id);
    return pending ? { ...task, status: pending.status, comment: pending.comment, pending: true } : task;
  }

  function dateRange(dates) {
    const start = formatDate(dates[0], { day: 'numeric', month: 'short' });
    const end = formatDate(dates[6], { day: 'numeric', month: 'short' });
    return start + ' — ' + end;
  }

  function renderDateStrip(personal) {
    const days = weekDates();
    if (state.dateMode !== 'week' && state.dateMode !== 'late' && !days.includes(state.dateMode)) state.dateMode = 'week';
    document.getElementById('tracker-period').textContent = formatDate(currentToday(), { day: 'numeric', month: 'long' });
    document.getElementById('tracker-date-caption').textContent = dateRange(days);
    const late = personal.filter(isRisk).length;
    const button = document.getElementById('personal-overdue');
    button.innerHTML = icon('alert') + '<span>Без результата: ' + late + '</span>';
    button.setAttribute('aria-pressed', String(state.dateMode === 'late'));
    button.disabled = !late && state.dateMode !== 'late';
    document.getElementById('personal-week-all').setAttribute('aria-pressed', String(state.dateMode === 'week'));
    document.getElementById('date-strip').innerHTML = days.map((date,index) => {
      const selected = state.dateMode === date;
      const current = date === currentToday();
      return '<button class="date-chip' + (selected ? ' active' : '') + '" type="button" data-date-mode="' + date
        + '" data-has-tasks="' + personal.some(task => task.date === date) + '" aria-pressed="' + selected + '"'
        + (current ? ' aria-current="date"' : '') + ' aria-label="' + escapeHtml(DAY_NAMES[index] + ', ' + formatDate(date, { day:'numeric', month:'long' }))
        + '"><span>' + DAY_SHORT[index] + '</span><strong>' + Number(date.slice(-2)) + '</strong><i aria-hidden="true"></i></button>';
    }).join('');
  }

  function renderWeekTrack(id, { total, done, risk }) {
    const track = document.getElementById(id + '-progress-bar');
    const groups = [
      ['done', 'Готово', done],
      ['risk', 'Требуют внимания', risk],
      ['remaining', 'К выполнению', total - done - risk]
    ];
    track.setAttribute('aria-valuenow', String(total ? Math.round(done / total * 100) : 0));
    track.setAttribute('aria-valuetext', total
      ? groups.map(([,label,count]) => label + ': ' + count).join('. ')
      : 'Нет задач на неделю');
    for (const [key,,count] of groups) {
      const part = track.querySelector('[data-progress-part="' + key + '"]');
      part.style.flexGrow = count;
      part.hidden = count === 0;
    }
    document.getElementById(id + '-progress-legend').innerHTML = groups
      .filter(([, , count]) => count > 0)
      .map(([key,label,count]) => '<span data-progress-key="' + key + '">' + label + ' <b>' + count + '</b></span>')
      .join('');
  }

  function renderPersonal() {
    const days = weekDates();
    const personal = state.tasks.filter(item => item.role === state.role && days.includes(item.date)).map(effectiveTask);
    renderDateStrip(personal);
    const weekMode = state.dateMode === 'week';
    const lateMode = state.dateMode === 'late';
    const tasks = personal.filter(item => weekMode || (lateMode ? isRisk(item) : item.date === state.dateMode));
    const order = { high: 0, medium: 1, normal: 2 };
    tasks.sort((a,b) => a.date.localeCompare(b.date) || (a.status === 'done') - (b.status === 'done') || order[a.priority] - order[b.priority] || a.due.localeCompare(b.due));
    const done = personal.filter(item => item.status === 'done').length;
    const progress = personal.length ? Math.round(done / personal.length * 100) : 0;
    const kpi = progressLabel(state.role, progress);
    document.getElementById('tracker-progress-count').textContent = done + ' из ' + personal.length;
    renderWeekTrack('tracker', { total: personal.length, done, risk: personal.filter(isRisk).length });
    document.getElementById('tracker-personal-kpi').innerHTML = escapeHtml(kpi.value) + '<small>' + escapeHtml(kpi.note) + '</small>';
    const markState = document.getElementById('tracker-mark-state');
    const pending = state.pending.size;
    markState.hidden = !(pending || state.markSaved);
    markState.textContent = state.markPaused ? 'Откройте задачник заново в Telegram, чтобы отправить отметки.'
      : pending && state.markStorageUnavailable ? 'Сохраняем… Не закрывайте окно: сохранение на устройстве недоступно.'
      : pending ? ([...state.pending.values()].every(item => item.export_key) ? 'Принято · ожидает выгрузки в таблицу' : 'Сохраняем отметку…')
      : state.markSaved ? 'Отметка сохранена в таблице' : '';
    const errorNode = document.getElementById('tracker-mark-error');
    errorNode.hidden = !state.markError;
    errorNode.textContent = state.markError;
    document.getElementById('tasks-heading').textContent = weekMode ? 'Расписание на неделю'
      : lateMode ? 'Без результата' : state.dateMode === currentToday() ? 'Сегодня' : DAY_NAMES[days.indexOf(state.dateMode)];
    document.getElementById('tasks-note').textContent = tasks.length + ' ' + taskWord(tasks.length);
    const list = document.getElementById('tasks-list');
    if (!tasks.length) { list.innerHTML = '<div class="tracker-empty">На этот период задач нет</div>'; return; }
    list.innerHTML = weekMode
      ? days.map((date,index) => {
        const dayTasks = tasks.filter(item => item.date === date);
        return '<section class="day-group"><div class="day-group-head"><h3>' + DAY_NAMES[index] + '</h3><span>'
          + escapeHtml(formatDate(date, { day:'numeric', month:'short' })) + ' · ' + dayTasks.length + '</span></div>'
          + '<div class="day-group-tasks">' + (dayTasks.map(taskRow).join('') || '<div class="tracker-empty">Без задач</div>') + '</div></section>';
      }).join('')
      : tasks.map(taskRow).join('');
  }

  function taskRow(item) {
    const risk = isRisk(item);
    const action = APP_MODE === 'team' && !isGaTeamPreview() && canMarkTask(item) && item.status === 'todo';
    const id = escapeHtml(item.id);
    const subtitle = item.pending ? 'Ожидает сохранения' : item.status === 'todo' && risk ? 'Просрочено' : statusLabel(item.status);
    return '<article class="tracker-row" data-status="' + escapeHtml(item.status) + '" data-risk="' + risk + '">'
      + (action ? '<button class="tracker-row-check" type="button" data-done="' + id + '" aria-label="Выполнить: '
        + escapeHtml(item.title) + '"' + (item.pending ? ' disabled' : '') + '>' + taskBadge(item.icon,{mark:'square'}) + '</button>'
        : '<span class="tracker-row-icon" aria-hidden="true">' + taskBadge(item.icon,{mark:risk ? 'alert' : item.status === 'done' ? 'check' : ''}) + '</span>')
      + '<button class="tracker-row-open" type="button" data-open-task="' + id + '"><b>' + escapeHtml(item.title)
      + '</b><small>' + escapeHtml(subtitle) + '</small></button><span class="tracker-row-time">' + escapeHtml(timeLabel(item)) + '</span></article>';
  }

  function renderBoard() {
    const board = document.getElementById('tracker-board');
    if (!board || (!PREVIEW_MODE && !state.viewer?.is_ga)) return;
    const roleSelect = document.getElementById('board-role');
    if (!roleSelect.dataset.loaded || state.boardRoles !== roles) {
      roleSelect.innerHTML = '<option value="all">Все должности</option>' + roles.map(role =>
        '<option value="' + escapeHtml(role.id) + '">' + escapeHtml(role.title) + '</option>').join('');
      roleSelect.dataset.loaded = '1';
      state.boardRoles = roles;
    }
    roleSelect.value = state.boardRole;
    const days = weekDates();
    document.getElementById('board-period').textContent = dateRange(days);
    const order = { high: 0, medium: 1, normal: 2 };
    const all = state.tasks.filter(item => days.includes(item.date) && (state.boardRole === 'all' || item.role === state.boardRole))
      .map(effectiveTask).sort((a,b) => a.date.localeCompare(b.date) || order[a.priority] - order[b.priority] || a.due.localeCompare(b.due));
    const risk = all.filter(isRisk);
    const done = all.filter(t => t.status === 'done');
    document.getElementById('board-week-summary').hidden = false;
    document.getElementById('board-progress-count').textContent = 'Готово: ' + done.length + ' из ' + all.length;
    renderWeekTrack('board', { total: all.length, done: done.length, risk: risk.length });
    const button = document.getElementById('board-overdue');
    button.innerHTML = icon('alert') + '<span>Без результата: ' + risk.length + '</span>';
    button.disabled = !risk.length && !state.boardLate;
    button.setAttribute('aria-pressed', String(state.boardLate));
    document.getElementById('board-count').textContent = (state.boardLate ? risk.length : all.length) + ' '
      + taskWord(state.boardLate ? risk.length : all.length);
    const cols = state.boardLate ? [['risk','Требуют внимания',risk]] : [
      ['todo','К выполнению',all.filter(t => t.status === 'todo' && !isRisk(t))],
      ['risk','Требуют внимания',risk],
      ['done','Готово',done]
    ];
    board.innerHTML = cols.map(([key,title,items]) => {
      const expanded = state.boardExpanded.has(key);
      return '<section class="tracker-column" data-column="' + key + '"><h3>' + title + '<span>' + items.length + '</span></h3>'
        + '<div class="tracker-column-items" id="tracker-column-' + key + '">'
        + ((expanded ? items : items.slice(0,6)).map(boardCard).join('') || '<div class="tracker-empty">Нет задач</div>') + '</div>'
        + (items.length > 6 ? '<button class="btn tracker-more" type="button" data-board-more="' + key
          + '" aria-controls="tracker-column-' + key + '" aria-expanded="' + expanded + '">'
          + (expanded ? 'Свернуть' : 'Ещё ' + (items.length - 6)) + '</button>' : '') + '</section>';
    }).join('');
  }

  function boardCard(item) {
    const risk = isRisk(item), role = getRole(item.role);
    return '<button class="tracker-board-task" type="button" data-open-task="' + escapeHtml(item.id) + '" data-risk="' + risk + '">'
      + taskBadge(item.icon,{mark:risk ? 'alert' : item.status === 'done' ? 'check' : ''})
      + '<span><b>' + escapeHtml(item.title) + '</b><small>' + escapeHtml(role.title) + '</small><em>'
      + escapeHtml(formatDate(item.date,{day:'numeric',month:'short'}) + ' · ' + timeLabel(item)
        + (risk ? ' · ' + (item.status === 'failed' ? 'Не выполнено' : 'Просрочено') : '')) + '</em></span></button>';
  }

  function updateTask(id, patch, message) {
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
    if (!PREVIEW_MODE) {
      state.markError = '';
      state.markSaved = false;
      markQueue.add(current, patch);
      return;
    }
    state.tasks[index] = { ...current, ...patch, history: withHistory(current, message) };
    saveTasks();
    renderAll();
    showToast(message);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
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
    const task = state.tasks.find(taskItem => taskItem.id === id);
    if (!task) return;
    const item = effectiveTask(task);
    state.activeTask = id;
    if (APP_MODE === 'master') {
      openMasterTaskEditor(item);
      return;
    }
    const modal = document.getElementById('task-detail-modal');
    if (!modal) return;
    document.getElementById('task-detail-title').textContent = item.title;
    document.getElementById('task-detail-icon').innerHTML = taskBadge(item.icon,{effect:true});
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
    const readonly = isGaTeamPreview() || item.pending;
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
      if (date > currentToday()) return null;
      const dayTasks = state.tasks.filter(item => item.role === state.role && item.date === date);
      const done = dayTasks.filter(item => item.status === 'done').length;
      return dayTasks.length ? Math.round(done / dayTasks.length * 100) : 0;
    });
    const weekTasks = state.tasks.filter(item => item.role === state.role && dates.includes(item.date));
    const ratio = weekTasks.length ? Math.round(100 * weekTasks.filter(t => t.status === 'done').length / weekTasks.length) : 0;
    const kpi = progressLabel(state.role, ratio);
    document.getElementById('chart-title').textContent = getRole().title;
    document.getElementById('weekly-kpi').innerHTML = escapeHtml(kpi.value) + '<span>' + escapeHtml(kpi.note) + '</span>';
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
      <div class="registry-top"><div><div class="task-overline"><span class="tag ${item.priority}">${priorityLabel(item.priority)}</span><span class="tag">${escapeHtml(getRole(item.role).title)}</span><span class="tag ${item.status === 'done' ? 'done' : item.status === 'failed' ? 'high' : 'blue'}">${statusLabel(item.status)}</span></div><div class="task-title tracker-registry-title">${taskBadge(item.icon)}<span>${escapeHtml(item.title)}</span></div></div><div class="registry-date">${formatDate(item.date, { weekday: 'short', day: '2-digit', month: '2-digit' })}<strong>${item.due}</strong></div></div>
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
    setTaskIcon('edit-task', item.icon, true);
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
    const revokeButton = document.getElementById('revoke-task-completion');
    if (revokeButton) revokeButton.hidden = item.status !== 'done';
    modal.classList.add('open');
  }

  function openRevokeCompletion() {
    const current = state.tasks.find(item => item.id === state.activeTask);
    if (!current || current.status !== 'done') {
      showToast('Отменить можно только выполненную задачу');
      return;
    }
    closeModal('master-task-modal');
    document.getElementById('revoke-completion-task').textContent = `«${current.title}» будет отмечена невыполненной. Причина сохранится в истории и будет видна исполнителю.`;
    document.getElementById('revoke-completion-reason').value = '';
    document.getElementById('revoke-completion-modal').classList.add('open');
  }

  async function confirmRevokeCompletion() {
    const index = state.tasks.findIndex(item => item.id === state.activeTask);
    if (index < 0) return;
    const current = state.tasks[index];
    const reason = document.getElementById('revoke-completion-reason').value.trim();
    if (!reason) {
      showToast('Укажите причину отмены выполнения');
      return;
    }
    const button = document.getElementById('confirm-revoke-completion');
    button.disabled = true;
    button.textContent = 'Сохраняю…';
    try {
      if (!PREVIEW_MODE) {
        await apiRequest('revoke_completion', {
          occurrence_id: current.id,
          task_id: current.task_id,
          reason
        });
        await loadLiveData({ quiet: true });
      } else {
        state.tasks[index] = {
          ...current,
          status: 'failed',
          completedAt: '',
          comment: `Выполнение отменено ГА: ${reason}`,
          history: withHistory(current, `Выполнение отменено ГА. Причина: ${reason}`)
        };
        saveTasks();
        renderAll();
      }
      closeModal('revoke-completion-modal');
      showToast('Выполнение отменено. Задача отмечена невыполненной');
    } catch (error) {
      showToast(error.message || 'Не удалось отменить выполнение');
    } finally {
      button.disabled = false;
      button.textContent = 'Отменить выполнение';
    }
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
    const selectedIcon = chosenTaskIcon('edit-task');
    if (!PREVIEW_MODE) {
      closeModal('master-task-modal');
      showToast('Изменения приняты');
      try {
        await apiRequest('update_task', {
          occurrence_id: current.id,
          task_id: current.task_id,
          title,
          icon: selectedIcon,
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
      icon: selectedIcon,
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
      const selectedIcon = chosenTaskIcon('task');
      const date = weekDates()[plannedDay];
      if (!PREVIEW_MODE) {
        showToast('Задача принята');
        try {
          await apiRequest('create_task', {
            title,
            icon: selectedIcon,
            description: document.getElementById('task-description').value.trim(),
            role_id: role,
            date,
            due_time: document.getElementById('task-due').value || DEFAULT_DUE_TIME,
            duration_minutes: Math.max(5, Math.min(480, Number(document.getElementById('task-minutes').value) || 30)),
            priority,
            rotation_allowed: allowRotation
          });
          form.reset();
          setTaskIcon('task','list');
          document.getElementById('task-due').value = DEFAULT_DUE_TIME;
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
        icon: selectedIcon,
        description: document.getElementById('task-description').value.trim(),
        category: 'Поручение ГА',
        due: document.getElementById('task-due').value || DEFAULT_DUE_TIME,
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
      setTaskIcon('task','list');
      document.getElementById('task-due').value = DEFAULT_DUE_TIME;
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
    document.body.dataset.trackerView = name;
    document.querySelectorAll('.nav-btn').forEach(item => {
      const active = item.dataset.view === name;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.nav-btn').forEach(button => button.addEventListener('click', () => openView(button.dataset.view)));
  document.getElementById('view-personal')?.addEventListener('click', event => {
    const button = event.target.closest('[data-date-mode], #personal-week-all, #personal-overdue, [data-open-task], [data-done]');
    if (!button) return;
    if (button.dataset.openTask) { openTaskDetails(button.dataset.openTask); return; }
    if (button.dataset.done) {
      updateTask(button.dataset.done, { status:'done', completedAt:nowStamp(), comment:'' }, 'Задача отмечена выполненной');
      return;
    }
    state.dateMode = button.dataset.dateMode || (button.id === 'personal-overdue' && state.dateMode !== 'late' ? 'late'
      : button.id === 'personal-overdue' ? currentToday() : 'week');
    renderPersonal();
    if (button.dataset.dateMode) document.querySelector('[data-date-mode="' + button.dataset.dateMode + '"]')?.focus();
  });
  document.getElementById('view-board')?.addEventListener('click', event => {
    const button = event.target.closest('[data-open-task], [data-board-more], #board-overdue');
    if (!button) return;
    if (button.dataset.openTask) { openTaskDetails(button.dataset.openTask); return; }
    const key = button.dataset.boardMore;
    if (key) {
      if (state.boardExpanded.has(key)) state.boardExpanded.delete(key); else state.boardExpanded.add(key);
    } else state.boardLate = !state.boardLate;
    renderBoard();
    if (key) document.querySelector('[data-board-more="' + key + '"]')?.focus();
  });
  document.getElementById('board-role')?.addEventListener('change', event => {
    state.boardRole = event.target.value;
    state.boardLate = false;
    state.boardExpanded.clear();
    renderBoard();
  });
  const boardRefresh = document.getElementById('board-refresh');
  if (boardRefresh && !PREVIEW_MODE) {
    boardRefresh.hidden = false;
    boardRefresh.addEventListener('click', async () => {
      boardRefresh.disabled = true;
      try { await loadLiveData({ quiet: true }); }
      finally { boardRefresh.disabled = false; }
    });
  }
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
  const revokeTaskCompletionButton = document.getElementById('revoke-task-completion');
  if (revokeTaskCompletionButton) revokeTaskCompletionButton.addEventListener('click', openRevokeCompletion);
  const confirmRevokeCompletionButton = document.getElementById('confirm-revoke-completion');
  if (confirmRevokeCompletionButton) confirmRevokeCompletionButton.addEventListener('click', confirmRevokeCompletion);
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
    renderBoard();
    if (document.getElementById('view-progress')) renderProgress();
    renderPersistenceStatus();
    if (document.getElementById('view-plan')) renderPlan();
    renderMasterRegistry();
  }

  initRoleSelect();
  initMasterControls();
  if (PREVIEW_MODE) renderAll();
  else loadLiveData();
  window.addEventListener('online', () => markQueue?.retry());
  window.addEventListener('pagehide', event => { if (!event.persisted) markQueue?.dispose(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (state.pending.size) markQueue?.retry(); else watchPendingProgress();
  });
  window.addEventListener('storage', event => {
    if (!PREVIEW_MODE) return;
    if (event.key !== STORAGE_KEY) return;
    state.tasks = loadTasks();
    renderAll();
  });
})();
