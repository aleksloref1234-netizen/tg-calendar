/* Shared transport for the training Mini Apps. Never replay arbitrary writes. */
(function (root) {
  'use strict';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const pendingStarts = new Map();

  function isRead(path) {
    return /^\/api\/training\/(?:bootstrap|curator)$/.test(path) ||
      /^\/api\/training\/lesson\/[^/]+$/.test(path) ||
      /^\/api\/training\/(?:media\/[^/]+\/view-link|material\/[^/]+\/download-link)$/.test(path) ||
      /^\/api\/training\/(?:curator|editor)\/(?:bootstrap|reviews|audit)$/.test(path) ||
      /^\/api\/training\/editor\/(?:lesson|bank)\/[^/]+$/.test(path) && !path.endsWith('/save');
  }

  function makeError(message, status = 0, retryable = false, code = '') {
    const error = new Error(message);
    Object.assign(error, {status, retryable, code});
    return error;
  }

  async function perform(base, path, body, options) {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const isSubmit = /^\/api\/training\/attempt\/[^/]+\/submit$/.test(path);
    const retries = options.retries ?? (isRead(path) || isSubmit ? 1 : 0);
    const payload = isForm ? body : JSON.stringify(body);
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? (isSubmit ? 45000 : 30000));
      let failure;
      try {
        const response = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: {...(isForm ? {} : {'Content-Type': 'application/json'}),
            'X-Telegram-Init-Data': typeof options.initData === 'function' ? options.initData() : (options.initData || '')},
          body: payload, signal: controller.signal, keepalive: Boolean(options.keepalive),
        });
        // Reading the body can fail after fetch itself has resolved.
        const text = await response.text();
        let result;
        try { result = JSON.parse(text); } catch (_) { result = null; }
        const retryAfter = Number(response.headers.get('Retry-After') || 0);
        if (!response.ok || result?.status !== 'success') {
          const temporary = response.status === 429 || response.status >= 500;
          const fallback = temporary
            ? 'Сервер временно недоступен. Повторите действие чуть позже.'
            : 'Сервер вернул некорректный ответ. Попробуйте ещё раз.';
          failure = makeError(result?.message || fallback, response.status,
            temporary && retryAfter <= 3, result?.code || 'http_error');
          failure.retryAfterMs = retryAfter * 1000;
          failure.requestId = result?.request_id || response.headers.get('X-Request-ID') || '';
          throw failure;
        }
        return result.data;
      } catch (error) {
        failure = failure || makeError(
          error?.name === 'AbortError'
            ? 'Сервер отвечает дольше обычного. Попробуйте ещё раз.'
            : 'Связь с сервером прервалась. Проверьте подключение и повторите действие.',
          0, true, error?.name === 'AbortError' ? 'timeout' : 'network_error');
      } finally {
        clearTimeout(timeout);
      }
      if (!failure.retryable || attempt >= retries || options.keepalive) throw failure;
      await sleep(Math.max(1000, failure.retryAfterMs || 0));
    }
  }

  function request(base, path, body = {}, options = {}) {
    if (!/^\/api\/training\/test\/[^/]+\/start$/.test(path)) {
      return perform(base, path, body, options);
    }
    // Two taps while the same start is pending must not create two variants.
    const key = `${base}${path}`;
    if (pendingStarts.has(key)) return pendingStarts.get(key);
    const promise = perform(base, path, body, options).finally(() => pendingStarts.delete(key));
    pendingStarts.set(key, promise);
    return promise;
  }
  root.TrainingApi = {request};
})(globalThis);
