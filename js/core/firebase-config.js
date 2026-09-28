import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// Browser Firebase configuration. This is the existing project configuration.
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

export { app, auth, db, storage };
