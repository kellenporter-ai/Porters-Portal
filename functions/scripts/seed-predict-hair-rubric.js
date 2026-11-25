// Seed the Predict Your Hair rubric as a library item and attach it to the
// Rubrics unit of the Forensic Science class ONLY.
// Idempotent: matches by url. Run with --dry-run first.
//
// Run: node scripts/seed-predict-hair-rubric.js [--dry-run]
// Env: GOOGLE_APPLICATION_CREDENTIALS=/home/kp/Desktop/Executive Assistant/tools/service-account.json

const admin = require('firebase-admin');

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'porters-portal',
  storageBucket: 'porters-portal.firebasestorage.app',
});
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const CLASS = 'Forensic Science';
const UNIT = 'Rubrics';
const URL = '/predict-your-hair-rubric.html';

const ITEM = {
  url: URL,
  hostingType: 'bundled',
  contentKind: 'document',
  subject: 'Forensic Science',
  suggestedCategory: 'Supplemental',
  status: 'active',
  sourceFingerprint: URL,
  title: 'Predict Your Hair Rubric',
  description:
    'Student-facing grading rubric for the Predict Your Hair wrap-up, where each student draws two views of ' +
    'their own hair, a cross section and a longitudinal view, labels the cuticle, cortex, and medulla on both, ' +
    'then defends the drawing feature by feature on the back of the sheet. Four skills are scored on the ' +
    '0/55/65/85/100 ladder: the drawing itself, whether the written prediction matches what was actually drawn, ' +
    'the quality of the evidence used per feature, and how honestly the student handles any conflict between ' +
    'their natural texture and what dye, heat, or product did to the hair. Nothing is graded on whether the ' +
    'prediction is true, so a student with treated hair scores high for observing accurately instead of being ' +
    'penalised for a drawing that does not match the reference table. Pairs with the Hair Analysis Lab, the ' +
    'Cuticle and Ovality Lab, and the Hair Who game in the same Hair and Fiber unit. Bilingual EN/ES.',
  tags: [
    'forensic-science',
    'rubric',
    'hair',
    'hair-and-fiber',
    'assessment',
    'grading',
    'medulla',
    'cuticle',
    'ovality',
    'bilingual',
    'unit-wrap-up',
    'supplemental',
  ],
  untagged: false,
};

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);

  // 1. Idempotent upsert of the library item, matched by url.
  const existing = await db.collection('library_items').where('url', '==', URL).get();
  let itemId;
  if (existing.empty) {
    console.log(`  [CREATE] library_items <- "${ITEM.title}"`);
    if (DRY_RUN) {
      itemId = '(new id)';
    } else {
      const ref = await db.collection('library_items').add({
        ...ITEM,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      itemId = ref.id;
      console.log(`  [OK] created ${itemId}`);
    }
  } else {
    itemId = existing.docs[0].id;
    console.log(`  [UPDATE] library_items/${itemId} <- refresh fields`);
    if (!DRY_RUN) {
      await db.collection('library_items').doc(itemId).update({
        ...ITEM,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`  [OK] updated ${itemId}`);
    }
  }

  // 2. Attach to the Rubrics unit of the Forensic Science class only.
  const classRef = db.collection('class_configs').doc(CLASS);
  const snap = await classRef.get();
  if (!snap.exists) throw new Error(`class_configs/${CLASS} does not exist`);

  const data = snap.data() || {};
  const unitOrder = Array.isArray(data.unitOrder) ? data.unitOrder : [];
  const resourceOrder =
    data.resourceOrder && typeof data.resourceOrder === 'object' ? data.resourceOrder : {};
  const current = Array.isArray(resourceOrder[UNIT]) ? resourceOrder[UNIT] : [];

  console.log(`  ${CLASS} unitOrder has "${UNIT}": ${unitOrder.includes(UNIT)}`);
  console.log(`  ${CLASS} ${UNIT} unit currently holds ${current.length} item(s)`);

  if (DRY_RUN) {
    console.log(`  [WOULD ATTACH] ${itemId} -> class_configs/${CLASS}.resourceOrder["${UNIT}"]`);
    return;
  }

  if (!itemId) return;
  if (current.includes(itemId)) {
    console.log(`  [SKIP] already attached`);
    return;
  }

  const updates = {};
  if (!unitOrder.includes(UNIT)) updates.unitOrder = [...unitOrder, UNIT];
  updates[`resourceOrder.${UNIT}`] = [...current, itemId];
  await classRef.update(updates);
  console.log(`  [OK] attached ${itemId} to ${CLASS} / ${UNIT} (${current.length} -> ${current.length + 1})`);
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
