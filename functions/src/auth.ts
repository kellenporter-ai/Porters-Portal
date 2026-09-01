import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { createHash } from "crypto";
import { generateCorrelationId, logWithCorrelation, verifyAuth, verifyAdmin } from "./core";

// ==========================================
// ==========================================
// ADMIN SETUP — Set Custom Claims
// ==========================================

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://porters-portal.web.app",
  "https://porters-portal.firebaseapp.com",
];

const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function validateOrigin(req: any, res: any): boolean {
  const origin = req.headers.origin as string | undefined;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).send("FORBIDDEN: Invalid or missing Origin header.");
    return false;
  }
  return true;
}

function getHashedIp(req: any): string {
  const rawIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  return createHash("sha256").update(rawIp).digest("hex");
}

async function checkRateLimit(ipHash: string): Promise<boolean> {
  const db = admin.firestore();
  const docRef = db.collection("admin_claim_attempts").doc(ipHash);
  const now = Date.now();

  const doc = await docRef.get();
  if (!doc.exists) {
    await docRef.set({
      count: 1,
      windowStart: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }

  const data = doc.data()!;
  const windowStart = data.windowStart?.toMillis?.() ?? 0;

  if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
    // Window expired — reset
    await docRef.set({
      count: 1,
      windowStart: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }

  if (data.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return false;
  }

  await docRef.update({ count: admin.firestore.FieldValue.increment(1) });
  return true;
}

// Call this ONCE via browser URL after deploy to bootstrap your admin account.
// Requires the X-Admin-Secret header to match the ADMIN_BOOTSTRAP_SECRET env var.
export const setAdminClaim = onRequest({ memory: "256MiB", timeoutSeconds: 60 }, async (req, res) => {
  const correlationId = generateCorrelationId();
  try {
    // Validate origin to prevent CSRF
    if (!validateOrigin(req, res)) return;

    // Brute-force rate limiting per hashed IP
    const ipHash = getHashedIp(req);
    const allowed = await checkRateLimit(ipHash);
    if (!allowed) {
      res.status(429).send("RESOURCE_EXHAUSTED: Too many attempts. Try again later.");
      return;
    }

    // Authenticate the request with a secret token
    const secret = req.headers["x-admin-secret"];
    const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expectedSecret) {
      res.status(500).send("FAILED: Server configuration error.");
      return;
    }
    if (secret !== expectedSecret) {
      res.status(403).send("FORBIDDEN: Invalid or missing X-Admin-Secret header.");
      return;
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      res.status(500).send("FAILED: Server configuration error.");
      return;
    }
    const userRecord = await admin.auth().getUserByEmail(adminEmail);
    await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    logWithCorrelation('info', 'Admin claim set', correlationId, { uid: userRecord.uid, email: adminEmail, ip: ipHash, origin: req.headers.origin as string | undefined });
    res.status(200).send(`SUCCESS: Admin claim set for ${adminEmail}. Sign out and back in for it to take effect.`);
  } catch (error) {
    logWithCorrelation('error', 'Failed to set admin claim', correlationId, { error });
    res.status(500).send("FAILED: An internal error occurred.");
  }
});

// ==========================================
// ADMIN ADD TO WHITELIST (ATOMIC)
// ==========================================
export const adminAddToWhitelist = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const correlationId = generateCorrelationId();
  verifyAuth(request.auth);
  await verifyAdmin(request.auth);

  const db = admin.firestore();

  const { email, classType } = request.data as { email?: string; classType?: string };
  if (!email || !classType) {
    throw new HttpsError("invalid-argument", "email and classType are required.");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const whitelistRef = db.doc(`allowed_emails/${normalizedEmail}`);

  // Read current whitelist state
  const existing = await whitelistRef.get();
  const currentTypes: string[] = existing.exists ? (existing.data()?.classTypes || [existing.data()?.classType].filter(Boolean)) : [];
  const mergedTypes = Array.from(new Set([...currentTypes, classType]));

  // Find matching users
  const usersSnap = await db.collection("users").where("email", "==", normalizedEmail).get();

  // Atomic batch: whitelist doc + all matching user docs
  const batch = db.batch();

  batch.set(whitelistRef, { classType, classTypes: mergedTypes }, { merge: true });

  usersSnap.docs.forEach((userDoc) => {
    const userData = userDoc.data();
    const currentClasses: string[] = userData.enrolledClasses || (userData.classType ? [userData.classType] : []);
    const newClasses = Array.from(new Set([...currentClasses, classType]));
    batch.update(userDoc.ref, {
      isWhitelisted: true,
      classType,
      enrolledClasses: newClasses,
    });
  });

  await batch.commit();

  logWithCorrelation('info', 'Admin added email to whitelist', correlationId, { email: normalizedEmail, classType, usersUpdated: usersSnap.size });
  return { success: true, email: normalizedEmail, classType, usersUpdated: usersSnap.size };
});

// ==========================================
// ENROLLMENT
// ==========================================

export const redeemEnrollmentCode = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const correlationId = generateCorrelationId();
  const uid = verifyAuth(request.auth);

  const { code } = request.data as { code?: string };
  if (!code || typeof code !== "string" || code.trim().length < 4) {
    throw new HttpsError("invalid-argument", "A valid enrollment code is required.");
  }

  const db = admin.firestore();
  const normalizedCode = code.toUpperCase().replace(/-/g, "");

  // Find the active code
  const codesSnap = await db.collection("enrollment_codes")
    .where("code", "==", normalizedCode)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (codesSnap.empty) {
    return { success: false, error: "Invalid or expired code." };
  }

  const codeDocRef = codesSnap.docs[0].ref;

  // Atomic transaction — prevents usedCount race condition
  const result = await db.runTransaction(async (tx) => {
    const freshCode = await tx.get(codeDocRef);
    if (!freshCode.exists) return { success: false, error: "Code no longer exists." };
    const codeData = freshCode.data()!;

    if (codeData.maxUses && codeData.usedCount >= codeData.maxUses) {
      return { success: false, error: "This code has reached its usage limit." };
    }

    const userRef = db.doc(`users/${uid}`);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) return { success: false, error: "User not found." };

    const userData = userSnap.data()!;
    const enrolled: string[] = userData.enrolledClasses || [];
    if (enrolled.includes(codeData.classType)) {
      return { success: false, error: "Already enrolled in this class." };
    }

    // Atomic updates — enroll student + increment usedCount
    const userUpdate: Record<string, unknown> = {
      enrolledClasses: admin.firestore.FieldValue.arrayUnion(codeData.classType),
      isWhitelisted: true,
    };
    if (codeData.section) {
      userUpdate[`classSections.${codeData.classType}`] = codeData.section;
    }
    tx.update(userRef, userUpdate);
    tx.update(codeDocRef, { usedCount: admin.firestore.FieldValue.increment(1) });

    return { success: true, classType: codeData.classType };
  });

  logWithCorrelation('info', 'Enrollment code redemption attempted', correlationId, { uid, success: result.success, classType: result.classType });
  return result;
});

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

export const fixCors = onRequest({ memory: "256MiB", timeoutSeconds: 60 }, async (req, res) => {
  const correlationId = generateCorrelationId();
  try {
    // Validate HTTP method
    if (req.method !== "POST" && req.method !== "OPTIONS") {
      res.status(400).send("INVALID_ARGUMENT: Only POST and OPTIONS methods are allowed.");
      return;
    }

    // Validate origin to prevent CSRF
    if (!validateOrigin(req, res)) return;

    // Authenticate the request with a secret token
    const secret = req.headers["x-admin-secret"];
    const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expectedSecret) {
      res.status(500).send("FAILED: Server configuration error.");
      return;
    }
    if (secret !== expectedSecret) {
      res.status(403).send("FORBIDDEN: Invalid or missing X-Admin-Secret header.");
      return;
    }

    const bucket = admin.storage().bucket();
    await bucket.setCorsConfiguration([{
      origin: ALLOWED_ORIGINS,
      method: ["GET", "HEAD", "OPTIONS"],
      maxAgeSeconds: 3600,
    }]);
    logWithCorrelation('info', 'CORS configuration updated for bucket', correlationId, { origin: req.headers.origin as string | undefined });
    res.status(200).send("SUCCESS: Storage permissions fixed.");
  } catch (error) {
    logWithCorrelation('error', 'Failed to set CORS', correlationId, { error });
    res.status(500).send("FAILED: An internal error occurred.");
  }
});
