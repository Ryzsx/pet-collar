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
            showError(accountDoesNotExistMessage);
            updateStatus('Login failed', false);
            setLoading(false);
            return;
        } else {
            hideMessages();
            // Keep the login page visible when it was opened from the landing page.
            updateStatus(`Signed in as ${user.email}. Sign in to continue or choose another account.`, true);
        }
    } else {
        updateStatus('Not logged in', false);
        hideMessages();
    }
});

// ============================================
// 3. USERNAME OR EMAIL SIGN IN
// ============================================
loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    hideMessages();

    const identifier = identifierInput.value.trim();
    const password = passwordInput.value;

    if (!identifier || !password) {
        showError(accountDoesNotExistMessage);
        return;
    }

    setLoading(true);
    loginInProgress = true;
    updateStatus('Signing in...', false);

    try {
        const result = await authService.login(identifier, password);
        loginInProgress = false;
        clearLoginFields();

        console.log('✅ Login result:', result);

        if (result.success) {
            console.log('✅ Login success:', result.user.email);
            loginInProgress = false;
            setLoading(false);
            hideMessages();
            updateStatus('Not logged in', false);

            // Open live monitoring after login
            window.location.replace('dashboard.html#live-tracking');
        } else {
            // ❌ Show the actual Firebase error
            console.error('❌ Login error:', result);
            if (result.error === 'auth/account-pending') {
                await authService.logout();
                showError(accountDoesNotExistMessage);
                updateStatus('Login failed', false);
                setLoading(false);
                return;
            }
            showError(accountDoesNotExistMessage);
            updateStatus('Login failed', false);
            setLoading(false);
        }
    } catch (error) {
        loginInProgress = false;
        clearLoginFields();
        console.error('❌ Unexpected login error:', error);
        showError(accountDoesNotExistMessage);
        updateStatus('Login failed', false);
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
