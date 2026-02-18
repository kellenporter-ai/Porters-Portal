
import { User, UserRole, ClassType, ClassConfig, Assignment, Submission, AssignmentStatus, Comment, WhitelistedUser, Conversation, ChatMessage, EvidenceLog, LabReport, UserSettings, ChatFlag, XPEvent, Quest, RPGItem, EquipmentSlot, Announcement, Notification, TelemetryMetrics, BossEncounter, BossQuizEvent, TutoringSession, QuestParty, SeasonalCosmetic, KnowledgeGate, DailyChallenge } from '../types';
import { db, storage, callAwardXP, callAcceptQuest, callDeployMission, callResolveQuest, callEquipItem, callDisenchantItem, callCraftItem, callAdminUpdateInventory, callAdminUpdateEquipped, callSubmitEngagement, callSendClassMessage, callUpdateStreak, callClaimDailyLogin, callSpinFortuneWheel, callUnlockSkill, callAddSocket, callSocketGem, callDealBossDamage, callAnswerBossQuiz, callCreateParty, callJoinParty, callCompleteTutoring, callClaimKnowledgeLoot, callPurchaseCosmetic, callClaimDailyChallenge } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc, query, where, getDoc, onSnapshot, orderBy, limit, arrayUnion, runTransaction } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { createInitialMetrics } from '../lib/telemetry';
import { TEACHER_DISPLAY_NAME } from '../constants';

// Track collections that have failed with permission errors to prevent
// re-subscribing after ErrorBoundary remounts (which would crash Firestore SDK)
const _deniedCollections = new Set<string>();
const guardedSnapshot = (
  name: string,
  q: any,
  callback: (snapshot: any) => void
) => {
  if (_deniedCollections.has(name)) return () => {};
  return onSnapshot(q, callback, (error: any) => {
    console.warn(`[guardedSnapshot] ${name} blocked:`, error?.code || error);
    if (error?.code === 'permission-denied' || error?.code === 'failed-precondition') {
      _deniedCollections.add(name);
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

  subscribeToXPEvents: (callback: (events: XPEvent[]) => void) => {
    return guardedSnapshot('xp_events', collection(db, 'xp_events'), (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as XPEvent)));
    });
  },

  saveXPEvent: async (event: XPEvent) => {
    await setDoc(doc(db, 'xp_events', event.id), event);
  },

  deleteXPEvent: async (id: string) => {
    await deleteDoc(doc(db, 'xp_events', id));
  },

  subscribeToQuests: (callback: (quests: Quest[]) => void) => {
    return guardedSnapshot('quests', collection(db, 'quests'), (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as Quest)));
    });
  },

  saveQuest: async (quest: Quest) => {
    await setDoc(doc(db, 'quests', quest.id), quest);
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

  disenchantItem: async (_userId: string, item: RPGItem, classType?: string) => {
      await callDisenchantItem({ itemId: item.id, classType });
  },

  craftItem: async (_userId: string, item: RPGItem, action: 'RECALIBRATE' | 'REFORGE' | 'OPTIMIZE', classType?: string) => {
      await callCraftItem({ itemId: item.id, action, classType });
  },

  // Admin Tools — via Cloud Functions
  adminUpdateInventory: async (userId: string, inventory: RPGItem[], currency: number) => {
      await callAdminUpdateInventory({ userId, inventory, currency });
  },

  adminUpdateEquipped: async (userId: string, equipped: Partial<Record<EquipmentSlot, RPGItem>>) => {
      await callAdminUpdateEquipped({ userId, equipped });
  },

  // Write only the appearance sub-field — all other gamification fields are Cloud-Function-only
  updateUserAppearance: async (userId: string, appearance: { hue?: number; bodyType?: 'A' | 'B' }, classType?: string) => {
      try {
          const userRef = doc(db, 'users', userId);
          if (classType) {
              // Write to per-class profile
              await updateDoc(userRef, { [`gamification.classProfiles.${classType}.appearance`]: appearance });
          } else {
              // Legacy fallback
              await updateDoc(userRef, { 'gamification.appearance': appearance });
          }
      } catch (error) {
          console.error("Error updating appearance:", error);
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
        console.error("Error sending message:", error);
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
          console.error("Error deleting message:", error);
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
        console.error("Subscribe Flagged Messages Error:", error);
    });
  },

  unflagMessage: async (messageId: string) => {
    try {
        const msgRef = doc(db, 'class_messages', messageId);
        await updateDoc(msgRef, { isFlagged: false, systemNote: '' });
    } catch (error) {
        console.error("Error unflagging message:", error);
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
          console.error("Error muting user:", error);
          throw error;
      }
  },

  subscribeToChannelMessages: (channelId: string, callback: (msgs: ChatMessage[]) => void) => {
    const q = query(
        collection(db, 'class_messages'), 
        where('channelId', '==', channelId),
        limit(100)
    );
    
    return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
        messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        callback(messages);
    }, (error) => {
        console.error("Subscribe Messages Error:", error);
    });
  },

  subscribeToAllConversations: (callback: (convos: Conversation[]) => void) => {
    const q = query(collection(db, 'conversations'), orderBy('lastMessageAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Conversation)));
    }, (error) => console.error("Conversations subscription error:", error));
  },

  subscribeToChatMessages: (convoId: string, callback: (msgs: ChatMessage[]) => void) => {
    const q = query(
      collection(db, `conversations/${convoId}/messages`),
      orderBy('timestamp', 'asc')
    );
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
    }, (error) => console.error("Chat messages subscription error:", error));
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
        console.error("Subscribe Flags Error:", error);
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
        console.error("Error resolving flag by messageId:", error);
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
    }, (error) => console.error("Evidence subscription error:", error));
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
          console.error("Error clearing weekly evidence:", error);
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
      console.error("Error updating settings:", error);
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

  subscribeToUsers: (callback: (users: User[]) => void) => {
    const q = collection(db, 'users');
    return onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        } as User;
      });
      callback(users);
    }, (error) => console.error("Users subscription error:", error));
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
          dueDate: data.dueDate
        };
      });
      callback(assignments);
    }, (error) => console.error("Assignments subscription error:", error));
  },
  
  subscribeToSubmissions: (callback: (submissions: Submission[]) => void) => {
    const q = query(collection(db, 'submissions'), orderBy('submittedAt', 'desc'), limit(200));
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
          )
        } as Submission;
      });
      callback(submissions);
    }, (error) => console.error("Submissions subscription error:", error));
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
          )
        } as Submission;
      })
      // Sort client-side instead
      .sort((a, b) => new Date(b.submittedAt || '').getTime() - new Date(a.submittedAt || '').getTime());
      callback(submissions);
    }, (error) => console.error("User submissions subscription error:", error));
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
    }, (error) => console.error("Whitelist subscription error:", error));
  },

  subscribeToClassConfigs: (callback: (configs: ClassConfig[]) => void) => {
      const q = collection(db, 'class_configs');
      return onSnapshot(q, (snapshot) => {
          const configs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClassConfig));
          callback(configs);
      }, (error) => console.error("ClassConfigs subscription error:", error));
  },

  addAssignment: async (assignment: Assignment) => {
    try {
      const data = {
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
        dueDate: assignment.dueDate || null
      };

      if (assignment.id) {
          await setDoc(doc(db, 'assignments', assignment.id), data, { merge: true });
      } else {
        await addDoc(collection(db, 'assignments'), data);
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  },

  updateAssignmentStatus: async (id: string, status: AssignmentStatus) => {
    try {
      await updateDoc(doc(db, 'assignments', id), { status });
    } catch (error) {
      console.error(error);
    }
  },

  deleteAssignment: async (id: string) => {
    try {
      await deleteDoc(doc(db, 'assignments', id));
    } catch (error) {
      console.error(error);
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
      console.error(error);
    }
  },

  updateWhitelistSection: async (email: string, section: string) => {
    try {
      await updateDoc(doc(db, 'allowed_emails', email), { section });
      // Also update user doc if they already exist
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(async (d) => {
        await updateDoc(doc(db, 'users', d.id), { section });
      }));
    } catch (error) {
      console.error(error);
    }
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
      console.error(error);
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
      console.error(error);
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
      console.error(error);
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
      console.error(error);
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
          console.error("Error updating user classes:", error);
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
      console.error(error);
    }
  },

  switchUserView: async (userId: string, classType: string) => {
    try {
        await updateDoc(doc(db, 'users', userId), { classType });
    } catch (e) {
        console.error("Error switching view:", e);
    }
  },

  awardXP: async (userId: string, amount: number, classType?: string) => {
      await callAwardXP({ targetUserId: userId, amount, classType });
  },

  submitEngagement: async (_userId: string, userName: string, assignmentId: string, assignmentTitle: string, metrics: TelemetryMetrics, classType: string) => {
      const result = await callSubmitEngagement({ assignmentId, assignmentTitle, userName, metrics, classType });
      return result.data as { xpEarned: number; leveledUp: boolean; status: string };
  },

  subscribeToLeaderboard: (callback: (users: User[]) => void) => {
      const q = query(collection(db, 'users'), where('role', '==', 'STUDENT'));
      return onSnapshot(q, (snapshot) => {
          callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User)));
      }, (error) => console.error("Leaderboard subscription error:", error));
  },

  saveClassConfig: async (config: ClassConfig) => {
    try {
      await setDoc(doc(db, 'class_configs', config.className), config);
    } catch (error) {
      console.error("Error saving class config:", error);
      throw error;
    }
  },
  
  deleteClassConfig: async (className: string) => {
    try {
      await deleteDoc(doc(db, 'class_configs', className));
    } catch (error) {
      console.error("Error deleting class config:", error);
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
    }, (error) => console.error("Notifications subscription error:", error));
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

  updateCodename: async (userId: string, codename: string) => {
    await updateDoc(doc(db, 'users', userId), { 'gamification.codename': codename });
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

  unlockSkill: async (skillId: string, specialization: string, cost: number) => {
    const result = await callUnlockSkill({ skillId, specialization, cost });
    return result.data as { success: boolean; remainingPoints: number };
  },

  // --- ITEM ENCHANTING / SOCKETING ---

  addSocket: async (itemId: string, classType?: string) => {
    const result = await callAddSocket({ itemId, classType });
    return result.data as { item: RPGItem; newCurrency: number };
  },

  socketGem: async (itemId: string, gemId: string, classType?: string) => {
    const result = await callSocketGem({ itemId, gemId, classType });
    return result.data as { item: RPGItem; newCurrency: number };
  },

  // --- BOSS ENCOUNTERS ---

  subscribeToBossEncounters: (callback: (bosses: BossEncounter[]) => void) => {
    const q = query(collection(db, 'boss_encounters'), where('isActive', '==', true));
    return guardedSnapshot('boss_encounters', q, (snapshot: any) => {
      callback(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as BossEncounter)));
    });
  },

  dealBossDamage: async (bossId: string, damage: number, userName: string) => {
    const result = await callDealBossDamage({ bossId, damage, userName });
    return result.data as {
      newHp: number;
      damageDealt: number;
      xpEarned: number;
      bossDefeated: boolean;
      leveledUp: boolean;
    };
  },

  // --- BOSS QUIZ ---

  subscribeToBossQuizzes: (classType: string, callback: (quizzes: BossQuizEvent[]) => void) => {
    const q = query(collection(db, 'boss_quizzes'), where('isActive', '==', true));
    return guardedSnapshot('boss_quizzes', q, (snapshot: any) => {
      const quizzes = snapshot.docs
        .map((d: any) => ({ id: d.id, ...d.data() } as BossQuizEvent))
        .filter((q: BossQuizEvent) => q.classType === classType || q.classType === 'GLOBAL');
      callback(quizzes);
    });
  },

  answerBossQuiz: async (quizId: string, questionId: string, answer: number) => {
    const result = await callAnswerBossQuiz({ quizId, questionId, answer });
    return result.data as { correct: boolean; damage: number; newHp: number; alreadyAnswered?: boolean };
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
    }, (error) => console.error("Party subscription error:", error));
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

  equipCosmetic: async (userId: string, cosmeticId: string | null) => {
    await updateDoc(doc(db, 'users', userId), {
      'gamification.activeCosmetic': cosmeticId,
    });
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
};
