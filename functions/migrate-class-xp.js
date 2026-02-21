/**
 * One-time migration: sync gamification.classXp for single-class students
 *
 * For every student whose total gamification.xp exceeds their classXp for
 * their only enrolled class, this script sets:
 *   classXp[class] = gamification.xp
 *
 * Multi-class students are SKIPPED — their XP is genuinely distributed
 * across classes and cannot be reconciled without per-source audit logs.
 *
 * USAGE
 * -----
 * Dry run (no writes):
 *   node migrate-class-xp.js
 *
 * Live run (writes to Firestore):
 *   node migrate-class-xp.js --apply
 *
 * With explicit service account key:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node migrate-class-xp.js --apply
 *
 * Or use Application Default Credentials (already authenticated via `firebase login`):
 *   node migrate-class-xp.js --apply
 */

const admin = require('firebase-admin');

const DRY_RUN = !process.argv.includes('--apply');
const BATCH_SIZE = 400; // Firestore max is 500; leave headroom

// ── Init ──────────────────────────────────────────────────────────────────────

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'porters-portal',
  });
}

const db = admin.firestore();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEnrolledClasses(data) {
  if (data.enrolledClasses && data.enrolledClasses.length > 0) {
    return data.enrolledClasses;
  }
  if (data.classType) {
    return [data.classType];
  }
  return [];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== classXp migration (${DRY_RUN ? 'DRY RUN — no writes' : 'LIVE — writing to Firestore'}) ===\n`);

  const snapshot = await db.collection('users')
    .where('role', '==', 'STUDENT')
    .get();

  console.log(`Found ${snapshot.size} student documents.\n`);

  const toUpdate = []; // { ref, classType, currentClassXp, totalXp }

  let skippedMultiClass = 0;
  let skippedAlreadyCorrect = 0;
  let skippedNoClass = 0;
  let skippedNoXp = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    const gam = data.gamification || {};
    const totalXp = gam.xp || 0;
    const classXpMap = gam.classXp || {};
    const classes = getEnrolledClasses(data);

    if (classes.length === 0) {
      skippedNoClass++;
      return;
    }

    if (classes.length > 1) {
      skippedMultiClass++;
      return;
    }

    if (totalXp === 0) {
      skippedNoXp++;
      return;
    }

    const singleClass = classes[0];
    const currentClassXp = classXpMap[singleClass] || 0;

    if (currentClassXp >= totalXp) {
      skippedAlreadyCorrect++;
      return;
    }

    toUpdate.push({
      ref: doc.ref,
      name: data.name || doc.id,
      classType: singleClass,
      currentClassXp,
      totalXp,
      gain: totalXp - currentClassXp,
    });
  });

  console.log(`Skipped:`);
  console.log(`  ${skippedMultiClass} multi-class students (cannot auto-reconcile)`);
  console.log(`  ${skippedAlreadyCorrect} already correct (classXp >= totalXp)`);
  console.log(`  ${skippedNoClass} no class assigned`);
  console.log(`  ${skippedNoXp} zero XP`);
  console.log(`\nTo update: ${toUpdate.length} students\n`);

  if (toUpdate.length === 0) {
    console.log('Nothing to do. Exiting.');
    return;
  }

  // Print preview
  console.log('Preview (first 20):');
  toUpdate.slice(0, 20).forEach(u => {
    console.log(`  ${u.name.padEnd(40)} [${u.classType}]  classXp ${u.currentClassXp} → ${u.totalXp}  (+${u.gain})`);
  });
  if (toUpdate.length > 20) {
    console.log(`  ... and ${toUpdate.length - 20} more`);
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. Re-run with --apply to write changes.');
    return;
  }

  // Write in batches
  console.log(`\nWriting ${toUpdate.length} updates in batches of ${BATCH_SIZE}...`);
  let written = 0;

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    chunk.forEach(({ ref, classType, totalXp }) => {
      batch.update(ref, {
        [`gamification.classXp.${classType}`]: totalXp,
      });
    });

    await batch.commit();
    written += chunk.length;
    console.log(`  Committed batch: ${written}/${toUpdate.length}`);
  }

  console.log(`\nDone. ${written} students updated.`);
}

main().catch(err => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
