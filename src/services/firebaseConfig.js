// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAhvyvlyW98LfmwECcqTb9-chRuEc4cAEc",
  authDomain: "act-store-b377b.firebaseapp.com",
  projectId: "act-store-b377b",
  storageBucket: "act-store-b377b.firebasestorage.app",
  messagingSenderId: "744358651817",
  appId: "1:744358651817:web:35d5d8f63d5325580946b8"
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
