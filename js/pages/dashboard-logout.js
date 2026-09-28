import { signOut } from '../firebase-init.js';

const logoutButtons = document.querySelectorAll('[data-logout-action]');
const logoutConfirmPanel = document.getElementById('logoutConfirmPanel');
const confirmLogoutButton = document.getElementById('confirmLogoutBtn');
const cancelLogoutButton = document.getElementById('cancelLogoutBtn');
let logoutInProgress = false;

logoutButtons.forEach(button => button.addEventListener('click', () => {
    if (logoutInProgress || !logoutConfirmPanel) return;
    document.getElementById('sidebar')?.classList.remove('collapsed');
    logoutConfirmPanel.hidden = false;
    confirmLogoutButton?.focus();
}));

cancelLogoutButton?.addEventListener('click', () => {
    logoutConfirmPanel.hidden = true;
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
