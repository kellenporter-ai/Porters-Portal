// One-off admin script: register the two OpenSciEd P.1 Lesson 4 bundled
// activities in the Hosted Content Library:
//   1. L4 Blackout Detective (interactive EIA hourly-generation data explorer)
//   2. L4 Decisions Matrix (weighted-criteria energy source ranking tool)
//
// Idempotent — matches by sourceFingerprint and never overwrites curated
// fields (title/description/tags/etc.) once set. Only corrects routing and
// status fields on re-runs.
//
// Run: cd functions && npx ts-node scripts/seed-l4-activities.ts [--dry-run]
// Env: GOOGLE_APPLICATION_CREDENTIALS=/home/kp/Desktop/Executive Assistant/tools/service-account.json

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// Explicit project/bucket — Admin SDK cannot resolve defaults outside the
// Functions runtime (same pattern as seed-texas-grid-blackout.ts).
admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'porters-portal',
  storageBucket: 'porters-portal.firebasestorage.app',
});
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

interface ActivityDef {
  fingerprint: string; // sourceFingerprint, also the contentUrl
  url: string; // clean library URL (rewrite target minus .html)
  title: string;
  description: string;
  tags: string[];
  suggestedCategory: string;
}

const ACTIVITIES: ActivityDef[] = [
  {
    fingerprint: '/l4-blackout-detective.html',
    url: '/l4-blackout-detective',
    title: 'L4 Blackout Detective — Texas Energy Case Board',
    description:
      'Interactive data explorer for OpenSciEd Physics P.1 Lesson 4: investigate which energy sources failed during the February 2021 Texas blackout using real EIA hourly generation data (Feb 2020 vs Feb 2021). Pin evidence to a case board, complete 5 missions, and submit your verdict. English/Español toggle.',
    tags: ['electricity', 'grid', 'blackout', 'texas', 'data-analysis', 'openscied', 'bilingual'],
    suggestedCategory: 'Activity',
  },
  {
    fingerprint: '/l4-decisions-matrix.html',
    url: '/l4-decisions-matrix',
    title: 'L4 Decisions Matrix — Energy Sources',
    description:
      'Interactive Decisions Matrix for OpenSciEd Physics P.1 Lesson 4: rate energy sources against decision criteria (reliability pre-set), adjust criterion weights, and watch the live weighted ranking flip. Includes a reflection prompt and print export. English/Español toggle.',
    tags: ['electricity', 'grid', 'energy-sources', 'openscied', 'bilingual'],
    suggestedCategory: 'Activity',
  },
];

async function seedActivity(def: ActivityDef) {
  console.log(`\n=== ${def.fingerprint} ===`);
  const snap = await db
    .collection('library_items')
    .where('sourceFingerprint', '==', def.fingerprint)
    .get();

  if (snap.empty) {
    const docRef = db.collection('library_items').doc();
    console.log(`No existing doc — creating ${docRef.id}`);
    const payload = {
      title: def.title,
      description: def.description,
      url: def.url,
      contentUrl: def.fingerprint,
      hostingType: 'bundled',
      contentKind: 'activity',
      subject: 'Physics',
      tags: def.tags,
      suggestedCategory: def.suggestedCategory,
      status: 'active',
      untagged: false,
      sourceFingerprint: def.fingerprint,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!DRY_RUN) {
      await docRef.set(payload);
      console.log('Created.');
    } else {
      console.log('DRY RUN — planned create:', JSON.stringify(payload, null, 2));
    }
    return;
  }

  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(
      `Found doc ${doc.id}: title=${JSON.stringify(data.title)} url=${JSON.stringify(data.url)} contentUrl=${JSON.stringify(data.contentUrl)}`
    );
    // Never overwrite curated fields (title/description/tags/etc.) —
    // only repair routing/status fields if they drifted.
    const updates: Record<string, unknown> = {};
    if (data.contentUrl !== def.fingerprint) updates.contentUrl = def.fingerprint;
    if (data.url !== def.url) updates.url = def.url;
    if (data.hostingType !== 'bundled') updates.hostingType = 'bundled';
    if (data.contentKind !== 'activity') updates.contentKind = 'activity';
    if (data.status !== 'active') updates.status = 'active';
    if (Object.keys(updates).length === 0) {
      console.log('Already correct — no changes (curated fields untouched).');
      continue;
    }
    console.log('Applying non-curated updates:', Object.keys(updates).join(', '));
    if (!DRY_RUN) {
      await doc.ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
      console.log('Updated.');
    }
  }
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  for (const def of ACTIVITIES) {
    await seedActivity(def);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
