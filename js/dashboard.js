import {
    auth,
    signOut,
    onAuthStateChanged,
    getUserData
} from '../js/firebase-init.js';

const placeholderPhotos = [
    'https://images.unsplash.com/photo-1552053831-71594a27632d?w=320&h=320&fit=crop',
    'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=320&h=320&fit=crop',
    'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?w=320&h=320&fit=crop'
];

const GOOGLE_MAPS_API_KEY = 'AIzaSyDMI3xEi1DxPNlaM76B-sFigPOB3khJsGk';
let googleMapsLoader = null;
const LIVE_PET_FOCUS_ZOOM = 18;

// =====================================================
// LIVE MONITORING PROTOTYPE DATA
// Replace this array with C# API / Supabase device data later.
// This data is intentionally separate from Firebase pet data.
// =====================================================
const liveTrackingPets = [
    {
        id: 'max',
        name: 'Max',
        type: 'Dog',
        photo: placeholderPhotos[0],
        collarOnline: true,
        gpsAvailable: true,
        coordinates: [14.6760, 121.0437],
        lastKnownCoordinates: [14.6760, 121.0437],
        locationName: 'Diliman, Quezon City',
        safeZone: { name: 'Home', center: [14.6764, 121.0439], radius: 100 },
        safeZoneStatus: 'inside',
        lastKnownSafeZoneStatus: 'inside',
        battery: 74,
        batteryUpdated: '11:42 PM',
        batteryVoltage: 3.91,
        batteryCondition: 'Normal',
        cellular: { internetAvailable: true, carrier: 'Globe', network: '4G LTE', signal: 'Strong' },
        gpsAccuracy: 3.2,
        satellites: 11,
        updated: 'Just now',
        lastSync: '11:42 PM',
        heartRate: { value: 86, status: 'normal', available: true, updated: '3:42 PM' },
        temperature: { value: 38.1, status: 'normal', available: true, updated: '3:42 PM' },
        activity: { value: 'Walking', available: true, updated: '3:42 PM' },
        activityHistoryDemo: true,
        activityHistory: [
            { time: '12 AM', activity: 'Resting' },
            { time: '3 AM', activity: 'Resting' },
            { time: '6 AM', activity: 'Walking' },
            { time: '9 AM', activity: 'Running' },
            { time: '12 PM', activity: 'Walking' }
        ]
    },
    {
        id: 'luna',
        name: 'Luna',
        type: 'Cat',
        photo: placeholderPhotos[1],
        collarOnline: true,
        gpsAvailable: false,
        coordinates: null,
        lastKnownCoordinates: [14.6728, 121.0478],
        locationName: 'Last known near Maginhawa Street',
        safeZone: { name: 'Home', center: [14.6764, 121.0439], radius: 100 },
        safeZoneStatus: null,
        lastKnownSafeZoneStatus: 'outside',
        battery: 23,
        batteryUpdated: '3:42 PM',
        batteryVoltage: 3.62,
        batteryCondition: 'Low',
        cellular: { internetAvailable: true, carrier: 'Globe', network: '4G LTE', signal: 'Good' },
        gpsAccuracy: null,
        satellites: 0,
        updated: '3:35 PM',
        lastSync: '3:42 PM',
        heartRate: { value: 112, status: 'normal', available: true, updated: '3:34 PM' },
        temperature: { value: 38.4, status: 'normal', available: true, updated: '3:34 PM' },
        activity: { value: 'Resting', available: true, updated: '3:33 PM' },
        activityHistoryDemo: true,
        activityHistory: [
            { time: '12 AM', activity: 'Resting' },
            { time: '3 AM', activity: 'Walking' },
            { time: '6 AM', activity: 'Resting' },
            { time: '9 AM', activity: 'Walking' },
            { time: '12 PM', activity: 'Resting' }
        ]
    },
    {
        id: 'bruno',
        name: 'Bruno',
        type: 'Dog',
        photo: placeholderPhotos[2],
        collarOnline: false,
        gpsAvailable: true,
        coordinates: null,
        lastKnownCoordinates: [14.6805, 121.0384],
        locationName: 'Last known near University Avenue',
        safeZone: { name: 'Home', center: [14.6764, 121.0439], radius: 100 },
        safeZoneStatus: null,
        lastKnownSafeZoneStatus: 'inside',
        battery: 61,
        batteryUpdated: '2:58 PM',
        batteryVoltage: 3.79,
        batteryCondition: 'Normal',
        cellular: { internetAvailable: false, carrier: '', network: '', signal: 'No Signal' },
        gpsAccuracy: 4.1,
        satellites: 9,
        updated: '2:58 PM',
        lastSync: '2:58 PM',
        heartRate: { value: 79, status: 'normal', available: false, updated: '2:58 PM' },
        temperature: { value: 38.0, status: 'normal', available: false, updated: '2:58 PM' },
        activity: { value: 'Resting', available: false, updated: '2:58 PM' },
        activityHistoryDemo: true,
        activityHistory: [
            { time: '12 AM', activity: 'Resting' },
            { time: '3 AM', activity: 'Resting' },
            { time: '6 AM', activity: 'Walking' },
            { time: '9 AM', activity: 'Walking' },
            { time: '12 PM', activity: 'Resting' }
        ]
    }
];

// Use the same prototype pets across tracking, activity, and management.
// Saved account profiles are left intact and do not replace this demo roster.
const managementPetProfiles = {
    max: { breed: 'Golden Retriever', gender: 'Male', deviceId: 'SC-2026-1048' },
    luna: { breed: 'Domestic Shorthair', gender: 'Female', deviceId: 'SC-2026-2195' },
    bruno: { breed: 'Not specified', gender: 'Not specified', deviceId: 'SC-2026-3102' }
};
const demoPets = liveTrackingPets.map(pet => ({
    id: pet.id,
    name: pet.name,
    type: pet.type,
    photo: pet.photo,
    ...managementPetProfiles[pet.id],
    online: hasCollarInternet(pet),
    battery: pet.battery,
    safe: getDisplayedSafeZoneStatus(pet) === 'inside',
    geofence: pet.safeZone.name,
    radius: pet.safeZone.radius,
    updated: pet.updated,
    location: pet.locationName,
    heartRate: pet.heartRate.value,
    temperature: pet.temperature.value,
    activity: pet.activity.value,
    activityHistoryDemo: pet.activityHistoryDemo,
    activityHistory: pet.activityHistory.map(sample => ({ ...sample }))
}));

const notifications = [
    { id: 1, category: 'location', icon: 'bi-geo-alt-fill', title: 'Geofence alert', pet: 'Buddy', message: 'Buddy briefly left the Home safe zone and returned.', time: 'Today, 10:18 AM', unread: true },
    { id: 2, category: 'device', icon: 'bi-battery-half', title: 'Low battery alert', pet: 'Luna', message: 'Luna’s collar battery is at 18%. Charge it soon.', time: 'Today, 9:46 AM', unread: true },
    { id: 3, category: 'device', icon: 'bi-wifi-off', title: 'Collar offline alert', pet: 'Buddy', message: 'The collar was offline for 4 minutes. Connection restored.', time: 'Today, 8:31 AM', unread: true },
    { id: 8, category: 'device', icon: 'bi-activity', title: 'Activity data unavailable', pet: 'Buddy', message: 'Activity classification is temporarily unavailable.', time: 'Aug 21, 4:30 PM', unread: false },
    { id: 9, category: 'location', icon: 'bi-pin-map', title: 'GPS data unavailable', pet: 'Luna', message: 'The latest GPS position could not be determined.', time: 'Aug 21, 1:12 PM', unread: false }
];

const pageMeta = {
    'live-tracking': ['Live Tracking', 'Track your pet’s current location, safe-zone status, and live collar information.'],
    'health-activity': ['Activity Monitoring', 'View your pet’s activity history and wellness information.'],
    'pet-management': ['Pet Management', 'Manage your pet profiles, collar details, and safe-zone settings.'],
    notifications: ['Notifications', 'Check important alerts and updates from your pet’s collar.'],
    history: ['History', 'Review previous location, activity, and anomaly records.'],
    settings: ['Settings', 'Manage your account, security, and notification preferences.']
};

let pets = demoPets.map(pet => ({ ...pet }));
let selectedPetId = pets[0].id;
let selectedLivePetId = liveTrackingPets[0].id;
let liveTrackingMap = null;
let liveSafeZoneCircle = null;
let liveSafeZoneCenter = null;
const livePetMarkers = new Map();
let currentUser = null;
let deletePetId = null;
let currentNotificationFilter = 'all';
let liveClockTimer = null;
let petLimitWarningTimer = null;

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

function updateLiveDateTime() {
    const dateCard = $('#liveTodayCard');
    const dateText = $('#liveTodayDate');
    const timeText = $('#liveTodayTime');
    if (!dateCard || !dateText || !timeText) return;

    const now = new Date();
    dateCard.dateTime = now.toISOString();
    dateText.textContent = now.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    timeText.textContent = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
    clearTimeout(liveClockTimer);
    const nextMinute = new Date(now.getTime());
    nextMinute.setSeconds(60, 0);
    liveClockTimer = setTimeout(updateLiveDateTime, nextMinute.getTime() - now.getTime() + 100);
}

function closeSidebar() {
    $('#sidebar')?.classList.remove('open');
    $('#sidebarBackdrop')?.classList.remove('show');
    document.body.style.overflow = '';
    updateSidebarToggleState();
}

function openSidebar() {
    $('#sidebar')?.classList.add('open');
    $('#sidebarBackdrop')?.classList.add('show');
    document.body.style.overflow = 'hidden';
    updateSidebarToggleState();
}

const SIDEBAR_BREAKPOINT = 992;
let desktopSidebarViewport = window.innerWidth >= SIDEBAR_BREAKPOINT;

function updateSidebarToggleState() {
    const sidebar = $('#sidebar');
    const toggle = $('#sidebarToggle');
    const logoToggle = $('#sidebarLogoToggle');
    const mobileLogoToggle = $('#mobileLogoToggle');
    if (!sidebar) return;

    const isMobile = window.innerWidth < SIDEBAR_BREAKPOINT;
    const isCollapsed = sidebar.classList.contains('collapsed');
    const isOpen = sidebar.classList.contains('open');
    const isExpanded = isMobile ? isOpen : !isCollapsed;
    const label = `${isExpanded ? 'Collapse' : 'Expand'} navigation`;

    if (toggle) {
        toggle.setAttribute('aria-label', label);
        toggle.setAttribute('title', label);
        toggle.setAttribute('aria-expanded', String(isExpanded));
        toggle.querySelector('i').className = 'bi bi-layout-sidebar-inset';
    }
    [logoToggle, mobileLogoToggle].forEach(button => {
        if (!button) return;
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.setAttribute('aria-expanded', String(isExpanded));
    });
}

function toggleSidebar() {
    const sidebar = $('#sidebar');
    if (!sidebar) return;
    if (window.innerWidth < SIDEBAR_BREAKPOINT) {
        if (sidebar.classList.contains('open')) closeSidebar();
        else openSidebar();
        return;
    }

    sidebar.classList.toggle('collapsed');
    updateSidebarToggleState();
    setTimeout(refreshLiveMapLayout, 260);
}

function syncSidebarForViewport() {
    const sidebar = $('#sidebar');
    if (!sidebar) return;

    if (window.innerWidth < SIDEBAR_BREAKPOINT) {
        closeSidebar();
        sidebar.classList.remove('collapsed');
    } else {
        closeSidebar();
        sidebar.classList.add('collapsed');
    }
    updateSidebarToggleState();
    setTimeout(refreshLiveMapLayout, 260);
}

function handleSidebarViewportChange() {
    const isDesktop = window.innerWidth >= SIDEBAR_BREAKPOINT;
    if (isDesktop === desktopSidebarViewport) return;
    desktopSidebarViewport = isDesktop;
    syncSidebarForViewport();
}

function initializePageHeaders() {
    const headerContent = $('#pageHeaderContent');
    if (!headerContent) return;
    $$('.dashboard-section').forEach(section => {
        const toolbar = section.querySelector('.section-toolbar');
        if (!toolbar) return;
        toolbar.dataset.headerSection = section.id;
        toolbar.hidden = true;
        headerContent.append(toolbar);
    });
}

function showSection(sectionId) {
    if (!pageMeta[sectionId]) return;
    $$('.dashboard-section').forEach(section => section.classList.toggle('active', section.id === sectionId));
    $$('.sidebar-nav [data-section]').forEach(button => button.classList.toggle('active', button.dataset.section === sectionId));

    $$('#pageHeaderContent [data-header-section]').forEach(header => {
        header.hidden = header.dataset.headerSection !== sectionId;
    });

    history.replaceState(null, '', `#${sectionId}`);
    $('.dashboard-main')?.scrollTo({ top: 0, behavior: 'instant' });
    closeSidebar();
    if (sectionId === 'live-tracking' && liveTrackingMap) {
        setTimeout(refreshLiveMapLayout, 50);
    }
}

function normalizedPet(rawPet, index) {
    const demo = demoPets[index % demoPets.length] || demoPets[0];
    return {
        ...demo,
        id: rawPet.id || `pet-${index + 1}`,
        name: rawPet.name || rawPet.petName || demo.name,
        type: rawPet.type || rawPet.petType || demo.type,
        breed: rawPet.breed || demo.breed,
        gender: rawPet.gender || demo.gender,
        photo: rawPet.photoURL || rawPet.photo || rawPet.imageUrl || placeholderPhotos[index % placeholderPhotos.length],
        deviceId: rawPet.deviceId || rawPet.deviceID || `SC-2026-${String(3100 + index).padStart(4, '0')}`,
        online: rawPet.status ? rawPet.status === 'active' || rawPet.status === 'online' : true,
        battery: Number(rawPet.battery ?? demo.battery),
        safe: rawPet.safeZoneStatus ? rawPet.safeZoneStatus !== 'outside' : true,
        geofence: rawPet.geofenceName || demo.geofence,
        radius: Number(rawPet.geofenceRadius || demo.radius),
        activityHistoryDemo: false,
        activityHistory: Array.isArray(rawPet.activityHistory) ? rawPet.activityHistory : []
    };
}

function renderPetSelectors() {
    renderPetAvatarSelector('#historyPetSelect', pets, selectedPetId, petId => selectPet(petId), pet => (pet.online ? 'online' : 'offline'));
    renderActivityPetSelector();
}

function hasCollarInternet(pet) {
    return Boolean(pet.collarOnline && pet.cellular?.internetAvailable);
}

function hasLiveLocation(pet) {
    return Boolean(hasCollarInternet(pet) && pet.gpsAvailable && pet.coordinates);
}

function getLivePetState(pet) {
    if (!hasCollarInternet(pet)) {
        return {
            key: 'offline',
            title: 'Last Known Location',
            icon: 'bi-cloud-slash'
        };
    }
    if (!pet.gpsAvailable || !pet.coordinates) {
        return {
            key: 'gps-unavailable',
            title: 'Last Known Location',
            icon: 'bi-pin-map'
        };
    }
    return {
        key: 'online',
        title: 'Current Location',
        icon: 'bi-broadcast-pin'
    };
}

function getGpsState(pet) {
    if (pet.gpsAvailable) {
        return hasCollarInternet(pet)
            ? { key: 'good', label: 'GPS Fix Available', detail: 'Live fix received' }
            : { key: 'warning', label: 'Still Active on Collar', detail: 'Latest position is stored locally' };
    }
    return hasCollarInternet(pet)
        ? { key: 'muted', label: 'No GPS Fix', detail: 'Waiting for satellite fix' }
        : { key: 'muted', label: 'Unavailable', detail: 'No GPS or cellular connection' };
}

function getTrackingMessage(pet) {
    const internetAvailable = hasCollarInternet(pet);
    if (!internetAvailable && pet.gpsAvailable) {
        return 'Live updates are temporarily unavailable. Showing the last known location.';
    }
    if (internetAvailable && !pet.gpsAvailable) {
        return 'Waiting for a new GPS fix.';
    }
    if (!internetAvailable && !pet.gpsAvailable) {
        return 'GPS and cellular service are unavailable. Showing the last successfully received location.';
    }
    return '';
}

function getDisplayedCoordinates(pet) {
    return hasLiveLocation(pet) ? pet.coordinates : pet.lastKnownCoordinates;
}

function getDisplayedSafeZoneStatus(pet) {
    return hasLiveLocation(pet) ? pet.safeZoneStatus : pet.lastKnownSafeZoneStatus;
}

function getSafeZoneLabel(pet) {
    const status = getDisplayedSafeZoneStatus(pet);
    const prefix = hasLiveLocation(pet) ? '' : 'Last known: ';
    return `${prefix}${status === 'inside' ? 'Inside Safe Zone' : 'Outside Safe Zone'}`;
}
function createPetTypeIcon(pet) {
    const type = String(pet.type || pet.petType || pet.species || '').trim().toLowerCase();
    const shapes = {
        dog: '<path d="M7 5 3 3 1 13l4 2 2-6M17 5l4-2 2 10-4 2-2-6M7 5c3-2 7-2 10 0l2 10c0 4-3 6-7 6s-7-2-7-6Z"/><circle cx="9" cy="11" r=".8"/><circle cx="15" cy="11" r=".8"/><path d="m10 15 2 2 2-2ZM12 17v2"/>',
        cat: '<path d="M4 10V3l6 4h4l6-4v7c2 2 2 7 0 9-4 4-12 4-16 0-2-2-2-7 0-9Z"/><circle cx="8" cy="12" r=".8"/><circle cx="16" cy="12" r=".8"/><path d="m10 15 2 2 2-2ZM12 17v2M2 14l5 1M2 18l5-1M17 15l5-1M17 17l5 1"/>'
    };
    if (!shapes[type]) return '';
    return `<svg class="pet-map-pin-type" data-pet-type="${type}" viewBox="0 0 24 24" focusable="false">${shapes[type]}</svg>`;
}

function createLivePetMarkerIcon(pet) {
    const state = getLivePetState(pet);
    const selectedClass = pet.id === selectedLivePetId ? 'selected' : '';
    const gradientId = `pet-pin-${[...String(pet.id)].map(character => character.codePointAt(0).toString(16)).join('-')}`;
    const element = document.createElement('div');
    element.className = `pet-map-marker ${state.key} ${selectedClass}`;
    element.innerHTML = `
        <span class="pet-map-pin" aria-hidden="true">
            <svg class="pet-map-pin-outline" viewBox="0 0 72 96" focusable="false">
                <defs>
                    <linearGradient id="${gradientId}-rim" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#dbe3df"/><stop offset=".7" stop-color="#aebbb3"/><stop offset="1" stop-color="#f4f7f5"/>
                    </linearGradient>
                    <linearGradient id="${gradientId}-face" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f9fbfa"/><stop class="pet-map-pin-tint" offset="1"/>
                    </linearGradient>
                </defs>
                <path class="pet-map-pin-shape" fill="url(#${gradientId}-rim)" d="M36 94C28 84 3 55 3 36a33 33 0 1 1 66 0c0 19-25 48-33 58Z"/>
                <path class="pet-map-pin-face" fill="url(#${gradientId}-face)" d="M36 89C28 80 7 54 7 36a29 29 0 1 1 58 0c0 17-22 45-29 53Z"/>
                <circle class="pet-map-pin-inset" cx="36" cy="36" r="28"/>
                <path class="pet-map-pin-glint" d="M10 28C13 12 32 5 46 11M12 52C18 66 29 81 36 89"/>
            </svg>
            <img class="pet-map-photo" src="${escapeHtml(pet.photo)}" alt="">
            ${createPetTypeIcon(pet)}
        </span>
        <span class="pet-map-name"><i class="bi bi-check2 pet-map-selected-check" aria-hidden="true"></i><span class="pet-map-name-copy">${escapeHtml(pet.name)}</span></span>
    `;
    return element;
}

function renderLivePetSelector() {
    renderPetAvatarSelector('#livePetSelector', liveTrackingPets, selectedLivePetId, selectLiveTrackingPet, pet => getLivePetState(pet).key);
}

function renderActivityPetSelector() {
    renderPetAvatarSelector('#activityPetSelector', liveTrackingPets, selectedLivePetId, selectLiveTrackingPet, pet => getLivePetState(pet).key);
}

function renderPetAvatarSelector(containerSelector, petList, selectedId, onSelect, getState) {
    const container = $(containerSelector);
    if (!container) return;
    if (!petList.length) {
        container.innerHTML = '<span class="text-muted">No pets available</span>';
        return;
    }
    const petIcon = `<span class="monitoring-pet-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><circle cx="7" cy="7.25" r="2.15"/><circle cx="17" cy="7.25" r="2.15"/><circle cx="11" cy="4.75" r="2"/><circle cx="14.75" cy="4.9" r="1.85"/><path d="M12 9.6c-3.2 0-6.2 3.1-6.2 6.15 0 2.15 1.55 3.6 3.55 3.6 1.15 0 1.8-.55 2.65-.55s1.5.55 2.65.55c2 0 3.55-1.45 3.55-3.6C18.2 12.7 15.2 9.6 12 9.6Z"/></svg></span>`;
    container.innerHTML = petList.map(pet => {
        const state = getState(pet);
        const statusLabel = state === 'offline' ? 'Offline' : state === 'gps-unavailable' ? 'Online, GPS unavailable' : 'Online';
        return `
        <div class="live-pet-avatar-item ${state}">
            <button class="live-pet-icon-button ${pet.id === selectedId ? 'active' : ''}" type="button" aria-label="Select ${escapeHtml(pet.name)}: ${statusLabel}" title="${escapeHtml(pet.name)} · ${statusLabel}" aria-pressed="${pet.id === selectedId}" data-avatar-pet-id="${escapeHtml(pet.id)}">
                <img class="live-pet-selector-photo" src="${escapeHtml(pet.photo)}" alt="">
                ${petIcon}
            </button>
            <span class="live-pet-avatar-name">${pet.id === selectedId ? escapeHtml(pet.name) : ''}</span>
        </div>
    `;
    }).join('');
    container.querySelectorAll('[data-avatar-pet-id]').forEach(button => {
        button.querySelector('img')?.addEventListener('error', () => button.classList.add('photo-unavailable'), { once: true });
        button.addEventListener('click', () => {
            const petId = button.dataset.avatarPetId;
            onSelect(petId);
            const selectedButton = [...container.querySelectorAll('[data-avatar-pet-id]')].find(option => option.dataset.avatarPetId === petId);
            selectedButton?.focus();
            if (selectedButton && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
                selectedButton.classList.add('is-clicked');
                const finishClick = event => {
                    if (event.animationName !== 'pet-icon-click') return;
                    selectedButton.classList.remove('is-clicked');
                    selectedButton.removeEventListener('animationend', finishClick);
                };
                selectedButton.addEventListener('animationend', finishClick);
            }
        });
    });
}
function renderSelectedLivePet() {
    const pet = liveTrackingPets.find(item => item.id === selectedLivePetId);
    const trackingMessage = $('#trackingMessage');
    const primaryRow = $('#livePrimaryStatusRow');
    const secondaryRow = $('#liveSecondaryStatusRow');
    if (!pet || !trackingMessage || !primaryRow || !secondaryRow) return;

    const internetAvailable = hasCollarInternet(pet);
    const trackingState = getLivePetState(pet);
    const safeStatus = getSafeZoneLabel(pet);
    const safeInside = getDisplayedSafeZoneStatus(pet) === 'inside';
    const hasBatteryRecord = Number.isFinite(pet.battery) && pet.battery >= 0 && pet.battery <= 100;
    const batteryLow = hasBatteryRecord && (pet.battery <= 25 || pet.batteryCondition === 'Low');
    const batteryHeading = !internetAvailable && hasBatteryRecord ? 'Last Battery Level' : 'Battery';
    const batteryValue = hasBatteryRecord ? `${pet.battery}%` : 'No battery recorded';
    const batteryTimestamp = hasBatteryRecord && pet.batteryUpdated
        ? `${internetAvailable ? 'Updated' : 'Last recorded'} ${pet.batteryUpdated}`
        : hasBatteryRecord ? 'Timestamp not recorded' : 'No battery reading received yet';
    const recordedActivity = typeof pet.activity?.value === 'string' ? pet.activity.value.trim() : '';
    const hasActivityRecord = Boolean(recordedActivity && !['unavailable', 'unknown'].includes(recordedActivity.toLowerCase()));
    const activityAvailable = Boolean(hasActivityRecord && pet.activity?.available && internetAvailable);
    const activityValue = hasActivityRecord ? recordedActivity : 'No activity recorded';
    const activityHeading = activityAvailable ? 'Current Activity' : hasActivityRecord ? 'Last Activity' : 'Activity';
    const activityTimestamp = hasActivityRecord && pet.activity?.updated
        ? `${activityAvailable ? 'Updated' : 'Last recorded'} ${pet.activity.updated}`
        : hasActivityRecord ? 'Timestamp not recorded' : 'No activity received yet';
    const activityIcon = {
        Resting: 'bi-moon-stars',
        Walking: 'bi-person-walking',
        Running: 'bi-lightning-charge'
    }[activityValue] || 'bi-dash-circle';
    const statusMessage = getTrackingMessage(pet);

    trackingMessage.hidden = !statusMessage;
    trackingMessage.className = `tracking-message ${internetAvailable ? 'warning' : 'danger'}`;
    trackingMessage.innerHTML = statusMessage
        ? `<i class="bi ${internetAvailable ? 'bi-geo-alt' : 'bi-cloud-slash'}"></i><span>${escapeHtml(statusMessage)}</span>`
        : '';

    primaryRow.innerHTML = `
        <div class="col-12 col-md-6 col-xl-4">
            <article class="tracking-status-card">
                <header><span>Collar Connection</span><i class="bi bi-router"></i></header>
                <div class="status-card-value"><i class="status-dot ${internetAvailable ? 'good' : 'danger'}"></i><strong class="${internetAvailable ? 'good' : 'danger'}">${internetAvailable ? 'Online' : 'Offline'}</strong></div>
                <div class="status-card-details">
                    <span><i class="bi bi-globe2"></i>${internetAvailable ? `${escapeHtml(pet.cellular.carrier)} · ${escapeHtml(pet.cellular.network)}` : 'No Internet Connection'}</span>
                    <span><i class="bi bi-arrow-repeat"></i>Last Sync: ${escapeHtml(pet.lastSync)}</span>
                </div>
            </article>
        </div>
        <div class="col-12 col-md-6 col-xl-4">
            <article class="tracking-status-card">
                <header><span>Data Subscription</span><i class="bi bi-sim"></i></header>
                <div class="status-card-value"><i class="status-dot good"></i><strong class="good">Active</strong></div>
                <div class="status-card-details">
                    <span><i class="bi bi-calendar3"></i>Activated: Sep 19, 2026</span>
                    <span><i class="bi bi-calendar-x"></i>Expires: Oct 19, 2026</span>
                    <span><i class="bi bi-check2-circle"></i>30 Days Validity</span>
                </div>
            </article>
        </div>
        <div class="col-12 col-md-6 col-xl-4">
            <article class="tracking-status-card">
                <header><span>${activityHeading}</span><i class="bi bi-activity"></i></header>
                <div class="status-card-value"><i class="bi ${activityIcon} value-icon activity"></i><strong class="${hasActivityRecord ? '' : 'muted'}">${escapeHtml(activityValue)}</strong></div>
                <div class="status-card-details"><span><i class="bi bi-clock"></i>${escapeHtml(activityTimestamp)}</span></div>
            </article>
        </div>
    `;

    secondaryRow.innerHTML = `
        <div class="col-12 col-md-6 col-xl-4">
            <article class="tracking-status-card pet-location-card">
                <header><span>Pet's Location</span><i class="bi bi-geo-alt"></i></header>
                <div class="pet-location-details">
                    <div><span>${trackingState.title}</span><strong>${escapeHtml(pet.locationName || 'No location recorded')}</strong></div>
                    <div><span>Last update</span><strong class="pet-location-updated">${escapeHtml(pet.updated || 'Timestamp not recorded')}</strong></div>
                </div>
            </article>
        </div>
        <div class="col-12 col-md-6 col-xl-4">
            <article class="tracking-status-card">
                <header><span>${batteryHeading}</span><i class="bi bi-battery-charging"></i></header>
                <div class="status-card-value"><i class="bi ${!hasBatteryRecord ? 'bi-battery' : batteryLow ? 'bi-battery-half' : 'bi-battery-full'} value-icon ${!hasBatteryRecord ? '' : batteryLow ? 'warning' : 'good'}"></i><strong class="${!hasBatteryRecord ? 'muted' : batteryLow ? 'warning' : 'good'}">${escapeHtml(batteryValue)}</strong></div>
                <div class="status-card-details">
                    <span><i class="bi bi-clock"></i>${escapeHtml(batteryTimestamp)}</span>
                </div>
            </article>
        </div>
        <div class="col-12 col-md-6 col-xl-4">
            <article class="tracking-status-card">
                <header><span>Safe Zone</span><i class="bi bi-shield-check"></i></header>
                <div class="status-card-value"><i class="status-dot ${safeInside ? 'good' : 'danger'}"></i><strong class="${safeInside ? 'good' : 'danger'}">${escapeHtml(safeStatus)}</strong></div>
                <div class="status-card-details"><span><i class="bi bi-house"></i>Geofence: ${escapeHtml(pet.safeZone.name)}</span></div>
            </article>
        </div>
    `;

}
function refreshLiveMapLayout() {
    if (!liveTrackingMap) return;
    window.google.maps.event.trigger(liveTrackingMap, 'resize');
    const pet = liveTrackingPets.find(item => item.id === selectedLivePetId);
    if (pet) liveTrackingMap.setCenter(toGoogleCoordinates(getDisplayedCoordinates(pet)));
}

function updateLiveMapSelection() {
    const pet = liveTrackingPets.find(item => item.id === selectedLivePetId);
    if (!pet || !liveTrackingMap) return;
    const coordinates = getDisplayedCoordinates(pet);

    livePetMarkers.forEach((marker, petId) => {
        marker.content.classList.toggle('selected', petId === selectedLivePetId);
        marker.zIndex = petId === selectedLivePetId ? 1000 : 0;
    });
    const selectedMarker = livePetMarkers.get(selectedLivePetId);
    if (selectedMarker) selectedMarker.position = toGoogleCoordinates(coordinates);

    liveSafeZoneCircle?.setMap(null);
    liveSafeZoneCenter?.setMap(null);
    liveSafeZoneCircle = new window.google.maps.Circle({
        map: liveTrackingMap,
        center: toGoogleCoordinates(pet.safeZone.center),
        radius: pet.safeZone.radius,
        strokeColor: '#359574',
        strokeOpacity: .75,
        strokeWeight: 2,
        fillColor: '#359574',
        fillOpacity: .1
    });
    liveSafeZoneCenter = new window.google.maps.Marker({
        map: liveTrackingMap,
        position: toGoogleCoordinates(pet.safeZone.center),
        title: `${pet.safeZone.name} safe-zone center`,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: '#359574', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 }
    });

    liveTrackingMap.setZoom(LIVE_PET_FOCUS_ZOOM);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        liveTrackingMap.setCenter(toGoogleCoordinates(coordinates));
    } else {
        liveTrackingMap.panTo(toGoogleCoordinates(coordinates));
    }
}

function toGoogleCoordinates([latitude, longitude]) {
    return { lat: latitude, lng: longitude };
}

function loadGoogleMaps() {
    if (googleMapsLoader) return googleMapsLoader;
    googleMapsLoader = new Promise((resolve, reject) => {
        if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY') {
            reject(new Error('Google Maps API key is not configured.'));
            return;
        }
        const callbackName = '__smartCollarsGoogleMapsReady';
        window.gm_authFailure = () => reject(new Error('Google rejected this key. Enable Maps JavaScript API and billing in Google Cloud, then check the key website restrictions.'));
        window[callbackName] = () => resolve();
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=marker&loading=async&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => reject(new Error('Google Maps JavaScript API could not be loaded. Check the key and network connection.'));
        document.head.appendChild(script);
    });
    return googleMapsLoader;
}

function showMapUnavailableState(title, message) {
    const container = $('#trackingMap');
    if (!container) return;
    container.innerHTML = `<div class="map-unavailable-state"><span><i class="bi bi-map"></i></span><div><strong>${escapeHtml(title)}</strong><p>${message}</p></div></div>`;
}

function initializeLiveTrackingMap() {
    if (liveTrackingMap || !$('#trackingMap')) return;
    loadGoogleMaps().then(() => {
        const container = $('#trackingMap');
        container.innerHTML = '';
        const initialCoordinates = getDisplayedCoordinates(liveTrackingPets[0]);
        liveTrackingMap = new window.google.maps.Map(container, {
            center: toGoogleCoordinates(initialCoordinates),
            zoom: 15,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            mapId: 'DEMO_MAP_ID'
        });

        liveTrackingPets.forEach(pet => {
            const marker = new window.google.maps.marker.AdvancedMarkerElement({
                map: liveTrackingMap,
                position: toGoogleCoordinates(getDisplayedCoordinates(pet)),
                content: createLivePetMarkerIcon(pet),
                title: pet.name,
                zIndex: pet.id === selectedLivePetId ? 1000 : 0
            });
            marker.addListener('click', () => {
                selectLiveTrackingPet(pet.id);
            });
            livePetMarkers.set(pet.id, marker);
        });

        updateLiveMapSelection();
        setTimeout(refreshLiveMapLayout, 50);
    }).catch(error => {
        showMapUnavailableState('Google Maps unavailable', error.message);
    });
}

function selectLiveTrackingPet(petId) {
    if (!liveTrackingPets.some(pet => pet.id === petId)) return;
    selectedLivePetId = petId;
    renderLivePetSelector();
    renderActivityPetSelector();
    renderSelectedLivePet();
    updateHealthData(petId);
    updateLiveMapSelection();
}

function initializeLiveTracking() {
    renderLivePetSelector();
    renderActivityPetSelector();
    renderSelectedLivePet();
    updateHealthData(selectedLivePetId);
    initializeLiveTrackingMap();
}

function selectPet(petId) {
    const pet = pets.find(item => item.id === petId);
    if (!pet) return;
    selectedPetId = petId;
    if (currentUser?.uid) localStorage.setItem(`lastPet_${currentUser.uid}`, petId);
    renderPetList();
    renderPetDetail();
    renderPetSelectors();
}

function renderPetList() {
    const container = $('#petList');
    if (!container) return;
    container.innerHTML = pets.map(pet => `
        <button class="management-pet-item ${pet.id === selectedPetId ? 'active' : ''}" type="button" data-pet-id="${escapeHtml(pet.id)}">
            <img src="${escapeHtml(pet.photo)}" alt="${escapeHtml(pet.name)}">
            <div><strong>${escapeHtml(pet.name)}</strong><span>${escapeHtml(pet.type)} · ${escapeHtml(pet.breed)}</span></div>
            <i class="bi bi-chevron-right"></i>
        </button>
    `).join('') || '<div class="text-center py-5 text-secondary"><i class="bi bi-person-hearts fs-3 d-block mb-2"></i>No pet profiles yet.</div>';
    $('#petCapacity').textContent = `${pets.length} of 3 profiles used.`;
    const addButton = $('#addPetBtn');
    if (addButton) {
        addButton.disabled = false;
        addButton.title = '';
    }
    if (pets.length < 3) {
        hidePetLimitWarning();
    }
}

function hidePetLimitWarning() {
    clearTimeout(petLimitWarningTimer);
    petLimitWarningTimer = null;
    const warning = $('#petLimitWarning');
    if (warning) warning.hidden = true;
}

function showPetLimitWarning() {
    const warning = $('#petLimitWarning');
    if (!warning) return;
    clearTimeout(petLimitWarningTimer);
    warning.hidden = false;
    petLimitWarningTimer = setTimeout(hidePetLimitWarning, 3000);
}

function openAddPetForm() {
    if (pets.length >= 3) {
        showPetLimitWarning();
        return;
    }
    hidePetLimitWarning();
    window.bootstrap.Modal.getOrCreateInstance($('#addPetModal')).show();
}

function renderPetDetail() {
    const container = $('#petDetail');
    if (!container) return;
    const pet = pets.find(item => item.id === selectedPetId);
    if (!pet) {
        container.innerHTML = '<div class="text-center py-5 text-secondary"><i class="bi bi-person-hearts fs-2 d-block mb-2"></i>Select or add a pet to view details.</div>';
        return;
    }
    container.innerHTML = `
        <div class="pet-profile-overview">
            <div class="pet-profile-photo-panel">
                <img class="pet-profile-portrait" src="${escapeHtml(pet.photo)}" alt="${escapeHtml(pet.name)}">
                <span class="pet-profile-photo-caption"><i class="bi bi-heart" aria-hidden="true"></i> Your companion</span>
            </div>
            <div class="pet-profile-info">
                <div class="pet-profile-heading">
                    <span class="pet-profile-kicker">PET PROFILE</span>
                    <h3>${escapeHtml(pet.name)}</h3>
                    <p>${escapeHtml(pet.type)}</p>
                </div>
                <dl class="pet-profile-details">
                    <div><dt><i class="bi bi-gender-ambiguous" aria-hidden="true"></i> Gender</dt><dd>${escapeHtml(pet.gender)}</dd></div>
                    <div><dt><i class="bi bi-person-hearts" aria-hidden="true"></i> Breed</dt><dd>${escapeHtml(pet.breed)}</dd></div>
                    <div><dt><i class="bi bi-router" aria-hidden="true"></i> Paired collar</dt><dd>${escapeHtml(pet.deviceId)}<small class="pet-profile-setting-note"><i class="bi bi-lock-fill" aria-hidden="true"></i> Read only</small></dd></div>
                    <div><dt><i class="bi bi-shield-check" aria-hidden="true"></i> Safe zone</dt><dd>${escapeHtml(pet.geofence)}<small class="pet-profile-setting-note">${pet.radius} m radius</small><button class="btn btn-soft pet-profile-setting-action" type="button" data-bs-toggle="modal" data-bs-target="#geofenceModal"><i class="bi bi-pencil" aria-hidden="true"></i> Edit geofence</button></dd></div>
                </dl>
                <div class="pet-profile-actions">
                    <button class="btn btn-brand" id="editPetPhotoBtn" type="button"><i class="bi bi-camera" aria-hidden="true"></i> Edit photo</button>
                    <button class="btn btn-danger-soft" type="button" data-delete-pet="${escapeHtml(pet.id)}" data-bs-toggle="modal" data-bs-target="#deletePetModal"><i class="bi bi-trash3" aria-hidden="true"></i> Delete profile</button>
                </div>
                <p class="pet-profile-account-note"><i class="bi bi-shield-check" aria-hidden="true"></i> A companion on your PawSense account.</p>
            </div>
        </div>
    `;
}

function renderAllPets() {
    if (!pets.some(pet => pet.id === selectedPetId)) selectedPetId = pets[0]?.id || null;
    renderPetSelectors();
    renderPetList();
    renderPetDetail();
    updateHealthData(selectedLivePetId);
}

function renderPetAnomalyChart(pet) {
    const container = $('#petAnomalyChart');
    if (!container) return;
    const description = $('#petAnomalyDescription');
    if (description) description.textContent = `Activity changes for ${pet.name}${pet.activityHistoryDemo ? ' · Prototype history' : ''}`;
    const activityLevels = { Resting: 200, Walking: 110, Running: 20 };
    const history = Array.isArray(pet.activityHistory)
        ? pet.activityHistory.filter(sample => sample && Object.hasOwn(activityLevels, sample.activity) && typeof sample.time === 'string' && sample.time.trim())
        : [];
    if (!history.length) {
        container.innerHTML = '<div class="activity-chart-empty"><i class="bi bi-activity" aria-hidden="true"></i><strong>No activity history recorded</strong><span>The graph will appear when timestamped activity readings are available.</span></div>';
        return;
    }

    const points = history.map((sample, index) => ({
        ...sample,
        x: history.length === 1 ? 360 : 12 + (index / (history.length - 1)) * 696,
        y: activityLevels[sample.activity]
    }));
    const axisIndexes = new Set(Array.from({ length: Math.min(5, history.length) }, (_, index) => Math.round(index * (history.length - 1) / (Math.min(5, history.length) - 1 || 1))));
    const accessibleHistory = history.map(sample => `${sample.time}: ${sample.activity}`).join('; ');
    container.innerHTML = `
        <div class="activity-chart-scroll" tabindex="0" role="region" aria-label="Pet activity timeline; scroll horizontally on small screens">
            <div class="line-chart activity-state-chart">
                <div class="activity-state-labels" aria-hidden="true"><span class="running">Running</span><span class="walking">Walking</span><span class="resting">Resting</span></div>
                <div class="activity-state-plot">
                    <svg viewBox="0 0 720 220" preserveAspectRatio="none" role="img" aria-label="Activity history for ${escapeHtml(pet.name)}. ${escapeHtml(accessibleHistory)}">
                        ${Object.values(activityLevels).map(y => `<line class="activity-chart-grid" x1="0" y1="${y}" x2="720" y2="${y}"/>`).join('')}
                        ${points.slice(0, -1).map((point, index) => {
                            const next = points[index + 1];
                            return `<line class="activity-chart-segment ${point.activity.toLowerCase()}" x1="${point.x}" y1="${point.y}" x2="${next.x}" y2="${point.y}"/>${point.y !== next.y ? `<line class="activity-chart-transition" x1="${next.x}" y1="${point.y}" x2="${next.x}" y2="${next.y}"/>` : ''}`;
                        }).join('')}
                    </svg>
                    ${points.map((point, index) => `<span class="activity-chart-marker ${point.activity.toLowerCase()} ${index === 0 ? 'first' : index === points.length - 1 ? 'last' : ''}" tabindex="0" role="img" aria-label="${escapeHtml(point.time)}: ${escapeHtml(point.activity)}" style="left: ${(point.x / 720) * 100}%; top: ${point.y}px"><span class="activity-chart-tooltip" aria-hidden="true"><strong>${escapeHtml(point.activity)}</strong><small>${escapeHtml(point.time)}</small></span></span>`).join('')}
                </div>
                <div class="activity-time-labels" aria-hidden="true">${points.filter((_, index) => axisIndexes.has(index)).map(point => `<span style="left: ${(point.x / 720) * 100}%">${escapeHtml(point.time)}</span>`).join('')}</div>
            </div>
        </div>
        <p class="activity-chart-note"><i class="bi bi-info-circle" aria-hidden="true"></i><span>${pet.activityHistoryDemo ? 'Prototype activity history. ' : ''}Activity changes only—not an automatic anomaly diagnosis.</span></p>
    `;
}

function updateHealthData(petId) {
    const pet = liveTrackingPets.find(item => item.id === petId);
    if (!pet) return;
    const online = hasCollarInternet(pet);
    const hasRecord = typeof pet.activity?.value === 'string' && pet.activity.value.trim() && !['unavailable', 'unknown'].includes(pet.activity.value.trim().toLowerCase());
    const liveActivity = Boolean(online && hasRecord && pet.activity?.available);
    const timestamp = hasRecord && pet.activity?.updated ? pet.activity.updated : 'Timestamp not recorded';
    $('#healthActivity').textContent = hasRecord ? pet.activity.value : 'No activity recorded';
    $('#healthUpdated').textContent = timestamp;
    const setText = (selector, value) => { const element = $(selector); if (element) element.textContent = value; };
    setText('#activityStatusLabel', liveActivity ? 'Current activity' : hasRecord ? 'Last activity' : 'Activity');
    setText('#activityRecordedTime', hasRecord ? `${liveActivity ? 'Updated' : 'Last recorded'} ${timestamp}` : 'No activity received yet');
    setText('#activityStateBadge', liveActivity ? 'Live' : hasRecord ? 'Last recorded' : 'No data');
    const activityBadge = $('#activityStateBadge');
    if (activityBadge) activityBadge.className = `soft-badge ${liveActivity ? 'info' : 'neutral'}`;
    setText('#activityCollarBadge', online ? 'Online' : 'Offline');
    const collarBadge = $('#activityCollarBadge');
    if (collarBadge) collarBadge.className = `soft-badge ${online ? 'success' : 'danger'}`;
    setText('#activityCollarStatus', online ? 'Connected' : 'Offline');
    setText('#activityCollarReadings', `Signal: ${pet.cellular?.signal || 'No Signal'} · ${online ? 'Battery' : 'Last battery'} ${pet.battery}%`);
    const signalBars = $('#activitySignalBars');
    if (signalBars) signalBars.classList.toggle('offline', !online);
    renderPetAnomalyChart(pet);
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
    $('#notificationCount').style.display = unread ? '' : 'none';
    $('#unreadFilterCount').textContent = unread;
}

function setUserInterface(name, email, photoUrl = '') {
    const safeName = name || 'User';
    const initial = safeName.charAt(0).toUpperCase();
    ['#greetingName', '#userName', '#liveWelcomeName'].forEach(selector => { if ($(selector)) $(selector).textContent = safeName; });
    $('#profileName').value = safeName;
    $('#userEmail').textContent = email || '';
    $('#profileEmail').value = email || '';
    ['#userAvatar', '#settingsAvatar'].forEach(selector => {
        const element = $(selector);
        if (!element) return;
        element.innerHTML = photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(safeName)}">` : initial;
    });
}

function getLocallyRegisteredPets() {
    try {
        const storedPets = JSON.parse(localStorage.getItem('pets') || '[]');
        if (!Array.isArray(storedPets)) return [];
        const userEmail = currentUser?.email?.toLowerCase();
        return storedPets.filter(pet => !pet.email || String(pet.email).toLowerCase() === userEmail);
    } catch (error) {
        console.warn('Locally saved pet profiles could not be read.', error);
        return [];
    }
}

async function loadUserPets(userId) {
    pets = demoPets.map(pet => ({ ...pet }));
    selectedPetId = pets.find(pet => pet.id === localStorage.getItem(`lastPet_${userId}`))?.id || pets[0]?.id || null;
    renderAllPets();
}

function attachStaticEvents() {
    $('#addPetBtn')?.addEventListener('click', openAddPetForm);
    $$('.sidebar-nav [data-section]').forEach(button => button.addEventListener('click', () => showSection(button.dataset.section)));
    $('#sidebarToggle')?.addEventListener('click', toggleSidebar);
    $('#sidebarLogoToggle')?.addEventListener('click', toggleSidebar);
    $('#mobileLogoToggle')?.addEventListener('click', openSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeSidebar);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) updateLiveDateTime();
    });

    document.addEventListener('click', event => {
        const petTarget = event.target.closest('[data-pet-id]');
        if (petTarget) selectPet(petTarget.dataset.petId);
        const deleteTarget = event.target.closest('[data-delete-pet]');
        if (deleteTarget) deletePetId = deleteTarget.dataset.deletePet;

    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeSidebar();
    });

    $('#historyPetSelect')?.addEventListener('click', event => {
        const button = event.target.closest('[data-avatar-pet-id]');
        if (!button) return;
        selectPet(button.dataset.avatarPetId);
    });

    $('#refreshTrackingBtn')?.addEventListener('click', event => {
        const button = event.currentTarget;
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>';
        setTimeout(() => {
            const selectedPet = liveTrackingPets.find(pet => pet.id === selectedLivePetId);
            if (!selectedPet || !hasCollarInternet(selectedPet)) {
                button.disabled = false;
                button.innerHTML = '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i>';
                showToast('Live updates are unavailable while the collar is offline.', 'bi-cloud-slash');
                return;
            }
            selectedPet.lastSync = 'Just now';
            if (Number.isFinite(selectedPet.battery) && selectedPet.battery >= 0 && selectedPet.battery <= 100) selectedPet.batteryUpdated = 'Just now';
            if (selectedPet.gpsAvailable && selectedPet.coordinates) selectedPet.updated = 'Just now';
            if (selectedPet.heartRate.available) selectedPet.heartRate.updated = 'Just now';
            if (selectedPet.temperature.available) selectedPet.temperature.updated = 'Just now';
            if (selectedPet.activity.available) selectedPet.activity.updated = 'Just now';
            renderSelectedLivePet();
            updateHealthData(selectedPet.id);
            button.disabled = false;
            button.innerHTML = '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i>';
            showToast('Tracking data refreshed.');
        }, 700);
    });
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

    $$('.history-type-tabs [data-history-type]').forEach(button => button.addEventListener('click', () => {
        $$('.history-type-tabs button').forEach(item => item.classList.toggle('active', item === button));
        $$('.history-panel').forEach(panel => panel.classList.toggle('active', panel.id === `history-${button.dataset.historyType}`));
    }));
    $('#historyRange')?.addEventListener('change', event => showToast(`${event.target.options[event.target.selectedIndex].text} selected.`, 'bi-calendar-check'));

    $$('.settings-nav [data-settings-target]').forEach(button => button.addEventListener('click', () => {
        $$('.settings-nav button').forEach(item => item.classList.toggle('active', item === button));
        $$('.settings-panel').forEach(panel => panel.classList.toggle('active', panel.id === `settings-${button.dataset.settingsTarget}`));
    }));
    $$('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        input.type = input.type === 'password' ? 'text' : 'password';
        button.innerHTML = `<i class="bi ${input.type === 'password' ? 'bi-eye' : 'bi-eye-slash'}"></i>`;
    }));

    $('#accountForm')?.addEventListener('submit', event => {
        event.preventDefault();
        const name = $('#profileName').value.trim();
        if (!name) return;
        setUserInterface(name, $('#profileEmail').value, currentUser?.photoURL || '');
        showToast('Profile preview updated. Authentication data was not changed.');
    });
    $('#passwordForm')?.addEventListener('submit', event => {
        event.preventDefault();
        if ($('#newPassword').value !== $('#confirmPassword').value) {
            showToast('New passwords do not match.', 'bi-exclamation-circle-fill');
            return;
        }
        event.currentTarget.reset();
        showToast('Password form validated. Backend update is not enabled in this prototype.');
    });
    $('#savePreferencesBtn')?.addEventListener('click', () => showToast('Notification preferences saved for this prototype.'));

    $('#changeProfilePhotoBtn')?.addEventListener('click', () => $('#profilePhotoInput').click());
    $('#profilePhotoInput')?.addEventListener('change', event => {
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) return showToast('Choose an image smaller than 2 MB.', 'bi-exclamation-circle-fill');
        const reader = new FileReader();
        reader.onload = () => {
            ['#settingsAvatar', '#userAvatar'].forEach(selector => { $(selector).innerHTML = `<img src="${reader.result}" alt="Profile preview">`; });
            showToast('Profile photo preview updated.');
        };
        reader.readAsDataURL(file);
    });

    $('#addPetForm')?.addEventListener('submit', event => {
        event.preventDefault();
        if (pets.length >= 3) {
            showPetLimitWarning();
            showToast('You can monitor up to 3 pets.', 'bi-exclamation-circle-fill');
            return;
        }
        const index = pets.length;
        const newPet = {
            ...demoPets[0], id: `prototype-${Date.now()}`, name: $('#newPetName').value.trim(),
            type: $('#newPetType').value, breed: $('#newPetBreed').value.trim(), gender: $('#newPetGender').value,
            deviceId: $('#newDeviceId').value.trim(), photo: placeholderPhotos[index % placeholderPhotos.length],
            battery: 100, heartRate: 78, temperature: 38.4, activity: 'Resting', updated: 'Just now',
            activityHistoryDemo: false, activityHistory: []
        };
        pets.push(newPet);
        selectedPetId = newPet.id;
        renderAllPets();
        window.bootstrap.Modal.getInstance($('#addPetModal'))?.hide();
        event.currentTarget.reset();
        showToast(`${newPet.name} was added to the prototype.`);
    });

    $('#confirmDeletePetBtn')?.addEventListener('click', () => {
        const pet = pets.find(item => item.id === deletePetId);
        pets = pets.filter(item => item.id !== deletePetId);
        selectedPetId = pets[0]?.id || null;
        renderAllPets();
        showToast(`${pet?.name || 'Pet'} was removed from this prototype.`, 'bi-trash3-fill');
    });

    document.addEventListener('click', event => {
        if (!event.target.closest('#editPetPhotoBtn')) return;
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/png,image/jpeg';
        input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const pet = pets.find(item => item.id === selectedPetId);
                if (pet) pet.photo = reader.result;
                renderAllPets();
                showToast('Pet photo preview updated.');
            };
            reader.readAsDataURL(file);
        });
        input.click();
    });

    $('#geofenceRadius')?.addEventListener('input', event => { $('#radiusValue').textContent = event.target.value; });
    $('#saveGeofenceBtn')?.addEventListener('click', () => {
        const pet = pets.find(item => item.id === selectedPetId);
        if (!pet) return;
        pet.radius = Number($('#geofenceRadius').value);
        pet.geofence = $('#geofenceName').value.trim() || 'Safe zone';
        renderPetDetail();
        showToast('Geofence preview updated.');
    });

    $('#confirmLogoutBtn')?.addEventListener('click', handleLogout);
    window.addEventListener('resize', handleSidebarViewportChange);
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
}

function updateConnectionStatus() {
    const status = $('#connectionStatus');
    if (!status) return;
    const online = navigator.onLine;
    status.classList.toggle('offline', !online);
    status.innerHTML = `<span class="status-pulse"></span><div><strong>${online ? 'System online' : 'System offline'}</strong><small>${online ? 'All services operational' : 'Check your connection'}</small></div>`;
}

async function handleLogout() {
    const button = $('#confirmLogoutBtn');
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Logging out';
    try {
        if (currentUser) {
            localStorage.setItem('lastUserEmail', currentUser.email || '');
            localStorage.setItem('lastUserName', currentUser.displayName || currentUser.email?.split('@')[0] || 'User');
            localStorage.setItem('lastUserAvatar', currentUser.photoURL || '');
        }
        const result = await signOut();
        if (!result?.success) throw new Error(result?.error || 'Sign out failed');
        window.location.href = '../pages/login.html';
    } catch (error) {
        console.error('Logout failed:', error);
        button.disabled = false;
        button.textContent = 'Yes, logout';
        showToast('Could not log out. Please try again.', 'bi-exclamation-circle-fill');
    }
}

initializePageHeaders();
attachStaticEvents();
syncSidebarForViewport();
renderAllPets();
renderNotifications();
updateConnectionStatus();
updateLiveDateTime();
initializeLiveTracking();

const initialSection = location.hash.slice(1);
showSection(pageMeta[initialSection] ? initialSection : 'live-tracking');

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = '../pages/login.html';
        return;
    }
    if (!user.emailVerified) {
        await signOut();
        window.location.href = '../pages/login.html';
        return;
    }
    currentUser = user;
    let name = user.displayName || user.email?.split('@')[0] || 'User';
    try {
        const result = await getUserData(user.uid);
        if (result?.success && result.data?.fullName) name = result.data.fullName;
    } catch (error) {
        console.warn('User profile details were unavailable.', error);
    }
    setUserInterface(name, user.email || '', user.photoURL || '');
    localStorage.setItem('lastUserEmail', user.email || '');
    localStorage.setItem('lastUserName', name);
    localStorage.setItem('lastUserAvatar', user.photoURL || '');
    await loadUserPets(user.uid);
});
