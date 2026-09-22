import {
    handleEmailVerification
} from './firebase-init.js';
import { authService } from './services/AuthService.js';
import { isValidEmail, isValidUsername, isStrongPassword, passwordRules } from './utils/validators.js';

const requestSection = document.getElementById('requestResetSection');
const requestEntryState = document.getElementById('requestEntryState');
const emailSentState = document.getElementById('emailSentState');
const changeSection = document.getElementById('changePasswordSection');
const requestForm = document.getElementById('requestResetForm');
const changeForm = document.getElementById('changePasswordForm');
const identifierInput = document.getElementById('resetIdentifier');
const identifierError = document.getElementById('identifierError');
const requestStatus = document.getElementById('requestStatus');
const resendStatus = document.getElementById('resendStatus');
const resendCountdown = document.getElementById('resendCountdown');
const sentEmailAccount = document.getElementById('sentEmailAccount');
const changeStatus = document.getElementById('changeStatus');
const verificationState = document.getElementById('verificationState');
const verificationTitle = document.getElementById('verificationTitle');
const verificationMessage = document.getElementById('verificationMessage');
const changeTitle = document.getElementById('changePasswordTitle');
const changeIntro = document.getElementById('changePasswordIntro');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const sendResetButton = document.getElementById('sendResetButton');
const sendResetLabel = sendResetButton.querySelector('.button-label');
const resendResetButton = document.getElementById('resendResetButton');
const changePasswordButton = document.getElementById('changePasswordButton');
const resetLinkError = document.getElementById('resetLinkError');
const requestNewResetButton = document.getElementById('requestNewResetButton');
const resetSuccess = document.getElementById('resetSuccess');
const actionResultIcon = document.getElementById('actionResultIcon');
const actionResultTitle = document.getElementById('actionResultTitle');
const actionResultMessage = document.getElementById('actionResultMessage');

let verifiedOobCode = '';
let lastResetIdentifier = '';
let resendTimer = null;
let resendAttempts = 0;
const resendDelaySeconds = 60;
const maxResendAttempts = 3;

function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status-message show ${type}`;
}

function clearStatus(element) {
    element.textContent = '';
    element.className = 'status-message';
}

function setButtonLoading(button, loading) {
    button.disabled = loading;
    button.classList.toggle('loading', loading);
}

function setInputInvalid(input, invalid) {
    input.closest('.input-shell')?.classList.toggle('invalid', invalid);
    input.setAttribute('aria-invalid', String(invalid));
}

function clearRequestFields() {
    requestForm.reset();
    setInputInvalid(identifierInput, false);
    identifierError.textContent = '';
}

function clearPasswordFields() {
    changeForm.reset();
    newPasswordInput.type = 'password';
    confirmPasswordInput.type = 'password';
    setInputInvalid(newPasswordInput, false);
    setInputInvalid(confirmPasswordInput, false);
    document.querySelectorAll('[data-password-toggle]').forEach(button => {
        const input = document.getElementById(button.dataset.passwordToggle);
        button.setAttribute('aria-label', `Show ${input.id === 'newPassword' ? 'new' : 'confirmed'} password`);
        button.querySelector('i').className = 'bi bi-eye';
    });
    updatePasswordRequirements();
}

function updatePasswordRequirements() {
    const password = newPasswordInput.value;
    Object.entries(passwordRules).forEach(([rule, validator]) => {
        const item = document.querySelector(`[data-rule="${rule}"]`);
        if (!item) return;
        const valid = validator(password);
        item.classList.toggle('valid', valid);
        item.querySelector('i').className = `bi ${valid ? 'bi-check-circle-fill' : 'bi-circle'}`;
    });
}

function getRequestErrorMessage(errorCode) {
    if (errorCode === 'auth/user-not-found') return 'No account was found with that username or email.';
    if (errorCode === 'auth/network-request-failed') return 'Check your connection and try again.';
    if (errorCode === 'auth/too-many-requests') return 'Too many attempts were made. Please wait a few minutes and try again.';
    if (errorCode === 'auth/account-check-failed') return 'The account could not be checked. Please try again.';
    if (errorCode === 'auth/username-lookup-unavailable') return 'Password recovery is temporarily unavailable. Please try again later.';
    if (errorCode === 'auth/unauthorized-continue-uri' || errorCode === 'auth/invalid-continue-uri' || errorCode === 'auth/missing-continue-uri') {
        return 'The reset service is not configured for this website. Please contact the administrator.';
    }
    return 'Please try again.';
}

function stopResendTimer() {
    if (resendTimer) window.clearInterval(resendTimer);
    resendTimer = null;
}

function startResendTimer() {
    stopResendTimer();
    let secondsRemaining = resendDelaySeconds;
    resendResetButton.disabled = true;

    const updateCountdown = () => {
        resendResetButton.querySelector('.button-label').textContent = `Resend new link in ${secondsRemaining}s`;
    };

    updateCountdown();
    resendTimer = window.setInterval(() => {
        secondsRemaining -= 1;
        if (secondsRemaining <= 0) {
            stopResendTimer();
            resendCountdown.textContent = '';
            if (resendAttempts >= maxResendAttempts) {
                resendResetButton.querySelector('.button-label').textContent = 'Resend New Link';
                return;
            }
            resendResetButton.querySelector('.button-label').textContent = 'Resend New Link';
            resendResetButton.disabled = false;
            return;
        }
        updateCountdown();
    }, 1000);
}

function maskEmail(email) {
    const [localPart, domain] = String(email || '').split('@');
    if (!localPart || !domain) return 'the email linked to your account';
    const visibleCharacters = Math.min(2, localPart.length);
    const visiblePart = localPart.slice(0, visibleCharacters);
    const maskedPart = '*'.repeat(Math.max(3, localPart.length - visibleCharacters));
    return `${visiblePart}${maskedPart}@${domain}`;
}

function showEmailSentState(identifier, deliveryEmail) {
    lastResetIdentifier = identifier;
    resendAttempts = 0;
    sentEmailAccount.textContent = identifier.includes('@')
        ? identifier.toLowerCase()
        : maskEmail(deliveryEmail);
    requestEntryState.hidden = true;
    emailSentState.hidden = false;
    clearStatus(resendStatus);
    startResendTimer();
}

function showRequestState(clearUrl = false) {
    requestSection.hidden = false;
    requestEntryState.hidden = false;
    emailSentState.hidden = true;
    changeSection.hidden = true;
    verifiedOobCode = '';
    resendAttempts = 0;
    stopResendTimer();
    clearStatus(requestStatus);
    clearStatus(resendStatus);
    sendResetLabel.textContent = 'Send Reset Link';
    resendResetButton.querySelector('.button-label').textContent = 'Resend New Link';
    if (clearUrl) window.history.replaceState({}, document.title, window.location.pathname);
    window.setTimeout(() => identifierInput.focus(), 0);
}

function showInvalidResetLink() {
    verificationState.hidden = true;
    changeForm.hidden = true;
    resetSuccess.hidden = true;
    resetLinkError.hidden = false;
    changeTitle.innerHTML = 'Change <span>Password</span>';
    changeIntro.textContent = 'This reset request cannot be completed.';
    showStatus(changeStatus, 'This password reset link is invalid or has expired. Please request a new password reset link.', 'error');
}

function showPasswordResetSuccess() {
    requestSection.hidden = true;
    changeSection.hidden = false;
    verificationState.hidden = true;
    changeForm.hidden = true;
    resetLinkError.hidden = true;
    resetSuccess.hidden = false;
    clearStatus(changeStatus);
    clearPasswordFields();
    changeTitle.innerHTML = 'Password <span>Changed</span>';
    changeIntro.textContent = 'Your account password is ready to use.';
    actionResultIcon.className = 'bi bi-check2';
    actionResultTitle.textContent = 'Password successfully changed';
    actionResultMessage.textContent = 'Your new password has been saved. You can now use it to sign in.';
}

async function verifyResetLink(oobCode) {
    const result = await authService.verifyResetCode(oobCode);
    verificationState.hidden = true;

    if (!result.success) {
        if (result.error === 'auth/network-request-failed') {
            verificationState.hidden = true;
            changeForm.hidden = true;
            resetLinkError.hidden = false;
            changeIntro.textContent = 'The reset link could not be verified yet.';
            showStatus(changeStatus, 'A network error occurred while verifying the reset link. Check your connection and reload this page, or request a new link.', 'error');
            return;
        }
        showInvalidResetLink();
        return;
    }

    verifiedOobCode = oobCode;
    changeForm.hidden = false;
    resetLinkError.hidden = true;
    changeTitle.innerHTML = 'Password Reset <span>Verified</span>';
    changeIntro.textContent = 'You can now create a new password.';
    showStatus(changeStatus, 'Password reset verified. You can now change your password.', 'success');
    newPasswordInput.focus();
}

async function handleVerificationLink(oobCode, actionMode) {
    requestSection.hidden = true;
    changeSection.hidden = false;
    changeForm.hidden = true;
    resetLinkError.hidden = true;
    resetSuccess.hidden = true;
    verificationState.hidden = false;
    changeTitle.innerHTML = actionMode === 'recoverEmail' ? 'Confirm <span>Email Recovery</span>' : 'Verify <span>Email</span>';
    changeIntro.textContent = 'Firebase is verifying this secure account link.';
    verificationTitle.textContent = 'Verifying account link';
    verificationMessage.textContent = 'Please wait while Firebase confirms this request.';

    if (!oobCode) {
        verificationState.hidden = true;
        showStatus(changeStatus, 'This account link is invalid or has expired. Please return to login and request a new link.', 'error');
        return;
    }

    const result = await handleEmailVerification(oobCode);
    verificationState.hidden = true;
    resetSuccess.hidden = false;
    actionResultIcon.className = `bi ${result.success ? 'bi-check2' : 'bi-exclamation-lg'}`;
    actionResultTitle.textContent = result.success
        ? (actionMode === 'recoverEmail' ? 'Email restored' : 'Email verified')
        : 'Link unavailable';
    actionResultMessage.textContent = result.success
        ? (actionMode === 'recoverEmail'
            ? 'Your account email has been restored successfully. You can now return to login.'
            : 'Your email has been verified successfully. You can now return to login.')
        : 'This account link is invalid or has expired. Please return to login and request a new link.';
}

requestForm.addEventListener('submit', async event => {
    event.preventDefault();
    clearStatus(requestStatus);
    identifierError.textContent = '';

    const identifier = identifierInput.value.trim();
    if (!identifier) {
        setInputInvalid(identifierInput, true);
        identifierError.textContent = 'Please enter your email or username.';
        identifierInput.focus();
        return;
    }

    const isEmail = identifier.includes('@');
    if ((isEmail && !isValidEmail(identifier)) || (!isEmail && !isValidUsername(identifier))) {
        setInputInvalid(identifierInput, true);
        identifierError.textContent = isEmail
            ? 'Please enter a valid email address.'
            : 'Use 3-30 letters, numbers, or underscores.';
        identifierInput.focus();
        return;
    }

    setInputInvalid(identifierInput, false);
    sendResetLabel.textContent = 'Send Reset Link';
    setButtonLoading(sendResetButton, true);
    const result = await authService.sendPasswordReset(identifier);
    setButtonLoading(sendResetButton, false);
    clearRequestFields();

    if (result.success) {
        showEmailSentState(identifier, result.deliveryEmail);
        return;
    }

    sendResetLabel.textContent = 'Try Again';
    showStatus(requestStatus, `Unable to send reset link. ${getRequestErrorMessage(result.error)}`, 'error');
});

identifierInput.addEventListener('input', () => {
    setInputInvalid(identifierInput, false);
    identifierError.textContent = '';
    sendResetLabel.textContent = 'Send Reset Link';
});

resendResetButton.addEventListener('click', async () => {
    if (!lastResetIdentifier || resendResetButton.disabled) return;

    clearStatus(resendStatus);
    setButtonLoading(resendResetButton, true);
    const result = await authService.sendPasswordReset(lastResetIdentifier);
    setButtonLoading(resendResetButton, false);

    if (result.success) {
        resendAttempts += 1;
        showStatus(resendStatus, 'A new reset link was sent. Check your email.', 'success');
        if (resendAttempts >= maxResendAttempts) {
            resendResetButton.disabled = true;
            resendResetButton.querySelector('.button-label').textContent = 'Resend New Link';
            showStatus(resendStatus, 'The 3 attempts have been used', 'error');
            stopResendTimer();
            return;
        }
        startResendTimer();
        return;
    }

    resendResetButton.querySelector('.button-label').textContent = 'Resend New Link';
    showStatus(resendStatus, `Unable to send reset link. ${getRequestErrorMessage(result.error)}`, 'error');
});

newPasswordInput.addEventListener('input', () => {
    setInputInvalid(newPasswordInput, false);
    updatePasswordRequirements();
});

confirmPasswordInput.addEventListener('input', () => setInputInvalid(confirmPasswordInput, false));

changeForm.addEventListener('submit', async event => {
    event.preventDefault();
    clearStatus(changeStatus);

    const newPassword = newPasswordInput.value;
    const confirmedPassword = confirmPasswordInput.value;
    updatePasswordRequirements();

    if (!verifiedOobCode) {
        showInvalidResetLink();
        return;
    }
    if (!isStrongPassword(newPassword)) {
        setInputInvalid(newPasswordInput, true);
        showStatus(changeStatus, 'Use at least 8 characters with one uppercase letter, one lowercase letter, one number, and one special character.', 'error');
        newPasswordInput.focus();
        return;
    }
    if (newPassword !== confirmedPassword) {
        setInputInvalid(confirmPasswordInput, true);
        showStatus(changeStatus, 'Passwords do not match.', 'error');
        confirmPasswordInput.focus();
        return;
    }

    setInputInvalid(newPasswordInput, false);
    setInputInvalid(confirmPasswordInput, false);
    setButtonLoading(changePasswordButton, true);
    const result = await authService.completePasswordReset(verifiedOobCode, newPassword);
    setButtonLoading(changePasswordButton, false);
    clearPasswordFields();

    if (result.success) {
        verifiedOobCode = '';
        showPasswordResetSuccess();
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    if (result.error === 'auth/expired-action-code' || result.error === 'auth/invalid-action-code') {
        showInvalidResetLink();
        return;
    }
    if (result.error === 'auth/weak-password') {
        showStatus(changeStatus, 'The password is too weak. Please meet all of the password requirements.', 'error');
        return;
    }
    if (result.error === 'auth/network-request-failed') {
        showStatus(changeStatus, 'A network error occurred. Check your connection and try again.', 'error');
        return;
    }
    showStatus(changeStatus, 'Your password could not be changed. Please try again or request a new reset link.', 'error');
});

document.querySelectorAll('[data-password-toggle]').forEach(button => {
    button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        button.setAttribute('aria-label', `${showing ? 'Show' : 'Hide'} ${input.id === 'newPassword' ? 'new' : 'confirmed'} password`);
        button.querySelector('i').className = `bi ${showing ? 'bi-eye' : 'bi-eye-slash'}`;
    });
});

requestNewResetButton.addEventListener('click', () => {
    clearStatus(changeStatus);
    showRequestState(true);
});

const savedIdentifier = localStorage.getItem('forgotPasswordIdentifier') || localStorage.getItem('forgotPasswordUsername');
if (savedIdentifier) {
    identifierInput.value = savedIdentifier;
    localStorage.removeItem('forgotPasswordIdentifier');
    localStorage.removeItem('forgotPasswordUsername');
}

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');
const oobCode = params.get('oobCode');
const resetCompleted = params.get('passwordChanged') === 'true' || params.get('reset') === 'complete';

if (mode === 'resetPassword') {
    requestSection.hidden = true;
    changeSection.hidden = false;
    if (oobCode) verifyResetLink(oobCode);
    else showInvalidResetLink();
} else if (mode === 'verifyEmail' || mode === 'recoverEmail') {
    handleVerificationLink(oobCode, mode);
} else if (resetCompleted) {
    showPasswordResetSuccess();
    window.history.replaceState({}, document.title, window.location.pathname);
} else {
    showRequestState();
}
