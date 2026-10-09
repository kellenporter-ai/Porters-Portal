import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { verifyAdmin, generateCorrelationId, logWithCorrelation } from "./core";

/**
 * Public-facing subset of a user document, used for the leaderboard and
 * any other student-visible roster view. Mirrored from /users/{uid} on write.
 *
 * Excludes PII like email, settings (other than privacyMode), and any
 * teacher-only fields. Cloud Functions are the only writer.
 */
interface PublicProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  classType: string | null;
  enrolledClasses: string[];
  privacyMode: boolean;
  gamification: {
    xp: number;
    level: number;
    codename: string | null;
    activeCosmetics: { frame?: string | null } | null;
    appearance: Record<string, unknown> | null;
    equipped: Record<string, unknown> | null;
    classProfiles: Record<string, { equipped: Record<string, unknown> | null; appearance: Record<string, unknown> | null }> | null;
  };
  updatedAt: FirebaseFirestore.FieldValue;
}

function buildPublicProfile(uid: string, data: FirebaseFirestore.DocumentData): PublicProfile {
  const gam = data.gamification || {};

  // SECURITY: mirror ONLY equipped + appearance from classProfiles.
  // Never mirror inventory, stats, currency, or any other field.
  let classProfiles: PublicProfile["gamification"]["classProfiles"] = null;
  if (gam.classProfiles && typeof gam.classProfiles === "object" && !Array.isArray(gam.classProfiles)) {
    const profiles: NonNullable<PublicProfile["gamification"]["classProfiles"]> = {};
    for (const [classType, profile] of Object.entries(gam.classProfiles as Record<string, unknown>)) {
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) continue;
      const p = profile as Record<string, unknown>;
      profiles[classType] = {
        equipped: p.equipped && typeof p.equipped === "object" && !Array.isArray(p.equipped) ? (p.equipped as Record<string, unknown>) : null,
        appearance: p.appearance && typeof p.appearance === "object" && !Array.isArray(p.appearance) ? (p.appearance as Record<string, unknown>) : null,
      };
    }
    classProfiles = Object.keys(profiles).length > 0 ? profiles : null;
  }

  return {
    id: uid,
    name: typeof data.name === "string" ? data.name : "",
    avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    role: typeof data.role === "string" ? data.role : "STUDENT",
    classType: typeof data.classType === "string" ? data.classType : null,
    enrolledClasses: Array.isArray(data.enrolledClasses) ? data.enrolledClasses.filter((c: unknown): c is string => typeof c === "string") : [],
    privacyMode: data.settings?.privacyMode === true,
    gamification: {
      xp: typeof gam.xp === "number" ? gam.xp : 0,
      level: typeof gam.level === "number" ? gam.level : 1,
      codename: typeof gam.codename === "string" ? gam.codename : null,
      activeCosmetics: gam.activeCosmetics && typeof gam.activeCosmetics === "object" ? { frame: gam.activeCosmetics.frame ?? null } : null,
      appearance: gam.appearance && typeof gam.appearance === "object" && !Array.isArray(gam.appearance) ? (gam.appearance as Record<string, unknown>) : null,
      equipped: gam.equipped && typeof gam.equipped === "object" && !Array.isArray(gam.equipped) ? (gam.equipped as Record<string, unknown>) : null,
      classProfiles,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Mirror /users/{uid} → /public_profiles/{uid} on every write.
 * Only mirrors STUDENT role. On user delete, removes the public profile too.
 */
export const mirrorUserToPublicProfile = onDocumentWritten(
  { document: "users/{userId}", memory: "256MiB", timeoutSeconds: 30 },
  async (event) => {
    const userId = event.params.userId;
    const after = event.data?.after?.data();
    const db = admin.firestore();
    const publicRef = db.collection("public_profiles").doc(userId);

    if (!after) {
      // User deleted — remove mirror
      await publicRef.delete().catch(() => undefined);
      return;
    }

    if (after.role !== "STUDENT") {
      // Non-students don't appear on leaderboards
      await publicRef.delete().catch(() => undefined);
      return;
    }

    await publicRef.set(buildPublicProfile(userId, after));
  }
);

/**
 * Admin-only one-time backfill: rebuild /public_profiles for every existing student.
 */
export const backfillPublicProfiles = onCall(
  { memory: "512MiB", timeoutSeconds: 540 },
  async (request) => {
    await verifyAdmin(request.auth);
    const correlationId = generateCorrelationId();
    const db = admin.firestore();

    let written = 0;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    while (true) {
      let q = db.collection("users")
        .where("role", "==", "STUDENT")
        .orderBy("__name__")
        .limit(400);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      if (snap.empty) break;
      lastDoc = snap.docs[snap.docs.length - 1];

      const batch = db.batch();
      for (const doc of snap.docs) {
        batch.set(db.collection("public_profiles").doc(doc.id), buildPublicProfile(doc.id, doc.data()));
      }
      await batch.commit();
      written += snap.size;
      if (snap.size < 400) break;
    }

    logWithCorrelation('info', 'Public profiles backfilled', correlationId, { written });
    return { written };
  }
);
