import { liveTrackingPets } from './demo-data.js';
import { $, escapeHtml } from './dom.js';
import { hasCollarInternet } from './pet-status.js';

let selectedActivityDate = new Date();

function getActivityCalendarDates() {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const dates = [];

    for (let offset = -5; offset <= 0; offset += 1) {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);
        dates.push({
            key: date.toISOString().slice(0, 10),
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

function getActivityHistoryForDate(pet, date) {
    const baseHistory = Array.isArray(pet?.activityHistory) && pet.activityHistory.length
        ? pet.activityHistory.filter(sample => sample && typeof sample.time === 'string' && sample.time.trim() && Object.hasOwn({ Resting: 1, Walking: 1, Running: 1 }, sample.activity))
        : [
            { time: '12 AM', activity: 'Resting' },
            { time: '3 AM', activity: 'Resting' },
            { time: '6 AM', activity: 'Walking' },
            { time: '9 AM', activity: 'Running' },
            { time: '12 PM', activity: 'Walking' }
        ];

    const keyDate = new Date(date);
    keyDate.setHours(12, 0, 0, 0);
    const seed = [...keyDate.toISOString().slice(0, 10)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const rotation = seed % Math.max(1, baseHistory.length);

    return baseHistory.map((sample, index) => ({
        ...sample,
        activity: baseHistory[(index + rotation) % baseHistory.length].activity,
        time: sample.time
    }));
}

function renderActivityCalendar() {
    const container = $('#activityCalendarDays');
    const title = $('#activityCalendarTitle');
    if (!container) return;

    const dates = getActivityCalendarDates();
    const selectedKey = selectedActivityDate.toISOString().slice(0, 10);

    container.innerHTML = dates.map(item => `
        <button type="button" class="calendar-day ${item.key === selectedKey ? 'is-selected' : ''}" data-activity-date="${item.key}" aria-label="View activity for ${item.display}" aria-pressed="${item.key === selectedKey}">
            <span>${item.day}</span>
            <small>${item.label}</small>
        </button>
    `).join('');

    if (title) title.textContent = formatActivityCalendarTitle(selectedActivityDate);
}

function renderPetAnomalyChart(pet) {
    const container = $('#petAnomalyChart');
    if (!container) return;
    const description = $('#petAnomalyDescription');
    const selectedDateLabel = selectedActivityDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (description) description.textContent = `Activity changes for ${pet.name} on ${selectedDateLabel}${pet.activityHistoryDemo ? ' · Prototype history' : ''}`;

    const activityLevels = { Resting: 200, Walking: 110, Running: 20 };
    const history = getActivityHistoryForDate(pet, selectedActivityDate).filter(sample => sample && Object.hasOwn(activityLevels, sample.activity) && typeof sample.time === 'string' && sample.time.trim());

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
                    <svg viewBox="0 0 720 220" preserveAspectRatio="none" role="img" aria-label="Activity history for ${escapeHtml(pet.name)} on ${escapeHtml(selectedDateLabel)}. ${escapeHtml(accessibleHistory)}">
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

function updateActivityData(petId){
    const pet = liveTrackingPets.find(item => item.id === petId);
    if (!pet) return;
    const online = hasCollarInternet(pet);
    const hasRecord = typeof pet.activity?.value === 'string' && pet.activity.value.trim() && !['unavailable', 'unknown'].includes(pet.activity.value.trim().toLowerCase());
    const liveActivity = Boolean(online && hasRecord && pet.activity?.available);
    const timestamp = hasRecord && pet.activity?.updated ? pet.activity.updated : 'Timestamp not recorded';
    $('#currentActivity').textContent = hasRecord ? pet.activity.value : 'No activity recorded'; $('#activityUpdated').textContent = timestamp;
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

export function selectActivityDate(date, petId) {
    selectedActivityDate = date;
    renderActivityCalendar();
    const pet = liveTrackingPets.find(item => item.id === petId) || liveTrackingPets[0];
    if (pet) renderPetAnomalyChart(pet);
}

export { renderActivityCalendar, updateActivityData };
