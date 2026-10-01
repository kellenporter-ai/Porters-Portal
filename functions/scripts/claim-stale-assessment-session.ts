import * as admin from "firebase-admin";
import { readFileSync } from "fs";
const sa = JSON.parse(readFileSync("/home/kp/Desktop/Executive Assistant/tools/service-account.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const DOC_PATH = "assessment_sessions/3a5a84e1-2f85-4718-83ec-d1b140c28084";
const EXPECTED = {
  userId: "bwh2KkWnyGR37DnQg1fmsWKMwt93",
  assignmentId: "PhXRhByxaenib2iBcS8t",
};

async function main() {
  const ref = db.doc(DOC_PATH);
  const snap = await ref.get();

  if (!snap.exists) {
    console.log(JSON.stringify({ status: "STOP", reason: "doc does not exist", path: DOC_PATH }));
    return;
  }

  const before = snap.data()!;

  if (before.used === true) {
    console.log(JSON.stringify({
      status: "STOP",
      reason: "already used — nothing to do",
      path: DOC_PATH,
      before: { used: before.used, usedAt: before.usedAt ?? null },
    }, null, 2));
    return;
  }

  if (before.userId !== EXPECTED.userId || before.assignmentId !== EXPECTED.assignmentId) {
    console.log(JSON.stringify({
      status: "STOP",
      reason: "doc did not match expected identity — aborting without writes",
      path: DOC_PATH,
      found: { userId: before.userId, assignmentId: before.assignmentId },
      expected: EXPECTED,
    }, null, 2));
    return;
  }

  await ref.update({
    used: true,
    usedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const after = (await ref.get()).data()!;
  console.log(JSON.stringify({
    status: "OK",
    path: DOC_PATH,
    confirmed: after.used === true,
    before: { used: before.used, usedAt: before.usedAt ?? null },
    after: { used: after.used, usedAt: after.usedAt ?? null },
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
