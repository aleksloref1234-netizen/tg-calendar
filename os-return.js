(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('return_to') !== 'os') return;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '← Admin Control OS';
  button.setAttribute('aria-label', 'Вернуться в Admin Control OS');
  Object.assign(button.style, {
    position: 'fixed',
    right: '14px',
    bottom: '14px',
    zIndex: '9999',
    border: '1px solid rgba(56, 189, 248, .38)',
    borderRadius: '12px',
    padding: '11px 14px',
    color: '#eaf6ff',
    background: 'rgba(12, 25, 45, .94)',
    boxShadow: '0 12px 34px rgba(0, 0, 0, .34)',
    backdropFilter: 'blur(12px)',
    font: '700 13px system-ui, sans-serif',
    cursor: 'pointer',
  });
  button.addEventListener('click', () => {
    window.location.href = 'admin-control-os-preview.html';
  });
  document.body.appendChild(button);
})();
