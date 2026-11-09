function hasCollarInternet(pet) {
    return Boolean(pet.collarOnline && pet.cellular?.internetAvailable);
}


function hasLiveLocation(pet) {
    const coordinates = pet?.lastKnownCoordinates;

    return Boolean(
        hasCollarInternet(pet) &&
        pet.gpsAvailable === true &&
        Array.isArray(coordinates) &&
        coordinates.length === 2 &&
        coordinates.every(value =>
            typeof value === 'number' &&
            Number.isFinite(value)
        )
    );
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
    const coordinates = pet?.lastKnownCoordinates;

    if (
        Array.isArray(coordinates) &&
        coordinates.length === 2 &&
        coordinates.every(value =>
            typeof value === 'number' &&
            Number.isFinite(value)
        )
    ) {
        return coordinates;
    }

    return null;
}

function getDisplayedSafeZoneStatus(pet) {
    return hasLiveLocation(pet) ? pet.safeZoneStatus : pet.lastKnownSafeZoneStatus;
}

function getSafeZoneLabel(pet) {
    const status = getDisplayedSafeZoneStatus(pet);
    if (status !== 'inside' && status !== 'outside') return 'Status unavailable';
    const prefix = hasLiveLocation(pet) ? '' : 'Last known: ';
    return `${prefix}${status === 'inside' ? 'Inside Safe Zone' : 'Outside Safe Zone'}`;
}
export { hasCollarInternet, hasLiveLocation, getLivePetState, getGpsState, getTrackingMessage, getDisplayedCoordinates, getDisplayedSafeZoneStatus, getSafeZoneLabel };
