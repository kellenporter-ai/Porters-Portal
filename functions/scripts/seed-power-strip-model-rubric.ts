// One-off admin script: register the Power Strip Model Rubric in the
// Hosted Content Library. Idempotent — matches by sourceFingerprint
// '/power-strip-model-rubric.html' and never overwrites curated
// fields once set.
//
// Run: cd functions && npx ts-node scripts/seed-power-strip-model-rubric.ts [--execute]
// Default is DRY RUN; pass --execute to write. The rubric page itself links
// the four PDFs (EN/ES full + quick cards), so no attachment fields here —
// same as the journal rubric item.
// Env: GOOGLE_APPLICATION_CREDENTIALS=/home/kp/Desktop/Executive Assistant/tools/service-account.json

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// Explicit project/bucket — Admin SDK cannot resolve defaults outside the
// Functions runtime (same pattern as curate-library-items.ts).
admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'porters-portal',
  storageBucket: 'porters-portal.firebasestorage.app',
});
const db = admin.firestore();

const EXECUTE = process.argv.includes('--execute');

const FP = '/power-strip-model-rubric.html';

const DOC = {
  title: 'Power Strip Model Rubric',
  description:
    'Interactive bilingual (EN/ES) rubric for the P.1 Lesson 2 Power Strip Model assignment: infographic grid of skills and five tiers, click any box for full descriptors with examples. Printable quick cards and full PDFs included. ES: Rúbrica del Modelo de Regleta de Enchufes.',
  url: '/power-strip-model-rubric.html',
  contentUrl: '/power-strip-model-rubric.html',
  hostingType: 'bundled',
  contentKind: 'document',
  subject: 'Physics',
  tags: ['rubric', 'power-strip', 'model', 'assignment', 'bilingual', 'spanish'],
  suggestedCategory: 'Supplemental',
  status: 'active',
  untagged: false,
  sourceFingerprint: FP,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
};

async function main() {
  console.log(`Mode: ${EXECUTE ? 'LIVE (writes)' : 'DRY RUN (no writes)'}`);

  const snap = await db
    .collection('library_items')
    .where('sourceFingerprint', '==', FP)
    .get();

  if (snap.empty) {
    const docRef = db.collection('library_items').doc();
    console.log(`No existing doc for ${FP} — creating ${docRef.id}`);
    if (!EXECUTE) {
      console.log('DRY RUN: would create doc with:', JSON.stringify(DOC, null, 2));
      return;
    }
    await docRef.set(DOC);
    console.log('Created.');
    return;
  }

  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(
      `Found doc ${doc.id}: title=${JSON.stringify(data.title)} url=${JSON.stringify(data.url)}`
    );
    // Only refresh the URL fields + updatedAt; curated fields (title, tags,
    // category, subject) are teacher-owned once set.
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (data.url !== DOC.url) updates.url = DOC.url;
    if (data.contentUrl !== DOC.contentUrl) updates.contentUrl = DOC.contentUrl;
    if (Object.keys(updates).length > 1) {
      console.log(`  updates: ${JSON.stringify(Object.keys(updates))}`);
      if (!EXECUTE) {
        console.log('DRY RUN: no writes.');
        continue;
      }
      await doc.ref.update(updates);
    } else {
      console.log('  up to date, no writes.');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
