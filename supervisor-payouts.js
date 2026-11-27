/* Payout status is loaded only in the roster tab, independently of analytics. */
window.createSupervisorPayouts = ({api, tg, esc, getOverview, renderAssignments}) => {
  const $ = (id) => document.getElementById(id);
  const dialog = $('payout-dialog'), amount = $('payout-amount');
  const submit = $('payout-submit'), cancel = $('payout-cancel');
  const rollbackDialog = $('payout-rollback-dialog'), rollbackReason = $('payout-rollback-reason');
  const rollbackCancel = $('payout-rollback-cancel'), rollbackSubmit = $('payout-rollback-submit');
  let states = {}, active = null, loading = false, sending = false, lastLoad = 0;
  let undoId = null, undoPayoutId = null, undoBusy = false;
  const memory = new Map();
  const key = (id) => `supervisor-payout:${tg?.initDataUnsafe?.user?.id || 'session'}:${id}`;

  function readDraft(id) {
    try { return JSON.parse(localStorage.getItem(key(id))) || memory.get(id); }
    catch (_) { return memory.get(id); }
  }
  function saveDraft(id, draft) {
    if (draft) memory.set(id, draft); else memory.delete(id);
    try {
      if (draft) localStorage.setItem(key(id), JSON.stringify(draft));
      else localStorage.removeItem(key(id));
    } catch (_) { /* A live form still retains the draft when storage is blocked. */ }
  }
  function newId() {
    return crypto.randomUUID?.() || Array.from(
      crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0'),
    ).join('');
  }
  async function request(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(api, {
        method:'POST', headers:{'Content-Type':'application/json','X-Telegram-Init-Data':tg?.initData || ''},
        body:JSON.stringify(payload), cache:'no-store', signal:controller.signal,
      });
      const result = await response.json();
      if (!response.ok || result.status !== 'success') throw Object.assign(
        new Error(result.message || 'Не удалось связаться с очередью.'), {status:response.status},
      );
      return result.data;
    } finally { clearTimeout(timeout); }
  }
  async function refresh(force = false) {
    if (!getOverview().payout_enabled || loading || (!force && Date.now() - lastLoad < 25000)) return;
    loading = true;
    $('payout-refresh').disabled = true;
    try {
      states = (await request({action:'payout_status'})).payouts || {};
      lastLoad = Date.now();
      for (const [id, state] of Object.entries(states)) {
        if (['queued','exported','reversing'].includes(state.status)) saveDraft(id, null);
      }
      $('payout-feedback').textContent = '';
      renderAssignments();
    } catch (_) {
      $('payout-feedback').textContent = 'Статусы пока недоступны. Попробуйте обновить.';
    } finally {
      loading = false;
      $('payout-refresh').disabled = false;
    }
  }
  function badge(item) {
    if (!getOverview().payout_enabled) return '';
    const state = states[item.assignment_id];
    if (!state) return '';
    if (state.status === 'available') {
      const label = state.last_rollback ? '<span class="badge removed">Отменено</span>' : '';
      return `<div class="payout-state-actions">${label}<button type="button" class="action payout-primary" data-payout="${esc(item.assignment_id)}">Вывести репорты</button></div>`;
    }
    if (state.status === 'queued' || state.status === 'exported') {
      const done = state.status === 'exported';
      const undo = state.payout_id ? `<button type="button" class="action payout-undo" data-rollback="${esc(item.assignment_id)}">Откатить</button>` : '';
      return `<div class="payout-state-actions"><span class="badge ${done ? 'approved' : 'pending'}">${done ? 'Выведено' : 'В очереди'} · ${esc(state.amount)} реп.</span>${undo}</div>`;
    }
    if (state.status === 'reversing') return state.requires_review
      ? '<span class="badge removed">Откат требует проверки</span>'
      : '<span class="badge pending">Откат в очереди</span>';
    if (state.status === 'cancelled' || state.status === 'reversed') return '<span class="badge removed">Отменено</span>';
    return '';
  }
  function update() {
    $('payout-banner').hidden = !getOverview().payout_enabled;
    if (document.querySelector('[data-view-panel="assignments"].active')) void refresh();
  }
  function open(id) {
    const item = getOverview().active_assignments?.find(row => row.assignment_id === id);
    const state = states[id];
    if (!item || state?.status !== 'available') return;
    active = id;
    const draft = readDraft(id);
    $('payout-nick').textContent = item.applicant_nick;
    $('payout-position').textContent = item.position_title;
    amount.max = String(state.max_amount);
    amount.value = draft?.value || '';
    amount.readOnly = Boolean(draft?.submitted);
    if (amount.readOnly) amount.removeAttribute('max'); // Retry the original request if the response was lost.
    $('payout-error').textContent = draft?.submitted ? 'Ответ не получен. Можно повторить ту же отправку.' : '';
    dialog.showModal();
  }
  $('assignments').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-payout]');
    if (trigger) open(trigger.dataset.payout);
    const undo = event.target.closest('[data-rollback]');
    if (undo) openRollback(undo.dataset.rollback);
  });
  function openRollback(id) {
    const item = getOverview().active_assignments?.find(row => row.assignment_id === id);
    const state = states[id];
    if (undoBusy || !item || !state?.payout_id || !['queued','exported'].includes(state.status)) return;
    undoId = id;
    undoPayoutId = state.payout_id;
    rollbackReason.value = '';
    $('payout-rollback-nick').textContent = item.applicant_nick;
    $('payout-rollback-amount').textContent = `${item.position_title} · ${state.amount} реп.`;
    $('payout-rollback-error').textContent = '';
    rollbackDialog.showModal();
  }
  rollbackCancel.addEventListener('click', () => { if (!undoBusy) rollbackDialog.close(); });
  rollbackDialog.addEventListener('cancel', event => { if (undoBusy) event.preventDefault(); });
  $('payout-rollback-form').addEventListener('submit', async event => {
    event.preventDefault();
    const reason = rollbackReason.value.trim();
    if (undoBusy || !undoPayoutId || !reason) return;
    const id = undoId, payoutId = undoPayoutId;
    undoBusy = rollbackCancel.disabled = rollbackSubmit.disabled = true;
    $('payout-rollback-error').textContent = '';
    try {
      states[id] = await request({action:'rollback_payout', payout_id:payoutId, reason});
      const result = states[id].status === 'reversing' ? 'Откат поставлен в очередь.' : 'Вывод отменён.';
      renderAssignments();
      rollbackDialog.close();
      $('payout-feedback').textContent = result;
      if (states[id].status !== 'reversing') void refresh(true);
    } catch (error) {
      $('payout-rollback-error').textContent = error.status
        ? error.message : 'Ответ не получен. Повторный запрос не спишет репорты дважды.';
    } finally {
      undoBusy = rollbackCancel.disabled = rollbackSubmit.disabled = false;
    }
  });
  $('tabs').addEventListener('click', (event) => {
    if (event.target.closest('[data-view="assignments"]')) void refresh();
  });
  $('payout-refresh').addEventListener('click', () => void refresh(true));
  cancel.addEventListener('click', () => { if (!sending) dialog.close(); });
  dialog.addEventListener('cancel', (event) => { if (sending) event.preventDefault(); });
  amount.addEventListener('input', () => {
    if (active && !amount.readOnly) saveDraft(active, {value:amount.value});
  });
  $('payout-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending || !active || !amount.reportValidity()) return;
    const id = active, previous = readDraft(id);
    const draft = {value:amount.value, requestId:previous?.requestId || newId(), submitted:true};
    const count = Number(draft.value);
    if (!Number.isInteger(count) || count < 1) return;
    saveDraft(id, draft);
    sending = submit.disabled = cancel.disabled = true;
    amount.readOnly = true;
    $('payout-error').textContent = '';
    try {
      const state = await request({action:'queue_payout', assignment_id:id, request_id:draft.requestId, amount:count});
      saveDraft(id, null);
      states[id] = state;
      renderAssignments();
      $('payout-feedback').textContent = ({
        exported:'Репорты уже выведены.', queued:'Вывод поставлен в очередь.',
        reversing:'Откат поставлен в очередь.', reversed:'Вывод отменён.', cancelled:'Вывод отменён.',
      })[state.status] || '';
      dialog.close();
      tg?.HapticFeedback?.notificationOccurred('success');
    } catch (error) {
      if (error.status === 400 || error.status === 403) {
        saveDraft(id, {value:draft.value});
        amount.readOnly = false;
        if (states[id]?.max_amount) amount.max = String(states[id].max_amount);
        $('payout-error').textContent = error.message;
      } else {
        amount.removeAttribute('max');
        $('payout-error').textContent = 'Результат пока не подтверждён. Повторите отправку: новый вывод не создастся.';
      }
    } finally { sending = submit.disabled = cancel.disabled = false; }
  });
  return {badge, update};
};
