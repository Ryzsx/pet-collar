

const notifications = [
    {
        id: 'demo-001',
        pet: 'Milo',
        category: 'geofence',
        icon: 'bi-geo-alt-fill',
        title: ' Geofence Alert',
        message: 'Milo has exited the designated Home Safe Zone.',
        time: 'Today, 10:18 AM',
        unread: true
    },
    {
        id: 'demo-002',
        pet: 'Milo',
        category: 'location',
        icon: 'bi-pin-map-fill',
        title: ' Location Update',
        message: 'A new GPS location has been recorded for Milo.',
        time: 'Today, 9:56 AM',
        unread: true
    },
    {
        id: 'demo-003',
        pet: 'Milo',
        category: 'activity',
        icon: 'bi-activity',
        title: ' Unusual Activity Pattern',
        message: 'Milo\'s recent activity shows a deviation from the established activity baseline.',
        time: 'Today, 9:38 AM',
        unread: true
    },
    {
        id: 'demo-004',
        pet: 'Milo',
        category: 'collar',
        icon: 'bi-battery-half',
        title: 'Low Battery Alert',
        message: 'Milo\'s collar battery has dropped to 18%. Please charge the device.',
        time: 'Today, 9:22 AM',
        unread: true
    },
    {
        id: 'demo-005',
        pet: 'Milo',
        category: 'collar',
        icon: 'bi-wifi-off',
        title: ' Collar Offline',
        message: 'Milo\'s collar has stopped sending heartbeat updates and is currently offline.',
        time: 'Today, 8:31 AM',
        unread: true
    },
    {
        id: 'demo-006',
        pet: 'Milo',
        category: 'collar',
        icon: 'bi-wifi',
        title: ' Collar Online',
        message: 'Milo\'s collar connection has been restored successfully.',
        time: 'Yesterday, 6:54 PM',
        unread: false
    }
];

import { $, $$, escapeHtml, showToast } from './dom.js';

let currentNotificationFilter = 'geofence';
let notificationBadgeAcknowledged = false;

function acknowledgeNotificationBadge() {
    notificationBadgeAcknowledged = true;
    const badge = $('#notificationCount');
    if (badge) badge.style.display = 'none';
}


function renderNotifications() {
    const container = $('#notificationList');
    if (!container) return;

    // ============================================
    // FILTER NOTIFICATIONS BY SELECTED CATEGORY
    // ============================================

    const filteredNotifications = notifications.filter(item =>
        currentNotificationFilter === 'all' ||
        item.category === currentNotificationFilter
    );

    // ============================================
    // RENDER SELECTED CATEGORY ONLY
    // ============================================

    container.innerHTML = filteredNotifications.map(item => `
        <article
            class="notification-item ${item.unread ? 'unread' : ''}"
            data-notification-id="${escapeHtml(item.id)}">

            <div class="notification-content">
                <strong>${escapeHtml(item.title)} · ${escapeHtml(item.pet)}</strong>
                <p>${escapeHtml(item.message)}</p>
                <small>
                    ${item.unread ? 'Unread notification' : 'Read notification'}
                </small>
            </div>

            <span class="notification-time">
                ${escapeHtml(item.time)}
            </span>
        </article>
    `).join('') || `
        <div class="notifications-empty-state">
            <i class="bi bi-bell-slash" style="font-size: 32px; color: #8ba9a4;"></i>
            <h4>No notifications yet</h4>
            <p>No notifications available in this category.</p>
        </div>
    `;

 

    const categoryCounts = {
        notifCountAll: notifications.length,
        notifCountGeofence: notifications.filter(item => item.category === 'geofence').length,
        notifCountLocation: notifications.filter(item => item.category === 'location').length,
        notifCountActivity: notifications.filter(item => item.category === 'activity').length,
        notifCountCollar: notifications.filter(item => item.category === 'collar').length
    };

    Object.entries(categoryCounts).forEach(([id, count]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = count;
    });


    const unread = notifications.filter(item => item.unread).length;

    const notificationCount = $('#notificationCount');

    if (notificationCount) {
        notificationCount.textContent = unread;
        notificationCount.style.display =
            unread && !notificationBadgeAcknowledged ? '' : 'none';
    }

    const unreadBadge = $('#notificationsUnreadBadge');

    if (unreadBadge) {
        unreadBadge.innerHTML = `
            <i class="bi bi-envelope"></i> ${unread} Unread
        `;
    }
}



function attachNotificationEvents() {
    $$('#notifications .notifications-filter-row [data-notification-filter]').forEach(button => {
        button.addEventListener('click', () => {
            currentNotificationFilter = button.dataset.notificationFilter;

            $$('#notifications .notifications-filter-row [data-notification-filter]').forEach(item => {
                item.classList.toggle('active', item === button);
            });

            renderNotifications();
        });
    });

    $('#markAllReadBtn')?.addEventListener('click', () => {
        notifications.forEach(item => { item.unread = false; });
        renderNotifications();
        showToast('All notifications marked as read.');
    });
}


export { acknowledgeNotificationBadge, renderNotifications, attachNotificationEvents };
