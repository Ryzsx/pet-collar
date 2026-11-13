import { signOut } from '../firebase-init.js';

const logoutButtons = document.querySelectorAll('[data-logout-action]');
const logoutConfirmPanel = document.getElementById('logoutConfirmPanel');
const confirmLogoutButton = document.getElementById('confirmLogoutBtn');
const cancelLogoutButton = document.getElementById('cancelLogoutBtn');
let logoutInProgress = false;
let logoutTrigger = null;

function closeLogoutDialog() {
    if (!logoutConfirmPanel || logoutInProgress) return;
    logoutConfirmPanel.hidden = true;
    logoutTrigger?.focus();
}

logoutButtons.forEach(button => button.addEventListener('click', () => {
    if (logoutInProgress || !logoutConfirmPanel) return;
    logoutTrigger = button;
    logoutConfirmPanel.hidden = false;
    confirmLogoutButton?.focus();
}));

cancelLogoutButton?.addEventListener('click', () => {
    closeLogoutDialog();
});

logoutConfirmPanel?.addEventListener('click', event => {
    if (event.target === logoutConfirmPanel) closeLogoutDialog();
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && logoutConfirmPanel && !logoutConfirmPanel.hidden) closeLogoutDialog();
});

confirmLogoutButton?.addEventListener('click', async () => {
    if (logoutInProgress) return;

    logoutInProgress = true;
    confirmLogoutButton.disabled = true;
    cancelLogoutButton.disabled = true;
    confirmLogoutButton.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Logging out';
    document.documentElement.dataset.loggingOut = 'true';

    try {
        const result = await signOut();
        if (!result?.success) throw new Error(result?.message || result?.error || 'Sign out failed');
        window.location.replace('../index.html');
    } catch (error) {
        console.error('Logout failed:', error);
        delete document.documentElement.dataset.loggingOut;
        logoutInProgress = false;
        confirmLogoutButton.disabled = false;
        cancelLogoutButton.disabled = false;
        confirmLogoutButton.textContent = 'Yes, logout';
        window.alert('Could not log out. Please check your connection and try again.');
    }
});
// ============================================
// PAWSENSE - SIDEBAR PROFILE DROPDOWN
// ============================================

const sidebarProfile = document.querySelector(
    '.sidebar-footer .sidebar-user'
);

const sidebarProfileMenu = document.getElementById(
    'sidebarProfileMenu'
);

if (sidebarProfile && sidebarProfileMenu) {

    sidebarProfile.setAttribute('role', 'button');
    sidebarProfile.setAttribute('tabindex', '0');
    sidebarProfile.setAttribute('aria-controls', 'sidebarProfileMenu');
    sidebarProfile.setAttribute('aria-expanded', 'false');

    function toggleProfileMenu(open) {
        sidebarProfileMenu.hidden = !open;
        sidebarProfile.setAttribute(
            'aria-expanded',
            String(open)
        );
    }

    // Click the profile to open or close the menu.
    sidebarProfile.addEventListener('click', event => {

        if (event.target.closest('[data-logout-action]')) {
            return;
        }

        toggleProfileMenu(sidebarProfileMenu.hidden);
    });

    // Keyboard support.
    sidebarProfile.addEventListener('keydown', event => {

        if (event.target !== sidebarProfile) return;

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleProfileMenu(sidebarProfileMenu.hidden);
        }
    });

    // Close when clicking outside the profile.
    document.addEventListener('click', event => {

        if (!event.target.closest('.sidebar-footer')) {
            toggleProfileMenu(false);
        }
    });

    // Close using Escape.
    document.addEventListener('keydown', event => {

        if (event.key === 'Escape') {
            toggleProfileMenu(false);
        }
    });
}