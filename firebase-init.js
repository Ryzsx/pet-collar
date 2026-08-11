// =====================================================
// FIREBASE INITIALIZATION
// =====================================================

/**
 * Firebase Initialization Module
 * 
 * This module initializes Firebase services and exports
 * them for use across the application.
 * 
 * Services exported:
 * - auth        : Firebase Authentication
 * - db          : Firestore Database
 * - storage     : Firebase Storage (NEW)
 * - provider    : Google Auth Provider
 * - functions   : Authentication, Firestore & Storage functions
 */

// =====================================================
// IMPORTS
// =====================================================

// Firebase App
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// Firebase Authentication
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
    // ===== NEW: Re-authentication =====
    reauthenticateWithPopup,
    reauthenticateWithCredential,
    EmailAuthProvider,
    // ===== NEW: Delete user =====
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Firebase Firestore
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
    // ===== NEW: Timestamp =====
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===== NEW: Firebase Storage =====
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

/**
 * Firebase configuration object
 * 
 * IMPORTANT: Never commit these values to public repositories!
 * Use environment variables or Firebase Hosting's built-in config.
 */
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
// INITIALIZE FIREBASE
// =====================================================

let app;
let auth;
let db;
let storage;
let provider;

try {
    // Initialize Firebase
    app = initializeApp(firebaseConfig);
    console.log('✅ Firebase initialized successfully');

    // Initialize Authentication
    auth = getAuth(app);

    // Set persistence to LOCAL (remember user across sessions)
    await setPersistence(auth, browserLocalPersistence)
        .then(() => {
            console.log('✅ Auth persistence set to LOCAL');
        })
        .catch((error) => {
            console.warn('⚠️ Could not set auth persistence:', error);
        });

    // Initialize Firestore
    db = getFirestore(app);
    console.log('✅ Firestore initialized');

    // ===== NEW: Initialize Storage =====
    storage = getStorage(app);
    console.log('✅ Firebase Storage initialized');

    // Initialize Google Auth Provider
    provider = new GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account' // Forces account selection
    });

} catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    throw error;
}

// =====================================================
// CONNECTION MONITORING
// =====================================================

/**
 * Monitor Firebase connection status
 * Returns a function that can be used to listen for connection changes
 */
function monitorConnection(callback) {
    let online = navigator.onLine;
    let firebaseConnected = false;

    // Browser online/offline events
    const handleOnline = () => {
        online = true;
        if (callback) callback({ online, firebaseConnected });
    };

    const handleOffline = () => {
        online = false;
        if (callback) callback({ online, firebaseConnected });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Firestore connection state
    const unsub = onSnapshot(doc(db, 'connection', 'status'), 
        () => {
            firebaseConnected = true;
            if (callback) callback({ online, firebaseConnected: true });
        },
        () => {
            firebaseConnected = false;
            if (callback) callback({ online, firebaseConnected: false });
        }
    );

    // Initial status
    if (callback) {
        setTimeout(() => {
            callback({ online, firebaseConnected });
        }, 1000);
    }

    // Return cleanup function
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        unsub();
    };
}

// =====================================================
// AUTHENTICATION FUNCTIONS
// =====================================================

/**
 * Sign in with email and password
 */
async function signInWithEmail(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Register new user with email and password
 */
async function registerWithEmail(email, password, displayName = '') {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update profile with display name
        if (displayName) {
            await updateProfile(user, { displayName });
        }

        // Send verification email
        await sendEmailVerification(user);

        return { success: true, user };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Sign in with Google popup
 */
async function signInWithGoogle() {
    try {
        const result = await signInWithPopup(auth, provider);
        return { success: true, user: result.user };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Sign out current user
 */
async function signOutUser() {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Send password reset email
 */
async function resetPassword(email) {
    try {
        await sendPasswordResetEmail(auth, email);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Resend verification email
 */
async function resendVerification(user) {
    try {
        await sendEmailVerification(user || auth.currentUser);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Check if email is already registered
 */
async function checkEmailExists(email) {
    try {
        const methods = await fetchSignInMethodsForEmail(auth, email);
        return methods.length > 0;
    } catch (error) {
        console.warn('⚠️ Could not check email:', error);
        return false;
    }
}

/**
 * Get current user
 */
function getCurrentUser() {
    return auth.currentUser;
}

/**
 * Check if user is logged in
 */
function isLoggedIn() {
    return !!auth.currentUser;
}

/**
 * Check if user's email is verified
 */
function isEmailVerified() {
    return auth.currentUser?.emailVerified || false;
}

/**
 * Reload user data from server
 */
async function reloadUser() {
    try {
        await reload(auth.currentUser);
        return { success: true, user: auth.currentUser };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

// =====================================================
// ===== NEW: ADDITIONAL AUTH FUNCTIONS =====
// =====================================================

/**
 * Update user profile (display name, photo URL)
 */
async function updateUserProfile(displayName, photoURL = null) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user logged in');
        
        const updates = {};
        if (displayName) updates.displayName = displayName;
        if (photoURL) updates.photoURL = photoURL;
        
        await updateProfile(user, updates);
        return { success: true, user };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Re-authenticate user for sensitive operations (e.g., password change, account deletion)
 */
async function reauthenticateUser(password) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user logged in');
        if (!user.email) throw new Error('User has no email');
        
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Re-authenticate with Google popup
 */
async function reauthenticateWithGoogle() {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user logged in');
        
        await reauthenticateWithPopup(user, provider);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Delete user account (requires recent re-authentication)
 */
async function deleteUserAccount() {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user logged in');
        
        await deleteUser(user);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Change user password (requires re-authentication)
 */
async function changePassword(newPassword) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user logged in');
        
        await user.updatePassword(newPassword);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Change user email (requires re-authentication)
 */
async function changeEmail(newEmail) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('No user logged in');
        
        await user.updateEmail(newEmail);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

// =====================================================
// FIRESTORE FUNCTIONS
// =====================================================

/**
 * Save user data to Firestore
 */
async function saveUserData(userId, userData) {
    try {
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, {
            ...userData,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Get user data from Firestore
 */
async function getUserData(userId) {
    try {
        const userRef = doc(db, 'users', userId);
        const snapshot = await getDoc(userRef);
        if (snapshot.exists()) {
            return { success: true, data: { id: snapshot.id, ...snapshot.data() } };
        } else {
            return { success: false, message: 'User data not found' };
        }
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Save pet data to Firestore
 */
async function savePet(petData, userId) {
    try {
        const docRef = await addDoc(collection(db, 'pets'), {
            ...petData,
            userId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Update pet data
 */
async function updatePet(petId, petData) {
    try {
        const petRef = doc(db, 'pets', petId);
        await updateDoc(petRef, {
            ...petData,
            updatedAt: serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Delete pet
 */
async function deletePet(petId) {
    try {
        const petRef = doc(db, 'pets', petId);
        await deleteDoc(petRef);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Get a single pet by ID
 */
async function getPet(petId) {
    try {
        const petRef = doc(db, 'pets', petId);
        const snapshot = await getDoc(petRef);
        if (snapshot.exists()) {
            return { success: true, pet: { id: snapshot.id, ...snapshot.data() } };
        } else {
            return { success: false, message: 'Pet not found' };
        }
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Get all pets for a user
 */
async function getPetsForUser(userId) {
    try {
        const q = query(
            collection(db, 'pets'),
            where('userId', '==', userId),
            orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const pets = [];
        snapshot.forEach((doc) => {
            pets.push({ id: doc.id, ...doc.data() });
        });
        return { success: true, pets };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Save location to Firestore
 */
async function saveLocation(locationData, userId) {
    try {
        const docRef = await addDoc(collection(db, 'locations'), {
            ...locationData,
            userId,
            timestamp: serverTimestamp()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Get location history for a user
 */
async function getLocationHistory(userId, limitCount = 50) {
    try {
        const q = query(
            collection(db, 'locations'),
            where('userId', '==', userId),
            orderBy('timestamp', 'desc'),
            limit(limitCount)
        );
        const snapshot = await getDocs(q);
        const locations = [];
        snapshot.forEach((doc) => {
            locations.push({ id: doc.id, ...doc.data() });
        });
        return { success: true, locations };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Listen for real-time location updates
 */
function listenToLocations(userId, callback) {
    const q = query(
        collection(db, 'locations'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(20)
    );
    return onSnapshot(q, 
        (snapshot) => {
            const locations = [];
            snapshot.forEach((doc) => {
                locations.push({ id: doc.id, ...doc.data() });
            });
            if (callback) callback(locations);
        },
        (error) => {
            console.error('❌ Location listener error:', error);
            if (callback) callback(null, error);
        }
    );
}

// =====================================================
// ===== NEW: STORAGE FUNCTIONS =====
// =====================================================

/**
 * Upload pet image to Firebase Storage
 * @param {File} file - Image file to upload
 * @param {string} userId - User ID
 * @param {string} petId - Pet ID (optional)
 * @param {Function} onProgress - Progress callback (0-100)
 */
async function uploadPetImage(file, userId, petId = null, onProgress = null) {
    try {
        // Create a unique file name
        const timestamp = Date.now();
        const fileExtension = file.name.split('.').pop();
        const fileName = `${timestamp}.${fileExtension}`;
        
        // Build storage path
        let path = `users/${userId}/pets/`;
        if (petId) {
            path += `${petId}/images/${fileName}`;
        } else {
            path += `images/${fileName}`;
        }
        
        const storageRef = ref(storage, path);
        
        // Upload with progress
        let uploadTask;
        if (onProgress) {
            uploadTask = uploadBytesResumable(storageRef, file);
            
            // Listen for progress
            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        onProgress(progress);
                    },
                    (error) => reject(error),
                    () => resolve()
                );
            });
        } else {
            await uploadBytes(storageRef, file);
        }
        
        // Get download URL
        const downloadURL = await getDownloadURL(storageRef);
        
        return { 
            success: true, 
            url: downloadURL,
            path: path,
            name: fileName
        };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Upload user profile image
 */
async function uploadProfileImage(file, userId) {
    try {
        const timestamp = Date.now();
        const fileExtension = file.name.split('.').pop();
        const fileName = `profile_${timestamp}.${fileExtension}`;
        const path = `users/${userId}/profile/${fileName}`;
        
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        
        return { success: true, url: downloadURL, path };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Delete an image from storage
 */
async function deleteImage(filePath) {
    try {
        const storageRef = ref(storage, filePath);
        await deleteObject(storageRef);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

/**
 * Get all images for a pet
 */
async function getPetImages(userId, petId) {
    try {
        const path = `users/${userId}/pets/${petId}/images/`;
        const storageRef = ref(storage, path);
        const result = await listAll(storageRef);
        
        const images = await Promise.all(
            result.items.map(async (item) => {
                const url = await getDownloadURL(item);
                const metadata = await getMetadata(item);
                return {
                    url,
                    name: item.name,
                    size: metadata.size,
                    contentType: metadata.contentType,
                    created: metadata.timeCreated
                };
            })
        );
        
        return { success: true, images };
    } catch (error) {
        return { success: false, error: error.code, message: error.message };
    }
}

// =====================================================
// ===== NEW: UTILITY FUNCTIONS =====
// =====================================================

/**
 * Get current timestamp (Firestore server timestamp)
 */
function getServerTimestamp() {
    return serverTimestamp();
}

/**
 * Convert Firestore Timestamp to Date
 */
function timestampToDate(timestamp) {
    if (timestamp instanceof Timestamp) {
        return timestamp.toDate();
    }
    return timestamp;
}

/**
 * Format date string
 */
function formatDate(date, format = 'MMM dd, yyyy h:mm a') {
    if (!date) return 'N/A';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return 'Invalid Date';
    
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    };
    return d.toLocaleString('en-US', options);
}

/**
 * Get time ago string
 */
function timeAgo(date) {
    if (!date) return 'N/A';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return 'Invalid Date';
    
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
    if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
    return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
}

// =====================================================
// EXPORTS
// =====================================================

// Core services
export {
    app,
    auth,
    db,
    storage,
    provider
};

// Authentication functions
export {
    onAuthStateChanged,
    signInWithEmail,
    registerWithEmail,
    signInWithGoogle,
    signOutUser as signOut,
    resetPassword,
    resendVerification,
    checkEmailExists,
    getCurrentUser,
    isLoggedIn,
    isEmailVerified,
    reloadUser,
    monitorConnection,
    // ===== NEW: Additional auth exports =====
    updateUserProfile,
    reauthenticateUser,
    reauthenticateWithGoogle,
    deleteUserAccount,
    changePassword,
    changeEmail,
    // Direct exports for advanced use
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    updateProfile,
    sendEmailVerification,
    sendPasswordResetEmail,
    reload,
    fetchSignInMethodsForEmail,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    inMemoryPersistence
};

// Firestore functions
export {
    // Direct Firestore exports
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
    // Wrapped functions
    saveUserData,
    getUserData,
    savePet,
    updatePet,
    deletePet,
    getPet,
    getPetsForUser,
    saveLocation,
    getLocationHistory,
    listenToLocations
};

// ===== NEW: Storage exports =====
export {
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
    getPetImages
};

// ===== NEW: Utility exports =====
export {
    getServerTimestamp,
    timestampToDate,
    formatDate,
    timeAgo
};

// =====================================================
// INITIALIZATION LOG
// =====================================================

console.log('🚀 Firebase Init Module Loaded');
console.log('📦 Services: Auth ✅ | Firestore ✅ | Storage ✅ | Google Provider ✅');
console.log('✨ Additional features: User profile, Pet management, Image upload, Utilities');