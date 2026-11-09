import {
    auth,
    onAuthStateChanged
} from '../firebase-init.js';

import {
    reload,
    deleteUser,
    EmailAuthProvider,
    reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import { authService } from '../services/AuthService.js';

import {
    isValidEmail,
    isValidUsername,
    isStrongPassword,
    passwordRules
} from '../utils/validators.js';

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
let registrationPasswordInMemory = null;
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
    

// ============================================
// SERVER-SYNCHRONIZED 120-SECOND TIMER
// ============================================


const verificationCooldownKey = user =>
    `pawsense:verificationResendUntil:${user.uid}`;

function startVerificationResendTimer(user, emailJustSent = false) {
    stopVerificationResendTimer();

    if (!user?.uid) return;

    const key = verificationCooldownKey(user);
    let deadline = Number(sessionStorage.getItem(key) || 0);

    if (emailJustSent) {
        deadline = Date.now() + 60_000;
        sessionStorage.setItem(key, String(deadline));
    }

    const updateCountdown = () => {
        verificationResendSeconds = Math.max(
            0,
            Math.ceil((deadline - Date.now()) / 1000)
        );

        if (verificationResendSeconds === 0) {
            stopVerificationResendTimer();
            sessionStorage.removeItem(key);

            registrationResendBtn.disabled = false;
            registrationResendBtn.textContent =
                'Resend Verification Email';

            return;
        }

        registrationResendBtn.disabled = true;
        registrationResendBtn.textContent =
            `Resend verification in ${verificationResendSeconds}s`;
    };

    updateCountdown();

    if (deadline > Date.now()) {
        verificationResendTimer =
            window.setInterval(updateCountdown, 1000);
    }
}

function setVerificationStatus(message, type = '') {
    verificationStatus.textContent = message;
    verificationStatus.className = `registration-verification-status ${type}`.trim();
}


function storePendingRegistration(
    user,
    username,
    email,
    verificationSent = false
) {
    localStorage.setItem(
        pendingRegistrationKey(user),
        JSON.stringify({
            uid: user.uid,
            username,
            email,
            verificationSent: Boolean(verificationSent)
        })
    );
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

const REGISTRATION_FLOW_KEY = 'pawsense:activeRegistrationUid';

function activateRegistrationFlow(user) {
    const pending = getPendingRegistration(user);

    if (!pending || !user?.uid) {
        throw new Error('No valid pending registration.');
    }

    sessionStorage.setItem(REGISTRATION_FLOW_KEY, user.uid);
}

function isActiveRegistrationFlow(user) {
    if (!user?.uid) return false;

    const pending = getPendingRegistration(user);

    return Boolean(
        pending &&
        pending.uid === user.uid &&
        pending.email?.toLowerCase() === user.email?.toLowerCase() &&
        sessionStorage.getItem(REGISTRATION_FLOW_KEY) === user.uid
    );
}

function clearActiveRegistrationFlow(uid) {
    if (
        !uid ||
        sessionStorage.getItem(REGISTRATION_FLOW_KEY) === uid
    ) {
        sessionStorage.removeItem(REGISTRATION_FLOW_KEY);
    }
}

function clearPendingRegistration(user) {
    localStorage.removeItem(pendingRegistrationKey(user));
}

function startVerificationPoll() {
    stopVerificationPoll();
    verificationPoll = window.setInterval(() => checkVerificationStatus(false), 5000);
}



function showPendingVerification(
    user,
    verificationSent = true,
    statusMessage = ''
) {
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

    setVerificationStatus(
        statusMessage || (
            verificationSent
                ? 'Waiting for email verification…'
                : 'The verification email could not be sent. Use the resend button below.'
        ),
        verificationSent ? '' : 'error'
    );

    startVerificationResendTimer(user);
    startVerificationPoll();
}

function showRegistrationForm() {
    stopVerificationPoll();
    stopVerificationResendTimer();
    registrationVerification.hidden = true;
    registerForm.hidden = false;
    loginPrompt.hidden = false;
}

function resetCompletedRegistrationUI() {
    // Stop verification processes
    stopVerificationPoll();
    stopVerificationResendTimer();

    // Clear messages and registration fields
    hideMessages();
    setVerificationStatus('');
    clearRegistrationFields();

    // Restore normal registration page
    registrationVerification.hidden = true;
    registerForm.hidden = false;
    loginPrompt.hidden = false;

    // Reset verification buttons
    registrationResendBtn.hidden = false;
    registrationResendBtn.disabled = false;
    registrationResendBtn.textContent = 'Resend Verification Email';

    continueToLoginBtn.hidden = true;

    // Reset completion state
    registrationCompleted = false;
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
    clearActiveRegistrationFlow(user.uid);

    sessionStorage.removeItem(verificationCooldownKey(user));

    registrationPasswordInMemory = null;


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


let cancellationInProgress = false;

function showCancellationPasswordPrompt() {
    let form = document.getElementById('registrationCancelReauth');

    if (form) {
        form.querySelector('input')?.focus();
        return;
    }

    form = document.createElement('form');
    form.id = 'registrationCancelReauth';
    form.className = 'mt-3';

    const label = document.createElement('label');
    label.className = 'form-label';
    label.textContent = 'Enter your password to cancel registration';

    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'form-control';
    input.autocomplete = 'current-password';
    input.required = true;

    const button = document.createElement('button');
    button.type = 'submit';
    button.className = 'btn btn-primary mt-2';
    button.textContent = 'Cancel Registration';

    form.append(label, input, button);
    registrationVerification.appendChild(form);

    form.addEventListener('submit', async event => {
        event.preventDefault();

        const password = input.value;

        if (!password) return;

        button.disabled = true;

        await cancelPendingRegistration(password);

        input.value = '';
        button.disabled = false;
    });

    input.focus();
}

async function cancelPendingRegistration(passwordOverride = null) {
    if (cancellationInProgress) return;

    cancellationInProgress = true;
    verificationCancelBtn.disabled = true;

    stopVerificationPoll();

    try {
        const user = auth.currentUser;

        if (!user || !isActiveRegistrationFlow(user)) {
            throw new Error('No active registration found.');
        }

        await reload(user);

        if (
            auth.currentUser?.uid !== user.uid ||
            !isActiveRegistrationFlow(user)
        ) {
            throw new Error('Registration session changed.');
        }

        // Never delete a verified account.
        if (user.emailVerified) {
            await completeVerifiedRegistration(user);
            return;
        }

        const password =
            passwordOverride || registrationPasswordInMemory;

        // Refresh Firebase authentication when possible.
        if (password) {
            const credential = EmailAuthProvider.credential(
                user.email,
                password
            );

            await reauthenticateWithCredential(user, credential);

            await reload(user);

            if (
                auth.currentUser?.uid !== user.uid ||
                !isActiveRegistrationFlow(user)
            ) {
                throw new Error('Registration session changed.');
            }

            if (user.emailVerified) {
                await completeVerifiedRegistration(user);
                return;
            }
        }

        // Delete the unverified Firebase account.
        await deleteUser(user);

        // Clear registration state only after deletion succeeds.
        clearPendingRegistration(user);
        clearActiveRegistrationFlow(user.uid);

        sessionStorage.removeItem(
            verificationCooldownKey(user)
        );

        registrationPasswordInMemory = null;
        registrationCompleted = false;

        stopVerificationPoll();
        stopVerificationResendTimer();

        document.getElementById('registrationCancelReauth')?.remove();

        hideMessages();
        setVerificationStatus('');
        clearRegistrationFields();
        showRegistrationForm();

        // No success popup or toast.

    } catch (error) {
        console.error('Cancellation failed:', error);

        if (error.code === 'auth/requires-recent-login') {
            showCancellationPasswordPrompt();
        } else if (
            error.code === 'auth/wrong-password' ||
            error.code === 'auth/invalid-credential'
        ) {
            setVerificationStatus(
                'Incorrect password. Please try again.',
                'error'
            );
            showCancellationPasswordPrompt();
        } else {
            setVerificationStatus(
                'Unable to cancel registration. Please try again.',
                'error'
            );
        }

    } finally {
        cancellationInProgress = false;
        verificationCancelBtn.disabled = false;

        if (
            !registrationCompleted &&
            isActiveRegistrationFlow(auth.currentUser) &&
            !verificationPoll
        ) {
            startVerificationPoll();
        }
    }
}

async function checkVerificationStatus(manualCheck = false) {
    const user = auth.currentUser;

    if (
        verificationCheckRunning ||
        cancellationInProgress ||
        registrationCompleted ||
        !isActiveRegistrationFlow(user)
    ) {
        return;
    }

    verificationCheckRunning = true;

    let result;

    try {
        result = await authService.reloadUser();
    } catch (error) {
        console.error('Verification status check failed:', error);
        result = { success: false };
    } finally {
        verificationCheckRunning = false;
    }

    if (
        cancellationInProgress ||
        auth.currentUser?.uid !== user.uid ||
        !isActiveRegistrationFlow(auth.currentUser)
    ) {
        return;
    }

    if (
        result.success &&
        result.user?.uid === user.uid &&
        result.user.emailVerified
    ) {
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
    const user = auth.currentUser;

    if (
        cancellationInProgress ||
        registrationCompleted ||
        !isActiveRegistrationFlow(user)
    ) {
        setVerificationStatus(
            'No active registration. Please start a new registration.',
            'error'
        );
        return;
    }

    const deadline = Number(
        sessionStorage.getItem(verificationCooldownKey(user)) || 0
    );

    if (Date.now() < deadline) {
        startVerificationResendTimer(user);
        return;
    }

    registrationResendBtn.disabled = true;
    registrationResendBtn.textContent = 'Sending…';

    try {
        const result = await authService.resendVerification(user);

        if (
            auth.currentUser?.uid !== user.uid ||
            !isActiveRegistrationFlow(auth.currentUser)
        ) {
            return;
        }

        if (result.success && result.alreadyVerified) {
            await checkVerificationStatus(true);

        } else if (result.success) {
            const pending = getPendingRegistration(user);

            storePendingRegistration(
                user,
                pending.username,
                pending.email,
                true
            );

            setVerificationStatus(
                'A new verification link was sent to your email.',
                'success'
            );

            startVerificationResendTimer(user, true);

        } else {
            setVerificationStatus(
                'The verification email could not be sent. Please try again.',
                'error'
            );

            registrationResendBtn.disabled = false;
            registrationResendBtn.textContent =
                'Resend Verification Email';
        }

    } catch (error) {
        console.error('Verification resend failed:', error);

        setVerificationStatus(
            'The verification email could not be sent. Please try again.',
            'error'
        );

        registrationResendBtn.disabled = false;
        registrationResendBtn.textContent =
            'Resend Verification Email';
    }
});

verificationCancelBtn.addEventListener('click', async () => {

    // Registration already completed:
    // Close the verification section only.
    if (registrationCompleted) {
        resetCompletedRegistrationUI();
        return;
    }

    // Registration still pending:
    // Cancel and delete the unverified account.
    await cancelPendingRegistration();
});

continueToLoginBtn.addEventListener('click', () => {
    // Reset the registration interface
    resetCompletedRegistrationUI();

    // Redirect to Login
    window.location.href = 'login.html';
});

window.addEventListener('beforeunload', () => {
    stopVerificationPoll();
    stopVerificationResendTimer();
});

 // ============================================
 // CHECK AUTH STATE - ACTIVE REGISTRATION ONLY
 // ============================================
onAuthStateChanged(auth, async user => {
    if (
    registrationSubmitting ||
    cancellationInProgress ||
    registrationCompleted
) {
    return;
}

    // No Firebase user: show normal registration form.
    if (!user) {
        showRegistrationForm();
        return;
    }

    // Only restore an explicitly active registration
    // with matching pending registration details.
    if (!isActiveRegistrationFlow(user)) {
        showRegistrationForm();
        return;
    }

    // Valid active registration: resume verification.
        const pending = getPendingRegistration(user);

        showPendingVerification(
            user,
            pending.verificationSent !== false
    );

    // Check verification status without sending
    // another verification email automatically.
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

        console.log('✅ Registration result:', result);

        if (result.success) {
            registrationPasswordInMemory = password;
            clearRegistrationFields();

            // Save the newly created pending account.
            storePendingRegistration(
                result.user,
                username,
                email,
                result.verificationSent
            );

            // Activate only this new registration flow.
            activateRegistrationFlow(result.user);

            registrationSubmitting = false;
            setLoading(false);

            // Display the verification screen.
            showPendingVerification(
                result.user,
                result.verificationSent
            );

            if (result.verificationSent) {
                startVerificationResendTimer(result.user, true);
            }
        } else {
            registrationSubmitting = false;
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

window.addEventListener('pageshow', (event) => {
    if (
        event.persisted &&
        registrationCompleted &&
        !isActiveRegistrationFlow(auth.currentUser)
    ) {
        resetCompletedRegistrationUI();
    }
});

console.log('✅ Registration page ready (ES Module version)!');
console.log('🔥 Using the SAME Firebase instance as login.html');
