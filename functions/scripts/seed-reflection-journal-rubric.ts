// One-off admin script: register the Weekly Reflection Journal Rubric in the
// Hosted Content Library. Idempotent — matches by sourceFingerprint
// '/weekly-reflection-journal-rubric.html' and never overwrites curated
// fields once set.
//
// Run: cd functions && npx ts-node scripts/seed-reflection-journal-rubric.ts [--dry-run]
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

const DRY_RUN = process.argv.includes('--dry-run');

const FP = '/weekly-reflection-journal-rubric.html';

const DOC = {
  title: 'Weekly Reflection Journal Rubric',
  description:
    'Interactive bilingual (EN/ES) rubric for the daily reflection journal: infographic grid of skills and tiers, click any box for full descriptors with examples. Printable quick cards and full PDFs included.',
  url: '/weekly-reflection-journal-rubric.html',
  contentUrl: '/weekly-reflection-journal-rubric.html',
  hostingType: 'bundled',
  contentKind: 'document',
  tags: ['rubric', 'reflection', 'journal', 'metacognition', 'bilingual', 'spanish'],
  suggestedCategory: 'Supplemental',
  status: 'active',
  untagged: false,
  sourceFingerprint: FP,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
};

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);

  const snap = await db
    .collection('library_items')
    .where('sourceFingerprint', '==', FP)
    .get();

  if (snap.empty) {
    const docRef = db.collection('library_items').doc();
    console.log(`No existing doc for ${FP} — creating ${docRef.id}`);
    if (!DRY_RUN) {
      await docRef.set(DOC);
      console.log('Created.');
    }
    return;
  }

  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(
      `Found doc ${doc.id}: title=${JSON.stringify(data.title)} url=${JSON.stringify(data.url)}`
    );
    // Only refresh the URL fields + updatedAt; curated fields (title, tags,
    // category) are teacher-owned once set.
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (data.url !== DOC.url) updates.url = DOC.url;
    if (data.contentUrl !== DOC.contentUrl) updates.contentUrl = DOC.contentUrl;
    if (Object.keys(updates).length > 1) {
      console.log(`  updates: ${JSON.stringify(Object.keys(updates))}`);
      if (!DRY_RUN) await doc.ref.update(updates);
    } else {
      console.log('  up to date, no writes.');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
