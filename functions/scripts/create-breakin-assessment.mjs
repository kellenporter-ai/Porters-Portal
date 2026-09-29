// One-off admin script: create "The Break-In: Evidence Types" assessment for
// the Forensic Science class. Mirrors the P.1 Lesson 2 Power Strip Model
// assessment (assignments/PhXRhByxaenib2iBcS8t) field-for-field.
//
// Shape: assignments/{autoId} + assignment_content/{sameId}, batch-written.
// 1 intro TEXT block + 4 SHORT_ANSWER blocks (acceptedAnswers: [] => needsReview,
// teacher-graded via rubric). Rubric: one question per response block, one skill
// per question, 5 tiers at 0/55/65/85/100 (same tier labels as Power Strip).
//
// Idempotent: aborts if an assignments doc with classType=='Forensic Science'
// AND title=='The Break-In: Evidence Types' already exists.
//
// Env: GOOGLE_APPLICATION_CREDENTIALS=/home/kp/Desktop/Executive Assistant/tools/service-account.json

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'porters-portal' });
const db = admin.firestore();

const TITLE = 'The Break-In: Evidence Types';
const CLASS_TYPE = 'Forensic Science';
const STORY_URL = 'https://porters-portal.web.app/the-break-in';

const now = new Date().toISOString();

// --- Lesson blocks -------------------------------------------------------
const introBlock = {
  id: '907593859931',
  type: 'TEXT',
  content:
    `Before starting this assessment, read the class story **The Break-In** first: ` +
    `[${STORY_URL}](${STORY_URL}). All four of your responses below must use ` +
    `examples from that story. Each response is worth 10 points and will be ` +
    `graded by hand against the rubric.`,
};

const RESPONSE_DEFS = [
  {
    blockId: '260430283573',
    qId: 'a7ncsms8ea',
    sId: '31m7r12x2d',
    label: 'Question 1: Individual Circumstantial Evidence',
    stem: '**Individual Circumstantial Evidence.** Give one plausible example of individual circumstantial evidence from The Break-In. In one or two sentences, explain why your example fits this evidence type.',
    skill: 'I am able to give a plausible example of individual circumstantial evidence from The Break-In and explain why it fits this evidence type.',
  },
  {
    blockId: '938897538013',
    qId: 'tbg5dh7u7g',
    sId: 'b6ejfc6d9l',
    label: 'Question 2: Class Circumstantial Evidence',
    stem: '**Class Circumstantial Evidence.** Give one plausible example of class circumstantial evidence from The Break-In. In one or two sentences, explain why your example fits this evidence type.',
    skill: 'I am able to give a plausible example of class circumstantial evidence from The Break-In and explain why it fits this evidence type.',
  },
  {
    blockId: '244878240395',
    qId: '6le14o7tgf',
    sId: '66v4eiiec8',
    label: 'Question 3: Individual Direct Evidence',
    stem: '**Individual Direct Evidence.** Give one plausible example of individual direct evidence from The Break-In. In one or two sentences, explain why your example fits this evidence type.',
    skill: 'I am able to give a plausible example of individual direct evidence from The Break-In and explain why it fits this evidence type.',
  },
  {
    blockId: '445279641410',
    qId: 'mcf9hwnwin',
    sId: 't8t2wrj3vi',
    label: 'Question 4: Class Direct Evidence',
    stem: '**Class Direct Evidence.** Give one plausible example of class direct evidence from The Break-In. In one or two sentences, explain why your example fits this evidence type.',
    skill: 'I am able to give a plausible example of class direct evidence from The Break-In and explain why it fits this evidence type.',
  },
];

const lessonBlocks = [
  introBlock,
  ...RESPONSE_DEFS.map((d) => ({
    id: d.blockId,
    type: 'SHORT_ANSWER',
    content: d.stem,
    acceptedAnswers: [],
  })),
];

// --- Rubric --------------------------------------------------------------
function makeTiers(thing) {
  return [
    {
      label: 'Missing',
      percentage: 0,
      descriptor: `There is no attempt to give an example of ${thing} or to explain how it fits this evidence type.`,
    },
    {
      label: 'Emerging',
      percentage: 55,
      descriptor: `There is an attempt at ${thing}, but the example given is not plausible for The Break-In, does not actually fit this evidence type, or is given with no explanation.`,
    },
    {
      label: 'Approaching',
      percentage: 65,
      descriptor: `A mostly fitting example of ${thing} is given, but the explanation of why it fits this evidence type is incomplete or partly inaccurate.`,
    },
    {
      label: 'Developing',
      percentage: 85,
      descriptor: `A fitting example of ${thing} is given with a solid explanation of why it fits this evidence type, but the explanation is vague or misses a key feature of the type.`,
    },
    {
      label: 'Refining',
      percentage: 100,
      descriptor: `A specific, plausible example of ${thing} from The Break-In is given, with a clear and accurate explanation of why it fits this evidence type.`,
    },
  ];
}

const RUBRIC_TITLE = 'The Break-In: Evidence Types Rubric';
const THINGS = [
  'individual circumstantial evidence',
  'class circumstantial evidence',
  'individual direct evidence',
  'class direct evidence',
];

const rubricQuestions = RESPONSE_DEFS.map((d, i) => ({
  id: d.qId,
  questionLabel: d.label,
  skills: [
    {
      id: d.sId,
      skillText: d.skill,
      tiers: makeTiers(THINGS[i]),
    },
  ],
}));

const rawMarkdown =
  `# ${RUBRIC_TITLE}\n\n` +
  RESPONSE_DEFS.map((d, i) => {
    const t = makeTiers(THINGS[i]);
    return (
      `## ${d.label}\n` +
      `| Skill | ${t.map((x) => x.label).join(' | ')} |\n` +
      `| --- | --- |\n` +
      `| ${d.skill} | ${t.map((x) => x.descriptor).join(' | ')} |`
    );
  }).join('\n\n');

const rubric = { title: RUBRIC_TITLE, questions: rubricQuestions, rawMarkdown };

// --- Assignment doc ------------------------------------------------------
const assignmentDoc = {
  title: TITLE,
  description:
    'Read The Break-In story, then give one plausible example of each evidence type from the story — individual circumstantial, class circumstantial, individual direct, and class direct — and explain why each fits. Four short responses, 10 points each, teacher-graded with a rubric.',
  classType: CLASS_TYPE,
  status: 'ACTIVE',
  unit: null,
  category: 'Lesson',
  contentUrl: null,
  resources: [],
  publicComments: [],
  dueDate: null,
  scheduledAt: null,
  targetSections: [],
  blockCount: lessonBlocks.length,
  isAssessment: true,
  assessmentConfig: {
    allowResubmission: true,
    maxAttempts: 0,
    showScoreOnSubmit: false,
    lockNavigation: true,
    allowStudyMaterial: true,
  },
  rubric,
  createdAt: now,
  updatedAt: now,
};

const contentDoc = {
  htmlContent: '',
  lessonBlocks,
  updatedAt: now,
};

// --- Main ----------------------------------------------------------------
async function main() {
  const existing = await db
    .collection('assignments')
    .where('classType', '==', CLASS_TYPE)
    .where('title', '==', TITLE)
    .get();

  if (!existing.empty) {
    console.log(
      `ABORT: already exists (${existing.size} doc(s)): ${existing.docs
        .map((d) => d.id)
        .join(', ')}`
    );
    process.exit(0);
  }

  const ref = db.collection('assignments').doc(); // auto-id
  const batch = db.batch();
  batch.set(ref, assignmentDoc);
  batch.set(db.collection('assignment_content').doc(ref.id), contentDoc);
  await batch.commit();

  console.log(`CREATED assignment doc id: ${ref.id}`);
  console.log(`CREATED content doc id:    ${ref.id} (assignment_content)`);
  console.log(`Blocks: ${lessonBlocks.length} (1 TEXT intro + ${RESPONSE_DEFS.length} SHORT_ANSWER x 10 pts = 40 pts)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
