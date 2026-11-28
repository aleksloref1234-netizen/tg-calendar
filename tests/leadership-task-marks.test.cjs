const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../leadership-task-marks');

function localStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key: index => [...data.keys()][index],
    getItem: key => data.get(key),
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  };
}

const task = { id:'task:2026-11-28', task_id:'task', markRevision:'existing' };
const receipt = { export_key:'completion:receipt', status:'done', mark_revision:'new' };
function testQueue(ctx, storage, send) {
  const events = { changes:[], confirmed:[], rejected:[], progress:[] };
  const queue = create({
    storage, send, onChange: x => events.changes.push(x),
    onConfirmed: (...args) => events.confirmed.push(args),
    onRejected: (...args) => events.rejected.push(args),
    onProgress: x => events.progress.push(x), onResync: () => {}
  });
  ctx.after(() => queue.dispose());
  return { queue, events };
}

test('optimistic mark is durable locally and stays pending until its Sheets receipt completes', async t => {
  const disk = localStorage();
  let first;
  const a = testQueue(t, disk, async (action, payload) => {
    if (action === 'set_status') {
      first = payload;
      return receipt;
    }
    return { receipts:{ [receipt.export_key]:'pending' }, progress:{ admin:{ updating:true } } };
  });
  a.queue.useViewer(123);
  assert.equal(a.queue.add(task,{ status:'done' }),true);
  assert.equal(a.queue.add(task,{ status:'todo' }),false);
  assert.equal(a.events.changes.at(-1).entries[0].status,'done');
  await a.queue.run();
  assert.equal(first.expected_revision,'existing');
  assert.equal(a.events.confirmed.length,0);
  assert.equal(disk.length,1);
  a.queue.dispose();

  const b = testQueue(t, disk, async (action, payload) => {
    assert.equal(action,'task_sync_status');
    assert.deepEqual(payload.keys,[receipt.export_key]);
    return { receipts:{ [receipt.export_key]:'completed' } };
  });
  b.queue.useViewer(123);
  await b.queue.run();
  assert.deepEqual(b.events.confirmed[0][1],receipt);
  assert.equal(disk.length,0);
});

test('a transport failure retains the operation, and a repeated request uses the same ID', async t => {
  const disk = localStorage(), ids = [];
  const { queue, events } = testQueue(t,disk,async (action, payload) => {
    assert.equal(action,'set_status');
    ids.push(payload.request_id);
    if (ids.length === 1) throw new Error('network interrupted');
    throw Object.assign(new Error('Отметка уже изменилась'),{ status:400 });
  });
  queue.useViewer(123);
  queue.add(task,{ status:'done' });
  await queue.run();
  assert.equal(disk.length,1);
  await queue.run();
  assert.equal(ids[0],ids[1]);
  assert.equal(events.rejected.length,1);
  assert.equal(disk.length,0);
});

test('another Telegram user cannot resume a locally stored mark', async t => {
  const disk = localStorage();
  const old = testQueue(t,disk,() => assert.fail('unexpected call'));
  old.queue.useViewer(123);
  old.queue.add(task,{ status:'done' });
  old.queue.dispose();
  const other = testQueue(t,disk,() => assert.fail('unexpected call'));
  other.queue.useViewer(234);
  await other.queue.run();
  assert.equal(other.events.changes.at(-1).entries.length,0);
  assert.equal(disk.length,1);
});
