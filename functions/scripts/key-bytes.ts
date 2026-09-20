import * as admin from "firebase-admin";
import { readFileSync } from "fs";
const sa = JSON.parse(readFileSync("/home/kp/Desktop/Executive Assistant/tools/service-account.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
async function main() {
  const doc = await db.collection("users").doc("bwh2KkWnyGR37DnQg1fmsWKMwt93").get();
  const gam = doc.data()!.gamification || {};
  for (const k of Object.keys(gam.classProfiles || {})) {
    console.log(JSON.stringify(k), [...Buffer.from(k, "utf8")].map(b => b.toString(16)).join(" "));
  }
  const eq = gam.classProfiles?.["Sandbox Class"]?.equipped || {};
  for (const k of Object.keys(eq)) console.log("equip key:", JSON.stringify(k));
}
main().catch(e => { console.error(e); process.exit(1); });
