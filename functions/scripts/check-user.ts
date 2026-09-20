import * as admin from "firebase-admin";
import { readFileSync } from "fs";
const sa = JSON.parse(readFileSync("/home/kp/Desktop/Executive Assistant/tools/service-account.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  const uid = "bwh2KkWnyGR37DnQg1fmsWKMwt93";
  const doc = await db.collection("users").doc(uid).get();
  if (!doc.exists) { console.log("No user doc"); return; }
  const data = doc.data()!;
  const gam = data.gamification || {};
  console.log(JSON.stringify({
    uid: uid.slice(0,6) + "…",
    xp: gam.xp,
    level: gam.level,
    classXp: gam.classXp,
    hasClassXpField: "classXp" in gam,
  }, null, 2));

  // Spot-check 2 more random users with classXp
  const snap = await db.collection("users").orderBy("__name__").limit(10).get();
  let checked = 0;
  for (const d of snap.docs) {
    if (d.id === uid) continue;
    const g = d.data()?.gamification || {};
    if (!("classXp" in g)) continue;
    console.log(JSON.stringify({
      uid: d.id.slice(0,6) + "…",
      xp: g.xp,
      level: g.level,
      classXpSum: Object.values(g.classXp || {}).reduce((s: number, v: any) => s + (typeof v === "number" ? v : 0), 0),
    }));
    if (++checked >= 2) break;
  }
}
main().catch(e => { console.error(e); process.exit(1); });
