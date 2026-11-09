
import { $, $$, showToast } from './dom.js';
import { auth, db, doc, runTransaction, serverTimestamp } from '../firebase-init.js';

let currentUser = null;
let usernameSaving = false;

function setUserInterface(name, email) {
    const safeName = name || 'User';
    const initial = safeName.charAt(0).toUpperCase();

    ['#greetingName', '#userName', '#liveWelcomeName'].forEach(selector => {
        const element = $(selector);
        if (element) element.textContent = safeName;
    });

    if ($('#profileName')) $('#profileName').value = safeName;
    if ($('#userEmail')) $('#userEmail').textContent = email || '';
    if ($('#profileEmail')) $('#profileEmail').value = email || '';

    // Sidebar avatar uses username initial only.
    if ($('#userAvatar')) $('#userAvatar').textContent = initial;
}

function updateConnectionStatus() {
    const status = $('#connectionStatus');
    if (!status) return;

    const online = navigator.onLine;
    status.classList.toggle('offline', !online);
    status.innerHTML = `<span class="status-pulse"></span><div><strong>${online ? 'System online' : 'System offline'}</strong><small>${online ? 'All services operational' : 'Check your connection'}</small></div>`;
}

function setSettingsUser(user) {
    currentUser = user;
}

async function saveUsername(newUsername) {
    const user = auth.currentUser;

    if (!user || user.uid !== currentUser?.uid || !user.emailVerified) {
        throw new Error('Your session is unavailable. Please sign in again.');
    }

    const newKey = newUsername.toLowerCase();

    return await runTransaction(db, async transaction => {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await transaction.get(userRef);

        if (!userSnap.exists()) {
            throw new Error('Your registered profile could not be found.');
        }

        const profile = userSnap.data();
        const oldUsername = String(profile.username || '').trim();
        const oldKey = oldUsername.toLowerCase();

        if (oldUsername === newUsername) {
            return false;
        }

        // Case-only username changes do not require a new index.
        if (oldKey === newKey) {
                
        transaction.update(userRef, {
            username: newUsername,
            usernameLower: newKey,
            updatedAt: serverTimestamp()
        });
            return true;
        }

        const newUsernameRef = doc(db, 'usernames', newKey);
        const oldUsernameRef = oldKey
            ? doc(db, 'usernames', oldKey)
            : null;

        // Complete all reads before any writes.
        const newUsernameSnap = await transaction.get(newUsernameRef);
        const oldUsernameSnap = oldUsernameRef
            ? await transaction.get(oldUsernameRef)
            : null;

        // Reject names owned by another account.
        if (newUsernameSnap.exists()) {
            throw new Error('USERNAME_TAKEN');
        }

        // Never remove another account's username mapping.
        if (
            oldUsernameSnap?.exists() &&
            oldUsernameSnap.data().uid !== user.uid
        ) {
            throw new Error('Username records are inconsistent. Please contact support.');
        }

        // Reserve the new username.
        transaction.set(newUsernameRef, {
            uid: user.uid,
            email: user.email || profile.email || ''
        });

        // Update the registered profile.
        transaction.update(userRef, {
            username: newUsername,
            usernameLower: newKey,
            updatedAt: serverTimestamp()
        });

        // Release the previous username.
        if (oldUsernameRef && oldUsernameSnap?.exists()) {
            transaction.delete(oldUsernameRef);
        }

        return true;
    });
}

function attachSettingsEvents() {
    $$('.settings-nav [data-settings-target]').forEach(button => {
        button.addEventListener('click', () => {
            $$('.settings-nav button').forEach(item => {
                item.classList.toggle('active', item === button);
            });

            $$('.settings-panel').forEach(panel => {
                panel.classList.toggle(
                    'active',
                    panel.id === `settings-${button.dataset.settingsTarget}`
                );
            });
        });
    });

    $$('[data-password-toggle]').forEach(button => {
        button.addEventListener('click', () => {
            const input = document.getElementById(button.dataset.passwordToggle);
            input.type = input.type === 'password' ? 'text' : 'password';
            button.innerHTML = `<i class="bi ${input.type === 'password' ? 'bi-eye' : 'bi-eye-slash'}"></i>`;
        });
    });

    // Real Firestore username update.
    $('#accountForm')?.addEventListener('submit', async event => {
        event.preventDefault();

        if (usernameSaving) return;

        const newUsername = $('#profileName').value.trim();

        if (!/^[A-Za-z0-9_]{3,30}$/.test(newUsername)) {
            showToast(
                'Username must be 3–30 characters using letters, numbers, or underscores.',
                'bi-exclamation-circle-fill'
            );
            return;
        }

        const saveButton = event.currentTarget.querySelector('button[type="submit"]');

        usernameSaving = true;
        if (saveButton) saveButton.disabled = true;

        try {
            const changed = await saveUsername(newUsername);

            if (!changed) {
                showToast('No username changes to save.');
                return;
            }

            const email = auth.currentUser?.email || '';

            setUserInterface(newUsername, email);

            localStorage.setItem('lastUserName', newUsername);
            localStorage.setItem('lastUserEmail', email);

            showToast('Username updated successfully.', 'bi-check-circle-fill');

        } catch (error) {
            console.error('Username update failed:', error);

            if (error.message === 'USERNAME_TAKEN') {
                showToast('This username is already taken.', 'bi-exclamation-circle-fill');
            } else if (error.code === 'permission-denied') {
                showToast('Username update is blocked by Firestore permissions.', 'bi-exclamation-circle-fill');
            } else {
                showToast(
                    error.message || 'Username could not be updated.',
                    'bi-exclamation-circle-fill'
                );
            }

        } finally {
            usernameSaving = false;
            if (saveButton) saveButton.disabled = false;
        }
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

    $('#savePreferencesBtn')?.addEventListener('click', () => {
        showToast('Notification preferences saved for this prototype.');
    });

    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
}

export {
    setSettingsUser,
    setUserInterface,
    updateConnectionStatus,
    attachSettingsEvents
};
