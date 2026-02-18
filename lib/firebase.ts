
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
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

// Validate required environment variables at startup
const requiredEnvVars = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'appId'] as const;
for (const key of requiredEnvVars) {
  if (!firebaseConfig[key]) {
    throw new Error(`Missing required Firebase config: ${key}. Check your .env.local file.`);
  }
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Use modern persistence API (replaces deprecated enableIndexedDbPersistence)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Cloud Function callables
export const callAwardXP = httpsCallable(functions, 'awardXP');
export const callAcceptQuest = httpsCallable(functions, 'acceptQuest');
export const callDeployMission = httpsCallable(functions, 'deployMission');
export const callResolveQuest = httpsCallable(functions, 'resolveQuest');
export const callEquipItem = httpsCallable(functions, 'equipItem');
export const callUnequipItem = httpsCallable(functions, 'unequipItem');
export const callDisenchantItem = httpsCallable(functions, 'disenchantItem');
export const callCraftItem = httpsCallable(functions, 'craftItem');
export const callAdminUpdateInventory = httpsCallable(functions, 'adminUpdateInventory');
export const callAdminUpdateEquipped = httpsCallable(functions, 'adminUpdateEquipped');
export const callSubmitEngagement = httpsCallable(functions, 'submitEngagement');
export const callSendClassMessage = httpsCallable(functions, 'sendClassMessage');
export const callUploadQuestionBank = httpsCallable(functions, 'uploadQuestionBank');
export const callAwardQuestionXP = httpsCallable(functions, 'awardQuestionXP');

// New gamification Cloud Functions
export const callUpdateStreak = httpsCallable(functions, 'updateStreak');
export const callClaimDailyLogin = httpsCallable(functions, 'claimDailyLogin');
export const callSpinFortuneWheel = httpsCallable(functions, 'spinFortuneWheel');
export const callUnlockSkill = httpsCallable(functions, 'unlockSkill');
export const callAddSocket = httpsCallable(functions, 'addSocket');
export const callSocketGem = httpsCallable(functions, 'socketGem');
export const callDealBossDamage = httpsCallable(functions, 'dealBossDamage');
export const callAnswerBossQuiz = httpsCallable(functions, 'answerBossQuiz');
export const callCreateParty = httpsCallable(functions, 'createParty');
export const callJoinParty = httpsCallable(functions, 'joinParty');
export const callCompleteTutoring = httpsCallable(functions, 'completeTutoring');
export const callClaimKnowledgeLoot = httpsCallable(functions, 'claimKnowledgeLoot');
export const callPurchaseCosmetic = httpsCallable(functions, 'purchaseCosmetic');
export const callClaimDailyChallenge = httpsCallable(functions, 'claimDailyChallenge');
export const callDismissAlert = httpsCallable(functions, 'dismissAlert');
