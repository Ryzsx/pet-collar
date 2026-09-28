import { $ } from './dom.js';
import { getDisplayedCoordinates } from './pet-status.js';

let recordedRouteMap = null;
let routePolyline = null;
let routeMarkers = [];
let latestRenderId = 0;

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

function dateSeed(date) {
    return [...new Date(date).toISOString().slice(0, 10)]
        .reduce((total, character) => total + character.charCodeAt(0), 0);
}

function getRecordedPoints(pet, date) {
    const key = new Date(date).toISOString().slice(0, 10);
    const stored = pet?.locationHistory?.[key] || pet?.recordedRoutes?.[key];
    if (Array.isArray(stored)) {
        const points = stored
            .map(item => Array.isArray(item) ? item : item?.coordinates)
            .filter(validCoordinates)
            .map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }));
        if (points.length) return points;
    }

    const displayed = getDisplayedCoordinates(pet);
    const safeCenter = pet?.safeZone?.center;
    const base = validCoordinates(displayed)
        ? displayed
        : validCoordinates(safeCenter) ? safeCenter : [12.8797, 121.7740];
    const seed = dateSeed(date);
    const direction = seed % 2 ? 1 : -1;
    const spread = 0.00045 + (seed % 4) * 0.00008;
    const end = { lat: Number(base[0]), lng: Number(base[1]) };

    return [
        { lat: end.lat - spread * 1.45, lng: end.lng - spread * direction },
        { lat: end.lat - spread * .85, lng: end.lng - spread * .55 * direction },
        { lat: end.lat - spread * .35, lng: end.lng + spread * .25 * direction },
        end
    ];
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
    const distance = points.slice(1).reduce(
        (total, point, index) => total + distanceInKilometers(points[index], point),
        0
    );
    const durationMinutes = Math.max(0, (points.length - 1) * 35);
    const startTime = '7:15 AM';
    const middleTime = durationMinutes >= 70 ? '8:25 AM' : '7:50 AM';
    const endMinutes = 7 * 60 + 15 + durationMinutes;
    const endDate = new Date(2000, 0, 1, Math.floor(endMinutes / 60), endMinutes % 60);
    const endTime = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    return {
        distance: distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`,
        duration: formatDuration(durationMinutes),
        locations: `${points.length} ${points.length === 1 ? 'place' : 'places'}`,
        stops: [
            { name: pet?.locationName || 'Last recorded location', detail: `${endTime} · Last recorded point` },
            { name: 'Recorded movement', detail: `${middleTime} · Activity route` },
            { name: pet?.safeZone?.name || 'Safe zone', detail: `${startTime} · Start point` }
        ]
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
    if (!container || !pet) return;
    const renderId = ++latestRenderId;

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
        window.setTimeout(() => window.google.maps.event.trigger(recordedRouteMap, 'resize'), 80);
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
