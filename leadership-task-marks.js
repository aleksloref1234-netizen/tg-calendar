(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LeadershipTaskMarks = factory();
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  const prefix = 'leadership-task-mark-v1:';
  function create({ storage, send, onChange, onProgress, onConfirmed, onRejected, onResync }) {
    const entries = new Map();
    let scope = '', timer, busy = false, paused = false, failures = 0, storageUnavailable = false, disposed = false;

    function notify() { onChange({ entries: [...entries.values()], paused, storageUnavailable }); }
    function persist(entry) {
      try { storage.setItem(scope + entry.request_id, JSON.stringify(entry)); return true; }
      catch (_) { storageUnavailable = true; return false; }
    }
    function remove(entry) {
      entries.delete(entry.occurrence_id);
      try { storage.removeItem(scope + entry.request_id); } catch (_) {}
    }
    function schedule(delay = 7000) {
      clearTimeout(timer);
      if (!disposed && scope && entries.size && !paused && !busy) timer = setTimeout(run, delay);
    }
    function useViewer(userId) {
      const next = /^\d+$/.test(String(userId)) ? prefix + userId + ':' : '';
      if (!next || next === scope) return;
      scope = next;
      entries.clear();
      paused = false;
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (!key?.startsWith(scope)) continue;
          let item;
          try { item = JSON.parse(storage.getItem(key)); } catch (_) { continue; }
          if (!item?.occurrence_id || item.request_id !== key.slice(scope.length)) continue;
          if (typeof item.task_id !== 'string' || typeof item.expected_revision !== 'string'
              || !['todo', 'done', 'failed'].includes(item.status)) continue;
          const existing = entries.get(item.occurrence_id);
          if (!existing || item.created_at > existing.created_at) entries.set(item.occurrence_id, item);
        }
      } catch (_) { storageUnavailable = true; }
      notify();
      schedule(0);
    }
    function add(task, patch) {
      if (!scope || entries.has(task.id)) return false;
      const alternate = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
      const item = {
        request_id: globalThis.crypto?.randomUUID?.() || alternate(),
        occurrence_id: task.id, task_id: task.task_id,
        status: patch.status, comment: patch.comment || '',
        expected_revision: task.markRevision || '', created_at: Date.now(),
        export_key: null, result: null
      };
      entries.set(task.id, item);
      persist(item);
      notify();
      schedule(0);
      return true;
    }
    async function run() {
      clearTimeout(timer);
      if (disposed || busy || paused || !entries.size) return;
      busy = true;
      let resultAvailable = false;
      let transientFailure = false;
      let resync = false;
      try {
        for (const item of [...entries.values()].filter(x => !x.export_key).slice(0, 10)) {
          const { occurrence_id, task_id, request_id, status, comment, expected_revision } = item;
          try {
            const result = await send('set_status', { occurrence_id, task_id, request_id, status, comment, expected_revision });
            resultAvailable = true;
            if (!Object.prototype.hasOwnProperty.call(result, 'export_key')) {
              // Until both halves are upgraded, fall back to the legacy view.
              remove(item); resync = true; continue;
            }
            if (!result.export_key) {
              remove(item);
              onConfirmed(item, result);
              continue;
            }
            item.export_key = result.export_key;
            item.result = result;
            persist(item);
          } catch (error) {
            if (error.status === 400 || error.status === 409) {
              remove(item);
              onRejected(item, error);
              if (error.status === 409) resync = true;
            } else if (error.status === 403) {
              paused = true;
              break;
            } else {
              transientFailure = true;
              break;
            }
          }
        }
        if (!paused && !transientFailure) {
          const waiting = [...entries.values()].filter(item => item.export_key).slice(0, 30);
          if (waiting.length || resultAvailable) {
            const data = await send('task_sync_status', { keys: waiting.map(item => item.export_key) });
            onProgress(data);
            for (const item of waiting) {
              const status = data.receipts?.[item.export_key];
              if (status === 'completed') {
                remove(item);
                onConfirmed(item, item.result);
              } else if (status === 'superseded') {
                remove(item);
                resync = true;
              } else if (status === 'unknown') {
                // The local server database may have been rebuilt. Replay
                // the checked request, rather than claiming it was saved.
                item.export_key = null;
                item.result = null;
                persist(item);
              }
            }
          }
        }
      } catch (error) {
        if (error.status === 403) paused = true;
        else transientFailure = true;
      } finally {
        busy = false;
        failures = transientFailure ? failures + 1 : 0;
        if (resync) onResync();
        notify();
        schedule(failures ? Math.min(60000, 7000 * (2 ** Math.min(failures, 4))) : 7000);
      }
    }
    return {
      useViewer, add, run,
      retry() { paused = false; failures = 0; notify(); schedule(0); },
      dispose() { disposed = true; clearTimeout(timer); }
    };
  }
  return { create };
});
