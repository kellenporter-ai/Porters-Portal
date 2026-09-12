// Run: cd functions && npx ts-node scripts/seed-class-configs.ts [--dry-run]
//
// One-time seed for the Class Config Single Source of Truth migration
// (bd-class-config-migration.md, component 1). Upserts the 3 production
// classes into `class_configs` with the canonical defaults
// (leaderboard: true, bossFights: true, xpPerMinute: 10).
//
// Idempotent — matches by doc ID (= className). Never overwrites existing
// values: if a doc exists we only backfill keys that are entirely missing,
// preserving curated settings (ResourceSidebar may have lazy-created docs
// with non-canonical defaults like features.leaderboard: false).
//
//   GOOGLE_APPLICATION_CREDENTIALS="$HOME/key.json" \
//     npx ts-node scripts/seed-class-configs.ts --dry-run

import * as admin from 'firebase-admin';

// Explicit project/bucket — Admin SDK cannot resolve defaults outside the
// Functions runtime (same pattern as sweep-storage-duplicates.ts).
admin.initializeApp({
  projectId: 'porters-portal',
  storageBucket: 'porters-portal.firebasestorage.app',
});
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

const SEED_CLASSES = ['AP Physics', 'Honors Physics', 'Forensic Science'];

const CANONICAL = {
  features: { leaderboard: true, bossFights: true },
  xpPerMinute: 10,
};

async function main() {
  console.log('=== Seed class_configs ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log();

  const batch = db.batch();
  let batchCount = 0;
  let created = 0;
  let backfilled = 0;
  let untouched = 0;

  for (const className of SEED_CLASSES) {
    const ref = db.collection('class_configs').doc(className);
    const snap = await ref.get();

    if (!snap.exists) {
      console.log(`  [CREATE] ${className} -> ${JSON.stringify(CANONICAL)}`);
      if (!DRY_RUN) {
        batch.set(ref, {
          id: className,
          className,
          ...CANONICAL,
        });
        batchCount++;
      }
      created++;
      continue;
    }

    const data = snap.data() ?? {};
    // Backfill only keys that are entirely missing (key absent — not null),
    // preserving any existing curated value.
    const updates: Record<string, unknown> = {};
    if (data.features === undefined) {
      updates.features = CANONICAL.features;
    } else {
      const feat = data.features as Record<string, unknown>;
      if (feat.leaderboard === undefined) updates['features.leaderboard'] = true;
      if (feat.bossFights === undefined) updates['features.bossFights'] = true;
    }
    if (data.xpPerMinute === undefined) {
      updates.xpPerMinute = CANONICAL.xpPerMinute;
    }
    if (data.id === undefined) updates.id = className;
    if (data.className === undefined) updates.className = className;

    if (Object.keys(updates).length === 0) {
      console.log(
        `  [SKIP] ${className} — exists with fields ${JSON.stringify({
          features: data.features,
          xpPerMinute: data.xpPerMinute,
          id: data.id,
          className: data.className,
          unitOrder: data.unitOrder,
          resourceOrder: data.resourceOrder,
        })}`
      );
      untouched++;
    } else {
      console.log(`  [BACKFILL] ${className} — adding missing keys ${JSON.stringify(updates)} (existing values preserved)`);
      if (!DRY_RUN) {
        batch.update(ref, updates);
        batchCount++;
      }
      backfilled++;
    }
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
    console.log(`\nCommitted ${batchCount} write(s).`);
  }

  console.log();
  console.log('=== Summary ===');
  console.log(`  Created:    ${created}`);
  console.log(`  Backfilled: ${backfilled}`);
  console.log(`  Untouched:  ${untouched}`);
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
