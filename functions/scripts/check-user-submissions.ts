import * as admin from "firebase-admin";
import { readFileSync } from "fs";
const sa = JSON.parse(readFileSync("/home/kp/Desktop/Executive Assistant/tools/service-account.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  const uid = "bwh2KkWnyGR37DnQg1fmsWKMwt93";
  // Check user's submission history XP (ground truth for what they earned)
  const subs = await db.collection("submissions")
    .where("userId", "==", uid)
    .get();
  let earnedXp = 0;
  const byStatus: Record<string, number> = {};
  subs.forEach(s => {
    const d = s.data();
    const st = d.status || "unknown";
    byStatus[st] = (byStatus[st] || 0) + 1;
    if (st === "graded" && typeof d.score === "number" && !d.isAssessment) {
      earnedXp += d.score;
    }
  });
  console.log(JSON.stringify({
    uid: uid.slice(0,6) + "…",
    submissionCount: subs.size,
    byStatus,
    earnedXpFromSubmissions: earnedXp,
  }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
