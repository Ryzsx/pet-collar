import { db } from '../core/firebase-config.js';
import {
    collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
    query, where, orderBy, limit, serverTimestamp, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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

// The dashboard currently uses prototype pets. These Firestore operations
// retain their existing contracts for flows that already call them.
export const petService = Object.freeze({
    getPets: getPetsForUser,
    addPet: savePet,
    updatePet,
    deletePet,
    getPet,
    saveLocation,
    getLocationHistory,
    listenToLocations
});

export {
    savePet, updatePet, deletePet, getPet, getPetsForUser,
    saveLocation, getLocationHistory, listenToLocations
};
