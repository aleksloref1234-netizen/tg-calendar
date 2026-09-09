const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../training-center.html'), 'utf8');
const playerSource = html.slice(
  html.indexOf('    function videoTimeLabel('),
  html.indexOf('    function enableFirstWatchLock('),
);

function classes(initial = []) {
  const values = new Set(initial);
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    contains: value => values.has(value),
  };
}

function player() {
  const calls = {native: 0, request: 0, exit: 0, lock: 0, unlock: 0};
  const listeners = {};
  const node = () => ({
    innerHTML: '', textContent: '',
    setAttribute() {},
    style: {setProperty(name, value) { this[name] = value; }},
  });
  const controls = {
    toggle: node(), mute: node(), current: node(), duration: node(), progress: node(),
    expand: node(), exit: node(),
    track: {...node(), getBoundingClientRect: () => ({left: 10, width: 200})},
  };
  const video = {
    controls: true, paused: true, muted: false, volume: 1,
    currentTime: 30, duration: 120,
    webkitEnterFullscreen() { calls.native++; },
    requestFullscreen() { calls.native++; },
    addEventListener(name, handler) { (listeners[name] ||= []).push(handler); },
    async play() { this.paused = false; for (const fn of listeners.play || []) fn(); },
    pause() { this.paused = true; for (const fn of listeners.pause || []) fn(); },
  };
  const selectors = {
    video,
    '.native-fullscreen-hitbox': controls.expand,
    '[data-video-exit]': controls.exit,
    '[data-video-toggle]': controls.toggle,
    '[data-video-mute]': controls.mute,
    '[data-video-track]': controls.track,
    '[data-video-current]': controls.current,
    '[data-video-duration]': controls.duration,
    '[data-video-progress]': controls.progress,
    '.media-playback-error': null,
  };
  const box = {
    classList: classes(), dataset: {},
    querySelector: selector => selectors[selector] ?? null,
    insertAdjacentHTML() {},
  };
  const body = {classList: classes()};
  const tg = {
    isFullscreen: false,
    isVersionAtLeast: () => true,
    expand() {}, requestFullscreen() { calls.request++; }, exitFullscreen() { calls.exit++; },
    lockOrientation() { calls.lock++; }, unlockOrientation() { calls.unlock++; },
    BackButton: {onClick() {}, offClick() {}, show() {}, hide() {}},
  };
  const screen = {orientation: {
    type: 'landscape-primary',
    async lock() { calls.lock++; }, unlock() { calls.unlock++; },
  }};
  const document = {
    body, fullscreenElement: null, webkitFullscreenElement: null,
    querySelector: selector => selector === '.protected-media.native-video-fallback' &&
      box.classList.contains('native-video-fallback') ? box : null,
  };
  const context = vm.createContext({
    esc: value => String(value ?? ''), tg, screen, document,
  });
  vm.runInContext(playerSource, context);
  return {context, calls, controls, video, box, body};
}

test('protected player provides persistent landscape controls and an explicit return', () => {
  const {context} = player();
  const markup = context.protectedVideoHtml('https://example.test/video.mp4');
  assert.match(markup, /playsinline/);
  assert.match(markup, /data-video-exit/);
  assert.match(markup, /Вернуться/);
  assert.match(markup, /data-video-toggle/);
  assert.match(markup, /data-video-track/);
  assert.match(markup, /data-video-mute/);
  assert.match(html, /native-video-fallback \.video-fullscreen-controls\{[^}]*display:grid/);
});

test('fullscreen stays inside the Mini App instead of opening auto-hiding native UI', async () => {
  const {context, calls, video, box, body} = player();
  context.enableVideoFullscreen(box);
  await context.requestVideoFullscreen(box, video);
  await Promise.resolve();
  assert.equal(calls.native, 0);
  assert.equal(calls.request, 1);
  assert.equal(video.controls, false);
  assert.equal(box.classList.contains('native-video-fallback'), true);
  assert.equal(body.classList.contains('native-video-open'), true);

  context.closeVideoFullscreen(box);
  assert.equal(video.controls, true);
  assert.equal(box.classList.contains('native-video-fallback'), false);
  assert.equal(body.classList.contains('native-video-open'), false);
  assert.equal(calls.exit, 1);
  assert.ok(calls.unlock >= 2);
});

test('older Telegram clients still get the in-app player without unsupported API calls', async () => {
  const {context, calls, video, box} = player();
  context.tg.isVersionAtLeast = () => false;
  await context.requestVideoFullscreen(box, video);
  assert.equal(box.classList.contains('native-video-fallback'), true);
  assert.equal(calls.request, 0);
  assert.equal(calls.native, 0);
});

test('persistent controls update playback, sound, time and progress', async () => {
  const {context, controls, video, box} = player();
  context.enableVideoFullscreen(box);
  context.enterVideoFallback(box, video);
  assert.equal(controls.current.textContent, '0:30');
  assert.equal(controls.duration.textContent, '2:00');
  assert.equal(controls.progress.style['--video-progress'], '25%');

  await controls.toggle.onclick({preventDefault() {}, stopPropagation() {}});
  assert.equal(video.paused, false);
  controls.mute.onclick({preventDefault() {}, stopPropagation() {}});
  assert.equal(video.muted, true);
  controls.track.onclick({clientX: 110, preventDefault() {}, stopPropagation() {}});
  assert.equal(video.currentTime, 60);
});
