
import { User, ClassType, ClassConfig, Assignment, Submission, AssignmentStatus, Comment, WhitelistedUser, EvidenceLog, LabReport, UserSettings, XPEvent, RPGItem, EquipmentSlot, Announcement, Notification, TelemetryMetrics, BossEncounter, BossQuizEvent, SeasonalCosmetic, KnowledgeGate, DailyChallenge, StudentAlert, StudentBucketProfile, BugReport, SongRequest, EnrollmentCode, BehaviorAward, CustomItem, RubricGrade, AISuggestedGrade, GradingCorrection, ActiveBoost, StreakData, ClassroomLink, ClassroomLinkEntry, FeedbackHistoryEntry, DraftFeedbackMessage } from '../types';
import { db, storage, callAwardXP, callEquipItem, callUnequipItem, callDisenchantItem, callCraftItem, callAdminUpdateInventory, callAdminUpdateEquipped, callSubmitEngagement, callUpdateStreak, callClaimDailyLogin, callSpinFortuneWheel, callUnlockSkill, callAddSocket, callSocketGem, callUnsocketGem, callDealBossDamage, callAnswerBossEvent, callGetNextBossQuestion, callStartSpecializationTrial, callCompleteSpecializationTrial, callCommitSpecialization, callDeclineSpecialization, callUseConsumable, callClaimKnowledgeLoot, callPurchaseCosmetic, callClaimDailyChallenge, callDismissAlert, callDismissAlertsBatch, callAdminGrantItem, callAdminEditItem, callSubmitAssessment, callScaleBossHp, callPurchaseFluxItem, callEquipFluxCosmetic, callRedeemEnrollmentCode, callAwardBehaviorXP, callAdminAddToWhitelist, callMigrateBossesToEvents, callMigrateBossQuizProgress } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc, query, where, getDoc, onSnapshot, orderBy, limit, arrayUnion, runTransaction, increment, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { createInitialMetrics } from '../lib/telemetry';
import { reportError } from '../lib/errorReporting';
import { resilientSnapshot, clearDeniedCollections } from './resilientSnapshot';
import {
  classifyAssessmentParticipants,
  filterEnrolledInClass,
  computeNotStartedCount,
} from '../lib/assessmentClassifier';

export { clearDeniedCollections };

/**
 * Per-assignment grading stats computed from a one-shot submissions fetch.
 * Used by the grading index page to show accurate counts without depending on
 * the globally-capped live submissions cache.
 */
export interface AssessmentStats {
  /** Unique students with any non-STARTED submission. */
  submitted: number;
  /** Unique students with a rubricGrade set (non-STARTED). */
  graded: number;
  /** Submissions with status === 'FLAGGED' and not AI-flagged. */
  flagged: number;
  /** Submissions with flaggedAsAI === true. */
  aiFlagged: number;
  /** Union of STARTED submissions, unused assessment_sessions, and lesson_block_responses with saved work — minus submitted users. */
  draft: number;
  /** Enrolled students who have neither submitted nor started (requires assignment + enrolledStudents params). */
  notStarted: number;
}

/** Strip undefined values from an object before passing to Firestore setDoc(). */
const stripUndefined = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

export const dataService = {
  // --- HELPERS ---
  getWeekId: (): string => {
      // ISO 8601 week calculation
      const now = new Date();
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      // Set to nearest Thursday: current date + 4 - current day number (Monday=1, Sunday=7)
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return `${d.getUTCFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
  },

  // --- XP & GAMIFICATION ---

  subscribeToXPEvents: (callback: (events: XPEvent[]) => void, activeOnly = false) => {
    const q = activeOnly
      ? query(collection(db, 'xp_events'), where('isActive', '==', true))
      : collection(db, 'xp_events');
    return resilientSnapshot('xp_events', q, (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as XPEvent)));
    });
  },

  saveXPEvent: async (event: XPEvent) => {
    await setDoc(doc(db, 'xp_events', event.id), stripUndefined(event));
  },

  deleteXPEvent: async (id: string) => {
    await deleteDoc(doc(db, 'xp_events', id));
  },

  adjustUserXP: async (userId: string, amount: number, classType: string) => {
    await dataService.awardXP(userId, amount, classType);
  },

  equipItem: async (_userId: string, item: RPGItem, classType?: string) => {
      await callEquipItem({ itemId: item.id, classType });
  },

  unequipItem: async (_userId: string, slot: string, classType?: string) => {
      await callUnequipItem({ slot, classType });
  },

  disenchantItem: async (_userId: string, item: RPGItem, classType?: string) => {
      await callDisenchantItem({ itemId: item.id, classType });
  },

  craftItem: async (_userId: string, item: RPGItem, action: 'RECALIBRATE' | 'REFORGE' | 'OPTIMIZE', classType?: string) => {
      await callCraftItem({ itemId: item.id, action, classType });
  },

  // Admin Tools — via Cloud Functions
  adminUpdateInventory: async (userId: string, inventory: RPGItem[], currency: number, classType?: string) => {
      await callAdminUpdateInventory({ userId, inventory, currency, classType });
  },

  adminUpdateEquipped: async (userId: string, equipped: Partial<Record<EquipmentSlot, RPGItem>>, classType?: string) => {
      await callAdminUpdateEquipped({ userId, equipped, classType });
  },

  adminGrantItem: async (userId: string, item: RPGItem, classType?: string) => {
      await callAdminGrantItem({ userId, item, classType });
  },

  adminEditItem: async (userId: string, itemId: string, updates: Partial<RPGItem>, classType?: string) => {
      await callAdminEditItem({ userId, itemId, updates, classType });
  },

  // --- CUSTOM ITEM LIBRARY ---

  subscribeToCustomItems: (callback: (items: CustomItem[]) => void) => {
    return resilientSnapshot('customItems', collection(db, 'customItems'), (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as CustomItem)));
    });
  },

  saveCustomItem: async (item: CustomItem) => {
    await setDoc(doc(db, 'customItems', item.id), stripUndefined(item));
  },

  deleteCustomItem: async (id: string) => {
    await deleteDoc(doc(db, 'customItems', id));
  },

  // Write only the appearance sub-field — all other gamification fields are Cloud-Function-only
  updateUserAppearance: async (userId: string, appearance: { hue?: number; suitHue?: number; bodyType?: 'A' | 'B' | 'C'; skinTone?: number; hairStyle?: number; hairColor?: number }, classType?: string) => {
      try {
          const userRef = doc(db, 'users', userId);
          if (classType) {
              // Use dot-notation to write ONLY the appearance for this class profile.
              // This avoids a read-modify-write race that could overwrite concurrent
              // inventory/equipment changes to other class profiles.
              await updateDoc(userRef, {
                  [`gamification.classProfiles.${classType}.appearance`]: appearance
              });
          } else {
              // Legacy fallback
              await updateDoc(userRef, { 'gamification.appearance': appearance });
          }
      } catch (error) {
          reportError(error, { method: 'updateAppearance' });
          throw error;
      }
  },

  // --- EVIDENCE LOCKER ---

  subscribeToEvidence: (userId: string, weekId: string, callback: (logs: EvidenceLog[]) => void) => {
    const q = query(
      collection(db, 'evidence'), 
      where('studentId', '==', userId),
      where('weekId', '==', weekId)
    );
    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as EvidenceLog));
      callback(logs);
    }, (error: unknown) => reportError(error, { subscription: 'evidence' }));
  },

  uploadEvidence: async (log: EvidenceLog) => {
    await setDoc(doc(db, 'evidence', log.id), log, { merge: true });
  },

  deleteWeeklyEvidence: async (logs: EvidenceLog[]) => {
      try {
          const storagePromises = logs.map(log => {
              if (!log.imageUrl) return Promise.resolve();
              const fileRef = ref(storage, log.imageUrl);
              return deleteObject(fileRef).catch(err => reportError(err, { method: 'deleteWeeklyEvidence', logId: log.id }));
          });
          await Promise.all(storagePromises);

          const docPromises = logs.map(log => {
              return deleteDoc(doc(db, 'evidence', log.id));
          });
          await Promise.all(docPromises);
          
      } catch (error) {
          reportError(error, { method: 'clearWeeklyEvidence' });
          throw new Error("Failed to clear evidence log.");
      }
  },

  // --- PHYSICS LAB ---

  saveLabReport: async (report: LabReport) => {
    await setDoc(doc(db, 'lab_reports', report.id), report, { merge: true });
  },

  // --- CORE METHODS ---

  updateUserSettings: async (userId: string, settings: UserSettings) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { settings });
    } catch (error) {
      reportError(error, { method: 'updateSettings' });
    }
  },

  updateUserLastLevelSeen: async (userId: string, level: number) => {
      await updateDoc(doc(db, 'users', userId), {
          'gamification.lastLevelSeen': level
      });
  },

  generateCodename: async (userId: string) => {
    const prefixes = ['Neon', 'Quantum', 'Dark', 'Atomic', 'Silent', 'Lunar', 'Iron', 'Plasma', 'Forensic'];
    const suffixes = ['Quark', 'Proton', 'Trace', 'Nova', 'Pulse', 'Specter', 'Vertex', 'Agent', 'Observer'];
    const codename = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
    
    await updateDoc(doc(db, 'users', userId), {
      'gamification.codename': codename
    });
  },

  subscribeToUsers: (callback: (users: User[]) => void, maxResults = 500) => {
    const q = query(collection(db, 'users'), limit(maxResults));
    return onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        } as User;
      });
      callback(users);
    }, (error: unknown) => reportError(error, { subscription: 'users' }));
  },

  subscribeToAssignments: (callback: (assignments: Assignment[]) => void) => {
    const q = collection(db, 'assignments');
    return onSnapshot(q, (snapshot) => {
      const assignments = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title,
          description: data.description,
          classType: data.classType as ClassType,
          status: data.status as AssignmentStatus,
          unit: data.unit || 'Unassigned Unit',
          category: data.category || 'Supplemental',
          htmlContent: data.htmlContent,
          contentUrl: data.contentUrl, 
          resources: data.resources || [],
          publicComments: (data.publicComments || []).sort((a: Comment, b: Comment) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          ),
          dueDate: data.dueDate,
          targetSections: data.targetSections || [],
          scheduledAt: data.scheduledAt || undefined,
          createdAt: data.createdAt || undefined,
          updatedAt: data.updatedAt || undefined,
          lessonBlocks: data.isAssessment
            ? (data.lessonBlocks || []).map((block: Record<string, unknown>) => {
                // Strip answer keys from assessment blocks to prevent client-side cheating
                const { correctAnswer, acceptedAnswers, ...safeBlock } = block;
                if (block.sortItems) {
                  safeBlock.sortItems = (block.sortItems as Array<{ text: string; correct: string }>).map(si => ({ text: si.text, correct: '' }));
                }
                return safeBlock;
              })
            : (data.lessonBlocks || []),
          isAssessment: data.isAssessment || false,
          assessmentConfig: data.assessmentConfig
            ? {
                ...data.assessmentConfig,
                maxAttempts:
                  typeof data.assessmentConfig.maxAttempts === 'number'
                    ? data.assessmentConfig.maxAttempts
                    : (parseInt(String(data.assessmentConfig.maxAttempts), 10) || 0),
              }
            : undefined,
          rubric: data.rubric || undefined,
          classroomLink: data.classroomLink || undefined,
          classroomLinks: data.classroomLinks || undefined,
        };
      });
      callback(assignments);
    }, (error: unknown) => reportError(error, { subscription: 'assignments' }));
  },
  
  subscribeToSubmissions: (callback: (submissions: Submission[]) => void, maxResults = 200) => {
    const q = query(collection(db, 'submissions'), orderBy('submittedAt', 'desc'), limit(maxResults));
    return onSnapshot(q, (snapshot) => {
      const submissions = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          userName: data.userName,
          assignmentId: data.assignmentId,
          assignmentTitle: data.assignmentTitle,
          metrics: data.metrics || createInitialMetrics(),
          submittedAt: data.submittedAt,
          status: data.status,
          score: data.score,
          hasUnreadAdmin: data.hasUnreadAdmin || false,
          hasUnreadStudent: data.hasUnreadStudent || false,
          isPinned: data.isPinned || false,
          isArchived: data.isArchived || false,
          privateComments: (data.privateComments || []).sort((a: Comment, b: Comment) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          ),
          isAssessment: data.isAssessment || false,
          attemptNumber: data.attemptNumber,
          assessmentScore: data.assessmentScore,
          blockResponses: data.blockResponses,
          rubricGrade: data.rubricGrade || undefined,
          aiSuggestedGrade: data.aiSuggestedGrade || undefined,
          userSection: data.userSection || undefined,
          flaggedAsAI: data.flaggedAsAI || false,
          flaggedAsAIBy: data.flaggedAsAIBy || '',
          flaggedAsAIAt: data.flaggedAsAIAt || '',
          feedbackReadAt: data.feedbackReadAt || undefined,
          feedbackReviewedAt: data.feedbackReviewedAt || undefined,
          classType: data.classType || undefined,
        } as Submission;
      });
      callback(submissions);
    }, (error: unknown) => reportError(error, { subscription: 'submissions' }));
  },

  /** Assignment-scoped submissions — fetches submissions for a specific assignment, capped at 500. */
  subscribeToAssignmentSubmissions: (assignmentId: string, callback: (submissions: Submission[]) => void) => {
    // Single-field where() avoids composite index requirement — sort client-side
    const q = query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId), limit(500));
    return onSnapshot(q, (snapshot) => {
      const submissions = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          userName: data.userName,
          assignmentId: data.assignmentId,
          assignmentTitle: data.assignmentTitle,
          metrics: data.metrics || createInitialMetrics(),
          submittedAt: data.submittedAt,
          status: data.status,
          score: data.score,
          hasUnreadAdmin: data.hasUnreadAdmin || false,
          hasUnreadStudent: data.hasUnreadStudent || false,
          isPinned: data.isPinned || false,
          isArchived: data.isArchived || false,
          privateComments: (data.privateComments || []).sort((a: Comment, b: Comment) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          ),
          isAssessment: data.isAssessment || false,
          attemptNumber: data.attemptNumber,
          assessmentScore: data.assessmentScore,
          blockResponses: data.blockResponses,
          rubricGrade: data.rubricGrade || undefined,
          aiSuggestedGrade: data.aiSuggestedGrade || undefined,
          userSection: data.userSection || undefined,
          flaggedAsAI: data.flaggedAsAI || false,
          flaggedAsAIBy: data.flaggedAsAIBy || '',
          flaggedAsAIAt: data.flaggedAsAIAt || '',
          feedbackReadAt: data.feedbackReadAt || undefined,
          feedbackReviewedAt: data.feedbackReviewedAt || undefined,
          classType: data.classType || undefined,
        } as Submission;
      });
      // Sort by submittedAt descending (client-side since we dropped orderBy to avoid index dep)
      submissions.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
      callback(submissions);
    }, (error: unknown) => reportError(error, { subscription: 'assignmentSubmissions', assignmentId }));
  },

  /**
   * One-shot per-assignment stats fetch. Returns accurate counts independent of
   * the globally-capped live submissions cache — use this for the grading index
   * page so older assessments never silently show 0 submitted when newer
   * assessments fill the cache. Scoped by assignmentId with the same 500-doc
   * cap as subscribeToAssignmentSubmissions, counted client-side to avoid new
   * composite indexes. Never throws: logs and returns zeroed stats on error.
   */
  getAssessmentStats: async (
    assignmentId: string,
    assignment?: Assignment,
    enrolledStudents?: User[],
  ): Promise<AssessmentStats> => {
    try {
      const [submissionsSnap, sessionsSnap, draftResponsesSnap] = await Promise.all([
        getDocs(query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId), limit(500))),
        getDocs(query(collection(db, 'assessment_sessions'), where('assignmentId', '==', assignmentId), where('used', '==', false), limit(500))),
        getDocs(query(collection(db, 'lesson_block_responses'), where('assignmentId', '==', assignmentId), limit(500))),
      ]);

      const submissions = submissionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Submission));
      const sessionDraftUserIds = new Set(sessionsSnap.docs.map(d => d.data().userId as string));
      const responseDraftUserIds = new Set(
        draftResponsesSnap.docs
          .filter(d => { const r = d.data().responses as Record<string, unknown> | undefined; return r && Object.keys(r).length > 0; })
          .map(d => d.data().userId as string)
      );

      const classified = classifyAssessmentParticipants({ submissions, sessionDraftUserIds, responseDraftUserIds });
      const nonStarted = submissions.filter(s => s.status !== 'STARTED');

      const submitted = classified.submittedUserIds.size;
      const graded = new Set(nonStarted.filter(s => s.rubricGrade).map(s => s.userId)).size;
      const flagged = nonStarted.filter(s => s.status === 'FLAGGED' && !s.flaggedAsAI).length;
      const aiFlagged = nonStarted.filter(s => s.flaggedAsAI).length;
      const draft = classified.draftUserIds.size;

      let notStarted = 0;
      if (assignment?.classType && enrolledStudents) {
        const enrolledInClass = filterEnrolledInClass(enrolledStudents, assignment, classified.draftUserIds);
        notStarted = computeNotStartedCount(enrolledInClass, classified);
      }

      return { submitted, graded, flagged, aiFlagged, draft, notStarted };
    } catch (error) {
      reportError(error, { method: 'getAssessmentStats', assignmentId });
      return { submitted: 0, graded: 0, flagged: 0, aiFlagged: 0, draft: 0, notStarted: 0 };
    }
  },

  /** Fetch a student's draft responses for an assessment (admin view). */
  fetchDraftResponses: async (userId: string, assignmentId: string): Promise<Record<string, unknown> | null> => {
    const docRef = doc(db, 'lesson_block_responses', `${userId}_${assignmentId}_blocks`);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return (data.responses as Record<string, unknown>) || null;
  },

  /** Draft responses — fetches userIds who have saved draft work for an assignment. Admin-only read. */
  subscribeToDraftResponseUsers: (assignmentId: string, callback: (userIds: Set<string>) => void) => {
    const q = query(collection(db, 'lesson_block_responses'), where('assignmentId', '==', assignmentId), limit(500));
    return onSnapshot(q, (snapshot) => {
      const ids = new Set<string>();
      snapshot.docs.forEach(d => {
        const data = d.data();
        // Only count as draft if there are actual responses
        const responses = data.responses as Record<string, unknown> | undefined;
        if (responses && Object.keys(responses).length > 0) {
          ids.add(data.userId as string);
        }
      });
      callback(ids);
    }, (error: unknown) => reportError(error, { subscription: 'draftResponseUsers', assignmentId }));
  },

  /** Assessment sessions — fetches open (unused) sessions for draft tracking. Admin-only read. */
  subscribeToAssessmentSessions: (assignmentId: string, callback: (sessions: Array<{ userId: string; startedAt: string }>) => void) => {
    const q = query(collection(db, 'assessment_sessions'), where('assignmentId', '==', assignmentId), where('used', '==', false), limit(500));
    return onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map(d => {
        const data = d.data();
        return {
          userId: data.userId as string,
          startedAt: data.startedAt?.toDate?.()?.toISOString?.() || data.startedAt || '',
        };
      });
      callback(sessions);
    }, (error: unknown) => reportError(error, { subscription: 'assessmentSessions', assignmentId }));
  },

  /**
   * Activity Monitor — real-time feed of all open (unused) assessment sessions started in the
   * last 4 hours, across every assignment.  Keyed by userId so the UI can join against the
   * assignments list for display names / titles.
   *
   * NOTE: This query filters on two fields (used, startedAt).  Firestore requires a composite
   * index for this combination.  If the query throws a "requires an index" error in the console,
   * create a composite index on `assessment_sessions`:
   *   - Field 1: used      (Ascending)
   *   - Field 2: startedAt (Ascending)
   * The console error will include a direct link to create it automatically.
   *
   * Schema observation: session docs contain { userId, assignmentId, startedAt (Timestamp), used }.
   * There is no `assignmentTitle` field on the session document — the UI must join against the
   * assignments list using `assignmentId` to resolve a human-readable title.
   */
  subscribeToActiveAssessmentSessions: (
    callback: (sessions: Map<string, { assignmentId: string; assignmentTitle: string; startedAt: string }>) => void
  ): (() => void) => {
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const q = query(
      collection(db, 'assessment_sessions'),
      where('used', '==', false),
      where('startedAt', '>=', cutoff),
    );
    return onSnapshot(q, (snapshot) => {
      const map = new Map<string, { assignmentId: string; assignmentTitle: string; startedAt: string }>();
      snapshot.docs.forEach(d => {
        const data = d.data();
        const userId = data.userId as string;
        if (!userId) return;
        map.set(userId, {
          assignmentId: data.assignmentId as string,
          // assignmentTitle is not stored on the session doc; the UI should join via assignmentId.
          assignmentTitle: (data.assignmentTitle as string) || '',
          startedAt: data.startedAt?.toDate?.()?.toISOString?.() || data.startedAt || '',
        });
      });
      callback(map);
    }, (error: unknown) => reportError(error, { subscription: 'activeAssessmentSessions' }));
  },

  /** Student-scoped submissions — avoids Firestore permission error on unfiltered query */
  subscribeToUserSubmissions: (userId: string, callback: (submissions: Submission[]) => void) => {
    // Only filter by userId — no limit, single-user query is cheap
    const q = query(collection(db, 'submissions'), where('userId', '==', userId));
    return onSnapshot(q, (snapshot) => {
      const submissions = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          userName: data.userName,
          assignmentId: data.assignmentId,
          assignmentTitle: data.assignmentTitle,
          metrics: data.metrics || createInitialMetrics(),
          submittedAt: data.submittedAt,
          status: data.status,
          score: data.score,
          hasUnreadAdmin: data.hasUnreadAdmin || false,
          hasUnreadStudent: data.hasUnreadStudent || false,
          isPinned: data.isPinned || false,
          isArchived: data.isArchived || false,
          privateComments: (data.privateComments || []).sort((a: Comment, b: Comment) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          ),
          isAssessment: data.isAssessment || false,
          attemptNumber: data.attemptNumber,
          assessmentScore: data.assessmentScore,
          blockResponses: data.blockResponses,
          rubricGrade: data.rubricGrade || undefined,
          aiSuggestedGrade: data.aiSuggestedGrade || undefined,
          userSection: data.userSection || undefined,
          flaggedAsAI: data.flaggedAsAI || false,
          flaggedAsAIBy: data.flaggedAsAIBy || '',
          flaggedAsAIAt: data.flaggedAsAIAt || '',
          feedbackReadAt: data.feedbackReadAt || undefined,
          feedbackReviewedAt: data.feedbackReviewedAt || undefined,
          classType: data.classType || undefined,
        } as Submission;
      })
      // Sort client-side instead
      .sort((a, b) => new Date(b.submittedAt || '').getTime() - new Date(a.submittedAt || '').getTime());
      callback(submissions);
    }, (error: unknown) => reportError(error, { subscription: 'userSubmissions' }));
  },

  subscribeToWhitelist: (callback: (whitelist: WhitelistedUser[]) => void) => {
    const q = collection(db, 'allowed_emails');
    return onSnapshot(q, (snapshot) => {
      const whitelist = snapshot.docs.map(doc => ({
          email: doc.id,
          classType: doc.data().classType as ClassType,
          classTypes: (doc.data().classTypes || [doc.data().classType].filter(Boolean)) as ClassType[]
      }));
      callback(whitelist);
    }, (error: unknown) => reportError(error, { subscription: 'whitelist' }));
  },

  subscribeToClassConfigs: (callback: (configs: ClassConfig[]) => void) => {
      const q = collection(db, 'class_configs');
      return onSnapshot(q, (snapshot) => {
          const configs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClassConfig));
          callback(configs);
      }, (error: unknown) => reportError(error, { subscription: 'classConfigs' }));
  },

  addAssignment: async (assignment: Assignment) => {
    try {
      const data: Record<string, unknown> = {
        title: assignment.title,
        description: assignment.description,
        classType: assignment.classType,
        status: assignment.status,
        unit: assignment.unit || 'Unassigned Unit',
        category: assignment.category || 'Lesson',
        htmlContent: assignment.htmlContent || '',
        contentUrl: assignment.contentUrl || null,
        resources: assignment.resources || [],
        publicComments: assignment.publicComments || [],
        dueDate: assignment.dueDate || null,
        targetSections: assignment.targetSections && assignment.targetSections.length > 0 ? assignment.targetSections : [],
        scheduledAt: assignment.scheduledAt || null,
        lessonBlocks: assignment.lessonBlocks && assignment.lessonBlocks.length > 0 ? assignment.lessonBlocks : [],
        isAssessment: assignment.isAssessment || false,
        assessmentConfig: assignment.assessmentConfig
          ? {
              ...assignment.assessmentConfig,
              maxAttempts:
                typeof assignment.assessmentConfig.maxAttempts === 'number'
                  ? assignment.assessmentConfig.maxAttempts
                  : (parseInt(String(assignment.assessmentConfig.maxAttempts), 10) || 0),
            }
          : null,
        rubric: assignment.rubric || null,
        updatedAt: new Date().toISOString(),
      };

      if (assignment.id) {
          // Lazy backfill: if existing resource has no createdAt, set it now
          if (!assignment.createdAt) {
            data.createdAt = new Date().toISOString();
          }
          await setDoc(doc(db, 'assignments', assignment.id), data, { merge: true });
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db, 'assignments'), data);
      }
    } catch (error) {
      reportError(error, { method: 'addAssignment' });
      throw error;
    }
  },

  updateAssignmentStatus: async (id: string, status: AssignmentStatus) => {
    try {
      await updateDoc(doc(db, 'assignments', id), { status });
    } catch (error) {
      reportError(error, { method: 'updateAssignmentStatus' });
    }
  },

  deleteAssignment: async (id: string) => {
    try {
      await deleteDoc(doc(db, 'assignments', id));
    } catch (error) {
      reportError(error, { method: 'deleteAssignment' });
    }
  },

  updateAssignmentClassroomLink: async (assignmentId: string, link: ClassroomLink | null) => {
    try {
      if (link) {
        await updateDoc(doc(db, 'assignments', assignmentId), { classroomLink: link });
      } else {
        await updateDoc(doc(db, 'assignments', assignmentId), { classroomLink: deleteField() });
      }
    } catch (error) {
      reportError(error, { method: 'updateAssignmentClassroomLink' });
      throw error;
    }
  },

  /** Write multi-section classroom links. Cleans up legacy classroomLink field on write. */
  updateAssignmentClassroomLinks: async (assignmentId: string, links: ClassroomLinkEntry[] | null) => {
    try {
      if (links && links.length > 0) {
        await updateDoc(doc(db, 'assignments', assignmentId), {
          classroomLinks: links,
          classroomLink: deleteField(),
        });
      } else {
        await updateDoc(doc(db, 'assignments', assignmentId), {
          classroomLinks: deleteField(),
          classroomLink: deleteField(),
        });
      }
    } catch (error) {
      reportError(error, { method: 'updateAssignmentClassroomLinks' });
      throw error;
    }
  },

  /** Read the admin's hidden Google Classroom course IDs.
   * Fails silently (returns []) — graceful degradation so the modal still opens
   * even if prefs are temporarily unreadable (e.g. brief permission hiccup). */
  getClassroomPrefs: async (): Promise<{ hiddenCourseIds: string[] }> => {
    try {
      const snap = await getDoc(doc(db, 'adminSettings', 'classroomPrefs'));
      if (!snap.exists()) return { hiddenCourseIds: [] };
      return { hiddenCourseIds: snap.data().hiddenCourseIds ?? [] };
    } catch (error) {
      reportError(error, { method: 'getClassroomPrefs' });
      return { hiddenCourseIds: [] }; // intentional: don't break the modal on read failure
    }
  },

  /** Persist the list of hidden Google Classroom course IDs for the admin. */
  setHiddenClassroomCourses: async (hiddenCourseIds: string[]) => {
    try {
      await setDoc(doc(db, 'adminSettings', 'classroomPrefs'), { hiddenCourseIds }, { merge: true });
    } catch (error) {
      reportError(error, { method: 'setHiddenClassroomCourses' });
      throw error;
    }
  },

  addToWhitelist: async (email: string, classType: ClassType) => {
    try {
      await callAdminAddToWhitelist({ email, classType });
    } catch (error) {
      reportError(error, { method: 'addToWhitelist' });
    }
  },

  updateWhitelistSection: async (email: string, section: string, classType?: string) => {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      await updateDoc(doc(db, 'allowed_emails', normalizedEmail), { section });
      // Also update user doc if they already exist
      const q = query(collection(db, 'users'), where('email', '==', normalizedEmail));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(async (d) => {
        if (classType) {
          // Write to per-class classSections map
          await updateDoc(doc(db, 'users', d.id), {
            [`classSections.${classType}`]: section || null,
          });
        } else {
          await updateDoc(doc(db, 'users', d.id), { section });
        }
      }));
    } catch (error) {
      reportError(error, { method: 'updateWhitelistSection' });
    }
  },

  // Direct section update by userId (for inline editing in admin panel)
  updateUserSection: async (userId: string, section: string) => {
    await updateDoc(doc(db, 'users', userId), { section });
  },

  // Per-class section update (new model: classSections map)
  updateUserClassSection: async (userId: string, classType: string, section: string) => {
    await updateDoc(doc(db, 'users', userId), {
      [`classSections.${classType}`]: section || null,
    });
  },

  removeFromWhitelist: async (email: string) => {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      await deleteDoc(doc(db, 'allowed_emails', normalizedEmail));
      const q = query(collection(db, 'users'), where('email', '==', normalizedEmail));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(async (d) => {
        await updateDoc(doc(db, 'users', d.id), {
          isWhitelisted: false,
          enrolledClasses: [],
          classType: 'Uncategorized'
        });
      }));
    } catch (error) {
      reportError(error, { method: 'removeFromWhitelist' });
    }
  },

  approveUser: async (userId: string, classType: ClassType) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if(userSnap.exists()) {
          const userData = userSnap.data();
          const currentClasses = userData.enrolledClasses || (userData.classType ? [userData.classType] : []);
          const newClasses = Array.from(new Set([...currentClasses, classType]));
          
          await updateDoc(userRef, {
            isWhitelisted: true,
            classType: classType,
            enrolledClasses: newClasses
          });
          
          const email = userData.email;
          if(email) {
              const normalizedEmail = email.toLowerCase().trim();
              const wlSnap = await getDoc(doc(db, 'allowed_emails', normalizedEmail));
              const existingTypes: string[] = wlSnap.exists() ? (wlSnap.data().classTypes || [wlSnap.data().classType].filter(Boolean)) : [];
              const mergedTypes = Array.from(new Set([...existingTypes, classType]));
              await setDoc(doc(db, 'allowed_emails', normalizedEmail), { classType, classTypes: mergedTypes });
          }
      }
    } catch (error) {
      reportError(error, { method: 'approveUser' });
    }
  },

  removeUser: async (userId: string) => {
    try {
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (userSnap.exists()) {
        const email = userSnap.data().email;
        if (email) await deleteDoc(doc(db, 'allowed_emails', email.toLowerCase().trim()));
      }
      await deleteDoc(doc(db, 'users', userId));
    } catch (error) {
      reportError(error, { method: 'removeUser' });
    }
  },

  submitAssignment: async (submission: Submission) => {
    try {
      const subId = `${submission.userId}_${submission.assignmentId}`;
      await setDoc(doc(db, 'submissions', subId), {
        userId: submission.userId,
        userName: submission.userName,
        assignmentId: submission.assignmentId,
        assignmentTitle: submission.assignmentTitle,
        metrics: submission.metrics,
        status: submission.status,
        score: submission.score, 
        submittedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (error) {
      reportError(error, { method: 'submitAssignment' });
    }
  },

  // Submit review-question engagement time for bucketing — NO XP awarded.
  // Atomically increments engagementTime on an existing submission, or creates
  // a minimal record if none exists, so the telemetry bucket sees the time.
  submitReviewEngagement: async (userId: string, assignmentId: string, assignmentTitle: string, classType: string, engagementTime: number) => {
    if (engagementTime < 5) return; // Ignore trivially short visits
    try {
      const subId = `${userId}_${assignmentId}`;
      const ref = doc(db, 'submissions', subId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        // Atomically add review time to the existing submission's engagementTime
        await updateDoc(ref, {
          'metrics.engagementTime': increment(engagementTime),
          'metrics.lastActive': Date.now(),
        });
      } else {
        // No prior submission — create a minimal record for bucket tracking
        await setDoc(ref, {
          userId,
          assignmentId,
          assignmentTitle,
          classType,
          metrics: {
            engagementTime,
            pasteCount: 0,
            keystrokes: 0,
            clickCount: 0,
            startTime: Date.now() - engagementTime * 1000,
            lastActive: Date.now(),
          },
          status: 'STARTED',
          score: 0,
          submittedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      reportError(err, { method: 'submitReviewEngagement' });
    }
  },

  updateUserEnrolledClasses: async (userId: string, classes: ClassType[]) => {
      try {
          const userRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) return;
          
          const userData = userSnap.data();
          const email = userData.email;
          
          const updates: Record<string, unknown> = {
            enrolledClasses: classes,
            classType: classes.length > 0 ? classes[0] : 'Uncategorized'
          };
          
          const normalizedEmail = email?.toLowerCase().trim();
          if (classes.length === 0) {
              updates.isWhitelisted = false;
              if (normalizedEmail) {
                  await deleteDoc(doc(db, 'allowed_emails', normalizedEmail));
              }
          } else {
              updates.isWhitelisted = true;
              if (normalizedEmail) {
                  await setDoc(doc(db, 'allowed_emails', normalizedEmail), { classType: classes[0], classTypes: classes });
              }
          }
          
          await updateDoc(userRef, updates);
      } catch (error) {
          reportError(error, { method: 'updateUserClasses' });
      }
  },

  updateUserClass: async (userId: string, classType: ClassType) => {
    try {
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if(snap.exists()) {
          const currentClasses = snap.data().enrolledClasses || [];
          const newClasses = Array.from(new Set([...currentClasses, classType]));
          await updateDoc(userRef, { 
            classType, 
            enrolledClasses: newClasses, 
            isWhitelisted: true 
          });
          
          const email = snap.data().email;
          if (email) {
             const normalizedEmail = email.toLowerCase().trim();
             const whitelistRef = doc(db, 'allowed_emails', normalizedEmail);
             const existing = await getDoc(whitelistRef);
             const currentTypes: string[] = existing.exists() ? (existing.data()?.classTypes || [existing.data()?.classType].filter(Boolean)) : [];
             const mergedTypes = Array.from(new Set([...currentTypes, classType]));
             await setDoc(whitelistRef, { classType, classTypes: mergedTypes }, { merge: true });
          }
      }
    } catch (error) {
      reportError(error, { method: 'updateUserClass' });
    }
  },

  switchUserView: async (userId: string, classType: string) => {
    try {
        await updateDoc(doc(db, 'users', userId), { classType });
    } catch (e) {
        reportError(e, { method: 'switchUserView' });
    }
  },

  awardXP: async (userId: string, amount: number, classType?: string) => {
      await callAwardXP({ targetUserId: userId, xpAmount: amount, classType });
  },

  submitEngagement: async (_userId: string, userName: string, assignmentId: string, assignmentTitle: string, metrics: TelemetryMetrics, classType: string) => {
      const result = await callSubmitEngagement({ assignmentId, assignmentTitle, userName, metrics, classType });
      return result.data as { xpEarned: number; leveledUp: boolean; status: string };
  },

  submitAssessment: async (userName: string, assignmentId: string, responses: Record<string, unknown>, metrics: TelemetryMetrics, classType: string, sessionToken?: string) => {
      const result = await callSubmitAssessment({ assignmentId, userName, responses, metrics, classType, ...(sessionToken ? { sessionToken } : {}) });
      return result.data as {
        assessmentScore: { correct: number; total: number; percentage: number; perBlock: Record<string, { correct: boolean; answer: unknown }> };
        attemptNumber: number;
        status: string;
        xpEarned: number;
      };
  },

  saveRubricGrade: async (submissionId: string, rubricGrade: RubricGrade, studentUserId?: string, assessmentTitle?: string): Promise<{ clearedAIFlag: boolean }> => {
    let clearedAIFlag = false;
    try {
      // Check if submission is AI-flagged — grading implies teacher cleared it
      const snap = await getDoc(doc(db, 'submissions', submissionId));
      const prev = snap.data();
      
      // Preserve existing feedback history if present
      const existingFeedbackHistory = rubricGrade.feedbackHistory || [];
      
      // If the old rubricGrade has teacherFeedback, prepend it to history
      if (prev?.rubricGrade?.teacherFeedback) {
        const oldEntry: FeedbackHistoryEntry = {
          feedback: prev.rubricGrade.teacherFeedback,
          timestamp: prev.rubricGrade.gradedAt || new Date().toISOString(),
          gradedBy: prev.rubricGrade.gradedBy || '',
        };
        rubricGrade.feedbackHistory = [oldEntry, ...existingFeedbackHistory].slice(0, 20);
      }
      
      const updatePayload: Record<string, unknown> = {
        rubricGrade,
        score: rubricGrade.overallPercentage,
      };
      if (prev?.flaggedAsAI) {
        // Auto-clear AI flag: teacher grading is an implicit decision the work is legitimate
        updatePayload.flaggedAsAI = false;
        updatePayload.flaggedAsAIBy = '';
        updatePayload.flaggedAsAIAt = '';
        updatePayload.status = prev.preFlagStatus ?? 'NORMAL';
        updatePayload['assessmentScore.percentage'] = rubricGrade.overallPercentage;
        clearedAIFlag = true;
      }
      await updateDoc(doc(db, 'submissions', submissionId), updatePayload);
    } catch (error) {
      reportError(error, { method: 'saveRubricGrade' });
      throw error;
    }
    // Notify the student that their assessment has been graded
    if (studentUserId) {
      const notificationType = clearedAIFlag ? 'AI_FLAGGED' : 'ASSESSMENT_GRADED';
      const notificationTitle = clearedAIFlag ? 'AI Flag Cleared & Assessment Graded' : 'Assessment Graded';
      const notificationMessage = clearedAIFlag
        ? `Your submission${assessmentTitle ? ` for "${assessmentTitle}"` : ''} has been reviewed. The AI flag has been removed and you received ${rubricGrade.overallPercentage}%.`
        : `Your submission${assessmentTitle ? ` for "${assessmentTitle}"` : ''} has been graded. You received ${rubricGrade.overallPercentage}%.`;
      addDoc(collection(db, 'notifications'), {
        userId: studentUserId,
        type: notificationType,
        title: notificationTitle,
        message: notificationMessage,
        timestamp: new Date().toISOString(),
        isRead: false,
        meta: { submissionId, assessmentTitle, percentage: rubricGrade.overallPercentage },
      }).catch(err => reportError(err, { method: 'saveRubricGrade:notification' }));
    }
    return { clearedAIFlag };
  },

  /**
   * Send teacher feedback to a draft/not-started student.
   * - Always sends a TEACHER_FEEDBACK notification to the student.
   * - For draft students (have a lesson_block_responses doc), appends the message
   *   to `draftFeedbackMessages` array on that doc so the teacher can see history.
   * - For not-started students (no draft doc), notification-only (no history stored).
   */
  sendDraftFeedback: async (
    studentId: string,
    assignmentId: string,
    message: string,
    assessmentTitle?: string,
  ): Promise<void> => {
    try {
      const entry: DraftFeedbackMessage = {
        message: message.trim(),
        sentAt: new Date().toISOString(),
        sentBy: 'Admin',
      };

      // Attempt to append to draft doc (exists for draft students, not for not-started)
      const draftDocRef = doc(db, 'lesson_block_responses', `${studentId}_${assignmentId}_blocks`);
      const draftSnap = await getDoc(draftDocRef);
      if (draftSnap.exists()) {
        await updateDoc(draftDocRef, {
          draftFeedbackMessages: arrayUnion(entry),
        });
      }

      // Always send a notification so the student sees it in the portal
      await addDoc(collection(db, 'notifications'), {
        userId: studentId,
        type: 'TEACHER_FEEDBACK' as const,
        title: 'Teacher Feedback',
        message: `${assessmentTitle ? `"${assessmentTitle}" — ` : ''}${message.trim()}`,
        timestamp: new Date().toISOString(),
        isRead: false,
        meta: { assignmentId, assessmentTitle },
      });
    } catch (error) {
      reportError(error, { method: 'sendDraftFeedback' });
      throw error;
    }
  },

  /**
   * Fetch previously sent draft feedback messages for a student on an assignment.
   * Returns empty array if no draft doc or no messages.
   */
  fetchDraftFeedbackMessages: async (
    studentId: string,
    assignmentId: string,
  ): Promise<DraftFeedbackMessage[]> => {
    try {
      const draftDocRef = doc(db, 'lesson_block_responses', `${studentId}_${assignmentId}_blocks`);
      const snap = await getDoc(draftDocRef);
      if (!snap.exists()) return [];
      const data = snap.data();
      return (data.draftFeedbackMessages as DraftFeedbackMessage[]) || [];
    } catch (error) {
      reportError(error, { method: 'fetchDraftFeedbackMessages' });
      return [];
    }
  },

  /**
   * Mark teacher feedback as read by the student.
   * Writes feedbackReadAt (ISO timestamp) to the submission document.
   * Awards 5 XP only if feedbackReadAt was not previously set.
   */
  markFeedbackRead: async (submissionId: string): Promise<void> => {
    try {
      // First check if feedbackReadAt is already set
      const snap = await getDoc(doc(db, 'submissions', submissionId));
      const data = snap.data();
      
      // Only award XP if not already set
      if (!data?.feedbackReadAt) {
        await dataService.awardXP(data?.userId, 5);
      }
      
      // Always update the timestamp
      await updateDoc(doc(db, 'submissions', submissionId), {
        feedbackReadAt: new Date().toISOString(),
      });
    } catch (error) {
      // Non-critical — swallow silently so it never blocks the UI
      reportError(error, { method: 'markFeedbackRead', submissionId });
    }
  },

  /**
   * Mark teacher feedback as reviewed by the student.
   * Writes feedbackReviewedAt (ISO timestamp) to the submission document.
   * Awards 10 XP only if feedbackReviewedAt was not previously set.
   */
  markFeedbackReviewed: async (submissionId: string): Promise<void> => {
    try {
      // First check if feedbackReviewedAt is already set
      const snap = await getDoc(doc(db, 'submissions', submissionId));
      const data = snap.data();
      
      // Only award XP if not already set
      if (!data?.feedbackReviewedAt) {
        await dataService.awardXP(data?.userId, 10);
      }
      
      // Always update the timestamp
      await updateDoc(doc(db, 'submissions', submissionId), {
        feedbackReadAt: new Date().toISOString(),
        feedbackReviewedAt: new Date().toISOString(),
      });
    } catch (error) {
      reportError(error, { method: 'markFeedbackReviewed', submissionId });
    }
  },

  flagSubmissionAsAI: async (submissionId: string, flaggedBy: string, studentUserId?: string, assessmentTitle?: string) => {
    try {
      // Save original score/status so unflagging can restore them
      const snap = await getDoc(doc(db, 'submissions', submissionId));
      const prev = snap.data();
      await updateDoc(doc(db, 'submissions', submissionId), {
        flaggedAsAI: true,
        flaggedAsAIBy: flaggedBy,
        flaggedAsAIAt: new Date().toISOString(),
        status: 'FLAGGED',
        score: 0,
        'assessmentScore.percentage': 0,
        preFlagScore: prev?.score ?? 0,
        preFlagStatus: prev?.status ?? 'NORMAL',
        preFlagPercentage: prev?.assessmentScore?.percentage ?? 0,
      });
    } catch (error) {
      reportError(error, { method: 'flagSubmissionAsAI' });
      throw error;
    }
    // Send notification to the student (fire-and-forget — don't block the flag operation)
    if (studentUserId) {
      addDoc(collection(db, 'notifications'), {
        userId: studentUserId,
        type: 'AI_FLAGGED',
        title: 'Assessment Flagged for Academic Integrity',
        message: `Your submission${assessmentTitle ? ` for "${assessmentTitle}"` : ''} has been flagged for suspected AI usage and is currently scored as 0%. You may resubmit or provide a written defense to your teacher.`,
        timestamp: new Date().toISOString(),
        isRead: false,
        meta: { submissionId, assessmentTitle },
      }).catch(err => reportError(err, { method: 'flagSubmissionAsAI:notification' }));
    }
  },

  unflagSubmissionAsAI: async (submissionId: string) => {
    try {
      const snap = await getDoc(doc(db, 'submissions', submissionId));
      if (!snap.exists()) throw new Error('Submission not found');
      const prev = snap.data();
      await updateDoc(doc(db, 'submissions', submissionId), {
        flaggedAsAI: false,
        flaggedAsAIBy: '',
        flaggedAsAIAt: '',
        status: prev?.preFlagStatus ?? 'NORMAL',
        score: prev?.preFlagScore ?? 0,
        'assessmentScore.percentage': prev?.preFlagPercentage ?? 0,
      });
    } catch (error) {
      reportError(error, { method: 'unflagSubmissionAsAI' });
      throw error;
    }
  },

  // --- AI GRADING ASSISTANT ---

  saveAISuggestedGrade: async (submissionId: string, aiGrade: AISuggestedGrade) => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        aiSuggestedGrade: aiGrade,
      });
    } catch (error) {
      reportError(error, { method: 'saveAISuggestedGrade' });
      throw error;
    }
  },

  acceptAISuggestedGrade: async (submissionId: string, rubricGrade: RubricGrade, studentUserId?: string, assessmentTitle?: string): Promise<{ clearedAIFlag: boolean }> => {
    // Mark the AI suggestion as accepted and save the final rubric grade
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        'aiSuggestedGrade.status': 'accepted',
      });
    } catch (error) {
      reportError(error, { method: 'acceptAISuggestedGrade:status' });
    }
    return dataService.saveRubricGrade(submissionId, rubricGrade, studentUserId, assessmentTitle);
  },

  dismissAISuggestedGrade: async (submissionId: string) => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        'aiSuggestedGrade.status': 'rejected',
      });
    } catch (error) {
      reportError(error, { method: 'dismissAISuggestedGrade' });
      throw error;
    }
  },

  /** Save a student note for a specific block on a submission. */
  saveStudentNote: async (submissionId: string, blockId: string, note: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        [`studentNotes.${blockId}`]: note,
      });
    } catch (error) {
      reportError(error, { method: 'saveStudentNote' });
      throw error;
    }
  },

  /** Get all student notes for a submission. */
  getStudentNotes: async (submissionId: string): Promise<Record<string, string>> => {
    try {
      const snap = await getDoc(doc(db, 'submissions', submissionId));
      if (!snap.exists()) return {};
      return (snap.data()?.studentNotes as Record<string, string>) ?? {};
    } catch (error) {
      reportError(error, { method: 'getStudentNotes' });
      throw error;
    }
  },

  /** Save per-skill corrections when teacher modifies AI suggestions — used as few-shot examples */
  saveGradingCorrections: async (corrections: Omit<GradingCorrection, 'id'>[]) => {
    try {
      for (const correction of corrections) {
        await addDoc(collection(db, 'grading_corrections'), stripUndefined(correction));
      }
    } catch (error) {
      reportError(error, { method: 'saveGradingCorrections' });
      // Non-critical — don't throw, just log
    }
  },

  subscribeToLeaderboard: (callback: (users: User[]) => void, maxResults = 200) => {
      // Reads from /public_profiles — a mirror of safe leaderboard fields maintained
      // server-side. Authenticated students can read this collection (rules.firestore).
      const q = query(collection(db, 'public_profiles'), limit(maxResults));
      return onSnapshot(q, (snapshot) => {
          callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User)));
      }, (error: unknown) => reportError(error, { subscription: 'leaderboard' }));
  },

  saveClassConfig: async (config: ClassConfig) => {
    try {
      await setDoc(doc(db, 'class_configs', config.className), config);
    } catch (error) {
      reportError(error, { method: 'saveClassConfig' });
      throw error;
    }
  },
  
  deleteClassConfig: async (className: string) => {
    try {
      await deleteDoc(doc(db, 'class_configs', className));
    } catch (error) {
      reportError(error, { method: 'deleteClassConfig' });
      throw error;
    }
  },

  uploadResource: async (file: File): Promise<string> => {
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const storageRef = ref(storage, `resources/${uniqueId}_${file.name}`);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
  },

  uploadHtmlResource: async (file: File): Promise<string> => {
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const storageRef = ref(storage, `resources/html/${uniqueId}_${file.name}`);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
  },

  uploadLessonImage: async (file: File): Promise<string> => {
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const storageRef = ref(storage, `lesson-images/${uniqueId}_${file.name}`);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
  },

  // --- ANNOUNCEMENTS ---

  subscribeToAnnouncements: (callback: (announcements: Announcement[]) => void) => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(20));
    return resilientSnapshot('announcements', q, (snapshot: any) => {
        const now = new Date();
        const announcements = snapshot.docs
            .map((d: any) => ({ id: d.id, ...d.data() } as Announcement))
            .filter((a: Announcement) => !a.expiresAt || new Date(a.expiresAt) > now);
        callback(announcements);
    });
  },

  createAnnouncement: async (announcement: Omit<Announcement, 'id'>) => {
    await addDoc(collection(db, 'announcements'), announcement);
  },

  deleteAnnouncement: async (id: string) => {
    await deleteDoc(doc(db, 'announcements', id));
  },

  dismissAnnouncement: async (userId: string, announcementId: string) => {
    await updateDoc(doc(db, 'users', userId), {
        'gamification.dismissedAnnouncements': arrayUnion(announcementId)
    });
  },

  // --- NOTIFICATIONS ---

  subscribeToNotifications: (userId: string, callback: (notifications: Notification[]) => void) => {
    const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(50)
    );
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
    }, (error: unknown) => reportError(error, { subscription: 'notifications' }));
  },

  markNotificationRead: async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
    } catch (error) {
      reportError(error, { method: 'markNotificationRead', notificationId });
    }
  },

  markAllNotificationsRead: async (userId: string) => {
    try {
      const q = query(
          collection(db, 'notifications'),
          where('userId', '==', userId),
          where('isRead', '==', false)
      );
      const snapshot = await getDocs(q);
      const updates = snapshot.docs.map(d => updateDoc(d.ref, { isRead: true }));
      await Promise.all(updates);
    } catch (error) {
      reportError(error, { method: 'markAllNotificationsRead', userId });
    }
  },

  createNotification: async (notification: Omit<Notification, 'id'>) => {
    try {
      await addDoc(collection(db, 'notifications'), notification);
    } catch (error) {
      reportError(error, { method: 'createNotification' });
    }
  },

  // Bulk-create notifications for a list of users
  notifyUsers: async (userIds: string[], type: Notification['type'], title: string, message: string, meta?: Record<string, any>) => {
    try {
      const batch = userIds.map(userId => addDoc(collection(db, 'notifications'), {
          userId, type, title, message,
          timestamp: new Date().toISOString(),
          isRead: false,
          meta: meta || {}
      }));
      await Promise.all(batch);
    } catch (error) {
      reportError(error, { method: 'notifyUsers', userCount: userIds.length });
    }
  },

  // --- CODENAME ---

  updateCodename: async (userId: string, codename: string, lock?: boolean) => {
    const updates: Record<string, unknown> = { 'gamification.codename': codename };
    if (lock !== undefined) updates['gamification.codenameLocked'] = lock;
    await updateDoc(doc(db, 'users', userId), updates);
  },

  toggleCodenameLock: async (userId: string, locked: boolean) => {
    await updateDoc(doc(db, 'users', userId), { 'gamification.codenameLocked': locked });
  },

  // --- ENGAGEMENT STREAKS ---

  updateEngagementStreak: async () => {
    const result = await callUpdateStreak({});
    return result.data as { streak: number; alreadyUpdated?: boolean };
  },

  // --- DAILY LOGIN REWARD ---

  claimDailyLogin: async () => {
    const result = await callClaimDailyLogin({});
    return result.data as {
      alreadyClaimed: boolean;
      streak: number;
      xpReward?: number;
      fluxReward?: number;
      leveledUp?: boolean;
    };
  },

  // --- FORTUNE WHEEL ---

  spinFortuneWheel: async (classType?: string) => {
    const result = await callSpinFortuneWheel({ classType });
    return result.data as {
      prizeId: string;
      prizeType: string;
      rewardDescription: string;
    };
  },

  // --- SKILL TREE ---

  unlockSkill: async (skillId: string, specialization: string) => {
    const result = await callUnlockSkill({ skillId, specialization });
    return result.data as { success: boolean; remainingPoints: number };
  },

  // --- ITEM ENCHANTING / SOCKETING ---

  addSocket: async (itemId: string, classType?: string) => {
    const result = await callAddSocket({ itemId, classType });
    return result.data as { item: RPGItem; newCurrency: number };
  },

  socketGem: async (itemId: string, gemId: string, classType?: string) => {
    const result = await callSocketGem({ itemId, gemId, classType });
    return result.data as { item: RPGItem; newCurrency: number; runewordActivated?: { id: string; name: string } | null };
  },

  unsocketGem: async (itemId: string, gemIndex: number, classType?: string) => {
    const result = await callUnsocketGem({ itemId, gemIndex, classType });
    return result.data as { item: RPGItem; newCurrency: number; cost: number; gem: { id: string; name: string } };
  },

  // --- BOSS ENCOUNTERS (Distributed Counter Pattern) ---

  subscribeToBossEncounters: (callback: (bosses: BossEncounter[]) => void) => {
    const q = query(collection(db, 'boss_encounters'), where('isActive', '==', true));
    return resilientSnapshot('boss_encounters', q, (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as BossEncounter)));
    });
  },

  // Admin: subscribe to ALL boss encounters (including inactive), capped at 50
  subscribeToAllBossEncounters: (callback: (bosses: BossEncounter[]) => void) => {
    const q = query(collection(db, 'boss_encounters'), limit(50));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as BossEncounter)));
    }, (error: unknown) => reportError(error, { subscription: 'allBossEncounters' }));
  },

  // Admin: create or update a boss encounter
  saveBossEncounter: async (boss: BossEncounter) => {
    const ref = doc(db, 'boss_encounters', boss.id);
    await setDoc(ref, boss);
  },

  // Admin: toggle boss active state
  toggleBossActive: async (bossId: string, isActive: boolean) => {
    const ref = doc(db, 'boss_encounters', bossId);
    await updateDoc(ref, { isActive });
  },

  // Admin: delete a boss encounter
  deleteBossEncounter: async (bossId: string) => {
    const ref = doc(db, 'boss_encounters', bossId);
    await deleteDoc(ref);
  },

  // Subscribe to a boss's distributed damage shards for real-time HP aggregation
  subscribeToBossShards: (bossId: string, callback: (totalDamage: number) => void) => {
    const shardsRef = collection(db, `boss_encounters/${bossId}/shards`);
    return onSnapshot(shardsRef, (snapshot) => {
      let totalDamage = 0;
      snapshot.forEach((d) => { totalDamage += d.data().damageDealt || 0; });
      callback(totalDamage);
    }, (error: unknown) => reportError(error, { subscription: 'bossShards', bossId }));
  },

  // Subscribe to a boss's damage log subcollection for the leaderboard
  subscribeToBossDamageLog: (bossId: string, callback: (log: { userId: string; userName: string; damage: number; timestamp: string }[]) => void) => {
    const logRef = collection(db, `boss_encounters/${bossId}/damage_log`);
    return onSnapshot(logRef, (snapshot) => {
      const entries = snapshot.docs.map((d) => d.data() as { userId: string; userName: string; damage: number; timestamp: string });
      callback(entries);
    }, (error: unknown) => reportError(error, { subscription: 'bossDamageLog', bossId }));
  },

  dealBossDamage: async (bossId: string, userName: string, classType: string) => {
    const result = await callDealBossDamage({ bossId, userName, classType });
    return result.data as {
      newHp: number;
      damageDealt: number;
      isCrit: boolean;
      xpEarned: number;
      bossDefeated: boolean;
      leveledUp: boolean;
      stats: { tech: number; focus: number; analysis: number; charisma: number };
      gearScore: number;
    };
  },

  // --- BOSS QUIZ (Distributed Counter Pattern) ---

  subscribeToBossQuizzes: (classType: string, callback: (quizzes: BossQuizEvent[]) => void) => {
    const q = query(collection(db, 'boss_quizzes'), where('isActive', '==', true));
    return resilientSnapshot('boss_quizzes', q, (snapshot: any) => {
      const quizzes = snapshot.docs
        .map((d: any) => ({ id: d.id, ...d.data() } as BossQuizEvent))
        .filter((q: BossQuizEvent) => q.classType === classType || q.classType === 'GLOBAL');
      callback(quizzes);
    });
  },

  // Subscribe to a boss quiz's distributed damage shards for real-time HP aggregation
  subscribeToBossQuizShards: (quizId: string, callback: (totalDamage: number) => void) => {
    const shardsRef = collection(db, `boss_quizzes/${quizId}/shards`);
    return onSnapshot(shardsRef, (snapshot) => {
      let totalDamage = 0;
      snapshot.forEach((d) => { totalDamage += d.data().damageDealt || 0; });
      callback(totalDamage);
    }, (error: unknown) => reportError(error, { subscription: 'bossQuizShards', quizId }));
  },

  subscribeToBossQuizDamageLog: (quizId: string, callback: (log: { userId: string; userName: string; damage: number; isCrit?: boolean; timestamp: string }[]) => void) => {
    const logRef = collection(db, `boss_quizzes/${quizId}/damage_log`);
    return onSnapshot(logRef, (snapshot) => {
      const entries = snapshot.docs.map((d) => d.data() as { userId: string; userName: string; damage: number; isCrit?: boolean; timestamp: string });
      callback(entries);
    }, (error: unknown) => reportError(error, { subscription: 'bossQuizDamageLog', quizId }));
  },

  scaleBossHp: async (quizId: string) => {
    const result = await callScaleBossHp({ quizId });
    return result.data as { scaledMaxHp: number; originalMaxHp: number };
  },

  // Admin: subscribe to ALL quiz bosses (including inactive)
  subscribeToAllBossQuizzes: (callback: (quizzes: BossQuizEvent[]) => void) => {
    const q = collection(db, 'boss_quizzes');
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as BossQuizEvent)));
    }, (error: unknown) => reportError(error, { subscription: 'allBossQuizzes' }));
  },

  // Admin: create or update a quiz boss
  saveBossQuiz: async (quiz: BossQuizEvent) => {
    const ref = doc(db, 'boss_quizzes', quiz.id);
    await setDoc(ref, quiz);
  },

  // Admin: toggle quiz boss active state
  toggleBossQuizActive: async (quizId: string, isActive: boolean) => {
    const ref = doc(db, 'boss_quizzes', quizId);
    await updateDoc(ref, { isActive });
  },

  // Admin: delete a quiz boss
  deleteBossQuiz: async (quizId: string) => {
    const ref = doc(db, 'boss_quizzes', quizId);
    await deleteDoc(ref);
  },

  // --- BOSS QUESTION BANKS ---

  subscribeToBossQuestionBanks: (callback: (banks: import('../types').BossQuestionBank[]) => void) => {
    return onSnapshot(collection(db, 'boss_question_banks'), (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as import('../types').BossQuestionBank)));
    }, (error: unknown) => reportError(error, { subscription: 'bossQuestionBanks' }));
  },

  saveBossQuestionBank: async (bank: import('../types').BossQuestionBank) => {
    const ref = doc(db, 'boss_question_banks', bank.id);
    await setDoc(ref, bank);
  },

  deleteBossQuestionBank: async (bankId: string) => {
    await deleteDoc(doc(db, 'boss_question_banks', bankId));
  },

  // --- BOSS QUIZ ENDGAME STATS (Admin) ---

  getBossQuizAllProgress: async (quizId: string) => {
    const q = query(collection(db, 'boss_quiz_progress'), where('quizId', '==', quizId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as import('../types').BossQuizProgress);
  },

  // --- BOSS QUIZ PROGRESS (Student) ---

  subscribeToBossQuizProgress: (userId: string, quizId: string, callback: (progress: import('../types').BossQuizProgress | null) => void) => {
    const ref = doc(db, 'boss_quiz_progress', `${userId}_${quizId}`);
    return onSnapshot(ref, (snap) => {
      callback(snap.exists() ? (snap.data() as import('../types').BossQuizProgress) : null);
    }, () => callback(null));
  },

  // --- UNIFIED BOSS EVENTS (v2) ---

  subscribeToBossEvents: (classType: string, callback: (events: import('../types').BossEvent[]) => void) => {
    const q = query(collection(db, 'boss_events'), where('isActive', '==', true));
    return resilientSnapshot('boss_events', q, (snapshot: any) => {
      const events = snapshot.docs
        .map((d: any) => ({ id: d.id, ...d.data() } as import('../types').BossEvent))
        .filter((e: import('../types').BossEvent) => e.classType === classType || e.classType === 'GLOBAL');
      callback(events);
    });
  },

  subscribeToAllBossEvents: (callback: (events: import('../types').BossEvent[]) => void) => {
    const q = collection(db, 'boss_events');
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as import('../types').BossEvent)));
    }, (error: unknown) => reportError(error, { subscription: 'allBossEvents' }));
  },

  subscribeToBossEventShards: (eventId: string, callback: (totalDamage: number) => void) => {
    const shardsRef = collection(db, `boss_events/${eventId}/shards`);
    return onSnapshot(shardsRef, (snapshot) => {
      let totalDamage = 0;
      snapshot.forEach((d) => { totalDamage += d.data().damageDealt || 0; });
      callback(totalDamage);
    }, (error: unknown) => reportError(error, { subscription: 'bossEventShards', eventId }));
  },

  subscribeToBossEventDamageLog: (eventId: string, callback: (log: { userId: string; userName: string; damage: number; isCrit?: boolean; timestamp: string; attemptNumber?: number }[]) => void) => {
    const logRef = collection(db, `boss_events/${eventId}/damage_log`);
    return onSnapshot(logRef, (snapshot) => {
      const entries = snapshot.docs.map((d) => d.data() as { userId: string; userName: string; damage: number; isCrit?: boolean; timestamp: string; attemptNumber?: number });
      callback(entries);
    }, (error: unknown) => reportError(error, { subscription: 'bossEventDamageLog', eventId }));
  },

  answerBossEvent: async (eventId: string, questionId: string, answer: number, timeTakenMs?: number) => {
    const result = await callAnswerBossEvent({ eventId, questionId, answer, timeTakenMs });
    return result.data as {
      correct: boolean; damage: number; newHp: number; alreadyAnswered?: boolean;
      bossDefeated?: boolean; playerDamage?: number; playerHp?: number; playerMaxHp?: number;
      knockedOut?: boolean; isCrit?: boolean; healAmount?: number; shieldBlocked?: boolean;
      attemptNumber?: number; attemptsRemaining?: number;
      phaseTransition?: { phase: number; name: string; dialogue?: string; newAppearance?: unknown } | null;
      activeAbilities?: { abilityId: string; effect: string; value: number; remainingQuestions: number }[];
      nextDifficulty?: 'EASY' | 'MEDIUM' | 'HARD';
      nextBossIntent?: { type: string; warningText: string; icon: string; targetSubject?: string } | null;
    };
  },

  getNextBossQuestion: async (eventId: string) => {
    const result = await callGetNextBossQuestion({ eventId });
    return result.data as {
      complete?: boolean;
      message?: string;
      question?: import('../types').BossQuizQuestion;
      bossIntent?: { type: string; warningText: string; icon: string; targetSubject?: string } | null;
      remainingCount?: number;
      attemptStats?: { accuracy: number; correct: number; attempted: number };
    };
  },

  startSpecializationTrial: async (specializationId: string, force?: boolean) => {
    const result = await callStartSpecializationTrial({ specializationId, force });
    return result.data as { trialEventId: string; message: string };
  },

  completeSpecializationTrial: async (trialEventId: string) => {
    const result = await callCompleteSpecializationTrial({ trialEventId });
    return result.data as {
      success: boolean;
      passed: boolean;
      specializationId?: string;
      message: string;
      stats?: { correct: number; attempted: number; accuracy: number };
    };
  },

  commitSpecialization: async (specializationId: string) => {
    const result = await callCommitSpecialization({ specializationId });
    return result.data as { success: boolean; message: string };
  },

  declineSpecialization: async (specializationId: string) => {
    const result = await callDeclineSpecialization({ specializationId });
    return result.data as { success: boolean; message: string };
  },

  useConsumable: async (eventId: string, consumableId: string) => {
    const result = await callUseConsumable({ eventId, consumableId });
    return result.data as { success: boolean; consumableId: string; effect: Record<string, unknown>; remainingCurrency: number };
  },

  saveBossEvent: async (event: import('../types').BossEvent) => {
    const ref = doc(db, 'boss_events', event.id);
    await setDoc(ref, event);
  },

  toggleBossEventActive: async (eventId: string, isActive: boolean) => {
    const ref = doc(db, 'boss_events', eventId);
    await updateDoc(ref, { isActive });
  },

  deleteBossEvent: async (eventId: string) => {
    const ref = doc(db, 'boss_events', eventId);
    await deleteDoc(ref);
  },

  subscribeToBossEventProgress: (userId: string, eventId: string, callback: (progress: import('../types').BossEventProgress | null) => void) => {
    const ref = doc(db, 'boss_event_progress', `${userId}_${eventId}`);
    return onSnapshot(ref, (snap) => {
      callback(snap.exists() ? (snap.data() as import('../types').BossEventProgress) : null);
    }, () => callback(null));
  },

  getBossEventAllProgress: async (eventId: string) => {
    const q = query(collection(db, 'boss_event_progress'), where('eventId', '==', eventId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as import('../types').BossEventProgress);
  },

  // --- KNOWLEDGE-GATED LOOT ---

  subscribeToKnowledgeGates: (callback: (gates: KnowledgeGate[]) => void) => {
    const q = query(collection(db, 'knowledge_gates'), where('isActive', '==', true));
    return resilientSnapshot('knowledge_gates', q, (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as KnowledgeGate)));
    });
  },

  claimKnowledgeLoot: async (gateId: string, classType?: string) => {
    const result = await callClaimKnowledgeLoot({ gateId, classType });
    return result.data as { item: RPGItem; xpBonus: number; fluxBonus: number };
  },

  // --- SEASONAL COSMETICS ---

  subscribeToSeasonalCosmetics: (callback: (cosmetics: SeasonalCosmetic[]) => void) => {
    const q = query(collection(db, 'seasonal_cosmetics'), where('isAvailable', '==', true));
    return resilientSnapshot('seasonal_cosmetics', q, (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as SeasonalCosmetic)));
    });
  },

  purchaseCosmetic: async (cosmeticId: string) => {
    const result = await callPurchaseCosmetic({ cosmeticId });
    return result.data as { success: boolean };
  },

  equipCosmetic: async (_userId: string, cosmeticId: string | null, slot?: string) => {
    const result = await callEquipFluxCosmetic({ cosmeticId, slot });
    return result.data as { success: boolean; slot: string; cosmeticId: string | null };
  },

  // --- CHARACTER MODELS ---

  /** Select a character model the player already owns (or a free starter) */
  selectCharacterModel: async (userId: string, modelId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        'gamification.selectedCharacterModel': modelId,
      });
    } catch (error) {
      reportError(error, { method: 'selectCharacterModel' });
      throw error;
    }
  },

  /** Purchase a character model through the Flux Shop pipeline */
  purchaseCharacterModel: async (modelId: string) => {
    // CHARACTER_MODEL items are handled by the existing purchaseFluxItem Cloud Function
    const result = await callPurchaseFluxItem({ itemId: modelId });
    return result.data as { success: boolean };
  },

  // --- FLUX SHOP ---

  purchaseFluxItem: async (itemId: string) => {
    const result = await callPurchaseFluxItem({ itemId });
    return result.data as { success: boolean; boost?: ActiveBoost; nameColor?: string };
  },

  // --- DAILY CHALLENGES ---

  subscribeToDailyChallenges: (callback: (challenges: DailyChallenge[]) => void) => {
    const today = new Date().toISOString().split('T')[0];
    const q = query(collection(db, 'daily_challenges'), where('date', '==', today));
    return resilientSnapshot('daily_challenges', q, (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as DailyChallenge)));
    });
  },

  claimDailyChallenge: async (challengeId: string, classType?: string) => {
    const result = await callClaimDailyChallenge({ challengeId, classType });
    return result.data as { xpReward: number; fluxReward: number; leveledUp: boolean };
  },

  updateDailyChallengeProgress: async (userId: string, challengeId: string, progress: number, completed: boolean) => {
    const userRef = doc(db, 'users', userId);
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) return;
      const challenges = userSnap.data().gamification?.activeDailyChallenges || [];
      const existing = challenges.find((c: { challengeId: string }) => c.challengeId === challengeId);
      if (existing) {
        const updated = challenges.map((c: { challengeId: string }) =>
          c.challengeId === challengeId ? { ...c, progress, completed } : c
        );
        transaction.update(userRef, { 'gamification.activeDailyChallenges': updated });
      } else {
        transaction.update(userRef, {
          'gamification.activeDailyChallenges': [...challenges, { challengeId, progress, completed }],
        });
      }
    });
  },

  // --- PROFILE / INSPECT ---

  getPublicProfile: async (userId: string): Promise<User | null> => {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as User;
  },

  // --- EARLY WARNING SYSTEM ---

  subscribeToStudentAlerts: (callback: (alerts: StudentAlert[]) => void) => {
    const q = query(collection(db, 'student_alerts'), where('isDismissed', '==', false));
    return resilientSnapshot('student_alerts', q, (snapshot: any) => {
      const alerts = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as StudentAlert));
      alerts.sort((a: StudentAlert, b: StudentAlert) => {
        const severity: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };
        return (severity[b.riskLevel] || 0) - (severity[a.riskLevel] || 0);
      });
      callback(alerts);
    });
  },

  dismissAlert: async (alertId: string) => {
    await callDismissAlert({ alertId });
  },

  dismissAlertsBatch: async (alertIds: string[]): Promise<void> => {
    await callDismissAlertsBatch({ alertIds });
  },

  // --- TELEMETRY BUCKETS ---

  subscribeToStudentBuckets: (callback: (profiles: StudentBucketProfile[]) => void) => {
    return resilientSnapshot('student_buckets', collection(db, 'student_buckets'), (snapshot: any) => {
      const profiles = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as StudentBucketProfile));
      callback(profiles);
    });
  },

  // --- WELLNESS CHECK-INS ---

  submitWellnessCheckin: async (userId: string, userName: string, level: import('../types').WellnessLevel, classType?: string, section?: string) => {
    const now = new Date().toISOString();
    const docId = `${userId}_${new Date().toISOString().split('T')[0]}`;
    const ref = doc(db, 'wellness_checkins', docId);
    const existing = await getDoc(ref);
    const payload: Record<string, unknown> = {
      userId,
      userName,
      classType: classType || '',
      section: section || '',
      level,
      updatedAt: now,
    };
    if (!existing.exists()) {
      payload.createdAt = now;
    }
    await setDoc(ref, payload, { merge: true });
  },

  clearWellnessCheckin: async (userId: string) => {
    const docId = `${userId}_${new Date().toISOString().split('T')[0]}`;
    await deleteDoc(doc(db, 'wellness_checkins', docId));
  },

  subscribeToWellnessCheckins: (callback: (checkins: import('../types').WellnessCheckin[]) => void) => {
    const today = new Date().toISOString().split('T')[0];
    const q = query(collection(db, 'wellness_checkins'), where('updatedAt', '>=', `${today}T00:00:00.000Z`), orderBy('updatedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as import('../types').WellnessCheckin)));
    }, (error) => { reportError(error, { subscription: 'wellnessCheckins' }); });
  },

  // --- PRACTICE PROGRESS (completion tracking) ---

  subscribeToStudentPracticeProgress: (userId: string, callback: (progress: Record<string, { completed: boolean; totalCompletions: number; bestScore: number | null; completedAt: string | null }>) => void) => {
    const q = query(collection(db, 'practice_progress'), where('userId', '==', userId));
    return onSnapshot(q, (snapshot) => {
      const result: Record<string, { completed: boolean; totalCompletions: number; bestScore: number | null; completedAt: string | null }> = {};
      snapshot.forEach(d => {
        const data = d.data();
        if (data.assignmentId && data.completed) {
          result[data.assignmentId] = {
            completed: data.completed || false,
            totalCompletions: data.totalCompletions || 0,
            bestScore: data.bestScore ?? null,
            completedAt: data.completedAt ?? null,
          };
        }
      });
      callback(result);
    }, (error) => { reportError(error, { subscription: 'practiceProgress' }); });
  },

  // ========================================
  // BUG REPORTS
  // ========================================

  submitBugReport: async (report: Omit<BugReport, 'id'>) => {
    await addDoc(collection(db, 'bug_reports'), { ...report, resolved: false });
  },

  subscribeToBugReports: (callback: (reports: BugReport[]) => void) => {
    const q = query(collection(db, 'bug_reports'), orderBy('timestamp', 'desc'), limit(100));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BugReport)));
    }, (error) => { reportError(error, { subscription: 'bugReports' }); });
  },

  resolveBugReport: async (reportId: string) => {
    await updateDoc(doc(db, 'bug_reports', reportId), { resolved: true });
  },

  updateBugReport: async (reportId: string, data: Partial<BugReport>) => {
    const { id: _id, ...updateData } = data as BugReport;
    await updateDoc(doc(db, 'bug_reports', reportId), updateData);
  },

  deleteBugReport: async (reportId: string) => {
    await deleteDoc(doc(db, 'bug_reports', reportId));
  },

  // ========================================
  // SONG REQUESTS
  // ========================================

  submitSongRequest: async (request: Omit<SongRequest, 'id'>) => {
    await addDoc(collection(db, 'song_requests'), request);
  },

  subscribeToSongRequests: (callback: (requests: SongRequest[]) => void) => {
    const q = query(collection(db, 'song_requests'), orderBy('timestamp', 'desc'), limit(100));
    return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as SongRequest))));
  },

  updateSongRequest: async (requestId: string, data: Partial<SongRequest>) => {
    await updateDoc(doc(db, 'song_requests', requestId), data);
  },

  deleteSongRequest: async (requestId: string) => {
    await deleteDoc(doc(db, 'song_requests', requestId));
  },

  // ========================================
  // ENROLLMENT CODES
  // ========================================

  createEnrollmentCode: async (classType: string, section?: string, maxUses?: number): Promise<string> => {
    const code = [
      Math.random().toString(36).substring(2, 6),
      Math.random().toString(36).substring(2, 6),
    ].join('-').toUpperCase();
    const docRef = doc(collection(db, 'enrollment_codes'));
    await setDoc(docRef, {
      code,
      classType,
      section: section || null,
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
      usedCount: 0,
      maxUses: maxUses || null,
      isActive: true,
    });
    return code;
  },

  subscribeToEnrollmentCodes: (callback: (codes: EnrollmentCode[]) => void) => {
    const q = query(collection(db, 'enrollment_codes'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as EnrollmentCode)));
    }, (error: unknown) => reportError(error, { subscription: 'enrollmentCodes' }));
  },

  deactivateEnrollmentCode: async (codeId: string) => {
    await updateDoc(doc(db, 'enrollment_codes', codeId), { isActive: false });
  },

  redeemEnrollmentCode: async (code: string, _userId: string): Promise<{ success: boolean; classType?: string; error?: string }> => {
    try {
      const result = await callRedeemEnrollmentCode({ code });
      return result.data as { success: boolean; classType?: string; error?: string };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to redeem code.';
      return { success: false, error: msg };
    }
  },

  // ========================================
  // BEHAVIOR QUICK-AWARDS
  // ========================================

  awardBehavior: async (award: Omit<BehaviorAward, 'id'>) => {
    await callAwardBehaviorXP({
      studentId: award.studentId,
      classType: award.classType,
      xpAmount: award.xpAmount,
      fluxAmount: award.fluxAmount,
      reason: award.categoryName,
      timestamp: award.timestamp,
    });
  },

  subscribeToBehaviorAwards: (classType: string, callback: (awards: BehaviorAward[]) => void) => {
    const q = query(collection(db, 'behavior_awards'), where('classType', '==', classType), orderBy('timestamp', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BehaviorAward)));
    }, (error: unknown) => reportError(error, { subscription: 'behaviorAwards', classType }));
  },

  // ========================================
  // STREAK SYSTEM
  // ========================================

  updateDailyStreak: async (userId: string): Promise<{ currentStreak: number; freezeUsed: boolean; newMilestone?: number }> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return { currentStreak: 0, freezeUsed: false };
    const data = snap.data();
    const streak = data.streakData || { currentStreak: 0, longestStreak: 0, lastActiveDate: '', freezeTokens: 0, maxFreezeTokens: 3, streakHistory: [], milestones: [] };

    const today = new Date().toISOString().split('T')[0];
    if (streak.lastActiveDate === today) return { currentStreak: streak.currentStreak, freezeUsed: false };

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let newStreak = streak.currentStreak;
    let freezeUsed = false;

    if (streak.lastActiveDate === yesterday) {
      // Consecutive day
      newStreak += 1;
    } else if (streak.lastActiveDate) {
      // Missed day(s) — check if freeze available
      const daysBetween = Math.floor((new Date(today).getTime() - new Date(streak.lastActiveDate).getTime()) / 86400000);
      if (daysBetween === 2 && streak.freezeTokens > 0) {
        // Missed exactly one day, use freeze
        newStreak += 1;
        freezeUsed = true;
      } else {
        // Streak broken
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }

    const newLongest = Math.max(streak.longestStreak, newStreak);
    const MILESTONES = [3, 7, 14, 21, 30, 50, 100];
    const existingMilestones = streak.milestones || [];
    const newMilestone = MILESTONES.find(m => newStreak >= m && !existingMilestones.includes(m));
    const newMilestones = newMilestone ? [...existingMilestones, newMilestone] : existingMilestones;

    // Earn a freeze token every 7 days of streak
    let newFreezeTokens = freezeUsed ? streak.freezeTokens - 1 : streak.freezeTokens;
    if (newStreak > 0 && newStreak % 7 === 0) {
      newFreezeTokens = Math.min(newFreezeTokens + 1, streak.maxFreezeTokens);
    }

    const history = [...(streak.streakHistory || []), today].slice(-30);

    await updateDoc(userRef, {
      streakData: {
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastActiveDate: today,
        freezeTokens: newFreezeTokens,
        maxFreezeTokens: 3,
        streakHistory: history,
        milestones: newMilestones,
      },
    });

    return { currentStreak: newStreak, freezeUsed, newMilestone };
  },

  getStreakData: async (userId: string): Promise<StreakData | null> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return data.streakData || null;
  },

  // ========================================
  // TEACHER SNIPPETS
  // ========================================

  /**
   * Get all snippets for a teacher.
   * Reads from Firestore collection 'teacherSnippets' using doc ID = teacherUid.
   */
  getTeacherSnippets: async (teacherUid: string): Promise<Array<{ id: string; text: string; label: string; createdAt: string }>> => {
    try {
      const docRef = doc(db, 'teacherSnippets', teacherUid);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return [];
      }
      
      const snippets = docSnap.data().snippets || [];
      return snippets.map((s: any) => ({
        id: s.id,
        text: s.text,
        label: s.label,
        createdAt: s.createdAt || new Date().toISOString(),
      }));
    } catch (error) {
      reportError(error, { method: 'getTeacherSnippets', teacherUid });
      return [];
    }
  },

  /**
   * Save a new snippet for a teacher.
   * Caps at 50 snippets, dropping the oldest if needed.
   */
  saveTeacherSnippet: async (teacherUid: string, snippet: { text: string; label: string }): Promise<void> => {
    try {
      const docRef = doc(db, 'teacherSnippets', teacherUid);
      const docSnap = await getDoc(docRef);
      
      let existingSnippets: any[] = [];
      if (docSnap.exists()) {
        existingSnippets = docSnap.data().snippets || [];
      }
      
      const newSnippet = {
        id: crypto.randomUUID(),
        text: snippet.text,
        label: snippet.label,
        createdAt: new Date().toISOString(),
      };
      
      // Cap at 50 snippets
      if (existingSnippets.length >= 50) {
        existingSnippets.shift(); // Remove oldest
      }
      
      existingSnippets.push(newSnippet);
      
      await setDoc(docRef, { snippets: existingSnippets }, { merge: true });
    } catch (error) {
      reportError(error, { method: 'saveTeacherSnippet', teacherUid });
      throw error;
    }
  },

  /**
   * Delete a specific snippet by ID.
   */
  deleteTeacherSnippet: async (teacherUid: string, snippetId: string): Promise<void> => {
    try {
      const docRef = doc(db, 'teacherSnippets', teacherUid);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error('Teacher snippets document not found');
      }
      
      const existingSnippets: any[] = docSnap.data().snippets || [];
      const filteredSnippets = existingSnippets.filter((s: any) => s.id !== snippetId);
      
      await setDoc(docRef, { snippets: filteredSnippets }, { merge: true });
    } catch (error) {
      reportError(error, { method: 'deleteTeacherSnippet', teacherUid, snippetId });
      throw error;
    }
  },

  // ========================================
  // STUDENT FEEDBACK HISTORY QUERY
  // ========================================

  /**
   * Get a student's feedback history from graded submissions.
   * Returns submissions where rubricGrade.teacherFeedback exists,
   * sorted by gradedAt descending.
   */
  getStudentFeedbackHistory: async (studentUid: string, assignmentId?: string): Promise<Array<{
    assignmentTitle: string;
    teacherFeedback: string;
    score: number;
    gradedAt: string;
    feedbackReadAt?: string;
    feedbackReviewedAt?: string;
  }>> => {
    try {
      const constraints = [where('userId', '==', studentUid)];
      if (assignmentId) constraints.push(where('assignmentId', '==', assignmentId));
      const q = query(collection(db, 'submissions'), ...constraints);
      
      const querySnapshot = await getDocs(q);
      const history: Array<{
        assignmentTitle: string;
        teacherFeedback: string;
        score: number;
        gradedAt: string;
        feedbackReadAt?: string;
        feedbackReviewedAt?: string;
      }> = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        // Only include submissions with teacher feedback
        if (!data.rubricGrade?.teacherFeedback) {
          return;
        }
        
        history.push({
          assignmentTitle: data.assignmentTitle || 'Unknown Assignment',
          teacherFeedback: data.rubricGrade.teacherFeedback,
          score: data.score ?? 0,
          gradedAt: data.rubricGrade.gradedAt || new Date().toISOString(),
          feedbackReadAt: data.feedbackReadAt || undefined,
          feedbackReviewedAt: data.feedbackReviewedAt || undefined,
        });
      });
      
      // Sort by gradedAt descending
      history.sort((a, b) => new Date(b.gradedAt).getTime() - new Date(a.gradedAt).getTime());
      
      return history;
    } catch (error) {
      reportError(error, { method: 'getStudentFeedbackHistory', studentUid });
      return [];
    }
  },

  // --- ONE-TIME MIGRATION UTILITIES ---

  migrateBossesToEvents: async () => {
    const result = await callMigrateBossesToEvents({});
    return result.data as { migratedEncounters: number; migratedQuizzes: number; errors: string[] };
  },

  migrateBossQuizProgress: async () => {
    const result = await callMigrateBossQuizProgress({});
    return result.data as { migrated: number; errors: string[] };
  },

};

/**
 * Top-level export mirror of dataService.getAssessmentStats. Provided so
 * callers can import the helper directly without pulling in the full
 * dataService object. Delegates to the method to keep a single source of truth.
 */
export async function getAssessmentStats(assignmentId: string, assignment?: Assignment, enrolledStudents?: User[]): Promise<AssessmentStats> {
  return dataService.getAssessmentStats(assignmentId, assignment, enrolledStudents);
}
