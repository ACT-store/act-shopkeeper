// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAPS1hhubgu9Dai4_dH8r-pCf5BaswGeQA",
  authDomain: "kadaele-services.firebaseapp.com",
  projectId: "kadaele-services",
  storageBucket: "kadaele-services.firebasestorage.app",
  messagingSenderId: "447417713147",
  appId: "1:447417713147:web:a9bbc5529c433a9453cb5e"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable auth persistence so users stay logged in
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('Error setting auth persistence:', error);
});

export default app;