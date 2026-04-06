// Run: cd functions && npx ts-node ../scripts/backfill-classtype.ts [--dry-run]
//
// Backfills the `classType` field on submission documents by looking up
// each submission's assignmentId in the assignments collection.
// Safe: never overwrites an existing classType value.

import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_LIMIT = 500;

async function main() {
  console.log(`=== Backfill classType on submissions ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log();

  // Step 1: Build assignmentId -> classType map
  console.log('Fetching all assignments...');
  const assignmentSnap = await db.collection('assignments').get();
  const classTypeMap = new Map<string, string>();

  for (const doc of assignmentSnap.docs) {
    const data = doc.data();
    if (data.classType) {
      classTypeMap.set(doc.id, data.classType);
    }
  }
  console.log(`Found ${assignmentSnap.size} assignments (${classTypeMap.size} with classType)`);
  console.log();

  // Step 2: Fetch all submissions (full scan — Firestore can't query for missing fields)
  console.log('Fetching all submissions...');
  const submissionSnap = await db.collection('submissions').get();
  console.log(`Found ${submissionSnap.size} total submissions`);

  // Step 3: Filter to those missing classType and batch-update
  let processed = 0;
  let updated = 0;
  let skippedHasValue = 0;
  let noMatchingAssignment = 0;
  let errors = 0;

  let batch = db.batch();
  let batchCount = 0;

  for (const doc of submissionSnap.docs) {
    processed++;
    const data = doc.data();

    // Skip if classType already exists
    if (data.classType) {
      skippedHasValue++;
      continue;
    }

    const assignmentId = data.assignmentId;
    if (!assignmentId) {
      console.warn(`  [WARN] Submission ${doc.id} has no assignmentId — skipping`);
      errors++;
      continue;
    }

    const classType = classTypeMap.get(assignmentId);
    if (!classType) {
      noMatchingAssignment++;
      if (noMatchingAssignment <= 10) {
        console.warn(`  [WARN] No classType found for assignment ${assignmentId} (submission ${doc.id})`);
      }
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] Would set classType="${classType}" on submission ${doc.id} (assignment ${assignmentId})`);
    } else {
      batch.update(doc.ref, { classType });
      batchCount++;

      if (batchCount >= BATCH_LIMIT) {
        try {
          await batch.commit();
          console.log(`  Committed batch of ${batchCount} updates`);
        } catch (err) {
          console.error(`  [ERROR] Batch commit failed:`, err);
          errors++;
        }
        batch = db.batch();
        batchCount = 0;
      }
    }
    updated++;
  }

  // Commit remaining batch
  if (!DRY_RUN && batchCount > 0) {
    try {
      await batch.commit();
      console.log(`  Committed final batch of ${batchCount} updates`);
    } catch (err) {
      console.error(`  [ERROR] Final batch commit failed:`, err);
      errors++;
    }
  }

  if (noMatchingAssignment > 10) {
    console.warn(`  ... and ${noMatchingAssignment - 10} more submissions with no matching assignment`);
  }

  // Summary
  console.log();
  console.log('=== Summary ===');
  console.log(`  Total submissions scanned: ${processed}`);
  console.log(`  Already had classType:     ${skippedHasValue}`);
  console.log(`  Updated (${DRY_RUN ? 'would update' : 'wrote'}):  ${updated}`);
  console.log(`  No matching assignment:    ${noMatchingAssignment}`);
  console.log(`  Errors:                    ${errors}`);
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
