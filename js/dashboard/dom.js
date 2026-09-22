const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

function showToast(message, icon = 'bi-check-circle-fill') {
    const toastElement = $('#appToast');
    if (!toastElement || !window.bootstrap) return;
    $('#toastMessage').textContent = message;
    toastElement.querySelector('.toast-body > i').className = `bi ${icon}`;
    window.bootstrap.Toast.getOrCreateInstance(toastElement, { delay: 2600 }).show();
}

export { $, $$, escapeHtml, showToast };
