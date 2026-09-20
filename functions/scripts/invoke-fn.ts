/**
 * One-shot: invoke an arbitrary callable CF as admin with a custom payload.
 * Usage: npx tsx invoke-fn.ts <fnName> '<jsonPayload>'
 */
import * as admin from "firebase-admin";
import { readFileSync } from "fs";

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "/home/kp/Desktop/Executive Assistant/tools/service-account.json";
const sa = JSON.parse(readFileSync(saPath, "utf8"));

admin.initializeApp({ credential: admin.credential.cert(sa) });

const fnName = process.argv[2];
const payload = JSON.parse(process.argv[3] || "{}");

async function main() {
  let adminUid: string | null = null;
  const list = await admin.auth().listUsers(100);
  for (const u of list.users) {
    if (u.customClaims?.admin) { adminUid = u.uid; break; }
  }
  if (!adminUid) throw new Error("No admin user found");

  const token = await admin.auth().createCustomToken(adminUid, { admin: true });
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
    body: JSON.stringify({ data: payload }),
  });
  const result = await fnResp.json() as any;
  console.log("HTTP", fnResp.status);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
