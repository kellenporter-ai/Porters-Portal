// Publish "Energy Doesn't Travel in the Wires" to the Physics class, Energy Flow
// from Earth's Systems unit, pinned FIRST for students.
//
// ARCHITECTURE NOTE (learned the hard way): class_configs/<Class>.resourceOrder
// holds ASSIGNMENT ids, not library_items ids. library_items is the catalog the
// library browser reads; assignments is what students see in a class unit list.
// Creating only a library item leaves the unit list unchanged.
//
//   questionnaire : status ACTIVE  -> visible to students today
//   wire sim      : status DRAFT   -> hidden from students until taught
//
// Idempotent: assignments are matched by contentUrl within classType+unit, and
// the unit order is rebuilt positionally so a re-run cannot duplicate.
//
// Run: node scripts/seed-energy-flow-questionnaire.js [--dry-run]
// Env: GOOGLE_APPLICATION_CREDENTIALS=/home/kp/Desktop/Executive Assistant/tools/service-account.json

const admin = require('firebase-admin');

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'porters-portal',
  storageBucket: 'porters-portal.firebasestorage.app',
});
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const DRY_RUN = process.argv.includes('--dry-run');
const CLASS = 'Physics';
const UNIT = "Energy Flow from Earth's Systems";

const QUESTIONNAIRE = {
  title: "Energy Doesn't Travel in the Wires: Video Questionnaire",
  contentUrl: '/energy-flow-questionnaire',
  category: 'Activity',
  status: 'ACTIVE',
  description:
    'Guided viewing questionnaire for the Veritasium video "The Biggest Misconception About Electricity" ' +
    '(about 14 min). Open it before the video starts, put your name in, and read all seven questions first. ' +
    'Then answer each one at the moment the video reaches that idea. The questions follow the argument in ' +
    'order: predict how long a bulb takes to light in a circuit whose wires are 300,000 km long but sits only ' +
    'one meter from the battery, name the two fields that must be present together for energy to flow at all, ' +
    'explain why a disconnected battery has an electric field yet delivers no energy, describe what the surface ' +
    'charges on the wires actually do, compare the crawling drift speed of electrons against the near ' +
    'light-speed arrival of the energy and say who is really carrying it, locate where in the circuit the ' +
    'energy travels, and finally state the video answer and explain why the length of the wires barely matters ' +
    'while the distance to the bulb does. Work saves on its own as you type, so a closed tab cannot lose it. ' +
    'Turn in a PDF and attach it to the Google Classroom assignment. Nothing is marked right or wrong. ' +
    'Bilingual EN/ES. Pairs with the Power Line Lab in the same unit.',
};

const WIRE_SIM = {
  title: 'Power Line Lab: AC & DC in a Transmission Wire',
  contentUrl: '/power-line-lab',
  category: 'Lab',
  status: 'DRAFT',
  description:
    'Discovery simulation for OpenSciEd P.1 Lesson 6. Trace free electrons through a 120 V transmission ' +
    'circuit into a city block, flip polarity, close switches, and switch between DC and AC generators to ' +
    'compare electron drift. Vary the wire material, diameter, length, and ambient temperature and watch ' +
    'resistance change the current, the percent energy loss, and how hot the wire runs. At the coldest ' +
    'setting a ceramic (YBCO) wire becomes superconducting and the resistance vanishes. Answer the prompts ' +
    'in the Evidence Journal, then build a mechanistic hypothesis. Follow-up to the Energy Does Not Travel ' +
    'in the Wires video questionnaire. Bilingual EN/ES.',
};

async function findAssignment(contentUrl) {
  const snap = await db
    .collection('assignments')
    .where('classType', '==', CLASS)
    .where('unit', '==', UNIT)
    .where('contentUrl', '==', contentUrl)
    .get();
  return snap.empty ? null : snap.docs[0];
}

async function ensureAssignment(spec) {
  const existing = await findAssignment(spec.contentUrl);
  if (existing) {
    const cur = existing.data() || {};
    console.log(`  [UPDATE] assignments/${existing.id} "${spec.title}"`);
    if (cur.status !== spec.status) {
      console.log(`           status ${cur.status} -> ${spec.status}`);
    }
    if (!DRY_RUN) {
      await existing.ref.update({
        title: spec.title,
        contentUrl: spec.contentUrl,
        category: spec.category,
        status: spec.status,
        description: spec.description,
        classType: CLASS,
        unit: UNIT,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return existing.id;
  }
  console.log(`  [CREATE] assignments <- "${spec.title}" (${spec.status})`);
  if (DRY_RUN) return `(new:${spec.category})`;
  const ref = await db.collection('assignments').add({
    title: spec.title,
    description: spec.description,
    classType: CLASS,
    unit: UNIT,
    category: spec.category,
    contentUrl: spec.contentUrl,
    resources: [],
    publicComments: [],
    dueDate: null,
    targetSections: [],
    scheduledAt: null,
    blockCount: 0,
    isAssessment: false,
    assessmentConfig: null,
    rubric: null,
    status: spec.status,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log(`           created ${ref.id}`);
  return ref.id;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`Target: assignments / ${CLASS} / "${UNIT}"`);

  const classRef = db.collection('class_configs').doc(CLASS);
  const classSnap = await classRef.get();
  if (!classSnap.exists) throw new Error(`class_configs/${CLASS} does not exist`);
  const classData = classSnap.data() || {};
  const resourceOrder =
    classData.resourceOrder && typeof classData.resourceOrder === 'object'
      ? classData.resourceOrder
      : {};
  const current = Array.isArray(resourceOrder[UNIT]) ? resourceOrder[UNIT] : [];
  console.log(`  unit currently holds ${current.length} assignment ref(s)`);

  const qId = await ensureAssignment(QUESTIONNAIRE);
  const simId = await ensureAssignment(WIRE_SIM);

  // Questionnaire first, wire sim next, then everything that was already there.
  const desired = [];
  const push = (id) => { if (id && !desired.includes(id)) desired.push(id); };
  push(qId);
  push(simId);
  for (const id of current) if (id !== simId && id !== qId) push(id);

  const changed = desired.length !== current.length || desired.some((id, i) => id !== current[i]);
  if (!changed) {
    console.log('  [NOOP] unit order already correct');
    return;
  }
  console.log(`  [ORDER] ${current.length} -> ${desired.length} refs`);
  console.log(`          first three: ${desired.slice(0, 3).join(', ')}`);
  if (DRY_RUN) {
    console.log(`  [WOULD WRITE] class_configs/${CLASS}.resourceOrder["${UNIT}"]`);
    return;
  }
  await classRef.update({ [`resourceOrder.${UNIT}`]: desired });
  console.log(`  [OK] wrote resourceOrder["${UNIT}"]`);
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
