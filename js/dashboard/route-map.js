import { $, escapeHtml } from './dom.js';
import { getDisplayedCoordinates } from './pet-status.js';
import { db } from '../core/firebase-config.js';

import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
// ==================================================
// FIRESTORE GPS ROUTE HISTORY READER
// ==================================================
const gpsHistoryCache = new Map();
export function watchRecordedGpsHistory(petId, date, onUpdate) {

    if (!petId || !date) {
        return () => {};
    }

    const selectedDate = new Date(date);

    if (Number.isNaN(selectedDate.getTime())) {
        return () => {};
    }

    const dateKey = [
        selectedDate.getFullYear(),
        String(selectedDate.getMonth() + 1).padStart(2, '0'),
        String(selectedDate.getDate()).padStart(2, '0')
    ].join('-');

    const dayStart = new Date(
        `${dateKey}T00:00:00+08:00`
    );

    const dayEnd = new Date(
        dayStart.getTime() + 86400000
    );

    const gpsQuery = query(
        collection(db, 'pets', petId, 'gpsHistory'),
        where('recordedAt', '>=', Timestamp.fromDate(dayStart)),
        where('recordedAt', '<', Timestamp.fromDate(dayEnd)),
        orderBy('recordedAt', 'asc')
    );

    return onSnapshot(
        gpsQuery,
        snapshot => {

           const records = snapshot.docs
    .map(document => {

        const data = document.data();

        const lat = data.latitude;
        const lng = data.longitude;

        const recordedDate =
            data.recordedAt?.toDate?.();

        if (
            typeof lat !== 'number' ||
            typeof lng !== 'number' ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < -90 ||
            lat > 90 ||
            lng < -180 ||
            lng > 180 ||
            !(recordedDate instanceof Date) ||
            Number.isNaN(recordedDate.getTime())
        ) {
            return null;
        }

        return {
            id: document.id,
            lat,
            lng,
            time: recordedDate.toLocaleTimeString(
                'en-GB',
                {
                    timeZone: 'Asia/Manila',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }
            ),
            recordedAt: recordedDate,
            source: data.source || '',
            isTestData: data.isTestData === true
        };

    })
    .filter(Boolean);

gpsHistoryCache.set(
    `${petId}|${dateKey}`,
    records
);

            onUpdate(records, null);

        },
        error => {

            console.error(
                'GPS HISTORY LOAD FAILED:',
                error
            );

            gpsHistoryCache.delete(
                `${petId}|${dateKey}`
            );

            onUpdate(null, error);
        }
    );
}


let recordedRouteMap = null;
let routePolyline = null;
let routeMarkers = [];
let latestRenderId = 0;
// ============================================
// ROUTE HISTORY - REVERSE GEOCODING
// ============================================

// Copy the existing Geoapify key from live-tracking.js.
const ROUTE_GEOAPIFY_API_KEY = 'e25eb522791c4a93956e0505de4ad1e6';

const routeAddressCache = new Map();

async function getRoutePointAddress(point) {
    const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;

    if (routeAddressCache.has(key)) {
        return routeAddressCache.get(key);
    }

    const request = (async () => {
        const params = new URLSearchParams({
            lat: String(point.lat),
            lon: String(point.lng),
            format: 'json',
            lang: 'en',
            apiKey: ROUTE_GEOAPIFY_API_KEY
        });

        const response = await fetch(
            `https://api.geoapify.com/v1/geocode/reverse?${params}`
        );

        if (!response.ok) {
            throw new Error(`Geoapify HTTP ${response.status}`);
        }

        const data = await response.json();
        const result = data.results?.[0];

        return result?.formatted ||
            [result?.street, result?.city, result?.state]
                .filter(Boolean)
                .join(', ') ||
            null;
    })().catch(error => {
        console.warn('Route address lookup failed:', error);
        routeAddressCache.delete(key);
        return null;
    });

    routeAddressCache.set(key, request);

    return request;
}

// ============================================
// UPDATE RECORDED LOCATION LABELS
// ============================================

async function updateRecordedRouteAddresses(points, pet, date, renderId) {
    const addresses = await Promise.all(
        points.map(point => getRoutePointAddress(point))
    );

    // Ignore results from an older map render.
    if (renderId !== latestRenderId) return;

    const routeMap = $('#recordedRouteMap');

    if (!routeMap || routeMap.style.display === 'none') {
        return;
    }

    // Prevent Milo's previous lookup from changing Chichi's display.
    const selectedPetId = document.querySelector(
        '#routePetSelector [data-avatar-pet-id].active'
    )?.dataset.avatarPetId;

    if (selectedPetId !== pet?.id) return;

    const selectedDateKey = document.querySelector(
        '#routeCalendarDays [data-route-date].is-selected'
    )?.dataset.routeDate;

    const dateKey = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');

    if (selectedDateKey !== dateKey) return;

    const stopItems = document.querySelectorAll(
        '#recordedRouteStops > div'
    );

    if (stopItems.length !== points.length) return;

    stopItems.forEach((item, index) => {
        const detail = item.querySelector('small');
        const address = addresses[index];

        if (!detail || !address) return;

        const rawTime = points[index].time || '';
        const [hours, minutes] = rawTime.split(':').map(Number);

        const timeLabel = Number.isFinite(hours) &&
            Number.isFinite(minutes)
            ? `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
            : 'Time unavailable';

        detail.textContent = `${timeLabel} · ${address}`;

        detail.title =
            `GPS: ${points[index].lat.toFixed(6)}, ` +
            `${points[index].lng.toFixed(6)}`;
    });
}

function validCoordinates(value) {
    return Array.isArray(value)
        && value.length >= 2
        && Number.isFinite(Number(value[0]))
        && Number.isFinite(Number(value[1]));
}

function waitForGoogleMaps(timeout = 12000) {
    if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = window.setInterval(() => {
            if (window.google?.maps?.Map) {
                window.clearInterval(timer);
                resolve(window.google.maps);
            } else if (Date.now() - started >= timeout) {
                window.clearInterval(timer);
                reject(new Error('Map service unavailable'));
            }
        }, 100);
    });
}

// ============================================
// PAWSENSE ROUTE HISTORY - DEMO GPS DATA
// ============================================

// Disable simulated GPS routes.
// Actual route history will come from Firestore.
const ROUTE_DEMO_ENABLED = false;

// Simulated GPS points for Milo only.
// Format: [Time, Latitude, Longitude]
// Coordinates are illustrative, not verified GPS readings.

const MILO_DEMO_ROUTES = {

    '2026-11-07': [
        ['08:00', 13.9435, 121.1605],
        ['08:10', 13.9439, 121.1611],
        ['08:20', 13.9444, 121.1619],
        ['08:30', 13.9448, 121.1627]
    ],

    '2026-11-08': [
        ['08:30', 13.9448, 121.1627],
        ['08:40', 13.9442, 121.1621],
        ['08:50', 13.9436, 121.1615],
        ['09:00', 13.9431, 121.1609]
    ],

    '2026-11-09': [
        ['07:30', 13.9431, 121.1609],
        ['07:40', 13.9437, 121.1604],
        ['07:50', 13.9443, 121.1600],
        ['08:00', 13.9450, 121.1596]
    ],

    '2026-11-10': [
        ['09:00', 13.9450, 121.1596],
        ['09:10', 13.9455, 121.1603],
        ['09:20', 13.9459, 121.1611],
        ['09:30', 13.9463, 121.1618]
    ],

    '2026-11-11': [
        ['08:15', 13.9463, 121.1618],
        ['08:25', 13.9458, 121.1624],
        ['08:35', 13.9451, 121.1629],
        ['08:45', 13.9445, 121.1633]
    ],

    '2026-11-12': [
        ['07:45', 13.9445, 121.1633],
        ['07:55', 13.9440, 121.1626],
        ['08:05', 13.9435, 121.1618],
        ['08:15', 13.9430, 121.1610]
    ]
};

// ============================================
// GET RECORDED GPS POINTS
// ============================================

function getRecordedPoints(pet, date) {

    if (!pet) return [];

    const selectedDate = new Date(date);

    if (Number.isNaN(selectedDate.getTime())) {
        return [];
    }

    const key = [
        selectedDate.getFullYear(),
        String(selectedDate.getMonth() + 1).padStart(2, '0'),
        String(selectedDate.getDate()).padStart(2, '0')
    ].join('-');

    // ============================================
    // DEMO MODE - MILO ONLY
    // ============================================

    if (ROUTE_DEMO_ENABLED) {

        const isMilo =
            pet.name?.trim().toLowerCase() === 'milo';

        // Chichi and other pets have no demo route.
        if (!isMilo) return [];

        const demoPoints = MILO_DEMO_ROUTES[key] || [];

        return demoPoints.map(([time, lat, lng]) => ({
            lat,
            lng,
            time,
            source: 'manual_test',
            isTestData: true
        }));
    }
    // ============================================
    // FIRESTORE GPS HISTORY DATA
    // ============================================

    const firestoreKey = `${pet.id}|${key}`;

    if (gpsHistoryCache.has(firestoreKey)) {
        return gpsHistoryCache.get(firestoreKey);
    }

    // ============================================
    // NORMAL STORED ROUTE DATA
    // ============================================

    const stored =
        pet?.locationHistory?.[key] ||
        pet?.recordedRoutes?.[key];

    if (!Array.isArray(stored)) {
        return [];
    }

    return stored
        .map(item =>
            Array.isArray(item)
                ? item
                : item?.coordinates
        )
        .filter(validCoordinates)
        .map(([lat, lng]) => ({
            lat: Number(lat),
            lng: Number(lng)
        }));
}

function distanceInKilometers(start, end) {
    const toRadians = value => value * Math.PI / 180;
    const earthRadius = 6371;
    const latitudeDelta = toRadians(end.lat - start.lat);
    const longitudeDelta = toRadians(end.lng - start.lng);
    const startLatitude = toRadians(start.lat);
    const endLatitude = toRadians(end.lat);
    const calculation = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(calculation), Math.sqrt(1 - calculation));
}

function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return hours ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
}

function getRecordedRouteSummary(pet, date) {
    const points = getRecordedPoints(pet, date);

    if (!points.length) {
        return null;
    }

    // Calculate distance between recorded GPS points.
    const distance = points.slice(1).reduce(
        (total, point, index) =>
            total + distanceInKilometers(points[index], point),
        0
    );

    // Convert demo HH:mm timestamps into minutes.
    function timeToMinutes(time) {
        if (!/^\d{2}:\d{2}$/.test(String(time))) {
            return null;
        }

        const [hours, minutes] = time.split(':').map(Number);

        if (hours > 23 || minutes > 59) return null;

        return hours * 60 + minutes;
    }

    function formatPointTime(time) {
        const minutes = timeToMinutes(time);

        if (minutes === null) {
            return 'Time unavailable';
        }

        return new Date(
            2000,
            0,
            1,
            Math.floor(minutes / 60),
            minutes % 60
        ).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    // Duration from first to last recorded point.
    const firstTime = timeToMinutes(points[0].time);
    const lastTime = timeToMinutes(points.at(-1).time);

    const durationMinutes =
        firstTime !== null &&
        lastTime !== null &&
        lastTime >= firstTime
            ? lastTime - firstTime
            : null;

    // Generate a location entry for EACH GPS point.
    const stops = points.map((point, index) => {
        let name = `GPS Point ${index + 1}`;

        if (index === 0) {
            name = 'Starting Point';
        } else if (index === points.length - 1) {
            name = 'Last Recorded Point';
        }

        return {
            name,
            detail:
                `${formatPointTime(point.time)} · ` +
                `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
        };
    });

    return {
        distance: distance < 1
            ? `${Math.round(distance * 1000)} m`
            : `${distance.toFixed(2)} km`,

        duration: durationMinutes === null
            ? '—'
            : formatDuration(durationMinutes),

        locations: `${points.length} points`,

        stops
    };
}
function clearRouteLayers() {
    routePolyline?.setMap(null);
    routePolyline = null;
    routeMarkers.forEach(marker => {
        if (typeof marker?.setMap === 'function') marker.setMap(null);
        else if (marker) marker.map = null;
    });
    routeMarkers = [];
}

function createStartMarker(position, pet) {
    const AdvancedMarker = window.google?.maps?.marker?.AdvancedMarkerElement;
    if (AdvancedMarker) {
        const pin = document.createElement('div');
        pin.className = 'recorded-pet-pin';
        pin.innerHTML = `
            <span class="recorded-pet-pin-photo">
                ${pet?.photo ? `<img src="${pet.photo}" alt="">` : `<b>${String(pet?.name || 'P').charAt(0).toUpperCase()}</b>`}
            </span>
            <span class="recorded-pet-pin-tip" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><circle cx="6.5" cy="7" r="2.5"/><circle cx="12" cy="5.5" r="2.5"/><circle cx="17.5" cy="7" r="2.5"/><path d="M6 16c0-3.5 2.7-6 6-6s6 2.5 6 6c0 2.3-1.8 3.8-4 3.1a6.7 6.7 0 0 0-4 0c-2.2.7-4-.8-4-3.1Z"/></svg></span>`;
        return new AdvancedMarker({
            map: recordedRouteMap,
            position,
            content: pin,
            title: `${pet?.name || 'Pet'} route start`,
            zIndex: 10
        });
    }

    return new window.google.maps.Marker({
        map: recordedRouteMap,
        position,
        title: `${pet?.name || 'Pet'} route start`,
        label: { text: String(pet?.name || 'P').charAt(0).toUpperCase(), color: '#ffffff', fontWeight: '700' },
        icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: '#1d968f',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3
        },
        zIndex: 10
    });
}

async function renderRecordedRouteMap(pet, date, unavailable = false) {
    const container = $('#recordedRouteMap');
    if (!container) return;

    const renderId = ++latestRenderId;
    const selectedPoints = getRecordedPoints(pet, date);

    // No records: remove previous route and markers.
    if (!pet || selectedPoints.length === 0) {
        clearRouteLayers();
        return;
    }

    try {
        await waitForGoogleMaps();
        if (renderId !== latestRenderId || !document.body.contains(container)) return;

        const points = getRecordedPoints(pet, date);
        if (!recordedRouteMap) {
            recordedRouteMap = new window.google.maps.Map(container, {
                center: points.at(-1),
                zoom: 17,
                mapTypeControl: true,
                streetViewControl: false,
                fullscreenControl: true,
                mapId: 'DEMO_MAP_ID'
            });
        }

        clearRouteLayers();
        if (!unavailable) {
            routePolyline = new window.google.maps.Polyline({
                map: recordedRouteMap,
                path: points,
                geodesic: true,
                strokeColor: '#1d968f',
                strokeOpacity: 0,
                icons: [
                    {
                        icon: {
                            path: window.google.maps.SymbolPath.CIRCLE,
                            fillColor: '#1d968f',
                            fillOpacity: 1,
                            scale: 2.4,
                            strokeColor: '#1d968f',
                            strokeOpacity: 1
                        },
                        offset: '0',
                        repeat: '15px'
                    },
                    {
                        icon: {
                            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                            fillColor: '#1d968f',
                            fillOpacity: 1,
                            scale: 5,
                            strokeColor: '#ffffff',
                            strokeWeight: 1
                        },
                        offset: '100%'
                    }
                ]
            });
            routeMarkers = [createStartMarker(points[0], pet)];
        }

        const bounds = new window.google.maps.LatLngBounds();

        points.forEach(point => bounds.extend(point));

        recordedRouteMap.fitBounds(bounds, 64);

        window.setTimeout(
            () => window.google.maps.event.trigger(recordedRouteMap, 'resize'),
            80
        );

        // Convert GPS coordinates into readable addresses.
        if (!unavailable && points.length > 0) {
            void updateRecordedRouteAddresses(
                points,
                pet,
                new Date(date),
                renderId
            );
        }
    } catch (error) {
        container.innerHTML = '<div class="map-unavailable-state"><span><i class="bi bi-map"></i></span><div><strong>Recorded map unavailable</strong><p>The route map will appear when the map service reconnects.</p></div></div>';
    }
}

if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(entries => {
        if (!recordedRouteMap || !entries.some(entry => entry.contentRect.width > 0)) return;
        window.google?.maps?.event?.trigger(recordedRouteMap, 'resize');
    });
    const observeMap = () => {
        const container = $('#recordedRouteMap');
        if (container) observer.observe(container);
        else window.requestAnimationFrame(observeMap);
    };
    observeMap();
}

export { getRecordedRouteSummary, renderRecordedRouteMap };
