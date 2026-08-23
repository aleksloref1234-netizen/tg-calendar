(() => {
  "use strict";

  const LAYER_ID = "screenWatermark";
  const STYLE_ID = "adminControlWatermarkStyle";
  const VIEWER_API = "https://tg-admin-bot-1k1g.onrender.com/api/webapp/viewer";
  const CACHE_PREFIX = "admin-control-watermark:";

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .screen-watermark {
        position: fixed;
        z-index: 10;
        inset: -18vh -32vw;
        display: grid;
        grid-template-columns: repeat(4, minmax(180px, 1fr));
        grid-auto-rows: 170px;
        align-items: center;
        justify-items: center;
        transform: rotate(-22deg);
        pointer-events: none;
        overflow: hidden;
        user-select: none;
        -webkit-user-select: none;
        opacity: .065;
      }
      .screen-watermark.hidden { display: none !important; }
      .screen-watermark span {
        max-width: 200px;
        color: #b9ddf5;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .045em;
        line-height: 1.35;
        text-align: center;
        white-space: nowrap;
        text-shadow: 0 1px 8px rgba(56, 189, 248, .28);
      }
    `;
    document.head.appendChild(style);
  }

  function ensureLayer() {
    let layer = document.getElementById(LAYER_ID);
    if (!layer) {
      layer = document.createElement("div");
      layer.id = LAYER_ID;
      layer.className = "screen-watermark hidden";
      layer.setAttribute("aria-hidden", "true");
      document.body.prepend(layer);
    }
    return layer;
  }

  function render(user = {}) {
    installStyles();
    const profile = window.Telegram?.WebApp?.initDataUnsafe?.user || {};
    const telegramId = String(user.telegram_id || user.id || profile.id || "").trim();
    if (!telegramId) return false;

    const nickname = String(
      user.table_nickname ||
      user.roster_nickname ||
      user.nickname ||
      user.display_name ||
      user.full_name ||
      user.username ||
      "NickName не найден"
    ).trim().slice(0, 40);
    const label = `${nickname} · Telegram ID ${telegramId}`;
    const layer = ensureLayer();
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 28; index += 1) {
      const item = document.createElement("span");
      item.style.transform = `translateY(${index % 2 ? 18 : -18}px)`;
      item.textContent = label;
      fragment.appendChild(item);
    }

    layer.replaceChildren(fragment);
    layer.classList.remove("hidden");
    return true;
  }

  function readCachedIdentity(telegramId) {
    if (!telegramId) return null;
    try {
      const value = JSON.parse(sessionStorage.getItem(`${CACHE_PREFIX}${telegramId}`));
      if (String(value?.telegram_id || "") !== String(telegramId)) return null;
      if (!String(value?.nickname || "").trim()) return null;
      return value;
    } catch (_error) {
      return null;
    }
  }

  function cacheIdentity(identity) {
    try {
      sessionStorage.setItem(
        `${CACHE_PREFIX}${identity.telegram_id}`,
        JSON.stringify(identity)
      );
    } catch (_error) {
      // Водяной знак продолжает работать и при отключённом sessionStorage.
    }
  }

  async function refresh() {
    const telegram = window.Telegram?.WebApp;
    const telegramId = String(telegram?.initDataUnsafe?.user?.id || "").trim();
    const cachedIdentity = readCachedIdentity(telegramId);
    if (cachedIdentity) render(cachedIdentity);
    if (!telegramId || !telegram?.initData) return Boolean(cachedIdentity);

    try {
      const response = await fetch(VIEWER_API, {
        method: "POST",
        headers: { "X-Telegram-Init-Data": telegram.initData },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || result.status !== "success") {
        throw new Error(result.message || `HTTP ${response.status}`);
      }
      const identity = result.data || {};
      if (!String(identity.nickname || "").trim()) return Boolean(cachedIdentity);
      cacheIdentity(identity);
      return render(identity);
    } catch (error) {
      console.warn("Не удалось обновить водяной знак из таблицы:", error);
      if (!cachedIdentity) render({ telegram_id: telegramId });
      return Boolean(cachedIdentity);
    }
  }

  function initialize() {
    installStyles();
    void refresh();
  }

  window.AdminControlWatermark = Object.freeze({ render, refresh });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
