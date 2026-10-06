// DEMO DATA:
// Representative pet profiles, collar/device status,
// GPS/location data, battery data, activity data,
// and notifications used only in Demo Mode.

import {
    hasCollarInternet,
    getDisplayedSafeZoneStatus
} from './pet-status.js';


const placeholderPhotos = [
    'https://images.unsplash.com/photo-1552053831-71594a27632d?w=320&h=320&fit=crop',
    'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=320&h=320&fit=crop',
    'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?w=320&h=320&fit=crop'
];


// =====================================================
// LIVE MONITORING DEMO DATA
// =====================================================
//
// Used only when DATA_MODE === 'demo'.
//
// In Live Mode, these values will eventually be replaced
// by real pet/device data from Firestore and the
// PawSense collar/backend.
//
// =====================================================

const liveTrackingPets = [
    {
        id: 'max',

        name: 'Max',
        type: 'Dog',
        photo: placeholderPhotos[0],

        // Collar / connectivity
        collarOnline: true,

        cellular: {
            internetAvailable: true,
            carrier: 'Globe',
            network: '4G LTE',
            signal: 'Strong'
        },

        lastSync: '11:42 PM',

        // GPS
        gpsAvailable: true,

        coordinates: [
            14.6760,
            121.0437
        ],

        lastKnownCoordinates: [
            14.6760,
            121.0437
        ],

        locationName:
            'Diliman, Quezon City',

        gpsAccuracy: 3.2,

        satellites: 11,

        updated: 'Just now',

        // Safe zone / geofence
        safeZone: {
            name: 'Home',

            center: [
                14.6764,
                121.0439
            ],

            radius: 100
        },

        safeZoneStatus: 'inside',

        lastKnownSafeZoneStatus:
            'inside',

        // Battery
        battery: 74,

        batteryUpdated:
            '11:42 PM',

        batteryVoltage: 3.91,

        batteryCondition:
            'Normal',

        // Activity
        activity: {
            value: 'Running',
            available: true,
            updated: '3:42 PM'
        },

        activityHistoryDemo: true,

        activityHistory: [
            {
                time: '12 AM',
                activity: 'Resting'
            },
            {
                time: '3 AM',
                activity: 'Resting'
            },
            {
                time: '6 AM',
                activity: 'Walking'
            },
            {
                time: '9 AM',
                activity: 'Running'
            },
            {
                time: '12 PM',
                activity: 'Walking'
            }
        ]
    },


    {
        id: 'luna',

        name: 'Luna',
        type: 'Cat',
        photo: placeholderPhotos[1],

        // Collar / connectivity
        collarOnline: true,

        cellular: {
            internetAvailable: true,
            carrier: 'Globe',
            network: '4G LTE',
            signal: 'Good'
        },

        lastSync: '3:42 PM',

        // GPS
        gpsAvailable: false,

        coordinates: null,

        lastKnownCoordinates: [
            14.6728,
            121.0478
        ],

        locationName:
            'Last known near Maginhawa Street',

        gpsAccuracy: null,

        satellites: 0,

        updated: '3:35 PM',

        // Safe zone / geofence
        safeZone: {
            name: 'Home',

            center: [
                14.6728,
                121.0478
            ],

            radius: 100
        },

        safeZoneStatus: null,

        lastKnownSafeZoneStatus:
            'inside',

        // Battery
        battery: 23,

        batteryUpdated:
            '3:42 PM',

        batteryVoltage: 3.62,

        batteryCondition:
            'Low',

        // Activity
        activity: {
            value: 'Resting',
            available: true,
            updated: '3:33 PM'
        },

        activityHistoryDemo: true,

        activityHistory: [
            {
                time: '12 AM',
                activity: 'Resting'
            },
            {
                time: '3 AM',
                activity: 'Walking'
            },
            {
                time: '6 AM',
                activity: 'Resting'
            },
            {
                time: '9 AM',
                activity: 'Walking'
            },
            {
                time: '12 PM',
                activity: 'Resting'
            }
        ],

        subscription: {
            status: 'expired',
            activated: 'Aug 19, 2026',
            expires: 'Sep 19, 2026',
            expiresOn: '2026-09-19',
            validity: '30 Days Validity'
        }
    },


    {
        id: 'bruno',

        name: 'Bruno',
        type: 'Dog',
        photo: placeholderPhotos[2],

        // Collar / connectivity
        collarOnline: false,

        cellular: {
            internetAvailable: false,
            carrier: '',
            network: '',
            signal: 'No Signal'
        },

        lastSync: '2:58 PM',

        // GPS
        gpsAvailable: true,

        coordinates: null,

        lastKnownCoordinates: [
            14.6805,
            121.0384
        ],

        locationName:
            'Last known near University Avenue',

        gpsAccuracy: 4.1,

        satellites: 9,

        updated: '2:58 PM',

        // Safe zone / geofence
        safeZone: {
            name: 'Home',

            center: [
                14.6805,
                121.0384
            ],

            radius: 100
        },

        safeZoneStatus: null,

        lastKnownSafeZoneStatus:
            'inside',

        // Battery
        battery: 61,

        batteryUpdated:
            '2:58 PM',

        batteryVoltage: 3.79,

        batteryCondition:
            'Normal',

        // Activity
        activity: {
            value: 'Resting',
            available: false,
            updated: '2:58 PM'
        },

        activityHistoryDemo: true,

        activityHistory: [
            {
                time: '12 AM',
                activity: 'Resting'
            },
            {
                time: '3 AM',
                activity: 'Resting'
            },
            {
                time: '6 AM',
                activity: 'Walking'
            },
            {
                time: '9 AM',
                activity: 'Walking'
            },
            {
                time: '12 PM',
                activity: 'Resting'
            }
        ]
    }
];


// =====================================================
// PET MANAGEMENT DEMO PROFILES
// =====================================================

const managementPetProfiles = {
    max: {
        breed: 'Golden Retriever',
        gender: 'Male',
        deviceId: 'SC-2026-1048'
    },

    luna: {
        breed: 'Domestic Shorthair',
        gender: 'Female',
        deviceId: 'SC-2026-2195'
    },

    bruno: {
        breed: 'Not specified',
        gender: 'Not specified',
        deviceId: 'SC-2026-3102'
    }
};


// =====================================================
// PET MANAGEMENT DEMO DATA
// =====================================================

const demoPets = liveTrackingPets.map(pet => ({
    // Keep the complete tracking record so Pet Management and Live Tracking
    // use the same GPS, connection, activity, and safe-zone information.
    ...pet,

    id: pet.id,

    name: pet.name,

    type: pet.type,

    photo: pet.photo,

    ...managementPetProfiles[pet.id],

    online:
        hasCollarInternet(pet),

    battery:
        pet.battery,

    safe:
        getDisplayedSafeZoneStatus(pet) === 'inside',

    geofence:
        pet.safeZone.name,

    radius:
        pet.safeZone.radius,

    updated:
        pet.updated,

    location:
        pet.locationName,

    activityHistoryDemo:
        pet.activityHistoryDemo,

    activityHistory:
        pet.activityHistory.map(
            sample => ({
                ...sample
            })
        )
}));


// =====================================================
// DEMO NOTIFICATIONS
// =====================================================

const notifications = [
    {
        id: 1,
        category: 'location',
        icon: 'bi-geo-alt-fill',
        title: 'Geofence alert',
        pet: 'Buddy',

        message:
            'Buddy briefly left the Home safe zone and returned.',

        time:
            'Today, 10:18 AM',

        unread: true
    },

    {
        id: 2,
        category: 'device',
        icon: 'bi-battery-half',
        title: 'Low battery alert',
        pet: 'Luna',

        message:
            'Luna’s collar battery is at 18%. Charge it soon.',

        time:
            'Today, 9:46 AM',

        unread: true
    },

    {
        id: 3,
        category: 'device',
        icon: 'bi-wifi-off',
        title: 'Collar offline alert',
        pet: 'Buddy',

        message:
            'The collar was offline for 4 minutes. Connection restored.',

        time:
            'Today, 8:31 AM',

        unread: true
    },

    {
        id: 8,
        category: 'device',
        icon: 'bi-activity',
        title: 'Activity data unavailable',
        pet: 'Buddy',

        message:
            'Activity classification is temporarily unavailable.',

        time:
            'Aug 21, 4:30 PM',

        unread: false
    },

    {
        id: 9,
        category: 'location',
        icon: 'bi-pin-map',
        title: 'GPS data unavailable',
        pet: 'Luna',

        message:
            'The latest GPS position could not be determined.',

        time:
            'Aug 21, 1:12 PM',

        unread: false
    }
];


export {
    placeholderPhotos,
    liveTrackingPets,
    demoPets,
    notifications
};
