
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
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

// ─── Firestore localStorage quota recovery ───
// Firestore's persistentMultipleTabManager stores tab sync state in localStorage
// (keys like firestore_targets_*). On long idle sessions these can exceed quota,
// causing an unrecoverable "INTERNAL ASSERTION FAILED" cascade. We detect the
// QuotaExceededError, clear Firestore's internal keys, and reload.
function clearFirestoreLocalStorage(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('firestore_') || key.includes('firestore/'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {
    // If localStorage itself is broken, nothing we can do
  }
}

async function clearFirestoreIndexedDB(): Promise<void> {
  try {
    const dbName = 'firestore/[DEFAULT]/porters-portal';
    const req = indexedDB.deleteDatabase(dbName);
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve(); // blocked → proceed anyway, reload will clear
    });
  } catch {
    // Best-effort; if IndexedDB is unavailable, localStorage clear + reload is enough
  }
}

function isFirestoreQuotaError(error: Error | unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message || '';
  return (
    (error.name === 'QuotaExceededError' || (error as DOMException).code === 22) &&
    (msg.includes('firestore_targets') || msg.includes('firestore_mutations') || msg.includes('firestore/'))
  );
}

let quotaRecoveryPending = false;
async function recoverFromFirestoreQuota(error: Error | unknown): Promise<void> {
  if (quotaRecoveryPending) return;
  if (!isFirestoreQuotaError(error)) return;
  quotaRecoveryPending = true;
  console.warn('[Firestore Quota] Clearing Firestore caches and reloading...');
  clearFirestoreLocalStorage();
  await clearFirestoreIndexedDB();
  window.location.reload();
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (evt) => { recoverFromFirestoreQuota(evt.error); });
  window.addEventListener('unhandledrejection', (evt) => { recoverFromFirestoreQuota(evt.reason); });
}

// Use memory-only cache to eliminate IndexedDB corruption/ bloat as a source
// of startup slowness and write timeouts. localStorage drafts in
// usePersistentSave protect student work across refreshes.
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Dev-only: expose Firebase singletons on window for browser-console probes.
if (import.meta.env.DEV) {
  (window as any).__fb__ = {
    app, auth, db, storage, functions,
    findUserByName: async (name: string) => {
      const snap = await getDocs(query(collection(db, 'users'), where('name', '==', name)));
      return snap.docs.map(d => ({ id: d.id, email: d.data().email, xp: d.data().gamification?.xp ?? 0, classXp: d.data().gamification?.classXp ?? {} }));
    },
    getUser: async (uid: string) => {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },
  };
}
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
export const callCommitSpecialization = httpsCallable(functions, 'commitSpecialization');
export const callDeclineSpecialization = httpsCallable(functions, 'declineSpecialization');
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
export const callStartResourceSession = httpsCallable(functions, 'startResourceSession');
export const callSubmitAssessment = httpsCallable(functions, 'submitAssessment');
export const callGetAssessmentStats = httpsCallable(functions, 'getAssessmentStats');

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
export const callHeartbeat = httpsCallable(functions, 'heartbeat');

// Google Classroom grade sync
export const callClassroomListCourses = httpsCallable(functions, 'classroomListCourses');
export const callClassroomListCourseWork = httpsCallable(functions, 'classroomListCourseWork');
export const callClassroomCreateCourseWork = httpsCallable(functions, 'classroomCreateCourseWork');
export const callClassroomPushGrades = httpsCallable(functions, 'classroomPushGrades');

