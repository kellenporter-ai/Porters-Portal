import * as admin from "firebase-admin";
import { readFileSync } from "fs";
const sa = JSON.parse(readFileSync("/home/kp/Desktop/Executive Assistant/tools/service-account.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
async function main() {
  const doc = await db.collection("users").doc("bwh2KkWnyGR37DnQg1fmsWKMwt93").get();
  const gam = doc.data()!.gamification || {};
  const prof = gam.classProfiles?.["Sandbox Class"] || {};
  console.log(JSON.stringify({
    equipped: prof.equipped,
    inventory: prof.inventory,
    topLevelInventoryCount: (gam.inventory || []).length,
  }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
