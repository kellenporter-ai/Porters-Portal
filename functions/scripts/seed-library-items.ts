// Run: cd functions && npx ts-node scripts/seed-library-items.ts [--dry-run]
//
// One-time seed for the Hosted Content Library: upserts the 7 known hosted
// pages with starter metadata. Idempotent — matches by sourceFingerprint and
// never overwrites curated fields (title/description/tags/subject) once set.

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

admin.initializeApp();
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

interface SeedItem {
  title: string;
  description: string;
  url: string;
  hostingType: 'bundled' | 'storage' | 'external';
  contentKind: 'activity' | 'tool' | 'textbook' | 'deck' | 'document' | 'utility';
  subject?: string;
  tags: string[];
  suggestedCategory: 'Lesson' | 'Lab' | 'Simulation' | 'Practice' | 'Supplemental';
  sourceFingerprint: string;
}

const SEED_ITEMS: SeedItem[] = [
  {
    title: 'Circuit Diagram Builder',
    description: 'Interactive circuit construction tool — build and test series/parallel circuits.',
    url: '/circuit-diagram-builder',
    hostingType: 'bundled',
    contentKind: 'tool',
    subject: 'Honors Physics',
    tags: ['circuits', 'electricity', 'interactive'],
    suggestedCategory: 'Simulation',
    sourceFingerprint: '/circuit-diagram-builder.html',
  },
  {
    title: 'Electroscope Charge Assessment',
    description: 'Guided assessment on electrostatic charge and electroscope behavior.',
    url: '/electroscope-charge-assessment',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'AP Physics 1',
    tags: ['electrostatics', 'assessment'],
    suggestedCategory: 'Practice',
    sourceFingerprint: '/electroscope-charge-assessment.html',
  },
  {
    title: 'Bar Chart Tool',
    description: 'Simple bar chart builder for quick data visualization in class.',
    url: '/tools/bar-chart',
    hostingType: 'bundled',
    contentKind: 'tool',
    subject: 'General',
    tags: ['data', 'graphs'],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/tools/bar-chart.html',
  },
  {
    title: 'Force Diagram Tool',
    description: 'Free-body / force diagram drawing tool.',
    url: '/tools/force-diagram',
    hostingType: 'bundled',
    contentKind: 'tool',
    subject: 'Honors Physics',
    tags: ['forces', 'free-body-diagram'],
    suggestedCategory: 'Simulation',
    sourceFingerprint: '/tools/force-diagram.html',
  },
  {
    title: 'Textbook: Ch 2 — Kinematics 1D',
    description: 'Interactive textbook chapter on one-dimensional kinematics.',
    url: '/textbook/ch2-kinematics-1d/',
    hostingType: 'bundled',
    contentKind: 'textbook',
    subject: 'AP Physics 1',
    tags: ['kinematics', 'textbook'],
    suggestedCategory: 'Lesson',
    sourceFingerprint: '/textbook/ch2-kinematics-1d/',
  },
  {
    title: 'Codeword Lookup',
    description: 'Forgery Files codeword lookup utility.',
    url: '/codeword',
    hostingType: 'bundled',
    contentKind: 'utility',
    tags: ['forensics', 'utility'],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/codeword-lookup.html',
  },
  {
    title: 'Privacy Policy',
    description: 'Porter\'s Portal privacy policy.',
    url: '/privacy',
    hostingType: 'bundled',
    contentKind: 'utility',
    tags: ['utility'],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/privacy.html',
  },
];

async function main() {
  console.log('=== Seed library_items ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log();

  const snap = await db.collection('library_items').get();
  const byFingerprint = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of snap.docs) {
    const fp = doc.data().sourceFingerprint;
    if (typeof fp === 'string') byFingerprint.set(fp, doc);
  }

  let batch = db.batch();
  let batchCount = 0;
  let created = 0;
  let updated = 0;
  let skippedCurated = 0;

  const commit = async () => {
    if (DRY_RUN || batchCount === 0) return;
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  };

  for (const item of SEED_ITEMS) {
    const existing = byFingerprint.get(item.sourceFingerprint);
    const base = {
      url: item.url,
      hostingType: item.hostingType,
      contentKind: item.contentKind,
      subject: item.subject ?? null,
      suggestedCategory: item.suggestedCategory,
      status: 'active',
      sourceFingerprint: item.sourceFingerprint,
    };

    if (!existing) {
      console.log(`  [CREATE] ${item.title} (${item.sourceFingerprint})`);
      if (!DRY_RUN) {
        const ref = db.collection('library_items').doc();
        batch.set(ref, {
          ...base,
          title: item.title,
          description: item.description,
          tags: item.tags,
          untagged: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        batchCount++;
      }
      created++;
    } else {
      const data = existing.data();
      if (data.untagged === true) {
        // Scan-created stub — fill in curated starter metadata.
        console.log(`  [UPDATE] ${item.title} (${item.sourceFingerprint})`);
        if (!DRY_RUN) {
          batch.update(existing.ref, {
            ...base,
            title: item.title,
            description: item.description,
            tags: item.tags,
            untagged: false,
            updatedAt: FieldValue.serverTimestamp(),
          });
          batchCount++;
        }
        updated++;
      } else {
        // Curated by hand — only backfill missing structural fields.
        console.log(`  [SKIP] ${item.title} — already curated`);
        skippedCurated++;
      }
    }
    if (batchCount >= 450) await commit();
  }
  await commit();

  console.log();
  console.log('=== Summary ===');
  console.log(`  Created:          ${created}`);
  console.log(`  Updated (stub):   ${updated}`);
  console.log(`  Skipped (curated):${skippedCurated}`);
}

main()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
