import { DATA_MODE } from '../core/data-mode.js';
import { liveTrackingPets as demoLiveTrackingPets } from './demo-data.js';
import { $, escapeHtml, showToast } from './dom.js';
import {
    hasCollarInternet, getLivePetState, getTrackingMessage,
    getDisplayedCoordinates, getDisplayedSafeZoneStatus, getSafeZoneLabel
} from './pet-status.js';
import { updateActivityData } from './activity.js';

const GOOGLE_MAPS_API_KEY = 'AIzaSyDMI3xEi1DxPNlaM76B-sFigPOB3khJsGk';
let googleMapsLoader = null;
const LIVE_PET_FOCUS_ZOOM = 18;

// ======================================================
// LIVE TRACKING DATA
// ======================================================

let liveTrackingPets =
    DATA_MODE === 'demo'
        ? demoLiveTrackingPets.map(pet => ({ ...pet }))
        : [];

let selectedLivePetId =
    liveTrackingPets[0]?.id || null;


// ======================================================
// GOOGLE MAP STATE
// ======================================================

let liveTrackingMap = null;
let liveSafeZoneCircle = null;
let liveSafeZoneCenter = null;

const livePetMarkers = new Map();


// Default map position when no pet exists yet.
// This only gives the empty map somewhere to start.
const DEFAULT_MAP_CENTER = {
    lat: 12.8797,
    lng: 121.7740
};

const DEFAULT_MAP_ZOOM = 6;

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
    const pet = liveTrackingPets.find(
        item => item.id === selectedLivePetId
    );

    const trackingMessage = $('#trackingMessage');
    const primaryRow = $('#livePrimaryStatusRow');
    const secondaryRow = $('#liveSecondaryStatusRow');

    if (!trackingMessage || !primaryRow || !secondaryRow) {
        return;
    }

    // ==========================================
    // NO PET REGISTERED
    // ==========================================
    if (!pet) {
        trackingMessage.hidden = false;
        trackingMessage.className = 'tracking-message warning';

        trackingMessage.innerHTML = `
            <i class="bi bi-info-circle"></i>
            <span>
                No pet registered yet.
                Add a pet to begin live tracking.
            </span>
        `;

        primaryRow.innerHTML = `
            <div class="col-12">
                <article class="tracking-status-card">
                    <header>
                        <span>Pet Monitoring</span>
                        <i class="bi bi-person-hearts"></i>
                    </header>

                    <div class="status-card-details">
                        <span>
                            Register a pet and pair a collar
                            to begin receiving live data.
                        </span>
                    </div>
                </article>
            </div>
        `;

        secondaryRow.innerHTML = '';

        return;
    }

    // EXISTING PET CODE CONTINUES BELOW

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

    if (!liveTrackingMap) {
        return;
    }


    window.google.maps.event.trigger(
        liveTrackingMap,
        'resize'
    );


    const pet =
        liveTrackingPets.find(
            item =>
                item.id ===
                selectedLivePetId
        );


    if (pet) {

        liveTrackingMap.setCenter(
            toGoogleCoordinates(
                getDisplayedCoordinates(
                    pet
                )
            )
        );

    } else {

        liveTrackingMap.setCenter(
            DEFAULT_MAP_CENTER
        );
    }
}

function updateLiveMapSelection() {
    if (!liveTrackingMap) {
        return;
    }

    const pet = liveTrackingPets.find(
        item => item.id === selectedLivePetId
    );

    // ==========================================
    // NO PET
    // ==========================================
    if (!pet) {
        livePetMarkers.forEach(marker => {
            marker.map = null;
        });

        if (liveSafeZoneCircle) {
            liveSafeZoneCircle.setMap(null);
        }

        if (liveSafeZoneCenter) {
            liveSafeZoneCenter.setMap(null);
        }

        liveTrackingMap.setCenter(DEFAULT_MAP_CENTER);
        liveTrackingMap.setZoom(DEFAULT_MAP_ZOOM);

        return;
    }

    const coordinates = getDisplayedCoordinates(pet);
    const petPosition = toGoogleCoordinates(coordinates);

    // ==========================================
    // PET MARKERS
    // ==========================================
    livePetMarkers.forEach((marker, petId) => {
        marker.content?.classList.toggle(
            'selected',
            petId === selectedLivePetId
        );

        marker.zIndex =
            petId === selectedLivePetId ? 1000 : 0;

        marker.map = liveTrackingMap;
    });

    const selectedMarker =
        livePetMarkers.get(selectedLivePetId);

    if (selectedMarker) {
        selectedMarker.position = petPosition;
    }

    // ==========================================
    // SAFE ZONE
    // ==========================================
    if (
        pet.safeZone?.center &&
        Number.isFinite(Number(pet.safeZone.radius))
    ) {
        const safeZoneCenter =
            toGoogleCoordinates(pet.safeZone.center);

        // Create circle only once
        if (!liveSafeZoneCircle) {
            liveSafeZoneCircle =
                new window.google.maps.Circle({
                    map: liveTrackingMap,
                    center: safeZoneCenter,
                    radius: Number(pet.safeZone.radius),

                    strokeColor: '#359574',
                    strokeOpacity: 0.75,
                    strokeWeight: 2,

                    fillColor: '#359574',
                    fillOpacity: 0.1
                });
        } else {
            liveSafeZoneCircle.setMap(liveTrackingMap);
            liveSafeZoneCircle.setCenter(safeZoneCenter);
            liveSafeZoneCircle.setRadius(
                Number(pet.safeZone.radius)
            );
        }

        // Create safe-zone center only once
        if (!liveSafeZoneCenter) {
            liveSafeZoneCenter =
                new window.google.maps.Marker({
                    map: liveTrackingMap,
                    position: safeZoneCenter,

                    title:
                        `${pet.safeZone.name || 'Safe zone'} center`,

                    icon: {
                        path:
                            window.google.maps.SymbolPath.CIRCLE,

                        scale: 5,
                        fillColor: '#359574',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2
                    }
                });
        } else {
            liveSafeZoneCenter.setMap(liveTrackingMap);
            liveSafeZoneCenter.setPosition(safeZoneCenter);

            liveSafeZoneCenter.setTitle(
                `${pet.safeZone.name || 'Safe zone'} center`
            );
        }
    } else {
        liveSafeZoneCircle?.setMap(null);
        liveSafeZoneCenter?.setMap(null);
    }

    // ==========================================
    // MOVE EXISTING MAP
    // ==========================================
    liveTrackingMap.setZoom(LIVE_PET_FOCUS_ZOOM);

    if (
        window.matchMedia?.(
            '(prefers-reduced-motion: reduce)'
        )?.matches
    ) {
        liveTrackingMap.setCenter(petPosition);
    } else {
        liveTrackingMap.panTo(petPosition);
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
    const container = $('#trackingMap');

    if (!container) {
        return;
    }

    // ==========================================
    // MAP ALREADY EXISTS
    // ==========================================
    if (liveTrackingMap) {
        refreshLiveMapLayout();
        return;
    }

    // ==========================================
    // LOAD GOOGLE MAPS ONCE
    // ==========================================
    loadGoogleMaps()
        .then(() => {
            // Prevent duplicate map creation if this
            // function was called again while loading.
            if (liveTrackingMap) {
                refreshLiveMapLayout();
                return;
            }

            container.innerHTML = '';

            const firstPet = liveTrackingPets[0];

            const initialCenter =
                firstPet
                    ? toGoogleCoordinates(
                        getDisplayedCoordinates(firstPet)
                    )
                    : DEFAULT_MAP_CENTER;

            const initialZoom =
                firstPet
                    ? 15
                    : DEFAULT_MAP_ZOOM;

            // ==========================================
            // CREATE MAP ONCE
            // ==========================================
            liveTrackingMap =
                new window.google.maps.Map(
                    container,
                    {
                        center: initialCenter,
                        zoom: initialZoom,

                        mapTypeControl: true,
                        streetViewControl: false,
                        fullscreenControl: true,

                        mapId: 'DEMO_MAP_ID'
                    }
                );

            console.log('GOOGLE MAP CREATED ONCE');

            // ==========================================
            // CREATE PET MARKERS
            // ==========================================
            liveTrackingPets.forEach(pet => {
                const marker =
                    new window.google.maps.marker
                        .AdvancedMarkerElement({
                            map: liveTrackingMap,

                            position:
                                toGoogleCoordinates(
                                    getDisplayedCoordinates(pet)
                                ),

                            content:
                                createLivePetMarkerIcon(pet),

                            title: pet.name,

                            zIndex:
                                pet.id === selectedLivePetId
                                    ? 1000
                                    : 0
                        });

                marker.addListener(
                    'click',
                    () => {
                        selectLiveTrackingPet(pet.id);
                    }
                );

                livePetMarkers.set(
                    pet.id,
                    marker
                );
            });

            updateLiveMapSelection();

            setTimeout(
                refreshLiveMapLayout,
                50
            );
        })
        .catch(error => {
            showMapUnavailableState(
                'Google Maps unavailable',
                error.message
            );
        });
}

function selectLiveTrackingPet(petId) {
    if (!liveTrackingPets.some(pet => pet.id === petId)) return;
    selectedLivePetId = petId;
    renderLivePetSelector();
    renderActivityPetSelector();
    renderSelectedLivePet();
    updateActivityData(petId);
    updateLiveMapSelection();
}

function initializeLiveTracking() {
    renderLivePetSelector();
    renderActivityPetSelector();
    renderSelectedLivePet();

    if (selectedLivePetId) {
        updateActivityData(selectedLivePetId);
    }

    initializeLiveTrackingMap();
}

function attachLiveTrackingEvents() {
    $('#refreshTrackingBtn')?.addEventListener('click', event => {
        const button = event.currentTarget;

        button.disabled = true;
        button.innerHTML =
            '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>';

        setTimeout(() => {
            const selectedPet = liveTrackingPets.find(
                pet => pet.id === getSelectedLivePetId()
            );

            if (!selectedPet || !hasCollarInternet(selectedPet)) {
                button.disabled = false;
                button.innerHTML =
                    '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i>';

                showToast(
                    'Live updates are unavailable while the collar is offline.',
                    'bi-cloud-slash'
                );

                return;
            }

            // Update connection sync time
            selectedPet.lastSync = 'Just now';

            // Update battery timestamp if battery data exists
            if (
                Number.isFinite(selectedPet.battery) &&
                selectedPet.battery >= 0 &&
                selectedPet.battery <= 100
            ) {
                selectedPet.batteryUpdated = 'Just now';
            }

            // Update GPS/location timestamp if GPS data exists
            if (
                selectedPet.gpsAvailable &&
                selectedPet.coordinates
            ) {
                selectedPet.updated = 'Just now';
            }

            // Update activity timestamp if activity data exists
            if (selectedPet.activity?.available) {
                selectedPet.activity.updated = 'Just now';
            }

            renderSelectedLivePet();

            if (selectedPet.id) {
                updateActivityData(selectedPet.id);
            }

            button.disabled = false;
            button.innerHTML =
                '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i>';

            showToast('Tracking data refreshed.');
        }, 700);
    });
}


function hasLiveMap() {
    return Boolean(liveTrackingMap);
}


function getSelectedLivePetId() {
    return selectedLivePetId;
}

export {
    hasLiveMap,
    getSelectedLivePetId,
    refreshLiveMapLayout,
    renderPetAvatarSelector,
    renderLivePetSelector,
    renderActivityPetSelector,
    renderSelectedLivePet,
    updateLiveMapSelection,
    initializeLiveTracking,
    selectLiveTrackingPet,
    attachLiveTrackingEvents,
    loadGoogleMaps
};
