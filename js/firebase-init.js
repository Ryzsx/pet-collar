// =====================================================
// FIREBASE INIT
// =====================================================

import { app, auth, db, storage } from './core/firebase-config.js';
import {
    checkUsernameExists, checkRegisteredEmail,
    checkRegistrationEmail, completeVerifiedRegistration, resetPasswordByIdentifier, signOutUser,
    resetPassword, verifyPasswordResetAction, completePasswordReset,
    resendVerification, handleEmailVerification, checkActionCodeStatus,
    updateUserProfile, reauthenticateUser, deleteUserAccount,
    changePassword, changeEmail, checkEmailExists, getCurrentUser,
    isLoggedIn, isEmailVerified, reloadUser
} from './services/AuthService.js';
import {
    savePet, updatePet, deletePet, getPet, getPetsForUser,
    saveLocation, getLocationHistory, listenToLocations
} from './services/PetService.js';


import {
    onAuthStateChanged,
    updateProfile,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
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
    ref,
    uploadBytes,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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
    checkUsernameExists,
    checkRegisteredEmail,
    checkRegistrationEmail,
    completeVerifiedRegistration,
    signOutUser as signOut,
    resetPassword,
    resetPasswordByIdentifier,
    verifyPasswordResetAction,
    completePasswordReset,
    resendVerification,
    handleEmailVerification,
    checkActionCodeStatus,
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
    uploadPetImage,
    uploadProfileImage,
    deleteImage,
    // Utilities
    getServerTimestamp,
    timestampToDate,
    formatDate,
    timeAgo
};

console.log('✅ firebase-init.js loaded – no duplicates.');
