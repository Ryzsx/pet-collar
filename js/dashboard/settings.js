import { signOut } from '../firebase-init.js';
import { $, $$, escapeHtml, showToast } from './dom.js';

let currentUser = null;

function setUserInterface(name, email, photoUrl = '') {
    const safeName = name || 'User';
    const initial = safeName.charAt(0).toUpperCase();
    ['#greetingName', '#userName', '#liveWelcomeName'].forEach(selector => { if ($(selector)) $(selector).textContent = safeName; });
    $('#profileName').value = safeName;
    $('#userEmail').textContent = email || '';
    $('#profileEmail').value = email || '';
    ['#userAvatar', '#settingsAvatar'].forEach(selector => {
        const element = $(selector);
        if (!element) return;
        element.innerHTML = photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(safeName)}">` : initial;
    });
}

function updateConnectionStatus() {
    const status = $('#connectionStatus');
    if (!status) return;
    const online = navigator.onLine;
    status.classList.toggle('offline', !online);
    status.innerHTML = `<span class="status-pulse"></span><div><strong>${online ? 'System online' : 'System offline'}</strong><small>${online ? 'All services operational' : 'Check your connection'}</small></div>`;
}

async function handleLogout() {
    const button = $('#confirmLogoutBtn');
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Logging out';
    try {
        if (currentUser) {
            localStorage.setItem('lastUserEmail', currentUser.email || '');
            localStorage.setItem('lastUserName', currentUser.displayName || currentUser.email?.split('@')[0] || 'User');
            localStorage.setItem('lastUserAvatar', currentUser.photoURL || '');
        }
        const result = await signOut();
        if (!result?.success) throw new Error(result?.error || 'Sign out failed');
        window.location.href = '../pages/login.html';
    } catch (error) {
        console.error('Logout failed:', error);
        button.disabled = false;
        button.textContent = 'Yes, logout';
        showToast('Could not log out. Please try again.', 'bi-exclamation-circle-fill');
    }
}

function setSettingsUser(user) { currentUser = user; }

function attachSettingsEvents() {
    $$('.settings-nav [data-settings-target]').forEach(button => button.addEventListener('click', () => {
        $$('.settings-nav button').forEach(item => item.classList.toggle('active', item === button));
        $$('.settings-panel').forEach(panel => panel.classList.toggle('active', panel.id === `settings-${button.dataset.settingsTarget}`));
    }));
    $$('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        input.type = input.type === 'password' ? 'text' : 'password';
        button.innerHTML = `<i class="bi ${input.type === 'password' ? 'bi-eye' : 'bi-eye-slash'}"></i>`;
    }));

    $('#accountForm')?.addEventListener('submit', event => {
        event.preventDefault();
        const name = $('#profileName').value.trim();
        if (!name) return;
        setUserInterface(name, $('#profileEmail').value, currentUser?.photoURL || '');
        showToast('Profile preview updated. Authentication data was not changed.');
    });
    $('#passwordForm')?.addEventListener('submit', event => {
        event.preventDefault();
        if ($('#newPassword').value !== $('#confirmPassword').value) {
            showToast('New passwords do not match.', 'bi-exclamation-circle-fill');
            return;
        }
        event.currentTarget.reset();
        showToast('Password form validated. Backend update is not enabled in this prototype.');
    });
    $('#savePreferencesBtn')?.addEventListener('click', () => showToast('Notification preferences saved for this prototype.'));

    $('#changeProfilePhotoBtn')?.addEventListener('click', () => $('#profilePhotoInput').click());
    $('#profilePhotoInput')?.addEventListener('change', event => {
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) return showToast('Choose an image smaller than 2 MB.', 'bi-exclamation-circle-fill');
        const reader = new FileReader();
        reader.onload = () => {
            ['#settingsAvatar', '#userAvatar'].forEach(selector => { $(selector).innerHTML = `<img src="${reader.result}" alt="Profile preview">`; });
            showToast('Profile photo preview updated.');
        };
        reader.readAsDataURL(file);
    });

    $('#confirmLogoutBtn')?.addEventListener('click', handleLogout);
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
}

export { setSettingsUser, setUserInterface, updateConnectionStatus, attachSettingsEvents };
