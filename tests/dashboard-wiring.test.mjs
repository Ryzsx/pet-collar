import assert from 'node:assert/strict';
import { liveTrackingPets, demoPets, notifications } from '../js/dashboard/demo-data.js';
import { hasCollarInternet, getLivePetState, getGpsState } from '../js/dashboard/pet-status.js';
import { renderActivityCalendar, selectActivityDate } from '../js/dashboard/activity.js';
import { initializeLiveTracking, hasLiveMap } from '../js/dashboard/live-tracking.js';
import { renderAllPets, loadUserPets } from '../js/dashboard/pet-management.js';
import { renderNotifications } from '../js/dashboard/notifications.js';

const elements = new Map([
    ['#healthActivity', { textContent: '' }],
    ['#healthUpdated', { textContent: '' }],
    ['#activityCalendarDays', { innerHTML: '' }],
    ['#activityCalendarTitle', { textContent: '' }],
    ['#notificationList', { innerHTML: '' }],
    ['#notificationCount', { textContent: '', style: {} }],
    ['#unreadFilterCount', { textContent: '' }]
]);

globalThis.document = {
    querySelector: selector => elements.get(selector) || null,
    querySelectorAll: () => []
};
globalThis.localStorage = { getItem: () => null };

assert.equal(liveTrackingPets.length, 3);
assert.equal(demoPets.length, 3);
assert.equal(notifications.length, 5);
assert.equal(hasCollarInternet(liveTrackingPets[0]), true);
assert.equal(getLivePetState(liveTrackingPets[1]).key, 'gps-unavailable');
assert.equal(getGpsState(liveTrackingPets[2]).key, 'warning');

renderAllPets();
await loadUserPets('test-user');
initializeLiveTracking();
assert.equal(elements.get('#healthActivity').textContent, 'Walking');
assert.equal(hasLiveMap(), false);

renderActivityCalendar();
selectActivityDate(new Date(), liveTrackingPets[0].id);
assert.match(elements.get('#activityCalendarDays').innerHTML, /data-activity-date=/);

renderNotifications();
assert.equal(elements.get('#notificationCount').textContent, 3);
assert.equal(elements.get('#unreadFilterCount').textContent, 3);

console.log('Dashboard feature wiring passed without network or live data.');
