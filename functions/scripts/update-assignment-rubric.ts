// One-off admin script: replace the `rubric` field on a live assignments/{id}
// doc. Swaps the rubric on "P.1 Lesson 2 — Power Strip Model"
// (PhXRhByxaenib2iBcS8t), but written generically for reuse.
//
// SAFETY:
//   - Backup of the CURRENT rubric field is written to
//     functions/script-backups/ before any write. Non-negotiable.
//   - Touches ONLY `assignments/{id}` fields `rubric` + `updatedAt` via
//     update(). Never touches assignment_content/{id}, assignment_keys/{id},
//     or any other field/collection.
//   - The replacement markdown is parsed with the REAL production parser
//     (lib/rubricParser). If validateRubric fails, exits non-zero with NO
//     writes.
//   - Requires explicit --execute to write. --dry-run (or no flag) is
//     read-only.
//   - IDEMPOTENCY WARNING: rubric question/skill IDs are randomly generated
//     per parse (Math.random() in rubricParser), so re-running mints NEW IDs.
//     Fine here (0 submissions graded), but NEVER re-run after grading starts
//     without a migration plan — existing rubricGrade keys would dangle.
//
// Run (from functions/):
//   npx tsx scripts/update-assignment-rubric.ts \
//     --assignment-id <id> --rubric-file <path.md> [--dry-run|--execute]
// Env:
//   GOOGLE_APPLICATION_CREDENTIALS="/home/kp/Desktop/Executive Assistant/tools/service-account.json"

import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';
import { parseRubricMarkdown, validateRubric } from '../../lib/rubricParser';

// NOTE: lib/rubricParser lives OUTSIDE functions/ tsconfig rootDir, so this
// script is excluded from `tsc --noEmit` (see tsconfig "exclude") and is run
// with tsx (bundles the import, no rootDir complaint). `require()` is not an
// option either — the repo root package.json has "type": "module", which
// makes any .ts under it ESM-only.

// Explicit project/bucket — Admin SDK cannot resolve defaults outside the
// Functions runtime (same pattern as curate-library-items.ts).
admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'porters-portal',
  storageBucket: 'porters-portal.firebasestorage.app',
});
const db = admin.firestore();

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : undefined;
}

const ASSIGNMENT_ID = argValue('--assignment-id');
const RUBRIC_FILE = argValue('--rubric-file');
const EXECUTE = process.argv.includes('--execute');
const DRY_RUN = !EXECUTE; // --dry-run or no flag = read-only; only --execute writes

const BACKUP_DIR = path.join(__dirname, '..', 'script-backups');

interface RubricTierLike {
  label: string;
  percentage: number;
  descriptor: string;
}
interface RubricLike {
  title: string;
  rawMarkdown: string;
  questions: Array<{
    id: string;
    questionLabel: string;
    skills: Array<{ id: string; skillText: string; tiers: RubricTierLike[] }>;
  }>;
}

function summarize(rubric: RubricLike | undefined): string {
  if (!rubric) return '(none)';
  const qCount = rubric.questions?.length ?? 0;
  const sCount =
    rubric.questions?.reduce((n, q) => n + (q.skills?.length ?? 0), 0) ?? 0;
  return `${qCount} question(s), ${sCount} skill(s)`;
}

function printStructure(rubric: RubricLike): void {
  for (const q of rubric.questions) {
    console.log(`    ${q.questionLabel}`);
    for (const s of q.skills) {
      console.log(`      - ${s.skillText}`);
      for (const t of s.tiers) {
        const desc = t.descriptor.length > 80 ? t.descriptor.slice(0, 80) + '…' : t.descriptor;
        console.log(`          [${t.label}] ${desc}`);
      }
    }
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log(`update-assignment-rubric.ts — assignment: ${ASSIGNMENT_ID ?? '(missing)'}`);
  console.log(`MODE: ${EXECUTE ? 'EXECUTE (will write + backup)' : 'DRY RUN (read-only)'}`);
  console.log('='.repeat(60));

  if (!ASSIGNMENT_ID) {
    console.error('ERROR: --assignment-id <id> is required.');
    process.exit(1);
  }
  if (!RUBRIC_FILE) {
    console.error('ERROR: --rubric-file <path.md> is required.');
    process.exit(1);
  }

  // ---- Parse + validate the replacement markdown (REAL parser) ----
  let markdown: string;
  try {
    markdown = fs.readFileSync(RUBRIC_FILE, 'utf8');
  } catch (err) {
    console.error(`ERROR: cannot read rubric file ${RUBRIC_FILE}:`, err);
    process.exit(1);
  }

  const parsed = parseRubricMarkdown(markdown) as RubricLike;
  const errors: string[] = validateRubric(parsed as never);
  if (errors.length > 0) {
    console.error('ERROR: rubric validation failed — NOT writing:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Parsed ${RUBRIC_FILE}: ${summarize(parsed)} (title: "${parsed.title}")`);

  // ---- Read the live doc ----
  const docRef = db.collection('assignments').doc(ASSIGNMENT_ID);
  const snap = await docRef.get();
  if (!snap.exists) {
    console.error(`ERROR: assignments/${ASSIGNMENT_ID} does not exist. NOT writing.`);
    process.exit(1);
  }
  const data = snap.data() ?? {};
  const title: string = data.title ?? '(untitled)';
  const oldRubric = data.rubric as RubricLike | undefined;

  console.log(`Live doc: "${title}" (assignments/${ASSIGNMENT_ID})`);
  console.log(`  OLD rubric: ${summarize(oldRubric)}`);
  console.log(`  NEW rubric: ${summarize(parsed)}`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN: would write the following (no writes performed) ---');
    console.log(`  doc: assignments/${ASSIGNMENT_ID}`);
    console.log(`  fields: rubric (parsed object incl. rawMarkdown), updatedAt = <new ISO string>`);
    console.log(`  rubric title: "${parsed.title}"`);
    printStructure(parsed);
    console.log('\nDRY RUN complete. Re-run with --execute to write (backup is created first).');
    return;
  }

  // ---- EXECUTE: backup first, then update ONLY rubric + updatedAt ----
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `assignment-rubric-${ASSIGNMENT_ID}-${stamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        assignmentId: ASSIGNMENT_ID,
        title,
        backedUpAt: new Date().toISOString(),
        rubric: oldRubric ?? null,
        rawMarkdown: oldRubric?.rawMarkdown ?? null,
      },
      null,
      2
    )
  );
  console.log(`Backup written: ${backupPath}`);

  await docRef.update({
    rubric: { ...parsed, rawMarkdown: markdown },
    updatedAt: new Date().toISOString(),
  });
  console.log(`UPDATED assignments/${ASSIGNMENT_ID}: fields rubric, updatedAt. Done.`);

  console.log(
    '\nIDEMPOTENCY NOTE: rubric question/skill IDs are randomly generated per ' +
      'parse (Math.random() in rubricParser) — re-running mints NEW IDs. Fine ' +
      'here (0 submissions graded), but NEVER re-run after grading starts ' +
      'without a migration plan.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
