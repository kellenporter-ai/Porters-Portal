// Run: cd functions && npx ts-node scripts/seed-library-items.ts [--dry-run] [--update-curated]
//
// One-time seed for the Hosted Content Library: upserts the known hosted
// pages with starter metadata. Idempotent — matches by sourceFingerprint and
// never overwrites curated fields (title/description/tags/subject) once set,
// UNLESS --update-curated is passed, which pushes the seed's metadata onto
// curated docs too (use when the curated copy itself needs correcting).

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

admin.initializeApp();
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const UPDATE_CURATED = process.argv.includes('--update-curated');

interface SeedItem {
  title: string;
  description: string;
  url: string;
  hostingType: 'bundled' | 'storage' | 'external';
  contentKind: 'activity' | 'tool' | 'textbook' | 'deck' | 'document' | 'utility';
  subject?: string;
  tags: string[];
  suggestedCategory: 'Lesson' | 'Lab' | 'Simulation' | 'Practice' | 'Supplemental' | 'Activity';
  sourceFingerprint: string;
}

const SEED_ITEMS: SeedItem[] = [
  {
    title: 'Minutiae Hunt',
    description:
      'A fingerprint word search: instead of hunting for hidden words, students hunt for hidden minutiae. ' +
      'A draggable magnifying glass gives a true 2.5x optical view of a procedurally drawn loop-pattern fingerprint, ' +
      'and students drag the lens across the ridges to find five ridge endings, five bifurcations, two short ridges, ' +
      'one island, one dot, and the delta, picking the matching tool for each. ' +
      'Every feature is a real topological feature of the drawn ridges, so a correct find is genuinely correct. ' +
      'Includes a per-type progress counter and a closing note that examiners compare minutiae by relative position, ' +
      'not by count. Pairs with the fingerprint collection card and the fingerprint minutiae lab.',
    url: '/minutiae-hunt',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'Forensic Science',
    tags: [
      'forensic-science',
      'fingerprints',
      'minutiae',
      'bilingual',
      'interactive',
      'activity',
      'magnifier',
      'ridge-patterns',
      'latent-prints',
      'observation',
    ],
    suggestedCategory: 'Activity',
    sourceFingerprint: '/minutiae-hunt.html',
  },
  {
    title: 'AP Physics 1 Semester Recap: Every Week From Course Setup Through Forces and Friction',
    description:
      'A running week-by-week record of everything AP Physics 1 did this semester, built so a student ' +
      'who was absent can catch up without asking, and so anyone can review before a test. ' +
      'Each week lists what the class actually did (the motion-mapping lab, the x-t ranking task, the linearization ladder, ' +
      'the three-period forces lab, the elevator and medicine ball models, the friction lab), ' +
      'three key ideas worth keeping, and the artifacts used that week. ' +
      'Weeks are numbered from week 0 and jump-linked, and the whole page toggles between English and Spanish. ' +
      'The current week shows as in progress rather than guessing, and any week whose detail was reconstructed from the unit sequence says so. ' +
      'Pairs with the Chapter 2 kinematics textbook, the linearization practice set, and the recitation recall set.',
    url: '/ap1-course-recap',
    hostingType: 'bundled',
    contentKind: 'document',
    subject: 'AP Physics 1',
    tags: [
      'ap-physics-1',
      'bilingual',
      'review',
      'quarter-review',
      'kinematics',
      'forces',
      'newtons-laws',
      'friction',
      'free-body-diagram',
      'reference',
    ],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/ap1-course-recap.html',
  },
  {
    title: 'CP and Honors Physics Semester Recap: Every Week From Course Setup Through Electrostatics',
    description:
      'A running week-by-week record of the physics course for periods 1, 7, and 9, so a student who ' +
      'was absent can catch up and anyone can review before a test. Each week lists what the class actually did, ' +
      'three key ideas worth keeping, and the artifacts used, following the OpenSciEd P.1 arc from the Texas blackout ' +
      'anchoring event through grid modeling, reliability, energy sources, generators, and the rubbing balloons electrostatics ' +
      'investigation. Weeks where Honors Physics moved faster or with less scaffolding carry a separate Honors note, ' +
      'so one page serves both levels honestly. Jumps are linked by week, the page toggles between English and Spanish, ' +
      'and weeks whose detail was reconstructed from the unit sequence say so. Pairs with the rubbing balloons lab guide, ' +
      'the Texas grid blackout simulation, and the generator investigations.',
    url: '/physics-course-recap',
    hostingType: 'bundled',
    contentKind: 'document',
    subject: 'Honors Physics',
    tags: [
      'physics',
      'honors-physics',
      'bilingual',
      'review',
      'quarter-review',
      'openscied',
      'electricity',
      'energy',
      'electrostatics',
      'circuits',
      'reference',
    ],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/physics-course-recap.html',
  },
  {
    title: 'Forensic Science Semester Recap: Every Week From Presumptive Testing Through the Minutiae Lab',
    description:
      'A running week-by-week record of everything Forensic Science did this semester, so a student who was absent ' +
      'can catch up and anyone can review before a test. Each week lists what the class actually did, including the ' +
      'presumptive testing reference key, the Home Visit witness investigation, the six-branch jigsaw, journal rubric ' +
      'calibration, the Break-In evidence case, the Seven S\'s and scene sketching, and the fingerprint and minutiae lab. ' +
      'Every week carries three key ideas worth keeping plus the artifacts used, runs in English and Spanish with a toggle, ' +
      'and is jump-linked by week. Weeks whose detail was reconstructed from the unit sequence are labeled rather than invented. ' +
      'Pairs with the Break-In case, Evidence Court, the minutiae lab deck, and the Seven S\'s scenario set.',
    url: '/forensic-science-course-recap',
    hostingType: 'bundled',
    contentKind: 'document',
    subject: 'Forensic Science',
    tags: [
      'forensic-science',
      'bilingual',
      'review',
      'quarter-review',
      'crime-scene',
      'evidence-types',
      'fingerprints',
      'minutiae',
      'the-break-in',
      'seven-s',
      'reference',
    ],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/forensic-science-course-recap.html',
  },
  {
    title: 'Circuit Diagram Builder',
    description: 'Interactive circuit construction tool — build and test series/parallel circuits.',
    url: '/circuit-diagram-builder',
    hostingType: 'bundled',
    contentKind: 'tool',
    subject: 'Honors Physics',
    tags: ['circuits', 'electricity', 'interactive'],
    suggestedCategory: 'Simulation',
    sourceFingerprint: '/circuit-diagram-builder.html',
  },
  {
    title: 'Electroscope Charge Assessment',
    description: 'Guided assessment on electrostatic charge and electroscope behavior.',
    url: '/electroscope-charge-assessment',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'AP Physics 1',
    tags: ['electrostatics', 'assessment'],
    suggestedCategory: 'Practice',
    sourceFingerprint: '/electroscope-charge-assessment.html',
  },
  {
    title: 'Bar Chart Tool',
    description: 'Simple bar chart builder for quick data visualization in class.',
    url: '/tools/bar-chart',
    hostingType: 'bundled',
    contentKind: 'tool',
    subject: 'General',
    tags: ['data', 'graphs'],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/tools/bar-chart.html',
  },
  {
    title: 'Free-Body Diagram Sandbox',
    description: 'Digital free-body diagram builder for AP Physics 1: pick a force type, drag arrows from the system dot, sketch the situation, draw the system boundary, and list the external objects. Sandbox, no grading.',
    url: '/tools/force-diagram',
    hostingType: 'bundled',
    contentKind: 'tool',
    subject: 'AP Physics 1',
    tags: ['forces', 'free-body-diagram', "newton's-laws", 'ap-physics-1', 'sandbox', 'sketch'],
    suggestedCategory: 'Simulation',
    sourceFingerprint: '/tools/force-diagram.html',
  },
  {
    title: 'Textbook: Ch 2 — Kinematics 1D',
    description: 'Interactive textbook chapter on one-dimensional kinematics.',
    url: '/textbook/ch2-kinematics-1d/',
    hostingType: 'bundled',
    contentKind: 'textbook',
    subject: 'AP Physics 1',
    tags: ['kinematics', 'textbook'],
    suggestedCategory: 'Lesson',
    sourceFingerprint: '/textbook/ch2-kinematics-1d/',
  },
  {
    title: 'Newton\'s Second Law Practice (Ch 3.5–3.7)',
    description: '20 free-response problems from College Physics (Etkina) Chapter 3 end-of-chapter problems 16-35: Newton\'s second law, the gravitational force law, and one-dimensional applications. Students write out their reasoning, reveal a worked model answer, and self-score with a 3-point rubric.',
    url: '/ap1-newtons-second-law-practice',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'AP Physics 1',
    tags: ['forces', 'newtons-second-law', 'practice', 'free-response'],
    suggestedCategory: 'Practice',
    sourceFingerprint: '/ap1-newtons-second-law-practice.html',
  },
  {
    title: 'The Break-In: Evidence Types Rubric',
    description: 'Student-facing grading rubric for The Break-In: Evidence Types assessment. Four skills, one per compound evidence type (individual circumstantial, class circumstantial, individual direct, class direct), each graded on the 5-tier ladder (0/55/65/85/100) with low-tier example responses. Bilingual EN/ES.',
    url: '/break-in-evidence-rubric.html',
    hostingType: 'bundled',
    contentKind: 'document',
    subject: 'Forensic Science',
    tags: ['forensic-science', 'rubric', 'evidence-types', 'assessment', 'grading', 'bilingual'],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/break-in-evidence-rubric.html',
  },
  {
    title: 'Crime Scene Sketch Practical Rubric',
    description: 'Student-facing grading rubric for the Sketch the Scene practical. Three skills: sketch components (header, legend, north arrow, labels, dimensions), scale and proportion, and locating two trace evidence items from non-movable reference points. 5-tier ladder (0/55/65/85/100). Bilingual EN/ES.',
    url: '/crime-scene-sketch-rubric.html',
    hostingType: 'bundled',
    contentKind: 'document',
    subject: 'Forensic Science',
    tags: ['forensic-science', 'rubric', 'crime-scene-sketch', 'assessment', 'grading', 'bilingual'],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/crime-scene-sketch-rubric.html',
  },
  {
    title: 'Types of Evidence: Direct, Circumstantial, Class, and Individual',
    description: 'Quarter exam review covering direct vs circumstantial evidence and class vs individual evidence. Explains the two questions separately, then shows the four combinations, with a 20-item sorting practice and a 20-item review bank. Includes eyewitness testimony, DNA, fingerprints, footwear, hair, ballistics, and blood type examples. Bilingual EN/ES.',
    url: '/evidence-types',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'Forensic Science',
    tags: ['forensic-science', 'evidence-types', 'evidence-classification', 'quarter-review', 'bilingual', 'activity', 'testimony', 'individual-evidence', 'class-evidence'],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/evidence-types/index.html',
  },
  {
    title: 'The 7 S\'s of Crime Scene Processing',
    description: 'Reference walkthrough of the seven S\'s of crime scene investigation: securing the scene, separating witnesses, scanning, seeing, sketching, searching, and securing evidence. Use it when you need the order of steps before you start a scene or a sketch.',
    url: '/seven-s/',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'Forensic Science',
    tags: ['forensic-science', 'crime-scene', 'seven-s', 'procedure', 'quarter-review', 'bilingual'],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/seven-s/',
  },
  {
    title: 'Power Line Lab: AC & DC in a Transmission Wire',
    description: 'Discovery simulation for OpenSciEd P.1 Lesson 6. Students explore how electrons move through a transmission wire with battery (DC) and generator (AC) sources, vary the wire material, diameter, length, and ambient temperature (down to absolute zero), record observations in an evidence journal, and write a mechanistic hypothesis. Print-ready export of journal + hypothesis. Bilingual EN/ES.',
    url: '/power-line-lab',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'Honors Physics',
    tags: ['openscied', 'p1', 'lesson-6', 'electricity', 'circuits', 'ac-dc', 'transmission-wire', 'resistance', 'energy-loss', 'simulation', 'lab', 'bilingual'],
    suggestedCategory: 'Lab',
    sourceFingerprint: '/power-line-lab.html',
  },
  {
    title: 'Privacy Policy',
    description: 'Porter\'s Portal privacy policy.',
    url: '/privacy',
    hostingType: 'bundled',
    contentKind: 'utility',
    tags: ['utility'],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/privacy.html',
  },
  {
    title: 'Generator Investigations Lab Guide',
    description: 'Bilingual interactive lab guide for OpenSciEd P.1 Lesson 5: six compass and iron filings investigations (generator at rest, slow vs fast spin, loose magnet, bare coil, coil with power supply, iron filings station). Students record observations, find patterns, sketch with vector tools, and build one big idea. Work autosaves on the device and exports to a PDF for Google Classroom. Includes a student self-check rubric.',
    url: '/generator-investigations',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'Honors Physics',
    tags: ['openscied', 'generators', 'magnetism', 'energy', 'lab', 'bilingual'],
    suggestedCategory: 'Lab',
    sourceFingerprint: '/generator-investigations.html',
  },
  {
    title: 'Rubbing Balloons: Seven Stations',
    description: 'Seven-station electrostatics investigation. Students rub balloons with fur, plastic, cloth, and hair; record whether each pair pulls together, pushes apart, or does nothing; sort all seven stations; and build one big idea from the patterns. English/Spanish toggle, autosaves locally, exports responses to PDF.',
    url: '/rubbing-balloons',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'Physics',
    tags: ['physics', 'electrostatics', 'openscied', 'stations', 'lab', 'bilingual', 'activity'],
    suggestedCategory: 'Lab',
    sourceFingerprint: '/rubbing-balloons.html',
  },
  {
    title: 'Electrostatic Rubbing: What Actually Moves Between the Materials',
    description:
      'Atomic-scale simulator for what rubbing does to a material. Two neutral atoms sit side by side and students choose a pair to rub, ' +
      'balloon against plastic or fur against balloon, then press RUB and watch three electrons leave one atom and arrive in the other. ' +
      'Nuclei stay put while electrons migrate, surplus electrons settle onto a third shell, and depleted valence slots remain behind as gaps in the orbit line, ' +
      'so which material gained electrons is something students see rather than read on a label. ' +
      'Only the two scenes ship, which keeps the complementary pair sharp: the same balloon turns negative against plastic and positive against fur. ' +
      'Pairs with the OpenSciEd P.1 rubbing balloons investigation as the microscopic follow-up to that lab\'s macro observations.',
    url: '/electrostatic-rubbing',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'Physics',
    tags: [
      'physics',
      'electrostatics',
      'charge',
      'atomic-model',
      'microscopic-model',
      'simulation',
      'openscied',
      'balloons',
      'friction',
      'activity',
    ],
    suggestedCategory: 'Simulation',
    sourceFingerprint: '/electrostatic-rubbing.html',
  },
  {
    title: 'AP Physics 1 Q1 Review',
    description: 'Quarter 1 review for AP Physics 1, covering Chapters 2 through 4 (kinematics, forces, Newton\'s laws, and vectors). Ten skills each get eight practice questions with instant per-distractor feedback, common-misconception notes, and mastery tracking. Ends with a fresh 30-question multiple-choice mock quarterly plus a five-part free response that students self-score against a checklist. Questions are new versions, not the quarter exam.',
    url: '/ap1-q1-review/',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'AP Physics 1',
    tags: ['ap-physics-1', 'quarter-review', 'kinematics', 'forces', 'newtons-laws', 'vectors', 'practice', 'mock-exam'],
    suggestedCategory: 'Practice',
    sourceFingerprint: '/ap1-q1-review/',
  },
  {
    title: 'Friction at the Contact: Static, Maximum Static, and Kinetic',
    description:
      'Microscopic contact simulator for friction. Students watch surface junctions stretch and hold as the applied force grows, reach their limit at maximum static friction, then break and reform once the block slides. Applied force and normal force are set independently on sliders, so students can probe whether the limit depends on how hard you pull or on how hard the surfaces are pressed together. A live force-versus-applied-force graph and the static and kinetic friction equations stay hidden behind toggles by default, so the pattern in Activity 4.3.3 stays student-owned rather than pre-revealed. Pairs with ALG Section 4.3 and Activities 4.3.3 through 4.3.5.',
    url: '/friction-lab',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'AP Physics 1',
    tags: [
      'ap-physics-1',
      'friction',
      'static-friction',
      'kinetic-friction',
      'maximum-static-friction',
      'normal-force',
      'newtons-laws',
      'forces',
      'microscopic-model',
      'simulation',
      'chapter-4',
      'algebra-based',
    ],
    suggestedCategory: 'Simulation',
    sourceFingerprint: '/friction-lab/index.html',
  },
  {
    title: 'Outage at the Waterfront',
    description: 'Two-stage review activity for Energy Flow from Earth\u2019s Systems. Students wire a power strip so unplugging any one device leaves the rest working, then build the path from a power plant to the clinic for coal, nuclear, hydro, and solar. Runs on Chromebooks with no teacher present and ends in a printable PDF permit students submit to Google Classroom.',
    url: '/outage-waterfront',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'Physics',
    tags: ['physics', 'energy', 'circuits', 'power-strip', 'generator', 'electricity', 'texas-blackout', 'openscied', 'bilingual', 'activity', 'review'],
    suggestedCategory: 'Activity',
    sourceFingerprint: '/outage-waterfront.html',
  },
  {
    title: 'Case File 0829 \u2014 Defense Suppression Audit',
    description: 'Five-part forensic review for What is Forensic Science? Students work a 1982 cold case as a defense auditor: sequence the scene log, route physical evidence to the right branch, run presumptive spot-plate tests on an unknown powder, compare latent prints, and commit findings on which evidence the defense would move to suppress and why. Bilingual, Chromebook-friendly, ends in a downloadable three-page suppression report for Google Classroom.',
    url: '/case-file-0829',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'Forensic Science',
    tags: ['forensic-science', 'evidence-types', 'crime-scene', 'seven-ss', 'chain-of-custody', 'latent-prints', 'fingerprints', 'presumptive-tests', 'powders', 'case-study', 'bilingual', 'activity', 'review'],
    suggestedCategory: 'Activity',
    sourceFingerprint: '/case-file-0829.html',
  },
  {
    title: 'Inclines, Pulley Systems, and Projectile Components: 90-Minute Recall Practice',
    description: 'A 90-minute AP Physics 1 recitation set that rebuilds momentum after a break: a 4-item warm-up, then 23 items across three stations. Students predict forces and motion for a block on an inclined plane with static and kinetic friction, work multi-block and Atwood pulley systems including a table-block-over-pulley setup and a tension comparison, then reason about velocity and acceleration components in two dimensions for projectile motion. Each item takes a committed answer before the student checks it, so it never spoils the reasoning: check returns targeted feedback naming the misconception behind every wrong option, and the full worked solution waits behind a second click. A summary screen groups results by topic across 17 topics such as Slant: static threshold and String: Atwood, recommends where to go next, and exports a name-stamped summary PDF per student as the turn-in artifact. Practice credit only, no scores, no timers, English only, and it pairs with the AP1 Forces Practice set, the Newton second law practice set, and the free-body diagram sandbox.',
    url: '/ap1-recitation-recall',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'AP Physics 1',
    tags: [
      'ap-physics-1',
      'forces',
      'practice',
      'friction',
      'newtons-laws',
      'free-body-diagram',
      'kinematics',
      'acceleration',
      'vectors',
      'newtonian-mechanics',
      'interactive',
      'stations',
      'review',
      'activity',
    ],
    suggestedCategory: 'Practice',
    sourceFingerprint: '/ap1-recitation-recall.html',
  },
  {
    title: 'Your Own Investigation: Full ISLE Cycle Extra Credit',
    description: 'A guided scientific-process project where each student picks a question they are genuinely curious about, in any field including psychology, social science, or their own life, and runs the complete ISLE cycle on it. Five tiers worth 2 points each map onto the nine ISLE steps: ask a question and design an observation, collect and analyze data in a five-row table, write a first crazy idea with the evidence that would disprove it, design a test and predict with that idea using a prediction lock, then run the test and re-evaluate the idea. Nothing locks, so a student who stops after tier 3 keeps 6 of 10 points, and a wrong conclusion still earns the final tier because the reasoning is what is scored. Each field carries its own length guidance, the placeholder names the shape of the answer without supplying content, and work autosaves with an EN/ES toggle. Exports a PDF with a cover page and a tier score block for Google Classroom submission. Pairs with the OpenSciEd P.1 energy unit and the rubbing balloons electrostatics investigation as a transfer task after those units close.',
    url: '/your-own-investigation',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'Physics',
    tags: [
      'physics',
      'honors-physics',
      'isle',
      'scientific-practices',
      'experimental-design',
      'data-analysis',
      'modeling',
      'argument-from-evidence',
      'extra-credit',
      'inquiry',
      'bilingual',
      'pdf-export',
      'autosave',
      'chromebook-friendly',
      'activity',
    ],
    suggestedCategory: 'Activity',
    sourceFingerprint: '/your-own-investigation.html',
  },
  {
    title: 'Forensic Lens Critique: Judge a Crime Show Like a Forensic Scientist',
    description: 'A marking period extra credit where a student takes a crime show or movie they already watch and turns it into a forensic case study, then judges it. Students identify what they watched with the season and episode when it is a series, then build up to four claim cards worth 2.5 points each. Every claim picks a side (done correctly or done incorrectly) and a lens from the three Marking Period 1 topics: evidence types, the seven S\'s of crime scene investigation, or fingerprints. Choosing a lens unlocks that lens\'s specific terms in a dropdown, so the claim is anchored to a named concept before a single sentence is written. Two writing boxes follow: what happened on screen and why it matches or violates the term, then a box that changes its question depending on the claim type, asking for the correct real-world protocol when the show got it wrong and for the consequence the investigator avoided when the show got it right. Submissions are modular, so one complete claim earns 2.5 points and a student with one good scene still submits and keeps it. A reference panel lists the terminology as a word bank with definitions hidden until a student chooses to reveal them, and the four-part rubric is on the page naming the specific failure that costs each level. A media choice warning steers students toward scenes that actually show scene or lab work rather than courtroom talk. Work autosaves, toggles EN/ES, and exports a PDF with name and period on every page. Pairs with the latent print lab, the evidence types page, and the seven S\'s review as the transfer task that closes out Marking Period 1.',
    url: '/forensic-lens-critique',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'Forensic Science',
    tags: [
      'forensic-science',
      'evidence-types',
      'seven-ss',
      'fingerprints',
      'latent-prints',
      'case-study',
      'critique',
      'extra-credit',
      'assessment',
      'grading',
      'rubric',
      'bilingual',
      'pdf-export',
      'autosave',
      'chromebook-friendly',
      'activity',
    ],
    suggestedCategory: 'Activity',
    sourceFingerprint: '/forensic-lens-critique.html',
  },
];

async function main() {
  console.log('=== Seed library_items ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log();

  const snap = await db.collection('library_items').get();
  const byFingerprint = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of snap.docs) {
    const fp = doc.data().sourceFingerprint;
    if (typeof fp === 'string') byFingerprint.set(fp, doc);
  }

  let batch = db.batch();
  let batchCount = 0;
  let created = 0;
  let updated = 0;
  let skippedCurated = 0;
  let recurated = 0;

  const commit = async () => {
    if (DRY_RUN || batchCount === 0) return;
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  };

  for (const item of SEED_ITEMS) {
    const existing = byFingerprint.get(item.sourceFingerprint);
    const base = {
      url: item.url,
      hostingType: item.hostingType,
      contentKind: item.contentKind,
      subject: item.subject ?? null,
      suggestedCategory: item.suggestedCategory,
      status: 'active',
      sourceFingerprint: item.sourceFingerprint,
    };

    if (!existing) {
      console.log(`  [CREATE] ${item.title} (${item.sourceFingerprint})`);
      if (!DRY_RUN) {
        const ref = db.collection('library_items').doc();
        batch.set(ref, {
          ...base,
          title: item.title,
          description: item.description,
          tags: item.tags,
          untagged: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        batchCount++;
      }
      created++;
    } else {
      const data = existing.data();
      if (data.untagged === true) {
        // Scan-created stub — fill in curated starter metadata.
        console.log(`  [UPDATE] ${item.title} (${item.sourceFingerprint})`);
        if (!DRY_RUN) {
          batch.update(existing.ref, {
            ...base,
            title: item.title,
            description: item.description,
            tags: item.tags,
            untagged: false,
            updatedAt: FieldValue.serverTimestamp(),
          });
          batchCount++;
        }
        updated++;
      } else if (UPDATE_CURATED) {
        // Explicitly asked to correct the curated copy (title/description/tags).
        console.log(`  [RECURATE] ${item.title} (${item.sourceFingerprint})`);
        if (!DRY_RUN) {
          batch.update(existing.ref, {
            ...base,
            title: item.title,
            description: item.description,
            tags: item.tags,
            updatedAt: FieldValue.serverTimestamp(),
          });
          batchCount++;
        }
        recurated++;
      } else {
        // Curated by hand — only backfill missing structural fields.
        console.log(`  [SKIP] ${item.title} — already curated`);
        skippedCurated++;
      }
    }
    if (batchCount >= 450) await commit();
  }
  await commit();

  console.log();
  console.log('=== Summary ===');
  console.log(`  Created:          ${created}`);
  console.log(`  Updated (stub):   ${updated}`);
  console.log(`  Recurated:        ${recurated}`);
  console.log(`  Skipped (curated):${skippedCurated}`);
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
