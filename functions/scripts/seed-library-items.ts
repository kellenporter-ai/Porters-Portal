// Run: cd functions && npx ts-node scripts/seed-library-items.ts [--dry-run]
//
// One-time seed for the Hosted Content Library: upserts the 7 known hosted
// pages with starter metadata. Idempotent — matches by sourceFingerprint and
// never overwrites curated fields (title/description/tags/subject) once set.

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

admin.initializeApp();
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

interface SeedItem {
  title: string;
  description: string;
  url: string;
  hostingType: 'bundled' | 'storage' | 'external';
  contentKind: 'activity' | 'tool' | 'textbook' | 'deck' | 'document' | 'utility';
  subject?: string;
  tags: string[];
  suggestedCategory: 'Lesson' | 'Lab' | 'Simulation' | 'Practice' | 'Supplemental';
  sourceFingerprint: string;
}

const SEED_ITEMS: SeedItem[] = [
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
    title: 'Force Diagram Tool',
    description: 'Free-body / force diagram drawing tool.',
    url: '/tools/force-diagram',
    hostingType: 'bundled',
    contentKind: 'tool',
    subject: 'Honors Physics',
    tags: ['forces', 'free-body-diagram'],
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
    title: 'Types of Evidence: Direct vs Circumstantial, Class vs Individual',
    description: 'Interactive bilingual (EN/ES) reference for the quarter exam. Splits evidence classification into two independent questions with illustrated examples: how evidence proves (direct vs circumstantial) and how many sources it can come from (class vs individual). Includes the four combinations, a 20-item commit-then-check classifier, and a 20-item review bank with reasoning for every item.',
    url: '/evidence-types',
    hostingType: 'bundled',
    contentKind: 'activity',
    subject: 'Forensic Science',
    tags: ['forensic-science', 'evidence-types', 'evidence-classification', 'quarter-review', 'bilingual', 'activity'],
    suggestedCategory: 'Supplemental',
    sourceFingerprint: '/evidence-types/index.html',
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
