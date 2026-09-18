// One-off admin script: add a "Rubrics" unit to every class_configs doc.
// Idempotent — skips docs that already have it. Data-only; no Portal code
// change (units are free-form strings in unitOrder/resourceOrder).
//
// Run: cd functions && npx ts-node scripts/add-rubrics-unit.ts [--dry-run]
// Env: GOOGLE_APPLICATION_CREDENTIALS=/home/kp/Desktop/Executive Assistant/tools/service-account.json

import * as admin from 'firebase-admin';

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'porters-portal',
  storageBucket: 'porters-portal.firebasestorage.app',
});
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const UNIT = 'Rubrics';

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);

  const snap = await db.collection('class_configs').get();
  if (snap.empty) {
    console.log('No class_configs docs found.');
    return;
  }

  for (const doc of snap.docs) {
    const data = doc.data() ?? {};
    const unitOrder: string[] = Array.isArray(data.unitOrder) ? data.unitOrder : [];
    const resourceOrder: Record<string, unknown> =
      data.resourceOrder && typeof data.resourceOrder === 'object'
        ? data.resourceOrder
        : {};

    const needsUnit = !unitOrder.includes(UNIT);
    const needsOrder = resourceOrder[UNIT] === undefined;

    if (!needsUnit && !needsOrder) {
      console.log(`  [SKIP] ${doc.id} already has "${UNIT}"`);
      continue;
    }

    const updates: Record<string, unknown> = {};
    if (needsUnit) updates.unitOrder = [...unitOrder, UNIT];
    if (needsOrder) updates.resourceOrder = { ...resourceOrder, [UNIT]: [] };

    console.log(
      `  [UPDATE] ${doc.id}: ${Object.keys(updates).join(', ')}` +
        (needsUnit ? ` (unitOrder ${unitOrder.length} -> ${unitOrder.length + 1})` : '')
    );
    if (!DRY_RUN) await doc.ref.update(updates);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
