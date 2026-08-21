import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const isValidConfig = 
  firebaseConfig.projectId && 
  firebaseConfig.projectId !== 'YOUR_PROJECT_ID' &&
  firebaseConfig.projectId !== 'MY_PROJECT_ID' &&
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== 'YOUR_API_KEY' &&
  firebaseConfig.apiKey !== 'MY_API_KEY';

// Initialize Firebase only if config is provided to avoid crashing the preview
const app = isValidConfig ? (!getApps().length ? initializeApp(firebaseConfig) : getApp()) : null;
export const db = app ? getFirestore(app) : null;
