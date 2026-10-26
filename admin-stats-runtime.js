/* Shared read-only transport for the three statistics pages. No polling,
   persistent data cache, credentials in storage, or automatic retries. */
(() => {
  'use strict';
  const pending = new Map();
  let leaving = false;
  function request(url, {method = 'POST', timeout = 20000} = {}) {
    if (!['GET', 'POST'].includes(method)) return Promise.reject(new Error('Неверный метод запроса.'));
    const tg = window.Telegram?.WebApp;
    if (!tg?.initData) return Promise.reject(new Error('Откройте страницу из Telegram-бота.'));
    if (leaving) return Promise.reject(new Error('Страница уже закрыта.'));
    const key = `${method}:${url}`;
    if (pending.has(key)) return pending.get(key).promise;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    const promise = Promise.resolve().then(async () => {
      try {
        const response = await fetch(url, {
          method, headers: {'X-Telegram-Init-Data': tg.initData},
          cache: 'no-store', signal: controller.signal,
        });
        let result;
        try { result = await response.json(); }
        catch { throw new Error(`Сервер вернул некорректный ответ (HTTP ${response.status}).`); }
        if (!response.ok || result.status !== 'success') {
          const error = new Error(result.message || `HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
          throw new Error('Сервер не передал данные статистики.');
        }
        return result.data;
      } catch (error) {
        if (timedOut) throw new Error('Сервер отвечает слишком долго. Повторите запрос.');
        throw error;
      } finally {
        clearTimeout(timer);
        pending.delete(key);
      }
    });
    pending.set(key, {controller, promise});
    return promise;
  }
  function showError(element, title, detail, retry) {
    element.replaceChildren();
    element.setAttribute('role', 'alert');
    const box = document.createElement('div');
    box.className = 'stats-error';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const message = document.createElement('p');
    message.textContent = detail;
    box.append(heading, message);
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = 'Повторить загрузку';
      button.addEventListener('click', () => { button.disabled = true; void retry(); }, {once: true});
      box.append(button);
    }
    element.append(box);
  }
  function navigate(path) {
    if (window.AdminControlEmbed) return window.AdminControlEmbed.navigate(path);
    window.location.href = path;
    return true;
  }
  // Store only bounded interface choices, scoped per viewer. Never API data.
  function stateKey(page) {
    const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    return id ? `admin-stats-ui:${id}:${page}` : null;
  }
  function readState(page) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(stateKey(page)) || '{}');
      return {
        view: ['overview','analytics','admins'].includes(saved.view) ? saved.view : 'overview',
        zone: ['all','red','yellow','green','reduced'].includes(saved.zone) ? saved.zone : 'all',
        search: typeof saved.search === 'string' ? saved.search.slice(0, 100) : '',
      };
    } catch { return {view:'overview', zone:'all', search:''}; }
  }
  function writeState(page, state) {
    const key = stateKey(page);
    if (!key) return;
    try { sessionStorage.setItem(key, JSON.stringify({view:state.view, zone:state.zone, search:String(state.search || '').slice(0,100)})); } catch {}
  }
  window.addEventListener('pagehide', () => {
    leaving = true;
    for (const {controller} of pending.values()) controller.abort();
    pending.clear();
  });
  window.addEventListener('pageshow', () => { leaving = false; });
  window.AdminStats = Object.freeze({request, showError, navigate, readState, writeState});
})();
