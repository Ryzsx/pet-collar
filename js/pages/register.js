// ============================================
// IMPORT FROM YOUR FIREBASE INIT
// ============================================
import { 
    auth,
    onAuthStateChanged
} from '../firebase-init.js';
import { authService } from '../services/AuthService.js';
import { isValidEmail, isValidUsername, isStrongPassword, passwordRules } from '../utils/validators.js';

// ============================================
// DOM ELEMENTS
// ============================================
const usernameInput = document.getElementById('regUsername');
const emailInput = document.getElementById('regEmail');
const passwordInput = document.getElementById('regPassword');
const confirmPasswordInput = document.getElementById('regConfirmPassword');
const showPasswordBtn = document.getElementById('showPasswordReg');
const showConfirmPasswordBtn = document.getElementById('showConfirmPasswordReg');
const registerForm = document.getElementById('registerForm');
const signUpBtn = document.getElementById('signUpBtn');
const errorMsg = document.getElementById('errorMessage');
const successMsg = document.getElementById('successMessage');
const passwordRequirements = document.getElementById('passwordRequirements');
const registrationVerification = document.getElementById('registrationVerification');
const verificationIcon = document.getElementById('verificationIcon');
const verificationHeading = document.getElementById('verificationHeading');
const verificationDescription = document.getElementById('verificationDescription');
const verificationStatus = document.getElementById('verificationStatus');
const verificationCancelBtn = document.getElementById('verificationCancelBtn');
const registrationResendBtn = document.getElementById('registrationResendBtn');
const continueToLoginBtn = document.getElementById('continueToLoginBtn');
const loginPrompt = document.getElementById('loginPrompt');

let verificationPoll = null;
let verificationResendTimer = null;
let verificationResendSeconds = 0;
let verificationCheckRunning = false;
let registrationSubmitting = false;
let registrationCompleted = false;
const pendingRegistrationKey = user => `pendingRegistration:${user.uid}`;

// ============================================
// PASSWORD TOGGLE
// ============================================
[[showPasswordBtn, passwordInput], [showConfirmPasswordBtn, confirmPasswordInput]].forEach(([button, input]) => {
    button.addEventListener('click', function() {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        this.textContent = isPassword ? 'Hide' : 'Show';
    });
});

// ============================================
// MESSAGE HELPERS
// ============================================
function showMessage(message, type) {
    const activeMessage = type === 'success' ? successMsg : errorMsg;
    const inactiveMessage = type === 'success' ? errorMsg : successMsg;
    activeMessage.textContent = message;
    activeMessage.style.display = 'flex';
    inactiveMessage.style.display = 'none';
    inactiveMessage.textContent = '';
}

function hideMessages() {
    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';
    errorMsg.textContent = '';
    successMsg.textContent = '';
}

const showError = message => showMessage(message, 'error');
const showSuccess = message => showMessage(message, 'success');

// ============================================
// LOADING STATE
// ============================================
function setLoading(isLoading) {
    signUpBtn.disabled = isLoading;
    signUpBtn.innerHTML = isLoading
        ? '<span class="spinner" aria-hidden="true"></span><span>Creating account...</span>'
        : '<span>Create Account</span>';
}

function clearRegistrationFields() {
    registerForm.reset();
    passwordInput.type = 'password';
    confirmPasswordInput.type = 'password';
    showPasswordBtn.textContent = 'Show';
    showConfirmPasswordBtn.textContent = 'Show';
    passwordRequirements.hidden = true;
}

function updatePasswordRequirements() {
    Object.entries(passwordRules).forEach(([rule, validate]) => {
        const requirement = passwordRequirements.querySelector(`[data-password-rule="${rule}"]`);
        requirement.classList.toggle('valid', validate(passwordInput.value));
    });
}

passwordInput.addEventListener('input', () => {
    if (!passwordRequirements.hidden) updatePasswordRequirements();
});

function stopVerificationPoll() {
    if (verificationPoll) window.clearInterval(verificationPoll);
    verificationPoll = null;
}

function stopVerificationResendTimer() {
    if (verificationResendTimer) window.clearInterval(verificationResendTimer);
    verificationResendTimer = null;
}

function startVerificationResendTimer() {
    stopVerificationResendTimer();
    verificationResendSeconds = 60;
    registrationResendBtn.disabled = true;

    const updateCountdown = () => {
        registrationResendBtn.textContent = `Resend verification in ${verificationResendSeconds}s`;
    };

    updateCountdown();
    verificationResendTimer = window.setInterval(() => {
        verificationResendSeconds -= 1;
        if (verificationResendSeconds <= 0) {
            stopVerificationResendTimer();
            registrationResendBtn.disabled = false;
            registrationResendBtn.textContent = 'Resend Verification Email';
            return;
        }
        updateCountdown();
    }, 1000);
}

function setVerificationStatus(message, type = '') {
    verificationStatus.textContent = message;
    verificationStatus.className = `registration-verification-status ${type}`.trim();
}

function storePendingRegistration(user, username, email) {
    localStorage.setItem(pendingRegistrationKey(user), JSON.stringify({
        uid: user.uid,
        username,
        email
    }));
}

function getPendingRegistration(user) {
    try {
        const stored = localStorage.getItem(pendingRegistrationKey(user));
        const registration = stored ? JSON.parse(stored) : null;
        return registration?.uid === user.uid ? registration : null;
    } catch {
        return null;
    }
}

function clearPendingRegistration(user) {
    localStorage.removeItem(pendingRegistrationKey(user));
}

function startVerificationPoll() {
    stopVerificationPoll();
    verificationPoll = window.setInterval(() => checkVerificationStatus(false), 5000);
}

function showPendingVerification(user, verificationSent = true, statusMessage = '') {
    hideMessages();
    registerForm.hidden = true;
    loginPrompt.hidden = true;
    registrationVerification.hidden = false;
    verificationIcon.textContent = '@';
    verificationHeading.textContent = 'Check your email';
    const emailLabel = document.createElement('strong');
    emailLabel.textContent = user?.email || 'your email address';
    verificationDescription.replaceChildren(
        'A verification link was sent to ',
        emailLabel,
        '. Your registration will be completed after Firebase verifies your email.'
    );
    registrationResendBtn.hidden = false;
    continueToLoginBtn.hidden = true;
    setVerificationStatus(statusMessage || (verificationSent
        ? 'Waiting for email verification…'
        : 'The verification email could not be sent. Use the resend button below.'),
        verificationSent ? '' : 'error');
    startVerificationResendTimer();
    startVerificationPoll();
}

async function completeVerifiedRegistration(user) {
    if (registrationCompleted) return;
    stopVerificationPoll();

    const pendingRegistration = getPendingRegistration(user);
    if (!pendingRegistration) {
        setVerificationStatus('Registration details could not be found. Please restart registration.', 'error');
        return;
    }

    const result = await authService.completeRegistration(user.uid, pendingRegistration);
    if (!result.success) {
        setVerificationStatus(
            result.error === 'auth/username-already-in-use'
                ? 'That username is no longer available. Please contact support.'
                : 'Your email is verified, but registration could not be completed. Please try again.',
            'error'
        );
        return;
    }

    registrationCompleted = true;
    clearPendingRegistration(user);

    registrationVerification.hidden = false;
    verificationIcon.textContent = '✓';
    verificationHeading.textContent = 'Registration successful';
    verificationDescription.textContent = 'Your email has been verified. You can now sign in to PawSense.';
    stopVerificationResendTimer();
    registrationResendBtn.hidden = true;
    continueToLoginBtn.hidden = false;
    setVerificationStatus('Email verification complete.', 'success');
    showSuccess('Account registration successful. Your email has been verified.');

    await authService.logout();
}

async function checkVerificationStatus(manualCheck = false) {
    if (verificationCheckRunning || registrationCompleted || !auth.currentUser) return;
    verificationCheckRunning = true;

    const result = await authService.reloadUser();
    verificationCheckRunning = false;

    if (result.success && result.user?.emailVerified) {
        await completeVerifiedRegistration(result.user);
        return;
    }

    if (manualCheck) {
        setVerificationStatus(
            result.success
                ? 'Your email is not verified yet. Open the verification link, then check again.'
                : 'Verification status could not be checked. Please try again.',
            'error'
        );
    }
}

registrationResendBtn.addEventListener('click', async () => {
    registrationResendBtn.disabled = true;
    registrationResendBtn.textContent = 'Sending…';
    const result = await authService.resendVerification(auth.currentUser);

    if (result.success && result.alreadyVerified) {
        await checkVerificationStatus(true);
    } else if (result.success) {
        setVerificationStatus('A new verification link was sent to your email.', 'success');
    } else {
        setVerificationStatus('The verification email could not be sent. Please try again.', 'error');
    }

    if (result.success && !result.alreadyVerified) {
        startVerificationResendTimer();
    } else if (!result.success) {
        registrationResendBtn.disabled = false;
        registrationResendBtn.textContent = 'Resend Verification Email';
    }
});

verificationCancelBtn.addEventListener('click', async () => {
    stopVerificationPoll();
    stopVerificationResendTimer();
    await authService.logout();
    registrationVerification.hidden = true;
    registerForm.hidden = false;
    loginPrompt.hidden = false;
});

continueToLoginBtn.addEventListener('click', () => {
    window.location.href = 'login.html';
});

window.addEventListener('beforeunload', () => {
    stopVerificationPoll();
    stopVerificationResendTimer();
});

// ============================================
// CHECK AUTH STATE (in case already logged in)
// ============================================
onAuthStateChanged(auth, async user => {
    if (registrationSubmitting || registrationCompleted) return;

    if (!user) {
        registerForm.hidden = false;
        loginPrompt.hidden = false;
        registrationVerification.hidden = true;
        stopVerificationPoll();
        return;
    }

    showPendingVerification(user);
    await checkVerificationStatus(false);
});

// ============================================
// REGISTER FORM SUBMIT
// ============================================
registerForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    hideMessages();

    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    // Validate
    const missingField = [
        [username, usernameInput, 'Username'],
        [email, emailInput, 'Email'],
        [password, passwordInput, 'Password'],
        [confirmPassword, confirmPasswordInput, 'Confirm password']
    ].find(([value]) => !value);

    if (missingField) {
        showError(`${missingField[2]} is required.`);
        missingField[1].focus();
        return;
    }
    if (!isValidUsername(username)) {
        showError('Username must be 3–30 characters and use only letters, numbers, or underscores.');
        return;
    }

    setLoading(true);

    const usernameCheck = await authService.checkUsername(username);
    if (!usernameCheck.success) {
        showError('Username availability could not be checked. Please try again.');
        setLoading(false);
        return;
    }
    if (usernameCheck.exists) {
        showError('Username already exists.');
        setLoading(false);
        return;
    }

    if (!isValidEmail(email)) {
        showError('Please enter a valid email address.');
        setLoading(false);
        return;
    }

    if (password !== confirmPassword) {
        showError('Passwords do not match.');
        setLoading(false);
        return;
    }
    if (!isStrongPassword(password)) {
        passwordRequirements.hidden = false;
        updatePasswordRequirements();
        showError('Please meet all password requirements.');
        setLoading(false);
        return;
    }

    passwordRequirements.hidden = true;
    registrationSubmitting = true;

    const registrationEmailCheck = await authService.checkRegistrationEmail(email, password);
    if (!registrationEmailCheck.success) {
        registrationSubmitting = false;
        showError(registrationEmailCheck.error === 'auth/wrong-password' || registrationEmailCheck.error === 'auth/invalid-credential'
            ? 'EMAIL ALREADY REGISTERED.'
            : 'Email availability could not be checked. Please try again.');
        setLoading(false);
        return;
    }

    if (registrationEmailCheck.status === 'completed') {
        registrationSubmitting = false;
        showError('EMAIL ALREADY REGISTERED.');
        setLoading(false);
        return;
    }

    if (registrationEmailCheck.status === 'pending') {
        registrationSubmitting = false;
        await authService.logout();
        showError('EMAIL ALREADY REGISTERED.');
        setLoading(false);
        return;
    }

    try {
        const result = await authService.register(username, email, password);
        registrationSubmitting = false;

        console.log('✅ Registration result:', result);

        if (result.success) {
            clearRegistrationFields();
            storePendingRegistration(result.user, username, email);
            setLoading(false);
            showPendingVerification(result.user, result.verificationSent);
        } else {
            // ❌ Show the actual Firebase error
            const errorMessages = {
                'auth/email-already-in-use': 'EMAIL ALREADY REGISTERED.',
                'auth/username-already-in-use': 'Username already exists.',
                'auth/username-check-unavailable': 'Username registration is not available until the Firestore username rules are configured.',
                'auth/email-check-unavailable': 'Email availability could not be checked. Please try again.',
                'auth/invalid-email': 'Invalid email address.',
                'auth/weak-password': 'Password does not meet the security requirements.',
                'auth/operation-not-allowed': 'Email/password sign-in is not enabled. Contact support.',
                'auth/network-request-failed': 'Network error. Please check your internet connection.'
            };
            const userMessage = errorMessages[result.error] || result.message || 'Sign-up failed.';
            showError(userMessage);
            console.error('❌ Registration error:', result);
            setLoading(false);
        }
    } catch (err) {
        registrationSubmitting = false;
        // Catch any unexpected errors
        console.error('💥 Unexpected error:', err);
        showError('An unexpected error occurred. Please try again.');
        setLoading(false);
    }
});

console.log('✅ Registration page ready (ES Module version)!');
console.log('🔥 Using the SAME Firebase instance as login.html');
