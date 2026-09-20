import * as admin from "firebase-admin";
import { readFileSync } from "fs";
const sa = JSON.parse(readFileSync("/home/kp/Desktop/Executive Assistant/tools/service-account.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
async function main() {
  const doc = await db.collection("users").doc("bwh2KkWnyGR37DnQg1fmsWKMwt93").get();
  const gam = doc.data()!.gamification || {};
  const cp = gam.classProfiles || {};
  for (const [cls, prof] of Object.entries(cp)) {
    const equipped = (prof as any).equipped || {};
    console.log("class:", cls, "| equipped keys:", JSON.stringify(Object.keys(equipped)));
  }
  const inv = gam.inventory || [];
  console.log("inventory count:", inv.length);
  const slots = new Set(inv.map((i: any) => i.slot));
  console.log("inventory slots:", JSON.stringify([...slots]));
  // Count users with lowercase equipped keys or lowercase item.slot (paginated sample)
  let lastDoc: admin.firestore.DocumentSnapshot | null = null;
  let lowerEquipped = 0, lowerItemSlot = 0, scanned = 0;
  const LOWER = /[a-z]/;
  while (scanned < 5000) {
    let q: admin.firestore.Query = db.collection("users").orderBy("__name__").limit(499);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    lastDoc = snap.docs[snap.docs.length - 1];
    for (const d of snap.docs) {
      scanned++;
      const g = d.data()?.gamification;
      if (!g) continue;
      const cps = g.classProfiles || {};
      for (const prof of Object.values(cps) as any[]) {
        for (const k of Object.keys(prof.equipped || {})) {
          if (LOWER.test(k)) { lowerEquipped++; break; }
        }
      }
      for (const item of (g.inventory || []) as any[]) {
        if (typeof item.slot === "string" && LOWER.test(item.slot)) { lowerItemSlot++; break; }
      }
    }
    if (snap.size < 499) break;
  }
  console.log(JSON.stringify({ scanned, usersWithLowerEquipped: lowerEquipped, usersWithLowerItemSlot: lowerItemSlot }));
}
main().catch(e => { console.error(e); process.exit(1); });
