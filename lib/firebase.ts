
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

// VITE NOTE: We must access import.meta.env.VITE_* explicitly for the bundler to replace them.

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Enable offline persistence — data survives refresh & works without internet
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence unavailable: multiple tabs open.');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence not supported in this browser.');
    }
});

// Cloud Function callables
export const callAwardXP = httpsCallable(functions, 'awardXP');
export const callAcceptQuest = httpsCallable(functions, 'acceptQuest');
export const callDeployMission = httpsCallable(functions, 'deployMission');
export const callResolveQuest = httpsCallable(functions, 'resolveQuest');
export const callEquipItem = httpsCallable(functions, 'equipItem');
export const callDisenchantItem = httpsCallable(functions, 'disenchantItem');
export const callCraftItem = httpsCallable(functions, 'craftItem');
export const callAdminUpdateInventory = httpsCallable(functions, 'adminUpdateInventory');
export const callAdminUpdateEquipped = httpsCallable(functions, 'adminUpdateEquipped');
export const callSubmitEngagement = httpsCallable(functions, 'submitEngagement');
export const callSendClassMessage = httpsCallable(functions, 'sendClassMessage');
export const callUploadQuestionBank = httpsCallable(functions, 'uploadQuestionBank');
export const callAwardQuestionXP = httpsCallable(functions, 'awardQuestionXP');
