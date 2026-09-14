// One-off admin script: register the Texas Grid Blackout Simulation in the
// Hosted Content Library. Idempotent — matches by sourceFingerprint
// '/texas-grid-blackout.html' and never overwrites curated fields once set.
//
// Run: cd functions && npx ts-node scripts/seed-texas-grid-blackout.ts [--dry-run]
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

const FP = '/texas-grid-blackout.html';

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
      await docRef.set({
        title: 'Texas Grid Blackout Simulation',
        description:
          'Interactive simulation of the Texas grid blackout — explore power generation, transmission failure, and cascading outages (OpenSciEd P.1 Lesson 1).',
        url: '/texas-grid-blackout',
        contentUrl: '/texas-grid-blackout.html',
        hostingType: 'bundled',
        contentKind: 'activity',
        subject: 'Physics',
        tags: ['electricity', 'grid', 'blackout', 'simulation', 'texas'],
        suggestedCategory: 'Simulation',
        status: 'active',
        untagged: false,
        sourceFingerprint: FP,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log('Created.');
    }
    return;
  }

  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`Found doc ${doc.id}: title=${JSON.stringify(data.title)} url=${JSON.stringify(data.url)} contentUrl=${JSON.stringify(data.contentUrl)}`);
    const updates: Record<string, unknown> = {};
    if (data.title !== 'Texas Grid Blackout Simulation') updates.title = 'Texas Grid Blackout Simulation';
    if (data.contentUrl !== FP) updates.contentUrl = FP;
    if (data.url !== '/texas-grid-blackout') updates.url = '/texas-grid-blackout';
    if (data.hostingType !== 'bundled') updates.hostingType = 'bundled';
    if (data.status !== 'active') updates.status = 'active';
    if (Object.keys(updates).length === 0) {
      console.log('Already correct — no changes.');
      continue;
    }
    console.log('Applying updates:', Object.keys(updates).join(', '));
    if (!DRY_RUN) {
      await doc.ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
      console.log('Updated.');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
