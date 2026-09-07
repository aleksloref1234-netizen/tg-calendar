const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../training-api.js'), 'utf8');
function client(fetch) {
  const context = vm.createContext({fetch, AbortController, FormData,
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 1000 && ms <= 3000 ? 0 : ms), clearTimeout});
  vm.runInContext(source, context);
  return (route, body = {}, options = {}) => context.TrainingApi.request('https://example.test', route, body, options);
}
const ok = data => new Response(JSON.stringify({status:'success', data}));

test('lecture recovers from a transient connection failure', async () => {
  let calls = 0;
  const request = client(async () => { if (++calls === 1) throw new TypeError('Failed to fetch'); return ok({lesson:'one'}); });
  assert.equal((await request('/api/training/lesson/one')).lesson, 'one');
  assert.equal(calls, 2);
});
test('does not retry forbidden access or a minute-long quota cooldown', async () => {
  for (const status of [403, 503]) {
    let calls = 0;
    const request = client(async () => { calls++; return new Response(JSON.stringify({status:'error',message:'Причина'}), {status,headers:{'Retry-After':'60'}}); });
    await assert.rejects(request('/api/training/bootstrap'), {message:'Причина'});
    assert.equal(calls, 1);
  }
});
test('deduplicates simultaneous starts without silently replacing a variant', async () => {
  let calls = 0, release;
  const request = client(() => {calls++; return new Promise(resolve => {release = resolve;});});
  const first = request('/api/training/test/bank/start');
  const second = request('/api/training/test/bank/start');
  assert.equal(first, second);
  release(ok({attempt_id:'original'}));
  await first;
  assert.equal(calls, 1);
});
test('start and editor mutations never auto-replay after network errors', async () => {
  for (const route of ['/api/training/test/bank/start','/api/training/editor/bank/save']) {
    let calls = 0;
    const request = client(async () => { calls++; throw new TypeError('Failed to fetch'); });
    await assert.rejects(request(route), error => error.code === 'network_error' && !error.message.includes('fetch'));
    assert.equal(calls, 1);
  }
});
test('submission recovery sends the exact same answers', async () => {
  const bodies = [];
  const request = client(async (_, init) => {bodies.push(init.body); if (bodies.length === 1) throw new TypeError('Failed to fetch'); return ok({already_submitted:true});});
  const result = await request('/api/training/attempt/a1/submit', {answers:{q1:'Мой ответ'}});
  assert.equal(result.already_submitted, true);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
});
test('handles a dropped response body and an HTML gateway failure', async () => {
  let calls = 0;
  const request = client(async () => {
    calls++;
    if (calls === 1) return {text:async () => {throw new TypeError('Failed to fetch');}};
    return new Response('<html>Bad gateway</html>', {status:502});
  });
  await assert.rejects(request('/api/training/bootstrap'), error => error.status === 502 && !error.message.includes('<html>'));
  assert.equal(calls, 2);
});
test('timeout bounds the request including a stalled connection', async () => {
  const request = client((_, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error(), {name:'AbortError'})));
  }));
  await assert.rejects(request('/api/training/lesson/one', {}, {timeoutMs:5,retries:0}), error => error.code === 'timeout');
});
test('multipart upload keeps its body and lets the browser choose its boundary', async () => {
  const form = new FormData(); form.append('name', 'test');
  const request = client(async (_, init) => {
    assert.equal(init.body, form);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['X-Telegram-Init-Data'], 'signature');
    return ok({saved:true});
  });
  assert.equal((await request('/api/training/editor/material/save', form, {initData:'signature'})).saved,true);
});
