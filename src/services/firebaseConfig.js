// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "REPLACE_WITH_ACT_STORE_API_KEY",
  authDomain: "act-store-b377b.firebaseapp.com",
  projectId: "act-store-b377b",
  storageBucket: "act-store-b377b.appspot.com",
  messagingSenderId: "REPLACE_WITH_ACT_STORE_SENDER_ID",
  appId: "REPLACE_WITH_ACT_STORE_APP_ID"
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
