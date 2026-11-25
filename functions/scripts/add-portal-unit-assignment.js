#!/usr/bin/env node
/**
 * add-portal-unit-assignment.js
 *
 * Add a deployed Portal resource to a class UNIT in the lesson-editor sidebar.
 *
 * WHY THIS EXISTS
 * ---------------
 * A Portal class unit does NOT list `library_items`. It lists `assignments`
 * docs, filtered client-side by `classType` and grouped by the doc's own `unit`
 * string. `class_configs.resourceOrder[unit]` only SORTS what the assignment
 * list already contains. Writing a library_items doc (or an id into
 * resourceOrder) adds nothing to the sidebar, which is a silent no-op that
 * looks like a successful seed.
 *
 * Usage:
 *   node scripts/add-portal-unit-assignment.js \
 *     --title "Predict Your Hair Rubric" \
 *     --url "/predict-your-hair-rubric.html" \
 *     --class "Forensic Science" \
 *     --unit "Rubrics" \
 *     [--category Supplemental] \
 *     [--description "..."] \
 *     [--status ACTIVE] \
 *     [--dry-run]
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 * Exit: 0 ok/skip, 1 error
 */

const admin = require('firebase-admin');

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const has = (name) => args.includes(`--${name}`);

const TITLE = flag('title');
const URL = flag('url');
const CLASS = flag('class');
const UNIT = flag('unit');
const CATEGORY = flag('category', 'Supplemental');
const DESCRIPTION = flag('description', '');
const STATUS = flag('status', 'ACTIVE');
const DRY_RUN = has('dry-run');

if (!TITLE || !URL || !CLASS || !UNIT) {
  console.error(
    'ERROR: --title, --url, --class and --unit are required.\n' +
      'Example: --title "X Rubric" --url "/x-rubric.html" --class "Forensic Science" --unit "Rubrics"'
  );
  process.exit(1);
}

// Closed enums: off-enum values render BLANK in the UI.
const CATEGORIES = ['Lesson', 'Lab', 'Simulation', 'Practice', 'Supplemental', 'Activity'];
if (!CATEGORIES.includes(CATEGORY)) {
  console.error(`ERROR: --category must be one of ${CATEGORIES.join(', ')} (got "${CATEGORY}")`);
  process.exit(1);
}
const STATUSES = ['ACTIVE', 'DRAFT', 'ARCHIVED'];
if (!STATUSES.includes(STATUS)) {
  console.error(`ERROR: --status must be one of ${STATUSES.join(', ')} (got "${STATUS}")`);
  process.exit(1);
}

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'porters-portal',
  storageBucket: 'porters-portal.firebasestorage.app',
});
const db = admin.firestore();

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`Target: assignments where unit=="${UNIT}" && classType=="${CLASS}"`);

  // Mirror the reader's query exactly: the UI fetches by unit, then filters by classType.
  const snap = await db.collection('assignments').where('unit', '==', UNIT).get();
  const inUnit = snap.docs.filter((d) => (d.data() || {}).classType === CLASS);
  console.log(`  current ${CLASS} / ${UNIT} assignments: ${inUnit.length}`);
  inUnit.forEach((d) => console.log(`    - ${d.id}: ${d.data().title}`));

  // Idempotent by contentUrl within this class+unit.
  const dupe = inUnit.find((d) => (d.data() || {}).contentUrl === URL);
  if (dupe) {
    console.log(`  [SKIP] already present as ${dupe.id} ("${dupe.data().title}")`);
    return;
  }

  const now = new Date().toISOString();
  const doc = {
    title: TITLE,
    description: DESCRIPTION,
    classType: CLASS,
    unit: UNIT,
    category: CATEGORY,
    contentUrl: URL,
    resources: [],
    publicComments: [],
    dueDate: null,
    targetSections: [],
    scheduledAt: null,
    blockCount: 0,
    isAssessment: false,
    assessmentConfig: null,
    rubric: null,
    status: STATUS,
  };

  if (DRY_RUN) {
    console.log(`  [WOULD CREATE] assignments <- "${TITLE}" (${CLASS} / ${UNIT})`);
    return;
  }

  const ref = await db.collection('assignments').add({ ...doc, createdAt: now, updatedAt: now });
  console.log(`  [OK] created assignments/${ref.id}`);

  // Verify through the reader, not from the write result.
  const verify = await db.collection('assignments').where('unit', '==', UNIT).get();
  const nowIn = verify.docs.filter((d) => (d.data() || {}).classType === CLASS);
  const seen = nowIn.find((d) => d.id === ref.id);
  console.log(`  [VERIFY] ${CLASS} / ${UNIT} now holds ${nowIn.length}; new doc visible: ${!!seen}`);
  if (!seen) {
    console.error('  ERROR: doc not visible through the sidebar query. Investigate before reporting success.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
