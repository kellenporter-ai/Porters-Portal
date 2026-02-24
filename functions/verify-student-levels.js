/**
 * Verify & fix student levels after XP bracket rebalance
 *
 * Reads every student from Firestore, recomputes their level from
 * gamification.xp using the current tiered bracket system, and reports
 * any mismatches.  With --apply it writes the corrected levels back.
 *
 * USAGE
 * -----
 * Dry run (read-only, shows mismatches):
 *   node verify-student-levels.js
 *
 * Live run (writes corrected levels to Firestore):
 *   node verify-student-levels.js --apply
 *
 * With explicit service account key:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node verify-student-levels.js --apply
 */

const admin = require('firebase-admin');

const DRY_RUN = !process.argv.includes('--apply');
const BATCH_SIZE = 400;

// ── Init ──────────────────────────────────────────────────────────────────────

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'porters-portal',
  });
}

const db = admin.firestore();

// ── XP Bracket System (must match server-side & client-side) ─────────────────

const MAX_LEVEL = 500;

const XP_BRACKETS = [
  [50, 1000],
  [200, 2000],
  [350, 3000],
  [450, 4000],
  [500, 5000],
];

function levelForXp(xp) {
  if (xp <= 0) return 1;
  let remaining = xp;
  let currentLevel = 1;
  let prevCap = 0;
  for (const [cap, xpPer] of XP_BRACKETS) {
    const levelsInBracket = cap - prevCap;
    const xpForBracket = levelsInBracket * xpPer;
    if (remaining < xpForBracket) {
      currentLevel += Math.floor(remaining / xpPer);
      return Math.min(currentLevel, MAX_LEVEL);
    }
    remaining -= xpForBracket;
    currentLevel += levelsInBracket;
    prevCap = cap;
  }
  return MAX_LEVEL;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Student Level Verification (${DRY_RUN ? 'DRY RUN — no writes' : 'LIVE — writing to Firestore'}) ===\n`);

  const snapshot = await db.collection('users')
    .where('role', '==', 'STUDENT')
    .get();

  console.log(`Found ${snapshot.size} student documents.\n`);

  const mismatched = [];
  let correctCount = 0;
  let noXpCount = 0;
  let noGamificationCount = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    const gam = data.gamification;

    if (!gam) {
      noGamificationCount++;
      return;
    }

    const totalXp = gam.xp || 0;
    const storedLevel = gam.level || 1;

    if (totalXp === 0 && storedLevel <= 1) {
      noXpCount++;
      return;
    }

    const expectedLevel = levelForXp(totalXp);

    if (storedLevel === expectedLevel) {
      correctCount++;
    } else {
      mismatched.push({
        ref: doc.ref,
        name: data.name || data.displayName || doc.id,
        email: data.email || '',
        totalXp,
        storedLevel,
        expectedLevel,
        diff: expectedLevel - storedLevel,
      });
    }
  });

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('Results:');
  console.log(`  ${correctCount} students have correct levels`);
  console.log(`  ${mismatched.length} students have MISMATCHED levels`);
  console.log(`  ${noXpCount} students with zero XP (skipped)`);
  console.log(`  ${noGamificationCount} students with no gamification data (skipped)`);
  console.log('');

  if (mismatched.length === 0) {
    console.log('All student levels are aligned with the tiered XP bracket system!');
    return;
  }

  // Sort by biggest discrepancy first
  mismatched.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log('Mismatched students:');
  console.log('─'.repeat(100));
  console.log(
    'Name'.padEnd(30) +
    'XP'.padStart(10) +
    'Stored Lvl'.padStart(12) +
    'Expected Lvl'.padStart(14) +
    'Diff'.padStart(8)
  );
  console.log('─'.repeat(100));

  mismatched.forEach(m => {
    const diffStr = m.diff > 0 ? `+${m.diff}` : `${m.diff}`;
    console.log(
      m.name.substring(0, 29).padEnd(30) +
      String(m.totalXp).padStart(10) +
      String(m.storedLevel).padStart(12) +
      String(m.expectedLevel).padStart(14) +
      diffStr.padStart(8)
    );
  });

  console.log('─'.repeat(100));
  console.log(`\nTotal mismatched: ${mismatched.length}\n`);

  if (DRY_RUN) {
    console.log('Dry run complete. Re-run with --apply to fix mismatched levels.\n');
    return;
  }

  // ── Write fixes ────────────────────────────────────────────────────────────

  console.log(`Writing ${mismatched.length} level corrections in batches of ${BATCH_SIZE}...`);
  let written = 0;

  for (let i = 0; i < mismatched.length; i += BATCH_SIZE) {
    const chunk = mismatched.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    chunk.forEach(({ ref, expectedLevel }) => {
      batch.update(ref, {
        'gamification.level': expectedLevel,
      });
    });

    await batch.commit();
    written += chunk.length;
    console.log(`  Committed batch: ${written}/${mismatched.length}`);
  }

  console.log(`\nDone. ${written} student levels corrected.\n`);
}

main().catch(err => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
