import { auth, db } from '../core/firebase-config.js';
import { isValidEmail, isValidUsername, isStrongPassword } from '../utils/validators.js';
import {
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
    sendEmailVerification, sendPasswordResetEmail, updateProfile, reload,
    fetchSignInMethodsForEmail, reauthenticateWithCredential,
    EmailAuthProvider, deleteUser, applyActionCode, checkActionCode,
    verifyPasswordResetCode, confirmPasswordReset, isSignInWithEmailLink,
    signInWithEmailLink as firebaseSignInWithEmailLink
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection, doc, getDoc, getDocs, query, where, limit,
    serverTimestamp, runTransaction
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

function clearAuthCache() {
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('firebase:authUser')) localStorage.removeItem(key);
        if (key.startsWith('firebase:previous_websocket_failures')) localStorage.removeItem(key);
    });
    sessionStorage.clear();
}

async function signInWithEmail(email, password) {
    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: cred.user };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

function normalizeUsername(username) {
    return String(username || '').trim().toLowerCase();
}

function getUsernameSnapshot(username) {
    return getDoc(doc(db, 'usernames', normalizeUsername(username)));
}

function findUsernameByEmail(email) {
    return getDocs(query(
        collection(db, 'usernames'),
        where('email', '==', email),
        limit(1)
    ));
}

async function checkUsernameExists(username) {
    try {
        const usernameSnapshot = await getUsernameSnapshot(username);
        return { success: true, exists: usernameSnapshot.exists() };
    } catch (error) {
        return {
            success: false,
            error: error.code === 'permission-denied' ? 'auth/username-check-unavailable' : error.code,
            message: error.message
        };
    }
}

async function checkRegisteredEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    try {
        const emailSnapshot = await findUsernameByEmail(normalizedEmail);
        return { success: true, exists: !emailSnapshot.empty };
    } catch (error) {
        return {
            success: false,
            error: error.code === 'permission-denied' ? 'auth/email-check-unavailable' : error.code,
            message: error.message
        };
    }
}

async function signInWithIdentifier(identifier, password) {
    const normalizedIdentifier = String(identifier || '').trim();
    let result;
    if (normalizedIdentifier.includes('@')) {
        result = await signInWithEmail(normalizedIdentifier.toLowerCase(), password);
    } else {
        try {
            const username = normalizeUsername(normalizedIdentifier);
            const usernameSnapshot = await getUsernameSnapshot(username);
            if (!usernameSnapshot.exists() || !usernameSnapshot.data().email) {
                return { success: false, error: 'auth/user-not-found' };
            }
            result = await signInWithEmail(usernameSnapshot.data().email, password);
        } catch (error) {
            return { success: false, error: error.code === 'permission-denied' ? 'auth/username-lookup-unavailable' : error.code, message: error.message };
        }
    }

    if (result.success && !result.user.emailVerified) {
        return { success: false, error: 'auth/account-pending', user: result.user };
    }

    return result;
}

async function registerWithUsername(username, email, password) {
    const cleanUsername = String(username || '').trim();
    const usernameLower = normalizeUsername(cleanUsername);
    const cleanEmail = String(email || '').trim().toLowerCase();
    const usernameRef = doc(db, 'usernames', usernameLower);

    if (!isValidUsername(usernameLower)) {
        return { success: false, error: 'auth/invalid-username' };
    }
    if (!isValidEmail(cleanEmail)) {
        return { success: false, error: 'auth/invalid-email' };
    }
    if (!isStrongPassword(password)) {
        return { success: false, error: 'auth/weak-password' };
    }

    try {
        const existingUsername = await getDoc(usernameRef);
        if (existingUsername.exists()) return { success: false, error: 'auth/username-already-in-use' };
    } catch (error) {
        return { success: false, error: error.code === 'permission-denied' ? 'auth/username-check-unavailable' : error.code, message: error.message };
    }

    let credential = null;
    try {
        credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(credential.user, { displayName: cleanUsername });

        const registrationUrl = new URL('../../pages/register.html', import.meta.url);
        let verificationSent = true;
        try {
            await sendEmailVerification(credential.user, { url: registrationUrl.href, handleCodeInApp: false });
        } catch (verificationError) {
            verificationSent = false;
        }
        return { success: true, user: credential.user, verificationSent };
    } catch (error) {
        if (credential?.user) {
            try { await deleteUser(credential.user); } catch { /* Best-effort rollback. */ }
        }
        return { success: false, error: error.code, message: error.message };
    }
}

async function checkRegistrationEmail(email, password) {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    try {
        const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
        if (!methods.length) return { success: true, status: 'available' };

        const result = await signInWithEmail(normalizedEmail, password);
        if (!result.success) {
            const completedAccount = await checkRegisteredEmail(normalizedEmail);
            return completedAccount.success && completedAccount.exists
                ? { success: true, status: 'completed' }
                : { success: false, error: result.error, message: result.message };
        }

        await reload(result.user);
        if (result.user.emailVerified) {
            await signOutUser();
            return { success: true, status: 'completed' };
        }

        return { success: true, status: 'pending', user: result.user };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

async function completeVerifiedRegistration(uid, registrationData) {
    const username = String(registrationData?.username || '').trim();
    const usernameLower = normalizeUsername(username);
    const email = String(registrationData?.email || '').trim().toLowerCase();

    if (!uid || !username || !email) return { success: false, error: 'auth/invalid-registration-data' };

    try {
        const user = auth.currentUser;
        if (!user || user.uid !== uid) return { success: false, error: 'auth/user-not-found' };
        await reload(user);
        if (!user.emailVerified) return { success: false, error: 'auth/email-not-verified' };

        const userRef = doc(db, 'users', uid);
        const usernameRef = doc(db, 'usernames', usernameLower);
        await runTransaction(db, async transaction => {
            const [userSnapshot, usernameSnapshot] = await Promise.all([
                transaction.get(userRef),
                transaction.get(usernameRef)
            ]);

            if (userSnapshot.exists() && usernameSnapshot.exists()) {
                const existingUser = userSnapshot.data();
                const existingUsername = usernameSnapshot.data();
                if (existingUsername.uid === uid && existingUser.email === email) return;
                const conflict = new Error('Registration already exists.');
                conflict.code = 'auth/registration-already-completed';
                throw conflict;
            }

            if (usernameSnapshot.exists() && usernameSnapshot.data().uid !== uid) {
                const usernameError = new Error('Username already exists.');
                usernameError.code = 'auth/username-already-in-use';
                throw usernameError;
            }

            transaction.set(userRef, {
                username,
                usernameLower,
                email,
                emailVerified: true,
                registrationStatus: 'active',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            }, { merge: true });
            transaction.set(usernameRef, { uid, email });
        });

        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

async function resetPasswordByIdentifier(identifier) {
    const cleanIdentifier = String(identifier || '').trim();
    const isEmail = cleanIdentifier.includes('@');
    const normalizedValue = isEmail ? cleanIdentifier.toLowerCase() : normalizeUsername(cleanIdentifier);

    if (isEmail) {
        try {
            const accountSnapshot = await findUsernameByEmail(normalizedValue);

            if (accountSnapshot.empty) {
                return { success: false, error: 'auth/user-not-found' };
            }

            const deliveryEmail = String(accountSnapshot.docs[0].data().email || '').trim().toLowerCase();
            if (!deliveryEmail) return { success: false, error: 'auth/user-not-found' };

            const result = await resetPassword(deliveryEmail);
            return result.success ? { ...result, deliveryEmail } : result;
        } catch (error) {
            return {
                success: false,
                error: 'auth/account-check-failed',
                message: error.message
            };
        }
    }

    try {
        const usernameSnapshot = await getUsernameSnapshot(normalizedValue);
        if (!usernameSnapshot.exists() || !usernameSnapshot.data().email) {
            return { success: false, error: 'auth/user-not-found' };
        }

        const deliveryEmail = String(usernameSnapshot.data().email).trim().toLowerCase();
        const result = await resetPassword(deliveryEmail);
        return result.success ? { ...result, deliveryEmail } : result;
    } catch (error) {
        return {
            success: false,
            error: 'auth/account-check-failed',
            message: error.message
        };
    }
}

async function signOutUser() {
    try {
        await signOut(auth);
        clearAuthCache();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

async function resetPassword(email) {
    try {
        const successPageUrl = new URL('../../pages/forgot-password.html?passwordChanged=true', import.meta.url);
        const settings = { url: successPageUrl.href, handleCodeInApp: false };
        await sendPasswordResetEmail(auth, email, settings);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

async function verifyPasswordResetAction(code) {
    try {
        const email = await verifyPasswordResetCode(auth, code);
        return { success: true, email };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

async function completePasswordReset(code, newPassword) {
    try {
        await confirmPasswordReset(auth, code, newPassword);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

async function resendVerification(user) {
    try {
        const target = user || auth.currentUser;
        if (!target) return { success: false, message: 'No user' };
        await reload(target);
        if (target.emailVerified) return { success: true, alreadyVerified: true };
        const registrationUrl = new URL('../../pages/register.html', import.meta.url);
        const settings = { url: registrationUrl.href, handleCodeInApp: false };
        await sendEmailVerification(target, settings);
        return { success: true, alreadyVerified: false };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

async function handleEmailVerification(code) {
    try {
        const info = await checkActionCode(auth, code);
        await applyActionCode(auth, code);
        return { success: true, email: info.data.email };
    } catch (e) {
        if (e.code === 'auth/expired-action-code') return { success: false, error: 'expired', message: 'Link expired.' };
        if (e.code === 'auth/invalid-action-code') return { success: false, error: 'invalid', message: 'Link invalid.' };
        return { success: false, error: e.code, message: e.message };
    }
}

async function checkActionCodeStatus(code) {
    try {
        const info = await checkActionCode(auth, code);
        return { success: true, data: { email: info.data.email, fromEmail: info.data.fromEmail, operation: info.operation } };
    } catch (e) {
        if (e.code === 'auth/expired-action-code') return { success: false, error: 'expired', message: 'Expired.' };
        if (e.code === 'auth/invalid-action-code') return { success: false, error: 'invalid', message: 'Invalid.' };
        return { success: false, error: e.code, message: e.message };
    }
}

async function updateUserProfile(displayName, photoURL = null) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user');
        const updates = {};
        if (displayName) updates.displayName = displayName;
        if (photoURL) updates.photoURL = photoURL;
        await updateProfile(user, updates);
        return { success: true, user };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function reauthenticateUser(password) {
    try {
        const user = auth.currentUser;
        if (!user || !user.email) throw new Error('No user or email');
        const cred = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, cred);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function deleteUserAccount() {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user');
        await deleteUser(user);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function changePassword(newPassword) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user');
        await user.updatePassword(newPassword);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function changeEmail(newEmail) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user');
        await user.updateEmail(newEmail);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

const emailCheckCache = new Map();
async function checkEmailExists(email) {
    if (emailCheckCache.has(email)) return emailCheckCache.get(email);
    try {
        const methods = await fetchSignInMethodsForEmail(auth, email);
        const exists = methods.length > 0;
        emailCheckCache.set(email, exists);
        setTimeout(() => emailCheckCache.delete(email), 5 * 60 * 1000);
        return exists;
    } catch (e) {
        return false;
    }
}

function getCurrentUser() { return auth.currentUser; }
function isLoggedIn() { return !!auth.currentUser; }
function isEmailVerified() { return auth.currentUser?.emailVerified || false; }

async function reloadUser() {
    try {
        await reload(auth.currentUser);
        return { success: true, user: auth.currentUser };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

// One entry point for page-level authentication flows. The named exports below
// keep existing callers compatible while page modules migrate to this service.
export class AuthService {
    login(identifier, password) { return signInWithIdentifier(identifier, password); }
    logout() { return signOutUser(); }
    register(username, email, password) { return registerWithUsername(username, email, password); }
    checkUsername(username) { return checkUsernameExists(username); }
    checkRegistrationEmail(email, password) { return checkRegistrationEmail(email, password); }
    completeRegistration(uid, data) { return completeVerifiedRegistration(uid, data); }
    sendPasswordReset(identifier) { return resetPasswordByIdentifier(identifier); }
    verifyResetCode(code) { return verifyPasswordResetAction(code); }
    completePasswordReset(code, password) { return completePasswordReset(code, password); }
    resendVerification(user) { return resendVerification(user); }
    reloadUser() { return reloadUser(); }
}

export const authService = new AuthService();

export {
    checkUsernameExists, checkRegisteredEmail,
    checkRegistrationEmail, completeVerifiedRegistration, 
    resetPasswordByIdentifier, signOutUser,
    resetPassword, verifyPasswordResetAction, completePasswordReset,
    resendVerification, handleEmailVerification,
    checkActionCodeStatus,
    updateUserProfile, reauthenticateUser, deleteUserAccount,
    changePassword, changeEmail, checkEmailExists, getCurrentUser,
    isLoggedIn, isEmailVerified, reloadUser
};
