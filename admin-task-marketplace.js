(() => {
  'use strict';

  const API_URL = 'https://tg-admin-bot-1k1g.onrender.com/api/admin/tasks';
  const tg = window.Telegram?.WebApp;
  const state = { data: null, role: 'admin', adminTab: 'available', leaderTab: 'counter' };
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

  tg?.ready();
  tg?.expand();

  async function api(action, payload = {}) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': tg?.initData || ''
      },
      body: JSON.stringify({ action, ...payload })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.status !== 'success') {
      const error = new Error(body.message || 'Не удалось выполнить операцию.');
      error.status = response.status;
      throw error;
    }
    return body.data;
  }

  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.hidden = true; }, 3200);
  }

  async function reload({ quiet = false } = {}) {
    try {
      state.data = await api('bootstrap');
      $('#loading-gate').hidden = true;
      $('#closed-gate').hidden = true;
      $('#app').hidden = false;
      $('#role-switch').hidden = !state.data.viewer.is_leader;
      render();
    } catch (error) {
      $('#loading-gate').hidden = true;
      $('#app').hidden = true;
      $('#closed-gate').hidden = false;
      $('#closed-message').textContent = error.message || 'Раздел пока недоступен.';
      if (!quiet && error.status !== 403 && error.status !== 404) toast(error.message);
    }
  }

  function typeLabel(mode) {
    return ({
      leadership_counter: 'Отметки руководства',
      manual_review: 'Ручная проверка',
      evidence_review: 'Проверка со скриншотами'
    })[mode] || 'Проверка';
  }

  function statusLabel(status) {
    return ({
      in_progress: 'В работе', pending_review: 'На проверке', approved: 'Выполнено',
      rejected: 'Отклонено', expired: 'Истёк срок'
    })[status] || status;
  }

  function statusClass(status) {
    if (status === 'approved') return 'ok';
    if (status === 'pending_review') return 'wait';
    if (['rejected', 'expired'].includes(status)) return 'bad';
    return '';
  }

  function progressBlock(item) {
    const target = Math.max(1, Number(item.target_count || 1));
    const progress = Math.min(target, Number(item.progress || 0));
    return `<div class="progress-head"><span>Прогресс</span><b>${progress} из ${target}</b></div><div class="progress"><i style="width:${Math.round(progress / target * 100)}%"></i></div>`;
  }

  function reward(item) {
    return `<div class="reward-row"><span class="reward">+${Number(item.reward_reports || 0)} репортов</span><span class="reward">+${Number(item.reward_index || 0).toLocaleString('ru-RU')}% к индексу</span></div>`;
  }

  function templateCard(item, takenIds) {
    const taken = takenIds.has(item.template_id);
    return `<article class="task-card"><div class="task-top"><span class="task-icon">${item.verification_mode === 'leadership_counter' ? '⚡' : item.verification_mode === 'evidence_review' ? '▣' : '✓'}</span><div class="task-copy"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><span class="type">${typeLabel(item.verification_mode)}</span></div></div>${reward(item)}<div class="meta-row"><span class="meta">Цель: ${item.target_count}</span><span class="meta">Срок: ${item.deadline_hours} ч.</span></div><div class="actions"><button class="button primary" data-take="${esc(item.template_id)}" ${taken ? 'disabled' : ''}>${taken ? 'Уже в работе' : 'Взять задание'}</button></div></article>`;
  }

  function adminAssignmentCard(item, evidenceByAssignment) {
    const evidence = evidenceByAssignment.get(item.assignment_id) || [];
    const canSubmit = item.status === 'in_progress' && item.verification_mode !== 'leadership_counter';
    const upload = item.status === 'in_progress' && item.verification_mode === 'evidence_review'
      ? `<label class="upload">＋ Добавить скриншоты<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-upload="${esc(item.assignment_id)}"></label>` : '';
    const evidenceList = evidence.length ? `<div class="evidence-grid">${evidence.map(file => `<span class="meta">${esc(file.file_name)}</span>`).join('')}</div>` : '';
    return `<article class="task-card"><div class="task-top"><span class="task-icon">${item.verification_mode === 'leadership_counter' ? '⚡' : '✓'}</span><div class="task-copy"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></div><span class="status ${statusClass(item.status)}">${statusLabel(item.status)}</span></div>${reward(item)}${progressBlock(item)}${evidenceList}${upload}${canSubmit ? `<div class="actions"><button class="button primary" data-submit="${esc(item.assignment_id)}">Задание выполнено</button></div>` : ''}${item.decision_reason ? `<div class="meta-row"><span class="meta">${esc(item.decision_reason)}</span></div>` : ''}</article>`;
  }

  function renderAdmin() {
    const { templates, wallet, evidence } = state.data;
    const assignments = state.data.own_assignments || state.data.assignments;
    $('#wallet-reports').textContent = Number(wallet.report_balance || 0);
    $('#wallet-index').textContent = Number(wallet.index_bonus_total || 0).toLocaleString('ru-RU');
    const active = assignments.filter(item => ['in_progress', 'pending_review'].includes(item.status));
    const history = assignments.filter(item => !['in_progress', 'pending_review'].includes(item.status));
    const takenIds = new Set(active.map(item => item.template_id));
    const evidenceByAssignment = new Map();
    const ownIds = new Set(assignments.map(item => item.assignment_id));
    evidence.filter(file => ownIds.has(file.assignment_id)).forEach(file => {
      const list = evidenceByAssignment.get(file.assignment_id) || [];
      list.push(file); evidenceByAssignment.set(file.assignment_id, list);
    });
    $('#available-list').innerHTML = templates.length ? templates.map(item => templateCard(item, takenIds)).join('') : empty('Нет доступных заданий');
    $('#active-list').innerHTML = active.length ? active.map(item => adminAssignmentCard(item, evidenceByAssignment)).join('') : empty('Нет заданий в работе');
    $('#history-list').innerHTML = history.length ? history.map(item => adminAssignmentCard(item, evidenceByAssignment)).join('') : empty('История пока пуста');
  }

  function leaderCard(item, evidenceByAssignment) {
    const files = evidenceByAssignment.get(item.assignment_id) || [];
    const fileHtml = files.length ? `<div class="evidence-grid">${files.map(file => file.view_url ? `<a href="${esc(file.view_url)}" target="_blank" rel="noopener"><img src="${esc(file.view_url)}" alt="${esc(file.file_name)}"></a>` : `<span class="meta">${esc(file.file_name)}</span>`).join('')}</div>` : '';
    const controls = item.verification_mode === 'leadership_counter'
      ? `<div class="actions"><button class="button primary" data-mark="${esc(item.assignment_id)}">Засчитать вход</button><button class="button ghost" data-undo="${esc(item.assignment_id)}">Отменить отметку</button></div>`
      : item.status === 'pending_review'
        ? `<div class="actions"><button class="button primary" data-review="approve" data-id="${esc(item.assignment_id)}">Принять</button><button class="button secondary" data-review="return" data-id="${esc(item.assignment_id)}">Вернуть</button><button class="button danger" data-review="reject" data-id="${esc(item.assignment_id)}">Отклонить</button></div>` : '';
    return `<article class="task-card"><div class="person"><span class="avatar">${esc((item.admin_nickname || 'ID').slice(0,2).toUpperCase())}</span><div class="task-copy"><h3>${esc(item.admin_nickname || `ID ${item.admin_id}`)}</h3><small>${esc(item.title)}</small></div><span class="status ${statusClass(item.status)}">${statusLabel(item.status)}</span></div><p>${esc(item.description)}</p>${reward(item)}${progressBlock(item)}${fileHtml}${controls}</article>`;
  }

  function renderLeader() {
    const assignments = state.data.assignments;
    const evidenceByAssignment = new Map();
    state.data.evidence.forEach(file => {
      const list = evidenceByAssignment.get(file.assignment_id) || [];
      list.push(file); evidenceByAssignment.set(file.assignment_id, list);
    });
    const counters = assignments.filter(item => item.verification_mode === 'leadership_counter' && item.status === 'in_progress');
    const reviews = assignments.filter(item => item.verification_mode === 'manual_review' && item.status === 'pending_review');
    const proofs = assignments.filter(item => item.verification_mode === 'evidence_review' && item.status === 'pending_review');
    $('#counter-count').textContent = counters.length;
    $('#review-count').textContent = reviews.length + proofs.length;
    $('#counter-list').innerHTML = counters.length ? counters.map(item => leaderCard(item, evidenceByAssignment)).join('') : empty('Нет активных счётчиков');
    $('#review-list').innerHTML = reviews.length ? reviews.map(item => leaderCard(item, evidenceByAssignment)).join('') : empty('Нет отчётов без файлов');
    $('#evidence-list').innerHTML = proofs.length ? proofs.map(item => leaderCard(item, evidenceByAssignment)).join('') : empty('Нет отчётов со скриншотами');
    $('#templates-list').innerHTML = `<div class="actions"><button class="button primary" id="open-create">＋ Создать задание</button></div>${state.data.templates.map(item => `<article class="task-card"><div class="task-top"><span class="task-icon">✦</span><div class="task-copy"><h3>${esc(item.title)}</h3><p>${typeLabel(item.verification_mode)} · цель ${item.target_count}</p></div><span class="status ${item.enabled ? 'ok' : 'bad'}">${item.enabled ? 'Активно' : 'Выключено'}</span></div>${reward(item)}</article>`).join('')}`;
  }

  function empty(text) { return `<div class="empty">${esc(text)}</div>`; }

  function render() {
    $('#admin-view').hidden = state.role !== 'admin';
    $('#leader-view').hidden = state.role !== 'leader';
    document.querySelectorAll('#role-switch button').forEach(button => button.classList.toggle('active', button.dataset.role === state.role));
    renderAdmin();
    if (state.data.viewer.is_leader) renderLeader();
    switchTab('admin', state.adminTab);
    if (state.data.viewer.is_leader) switchTab('leader', state.leaderTab);
  }

  function switchTab(area, tab) {
    state[area === 'admin' ? 'adminTab' : 'leaderTab'] = tab;
    document.querySelectorAll(`#${area}-tabs button`).forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    const ids = area === 'admin' ? ['available','active','history'] : ['counter','review','evidence','templates'];
    ids.forEach(id => { $(`#${id}-list`).hidden = id !== tab; });
  }

  function askDecision({ eyebrow = 'Подтверждение', title, text, reason = false, confirm = 'Подтвердить' }) {
    return new Promise(resolve => {
      const dialog = $('#decision-dialog');
      $('#dialog-eyebrow').textContent = eyebrow;
      $('#dialog-title').textContent = title;
      $('#dialog-text').textContent = text || '';
      $('#reason-wrap').hidden = !reason;
      $('#dialog-reason').value = '';
      $('#dialog-confirm').textContent = confirm;
      const finish = () => {
        dialog.removeEventListener('close', finish);
        resolve(dialog.returnValue === 'default' ? $('#dialog-reason').value.trim() : null);
      };
      dialog.addEventListener('close', finish);
      dialog.showModal();
    });
  }

  async function compressImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('Можно прикрепить только изображение.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .82));
    if (!blob) throw new Error('Не удалось подготовить изображение.');
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.webp', type: 'image/webp' };
  }

  async function uploadEvidence(assignmentId, files) {
    for (const source of [...files].slice(0, 5)) {
      const prepared = await compressImage(source);
      const reservation = await api('create_evidence_upload', {
        assignment_id: assignmentId, file_name: prepared.name, mime_type: prepared.type
      });
      if (prepared.blob.size > reservation.max_bytes) throw new Error('Скриншот слишком большой.');
      const response = await fetch(reservation.upload_url, {
        method: 'PUT', headers: {'Content-Type': prepared.type}, body: prepared.blob
      });
      if (!response.ok) throw new Error('Не удалось загрузить скриншот в хранилище.');
      await api('confirm_evidence_upload', { evidence_id: reservation.evidence_id });
    }
  }

  document.addEventListener('click', async event => {
    const role = event.target.closest('[data-role]');
    if (role) { state.role = role.dataset.role; render(); return; }
    const tab = event.target.closest('.tabs [data-tab]');
    if (tab) { switchTab(tab.closest('#leader-tabs') ? 'leader' : 'admin', tab.dataset.tab); return; }
    const take = event.target.closest('[data-take]');
    if (take) {
      const accepted = await askDecision({ title:'Взять задание?', text:'После подтверждения оно появится во вкладке «В работе».', confirm:'Взять' });
      if (accepted === null) return;
      try { await api('take_task', {template_id:take.dataset.take}); await reload({quiet:true}); toast('Задание взято'); } catch (error) { toast(error.message); }
      return;
    }
    const submit = event.target.closest('[data-submit]');
    if (submit) {
      const accepted = await askDecision({ title:'Отправить на проверку?', text:'Награда будет начислена только после решения руководства.', confirm:'Отправить' });
      if (accepted === null) return;
      try { await api('submit', {assignment_id:submit.dataset.submit}); await reload({quiet:true}); toast('Задание отправлено на проверку'); } catch (error) { toast(error.message); }
      return;
    }
    const mark = event.target.closest('[data-mark]');
    if (mark) {
      const operationName = `admin-task-entry:${mark.dataset.mark}`;
      const sourceKey = sessionStorage.getItem(operationName) || `entry:${mark.dataset.mark}:${crypto.randomUUID()}`;
      sessionStorage.setItem(operationName, sourceKey);
      mark.disabled = true;
      try {
        const result = await api('mark_progress', {assignment_id:mark.dataset.mark,source_key:sourceKey});
        sessionStorage.removeItem(operationName);
        await reload({quiet:true});
        toast(result.duplicate ? 'Этот вход уже был засчитан' : 'Вход засчитан');
      } catch (error) {
        mark.disabled = false;
        toast(error.message);
      }
      return;
    }
    const undo = event.target.closest('[data-undo]');
    if (undo) {
      const reason = await askDecision({eyebrow:'Исправление',title:'Отменить последнюю отметку?',text:'Причина сохранится в истории.',reason:true,confirm:'Отменить отметку'});
      if (!reason) return;
      try { await api('undo_progress',{assignment_id:undo.dataset.undo,reason}); await reload({quiet:true}); toast('Отметка отменена'); } catch (error) { toast(error.message); }
      return;
    }
    const review = event.target.closest('[data-review]');
    if (review) {
      const decision = review.dataset.review;
      const requiresReason = decision !== 'approve';
      const reason = await askDecision({eyebrow:'Модерация',title:decision === 'approve' ? 'Принять выполнение?' : decision === 'return' ? 'Вернуть на доработку?' : 'Отклонить отчёт?',text:decision === 'approve' ? 'Репорты поступят в кошелёк, а процент применится к индексу.' : 'Администратор увидит указанную причину.',reason:requiresReason,confirm:decision === 'approve' ? 'Принять' : 'Сохранить решение'});
      if (reason === null || (requiresReason && !reason)) return;
      try { await api('review',{assignment_id:review.dataset.id,decision,reason}); await reload({quiet:true}); toast('Решение сохранено'); } catch (error) { toast(error.message); }
      return;
    }
    if (event.target.closest('#open-create')) $('#create-dialog').showModal();
  });

  document.addEventListener('change', async event => {
    const input = event.target.closest('[data-upload]');
    if (!input || !input.files?.length) return;
    input.disabled = true;
    try { await uploadEvidence(input.dataset.upload, input.files); await reload({quiet:true}); toast('Скриншоты добавлены'); } catch (error) { toast(error.message); } finally { input.disabled = false; input.value = ''; }
  });

  $('#withdraw-button').addEventListener('click', async () => {
    const available = Number(state.data.wallet.report_balance || 0);
    if (!available) return toast('На балансе пока нет бонусных репортов');
    const raw = window.prompt(`Сколько репортов вывести? Доступно: ${available}`, String(available));
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount < 1 || amount > available) return toast('Укажите корректное количество');
    try { await api('withdraw',{amount,operation_id:`withdraw:${state.data.viewer.user_id}:${crypto.randomUUID()}`}); await reload({quiet:true}); toast('Репорты поставлены в очередь на вывод'); } catch (error) { toast(error.message); }
  });

  $('#create-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await api('create_template', {
        title:$('#create-title').value.trim(),description:$('#create-description').value.trim(),verification_mode:$('#create-mode').value,
        target_count:Number($('#create-target').value),deadline_hours:Number($('#create-deadline').value),reward_reports:Number($('#create-reports').value),reward_index:Number($('#create-index').value)
      });
      $('#create-dialog').close(); await reload({quiet:true}); toast('Шаблон создан');
    } catch (error) { toast(error.message); }
  });

  reload();
})();
