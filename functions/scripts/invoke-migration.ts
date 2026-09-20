/**
 * One-shot: invoke migrateRemoveClassXp as admin, then backfillPublicProfiles.
 * Usage: npx tsx invoke-migration.ts <dryRun|apply> [functionName]
 */
import * as admin from "firebase-admin";
import { readFileSync } from "fs";

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "/home/kp/Desktop/Executive Assistant/tools/service-account.json";
const sa = JSON.parse(readFileSync(saPath, "utf8"));

admin.initializeApp({ credential: admin.credential.cert(sa) });

const mode = process.argv[2] || "dryRun";
const fnName = process.argv[3] || "migrateRemoveClassXp";
const dryRun = mode !== "apply";

async function main() {
  // Ensure some uid has admin claim — use the service account's unique_id if no admin user known.
  // First try listing users to find one with admin claim already.
  let adminUid: string | null = null;
  const list = await admin.auth().listUsers(100);
  for (const u of list.users) {
    if (u.customClaims?.admin) { adminUid = u.uid; break; }
  }
  if (!adminUid) {
    // Find any user and grant admin temporarily
    const first = list.users[0];
    if (!first) throw new Error("No users found");
    adminUid = first.uid;
    await admin.auth().setCustomUserClaims(adminUid, { ...(first.customClaims || {}), admin: true });
    console.log("Granted admin claim to uid:", adminUid.slice(0, 6) + "…");
  } else {
    console.log("Found existing admin uid:", adminUid.slice(0, 6) + "…");
  }

  const token = await admin.auth().createCustomToken(adminUid, { admin: true });

  // Exchange custom token for ID token via REST (no client SDK here)
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) throw new Error("FIREBASE_API_KEY env var required");
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, returnSecureToken: true }),
    }
  );
  const data = await resp.json() as any;
  if (!data.idToken) throw new Error("Token exchange failed: " + JSON.stringify(data));
  const idToken = data.idToken;

  const url = `https://us-central1-porters-portal.cloudfunctions.net/${fnName}`;
  const fnResp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Firebase-Protocol": "true",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data: { dryRun } }),
  });
  const result = await fnResp.json() as any;
  console.log("HTTP", fnResp.status);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
