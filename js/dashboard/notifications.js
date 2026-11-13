let notifications = [];
let selectedNotificationPetId = null;

import { $, $$, escapeHtml, showToast } from './dom.js';
import {
    auth,
    db,
    collection,
    doc,
    query,
    orderBy,
    onSnapshot,
    onAuthStateChanged,
    writeBatch,
    serverTimestamp
} from '../firebase-init.js';   

let currentNotificationFilter = 'all';
let notificationBadgeAcknowledged = false;

let unsubscribeNotificationAuth = null;
let unsubscribeNotificationData = null;

function formatNotificationTime(timestamp) {
    const date = timestamp?.toDate?.();

    if (!date) return 'Time unavailable';

    return new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Manila'
    }).format(date);
}

function startNotificationListener() {
    if (unsubscribeNotificationAuth) return;

    unsubscribeNotificationAuth = onAuthStateChanged(
        auth,
        user => {
            // Remove listener from the previous account.
            if (unsubscribeNotificationData) {
                unsubscribeNotificationData();
                unsubscribeNotificationData = null;
            }

            notifications = [];
            notificationBadgeAcknowledged = false;
            renderNotifications();

            if (!user || !user.emailVerified) return;

            const notificationsRef = collection(
                db,
                'users',
                user.uid,
                'notifications'
            );

            const notificationsQuery = query(
                notificationsRef,
                orderBy('createdAt', 'desc')
            );

            unsubscribeNotificationData = onSnapshot(
                notificationsQuery,
                snapshot => {
                    const previousUnreadIds = new Set(
                        notifications
                            .filter(item => item.unread)
                            .map(item => item.id)
                    );

                    const hadNotifications = notifications.length > 0;

                    notifications = snapshot.docs.map(document => {
                        const data = document.data();

                        return {
                            id: document.id,
                            petId: String(data.petId || ''),
                            pet: data.petName || 'Pet',
                            category: data.category || 'collar',
                            title: data.title || 'Notification',
                            message: data.message || '',
                            time: formatNotificationTime(
                                data.eventAt || data.createdAt
                            ),
                            unread: data.isRead === false
                        };
                    });

                    // Show the badge again when a new unread
                    // notification arrives while the page is open.
                    if (
                        hadNotifications &&
                        notifications.some(item =>
                            item.unread &&
                            !previousUnreadIds.has(item.id)
                        )
                    ) {
                        notificationBadgeAcknowledged = false;
                    }

                    renderNotifications();
                },
                error => {
                console.error('Notification Firestore Error:', {
                    code: error.code,
                    message: error.message
                });

                showToast(
                    'Unable to load notifications.',
                    'bi-exclamation-circle-fill'
                );
            }
            );
        }
    );
}

function acknowledgeNotificationBadge() {
    notificationBadgeAcknowledged = true;
    const badge = $('#notificationCount');
    if (badge) badge.style.display = 'none';
}

function setSelectedNotificationPetId(petId) {
    selectedNotificationPetId = petId
        ? String(petId)
        : null;

    renderNotifications();
}

function renderNotifications() {
    const container = $('#notificationList');
    if (!container) return;

    // ============================================
    // FILTER NOTIFICATIONS BY SELECTED CATEGORY
    // ============================================

    const notificationsForPet = notifications.filter(
    item => item.petId === selectedNotificationPetId
);

    const filteredNotifications = notificationsForPet.filter(item => {
    const category = item.category;

    if (currentNotificationFilter === 'all') {
        return true;
    }

    if (currentNotificationFilter === 'unread') {
        return item.unread;
    }

    if (currentNotificationFilter === 'location') {
        return category === 'location' ||
               category === 'geofence';
    }

    if (currentNotificationFilter === 'device') {
        return category === 'device' ||
               category === 'collar';
    }

    return category === currentNotificationFilter;
});

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
    notifCountAll: notificationsForPet.length,

    notifCountGeofence: notificationsForPet.filter(
        item => item.category === 'geofence'
    ).length,

    notifCountLocation: notificationsForPet.filter(
        item => item.category === 'location'
    ).length,

    notifCountActivity: notificationsForPet.filter(
        item => item.category === 'activity'
    ).length,

    notifCountCollar: notificationsForPet.filter(
        item => item.category === 'collar' ||
                item.category === 'device'
    ).length
};

    Object.entries(categoryCounts).forEach(([id, count]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = count;
    });


    const unread = notificationsForPet.filter(item => item.unread).length;
    const totalUnread = notifications.filter(item => item.unread).length;
    const unreadFilterCount = $('#unreadFilterCount');

    if (unreadFilterCount) {
        unreadFilterCount.textContent = unread;
    }

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
    startNotificationListener();

        const activeFilter = document.querySelector(
        '#notifications [data-notification-filter].active'
    );

    if (activeFilter) {
        currentNotificationFilter =
            activeFilter.dataset.notificationFilter;
    }
    
    $$('#notifications [data-notification-filter]').forEach(button => {
    button.addEventListener('click', () => {
        currentNotificationFilter = button.dataset.notificationFilter;

        $$('#notifications [data-notification-filter]').forEach(item => {
            item.classList.toggle('active', item === button);
        });

        renderNotifications();
    });
});

    $('#markAllReadBtn')?.addEventListener('click', async event => {
    const user = auth.currentUser;
    const button = event.currentTarget;

    if (!user) {
        showToast('Please sign in again.');
        return;
    }

    const unreadNotifications = notifications.filter(
    item => item.unread &&
            item.petId === selectedNotificationPetId
    );  

    if (unreadNotifications.length === 0) {
        showToast('No unread notifications.');
        return;
    }

    button.disabled = true;

    try {
        // Process in batches to avoid oversized writes.
        for (let i = 0; i < unreadNotifications.length; i += 400) {
            const batch = writeBatch(db);

            const group = unreadNotifications.slice(i, i + 400);

            group.forEach(item => {
                const notificationRef = doc(
                    db,
                    'users',
                    user.uid,
                    'notifications',
                    item.id
                );

                batch.update(notificationRef, {
                    isRead: true,
                    readAt: serverTimestamp()
                });
            });

            await batch.commit();
        }

        showToast(
            'All notifications marked as read.',
            'bi-check-circle-fill'
        );

        // onSnapshot automatically refreshes the list.

    } catch (error) {
        console.error('Failed to mark notifications as read:', error);

        showToast(
            'Failed to update notifications. Please try again.',
            'bi-exclamation-circle-fill'
        );

    } finally {
        button.disabled = false;
    }
});
}

export {
    acknowledgeNotificationBadge,
    renderNotifications,
    attachNotificationEvents,
    setSelectedNotificationPetId
};
