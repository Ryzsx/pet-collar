import {
    auth,
    signOut,
    onAuthStateChanged,
    getUserData
} from '../js/firebase-init.js';
import { $, $$, showToast } from './dashboard/dom.js';
import { renderActivityCalendar, selectActivityDate } from './dashboard/activity.js';
import { hasLiveMap, getSelectedLivePetId, refreshLiveMapLayout, initializeLiveTracking, attachLiveTrackingEvents } from './dashboard/live-tracking.js';
import { setPetManagementUser, renderAllPets, loadUserPets, attachPetManagementEvents } from './dashboard/pet-management.js';
import { renderNotifications, attachNotificationEvents } from './dashboard/notifications.js';
import { setSettingsUser, setUserInterface, updateConnectionStatus, attachSettingsEvents } from './dashboard/settings.js';


const pageMeta = {
    'live-tracking': ['Live Tracking', 'Track your pet’s current location, safe-zone status, and live collar information.'],
    'health-activity': ['Activity Monitoring', 'View your pet’s activity history and wellness information.'],
    'pet-management': ['Pet Management', 'Manage your pet profiles, collar details, and safe-zone settings.'],
    notifications: ['Notifications', 'Check important alerts and updates from your pet’s collar.'],
    settings: ['Settings', 'Manage your account, security, and notification preferences.']
};

let liveClockTimer = null;

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
    const visibleSectionId = sectionId === 'history' ? 'health-activity' : sectionId;
    if (!pageMeta[visibleSectionId]) return;
    $$('.dashboard-section').forEach(section => section.classList.toggle('active', section.id === visibleSectionId));
    $$('.sidebar-nav [data-section]').forEach(button => button.classList.toggle('active', button.dataset.section === visibleSectionId));

    $$('#pageHeaderContent [data-header-section]').forEach(header => {
        header.hidden = header.dataset.headerSection !== visibleSectionId;
    });

    history.replaceState(null, '', `#${sectionId}`);
    $('.dashboard-main')?.scrollTo({ top: 0, behavior: 'instant' });
    closeSidebar();
    if (sectionId === 'history') {
        $('.history-block')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    if (visibleSectionId === 'live-tracking' && hasLiveMap()) {
        setTimeout(refreshLiveMapLayout, 50);
    }
}

function attachStaticEvents() {
    $$('.sidebar-nav [data-section]').forEach(button => button.addEventListener('click', () => showSection(button.dataset.section)));
    $('#sidebarToggle')?.addEventListener('click', toggleSidebar);
    $('#sidebarLogoToggle')?.addEventListener('click', toggleSidebar);
    $('#mobileLogoToggle')?.addEventListener('click', openSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeSidebar);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) updateLiveDateTime();
    });

    document.addEventListener('click', event => {
        const activityDateTarget = event.target.closest('[data-activity-date]');
        if (activityDateTarget) {
            selectActivityDate(new Date(`${activityDateTarget.dataset.activityDate}T12:00:00`), getSelectedLivePetId());
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeSidebar();
    });

    $$('.history-type-tabs [data-history-type]').forEach(button => button.addEventListener('click', () => {
        $$('.history-type-tabs button').forEach(item => item.classList.toggle('active', item === button));
        $$('.history-panel').forEach(panel => panel.classList.toggle('active', panel.id === `history-${button.dataset.historyType}`));
    }));
    $('#historyRange')?.addEventListener('change', event => showToast(`${event.target.options[event.target.selectedIndex].text} selected.`, 'bi-calendar-check'));

    window.addEventListener('resize', handleSidebarViewportChange);
}

initializePageHeaders();
attachStaticEvents();
attachPetManagementEvents();
attachLiveTrackingEvents();
attachNotificationEvents();
attachSettingsEvents();
syncSidebarForViewport();
renderAllPets();
renderNotifications();
updateConnectionStatus();
updateLiveDateTime();
renderActivityCalendar();
initializeLiveTracking();

const initialSection = location.hash.slice(1);

showSection(
    initialSection === 'history' || pageMeta[initialSection]
        ? initialSection
        : 'live-tracking'
);

onAuthStateChanged(auth, async user => {

    // ==================================================
    // USER MUST BE LOGGED IN
    // ==================================================

    if (!user) {
        window.location.href = '../pages/login.html';
        return;
    }


    // ==================================================
    // USER MUST HAVE VERIFIED EMAIL
    // ==================================================

    if (!user.emailVerified) {
        await signOut();
        window.location.href = '../pages/login.html';
        return;
    }


    // ==================================================
    // PROVIDE AUTH USER TO EXISTING MODULES
    // ==================================================

    setSettingsUser(user);
    setPetManagementUser(user);


    // ==================================================
    // DEFAULT USER INFORMATION
    // ==================================================

    let name =
        user.displayName ||
        user.email?.split('@')[0] ||
        'User';

    let profileEmail =
        user.email || '';


    // ==================================================
    // LOAD REAL USER PROFILE FROM FIRESTORE
    // ==================================================

    try {

        const result =
            await getUserData(user.uid);

        if (result?.success && result.data) {

            const profile = result.data;

            console.log(
                'REAL FIRESTORE USER:',
                profile
            );

            /*
             * Display priority:
             *
             * 1. fullName
             * 2. username
             * 3. Firebase displayName
             * 4. email prefix
             */

            name =
                profile.fullName ||
                profile.username ||
                user.displayName ||
                user.email?.split('@')[0] ||
                'User';


            profileEmail =
                profile.email ||
                user.email ||
                '';
        }

    }
    catch (error) {

        console.warn(
            'User profile details were unavailable.',
            error
        );
    }


    // ==================================================
    // UPDATE USER INTERFACE
    // ==================================================

    setUserInterface(
        name,
        profileEmail,
        user.photoURL || ''
    );


    // ==================================================
    // KEEP EXISTING LOCAL STORAGE VALUES
    // ==================================================

    localStorage.setItem(
        'lastUserEmail',
        profileEmail
    );

    localStorage.setItem(
        'lastUserName',
        name
    );

    localStorage.setItem(
        'lastUserAvatar',
        user.photoURL || ''
    );


    // ==================================================
    // LOAD PETS FOR THIS REAL USER
    // ==================================================

    await loadUserPets(user.uid);
});
