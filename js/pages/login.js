// ============================================
// IMPORT FROM YOUR FIREBASE INIT (SAME AS REGISTER)
// ============================================
import { 
    auth,
    onAuthStateChanged
} from '../firebase-init.js';
import { authService } from '../services/AuthService.js';

// ============================================
// DOM REFS
// ============================================
const identifierInput = document.getElementById('loginIdentifier');
const passwordInput = document.getElementById('password');
const showPasswordBtn = document.getElementById('showPassword');
const loginForm = document.getElementById('loginForm');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const signInBtn = document.getElementById('signInBtn');
const forgotLink = document.getElementById('forgotLink');
const errorMsg = document.getElementById('errorMessage');
const successMsg = document.getElementById('successMessage');
let loginInProgress = false;
const accountDoesNotExistMessage = 'Invalid username/email and password!';

function loginErrorMessage(code, identifier) {
    if (code === 'auth/account-pending') return 'Verify your email address before signing in.';
    if (code === 'auth/username-lookup-unavailable') return 'Username lookup is unavailable. Try signing in with your email address.';
    if (code === 'auth/user-not-found' && !identifier.includes('@')) return 'Username was not found. Try signing in with your email address.';
    if (code === 'auth/network-request-failed' || code === 'unavailable') return 'Could not reach Firebase. Check your internet connection and try again.';
    if (code === 'auth/too-many-requests') {
    return 'Firebase has temporarily limited sign-in attempts. Please try again later.';
    }
    return accountDoesNotExistMessage;
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function updateStatus(msg, success = false) {
    if (statusText) statusText.textContent = msg;
    if (statusDot) statusDot.classList.toggle('success', success);
    console.log('📌 Status:', msg);
}

function showError(msg) {
    if (errorMsg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
        if (successMsg) successMsg.style.display = 'none';
    }
}

function showSuccess(msg) {
    if (successMsg) {
        successMsg.textContent = msg;
        successMsg.style.display = 'block';
        if (errorMsg) errorMsg.style.display = 'none';
    }
}

function hideMessages() {
    if (errorMsg) errorMsg.style.display = 'none';
    if (successMsg) successMsg.style.display = 'none';
}

function setLoading(isLoading) {
    if (!signInBtn) return;
    signInBtn.disabled = isLoading;
    signInBtn.innerHTML = isLoading
        ? '<span class="spinner" aria-hidden="true"></span><span>Signing in...</span>'
        : '<span>Sign in</span>';
}

function clearLoginFields() {
    loginForm.reset();
    passwordInput.type = 'password';
    showPasswordBtn.textContent = 'Show';
}

// ============================================
// LOGIN LOCKOUT - 3 ATTEMPTS / 120 SECONDS
// ============================================

const LOGIN_MAX_ATTEMPTS = 3;
const LOGIN_COOLDOWN_MS = 120_000;
const LOGIN_LOCK_KEY = 'pawsense:loginLockout';

let loginLockMessageVisible = false;

const INVALID_LOGIN_ERRORS = new Set([
    'auth/invalid-credential',
    'auth/invalid-login-credentials',
    'auth/wrong-password',
    'auth/user-not-found',
    'auth/invalid-email'
]);

function getLoginLockState() {
    let stored = {};

    try {
        stored = JSON.parse(
            localStorage.getItem(LOGIN_LOCK_KEY) || '{}'
        );
    } catch {
        stored = {};
    }

    const attempts = Number(stored.attempts) || 0;
    const lockedUntil = Number(stored.lockedUntil) || 0;

    if (lockedUntil > 0 && Date.now() >= lockedUntil) {
        localStorage.removeItem(LOGIN_LOCK_KEY);

        return {
            attempts: 0,
            lockedUntil: 0
        };
    }

    return {
        attempts,
        lockedUntil
    };
}

function getLoginCooldownSeconds() {
    const state = getLoginLockState();

    return Math.max(
        0,
        Math.ceil((state.lockedUntil - Date.now()) / 1000)
    );
}

function showActiveLoginLockout() {
    const seconds = getLoginCooldownSeconds();

    if (seconds > 0) {
        showError(
            `Maximum number of attempts reached. Please try again after ${seconds} second(s)`
        );

        loginLockMessageVisible = true;
        return true;
    }

    if (loginLockMessageVisible) {
        loginLockMessageVisible = false;
        hideMessages();
    }

    return false;
}

function recordInvalidLogin() {
    const state = getLoginLockState();

    if (state.lockedUntil > Date.now()) {
        return state;
    }

    state.attempts += 1;

    if (state.attempts >= LOGIN_MAX_ATTEMPTS) {
        state.attempts = LOGIN_MAX_ATTEMPTS;
        state.lockedUntil = Date.now() + LOGIN_COOLDOWN_MS;
    }

    localStorage.setItem(
        LOGIN_LOCK_KEY,
        JSON.stringify(state)
    );

    return state;
}

function clearLoginLockout() {
    localStorage.removeItem(LOGIN_LOCK_KEY);
    loginLockMessageVisible = false;
}

// Restore cooldown after page refresh.
showActiveLoginLockout();

// Keep the error message updated every second.
window.setInterval(() => {
    showActiveLoginLockout();
}, 1000);

// Synchronize lockout changes across browser tabs.
window.addEventListener('storage', event => {
    if (event.key === LOGIN_LOCK_KEY) {
        showActiveLoginLockout();
    }
});

// ============================================
// 1. PASSWORD TOGGLE
// ============================================
if (showPasswordBtn && passwordInput) {
    showPasswordBtn.addEventListener('click', function() {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        this.textContent = isPassword ? 'Hide' : 'Show';
    });
}


// ============================================
// 2. AUTH STATE
// ============================================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log('✅ User logged in:', user.email);

        if (!user.emailVerified) {
            if (loginInProgress) return;

            await authService.logout();

            if (!showActiveLoginLockout()) {
                showError(accountDoesNotExistMessage);
            }

            updateStatus('Login failed', false);
            setLoading(false);
            return;

        } else {
            if (!showActiveLoginLockout()) {
                hideMessages();
            }

            updateStatus(
                `Signed in as ${user.email}. Sign in to continue or choose another account.`,
                true
            );
        }

    } else {
        updateStatus('Not logged in', false);

        if (!showActiveLoginLockout()) {
            hideMessages();
        }
    }
});


// ============================================
// 3. USERNAME OR EMAIL SIGN IN
// ============================================

loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    // Prevent duplicate requests.
    if (loginInProgress) return;

    // ============================================
    // CHECK EXISTING LOGIN LOCKOUT FIRST
    // ============================================

    if (showActiveLoginLockout()) {
        updateStatus('Login temporarily locked', false);
        return;
    }

    hideMessages();

    const identifier = identifierInput.value.trim();
    const password = passwordInput.value;

    if (!identifier || !password) {
        showError(accountDoesNotExistMessage);
        return;
    }

    loginInProgress = true;
    setLoading(true);
    updateStatus('Signing in...', false);

    try {
        const result = await authService.login(
            identifier,
            password
        );

        clearLoginFields();

        console.log('Login result:', result);

        // ============================================
        // SUCCESSFUL LOGIN
        // ============================================

        if (result.success) {
            clearLoginLockout();

            hideMessages();
            updateStatus('Login successful', true);

            window.location.replace(
                'dashboard.html#live-tracking'
            );

            return;
        }

        // ============================================
        // UNVERIFIED ACCOUNT
        // ============================================

        if (result.error === 'auth/account-pending') {
            await authService.logout();

            showError(
                loginErrorMessage(result.error, identifier)
            );

            updateStatus('Login failed', false);
            return;
        }

        // ============================================
        // INVALID LOGIN CREDENTIALS
        // ============================================

        if (INVALID_LOGIN_ERRORS.has(result.error)) {
            const state = recordInvalidLogin();

            if (state.attempts >= LOGIN_MAX_ATTEMPTS) {
                showActiveLoginLockout();

                updateStatus(
                    'Login temporarily locked',
                    false
                );

                return;
            }

            showError(
                loginErrorMessage(result.error, identifier)
            );

            updateStatus('Login failed', false);
            return;
        }

        // Other errors are not counted as
        // invalid credential attempts.
        console.error('Login error:', result);

        showError(
            loginErrorMessage(result.error, identifier)
        );

        updateStatus('Login failed', false);

    } catch (error) {
        console.error('Unexpected login error:', error);

        showError(
            'Unable to sign in. Please try again.'
        );

        updateStatus('Login failed', false);

    } finally {
        loginInProgress = false;
        setLoading(false);
    }
});

// ============================================
// 4. FORGOT PASSWORD
// ============================================
if (forgotLink) {
    forgotLink.addEventListener('click', function(e) {
        e.preventDefault();
        const identifier = identifierInput.value.trim();
        if (identifier) {
            localStorage.setItem('forgotPasswordIdentifier', identifier.toLowerCase());
        }
        window.location.href = 'forgot-password.html';
    });
}

console.log('✅ Login page ready (ES Module version)!');
console.log('🔥 Using the SAME Firebase instance as register.html');
