import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

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

function validateOrigin(req: any, res: any): boolean {
  const origin = req.headers.origin as string | undefined;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).send("FORBIDDEN: Invalid or missing Origin header.");
    return false;
  }
  return true;
}

// Call this ONCE via browser URL after deploy to bootstrap your admin account.
// Requires the X-Admin-Secret header to match the ADMIN_BOOTSTRAP_SECRET env var.
export const setAdminClaim = onRequest(async (req, res) => {
  try {
    // Validate origin to prevent CSRF
    if (!validateOrigin(req, res)) return;

    // Authenticate the request with a secret token
    const secret = req.headers["x-admin-secret"];
    const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expectedSecret) {
      res.status(500).send("FAILED: ADMIN_BOOTSTRAP_SECRET environment variable not set.");
      return;
    }
    if (secret !== expectedSecret) {
      res.status(403).send("FORBIDDEN: Invalid or missing X-Admin-Secret header.");
      return;
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      res.status(500).send("FAILED: ADMIN_EMAIL environment variable not set.");
      return;
    }
    const userRecord = await admin.auth().getUserByEmail(adminEmail);
    await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    logger.info(`Admin claim set for ${adminEmail}`);
    res.status(200).send(`SUCCESS: Admin claim set for ${adminEmail}. Sign out and back in for it to take effect.`);
  } catch (error) {
    logger.error("Failed to set admin claim", error);
    res.status(500).send("FAILED: An internal error occurred.");
  }
});
// ==========================================
// UTILITY FUNCTIONS
// ==========================================

export const fixCors = onRequest(async (req, res) => {
  try {
    // Validate origin to prevent CSRF
    if (!validateOrigin(req, res)) return;

    // Authenticate the request with a secret token
    const secret = req.headers["x-admin-secret"];
    const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expectedSecret) {
      res.status(500).send("FAILED: ADMIN_BOOTSTRAP_SECRET environment variable not set.");
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
    logger.info("CORS configuration updated for bucket");
    res.status(200).send("SUCCESS: Storage permissions fixed.");
  } catch (error) {
    logger.error("Failed to set CORS", error);
    res.status(500).send("FAILED: An internal error occurred.");
  }
});
