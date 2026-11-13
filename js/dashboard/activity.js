import { $, escapeHtml } from './dom.js';
import { hasCollarInternet } from './pet-status.js';
import {
    getRecordedRouteSummary,
    renderRecordedRouteMap,
    watchRecordedGpsHistory
} from './route-map.js';
import { db } from '../core/firebase-config.js';

import {
    collection,
    doc,
    documentId,
    query,
    where,
    orderBy,
    onSnapshot,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let selectedActivityDate = new Date();
let selectedActivityPetId = null;
let selectedRouteDate = new Date();

// ============================================
// ROUTE HISTORY - FIRESTORE LISTENER STATE
// ============================================

let routeHistoryUnsubscribe = null;
let routeHistoryQueryKey = '';

let activityPets = [];

let activityHistoryRecords = [];
let activityHistoryUnsubscribe = null;
let activityHistoryQueryKey = '';
let activityHistoryStatus = 'idle';

// ============================================
// PAWSENSE PET ACTIVITY - SHARED DEMO DATA
// NOVEMBER 7-12, 2026
// ============================================

// Development testing only.
// No demo records are written to Firestore.
const ACTIVITY_DEMO_ENABLED = true;
const ACTIVITY_DEMO_PET_NAME = 'Milo';

// Each entry contains simulated activity intervals.
// Format: [Activity, Duration in Minutes]

const ACTIVITY_DEMO_DAYS = {

    '2026-11-07': {
        start: '08:00',
        segments: [
            ['Resting', 40],
            ['Walking', 25],
            ['Running', 15],
            ['Resting', 30],
            ['Walking', 20],
            ['Running', 5]
        ]
    },

    '2026-11-08': {
        start: '08:30',
        segments: [
            ['Resting', 45],
            ['Walking', 30],
            ['Running', 10],
            ['Resting', 25],
            ['Walking', 20],
            ['Running', 5]
        ]
    },

    '2026-11-09': {
        start: '07:30',
        segments: [
            ['Resting', 40],
            ['Walking', 20],
            ['Running', 15],
            ['Resting', 30],
            ['Walking', 10]
        ]
    },

    '2026-11-10': {
        start: '09:00',
        segments: [
            ['Resting', 30],
            ['Walking', 20],
            ['Running', 10],
            ['Resting', 25],
            ['Walking', 20],
            ['Running', 15]
        ]
    },

    '2026-11-11': {
        start: '08:15',
        segments: [
            ['Resting', 35],
            ['Walking', 15],
            ['Running', 10],
            ['Resting', 30],
            ['Walking', 20],
            ['Running', 10]
        ]
    },

    '2026-11-12': {
        start: '07:45',
        segments: [
            ['Resting', 45],
            ['Walking', 20],
            ['Running', 5],
            ['Resting', 30],
            ['Walking', 25],
            ['Running', 5]
        ]
    }
};

// ============================================
// GENERATE DEMO HISTORY AND DAILY SUMMARY
// ============================================

function getActivityDemoData(petId, date) {

    if (!ACTIVITY_DEMO_ENABLED || !petId) {
        return null;
    }

    const pet = activityPets.find(
        item => item.id === petId
    );

    // Demo records belong to Milo only.
    if (pet?.name !== ACTIVITY_DEMO_PET_NAME) {
        return null;
    }

    const dateKey = getCalendarDateKey(date);
    const demoDay = ACTIVITY_DEMO_DAYS[dateKey];

    if (!demoDay) return null;

    let cursor = new Date(
        `${dateKey}T${demoDay.start}:00+08:00`
    ).getTime();

    const totals = {
        Resting: 0,
        Walking: 0,
        Running: 0
    };

    const history = demoDay.segments.map(
        ([activity, minutes], index) => {

            const startedAt = new Date(cursor);

            cursor += minutes * 60000;

            const endedAt = new Date(cursor);

            totals[activity] += minutes * 60;

            return {
                id: `demo-${dateKey}-${index + 1}`,
                activity,
                startedAt,
                endedAt,
                durationSeconds: minutes * 60,
                status: 'closed',
                source: 'manual_test',
                isTestData: true,
                time: startedAt.toLocaleTimeString(
                    'en-US',
                    {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                        timeZone: 'Asia/Manila'
                    }
                )
            };
        }
    );

    const daily = {
        date: dateKey,
        timezone: 'Asia/Manila',

        restingSeconds: totals.Resting,
        walkingSeconds: totals.Walking,
        runningSeconds: totals.Running,

        activeSeconds:
            totals.Walking + totals.Running,

        totalRecordedSeconds:
            totals.Resting +
            totals.Walking +
            totals.Running,

        segmentCount: history.length,

        source: 'manual_test',
        isTestData: true
    };

    return {
        history,
        daily
    };
}

// ============================================
// DAILY ACTIVITY SUMMARY - FIRESTORE
// ============================================

let activityDailyData = null;
let activityDailyQueryKey = '';
let activityDailyUnsubscribe = null;

function formatActivitySeconds(seconds) {
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;

    if (hours && remaining) return `${hours}h ${remaining}m`;
    if (hours) return `${hours}h`;
    return `${remaining}m`;
}

function renderActivityDaily() {
    const data = activityDailyData;

    const fields = [
        'restingSeconds',
        'walkingSeconds',
        'runningSeconds'
    ];

    const valid = fields.every(field =>
        typeof data?.[field] === 'number' &&
        Number.isFinite(data[field]) &&
        data[field] >= 0
    );

    const resting = valid ? data.restingSeconds : 0;
    const walking = valid ? data.walkingSeconds : 0;
    const running = valid ? data.runningSeconds : 0;

    const total = resting + walking + running;
    const active = walking + running;

    const values = {
        psDayResting: resting,
        psDayWalking: walking,
        psDayRunning: running,
        psRingDayResting: resting,
        psRingDayWalking: walking,
        psRingDayRunning: running,
        psDailyActiveTime: active
    };

    Object.entries(values).forEach(([id, seconds]) => {
        const element = document.getElementById(id);
        if (!element) return;

        element.textContent = valid
            ? formatActivitySeconds(seconds)
            : '—';
    });

    const ring = document.getElementById('psDailyRing');

    if (ring) {
        if (valid && total > 0) {
            const restingPercent = resting / total * 100;
            const walkingEndPercent =
                (resting + walking) / total * 100;

            ring.style.background = `conic-gradient(
                #6899cb 0% ${restingPercent}%,
                #169f96 ${restingPercent}% ${walkingEndPercent}%,
                #e5aa4f ${walkingEndPercent}% 100%
            )`;
        } else {
            ring.style.background = '';
        }
    }
const ringLabel =
    document.querySelector('#psDailyRing > div > span');

if (ringLabel) {
    const isTestData =
        data?.isTestData === true ||
        data?.source === 'manual_test';

    ringLabel.textContent = isTestData
        ? 'active time · test data'
        : 'active time';
}

// ============================================
// TODAY'S ACTIVITY - RECORDED ACTIVE RANGE
// ============================================

const dailyRangeElement = document.getElementById(
    'psDailyUsualRange'
);

if (dailyRangeElement) {

    const dailyRangeLabel = dailyRangeElement
        .closest('.ps-activity-range')
        ?.querySelector('small');

    const previousActiveSeconds = [];

    const selectedDay = new Date(selectedActivityDate);
    selectedDay.setHours(12, 0, 0, 0);

    // Check up to 14 days BEFORE the selected date.
    for (let offset = 1; offset <= 14; offset++) {

        const previousDate = new Date(selectedDay);

        previousDate.setDate(
            previousDate.getDate() - offset
        );

        // Use Milo's existing simulated history.
        const previousDemo = getActivityDemoData(
            selectedActivityPetId,
            previousDate
        );

        const previousDaily = previousDemo?.daily;

        if (
            previousDaily &&
            Number.isFinite(previousDaily.walkingSeconds) &&
            Number.isFinite(previousDaily.runningSeconds)
        ) {
            previousActiveSeconds.push(
                previousDaily.walkingSeconds +
                previousDaily.runningSeconds
            );
        }
    }

    const recordedDays = previousActiveSeconds.length;

    if (recordedDays > 0) {

        const minimum = Math.min(
            ...previousActiveSeconds
        );

        const maximum = Math.max(
            ...previousActiveSeconds
        );

        // A usual baseline needs at least 7 days.
        if (dailyRangeLabel) {
            dailyRangeLabel.textContent =
                recordedDays >= 7
                    ? 'Usual active-time range'
                    : `Recorded active-time range (${recordedDays} prior days)`;
        }

        dailyRangeElement.textContent =
            minimum === maximum
                ? formatActivitySeconds(minimum)
                : `${formatActivitySeconds(minimum)} – ${formatActivitySeconds(maximum)}`;

    } else {

        if (dailyRangeLabel) {
            dailyRangeLabel.textContent =
                'Usual active-time range';
        }

        dailyRangeElement.textContent =
            'Not established';

    }
}
}

function watchActivityDaily() {
    const petId = selectedActivityPetId;
    const dateKey = getCalendarDateKey(selectedActivityDate);
    const queryKey = petId ? `${petId}|${dateKey}` : '';

    if (activityDailyQueryKey === queryKey) return;

    if (activityDailyUnsubscribe) {
        activityDailyUnsubscribe();
        activityDailyUnsubscribe = null;
    }

        activityDailyQueryKey = queryKey;
    activityDailyData = null;
    renderActivityDaily();

    if (!petId) return;

    // ============================================
    // TODAY'S ACTIVITY - DEMO DATA
    // ============================================

    const demo = getActivityDemoData(
        petId,
        selectedActivityDate
    );

    if (demo) {
        activityDailyData = demo.daily;
        renderActivityDaily();

        return;
    }

    // ============================================
    // NORMAL FIRESTORE DAILY SUMMARY
    // ============================================

    const dailyRef = doc(
        db,
        'pets',
        petId,
        'activityDaily',
        dateKey
    );

    activityDailyUnsubscribe = onSnapshot(
        dailyRef,
        snapshot => {
            if (activityDailyQueryKey !== queryKey) return;

            activityDailyData = snapshot.exists()
                ? snapshot.data()
                : null;

            renderActivityDaily();
        },
        error => {
            if (activityDailyQueryKey !== queryKey) return;

            console.error('Daily activity load failed:', error);

            activityDailyData = null;
            renderActivityDaily();
        }
    );
}
    // ============================================
    // WEEKLY ACTIVITY SUMMARY - FIRESTORE
    // ============================================

    let activityWeeklyRecords = [];
    let activityWeeklyQueryKey = '';
    let activityWeeklyUnsubscribe = null;
    let activityWeeklyStatus = 'idle';

    // ============================================
// WEEKLY ACTIVITY - SIMULATED TEST DATA
// ============================================

// Development testing only.
// Disable before using real Firestore weekly records.
const ACTIVITY_WEEKLY_DEMO_MODE = true;

const ACTIVITY_WEEKLY_DEMO_DATA = [
    {
        dateId: '2026-11-09',
        restingSeconds: 4200,
        walkingSeconds: 1800,
        runningSeconds: 900
    },
    {
        dateId: '2026-11-10',
        restingSeconds: 3300,
        walkingSeconds: 2400,
        runningSeconds: 1500
    },
    {
        dateId: '2026-11-11',
        restingSeconds: 3900,
        walkingSeconds: 2100,
        runningSeconds: 1200
    },
    {
        dateId: '2026-11-12',
        restingSeconds: 4500,
        walkingSeconds: 2700,
        runningSeconds: 600
    },
    {
        dateId: '2026-11-13',
        restingSeconds: 3600,
        walkingSeconds: 3000,
        runningSeconds: 900
    },
    {
        dateId: '2026-11-14',
        restingSeconds: 3300,
        walkingSeconds: 3600,
        runningSeconds: 1500
    },
    {
        dateId: '2026-11-15',
        restingSeconds: 4800,
        walkingSeconds: 1800,
        runningSeconds: 1200
    }
].map(record => ({
    ...record,
    isTestData: true,
    source: 'manual_test'
}));

    // Get Monday to Sunday of the selected week.
    function getSelectedActivityWeek() {
        const monday = new Date(selectedActivityDate);
        monday.setHours(12, 0, 0, 0);

        const offset = (monday.getDay() + 6) % 7;
        monday.setDate(monday.getDate() - offset);

        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + index);

            return {
                date,
                key: getCalendarDateKey(date)
            };
        });
    }

    // Render the weekly activity breakdown.
    function renderActivityWeekly() {
        const week = getSelectedActivityWeek();

        const dateLabel = document.getElementById('psWeeklyDates');
        const weeklyRing = document.getElementById('psWeeklyRing');

        const startLabel = week[0].date.toLocaleDateString(
            'en-US',
            { month: 'short', day: 'numeric' }
        );

        const endLabel = week[6].date.toLocaleDateString(
            'en-US',
            { month: 'short', day: 'numeric', year: 'numeric' }
        );

        const fields = [
            'restingSeconds',
            'walkingSeconds',
            'runningSeconds'
        ];

        const validRecords = activityWeeklyRecords.filter(data =>
            fields.every(field =>
                typeof data?.[field] === 'number' &&
                Number.isFinite(data[field]) &&
                data[field] >= 0
            )
        );

        const totals = validRecords.reduce((result, data) => {
            result.resting += data.restingSeconds;
            result.walking += data.walkingSeconds;
            result.running += data.runningSeconds;

            return result;
        }, {
            resting: 0,
            walking: 0,
            running: 0
        });

        const total =
            totals.resting +
            totals.walking +
            totals.running;

        const active = totals.walking + totals.running;
        const hasData = validRecords.length > 0;

        const hasTestData = validRecords.some(data =>
            data.isTestData === true ||
            data.source === 'manual_test'
        );

        if (dateLabel) {
            const period = `${startLabel} – ${endLabel}`;

            if (activityWeeklyStatus === 'loading') {
                dateLabel.textContent = `${period} · Loading...`;
            } else if (activityWeeklyStatus === 'error') {
                dateLabel.textContent = `${period} · Unable to load`;
            } else {
                dateLabel.textContent =
                    `${period} · ${validRecords.length}/7 days recorded` +
                    (hasTestData ? ' · Test data' : '');
            }
        }

        const values = {
            psWeekResting: totals.resting,
            psWeekWalking: totals.walking,
            psWeekRunning: totals.running,
            psWeeklyActiveTime: active
        };

        Object.entries(values).forEach(([id, seconds]) => {
            const element = document.getElementById(id);

            if (!element) return;

            element.textContent = hasData
                ? formatActivitySeconds(seconds)
                : '—';
        });

        if (weeklyRing) {
            if (hasData && total > 0) {
                const restingPercent =
                    totals.resting / total * 100;

                const walkingEndPercent =
                    (totals.resting + totals.walking) / total * 100;

                weeklyRing.style.background = `conic-gradient(
                    #6899cb 0% ${restingPercent}%,
                    #169f96 ${restingPercent}% ${walkingEndPercent}%,
                    #e5aa4f ${walkingEndPercent}% 100%
                )`;
            } else {
                weeklyRing.style.background = '';
            }
        }

        const ringLabel =
            document.querySelector('#psWeeklyRing > div > span');

if (ringLabel) {
    ringLabel.textContent = hasTestData
        ? 'total active time · test data'
        : 'total active time';
}

// ============================================
// WEEKLY ACTIVITY - RECORDED DAILY RANGE
// ============================================

const weeklyRangeElement = document.getElementById(
    'psWeeklyUsualRange'
);

if (weeklyRangeElement) {

    const weeklyRangeLabel = weeklyRangeElement
        .closest('.ps-activity-range')
        ?.querySelector('small');

    if (weeklyRangeLabel) {
        weeklyRangeLabel.textContent =
            'Daily active range this week';
    }

    const dailyActiveSeconds = validRecords.map(data =>
        data.walkingSeconds + data.runningSeconds
    );

    if (dailyActiveSeconds.length > 0) {

        const minimum = Math.min(...dailyActiveSeconds);
        const maximum = Math.max(...dailyActiveSeconds);

        weeklyRangeElement.textContent =
            minimum === maximum
                ? formatActivitySeconds(minimum)
                : `${formatActivitySeconds(minimum)} – ${formatActivitySeconds(maximum)}`;
    } else {
        weeklyRangeElement.textContent =
            'No recorded activity';
    }
}

// Close renderActivityWeekly()
}

 
    // Listen for the selected week's daily summaries.
    function watchActivityWeekly() {
        const petId = selectedActivityPetId;
        const week = getSelectedActivityWeek();
        const weekKeys = week.map(item => item.key);

        const queryKey = petId
            ? `${petId}|${weekKeys[0]}`
            : '';

        if (activityWeeklyQueryKey === queryKey) return;

        if (activityWeeklyUnsubscribe) {
            activityWeeklyUnsubscribe();
            activityWeeklyUnsubscribe = null;
        }

        activityWeeklyQueryKey = queryKey;
        activityWeeklyRecords = [];
        activityWeeklyStatus = petId ? 'loading' : 'idle';

            renderActivityWeekly();

            if (!petId) return;

            // ============================================
            // WEEKLY ACTIVITY - SHARED DEMO DATA
            // ============================================

            const demoWeeklyRecords = week
                .map(item => {
                    const demo = getActivityDemoData(
                        petId,
                        item.date
                    );

                    return demo?.daily || null;
                })
                .filter(Boolean);

            if (
                ACTIVITY_DEMO_ENABLED &&
                demoWeeklyRecords.length > 0
            ) {
                activityWeeklyRecords = demoWeeklyRecords;
                activityWeeklyStatus = 'ready';

                renderActivityWeekly();

                return;
            }

            // ============================================
            // NORMAL FIRESTORE WEEKLY LISTENER
            // ============================================

            const weeklyQuery = query(
                collection(db, 'pets', petId, 'activityDaily'),
                where(documentId(), 'in', weekKeys)
            );

        activityWeeklyUnsubscribe = onSnapshot(
            weeklyQuery,
            snapshot => {
                if (activityWeeklyQueryKey !== queryKey) return;

                activityWeeklyRecords = snapshot.docs.map(
                    record => record.data()
                );

                activityWeeklyStatus = 'ready';
                renderActivityWeekly();
            },
            error => {
                if (activityWeeklyQueryKey !== queryKey) return;

                console.error(
                    'Weekly activity load failed:',
                    error
                );

                activityWeeklyRecords = [];
                activityWeeklyStatus = 'error';

                renderActivityWeekly();
            }
        );
    }   

function watchActivityHistory() {
    const petId = selectedActivityPetId;
    const dateKey = getCalendarDateKey(selectedActivityDate);
    const queryKey = petId ? `${petId}|${dateKey}` : '';

    if (activityHistoryQueryKey === queryKey) return;

    if (activityHistoryUnsubscribe) {
        activityHistoryUnsubscribe();
        activityHistoryUnsubscribe = null;
    }

        activityHistoryQueryKey = queryKey;
    activityHistoryRecords = [];
    activityHistoryStatus = petId ? 'loading' : 'idle';

    if (!petId) return;

    // ============================================
    // ACTIVITY TIMELINE - DEMO DATA
    // ============================================

    const demo = getActivityDemoData(
        petId,
        selectedActivityDate
    );

    if (demo) {
        activityHistoryRecords = demo.history;
        activityHistoryStatus = 'ready';

        const pet = activityPets.find(
            item => item.id === petId
        );

        if (pet) renderPetActivityViews(pet);

        return;
    }

    // ============================================
    // NORMAL FIRESTORE ACTIVITY HISTORY
    // ============================================

    const dayStart = new Date(`${dateKey}T00:00:00+08:00`);
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    const historyQuery = query(
        collection(db, 'pets', petId, 'activityHistory'),
        where('startedAt', '>=', Timestamp.fromDate(dayStart)),
        where('startedAt', '<', Timestamp.fromDate(dayEnd)),
        orderBy('startedAt', 'asc')
    );

    activityHistoryUnsubscribe = onSnapshot(
        historyQuery,
        snapshot => {
            if (activityHistoryQueryKey !== queryKey) return;

            activityHistoryRecords = snapshot.docs.map(record => {
                const data = record.data();
                const startedAt = data.startedAt?.toDate?.() || null;
                const endedAt = data.endedAt?.toDate?.() || null;

                return {
                    id: record.id,
                    activity: data.activity,
                    startedAt,
                    endedAt,
                    time: startedAt
                        ? startedAt.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                            timeZone: 'Asia/Manila'
                        })
                        : ''
                };
            }).filter(item =>
                ['Resting', 'Walking', 'Running'].includes(item.activity) &&
                item.startedAt instanceof Date &&
                !Number.isNaN(item.startedAt.getTime())
            );

            activityHistoryStatus = 'ready';

            const pet = activityPets.find(item => item.id === petId);
            if (pet) renderPetActivityViews(pet);
        },
        error => {
            if (activityHistoryQueryKey !== queryKey) return;

            console.error('Activity history load failed:', error);
            activityHistoryRecords = [];
            activityHistoryStatus = 'error';

            const pet = activityPets.find(item => item.id === petId);
            if (pet) renderPetActivityViews(pet);
        }
    );
}

export function setActivityPets(pets) {
    activityPets = Array.isArray(pets) ? pets : [];
}

function getCalendarDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getSubscriptionExpiry(pet) {
    const value = pet?.subscription?.expiresOn;
    if (!value) return null;
    const expiry = new Date(`${value}T23:59:59`);
    return Number.isNaN(expiry.getTime()) ? null : expiry;
}

function isAfterSubscriptionExpiry(pet, date) {
    const expiry = getSubscriptionExpiry(pet);
    return Boolean(expiry && new Date(date).getTime() > expiry.getTime());
}

function getActivityCalendarDates() {
    const today = new Date();
    const earliest = new Date(today);
    earliest.setDate(earliest.getDate() - 5);
    earliest.setHours(0, 0, 0, 0);
    if (selectedActivityDate < earliest) today.setTime(selectedActivityDate.getTime());
    today.setHours(12, 0, 0, 0);
    const dates = [];

    for (let offset = -5; offset <= 0; offset += 1) {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);
        dates.push({
            key: getCalendarDateKey(date),
            day: date.getDate(),
            label: date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3).toLowerCase(),
            display: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        });
    }

    return dates;
}

function formatActivityCalendarTitle(date) {
    const currentDate = new Date(date);
    currentDate.setHours(12, 0, 0, 0);
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    return currentDate.toDateString() === today.toDateString()
        ? `Today ${currentDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : currentDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRecordedRouteDate(date) {
    const selectedDate = new Date(date);
    selectedDate.setHours(12, 0, 0, 0);

    const today = new Date();
    today.setHours(12, 0, 0, 0);

    if (selectedDate.toDateString() === today.toDateString()) return 'Today';

    return selectedDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// ============================================
// ROUTE HISTORY - INDEPENDENT PET SELECTION
// ============================================

function getSelectedRoutePet() {
    const activeButton = document.querySelector(
        '#routePetSelector [data-avatar-pet-id].active'
    );

    const petId = activeButton?.dataset.avatarPetId;

    return activityPets.find(
        pet => pet.id === petId
    ) || null;
}

function updateRecordedRouteDate(date, pet = null) {
    const dateLabel = formatRecordedRouteDate(date);
    const routeDateText = $('#recordedRouteDateText');
    const routeDateBadge = $('#recordedRouteDateBadge');
    const tripDateText = $('#tripSummaryDateText');
    const routePanel = $('#history-location');
const unavailable = isAfterSubscriptionExpiry(pet, date);

// ============================================
// ROUTE HISTORY - FIRESTORE REAL-TIME SYNC
// ============================================

const dateKey = getCalendarDateKey(date);

const queryKey = pet?.id
    ? `${pet.id}|${dateKey}`
    : '';

if (routeHistoryQueryKey !== queryKey) {

    // Stop the previous pet/date listener.
    if (routeHistoryUnsubscribe) {
        routeHistoryUnsubscribe();
        routeHistoryUnsubscribe = null;
    }

    routeHistoryQueryKey = queryKey;

    if (queryKey) {

        routeHistoryUnsubscribe =
            watchRecordedGpsHistory(
                pet.id,
                date,
                (records, error) => {

                    // Ignore results from an old selection.
                    if (routeHistoryQueryKey !== queryKey) {
                        return;
                    }

                    if (error) {
                        console.error(
                            'Unable to update GPS Route History:',
                            error
                        );
                        return;
                    }

                    console.log(
                        'FIRESTORE GPS HISTORY LOADED:',
                        pet.name,
                        dateKey,
                        records.length,
                        records
                    );

                    // Refresh route map and trip summary.
                    updateRecordedRouteDate(date, pet);
                }
            );
    }
}


  // ============================================
// ROUTE HISTORY - ALL REGISTERED PETS
// ============================================

// Allow all registered pets to display recorded GPS history.
    const ROUTE_DEMO_MILO_ONLY = false;

    const isMilo = pet?.name?.trim().toLowerCase() === 'milo';

    const routeMap = document.getElementById('recordedRouteMap');
    const routeStops = document.getElementById('recordedRouteStops');

    let emptyState = document.getElementById('routeDemoEmptyState');

    if (ROUTE_DEMO_MILO_ONLY && !isMilo) {

        // Hide any previously displayed Milo route.
        if (routeMap) {
            routeMap.style.display = 'none';

            if (!emptyState) {
                emptyState = document.createElement('div');
                emptyState.id = 'routeDemoEmptyState';
                emptyState.className = 'map-unavailable-state';

                routeMap.insertAdjacentElement(
                    'afterend',
                    emptyState
                );
            }
        }

        if (emptyState) {
            emptyState.hidden = false;
            emptyState.textContent = pet
                ? `No route records available for ${pet.name} on ${dateLabel}.`
                : 'Select a pet to view route history.';
        }

        // Clear previous trip summary.
        routePanel?.querySelectorAll('.trip-stats strong')
            .forEach(element => {
                element.textContent = '—';
            });

        // Clear previous recorded locations.
        if (routeStops) {
            routeStops.innerHTML = `
                <p class="text-muted small mb-0">
                    No recorded route points available.
                </p>
            `;
        }

        if (routeDateText) {
            routeDateText.textContent = pet
                ? `No recorded route for ${pet.name} on ${dateLabel}`
                : 'No pet selected';
        }

        if (routeDateBadge) {
            routeDateBadge.textContent = dateLabel;
        }

        if (tripDateText) {
            tripDateText.textContent = 'No recorded movement';
        }

        return;
    }

    // ============================================
    // MILO - DISPLAY DEMO ROUTE
    // ============================================

    if (routeMap) {
        routeMap.style.display = '';
    }

    if (emptyState) {
        emptyState.hidden = true;
    }

    routePanel?.classList.toggle(
        'route-data-unavailable',
        unavailable
    );

    renderRecordedRouteMap(pet, date, unavailable);

    if (routeDateText) {
        routeDateText.textContent = dateLabel === 'Today'
            ? 'Recorded path for today'
            : `Recorded path for ${dateLabel}`;
    }

    if (routeDateBadge) {
        routeDateBadge.innerHTML = `<i class="bi bi-calendar3"></i> ${dateLabel}`;
    }

    if (tripDateText) {
        tripDateText.textContent = dateLabel === 'Today'
            ? 'Today’s movement'
            : `Movement for ${dateLabel}`;
    }

    if (unavailable) {
        if (routeDateText) routeDateText.textContent = `No route recorded after subscription expired on ${pet.subscription.expires}`;
        if (routeDateBadge) routeDateBadge.innerHTML = '<i class="bi bi-calendar-x"></i> No new data';
        if (tripDateText) tripDateText.textContent = `Last updated ${pet.subscription.expires}`;
    }

    const routeSummary = pet ? getRecordedRouteSummary(pet, date) : null;
    const normalValues = routeSummary
        ? [routeSummary.distance, routeSummary.duration, routeSummary.locations]
        : ['—', '—', '—'];
    routePanel?.querySelectorAll('.trip-stats strong').forEach((element, index) => {
        element.textContent = unavailable ? '\u2014' : normalValues[index];
    });

    // ============================================
    // DISPLAY RECORDED GPS POINTS
    // ============================================

    // Use the existing routeStops variable declared
    // earlier in updateRecordedRouteDate().

    if (routeStops) {

        if (routeSummary?.stops?.length) {

            routeStops.innerHTML = routeSummary.stops
                .map(stop => `
                    <div>
                        <strong>${escapeHtml(stop.name)}</strong>
                        <small>${escapeHtml(stop.detail)}</small>
                    </div>
                `)
                .join('');

        } else {

            routeStops.innerHTML = `
                <p class="text-muted small mb-0">
                    No recorded route points available.
                </p>
            `;
        }
    }
}

function getActivityHistoryForDate(pet, date) {
    if (!pet?.id) return [];

    const key = `${pet.id}|${getCalendarDateKey(date)}`;

    return activityHistoryQueryKey === key
        ? activityHistoryRecords
        : [];
}

function renderActivityCalendar() {
    const container = $('#activityCalendarDays');
    const title = $('#activityCalendarTitle');
    if (!container) return;

    const dates = getActivityCalendarDates();
    const selectedKey = getCalendarDateKey(selectedActivityDate);

    container.innerHTML = dates.map(item => `
        <button type="button" class="calendar-day ${item.key === selectedKey ? 'is-selected' : ''}" data-activity-date="${item.key}" aria-label="View activity for ${item.display}" aria-pressed="${item.key === selectedKey}">
            <small>${item.label}</small>
            <span>${item.day}</span>
        </button>
    `).join('');

    if (title) title.textContent = formatActivityCalendarTitle(selectedActivityDate);
    const picker = $('#activityCalendarPicker');
    if (picker) {
        picker.max = getCalendarDateKey(new Date());
        picker.value = selectedKey;
        picker.onchange = () => {
            if (picker.value && picker.value <= picker.max) {
                selectActivityDate(`${picker.value}T12:00:00`, selectedActivityPetId);
            }
        };
    }
    const todayButton = $('#activityCalendarToday');
    if (todayButton) todayButton.onclick = () => selectActivityDate(new Date(), selectedActivityPetId);
   const selectedPet = getSelectedRoutePet();
    updateRecordedRouteDate(selectedRouteDate, selectedPet);

    // Update Route History when another pet is selected.
    const routePetSelector = document.getElementById('routePetSelector');

    if (routePetSelector) {
        routePetSelector.onclick = event => {
            const button = event.target.closest(
                '[data-avatar-pet-id]'
            );

            if (!button) return;

            const pet = activityPets.find(
                item => item.id === button.dataset.avatarPetId
            ) || null;

            updateRecordedRouteDate(selectedRouteDate, pet);
        };
    }


    // ============================================
    // PET ROUTE HISTORY - CALENDAR DATES
    // ============================================

    const routeCalendarDays = $('#routeCalendarDays');
    const routeCalendarTitle = $('#routeCalendarTitle');

    if (routeCalendarDays) {
        const today = new Date();
        today.setHours(12, 0, 0, 0);

        const routeDates = [];

        for (let offset = -5; offset <= 0; offset++) {
            const date = new Date(today);
            date.setDate(today.getDate() + offset);

            routeDates.push({
                key: getCalendarDateKey(date),
                day: date.getDate(),
                label: date.toLocaleDateString('en-US', {
                    weekday: 'short'
                }).slice(0, 3).toLowerCase(),
                display: date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                })
            });
        }

     const selectedRouteKey = getCalendarDateKey(selectedRouteDate);

        routeCalendarDays.innerHTML = routeDates.map(item => `
            <button type="button"
                class="calendar-day ${item.key === selectedRouteKey ? 'is-selected' : ''}"
                data-route-date="${item.key}"
                aria-label="View route for ${item.display}"
               aria-pressed="${item.key === selectedRouteKey}"
                <small>${item.label}</small>
                <span>${item.day}</span>
            </button>
        `).join('');


        if (routeCalendarTitle) {
            routeCalendarTitle.textContent =
                formatActivityCalendarTitle(today);
        }

        // ============================================
        // ROUTE HISTORY - DATE SELECTION
        // ============================================

        routeCalendarDays.onclick = event => {
            const dateButton = event.target.closest('[data-route-date]');

            if (!dateButton || !routeCalendarDays.contains(dateButton)) {
                return;
            }

            const selectedDate = new Date(
                `${dateButton.dataset.routeDate}T12:00:00`
            );

            if (Number.isNaN(selectedDate.getTime())) {
                return;
            }

            // Update selected calendar date
            routeCalendarDays.querySelectorAll('[data-route-date]').forEach(button => {
                const isSelected = button === dateButton;

                button.classList.toggle('is-selected', isSelected);
                button.setAttribute('aria-pressed', String(isSelected));
            });

            // Update calendar title
            if (routeCalendarTitle) {
            routeCalendarTitle.textContent =
                formatActivityCalendarTitle(selectedRouteDate);
        }

            // Save the selected Route History date.
            selectedRouteDate = selectedDate;

            // Get the pet selected specifically in Route History.
            const routePet = getSelectedRoutePet();

            // Update route map and trip summary.
            updateRecordedRouteDate(selectedRouteDate, routePet);
        };
    }
}


function renderPetAnomalyChart(pet) {
    const container = $('#petAnomalyChart');
    if (!container) return;
    const description = $('#petAnomalyDescription');
    const selectedDateLabel = selectedActivityDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (isAfterSubscriptionExpiry(pet, selectedActivityDate)) {
        if (description) description.textContent = `No new activity after the subscription expired on ${pet.subscription.expires}`;
        container.innerHTML = `<div class="activity-chart-empty"><i class="bi bi-calendar-x" aria-hidden="true"></i><strong>No activity recorded for this date</strong><span>${escapeHtml(pet.name)}'s activity stopped updating when the data subscription expired on ${escapeHtml(pet.subscription.expires)}.</span></div>`;
        return;
    }
    if (description) description.textContent = `Activity changes for ${pet.name} on ${selectedDateLabel}${pet.activityHistoryDemo ? ' · Prototype history' : ''}`;

    const activityLevels = { Resting: 200, Walking: 110, Running: 20 };
    const history = getActivityHistoryForDate(pet, selectedActivityDate).filter(sample => sample && Object.hasOwn(activityLevels, sample.activity) && typeof sample.time === 'string' && sample.time.trim());

        // Identify simulated timeline records.
    const hasDemoHistory = history.some(
        record => record.isTestData === true
    );

    if (hasDemoHistory && description) {
        description.textContent =
            `Simulated activity for ${pet.name} on ${selectedDateLabel} · Test data`;
    }
    if (!history.length) {
            // Restore the default 24-hour labels when no data exists.
    const defaultHours = [
        '12 AM',
        '6 AM',
        '12 PM',
        '6 PM',
        '12 AM'
    ];

    document.querySelectorAll(
        '#health-activity .ps-activity-hours span'
    ).forEach((element, index) => {
        element.textContent = defaultHours[index] || '';
    });

    // Reset daily activity values when no history is available.
    [
        'psDayResting',
        'psDayWalking',
        'psDayRunning',
        'psRingDayResting',
        'psRingDayWalking',
        'psRingDayRunning',
        'psDailyActiveTime'
    ].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = '—';
    });

    // Reset daily activity ring.
    const emptyDailyRing = document.getElementById('psDailyRing');

    if (emptyDailyRing) {
        emptyDailyRing.style.background = '';
    }

    // Determine Firestore activity history status.
    const emptyMessage = activityHistoryStatus === 'loading'
        ? 'Loading activity records...'
        : activityHistoryStatus === 'error'
            ? 'Unable to load activity history.'
            : 'No activity records for this date.';

    const emptyTitle = activityHistoryStatus === 'loading'
        ? 'Loading Activity'
        : activityHistoryStatus === 'error'
            ? 'Activity History Unavailable'
            : 'No Activity Records';

    // Display the appropriate message.
    container.innerHTML = `
        <div class="activity-chart-empty">
            <i class="bi bi-activity" aria-hidden="true"></i>
            <strong>${emptyTitle}</strong>
            <span>${emptyMessage}</span>
        </div>
    `;

    return;
}
    
    // ============================================
    // TODAY'S ACTIVITY - TIMELINE SYNCHRONIZATION
    // ============================================

    const activityDurations = {
        Resting: 0,
        Walking: 0,
        Running: 0
    };

    // Calculate only verified, closed activity intervals.
    const dayKey = getCalendarDateKey(selectedActivityDate);
    const dayStartMs = new Date(`${dayKey}T00:00:00+08:00`).getTime();
    const dayEndMs = dayStartMs + 86400000;

    for (const record of history) {
        if (!(record.endedAt instanceof Date)) continue;

        const startMs = Math.max(
            record.startedAt.getTime(),
            dayStartMs
        );

        const endMs = Math.min(
            record.endedAt.getTime(),
            dayEndMs
        );

        if (endMs <= startMs) continue;

        activityDurations[record.activity] +=
            (endMs - startMs) / 60000;
    }

    const recordedMinutes = Object.values(
        activityDurations
    ).reduce((sum, minutes) => sum + minutes, 0);

    const activeMinutes =
        activityDurations.Walking +
        activityDurations.Running;

    function formatDuration(minutes) {
        const wholeMinutes = Math.round(Math.max(0, minutes));
        const hours = Math.floor(wholeMinutes / 60);
        const remaining = wholeMinutes % 60;

        if (hours && remaining) return `${hours}h ${remaining}m`;
        if (hours) return `${hours}h`;
        return `${remaining}m`;
    }

    function updateDailyValue(id, minutes) {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = recordedMinutes > 0
                ? formatDuration(minutes)
                : '—';
        }
    }
    updateDailyValue('psDayResting', activityDurations.Resting);
    updateDailyValue('psDayWalking', activityDurations.Walking);
    updateDailyValue('psDayRunning', activityDurations.Running);
    updateDailyValue('psRingDayResting', activityDurations.Resting);
    updateDailyValue('psRingDayWalking', activityDurations.Walking);
    updateDailyValue('psRingDayRunning', activityDurations.Running);
    updateDailyValue('psDailyActiveTime', activeMinutes);

    // ============================================
    // UPDATE TODAY'S ACTIVITY DONUT GRAPH
    // ============================================

    const dailyRing = document.getElementById('psDailyRing');

    if (dailyRing) {
        if (recordedMinutes > 0) {
            const restingPercent =
                activityDurations.Resting / recordedMinutes * 100;

            const walkingEndPercent =
                (activityDurations.Resting + activityDurations.Walking)
                / recordedMinutes * 100;

            dailyRing.style.background = `conic-gradient(
                #6899cb 0% ${restingPercent}%,
                #169f96 ${restingPercent}% ${walkingEndPercent}%,
                #e5aa4f ${walkingEndPercent}% 100%
            )`;
        } else {
            dailyRing.style.background = '';
        }
    }

                // ============================================
    // ACTIVITY TIMELINE - CLEAN TIME-BASED GRAPH
    // ============================================

    // Identify the recorded time window.
    const startTimes = history.map(
        record => record.startedAt.getTime()
    );

    const endTimes = history.map(record =>
        record.endedAt instanceof Date
            ? record.endedAt.getTime()
            : record.startedAt.getTime()
    );

    const intervalMs = 30 * 60 * 1000;

    const firstTime = Math.min(...startTimes);
    const lastTime = Math.max(...endTimes);

    // Add 30-minute padding around recorded activities.
    const viewStartMs = Math.max(
        dayStartMs,
        Math.floor(
            (firstTime - intervalMs) / intervalMs
        ) * intervalMs
    );

    const viewEndMs = Math.min(
        dayEndMs,
        Math.max(
            viewStartMs + 60 * 60 * 1000,
            Math.ceil(
                (lastTime + intervalMs) / intervalMs
            ) * intervalMs
        )
    );

    const viewDurationMs = viewEndMs - viewStartMs;

    // Convert timestamp into horizontal graph position.
    const getX = timestamp => {
        const progress =
            (timestamp - viewStartMs) / viewDurationMs;

        return Math.max(
            0,
            Math.min(1000, progress * 1000)
        );
    };

    // Position each activity in its corresponding row.
    const activityRows = {
        Running: 30,
        Walking: 110,
        Resting: 190
    };

    const activityColors = {
        Running: '#e5aa4f',
        Walking: '#169f96',
        Resting: '#6899cb'
    };

    const formatTime = timestamp =>
        new Date(timestamp).toLocaleTimeString(
            'en-US',
            {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: 'Asia/Manila'
            }
        );

    // Update the existing time labels below the graph.
   // ============================================
// ACTIVITY TIMELINE - ACCURATE TIME AXIS
// ============================================

const timeAxis = document.querySelector(
    '#health-activity .ps-activity-hours'
);

if (timeAxis) {

    // Display time labels every 30 minutes.
    const intervalMs = 30 * 60 * 1000;

    const firstTick =
        Math.ceil(viewStartMs / intervalMs) * intervalMs;

    const timeLabels = [];

    for (
        let tick = firstTick;
        tick <= viewEndMs;
        tick += intervalMs
    ) {

        // Match the position used by the activity bars.
        const position =
            ((tick - viewStartMs) / viewDurationMs) * 100;

        const alignment =
            position <= 0
                ? 'translateX(0)'
                : position >= 100
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)';

        timeLabels.push(`
            <span style="
                position: absolute;
                left: ${position}%;
                top: 0;
                transform: ${alignment};
                white-space: nowrap;
                font-size: 11px;
                font-weight: 600;
            ">
                ${formatTime(tick)}
            </span>
        `);
    }

    timeAxis.style.display = 'block';
    timeAxis.style.position = 'relative';
    timeAxis.style.height = '28px';
    timeAxis.style.overflow = 'visible';

    timeAxis.innerHTML = timeLabels.join('');
}
    // Generate one horizontal segment per activity interval.
   // ============================================
// ACTIVITY TIMELINE - TRANSITION CONNECTORS
// ============================================

const orderedHistory = [...history].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
);

const transitionConnectors = orderedHistory
    .slice(1)
    .map((current, index) => {

        const previous = orderedHistory[index];

        if (
            !(previous.endedAt instanceof Date) ||
            !(current.startedAt instanceof Date)
        ) {
            return '';
        }

        const previousEnd = previous.endedAt.getTime();
        const currentStart = current.startedAt.getTime();

        // Only connect consecutive activities.
        // Do not connect gaps or overlapping records.
        if (Math.abs(currentStart - previousEnd) > 1000) {
            return '';
        }

        const x = getX(currentStart);

        const fromY = activityRows[previous.activity] + 10;
        const toY = activityRows[current.activity] + 10;

        if (
            !Number.isFinite(fromY) ||
            !Number.isFinite(toY)
        ) {
            return '';
        }

        return `
            <line
                x1="${x}"
                y1="${fromY}"
                x2="${x}"
                y2="${toY}"
                stroke="#557a7a"
                stroke-width="2.5"
                stroke-opacity="0.8"
                stroke-dasharray="5 4"
            >
                <title>
                    ${escapeHtml(previous.activity)} ended at ${formatTime(previousEnd)}.
                    ${escapeHtml(current.activity)} started at ${formatTime(currentStart)}.
                </title>
            </line>
        `;

    })
    .join('');
// ============================================
// ACTIVITY TIMELINE - ACTIVITY BARS
// ============================================

const activityBars = history.map(record => {

    if (!(record.startedAt instanceof Date)) {
        return '';
    }

    const startMs = record.startedAt.getTime();

    const endMs = record.endedAt instanceof Date
        ? record.endedAt.getTime()
        : startMs;

    const x = getX(startMs);
    const endX = getX(endMs);

    const width = Math.min(
        1000 - x,
        Math.max(4, endX - x)
    );

    const y = activityRows[record.activity];
    const color = activityColors[record.activity];

    if (
        !Number.isFinite(y) ||
        !color ||
        endMs <= startMs
    ) {
        return '';
    }

    return `
    <rect
        x="${x}"
        y="${y}"
        width="${width}"
        height="20"
        rx="6"
        fill="${color}"
        opacity="0.95"
    >
        <title>
            ${escapeHtml(record.activity)}
            ${formatTime(startMs)} -
            ${formatTime(endMs)}
        </title>
    </rect>
`;

}).join('');
    // Render a single graph without duplicate activity labels.
    container.innerHTML = `
        <svg
            viewBox="0 0 1000 240"
            preserveAspectRatio="none"
            role="img"
            aria-label="Activity timeline for ${escapeHtml(pet.name)} on ${escapeHtml(selectedDateLabel)}"
            style="display:block;width:100%;height:240px;"
        >
            ${[0, 250, 500, 750, 1000].map(x => `
                <line
                    x1="${x}"
                    y1="0"
                    x2="${x}"
                    y2="240"
                    stroke="#dce9e6"
                    stroke-width="1"
                    stroke-dasharray="4 5"
                />
            `).join('')}

            ${[80, 160].map(y => `
                <line
                    x1="0"
                    y1="${y}"
                    x2="1000"
                    y2="${y}"
                    stroke="#dce9e6"
                    stroke-width="1"
                />
            `).join('')}

           ${transitionConnectors}
            ${activityBars}
        </svg>

        <p class="activity-chart-note">
            <i class="bi bi-info-circle" aria-hidden="true"></i>
            <span>
                ${hasDemoHistory ? 'Simulated activity data. ' : ''}
                Activity changes only—not an automatic anomaly diagnosis.
            </span>
        </p>
    `;
// ============================================
// ACTIVITY TIMELINE - CLEAN 30-MINUTE TIME AXIS
// ============================================

const activityTimeAxis = document.querySelector(
    '#health-activity .ps-activity-hours'
);

if (activityTimeAxis) {

    // Always display time at 30-minute intervals.
    const intervalMs = 30 * 60 * 1000;

    const firstTick =
        Math.ceil(viewStartMs / intervalMs) * intervalMs;

    const timeLabels = [];

    for (
        let tick = firstTick;
        tick <= viewEndMs;
        tick += intervalMs
    ) {

        // Same horizontal scale used by activity bars.
        const position = getX(tick) / 10;

        // Use short labels: 7:00, 7:30, 8:00...
        const timeText = formatTime(tick)
            .replace(/\s*(AM|PM)$/i, '');

        const alignment =
            position <= 2
                ? 'translateX(0)'
                : position >= 98
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)';

        timeLabels.push(`
            <span style="
                position: absolute;
                left: ${position}%;
                top: 0;
                transform: ${alignment};

                white-space: nowrap;
                font-size: 11px;
                font-weight: 600;
                color: #607b7c;
                line-height: 1.4;
            ">
                ${timeText}
            </span>
        `);
    }

    // One clean row only.
    activityTimeAxis.style.display = 'block';
    activityTimeAxis.style.position = 'relative';
    activityTimeAxis.style.height = '26px';
    activityTimeAxis.style.overflow = 'visible';

    // Remove all previous timestamps.
    activityTimeAxis.innerHTML = timeLabels.join('');
}
    // ============================================
      // One clean row only.
    activityTimeAxis.style.display = 'block';
    activityTimeAxis.style.position = 'relative';
    activityTimeAxis.style.height = '26px';
    activityTimeAxis.style.overflow = 'visible';

    // Remove all previous timestamps.
    activityTimeAxis.innerHTML = timeLabels.join('');
}

// Closes renderPetAnomalyChart()
// ============================================
// ACTIVITY PATTERN - SIMULATED BASELINE
// ============================================

function renderActivityPatternDemo(pet) {

    const demo = getActivityDemoData(
        pet?.id,
        selectedActivityDate
    );

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    const activityTypes = [
        'Resting',
        'Walking',
        'Running',
        'Active'
    ];

    // Reset when there is no demo data.
    if (!demo) {
        setText(
            'psActivityPatternStatus',
            'Baseline not established'
        );

        setText(
            'psActivityPatternDescription',
            'A pet-specific baseline is needed before activity patterns can be compared.'
        );

        activityTypes.forEach(type => {
            setText(`psPattern${type}Today`, '—');
            setText(`psPattern${type}Range`, 'Not established');
            setText(`psPattern${type}Trend`, '—');
        });

        return;
    }

    // ============================================
    // SIMULATED USUAL ACTIVITY RANGES
    // ============================================

    // These are illustrative ranges only.
    // They are NOT derived from a verified baseline.

    const demoBaseline = {
        Resting: {
            min: 60 * 60,
            max: 75 * 60
        },
        Walking: {
            min: 35 * 60,
            max: 50 * 60
        },
        Running: {
            min: 10 * 60,
            max: 20 * 60
        },
        Active: {
            min: 50 * 60,
            max: 70 * 60
        }
    };

    const daily = demo.daily;

    const activityValues = {
        Resting: daily.restingSeconds,
        Walking: daily.walkingSeconds,
        Running: daily.runningSeconds,
        Active: daily.activeSeconds
    };

    // ============================================
    // COMPARE SELECTED DAY WITH DEMO BASELINE
    // ============================================

    activityTypes.forEach(type => {

        const seconds = activityValues[type];
        const baseline = demoBaseline[type];

        let trend = 'Within usual';

        if (seconds < baseline.min) {
            trend = 'Below usual';
        } else if (seconds > baseline.max) {
            trend = 'Above usual';
        }

        setText(
            `psPattern${type}Today`,
            formatActivitySeconds(seconds)
        );

        setText(
            `psPattern${type}Range`,
            `${formatActivitySeconds(baseline.min)} – ${formatActivitySeconds(baseline.max)}`
        );

        setText(
            `psPattern${type}Trend`,
            trend
        );
    });

    // ============================================
    // DISPLAY DEMO BASELINE STATUS
    // ============================================

    setText(
        'psActivityPatternStatus',
        'Demo comparison · Test data'
    );

    setText(
        'psActivityPatternDescription',
        'Simulated activity comparison for interface testing. These usual ranges are not an established pet-specific baseline.'
    );
}

function renderPetActivityViews(pet) {
    renderPetAnomalyChart(pet);
    renderActivityDaily();
    renderActivityPatternDemo(pet);
}

function updateActivityData(petId){
    const pet = activityPets.find(item => item.id === petId);
    if (!pet) return;
    selectedActivityPetId = petId;
    watchActivityHistory();
    watchActivityDaily();
    watchActivityWeekly();
    const subscriptionNotice = $('#activitySubscriptionNotice');
    const subscriptionExpired = String(pet.subscription?.status || '').toLowerCase() === 'expired';
    if (subscriptionNotice) subscriptionNotice.hidden = !subscriptionExpired;
    const activitySection = $('#health-activity');
    activitySection?.classList.toggle('subscription-expired', subscriptionExpired);
    activitySection?.querySelectorAll('.data-notice, :scope > .row, .history-block').forEach(element => {
        element.inert = subscriptionExpired;
        element.setAttribute('aria-disabled', String(subscriptionExpired));
    });
    const online = hasCollarInternet(pet);
    const hasRecord = typeof pet.activity?.value === 'string' && pet.activity.value.trim() && !['unavailable', 'unknown'].includes(pet.activity.value.trim().toLowerCase());
    const liveActivity = Boolean(!subscriptionExpired && online && hasRecord && pet.activity?.available);
    const timestamp = subscriptionExpired ? pet.subscription.expires : hasRecord && pet.activity?.updated ? pet.activity.updated : 'Timestamp not recorded';
    const currentActivityElement = $('#currentActivity');
    if (currentActivityElement) currentActivityElement.textContent = hasRecord ? pet.activity.value : 'No activity recorded';
    $('#activityUpdated').textContent = timestamp;
    const setText = (selector, value) => { const element = $(selector); if (element) element.textContent = value; };
    setText('#activityStatusLabel', subscriptionExpired ? 'Last recorded activity' : liveActivity ? 'Current activity' : hasRecord ? 'Last activity' : 'Activity');
    setText('#activityRecordedTime', hasRecord ? `${liveActivity ? 'Updated' : 'Last recorded'} ${timestamp}` : 'No activity received yet');
    setText('#activityStateBadge', subscriptionExpired ? 'Expired' : liveActivity ? 'Live' : hasRecord ? 'Last recorded' : 'No data');
    const activityBadge = $('#activityStateBadge');
    if (activityBadge) activityBadge.className = `soft-badge ${subscriptionExpired ? 'danger' : liveActivity ? 'info' : 'neutral'}`;
    setText('#activityCollarBadge', online ? 'Online' : 'Offline');
    const collarBadge = $('#activityCollarBadge');
    if (collarBadge) collarBadge.className = `soft-badge ${online ? 'success' : 'danger'}`;
    setText('#activityCollarStatus', online ? 'Connected' : 'Offline');
    setText('#activityCollarReadings', `Signal: ${pet.cellular?.signal || 'No Signal'} · ${online ? 'Battery' : 'Last battery'} ${pet.battery}%`);
    const signalBars = $('#activitySignalBars');
    if (signalBars) signalBars.classList.toggle('offline', !online);
    renderPetActivityViews(pet);
    updateRecordedRouteDate(selectedActivityDate, pet);
}

export function selectActivityDate(date, petId) {
    const nextDate = new Date(date);
    if (Number.isNaN(nextDate.getTime())) return;

    selectedActivityDate = nextDate;
    selectedActivityPetId = petId;
    renderActivityCalendar();
    watchActivityHistory();
    watchActivityDaily();
    watchActivityWeekly();
    const pet = activityPets.find(item => item.id === petId) || activityPets[0];
    if (pet) renderPetActivityViews(pet);
}

export { renderActivityCalendar, updateActivityData };
