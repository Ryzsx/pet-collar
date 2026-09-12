// =====================================================
// FIREBASE INIT – COMPACT & CLEAN
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    sendPasswordResetEmail,
    updateProfile,
    reload,
    fetchSignInMethodsForEmail,
    setPersistence,
    browserLocalPersistence,
    reauthenticateWithCredential,
    EmailAuthProvider,
    deleteUser,
    applyActionCode,
    checkActionCode,
    verifyPasswordResetCode,
    confirmPasswordReset,
    isSignInWithEmailLink,
    signInWithEmailLink as firebaseSignInWithEmailLink
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    onSnapshot,
    runTransaction,
    writeBatch,
    arrayUnion,
    arrayRemove,
    increment,
    FieldValue,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
    getStorage,
    ref,
    uploadBytes,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject,
    listAll,
    getMetadata
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyDlevN1yTTphNyW-ILvVrU2xBcrfadZZB8",
    authDomain: "smart-pet-collar-24818.firebaseapp.com",
    projectId: "smart-pet-collar-24818",
    storageBucket: "smart-pet-collar-24818.firebasestorage.app",
    messagingSenderId: "596089260489",
    appId: "1:596089260489:web:20358a460725ae342507a8",
    measurementId: "G-0BWRWZQ3HZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

(async () => {
    try {
        await setPersistence(auth, browserLocalPersistence);
        console.log('✅ Auth persistence set to LOCAL');
    } catch (e) {
        console.warn('⚠️ Could not set persistence:', e);
    }
})();

console.log('✅ Firebase initialized');

// ------------------------------------------------------------
// AUTH FUNCTIONS
// ------------------------------------------------------------
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

async function checkUsernameExists(username) {
    try {
        const usernameSnapshot = await getDoc(doc(db, 'usernames', normalizeUsername(username)));
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
        const emailSnapshot = await getDocs(query(
            collection(db, 'usernames'),
            where('email', '==', normalizedEmail),
            limit(1)
        ));
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
            const usernameSnapshot = await getDoc(doc(db, 'usernames', username));
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

    if (!/^[a-z0-9_]{3,30}$/.test(usernameLower)) {
        return { success: false, error: 'auth/invalid-username' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return { success: false, error: 'auth/invalid-email' };
    }
    if (!(password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9\s]/.test(password))) {
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

        const registrationUrl = new URL('../pages/register.html', import.meta.url);
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
            const accountSnapshot = await getDocs(query(
                collection(db, 'usernames'),
                where('email', '==', normalizedValue),
                limit(1)
            ));

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
        const usernameSnapshot = await getDoc(doc(db, 'usernames', normalizedValue));
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
        const successPageUrl = new URL('../pages/password-reset-success.html', import.meta.url);
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
        const registrationUrl = new URL('../pages/register.html', import.meta.url);
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

async function handlePasswordReset(code, newPassword) {
    try {
        const email = await verifyPasswordResetCode(auth, code);
        await confirmPasswordReset(auth, code, newPassword);
        return { success: true, email };
    } catch (e) {
        if (e.code === 'auth/expired-action-code') return { success: false, error: 'expired', message: 'Reset link expired.' };
        if (e.code === 'auth/invalid-action-code') return { success: false, error: 'invalid', message: 'Reset link invalid.' };
        return { success: false, error: e.code, message: e.message };
    }
}

async function signInWithMagicLink(email, link) {
    try {
        const cred = await firebaseSignInWithEmailLink(auth, email, link);
        return { success: true, user: cred.user };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

function isEmailLink(url) {
    return isSignInWithEmailLink(auth, url);
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

let connectionTimeout = null;
function monitorConnection(callback) {
    let online = navigator.onLine;
    let connected = false;
    let unsub = null;

    const handleOnline = () => {
        online = true;
        if (callback) callback({ online, connected });
    };
    const handleOffline = () => {
        online = false;
        if (callback) callback({ online, connected });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    unsub = onSnapshot(doc(db, 'connection', 'status'),
        () => {
            connected = true;
            if (callback) callback({ online, connected: true });
        },
        (err) => {
            console.error('Firestore connection error:', err);
            connected = false;
            if (callback) callback({ online: navigator.onLine, connected: false });
        }
    );

    if (connectionTimeout) clearTimeout(connectionTimeout);
    connectionTimeout = setTimeout(() => {
        if (callback) callback({ online, connected });
        connectionTimeout = null;
    }, 1000);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        if (unsub) unsub();
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
    };
}

// ------------------------------------------------------------
// FIRESTORE HELPERS
// ------------------------------------------------------------
async function saveUserData(uid, data) {
    try {
        await setDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function getUserData(uid) {
    try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) return { success: true, data: { id: snap.id, ...snap.data() } };
        return { success: false, message: 'Not found' };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function savePet(data, uid) {
    try {
        const ref = await addDoc(collection(db, 'pets'), { ...data, userId: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        return { success: true, id: ref.id };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function updatePet(id, data) {
    try {
        await updateDoc(doc(db, 'pets', id), { ...data, updatedAt: serverTimestamp() });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function deletePet(id) {
    try {
        await deleteDoc(doc(db, 'pets', id));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function getPet(id) {
    try {
        const snap = await getDoc(doc(db, 'pets', id));
        if (snap.exists()) return { success: true, pet: { id: snap.id, ...snap.data() } };
        return { success: false, message: 'Not found' };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function getPetsForUser(uid) {
    try {
        const q = query(collection(db, 'pets'), where('userId', '==', uid), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const pets = [];
        snap.forEach(d => pets.push({ id: d.id, ...d.data() }));
        return { success: true, pets };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function saveLocation(data, uid) {
    try {
        const ref = await addDoc(collection(db, 'locations'), { ...data, userId: uid, timestamp: serverTimestamp() });
        return { success: true, id: ref.id };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function getLocationHistory(uid, limitCount = 50) {
    try {
        const q = query(collection(db, 'locations'), where('userId', '==', uid), orderBy('timestamp', 'desc'), limit(limitCount));
        const snap = await getDocs(q);
        const locations = [];
        snap.forEach(d => locations.push({ id: d.id, ...d.data() }));
        return { success: true, locations };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

function listenToLocations(uid, cb) {
    const q = query(collection(db, 'locations'), where('userId', '==', uid), orderBy('timestamp', 'desc'), limit(20));
    return onSnapshot(q, snap => {
        const locations = [];
        snap.forEach(d => locations.push({ id: d.id, ...d.data() }));
        if (cb) cb(locations);
    }, err => {
        if (cb) cb(null, err);
    });
}

// ------------------------------------------------------------
// STORAGE HELPERS
// ------------------------------------------------------------
async function uploadPetImage(file, uid, petId = null, onProgress = null, saveToFirestore = false) {
    try {
        const ts = Date.now();
        const ext = file.name.split('.').pop();
        const name = `${ts}.${ext}`;
        let path = `users/${uid}/pets/`;
        if (petId) path += `${petId}/images/${name}`;
        else path += `images/${name}`;
        const storageRef = ref(storage, path);
        let task;
        if (onProgress) {
            task = uploadBytesResumable(storageRef, file);
            await new Promise((resolve, reject) => {
                task.on('state_changed',
                    snap => onProgress((snap.bytesTransferred / snap.totalBytes) * 100),
                    err => reject(err),
                    () => resolve()
                );
            });
        } else {
            await uploadBytes(storageRef, file);
        }
        const url = await getDownloadURL(storageRef);
        if (saveToFirestore && petId) {
            await updateDoc(doc(db, 'pets', petId), { imageUrl: url, updatedAt: serverTimestamp() });
        }
        return { success: true, url, path, name };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function uploadProfileImage(file, uid) {
    try {
        const ts = Date.now();
        const ext = file.name.split('.').pop();
        const name = `profile_${ts}.${ext}`;
        const path = `users/${uid}/profile/${name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        await updateProfile(auth.currentUser, { photoURL: url });
        await setDoc(doc(db, 'users', uid), { profileImage: url, updatedAt: serverTimestamp() }, { merge: true });
        return { success: true, url, path };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function deleteImage(path) {
    try {
        await deleteObject(ref(storage, path));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

async function getPetImages(uid, petId) {
    try {
        const path = `users/${uid}/pets/${petId}/images/`;
        const result = await listAll(ref(storage, path));
        const images = await Promise.all(result.items.map(async item => {
            const url = await getDownloadURL(item);
            const meta = await getMetadata(item);
            return { url, name: item.name, size: meta.size, contentType: meta.contentType, created: meta.timeCreated };
        }));
        return { success: true, images };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

// ------------------------------------------------------------
// UTILITIES
// ------------------------------------------------------------
function getServerTimestamp() { return serverTimestamp(); }
function timestampToDate(ts) { return ts instanceof Timestamp ? ts.toDate() : ts; }
function formatDate(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d)) return 'Invalid';
    return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
}
function timeAgo(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d)) return 'Invalid';
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
    return `${Math.floor(diff / 31536000)}y ago`;
}

// ------------------------------------------------------------
// ✅ SINGLE EXPORT – NO DUPLICATES
// ------------------------------------------------------------
export {
    // Firebase instances
    app,
    auth,
    db,
    storage,
    // Auth
    onAuthStateChanged,
    signInWithEmail,
    signInWithIdentifier,
    checkUsernameExists,
    checkRegisteredEmail,
    registerWithUsername,
    checkRegistrationEmail,
    completeVerifiedRegistration,
    signOutUser as signOut,
    resetPassword,
    resetPasswordByIdentifier,
    verifyPasswordResetAction,
    completePasswordReset,
    resendVerification,
    handleEmailVerification,
    handlePasswordReset,
    checkActionCodeStatus,
    signInWithMagicLink,
    isEmailLink,
    updateUserProfile,
    reauthenticateUser,
    deleteUserAccount,
    changePassword,
    changeEmail,
    checkEmailExists,
    getCurrentUser,
    isLoggedIn,
    isEmailVerified,
    reloadUser,
    monitorConnection,
    clearAuthCache,
    // Firestore
    collection,
    doc,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    onSnapshot,
    runTransaction,
    writeBatch,
    arrayUnion,
    arrayRemove,
    increment,
    FieldValue,
    Timestamp,
    saveUserData,
    getUserData,
    savePet,
    updatePet,
    deletePet,
    getPet,
    getPetsForUser,
    saveLocation,
    getLocationHistory,
    listenToLocations,
    // Storage
    ref,
    uploadBytes,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject,
    listAll,
    getMetadata,
    uploadPetImage,
    uploadProfileImage,
    deleteImage,
    getPetImages,
    // Utilities
    getServerTimestamp,
    timestampToDate,
    formatDate,
    timeAgo
};

console.log('✅ firebase-init.js loaded – no duplicates.');
