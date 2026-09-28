function hasCollarInternet(pet) {
    return Boolean(
        pet?.collarOnline &&
        pet?.cellular?.internetAvailable
    );
}


function hasGpsCoordinates(pet) {

    const latitude = Number(pet?.coordinates?.[0]);
    const longitude = Number(pet?.coordinates?.[1]);

    return Boolean(
        pet?.gpsAvailable &&
        Array.isArray(
            pet?.coordinates
        ) &&
        pet.coordinates.length >= 2 &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
    );
}


function hasLiveLocation(pet) {
    return hasCollarInternet(pet) && hasGpsCoordinates(pet);
}


function getLivePetState(pet) {

    const hasRecordedLocation = Boolean(
        getDisplayedCoordinates(pet)
    );

    // ==================================================
    // COLLAR OFFLINE
    // ==================================================

    if (!hasCollarInternet(pet)) {
        return {
            key: 'offline',
            title: hasRecordedLocation
                ? 'Last Known Location'
                : 'Location Unavailable',
            icon: 'bi-cloud-slash'
        };
    }


    // ==================================================
    // COLLAR ONLINE BUT NO GPS FIX
    // ==================================================

    if (
        !hasLiveLocation(pet)
    ) {
        return {
            key: 'gps-unavailable',
            title: hasRecordedLocation
                ? 'Last Known Location'
                : 'Location Unavailable',
            icon: 'bi-pin-map'
        };
    }


    // ==================================================
    // REAL COLLAR GPS AVAILABLE
    // ==================================================

    return {
        key: 'online',
        title: 'Current Location',
        icon: 'bi-broadcast-pin'
    };
}


function getGpsState(pet) {
    if (pet?.gpsAvailable) {

        return hasCollarInternet(pet)
            ? {
                key: 'good',
                label: 'GPS Fix Available',
                detail: 'Live fix received'
            }
            : {
                key: 'warning',
                label: 'Still Active on Collar',
                detail:
                    'Latest position is stored locally'
            };
    }


    return hasCollarInternet(pet)
        ? {
            key: 'muted',
            label: 'No GPS Fix',
            detail:
                'Waiting for satellite fix'
        }
        : {
            key: 'muted',
            label: 'Unavailable',
            detail:
                'No GPS or cellular connection'
        };
}


function getTrackingMessage(pet) {
    const internetAvailable =
        hasCollarInternet(pet);
    const hasRecordedLocation = Boolean(
        getDisplayedCoordinates(pet)
    );


    if (
        !internetAvailable &&
        hasRecordedLocation
    ) {
        return (
            'Live updates are temporarily unavailable. ' +
            'Showing the last known location.'
        );
    }


    if (
        internetAvailable &&
        !hasGpsCoordinates(pet)
    ) {
        return 'Waiting for a new GPS fix.';
    }


    if (
        !internetAvailable &&
        !hasRecordedLocation
    ) {
        return (
            'GPS and cellular service are unavailable. ' +
            'No live collar location is currently available.'
        );
    }


    return '';
}


function getDisplayedCoordinates(pet) {

    if (!pet) {
        return null;
    }


    // ==================================================
    // PRIORITY 1:
    // Real collar GPS
    // ==================================================

    if (hasLiveLocation(pet)) {

        return [
            Number(
                pet.coordinates[0]
            ),
            Number(
                pet.coordinates[1]
            )
        ];
    }


    // Previously received collar GPS

    if (
        Array.isArray(
            pet.lastKnownCoordinates
        ) &&
        pet.lastKnownCoordinates.length >= 2
    ) {

        const latitude =
            Number(
                pet.lastKnownCoordinates[0]
            );

        const longitude =
            Number(
                pet.lastKnownCoordinates[1]
            );


        if (
            Number.isFinite(latitude) &&
            Number.isFinite(longitude)
        ) {

            return [
                latitude,
                longitude
            ];
        }
    }


    return null;
}


function calculateDistanceMeters(
    latitude1,
    longitude1,
    latitude2,
    longitude2
) {

    const earthRadius =
        6371000;


    const toRadians =
        degrees =>
            degrees *
            Math.PI /
            180;


    const firstLatitude =
        toRadians(
            latitude1
        );

    const secondLatitude =
        toRadians(
            latitude2
        );


    const latitudeDifference =
        toRadians(
            latitude2 -
            latitude1
        );


    const longitudeDifference =
        toRadians(
            longitude2 -
            longitude1
        );


    const a =
        Math.sin(
            latitudeDifference / 2
        ) ** 2 +
        Math.cos(
            firstLatitude
        ) *
        Math.cos(
            secondLatitude
        ) *
        Math.sin(
            longitudeDifference / 2
        ) ** 2;


    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );


    return earthRadius * c;
}


function getDisplayedSafeZoneStatus(pet) {

    if (!pet) {
        return 'unknown';
    }


    const coordinates =
        getDisplayedCoordinates(
            pet
        );


    const safeZoneCenter =
        pet?.safeZone?.center;


    const safeZoneRadius =
        Number(
            pet?.safeZone?.radius
        );


    // Cannot determine geofence status
    // without both a location and safe zone.
    if (
        !Array.isArray(
            coordinates
        ) ||
        coordinates.length < 2 ||
        !Array.isArray(
            safeZoneCenter
        ) ||
        safeZoneCenter.length < 2 ||
        !Number.isFinite(
            safeZoneRadius
        ) ||
        safeZoneRadius <= 0
    ) {
        return 'unknown';
    }


    const petLatitude =
        Number(
            coordinates[0]
        );

    const petLongitude =
        Number(
            coordinates[1]
        );


    const safeLatitude =
        Number(
            safeZoneCenter[0]
        );

    const safeLongitude =
        Number(
            safeZoneCenter[1]
        );


    if (
        !Number.isFinite(
            petLatitude
        ) ||
        !Number.isFinite(
            petLongitude
        ) ||
        !Number.isFinite(
            safeLatitude
        ) ||
        !Number.isFinite(
            safeLongitude
        )
    ) {
        return 'unknown';
    }


    const distance =
        calculateDistanceMeters(
            petLatitude,
            petLongitude,
            safeLatitude,
            safeLongitude
        );


    return distance <=
        safeZoneRadius
            ? 'inside'
            : 'outside';
}


function getSafeZoneLabel(pet) {

    const status =
        getDisplayedSafeZoneStatus(
            pet
        );


    if (status === 'unknown') {
        return 'Location unavailable';
    }


    // ==================================================
    // REAL LIVE GPS
    // ==================================================

    if (hasLiveLocation(pet)) {

        return status === 'inside'
            ? 'Inside Safe Zone'
            : 'Outside Safe Zone';
    }


    // ==================================================
    // LAST KNOWN REAL GPS
    // ==================================================

    return status === 'inside'
        ? 'Last known: Inside Safe Zone'
        : 'Last known: Outside Safe Zone';
}


export {
    hasCollarInternet,
    hasLiveLocation,
    getLivePetState,
    getGpsState,
    getTrackingMessage,
    getDisplayedCoordinates,
    getDisplayedSafeZoneStatus,
    getSafeZoneLabel
};
