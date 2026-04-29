import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { createHash } from "crypto";
import { generateCorrelationId, logWithCorrelation } from "./core";

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
// ENROLLMENT
// ==========================================

export const redeemEnrollmentCode = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (_request) => {
  const correlationId = generateCorrelationId();
  void correlationId;
  throw new HttpsError("unimplemented", "Enrollment code redemption is not yet implemented.");
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
