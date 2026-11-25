// Add the Predict Your Hair rubric to the Forensic Science Rubrics unit.
//
// The lesson-editor sidebar lists ASSIGNMENTS (filtered by classType, grouped by
// the doc's own `unit` field). resourceOrder only sorts. So the correct write is
// an `assignments` doc with unit:"Rubrics" and classType:"Forensic Science".
//
// Idempotent: matches by contentUrl within the Forensic Rubrics unit.
// Run: node scripts/add-predict-hair-rubric-assignment.js [--dry-run]

const admin = require('firebase-admin');

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'porters-portal',
  storageBucket: 'porters-portal.firebasestorage.app',
});
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const CLASS = 'Forensic Science';
const UNIT = 'Rubrics';
const CONTENT_URL = '/predict-your-hair-rubric.html';

const DOC = {
  title: 'Predict Your Hair Rubric',
  description:
    'Student-facing grading rubric for the Predict Your Hair wrap-up, where each student draws two views of ' +
    'their own hair, a cross section and a longitudinal view, labels the cuticle, cortex, and medulla on both, ' +
    'then defends the drawing feature by feature on the back of the sheet. Four skills are scored on the ' +
    '0/55/65/85/100 ladder: the drawing itself, whether the written prediction matches what was actually drawn, ' +
    'the quality of the evidence used per feature, and how honestly the student handles any conflict between ' +
    'their natural texture and what dye, heat, or product did to the hair. Nothing is graded on whether the ' +
    'prediction is true, so a student with treated hair scores high for observing accurately. Pairs with the ' +
    'Hair Analysis Lab, the Cuticle and Ovality Lab, and the Hair Who game. Bilingual EN/ES.',
  classType: CLASS,
  unit: UNIT,
  category: 'Supplemental',
  contentUrl: CONTENT_URL,
  resources: [],
  publicComments: [],
  dueDate: null,
  targetSections: [],
  scheduledAt: null,
  blockCount: 0,
  isAssessment: false,
  assessmentConfig: null,
  rubric: null,
  status: 'ACTIVE',
};

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`Target: assignments where classType=="${CLASS}" && unit=="${UNIT}"`);

  const snap = await db.collection('assignments').where('unit', '==', UNIT).get();
  const inUnit = snap.docs.filter((d) => (d.data() || {}).classType === CLASS);
  console.log(`  current ${CLASS} / ${UNIT} assignments: ${inUnit.length}`);
  inUnit.forEach((d) => console.log(`    - ${d.id}: ${d.data().title}`));

  const dupe = inUnit.find((d) => (d.data() || {}).contentUrl === CONTENT_URL);
  if (dupe) {
    console.log(`  [SKIP] already present as ${dupe.id}`);
    return;
  }

  if (DRY_RUN) {
    console.log(`  [WOULD CREATE] assignments <- "${DOC.title}" (${CLASS} / ${UNIT})`);
    return;
  }

  const ref = await db.collection('assignments').add({
    ...DOC,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  console.log(`  [OK] created assignments/${ref.id}`);
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
