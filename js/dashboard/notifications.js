import { notifications } from './demo-data.js';
import { $, $$, escapeHtml, showToast } from './dom.js';

let currentNotificationFilter = 'all';
let notificationBadgeAcknowledged = false;

function acknowledgeNotificationBadge() {
    notificationBadgeAcknowledged = true;
    const badge = $('#notificationCount');
    if (badge) badge.style.display = 'none';
}

function renderNotifications() {
    const container = $('#notificationList');
    if (!container) return;
    container.innerHTML = notifications.map(item => `
        <article class="notification-item ${item.unread ? 'unread' : ''} ${currentNotificationFilter !== 'all' && (currentNotificationFilter === 'unread' ? !item.unread : item.category !== currentNotificationFilter) ? 'hidden' : ''}" data-notification-id="${item.id}">
            <span class="notification-type-icon ${item.category}"><i class="bi ${item.icon}"></i></span>
            <div class="notification-content"><strong>${escapeHtml(item.title)} · ${escapeHtml(item.pet)}</strong><p>${escapeHtml(item.message)}</p><small>${item.unread ? 'Unread notification' : 'Read notification'}</small></div>
            <span class="notification-time">${escapeHtml(item.time)}</span>
        </article>
    `).join('');
    const unread = notifications.filter(item => item.unread).length;
    $('#notificationCount').textContent = unread;
    $('#notificationCount').style.display = unread && !notificationBadgeAcknowledged ? '' : 'none';
    $('#unreadFilterCount').textContent = unread;
}

function attachNotificationEvents() {
    $$('.filter-tabs [data-notification-filter]').forEach(button => button.addEventListener('click', () => {
        currentNotificationFilter = button.dataset.notificationFilter;
        $$('.filter-tabs button').forEach(item => item.classList.toggle('active', item === button));
        renderNotifications();
    }));
    $('#markAllReadBtn')?.addEventListener('click', () => {
        notifications.forEach(item => { item.unread = false; });
        renderNotifications();
        showToast('All notifications marked as read.');
    });

}

export { acknowledgeNotificationBadge, renderNotifications, attachNotificationEvents };
