
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';


// VITE NOTE: We must access import.meta.env.VITE_* explicitly for the bundler to replace them.

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: 'https://porters-portal-default-rtdb.firebaseio.com',
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
export const callEquipItem = httpsCallable(functions, 'equipItem');
export const callUnequipItem = httpsCallable(functions, 'unequipItem');
export const callDisenchantItem = httpsCallable(functions, 'disenchantItem');
export const callCraftItem = httpsCallable(functions, 'craftItem');
export const callAdminUpdateInventory = httpsCallable(functions, 'adminUpdateInventory');
export const callAdminUpdateEquipped = httpsCallable(functions, 'adminUpdateEquipped');
export const callSubmitEngagement = httpsCallable(functions, 'submitEngagement');
export const callUploadQuestionBank = httpsCallable(functions, 'uploadQuestionBank');
export const callAwardQuestionXP = httpsCallable(functions, 'awardQuestionXP');
export const callPenalizeWrongAnswer = httpsCallable(functions, 'penalizeWrongAnswer');

// New gamification Cloud Functions
export const callUpdateStreak = httpsCallable(functions, 'updateStreak');
export const callClaimDailyLogin = httpsCallable(functions, 'claimDailyLogin');
export const callSpinFortuneWheel = httpsCallable(functions, 'spinFortuneWheel');
export const callUnlockSkill = httpsCallable(functions, 'unlockSkill');
export const callAddSocket = httpsCallable(functions, 'addSocket');
export const callSocketGem = httpsCallable(functions, 'socketGem');
export const callUnsocketGem = httpsCallable(functions, 'unsocketGem');
export const callDealBossDamage = httpsCallable(functions, 'dealBossDamage');
export const callAnswerBossEvent = httpsCallable(functions, 'answerBossEvent');
export const callGetNextBossQuestion = httpsCallable(functions, 'getNextBossQuestion');
export const callStartSpecializationTrial = httpsCallable(functions, 'startSpecializationTrial');
export const callCompleteSpecializationTrial = httpsCallable(functions, 'completeSpecializationTrial');
export const callUseConsumable = httpsCallable(functions, 'useConsumable');
export const callClaimKnowledgeLoot = httpsCallable(functions, 'claimKnowledgeLoot');
export const callPurchaseCosmetic = httpsCallable(functions, 'purchaseCosmetic');
export const callClaimDailyChallenge = httpsCallable(functions, 'claimDailyChallenge');
export const callDismissAlert = httpsCallable(functions, 'dismissAlert');
export const callDismissAlertsBatch = httpsCallable(functions, 'dismissAlertsBatch');

// Admin item management
export const callAdminGrantItem = httpsCallable(functions, 'adminGrantItem');
export const callAdminEditItem = httpsCallable(functions, 'adminEditItem');
export const callStartAssessmentSession = httpsCallable(functions, 'startAssessmentSession');
export const callSubmitAssessment = httpsCallable(functions, 'submitAssessment');

// One-time admin utilities
export const callBackfillAssignmentDates = httpsCallable(functions, 'backfillAssignmentDates');
export const callBackfillWordCount = httpsCallable(functions, 'backfillWordCount');
export const callScaleBossHp = httpsCallable(functions, 'scaleBossHp');
export const callMigrateBossesToEvents = httpsCallable(functions, 'migrateBossesToEvents');
export const callMigrateBossQuizProgress = httpsCallable(functions, 'migrateBossQuizProgress');

// Flux Shop Cloud Functions
export const callPurchaseFluxItem = httpsCallable(functions, 'purchaseFluxItem');
export const callEquipFluxCosmetic = httpsCallable(functions, 'equipFluxCosmetic');

// Stability: atomic archive + behavior award
export const callArchiveAndClearResponses = httpsCallable(functions, 'archiveAndClearResponses');
export const callAwardBehaviorXP = httpsCallable(functions, 'awardBehaviorXP');

// Enrollment
export const callRedeemEnrollmentCode = httpsCallable(functions, 'redeemEnrollmentCode');

// Admin whitelist
export const callAdminAddToWhitelist = httpsCallable(functions, 'adminAddToWhitelist');

// Assessment admin actions
export const callReturnAssessment = httpsCallable(functions, 'returnAssessment');
export const callSubmitOnBehalf = httpsCallable(functions, 'submitOnBehalf');

// Google Classroom grade sync
export const callClassroomListCourses = httpsCallable(functions, 'classroomListCourses');
export const callClassroomListCourseWork = httpsCallable(functions, 'classroomListCourseWork');
export const callClassroomCreateCourseWork = httpsCallable(functions, 'classroomCreateCourseWork');
export const callClassroomPushGrades = httpsCallable(functions, 'classroomPushGrades');

