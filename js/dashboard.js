import {
    auth,
    signOut,
    onAuthStateChanged,
    getUserData,
    getPetsForUser
} from '../js/firebase-init.js';

const placeholderPhotos = [
    'https://images.unsplash.com/photo-1552053831-71594a27632d?w=320&h=320&fit=crop',
    'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=320&h=320&fit=crop',
    'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?w=320&h=320&fit=crop'
];

const GOOGLE_MAPS_API_KEY = 'AIzaSyDMI3xEi1DxPNlaM76B-sFigPOB3khJsGk';
let googleMapsLoader = null;

// =====================================================
// LIVE MONITORING PROTOTYPE DATA
// Replace this array with C# API / Supabase device data later.
// This data is intentionally separate from Firebase pet data.
// =====================================================
const liveTrackingPets = [
    {
        id: 'max',
        name: 'Max',
        photo: placeholderPhotos[0],
        collarOnline: true,
        gpsAvailable: true,
        coordinates: [14.6760, 121.0437],
        lastKnownCoordinates: [14.6760, 121.0437],
        locationName: 'Diliman, Quezon City',
        safeZone: { name: 'Home', center: [14.6764, 121.0439], radius: 100 },
        safeZoneStatus: 'inside',
        lastKnownSafeZoneStatus: 'inside',
        battery: 78,
        updated: '3:42 PM',
        heartRate: { value: 86, status: 'normal', available: true, updated: '3:42 PM' },
        temperature: { value: 38.1, status: 'normal', available: true, updated: '3:42 PM' },
        activity: { value: 'Walking', available: true, updated: '3:42 PM' }
    },
    {
        id: 'luna',
        name: 'Luna',
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
        updated: '3:35 PM',
        heartRate: { value: 112, status: 'normal', available: true, updated: '3:34 PM' },
        temperature: { value: 38.4, status: 'normal', available: true, updated: '3:34 PM' },
        activity: { value: 'Resting', available: true, updated: '3:33 PM' }
    },
    {
        id: 'bruno',
        name: 'Bruno',
        photo: placeholderPhotos[2],
        collarOnline: false,
        gpsAvailable: false,
        coordinates: null,
        lastKnownCoordinates: [14.6805, 121.0384],
        locationName: 'Last known near University Avenue',
        safeZone: { name: 'Home', center: [14.6764, 121.0439], radius: 100 },
        safeZoneStatus: null,
        lastKnownSafeZoneStatus: 'inside',
        battery: 61,
        updated: '2:58 PM',
        heartRate: { value: 79, status: 'normal', available: false, updated: '2:58 PM' },
        temperature: { value: 38.0, status: 'normal', available: false, updated: '2:58 PM' },
        activity: { value: 'Resting', available: false, updated: '2:58 PM' }
    }
];

const demoPets = [
    {
        id: 'buddy', name: 'Buddy', type: 'Dog', breed: 'Golden Retriever', gender: 'Male',
        photo: placeholderPhotos[0], deviceId: 'SC-2026-1048', online: true, battery: 86,
        safe: true, geofence: 'Home safe zone', radius: 300, updated: 'Just now',
        location: 'Home · Quezon City', heartRate: 82, temperature: 38.5, activity: 'Walking'
    },
    {
        id: 'luna', name: 'Luna', type: 'Cat', breed: 'Domestic Shorthair', gender: 'Female',
        photo: placeholderPhotos[1], deviceId: 'SC-2026-2195', online: true, battery: 64,
        safe: true, geofence: 'Home safe zone', radius: 250, updated: '2 min ago',
        location: 'Riverside Park', heartRate: 118, temperature: 38.2, activity: 'Resting'
    }
];

const notifications = [
    { id: 1, category: 'location', icon: 'bi-geo-alt-fill', title: 'Geofence alert', pet: 'Buddy', message: 'Buddy briefly left the Home safe zone and returned.', time: 'Today, 10:18 AM', unread: true },
    { id: 2, category: 'device', icon: 'bi-battery-half', title: 'Low battery alert', pet: 'Luna', message: 'Luna’s collar battery is at 18%. Charge it soon.', time: 'Today, 9:46 AM', unread: true },
    { id: 3, category: 'device', icon: 'bi-wifi-off', title: 'Collar offline alert', pet: 'Buddy', message: 'The collar was offline for 4 minutes. Connection restored.', time: 'Today, 8:31 AM', unread: true },
    { id: 4, category: 'health', icon: 'bi-heart-pulse', title: 'Heart rate alert', pet: 'Luna', message: 'A heart rate reading was above the normal placeholder range.', time: 'Yesterday, 6:22 PM', unread: true },
    { id: 5, category: 'health', icon: 'bi-thermometer-high', title: 'Temperature alert', pet: 'Buddy', message: 'Body temperature was above the normal placeholder range.', time: 'Yesterday, 2:14 PM', unread: false },
    { id: 6, category: 'health', icon: 'bi-heart-pulse-fill', title: 'Heart rate data unavailable', pet: 'Buddy', message: 'No heart rate data was received for 15 minutes.', time: 'Aug 22, 11:40 AM', unread: false },
    { id: 7, category: 'health', icon: 'bi-thermometer', title: 'Temperature data unavailable', pet: 'Luna', message: 'The temperature sensor did not report a reading.', time: 'Aug 22, 10:05 AM', unread: false },
    { id: 8, category: 'device', icon: 'bi-activity', title: 'Activity data unavailable', pet: 'Buddy', message: 'Activity classification is temporarily unavailable.', time: 'Aug 21, 4:30 PM', unread: false },
    { id: 9, category: 'location', icon: 'bi-pin-map', title: 'GPS data unavailable', pet: 'Luna', message: 'The latest GPS position could not be determined.', time: 'Aug 21, 1:12 PM', unread: false }
];

const pageMeta = {
    'dashboard-home': ['Dashboard', 'Here’s a quick overview of your pet’s current status.'],
    'live-tracking': ['Live Monitoring', 'Track your pet’s current location, safe-zone status, and live collar information.'],
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
let dashboardDateTimer;

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        radius: Number(rawPet.geofenceRadius || demo.radius)
    };
}

function renderPetSelectors() {
    const options = pets.map(pet => `<option value="${escapeHtml(pet.id)}">${escapeHtml(pet.name)}</option>`).join('');
    ['#healthPetSelect', '#historyPetSelect'].forEach(selector => {
        const select = $(selector);
        if (!select) return;
        select.innerHTML = options || '<option>No pets available</option>';
        if (pets.some(pet => pet.id === selectedPetId)) select.value = selectedPetId;
    });
}

function getLivePetState(pet) {
    if (!pet.collarOnline) {
        return {
            key: 'offline',
            label: 'Offline',
            title: 'Collar Offline',
            description: 'Showing Last Known Location',
            icon: 'bi-wifi-off'
        };
    }
    if (!pet.gpsAvailable) {
        return {
            key: 'gps-unavailable',
            label: 'GPS unavailable',
            title: 'GPS Data Unavailable',
            description: 'Showing Last Known Location',
            icon: 'bi-pin-map'
        };
    }
    return {
        key: 'online',
        label: 'Online',
        title: 'Current Location',
        description: 'Live GPS position is available',
        icon: 'bi-broadcast-pin'
    };
}

function getDisplayedCoordinates(pet) {
    return pet.gpsAvailable && pet.coordinates ? pet.coordinates : pet.lastKnownCoordinates;
}

function getDisplayedSafeZoneStatus(pet) {
    return pet.gpsAvailable ? pet.safeZoneStatus : pet.lastKnownSafeZoneStatus;
}

function getSafeZoneLabel(pet) {
    const status = getDisplayedSafeZoneStatus(pet);
    const prefix = pet.gpsAvailable ? '' : 'Last known: ';
    return `${prefix}${status === 'inside' ? 'Inside Safe Zone' : 'Outside Safe Zone'}`;
}

function createLivePetMarkerIcon(pet) {
    const state = getLivePetState(pet);
    const selectedClass = pet.id === selectedLivePetId ? 'selected' : '';
    const element = document.createElement('div');
    element.className = `pet-map-marker ${state.key} ${selectedClass}`;
    element.innerHTML = `<img class="pet-map-photo" src="${escapeHtml(pet.photo)}" alt=""><span class="pet-map-name">${escapeHtml(pet.name)}</span>`;
    return element;
}

function renderLivePetSelector() {
    const container = $('#livePetSelector');
    if (!container) return;
    container.innerHTML = liveTrackingPets.map(pet => {
        const state = getLivePetState(pet);
        return `
            <button class="live-pet-option ${pet.id === selectedLivePetId ? 'active' : ''}" type="button" data-live-pet-id="${pet.id}" aria-pressed="${pet.id === selectedLivePetId}">
                <img src="${escapeHtml(pet.photo)}" alt="${escapeHtml(pet.name)}">
                <span class="option-copy"><strong>${escapeHtml(pet.name)}</strong><small><i class="option-state ${state.key}" aria-hidden="true"></i>${escapeHtml(state.label)}</small></span>
                <i class="bi bi-check-lg option-check" aria-hidden="true"></i>
            </button>
        `;
    }).join('');
}

function renderSelectedLivePet() {
    const pet = liveTrackingPets.find(item => item.id === selectedLivePetId);
    const container = $('#selectedPetPanel');
    const safeZoneContainer = $('#selectedSafeZonePanel');
    if (!pet || !container || !safeZoneContainer) return;
    const state = getLivePetState(pet);
    const safeStatus = getSafeZoneLabel(pet);
    const safeClass = getDisplayedSafeZoneStatus(pet) === 'inside' ? 'good' : 'warning';
    const locationLabel = pet.gpsAvailable ? 'Current location' : 'Last known location';
    const safeLabel = pet.gpsAvailable ? 'Safe zone status' : 'Last known safe zone status';
    container.innerHTML = `
        <div class="selected-pet-heading"><img src="${escapeHtml(pet.photo)}" alt="${escapeHtml(pet.name)}"><div><strong>${escapeHtml(pet.name)}</strong><span>Selected pet</span></div><span class="badge tracking-badge ${state.key}">${escapeHtml(state.label)}</span></div>
        <div class="selected-state ${state.key}"><i class="bi ${state.icon}"></i><div><strong>${escapeHtml(state.title)}</strong><span>${escapeHtml(state.description)}</span></div></div>
        <div class="selected-location-list">
            <div class="selected-info-row location-detail"><i class="bi bi-geo-alt" aria-hidden="true"></i><span><small>${locationLabel}</small><strong>${escapeHtml(pet.locationName)}</strong></span></div>
            <div class="selected-info-row safety-detail ${safeClass}"><i class="bi bi-shield-check" aria-hidden="true"></i><span><small>${safeLabel}</small><strong class="${safeClass}">${escapeHtml(safeStatus)}</strong></span></div>
            <div class="selected-info-row device-detail"><i class="bi bi-router" aria-hidden="true"></i><span><small>Collar status</small><strong>${pet.collarOnline ? 'Online' : 'Offline'}</strong></span></div>
            <div class="selected-info-row battery-detail"><i class="bi bi-battery-half" aria-hidden="true"></i><span><small>Battery level</small><strong class="${pet.battery <= 25 ? 'battery-low' : ''}">${pet.battery}%</strong></span></div>
            <div class="selected-info-row updated-detail"><i class="bi bi-clock" aria-hidden="true"></i><span><small>Last updated</small><strong>${escapeHtml(pet.updated)}</strong></span></div>
        </div>
        ${pet.gpsAvailable ? '' : '<p class="safe-zone-note"><i class="bi bi-info-circle"></i> The last known position is for reference and is not treated as a new geofence check.</p>'}
    `;

    safeZoneContainer.innerHTML = `
        <div class="side-panel-heading"><i class="bi bi-geo-fill"></i><div><h3>Safe Zone</h3><span>${escapeHtml(pet.safeZone.name)}</span></div></div>
        <div class="safe-zone-side-details"><span>Radius</span><strong>${pet.safeZone.radius} m</strong></div>
        <p><i class="bi bi-eye"></i> Display only. Edit geofences in Pet Management.</p>
    `;

    const badge = $('#mapDataBadge');
    if (badge) {
        const badgeClass = state.key === 'online' ? 'success' : state.key === 'gps-unavailable' ? 'warning' : 'danger';
        badge.className = `badge soft-badge ${badgeClass}`;
        badge.innerHTML = `<i class="bi ${state.icon}"></i> ${escapeHtml(state.title)}`;
    }
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

    liveTrackingMap.panTo(toGoogleCoordinates(coordinates));
    liveTrackingMap.setZoom(16);
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
    renderSelectedLivePet();
    updateLiveMapSelection();
}

function initializeLiveTracking() {
    renderLivePetSelector();
    renderSelectedLivePet();
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
    updateHealthData(petId);
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
        addButton.disabled = pets.length >= 3;
        addButton.title = pets.length >= 3 ? 'Maximum of 3 pets reached' : '';
    }
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
        <div class="pet-profile-showcase">
            <div class="pet-profile-facts pet-profile-facts-left">
                <div><span>Pet name</span><strong>${escapeHtml(pet.name)}</strong></div>
                <div><span>Pet type</span><strong>${escapeHtml(pet.type)}</strong></div>
                <div><span>Breed</span><strong>${escapeHtml(pet.breed)}</strong></div>
            </div>
            <div class="pet-profile-center">
                <div class="pet-profile-title">
                    <span aria-hidden="true"><i class="bi bi-heart-fill"></i></span>
                    <h3>${escapeHtml(pet.name)}</h3>
                    <span aria-hidden="true"><i class="bi bi-star-fill"></i></span>
                </div>
                <div class="pet-portrait-stage">
                    <img src="${escapeHtml(pet.photo)}" alt="${escapeHtml(pet.name)}">
                    <span class="status-chip ${pet.online ? 'online' : 'offline'}">${pet.online ? 'Collar online' : 'Collar offline'}</span>
                </div>
                <div class="pet-profile-note">
                    <p><strong>${escapeHtml(pet.name)}</strong> is a ${escapeHtml(pet.breed)} registered to this PawSense account.</p>
                    <div class="pet-detail-actions">
                        <button class="btn btn-brand" id="editPetPhotoBtn" type="button"><i class="bi bi-camera"></i> Edit photo</button>
                        <button class="btn btn-danger-soft" type="button" data-delete-pet="${escapeHtml(pet.id)}" data-bs-toggle="modal" data-bs-target="#deletePetModal"><i class="bi bi-trash3"></i> Delete</button>
                    </div>
                </div>
            </div>
            <div class="pet-profile-facts pet-profile-facts-right">
                <div><span>Gender</span><strong>${escapeHtml(pet.gender)}</strong></div>
                <div><span>Collar status</span><strong>${pet.online ? 'Connected' : 'Offline'}</strong></div>
                <div><span>Battery</span><strong>${pet.battery}%</strong></div>
            </div>
        </div>
        <div class="pet-device-strip">
            <span><i class="bi bi-router"></i> Paired collar</span>
            <strong>${escapeHtml(pet.deviceId)}</strong>
            <small><i class="bi bi-lock-fill"></i> Read only</small>
        </div>
        <div class="geofence-summary"><i class="bi bi-shield-check"></i><div><strong>${escapeHtml(pet.geofence)}</strong><span>${pet.radius} m radius &middot; ${pet.safe ? 'Pet is currently inside' : 'Pet is currently outside'}</span></div><button class="btn btn-soft" type="button" data-bs-toggle="modal" data-bs-target="#geofenceModal"><i class="bi bi-pencil"></i> Edit geofence</button></div>
    `;
}

function renderAllPets() {
    if (!pets.some(pet => pet.id === selectedPetId)) selectedPetId = pets[0]?.id || null;
    renderPetSelectors();
    renderPetList();
    renderPetDetail();
    renderDashboardHome();
    if (selectedPetId) updateHealthData(selectedPetId);
}

function updateHealthData(petId) {
    const pet = pets.find(item => item.id === petId);
    if (!pet) return;
    $('#healthHeartRate').textContent = pet.heartRate;
    $('#healthTemperature').textContent = pet.temperature.toFixed(1);
    $('#healthActivity').textContent = pet.activity;
    $('#healthUpdated').textContent = pet.updated === 'Just now' ? 'Today, just now' : `Today, ${pet.updated}`;
    renderDashboardHome();
}

function renderDashboardHome() {
    const pet = pets.find(item => item.id === selectedPetId) || pets[0];
    const petsCard = $('#dashboardPetsCard');
    const activityCard = $('#dashboardActivityCard');
    const locationCard = $('#dashboardLocationCard');
    const safetyCard = $('#dashboardSafetyCard');
    const alertCard = $('#dashboardAlertCard');
    if (!pet || !petsCard || !activityCard || !locationCard || !safetyCard || !alertCard) return;

    const petCountText = `${pets.length}/3`;
    const petList = pets.map(currentPet => `
        <button class="pet-mini-item ${currentPet.id === pet.id ? 'active' : ''}" type="button" data-pet-id="${escapeHtml(currentPet.id)}" aria-label="Select ${escapeHtml(currentPet.name)}" aria-pressed="${currentPet.id === pet.id}">
            <img src="${escapeHtml(currentPet.photo)}" alt="${escapeHtml(currentPet.name)}">
            <span>${escapeHtml(currentPet.name)}</span>
        </button>
    `).join('');

    petsCard.innerHTML = `
        <div class="summary-card-header">
            <h3 class="home-pets-heading"><span class="home-pets-icon" aria-hidden="true"><i class="bi bi-person-hearts"></i></span>Your Pets</h3>
            <span class="summary-count">${petCountText}</span>
        </div>
        <div class="summary-card-body">
            <div class="pet-mini-list">
                ${petList}
                ${pets.length < 3 ? `
                    <button class="pet-mini-item add-button" type="button" data-dashboard-add-pet="true" aria-label="Add pet">
                        <i class="bi bi-plus-lg"></i>
                        <span>Add Pet</span>
                    </button>
                ` : ''}
            </div>
            <div class="pet-summary-selected">
                <div class="pet-summary-selected-main">
                    <strong>${escapeHtml(pet.name)}</strong>
                    <span class="home-collar-status ${pet.online ? 'is-online' : 'is-offline'}"><span class="status-dot ${pet.online ? 'online' : 'offline'}" aria-hidden="true"></span><span aria-label="Collar ${pet.online ? 'online' : 'offline'}">${pet.online ? 'Online' : 'Offline'}</span></span>
                </div>
                <div class="pet-summary-selected-meta">
                    <div class="battery-health-inline">
                        <span>Battery</span>
                        <strong>${pet.battery}%</strong>
                        <div class="battery-meter"><i style="width: ${pet.battery}%"></i></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const activityValue = pet.activity || 'Resting';
    const activityIcon = { Resting: 'bi-moon-stars-fill', Walking: 'bi-person-walking', Running: 'bi-lightning-charge-fill' }[activityValue] || 'bi-activity';
    activityCard.innerHTML = `
        <div class="summary-card-header">
            <h3>Current Activity</h3>
        </div>
        <div class="summary-card-body home-activity-body">
            <div class="home-highlight-row">
                <span class="home-card-icon" aria-hidden="true"><i class="bi ${activityIcon}"></i></span>
                <div class="home-value-copy">
                    <strong class="home-card-value">${escapeHtml(activityValue)}</strong>
                    <span class="home-card-secondary">${escapeHtml(pet.name)} is currently ${escapeHtml(activityValue.toLowerCase())}</span>
                </div>
            </div>
            <span class="home-activity-updated"><i class="bi bi-clock" aria-hidden="true"></i> Last updated ${escapeHtml(pet.updated || 'unavailable')}</span>
        </div>
    `;

    const locationLabel = pet.location || 'Quezon City, Philippines';
    const gpsTrackingStatus = { Resting: 'Low-Power Tracking', Walking: 'Normal Tracking', Running: 'High Tracking' }[activityValue] || 'Unavailable';
    locationCard.innerHTML = `
        <div class="summary-card-header">
            <h3>Current Location</h3>
        </div>
        <div class="summary-card-body home-status-body">
            <div class="home-highlight-row">
                <span class="home-card-icon" aria-hidden="true"><i class="bi bi-geo-alt-fill"></i></span>
                <div class="home-value-copy">
                    <strong class="home-card-value">${escapeHtml(locationLabel)}</strong>
                    ${!pet.online ? '<span class="home-card-secondary">Last known location</span>' : ''}
                    <span class="home-gps-status"><i class="bi bi-broadcast" aria-hidden="true"></i><span>GPS: ${escapeHtml(gpsTrackingStatus)}</span></span>
                </div>
            </div>
            <span class="home-status-updated"><i class="bi bi-clock" aria-hidden="true"></i> Last updated ${escapeHtml(pet.updated || 'unavailable')}</span>
        </div>
    `;

    const safeStatus = pet.safe ? { label: 'Inside Safe Zone', type: 'safe' } : { label: 'Outside Safe Zone', type: 'warning' };
    safetyCard.innerHTML = `
        <div class="summary-card-header">
            <h3>Safety Status</h3>
        </div>
        <div class="summary-card-body home-status-body">
            <div class="home-highlight-row home-safety-panel ${safeStatus.type}">
                <span class="home-card-icon" aria-hidden="true"><i class="bi ${pet.safe ? 'bi-shield-check' : 'bi-shield-exclamation'}"></i></span>
                <div class="home-value-copy">
                    <strong class="home-card-value">${escapeHtml(safeStatus.label)}</strong>
                    <span class="home-card-secondary">${escapeHtml(pet.geofence || 'Home safe zone')}</span>
                </div>
            </div>
            <span class="home-status-updated"><i class="bi bi-clock" aria-hidden="true"></i> Last updated ${escapeHtml(pet.updated || 'unavailable')}</span>
        </div>
    `;

    const latestAlert = notifications.find(item => item.unread || item.category === 'location' || item.category === 'device') || {
        title: 'No new alerts',
        pet: pet.name,
        time: 'All clear',
        message: "You're all caught up.",
        category: 'all-clear'
    };
    alertCard.innerHTML = `
        <div class="summary-card-header">
            <h3>Latest Alert</h3>
        </div>
        <div class="summary-card-body">
            <div class="home-alert-panel ${latestAlert.title === 'No new alerts' ? 'safe' : 'warning'}">
                <div class="home-alert-heading">
                    <span class="home-card-icon" aria-hidden="true"><i class="bi ${latestAlert.title === 'No new alerts' ? 'bi-bell' : 'bi-bell-fill'}"></i></span>
                    <strong class="home-card-value">${escapeHtml(latestAlert.title)}</strong>
                </div>
                <p class="home-alert-description">${escapeHtml(latestAlert.message || 'No new alerts')}</p>
                <span class="home-alert-time"><i class="bi bi-clock" aria-hidden="true"></i> ${escapeHtml(latestAlert.time || 'Just now')}</span>
            </div>
        </div>
    `;
}

function updateDashboardDate() {
    const dateLabel = $('#dashboardDate');
    if (!dateLabel) return;
    const now = new Date();
    dateLabel.dateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    dateLabel.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    clearTimeout(dashboardDateTimer);
    dashboardDateTimer = setTimeout(updateDashboardDate, nextDay.getTime() - now.getTime() + 100);
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
    ['#greetingName', '#userName', '#welcomeName'].forEach(selector => { if ($(selector)) $(selector).textContent = safeName; });
    $('#profileName').value = safeName;
    $('#userEmail').textContent = email || '';
    $('#profileEmail').value = email || '';
    ['#userAvatar', '#settingsAvatar'].forEach(selector => {
        const element = $(selector);
        if (!element) return;
        element.innerHTML = photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(safeName)}">` : initial;
    });
}

async function loadUserPets(userId) {
    try {
        const result = await getPetsForUser(userId);
        if (result?.success && result.pets?.length) {
            pets = result.pets.slice(0, 3).map(normalizedPet);
        }
    } catch (error) {
        console.warn('Using prototype pets because saved pet profiles were unavailable.', error);
    }
    selectedPetId = pets.find(pet => pet.id === localStorage.getItem(`lastPet_${userId}`))?.id || pets[0]?.id || null;
    renderAllPets();
}

function attachStaticEvents() {
    $$('.sidebar-nav [data-section]').forEach(button => button.addEventListener('click', () => showSection(button.dataset.section)));
    $$('[data-section-trigger]').forEach(button => button.addEventListener('click', () => showSection(button.dataset.sectionTrigger)));
    $('#sidebarToggle')?.addEventListener('click', toggleSidebar);
    $('#sidebarLogoToggle')?.addEventListener('click', toggleSidebar);
    $('#mobileLogoToggle')?.addEventListener('click', openSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeSidebar);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) updateDashboardDate();
    });

    document.addEventListener('click', event => {
        const livePetTarget = event.target.closest('[data-live-pet-id]');
        if (livePetTarget) selectLiveTrackingPet(livePetTarget.dataset.livePetId);
        const petTarget = event.target.closest('[data-pet-id]');
        if (petTarget) selectPet(petTarget.dataset.petId);
        const deleteTarget = event.target.closest('[data-delete-pet]');
        if (deleteTarget) deletePetId = deleteTarget.dataset.deletePet;

        const addPetShortcut = event.target.closest('[data-dashboard-add-pet]');
        if (addPetShortcut) {
            showSection('pet-management');
            const addPetModal = document.getElementById('addPetModal');
            if (window.bootstrap?.Modal && addPetModal) {
                const modal = window.bootstrap.Modal.getOrCreateInstance(addPetModal);
                modal.show();
            }
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeSidebar();
    });

    $('#healthPetSelect')?.addEventListener('change', event => selectPet(event.target.value));
    $('#historyPetSelect')?.addEventListener('change', event => selectPet(event.target.value));

    $('#refreshTrackingBtn')?.addEventListener('click', event => {
        const button = event.currentTarget;
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Refreshing';
        setTimeout(() => {
            $('#lastSync').textContent = 'just now';
            const selectedPet = liveTrackingPets.find(pet => pet.id === selectedLivePetId);
            if (selectedPet?.gpsAvailable) selectedPet.updated = 'Just now';
            if (selectedPet?.heartRate.available) selectedPet.heartRate.updated = 'Just now';
            if (selectedPet?.temperature.available) selectedPet.temperature.updated = 'Just now';
            if (selectedPet?.activity.available) selectedPet.activity.updated = 'Just now';
            renderSelectedLivePet();
            button.disabled = false;
            button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh';
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
        if (pets.length >= 3) return showToast('The maximum of 3 pets has been reached.', 'bi-exclamation-circle-fill');
        const index = pets.length;
        const newPet = {
            ...demoPets[0], id: `prototype-${Date.now()}`, name: $('#newPetName').value.trim(),
            type: $('#newPetType').value, breed: $('#newPetBreed').value.trim(), gender: $('#newPetGender').value,
            deviceId: $('#newDeviceId').value.trim(), photo: placeholderPhotos[index % placeholderPhotos.length],
            battery: 100, heartRate: 78, temperature: 38.4, activity: 'Resting', updated: 'Just now'
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
updateDashboardDate();
updateConnectionStatus();
initializeLiveTracking();

const initialSection = location.hash.slice(1);
showSection(pageMeta[initialSection] ? initialSection : 'dashboard-home');

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
