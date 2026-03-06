
import { User, UserRole, ClassType, ClassConfig, Assignment, Submission, AssignmentStatus, Comment, WhitelistedUser, Conversation, ChatMessage, EvidenceLog, LabReport, UserSettings, ChatFlag, XPEvent, Quest, RPGItem, EquipmentSlot, Announcement, Notification, TelemetryMetrics, BossEncounter, BossQuizEvent, TutoringSession, QuestParty, SeasonalCosmetic, KnowledgeGate, DailyChallenge, StudentAlert, StudentBucketProfile, StudentGroup, BugReport, EnrollmentCode, BehaviorAward, CustomItem, Dungeon, DungeonRun, IdleMission, ArenaMatch, RubricGrade, ActiveBoost, StreakData } from '../types';
import { db, storage, callAwardXP, callAcceptQuest, callDeployMission, callResolveQuest, callEquipItem, callUnequipItem, callDisenchantItem, callCraftItem, callAdminUpdateInventory, callAdminUpdateEquipped, callSubmitEngagement, callSendClassMessage, callUpdateStreak, callClaimDailyLogin, callSpinFortuneWheel, callUnlockSkill, callAddSocket, callSocketGem, callUnsocketGem, callDealBossDamage, callAnswerBossQuiz, callCreateParty, callJoinParty, callCompleteTutoring, callClaimKnowledgeLoot, callPurchaseCosmetic, callClaimDailyChallenge, callDismissAlert, callAdminGrantItem, callAdminEditItem, callSubmitAssessment, callScaleBossHp, callStartDungeonRun, callAnswerDungeonRoom, callClaimDungeonRewards, callDeployIdleMission, callClaimIdleMission, callQueueArenaDuel, callCancelArenaQueue, callPurchaseFluxItem, callEquipFluxCosmetic } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc, query, where, getDoc, onSnapshot, orderBy, limit, arrayUnion, runTransaction, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { createInitialMetrics } from '../lib/telemetry';
import { TEACHER_DISPLAY_NAME } from '../constants';
import { reportError } from '../lib/errorReporting';

// Track collections that have failed with permission errors to prevent
// re-subscribing after ErrorBoundary remounts (which would crash Firestore SDK).
// Uses a Map<name, deniedAtMs> with a 5-minute TTL so transient permission errors
// don't permanently block a collection for the rest of the session.
const DENIED_TTL_MS = 5 * 60 * 1000;

/** Strip undefined values from an object before passing to Firestore setDoc(). */
const stripUndefined = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));
const _deniedCollections = new Map<string, number>();

/** Clear all denial caches — call when auth state changes. */
export function clearDeniedCollections() {
  _deniedCollections.clear();
}

const guardedSnapshot = (
  name: string,
  q: any,
  callback: (snapshot: any) => void
) => {
  const deniedAt = _deniedCollections.get(name);
  if (deniedAt !== undefined && Date.now() - deniedAt < DENIED_TTL_MS) {
    return () => {};
  }
  // If TTL has expired, remove stale entry so we retry
  if (deniedAt !== undefined) _deniedCollections.delete(name);

  return onSnapshot(q, callback, (error: any) => {
    reportError(error, { subscription: name });
    if (error?.code === 'permission-denied' || error?.code === 'failed-precondition') {
      _deniedCollections.set(name, Date.now());
    }
  });
};

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
    return guardedSnapshot('xp_events', q, (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as XPEvent)));
    });
  },

  saveXPEvent: async (event: XPEvent) => {
    await setDoc(doc(db, 'xp_events', event.id), stripUndefined(event));
  },

  deleteXPEvent: async (id: string) => {
    await deleteDoc(doc(db, 'xp_events', id));
  },

  subscribeToQuests: (callback: (quests: Quest[]) => void, activeOnly = false) => {
    const q = activeOnly
      ? query(collection(db, 'quests'), where('isActive', '==', true))
      : collection(db, 'quests');
    return guardedSnapshot('quests', q, (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as Quest)));
    });
  },

  saveQuest: async (quest: Quest) => {
    await setDoc(doc(db, 'quests', quest.id), stripUndefined(quest));
  },

  deleteQuest: async (id: string) => {
    await deleteDoc(doc(db, 'quests', id));
  },

  // Student Quest Interactions — All via Cloud Functions for security
  acceptQuest: async (_userId: string, questId: string) => {
      await callAcceptQuest({ questId });
  },

  deployMission: async (_userId: string, quest: Quest) => {
      await callDeployMission({ questId: quest.id });
  },

  resolveQuest: async (userId: string, quest: Quest, success: boolean, classType?: string) => {
      await callResolveQuest({ userId, questId: quest.id, success, classType });
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
    return guardedSnapshot('customItems', collection(db, 'customItems'), (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as CustomItem)));
    });
  },

  saveCustomItem: async (item: CustomItem) => {
    await setDoc(doc(db, 'customItems', item.id), stripUndefined(item));
  },

  deleteCustomItem: async (id: string) => {
    await deleteDoc(doc(db, 'customItems', id));
  },

  // ========================================
  // QUEST TEMPLATES
  // ========================================

  subscribeToQuestTemplates: (callback: (templates: import('../types').Quest[]) => void) => {
    return guardedSnapshot('quest_templates', collection(db, 'quest_templates'), (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    });
  },

  saveQuestTemplate: async (template: Record<string, unknown>) => {
    const id = (template.id as string) || Math.random().toString(36).substring(2, 9);
    await setDoc(doc(db, 'quest_templates', id), stripUndefined({ ...template, id }));
  },

  deleteQuestTemplate: async (id: string) => {
    await deleteDoc(doc(db, 'quest_templates', id));
  },

  // Write only the appearance sub-field — all other gamification fields are Cloud-Function-only
  updateUserAppearance: async (userId: string, appearance: { hue?: number; bodyType?: 'A' | 'B' | 'C'; skinTone?: number; hairStyle?: number; hairColor?: number }, classType?: string) => {
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

  // --- MESSAGING ---

  sendMessage: async (user: User, content: string, channelId: string, classType: string) => {
    try {
        // Client-side mute check for instant UX feedback (server enforces authoritatively)
        if (user.mutedUntil) {
            const muteDate = new Date(user.mutedUntil);
            if (muteDate > new Date()) {
                throw new Error(`You are muted until ${muteDate.toLocaleTimeString()}.`);
            }
        }

        await callSendClassMessage({ content, channelId, classType });
    } catch (error) {
        reportError(error, { method: 'sendMessage' });
        throw error;
    }
  },

  toggleReaction: async (messageId: string, emoji: string, userId: string) => {
    const msgRef = doc(db, 'class_messages', messageId);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(msgRef);
      if (!snap.exists()) return;

      const data = snap.data() as ChatMessage;
      const reactions = { ...(data.reactions || {}) };

      // Strip their ID from all other emoji sets first
      const hadThisEmoji = (reactions[emoji] || []).includes(userId);

      Object.keys(reactions).forEach(e => {
          reactions[e] = (reactions[e] || []).filter((id: string) => id !== userId);
          if (reactions[e].length === 0) delete reactions[e];
      });

      if (!hadThisEmoji) {
        if (!reactions[emoji]) reactions[emoji] = [];
        reactions[emoji].push(userId);
      }

      transaction.update(msgRef, { reactions });
    });
  },

  togglePersonalPin: async (messageId: string, userId: string) => {
    const msgRef = doc(db, 'class_messages', messageId);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(msgRef);
      if (!snap.exists()) return;

      const data = snap.data() as ChatMessage;
      const pinnedBy = [...(data.pinnedBy || [])];

      if (pinnedBy.includes(userId)) {
        transaction.update(msgRef, { pinnedBy: pinnedBy.filter((id: string) => id !== userId) });
      } else {
        transaction.update(msgRef, { pinnedBy: [...pinnedBy, userId] });
      }
    });
  },

  toggleGlobalPin: async (messageId: string, isPinned: boolean) => {
    const msgRef = doc(db, 'class_messages', messageId);
    await updateDoc(msgRef, { isGlobalPinned: isPinned });
  },

  deleteMessage: async (messageId: string) => {
      try {
          await deleteDoc(doc(db, 'class_messages', messageId));
      } catch (error) {
          reportError(error, { method: 'deleteMessage' });
          throw error;
      }
  },

  subscribeToFlaggedMessages: (callback: (msgs: ChatMessage[]) => void) => {
    const q = query(
        collection(db, 'class_messages'),
        where('isFlagged', '==', true),
        limit(50)
    );
    return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
        messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        callback(messages);
    }, (error) => {
        reportError(error, { subscription: 'flaggedMessages' });
    });
  },

  unflagMessage: async (messageId: string) => {
    try {
        const msgRef = doc(db, 'class_messages', messageId);
        await updateDoc(msgRef, { isFlagged: false, systemNote: '' });
    } catch (error) {
        reportError(error, { method: 'unflagMessage' });
        throw error;
    }
  },

  INDEFINITE_MUTE: -2 as const,

  muteUser: async (userId: string, durationMinutes: number) => {
      try {
          let dateStr = null;
          if (durationMinutes === dataService.INDEFINITE_MUTE) {
              dateStr = new Date('9999-12-31').toISOString();
          } else if (durationMinutes > 0) {
              dateStr = new Date(Date.now() + durationMinutes * 60000).toISOString();
          }
          await updateDoc(doc(db, 'users', userId), { mutedUntil: dateStr });
      } catch (error) {
          reportError(error, { method: 'muteUser' });
          throw error;
      }
  },

  // --- STUDENT GROUPS ---

  createStudentGroup: async (name: string, classType: string, members: { userId: string; userName: string }[], section?: string) => {
    const data: Record<string, unknown> = {
      name,
      classType,
      members,
      memberIds: members.map(m => m.userId), // flat array for Firestore rules + array-contains queries
      createdAt: new Date().toISOString(),
      createdBy: 'ADMIN',
    };
    if (section) data.section = section;
    const ref = await addDoc(collection(db, 'student_groups'), data);
    return ref.id;
  },

  updateStudentGroup: async (groupId: string, data: Partial<Pick<StudentGroup, 'name' | 'members' | 'section'>>) => {
    const update: Record<string, unknown> = { ...data };
    if (data.members) update.memberIds = data.members.map(m => m.userId);
    await updateDoc(doc(db, 'student_groups', groupId), update);
  },

  deleteStudentGroup: async (groupId: string) => {
    await deleteDoc(doc(db, 'student_groups', groupId));
  },

  subscribeToStudentGroups: (classType: string, callback: (groups: StudentGroup[]) => void) => {
    const q = query(collection(db, 'student_groups'), where('classType', '==', classType));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StudentGroup)));
    }, (error: unknown) => reportError(error, { subscription: 'studentGroups' }));
  },

  subscribeToAllGroups: (callback: (groups: StudentGroup[]) => void) => {
    return onSnapshot(collection(db, 'student_groups'), (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StudentGroup)));
    }, (error: unknown) => reportError(error, { subscription: 'allGroups' }));
  },

  subscribeToMyGroups: (userId: string, callback: (groups: StudentGroup[]) => void) => {
    // Use memberIds flat array for an efficient server-side array-contains query
    const q = query(collection(db, 'student_groups'), where('memberIds', 'array-contains', userId));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StudentGroup)));
    }, (error: unknown) => reportError(error, { subscription: 'myGroups' }));
  },

  subscribeToChannelMessages: (channelId: string, callback: (msgs: ChatMessage[]) => void, maxResults = 100) => {
    const q = query(
        collection(db, 'class_messages'),
        where('channelId', '==', channelId),
        limit(maxResults)
    );
    
    return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
        messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        callback(messages);
    }, (error) => {
        reportError(error, { subscription: 'channelMessages' });
    });
  },

  // Lightweight subscription for unread badge: recent messages across all channels
  subscribeToRecentMessages: (callback: (msgs: ChatMessage[]) => void) => {
    const q = query(
      collection(db, 'class_messages'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    return guardedSnapshot('recent_messages', q, (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as ChatMessage)));
    });
  },

  subscribeToAllConversations: (callback: (convos: Conversation[]) => void) => {
    const q = query(collection(db, 'conversations'), orderBy('lastMessageAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Conversation)));
    }, (error: unknown) => reportError(error, { subscription: 'conversations' }));
  },

  subscribeToChatMessages: (convoId: string, callback: (msgs: ChatMessage[]) => void) => {
    const q = query(
      collection(db, `conversations/${convoId}/messages`),
      orderBy('timestamp', 'asc')
    );
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
    }, (error: unknown) => reportError(error, { subscription: 'chatMessages' }));
  },

  sendChatMessage: async (convoId: string, user: User, content: string) => {
    const msgData: Partial<ChatMessage> = {
      senderId: user.id,
      senderName: user.role === UserRole.ADMIN ? TEACHER_DISPLAY_NAME : user.name,
      content,
      timestamp: new Date().toISOString()
    };
    await addDoc(collection(db, `conversations/${convoId}/messages`), msgData);
    await updateDoc(doc(db, 'conversations', convoId), {
      lastMessage: content,
      lastMessageAt: new Date().toISOString()
    });
  },

  toggleConversationDisable: async (convoId: string, disabled: boolean) => {
    await updateDoc(doc(db, 'conversations', convoId), { adminDisabled: disabled });
  },

  subscribeToChatFlags: (callback: (flags: ChatFlag[]) => void) => {
    const q = query(collection(db, 'chat_flags'), where('isResolved', '==', false));
    
    return onSnapshot(q, (snapshot) => {
        const flags = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatFlag));
        flags.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        callback(flags);
    }, (error) => {
        reportError(error, { subscription: 'chatFlags' });
    });
  },

  resolveFlag: async (flagId: string) => {
    await updateDoc(doc(db, 'chat_flags', flagId), { isResolved: true });
  },

  resolveFlagByMessageId: async (messageId: string) => {
    try {
        const q = query(collection(db, 'chat_flags'), where('messageId', '==', messageId), where('isResolved', '==', false));
        const snapshot = await getDocs(q);
        const updates = snapshot.docs.map(d => updateDoc(d.ref, { isResolved: true }));
        await Promise.all(updates);
    } catch (error) {
        reportError(error, { method: 'resolveFlagByMessageId' });
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
              return deleteObject(fileRef).catch(err => console.warn("File missing:", err));
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

  subscribeToUsers: (callback: (users: User[]) => void, maxResults?: number) => {
    const q = maxResults
      ? query(collection(db, 'users'), limit(maxResults))
      : collection(db, 'users');
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
          assessmentConfig: data.assessmentConfig || undefined,
          rubric: data.rubric || undefined,
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
          userSection: data.userSection || undefined,
          flaggedAsAI: data.flaggedAsAI || false,
          flaggedAsAIBy: data.flaggedAsAIBy || '',
          flaggedAsAIAt: data.flaggedAsAIAt || '',
        } as Submission;
      });
      callback(submissions);
    }, (error: unknown) => reportError(error, { subscription: 'submissions' }));
  },

  /** Assignment-scoped submissions — fetches ALL submissions for a specific assignment (no global limit). */
  subscribeToAssignmentSubmissions: (assignmentId: string, callback: (submissions: Submission[]) => void) => {
    const q = query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId), orderBy('submittedAt', 'desc'));
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
          userSection: data.userSection || undefined,
          flaggedAsAI: data.flaggedAsAI || false,
          flaggedAsAIBy: data.flaggedAsAIBy || '',
          flaggedAsAIAt: data.flaggedAsAIAt || '',
        } as Submission;
      });
      callback(submissions);
    }, (error: unknown) => reportError(error, { subscription: 'assignmentSubmissions', assignmentId }));
  },

  /** Student-scoped submissions — avoids Firestore permission error on unfiltered query */
  subscribeToUserSubmissions: (userId: string, callback: (submissions: Submission[]) => void) => {
    // Only filter by userId — no orderBy to avoid composite index requirement
    const q = query(collection(db, 'submissions'), where('userId', '==', userId), limit(50));
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
          userSection: data.userSection || undefined,
          flaggedAsAI: data.flaggedAsAI || false,
          flaggedAsAIBy: data.flaggedAsAIBy || '',
          flaggedAsAIAt: data.flaggedAsAIAt || '',
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
        category: assignment.category || 'Textbook',
        htmlContent: assignment.htmlContent || '',
        contentUrl: assignment.contentUrl || null,
        resources: assignment.resources || [],
        publicComments: assignment.publicComments || [],
        dueDate: assignment.dueDate || null,
        targetSections: assignment.targetSections && assignment.targetSections.length > 0 ? assignment.targetSections : [],
        scheduledAt: assignment.scheduledAt || null,
        lessonBlocks: assignment.lessonBlocks && assignment.lessonBlocks.length > 0 ? assignment.lessonBlocks : [],
        isAssessment: assignment.isAssessment || false,
        assessmentConfig: assignment.assessmentConfig || null,
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

  addToWhitelist: async (email: string, classType: ClassType) => {
    try {
      // Merge into classTypes array instead of overwriting
      const whitelistRef = doc(db, 'allowed_emails', email);
      const existing = await getDoc(whitelistRef);
      const currentTypes: string[] = existing.exists() ? (existing.data().classTypes || [existing.data().classType].filter(Boolean)) : [];
      const mergedTypes = Array.from(new Set([...currentTypes, classType]));
      await setDoc(whitelistRef, { classType, classTypes: mergedTypes });

      const q = query(collection(db, 'users'), where('email', '==', email));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(async (d) => {
        const userData = d.data();
        const currentClasses = userData.enrolledClasses || (userData.classType ? [userData.classType] : []);
        const newClasses = Array.from(new Set([...currentClasses, classType]));
        
        await updateDoc(doc(db, 'users', d.id), {
          isWhitelisted: true,
          classType: classType, 
          enrolledClasses: newClasses
        });
      }));
    } catch (error) {
      reportError(error, { method: 'addToWhitelist' });
    }
  },

  updateWhitelistSection: async (email: string, section: string, classType?: string) => {
    try {
      await updateDoc(doc(db, 'allowed_emails', email), { section });
      // Also update user doc if they already exist
      const q = query(collection(db, 'users'), where('email', '==', email));
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
      await deleteDoc(doc(db, 'allowed_emails', email));
      const q = query(collection(db, 'users'), where('email', '==', email));
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
              const wlSnap = await getDoc(doc(db, 'allowed_emails', email));
              const existingTypes: string[] = wlSnap.exists() ? (wlSnap.data().classTypes || [wlSnap.data().classType].filter(Boolean)) : [];
              const mergedTypes = Array.from(new Set([...existingTypes, classType]));
              await setDoc(doc(db, 'allowed_emails', email), { classType, classTypes: mergedTypes });
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
        await deleteDoc(doc(db, 'allowed_emails', email));
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
          
          if (classes.length === 0) {
              updates.isWhitelisted = false;
              if (email) {
                  await deleteDoc(doc(db, 'allowed_emails', email));
              }
          } else {
              updates.isWhitelisted = true;
              if (email) {
                  await setDoc(doc(db, 'allowed_emails', email), { classType: classes[0], classTypes: classes });
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
             await setDoc(doc(db, 'allowed_emails', email), { classType });
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
      await callAwardXP({ targetUserId: userId, amount, classType });
  },

  submitEngagement: async (_userId: string, userName: string, assignmentId: string, assignmentTitle: string, metrics: TelemetryMetrics, classType: string) => {
      const result = await callSubmitEngagement({ assignmentId, assignmentTitle, userName, metrics, classType });
      return result.data as { xpEarned: number; leveledUp: boolean; status: string };
  },

  submitAssessment: async (userName: string, assignmentId: string, responses: Record<string, unknown>, metrics: TelemetryMetrics, classType: string) => {
      const result = await callSubmitAssessment({ assignmentId, userName, responses, metrics, classType });
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

  subscribeToLeaderboard: (callback: (users: User[]) => void, maxResults?: number) => {
      const q = maxResults
        ? query(collection(db, 'users'), where('role', '==', 'STUDENT'), limit(maxResults))
        : query(collection(db, 'users'), where('role', '==', 'STUDENT'));
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
    return guardedSnapshot('announcements', q, (snapshot: any) => {
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
    await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
  },

  markAllNotificationsRead: async (userId: string) => {
    const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('isRead', '==', false)
    );
    const snapshot = await getDocs(q);
    const updates = snapshot.docs.map(d => updateDoc(d.ref, { isRead: true }));
    await Promise.all(updates);
  },

  createNotification: async (notification: Omit<Notification, 'id'>) => {
    await addDoc(collection(db, 'notifications'), notification);
  },

  // Bulk-create notifications for a list of users
  notifyUsers: async (userIds: string[], type: Notification['type'], title: string, message: string, meta?: Record<string, any>) => {
    const batch = userIds.map(userId => addDoc(collection(db, 'notifications'), {
        userId, type, title, message,
        timestamp: new Date().toISOString(),
        isRead: false,
        meta: meta || {}
    }));
    await Promise.all(batch);
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
    return guardedSnapshot('boss_encounters', q, (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as BossEncounter)));
    });
  },

  // Admin: subscribe to ALL boss encounters (including inactive), capped at 50
  subscribeToAllBossEncounters: (callback: (bosses: BossEncounter[]) => void) => {
    const q = query(collection(db, 'boss_encounters'), limit(50));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as BossEncounter)));
    });
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
    }, () => { /* permission error — ignore */ });
  },

  // Subscribe to a boss's damage log subcollection for the leaderboard
  subscribeToBossDamageLog: (bossId: string, callback: (log: { userId: string; userName: string; damage: number; timestamp: string }[]) => void) => {
    const logRef = collection(db, `boss_encounters/${bossId}/damage_log`);
    return onSnapshot(logRef, (snapshot) => {
      const entries = snapshot.docs.map((d) => d.data() as { userId: string; userName: string; damage: number; timestamp: string });
      callback(entries);
    }, () => { /* permission error — ignore */ });
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
    return guardedSnapshot('boss_quizzes', q, (snapshot: any) => {
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
    }, () => { /* permission error — ignore */ });
  },

  subscribeToBossQuizDamageLog: (quizId: string, callback: (log: { userId: string; userName: string; damage: number; isCrit?: boolean; timestamp: string }[]) => void) => {
    const logRef = collection(db, `boss_quizzes/${quizId}/damage_log`);
    return onSnapshot(logRef, (snapshot) => {
      const entries = snapshot.docs.map((d) => d.data() as { userId: string; userName: string; damage: number; isCrit?: boolean; timestamp: string });
      callback(entries);
    }, () => { /* permission error — ignore */ });
  },

  answerBossQuiz: async (quizId: string, questionId: string, answer: number) => {
    const result = await callAnswerBossQuiz({ quizId, questionId, answer });
    return result.data as { correct: boolean; damage: number; newHp: number; alreadyAnswered?: boolean; bossDefeated?: boolean; playerDamage?: number; playerHp?: number; playerMaxHp?: number; knockedOut?: boolean; isCrit?: boolean; healAmount?: number; shieldBlocked?: boolean };
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
    });
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
    });
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

  // --- GROUP QUESTS / PARTIES ---

  createParty: async (questId: string, userName: string) => {
    const result = await callCreateParty({ questId, userName });
    return result.data as { partyId: string };
  },

  joinParty: async (partyId: string, userName: string) => {
    const result = await callJoinParty({ partyId, userName });
    return result.data as { success: boolean; memberCount: number };
  },

  subscribeToParty: (partyId: string, callback: (party: QuestParty | null) => void) => {
    return onSnapshot(doc(db, 'parties', partyId), (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() } as QuestParty);
      } else {
        callback(null);
      }
    }, (error: unknown) => reportError(error, { subscription: 'party' }));
  },

  // --- PEER TUTORING ---

  createTutoringRequest: async (requesterId: string, requesterName: string, topic: string, classType: string) => {
    await addDoc(collection(db, 'tutoring_sessions'), {
      requesterId, requesterName, topic, classType,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      xpReward: 75,
      fluxReward: 25,
    });
  },

  claimTutorRole: async (sessionId: string, tutorId: string, tutorName: string) => {
    await updateDoc(doc(db, 'tutoring_sessions', sessionId), {
      tutorId, tutorName, status: 'MATCHED',
    });
  },

  // Student marks session as in-progress (work has begun)
  startTutoringSession: async (sessionId: string) => {
    await updateDoc(doc(db, 'tutoring_sessions', sessionId), { status: 'IN_PROGRESS' });
  },

  // Student marks session complete (awaiting admin verification)
  markTutoringComplete: async (sessionId: string) => {
    await updateDoc(doc(db, 'tutoring_sessions', sessionId), { status: 'COMPLETED' });
  },

  // Submit feedback for a tutoring session. When both participants have submitted, auto-transitions to COMPLETED.
  submitTutoringFeedback: async (sessionId: string, role: 'requester' | 'tutor', feedback: import('../types').TutoringFeedback) => {
    const ref = doc(db, 'tutoring_sessions', sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Session not found');
    const session = snap.data();
    const feedbackField = role === 'requester' ? 'requesterFeedback' : 'tutorFeedback';
    const otherField = role === 'requester' ? 'tutorFeedback' : 'requesterFeedback';
    const updates: Record<string, unknown> = { [feedbackField]: feedback };
    // Auto-transition to COMPLETED when both have submitted
    if (session[otherField]) {
      updates.status = 'COMPLETED';
    }
    await updateDoc(ref, updates);
  },

  // Admin: subscribe to ALL tutoring sessions across classes
  subscribeToAllTutoringSessions: (callback: (sessions: import('../types').TutoringSession[]) => void) => {
    const q = query(collection(db, 'tutoring_sessions'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as import('../types').TutoringSession)));
    });
  },

  // Admin: cancel a tutoring session
  cancelTutoringSession: async (sessionId: string) => {
    await deleteDoc(doc(db, 'tutoring_sessions', sessionId));
  },

  subscribeToTutoringSessions: (classType: string, callback: (sessions: TutoringSession[]) => void) => {
    const q = query(collection(db, 'tutoring_sessions'), where('classType', '==', classType), limit(50));
    return guardedSnapshot('tutoring_sessions', q, (snapshot: any) => {
      const sessions = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as TutoringSession));
      sessions.sort((a: TutoringSession, b: TutoringSession) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(sessions);
    });
  },

  completeTutoring: async (sessionId: string, tutorId: string) => {
    const result = await callCompleteTutoring({ sessionId, tutorId });
    return result.data as { xpAwarded: number; fluxAwarded: number };
  },

  // --- KNOWLEDGE-GATED LOOT ---

  subscribeToKnowledgeGates: (callback: (gates: KnowledgeGate[]) => void) => {
    const q = query(collection(db, 'knowledge_gates'), where('isActive', '==', true));
    return guardedSnapshot('knowledge_gates', q, (snapshot: any) => {
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
    return guardedSnapshot('seasonal_cosmetics', q, (snapshot: any) => {
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

  // --- FLUX SHOP ---

  purchaseFluxItem: async (itemId: string) => {
    const result = await callPurchaseFluxItem({ itemId });
    return result.data as { success: boolean; boost?: ActiveBoost; nameColor?: string };
  },

  // --- DAILY CHALLENGES ---

  subscribeToDailyChallenges: (callback: (challenges: DailyChallenge[]) => void) => {
    const today = new Date().toISOString().split('T')[0];
    const q = query(collection(db, 'daily_challenges'), where('date', '==', today));
    return guardedSnapshot('daily_challenges', q, (snapshot: any) => {
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
    return guardedSnapshot('student_alerts', q, (snapshot: any) => {
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

  // --- TELEMETRY BUCKETS ---

  subscribeToStudentBuckets: (callback: (profiles: StudentBucketProfile[]) => void) => {
    return guardedSnapshot('student_buckets', collection(db, 'student_buckets'), (snapshot: any) => {
      const profiles = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as StudentBucketProfile));
      callback(profiles);
    });
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
    }, () => { /* permission error */ });
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
    }, () => {});
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
    }, () => {});
  },

  deactivateEnrollmentCode: async (codeId: string) => {
    await updateDoc(doc(db, 'enrollment_codes', codeId), { isActive: false });
  },

  redeemEnrollmentCode: async (code: string, userId: string): Promise<{ success: boolean; classType?: string; error?: string }> => {
    const q = query(collection(db, 'enrollment_codes'), where('code', '==', code.toUpperCase()), where('isActive', '==', true));
    const snap = await getDocs(q);
    if (snap.empty) return { success: false, error: 'Invalid or expired code.' };
    const codeDoc = snap.docs[0];
    const data = codeDoc.data() as EnrollmentCode;
    if (data.maxUses && data.usedCount >= data.maxUses) return { success: false, error: 'This code has reached its usage limit.' };

    // Add student to class
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return { success: false, error: 'User not found.' };
    const user = userSnap.data();
    const enrolled = user.enrolledClasses || [];
    if (enrolled.includes(data.classType)) return { success: false, error: 'Already enrolled in this class.' };

    await updateDoc(userRef, {
      enrolledClasses: arrayUnion(data.classType),
      isWhitelisted: true,
    });
    if (data.section) {
      await updateDoc(userRef, { [`classSections.${data.classType}`]: data.section });
    }
    await updateDoc(codeDoc.ref, { usedCount: increment(1) });
    return { success: true, classType: data.classType };
  },

  // ========================================
  // BEHAVIOR QUICK-AWARDS
  // ========================================

  awardBehavior: async (award: Omit<BehaviorAward, 'id'>) => {
    await addDoc(collection(db, 'behavior_awards'), award);
    // Also award the XP via existing system
    const userRef = doc(db, 'users', award.studentId);
    await updateDoc(userRef, {
      'gamification.xp': increment(award.xpAmount),
      [`gamification.classXp.${award.classType}`]: increment(award.xpAmount),
      'gamification.currency': increment(award.fluxAmount),
    });
  },

  subscribeToBehaviorAwards: (classType: string, callback: (awards: BehaviorAward[]) => void) => {
    const q = query(collection(db, 'behavior_awards'), where('classType', '==', classType), orderBy('timestamp', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BehaviorAward)));
    }, () => {});
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

  // --- DUNGEON EXPEDITIONS ---

  subscribeToDungeons: (classType: string, callback: (dungeons: Dungeon[]) => void) => {
    const q = query(
      collection(db, 'dungeons'),
      where('classType', '==', classType),
      where('isActive', '==', true)
    );
    return guardedSnapshot('dungeons', q, (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as Dungeon)));
    });
  },

  subscribeToAllDungeons: (callback: (dungeons: Dungeon[]) => void) => {
    return guardedSnapshot('dungeons', collection(db, 'dungeons'), (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as Dungeon)));
    });
  },

  saveDungeon: async (dungeon: Dungeon) => {
    await setDoc(doc(db, 'dungeons', dungeon.id), stripUndefined(dungeon));
  },

  deleteDungeon: async (id: string) => {
    await deleteDoc(doc(db, 'dungeons', id));
  },

  subscribeToActiveDungeonRun: (userId: string, dungeonId: string, callback: (run: DungeonRun | null) => void) => {
    const q = query(
      collection(db, 'dungeon_runs'),
      where('userId', '==', userId),
      where('dungeonId', '==', dungeonId),
      where('status', '==', 'IN_PROGRESS')
    );
    return guardedSnapshot('dungeon_runs', q, (snapshot: any) => {
      const doc = snapshot.docs[0];
      callback(doc ? ({ id: doc.id, ...doc.data() } as DungeonRun) : null);
    });
  },

  startDungeonRun: async (dungeonId: string) => {
    const result = await callStartDungeonRun({ dungeonId });
    return result.data as DungeonRun & { resumed: boolean };
  },

  answerDungeonRoom: async (runId: string, questionId: string, answer: number) => {
    const result = await callAnswerDungeonRoom({ runId, questionId, answer });
    return result.data as {
      correct: boolean;
      damage: number;
      playerDamage?: number;
      playerHp: number;
      enemyHp: number;
      roomCleared: boolean;
      runCompleted: boolean;
      isCrit?: boolean;
      healAmount?: number;
      loot?: { itemName: string; rarity: string };
    };
  },

  claimDungeonRewards: async (runId: string) => {
    const result = await callClaimDungeonRewards({ runId });
    return result.data as { xp: number; flux: number; loot: { itemName: string; rarity: string }[] };
  },

  // ========================================
  // IDLE AGENT MISSIONS
  // ========================================

  subscribeToIdleMissions: (classType: string, callback: (missions: IdleMission[]) => void) => {
    const q = query(
      collection(db, 'idle_missions'),
      where('isActive', '==', true),
      where('classType', '==', classType)
    );
    return guardedSnapshot('idle_missions', q, (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as IdleMission)));
    });
  },

  subscribeToAllIdleMissions: (callback: (missions: IdleMission[]) => void) => {
    return guardedSnapshot('idle_missions_all', collection(db, 'idle_missions'), (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as IdleMission)));
    });
  },

  deployIdleMission: async (missionId: string) => {
    const result = await callDeployIdleMission({ missionId });
    return result.data as { deployed: boolean; completesAt: string; stats: Record<string, number>; gearScore: number };
  },

  claimIdleMission: async (missionId: string) => {
    const result = await callClaimIdleMission({ missionId });
    return result.data as { xpAwarded: number; fluxAwarded: number; bonusesApplied: string[]; leveledUp: boolean; newLevel: number; loot: boolean };
  },

  saveIdleMission: async (mission: IdleMission) => {
    await setDoc(doc(db, 'idle_missions', mission.id), stripUndefined(mission));
  },

  deleteIdleMission: async (id: string) => {
    await deleteDoc(doc(db, 'idle_missions', id));
  },

  // ========================================
  // PVP ARENA
  // ========================================

  queueArenaDuel: async (classType: string) => {
    const result = await callQueueArenaDuel({ classType });
    return result.data as {
      status: 'MATCHED' | 'QUEUED';
      matchId: string;
      winnerId?: string | null;
      rounds?: any[];
      opponent?: any;
    };
  },

  cancelArenaQueue: async (matchId: string) => {
    const result = await callCancelArenaQueue({ matchId });
    return result.data as { cancelled: boolean };
  },

  /**
   * Subscribe to a single arena_match document to watch for status changes (QUEUED -> COMPLETED).
   * Used while waiting in queue.
   */
  subscribeToArenaQueue: (matchId: string, callback: (match: ArenaMatch | null) => void) => {
    const matchRef = doc(db, 'arena_matches', matchId);
    return onSnapshot(matchRef, (snap) => {
      callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as ArenaMatch) : null);
    });
  },

  /**
   * Subscribe to completed arena matches for a user.
   * Firestore can't query nested fields, so we fetch the last 20 COMPLETED matches
   * and filter client-side for the given userId.
   */
  subscribeToArenaMatches: (userId: string, classType: string, callback: (matches: ArenaMatch[]) => void) => {
    const q = query(
      collection(db, 'arena_matches'),
      where('status', '==', 'COMPLETED'),
      where('classType', '==', classType),
      orderBy('completedAt', 'desc'),
      limit(20)
    );
    return guardedSnapshot('arena_matches', q, (snapshot: any) => {
      const all = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as ArenaMatch));
      // Filter to matches involving this user
      const mine = all.filter((m: ArenaMatch) =>
        m.player1?.userId === userId || m.player2?.userId === userId
      );
      callback(mine.slice(0, 10));
    });
  },
};
