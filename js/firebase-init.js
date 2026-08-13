// =====================================================
// FIREBASE INITIALIZATION
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    sendEmailVerification,
    sendPasswordResetEmail,
    updateProfile,
    reload,
    fetchSignInMethodsForEmail,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    inMemoryPersistence,
    reauthenticateWithPopup,
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

// =====================================================
// CONFIGURATION
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyDlevN1yTTphNyW-ILvVrU2xBcrfadZZB8",
    authDomain: "smart-pet-collar-24818.firebaseapp.com",
    projectId: "smart-pet-collar-24818",
    storageBucket: "smart-pet-collar-24818.firebasestorage.app",
    messagingSenderId: "596089260489",
    appId: "1:596089260489:web:20358a460725ae342507a8",
    measurementId: "G-0BWRWZQ3HZ"
};

// =====================================================
// INITIALIZE
// =====================================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

// Set persistence
try {
    await setPersistence(auth, browserLocalPersistence);
    console.log('✅ Auth persistence set to LOCAL');
} catch (e) {
    console.warn('⚠️ Could not set persistence:', e);
}

console.log('✅ Firebase initialized successfully');

// =====================================================
// EXPORTED FUNCTIONS
// =====================================================

export function clearAuthCache() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith('firebase:authUser')) localStorage.removeItem(key);
        if (key.startsWith('firebase:previous_websocket_failures')) localStorage.removeItem(key);
    });
    sessionStorage.clear();
    console.log('🧹 Auth cache cleared.');
}

export async function signInWithEmail(email, password) {
    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: cred.user };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

export async function registerWithEmail(email, password, displayName = '') {
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) await updateProfile(cred.user, { displayName });
        const settings = { url: window.location.origin + '/pages/verify-email.html', handleCodeInApp: true };
        await sendEmailVerification(cred.user, settings);
        return { success: true, user: cred.user };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

// ✅ SIGN IN WITH GOOGLE - EXPORTED CORRECTLY
export async function signInWithGoogle() {
    try {
        clearAuthCache();
        const result = await signInWithPopup(auth, provider);
        return { success: true, user: result.user };
    } catch (error) {
        console.error('❌ Google sign-in error:', error);
        return { success: false, error: error.code, message: error.message };
    }
}

// ✅ SIGN OUT - EXPORTED CORRECTLY
export async function signOutUser() {
    try {
        await signOut(auth);
        clearAuthCache();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

export async function resetPassword(email) {
    try {
        const settings = { url: window.location.origin + '/pages/login.html', handleCodeInApp: true };
        await sendPasswordResetEmail(auth, email, settings);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

export async function resendVerification(user) {
    try {
        const target = user || auth.currentUser;
        if (!target) return { success: false, message: 'No user' };
        await reload(target);
        if (target.emailVerified) return { success: true, alreadyVerified: true };
        const settings = { url: window.location.origin + '/pages/verify-email.html', handleCodeInApp: true };
        await sendEmailVerification(target, settings);
        return { success: true, alreadyVerified: false };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

export async function handleEmailVerification(code) {
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

export async function handlePasswordReset(code, newPassword) {
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

export async function signInWithMagicLink(email, link) {
    try {
        const cred = await firebaseSignInWithEmailLink(auth, email, link);
        return { success: true, user: cred.user };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

export function isEmailLink(url) {
    return isSignInWithEmailLink(auth, url);
}

export async function checkActionCodeStatus(code) {
    try {
        const info = await checkActionCode(auth, code);
        return { success: true, data: { email: info.data.email, fromEmail: info.data.fromEmail, operation: info.operation } };
    } catch (e) {
        if (e.code === 'auth/expired-action-code') return { success: false, error: 'expired', message: 'Expired.' };
        if (e.code === 'auth/invalid-action-code') return { success: false, error: 'invalid', message: 'Invalid.' };
        return { success: false, error: e.code, message: e.message };
    }
}

export async function updateUserProfile(displayName, photoURL = null) {
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

export async function reauthenticateUser(password) {
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

export async function reauthenticateWithGoogle() {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user');
        await reauthenticateWithPopup(user, provider);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

export async function deleteUserAccount() {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user');
        await deleteUser(user);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

export async function changePassword(newPassword) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user');
        await user.updatePassword(newPassword);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

export async function changeEmail(newEmail) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user');
        await user.updateEmail(newEmail);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

export async function checkEmailExists(email) {
    try {
        const methods = await fetchSignInMethodsForEmail(auth, email);
        return methods.length > 0;
    } catch (e) {
        return false;
    }
}

export function getCurrentUser() { return auth.currentUser; }
export function isLoggedIn() { return !!auth.currentUser; }
export function isEmailVerified() { return auth.currentUser?.emailVerified || false; }

export async function reloadUser() {
    try {
        await reload(auth.currentUser);
        return { success: true, user: auth.currentUser };
    } catch (e) {
        return { success: false, error: e.code, message: e.message };
    }
}

export function monitorConnection(callback) {
    let online = navigator.onLine;
    let connected = false;
    const handleOnline = () => { online = true; if (callback) callback({ online, connected }); };
    const handleOffline = () => { online = false; if (callback) callback({ online, connected }); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const unsub = onSnapshot(doc(db, 'connection', 'status'),
        () => { connected = true; if (callback) callback({ online, connected: true }); },
        () => { connected = false; if (callback) callback({ online, connected: false }); }
    );
    if (callback) setTimeout(() => callback({ online, connected }), 1000);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); unsub(); };
}

// =====================================================
// FIRESTORE HELPERS
// =====================================================

export async function saveUserData(uid, data) {
    try { await setDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true }); return { success: true }; }
    catch (e) { return { success: false, error: e.code, message: e.message }; }
}

export async function getUserData(uid) {
    try { const snap = await getDoc(doc(db, 'users', uid)); if (snap.exists()) return { success: true, data: { id: snap.id, ...snap.data() } }; return { success: false, message: 'Not found' }; }
    catch (e) { return { success: false, error: e.code, message: e.message }; }
}

export async function savePet(data, uid) {
    try { const ref = await addDoc(collection(db, 'pets'), { ...data, userId: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); return { success: true, id: ref.id }; }
    catch (e) { return { success: false, error: e.code, message: e.message }; }
}

export async function updatePet(id, data) {
    try { await updateDoc(doc(db, 'pets', id), { ...data, updatedAt: serverTimestamp() }); return { success: true }; }
    catch (e) { return { success: false, error: e.code, message: e.message }; }
}

export async function deletePet(id) {
    try { await deleteDoc(doc(db, 'pets', id)); return { success: true }; }
    catch (e) { return { success: false, error: e.code, message: e.message }; }
}

export async function getPet(id) {
    try { const snap = await getDoc(doc(db, 'pets', id)); if (snap.exists()) return { success: true, pet: { id: snap.id, ...snap.data() } }; return { success: false, message: 'Not found' }; }
    catch (e) { return { success: false, error: e.code, message: e.message }; }
}

export async function getPetsForUser(uid) {
    try { const q = query(collection(db, 'pets'), where('userId', '==', uid), orderBy('createdAt', 'desc')); const snap = await getDocs(q); const pets = []; snap.forEach(d => pets.push({ id: d.id, ...d.data() })); return { success: true, pets }; }
    catch (e) { return { success: false, error: e.code, message: e.message }; }
}

export async function saveLocation(data, uid) {
    try { const ref = await addDoc(collection(db, 'locations'), { ...data, userId: uid, timestamp: serverTimestamp() }); return { success: true, id: ref.id }; }
    catch (e) { return { success: false, error: e.code, message: e.message }; }
}

export async function getLocationHistory(uid, limitCount = 50) {
    try { const q = query(collection(db, 'locations'), where('userId', '==', uid), orderBy('timestamp', 'desc'), limit(limitCount)); const snap = await getDocs(q); const locations = []; snap.forEach(d => locations.push({ id: d.id, ...d.data() })); return { success: true, locations }; }
    catch (e) { return { success: false, error: e.code, message: e.message }; }
}

export function listenToLocations(uid, cb) {
    const q = query(collection(db, 'locations'), where('userId', '==', uid), orderBy('timestamp', 'desc'), limit(20));
    return onSnapshot(q, snap => { const locations = []; snap.forEach(d => locations.push({ id: d.id, ...d.data() })); if (cb) cb(locations); }, err => { if (cb) cb(null, err); });
}

// =====================================================
// STORAGE HELPERS
// =====================================================

export async function uploadPetImage(file, uid, petId = null, onProgress = null) {
    try {
        const ts = Date.now();
        const ext = file.name.split('.').pop();
        const name = `${ts}.${ext}`;
        let path = `users/${uid}/pets/`;
        if (petId) path += `${petId}/images/${name}`;
        else path += `images/${name}`;
        const ref = ref(storage, path);
        let task;
        if (onProgress) {
            task = uploadBytesResumable(ref, file);
            await new Promise((resolve, reject) => {
                task.on('state_changed',
                    snap => onProgress((snap.bytesTransferred / snap.totalBytes) * 100),
                    err => reject(err),
                    () => resolve()
                );
            });
        } else {
            await uploadBytes(ref, file);
        }
        const url = await getDownloadURL(ref);
        return { success: true, url, path, name };
    } catch (e) { return { success: false, error: e.code, message: e.message }; }
}

export async function uploadProfileImage(file, uid) {
    try {
        const ts = Date.now();
        const ext = file.name.split('.').pop();
        const name = `profile_${ts}.${ext}`;
        const path = `users/${uid}/profile/${name}`;
        const ref = ref(storage, path);
        await uploadBytes(ref, file);
        const url = await getDownloadURL(ref);
        return { success: true, url, path };
    } catch (e) { return { success: false, error: e.code, message: e.message }; }
}

export async function deleteImage(path) {
    try { await deleteObject(ref(storage, path)); return { success: true }; }
    catch (e) { return { success: false, error: e.code, message: e.message }; }
}

export async function getPetImages(uid, petId) {
    try {
        const path = `users/${uid}/pets/${petId}/images/`;
        const result = await listAll(ref(storage, path));
        const images = await Promise.all(result.items.map(async item => {
            const url = await getDownloadURL(item);
            const meta = await getMetadata(item);
            return { url, name: item.name, size: meta.size, contentType: meta.contentType, created: meta.timeCreated };
        }));
        return { success: true, images };
    } catch (e) { return { success: false, error: e.code, message: e.message }; }
}

// =====================================================
// UTILITIES
// =====================================================

export function getServerTimestamp() { return serverTimestamp(); }
export function timestampToDate(ts) { return ts instanceof Timestamp ? ts.toDate() : ts; }
export function formatDate(date) { if (!date) return 'N/A'; const d = new Date(date); if (isNaN(d)) return 'Invalid'; return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true }); }
export function timeAgo(date) {
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

// =====================================================
// FINAL EXPORT LIST (EVERYTHING)
// =====================================================

export {
    app,
    auth,
    db,
    storage,
    provider,
    onAuthStateChanged,
    signInWithEmail,
    registerWithEmail,
    signInWithGoogle,
    signOutUser as signOut,
    resetPassword,
    resendVerification,
    handleEmailVerification,
    handlePasswordReset,
    checkActionCodeStatus,
    signInWithMagicLink,
    isEmailLink,
    updateUserProfile,
    reauthenticateUser,
    reauthenticateWithGoogle,
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

console.log('🚀 Firebase init complete. Exports:', Object.keys({ signInWithGoogle, signInWithEmail, auth }));