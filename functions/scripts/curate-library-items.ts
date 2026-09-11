// Run: cd functions && npx ts-node scripts/curate-library-items.ts [--dry-run]
//
// Organization pass over scan-created library_items docs (hostingType ==
// 'storage'). Three passes, each idempotent and updating ONLY changed fields
// (+ updatedAt serverTimestamp). Never overwrites hand-curated fields.
//
//   Pass A — title cleanup: storage docs whose title still starts with the
//     7-char upload prefix ("P5a77av Circuit Diagram Builder") get the title
//     re-derived from sourceFingerprint with the prefix stripped. Skips docs
//     the seed curated (untagged=false with real metadata).
//
//     QA fix (2026-09-11): the detect regex must mirror the strip regex in
//     deriveTitle (`^[a-z0-9]{7}[_-]` on the fingerprint stem) because scan
//     titles use "<PrefixTitle> " (prefix + SPACE), not prefix + [_-].
//     Detection therefore tests the sourceFingerprint directly: the title is
//     flagged as prefix-artifact ONLY when the fingerprint's basename begins
//     with a 7-char [a-z0-9] run followed by [_-]. Verified against
//     production sample (162/162 storage docs, 2026-09-11): every scan title
//     begins with the 7-char prefix + space AND its fingerprint basename
//     carries prefix + [_-]; zero hand-written titles collide with the
//     fingerprint-based test. A title-level regex like /^[A-Za-z0-9]{7}\s/
//     was too broad ("Perfect Gas Law Lab" would false-positive).
//   Pass B — assignment join: for storage docs still untagged, match
//     assignments whose contentUrl contains the storage object's path segment
//     ("resources/html/<filename>" in raw or URL-encoded form). Joining on
//     the bare filename risked matching short/generic filenames inside an
//     unrelated URL. If >1 candidate matches, skip and log
//     "ambiguous — skipped" instead of picking most-recent.
//   Pass C — keyword heuristics: remaining untagged docs get subject filled
//     from a filename keyword map (only when exactly one subject matches;
//     untagged stays true) plus 1-3 lowercase tags from significant filename
//     words (stopwords dropped).

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// Explicit project/bucket — Admin SDK cannot resolve defaults outside the
// Functions runtime (proven by repair-script run, pipeline 55faaaa8).
admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'porters-portal',
  storageBucket: 'porters-portal.firebasestorage.app',
});
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

// -----------------------------------------------
// Pass A helpers
// -----------------------------------------------

/**
 * Mirrors titleFromFilename in src/library.ts (incl. the 7-char prefix
 * strip). The strip regex is `^[a-z0-9]{7}[_-]` on the fingerprint stem.
 */
function deriveTitle(sourceFingerprint: string): string {
  const base = sourceFingerprint.split('/').pop() ?? sourceFingerprint;
  const stem = base.replace(/\.html?$/i, '').replace(/\.(pdf|pptx?|docx?)$/i, '');
  const stripped = stem.replace(/^[a-z0-9]{7}[_-]/, '');
  const spaced = stripped.replace(/[-_]+/g, ' ').trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase()) || sourceFingerprint;
}

/**
 * QA fix: detect prefix-artifact titles by testing the sourceFingerprint
 * (which always has the form "<7-char>[_-]<rest>") instead of the title
 * (which has "<7-char><space><rest>" and would need an over-broad title
 * regex). Returns true only when the fingerprint basename carries the
 * upload-prefix separator, i.e. deriveTitle will actually change the title.
 */
function hasUploadPrefix(sourceFingerprint: string): boolean {
  const base = sourceFingerprint.split('/').pop() ?? '';
  const stem = base.replace(/\.html?$/i, '').replace(/\.(pdf|pptx?|docx?)$/i, '');
  return /^[a-z0-9]{7}[_-]/.test(stem);
}

// -----------------------------------------------
// Pass C helpers
// -----------------------------------------------

const SUBJECT_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(serology|csi|forensic|forensics|toxicology|entomology)\b/i, 'Forensics'],
  [/\b(pendulum|shm|inertia|circuit|circuits|electroscope|momentum|vector|vectors|motion|energy|kinematic|kinematics|projectile|projectiles)\b/i, 'Physics'],
  [/\b(battleship|game|games|review)\b/i, 'General'],
];

const STOPWORDS = new Set([
  'lab', 'labs', 'tool', 'tools', 'online', 'fix', 'v2', 'html', 'the', 'a', 'an',
  'and', 'or', 'of', 'for', 'in', 'on', 'to', 'with', 'activity', 'page', 'new',
]);

/** Generate 1-3 lowercase tags from significant filename words. */
function deriveTags(sourceFingerprint: string): string[] {
  const base = sourceFingerprint.split('/').pop() ?? sourceFingerprint;
  const stem = base.replace(/\.html?$/i, '').replace(/\.(pdf|pptx?|docx?)$/i, '');
  const stripped = stem.replace(/^[a-z0-9]{7}[_-]/, '');
  const words = stripped
    .split(/[-_\s]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, 3);
}

/** Unique subjects matched by the filename keyword map (0, 1, or many). */
function matchSubjects(sourceFingerprint: string): string[] {
  const subjects = new Set<string>();
  for (const [re, subject] of SUBJECT_KEYWORDS) {
    if (re.test(sourceFingerprint)) subjects.add(subject);
  }
  return [...subjects];
}

// -----------------------------------------------
// Assignment shape (subset of types.ts Assignment)
// -----------------------------------------------

interface AssignmentDoc {
  title?: unknown;
  description?: unknown;
  classType?: unknown;
  unit?: unknown;
  category?: unknown;
  contentUrl?: unknown;
  updatedAt?: unknown; // ISO string
  createdAt?: unknown; // ISO string
}

/** Extract the storage object filename from a library doc's sourceFingerprint. */
function objectFilename(fp: string): string | null {
  const base = fp.split('/').pop() ?? '';
  return base || null;
}

/**
 * QA fix: match assignments whose contentUrl contains the storage object's
 * full path segment "resources/html/<filename>" (raw or URL-encoded) — not
 * the bare filename, which could collide with short/generic names elsewhere
 * in an unrelated URL. Falls back to the bare filename + encoded form only
 * when the fingerprint has no directory segment.
 */
function matchesObjectPath(url: string, fp: string, filename: string): boolean {
  const pathSegment = fp.includes('/') ? fp : `resources/html/${filename}`;
  const encodedSegment = encodeURIComponent(pathSegment);
  return url.includes(pathSegment) || url.includes(encodedSegment);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

// -----------------------------------------------
// Main
// -----------------------------------------------

async function main() {
  console.log('=== Curate library_items (organization pass) ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log();

  const snap = await db.collection('library_items').get();
  const allDocs = snap.docs;

  // Restrict curation to storage-derived docs; bundled docs are few and were
  // seeded by hand.
  const storageDocs = allDocs.filter((d) => d.data().hostingType === 'storage');

  let batch = db.batch();
  let batchCount = 0;
  const flush = async () => {
    if (DRY_RUN || batchCount === 0) return;
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  };
  const enqueue = (ref: FirebaseFirestore.DocumentReference, update: Record<string, unknown>) => {
    batch.update(ref, update);
    batchCount++;
    if (batchCount >= 450) return flush();
    return Promise.resolve();
  };

  // =============================================
  // Pass A — title cleanup
  // =============================================
  console.log('--- Pass A: title cleanup ---');
  let passA = 0;
  let passASkippedCurated = 0;
  let passASkippedClean = 0;

  for (const doc of storageDocs) {
    const data = doc.data();
    const title = typeof data.title === 'string' ? data.title : '';
    const fp = typeof data.sourceFingerprint === 'string' ? data.sourceFingerprint : '';
    if (!fp) {
      passASkippedClean++;
      continue;
    }
    // QA fix: detect via fingerprint (strip-mirrored regex) so a clean
    // hand-written title like "Perfect Gas Law Lab" is never touched.
    if (!hasUploadPrefix(fp)) {
      passASkippedClean++;
      continue;
    }
    // Skip anything the seed curated — untagged=false with real metadata.
    if (data.untagged === false) {
      passASkippedCurated++;
      continue;
    }
    const newTitle = deriveTitle(fp);
    if (newTitle === title) {
      passASkippedClean++;
      continue;
    }
    console.log(`  [A] ${doc.id}\n    old title: ${title}\n    new title: ${newTitle}`);
    await enqueue(doc.ref, { title: newTitle, updatedAt: FieldValue.serverTimestamp() });
    passA++;
  }
  await flush();
  console.log(`Pass A: ${passA} titles fixed, ${passASkippedCurated} skipped (curated), ${passASkippedClean} already clean`);
  console.log();

  // =============================================
  // Pass B — assignment join
  // =============================================
  console.log('--- Pass B: assignment join ---');
  // Refresh after Pass A so Pass B sees current untagged state.
  const refreshed = await db.collection('library_items').get();
  const refreshedStorage = refreshed.docs.filter((d) => d.data().hostingType === 'storage');
  const untaggedForB = refreshedStorage.filter((d) => d.data().untagged === true);

  const assignmentsSnap = await db.collection('assignments').get();
  const assignments = assignmentsSnap.docs.map((d) => ({ id: d.id, data: d.data() as AssignmentDoc }));

  let passB = 0;
  let passBNoMatch = 0;
  let passBAmbiguous = 0;
  const passBMatches: string[] = [];

  for (const doc of untaggedForB) {
    const data = doc.data();
    const fp = typeof data.sourceFingerprint === 'string' ? data.sourceFingerprint : '';
    const filename = fp ? objectFilename(fp) : null;
    if (!filename || !fp) {
      passBNoMatch++;
      continue;
    }

    const matches = assignments.filter((a) => {
      const url = a.data.contentUrl;
      if (!isNonEmptyString(url)) return false;
      return matchesObjectPath(url, fp, filename);
    });

    if (matches.length === 0) {
      passBNoMatch++;
      continue;
    }
    if (matches.length > 1) {
      passBAmbiguous++;
      console.log(`  [B] ${doc.id} — ambiguous — skipped (${matches.length} candidate assignments: ${matches.map((m) => m.id).join(', ')})`);
      continue;
    }

    const best = matches[0].data;

    const update: Record<string, unknown> = {};
    if (isNonEmptyString(best.title)) update.title = best.title;
    if (isNonEmptyString(best.description)) update.description = best.description;
    if (isNonEmptyString(best.category)) update.suggestedCategory = best.category;
    if (isNonEmptyString(best.classType)) update.subject = best.classType;
    const tags: string[] = [];
    if (isNonEmptyString(best.unit)) tags.push(best.unit.toLowerCase());
    if (tags.length > 0) update.tags = tags;
    update.untagged = false;

    // Only write fields that actually change.
    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(update)) {
      const existing = data[k];
      if (k === 'tags') {
        if (!Array.isArray(existing) || existing.length === 0) changed[k] = v;
      } else if (existing !== v) {
        changed[k] = v;
      }
    }
    if (Object.keys(changed).length === 0) {
      // untagged was already false would have excluded this doc; guard anyway.
      passBNoMatch++;
      continue;
    }
    changed.updatedAt = FieldValue.serverTimestamp();

    console.log(`  [B] ${doc.id} <- assignment "${best.title}" (${matches[0].id})`);
    passBMatches.push(`    ${data.title ?? doc.id}  <-  "${best.title}" [${best.classType ?? '?'}${best.unit ? ' / ' + best.unit : ''}]`);
    await enqueue(doc.ref, changed);
    passB++;
  }
  await flush();
  console.log(`Pass B: ${passB} curated via assignment join, ${passBNoMatch} unmatched, ${passBAmbiguous} ambiguous — skipped`);
  console.log();

  // =============================================
  // Pass C — keyword heuristics
  // =============================================
  console.log('--- Pass C: keyword heuristics ---');
  const refreshed2 = await db.collection('library_items').get();
  const untaggedForC = refreshed2.docs.filter(
    (d) => d.data().hostingType === 'storage' && d.data().untagged === true
  );

  let passCSubject = 0;
  let passCTags = 0;
  let passCAmbiguous = 0;
  let passCNoKeyword = 0;

  for (const doc of untaggedForC) {
    const data = doc.data();
    const fp = typeof data.sourceFingerprint === 'string' ? data.sourceFingerprint : '';
    if (!fp) {
      passCNoKeyword++;
      continue;
    }
    const subjects = matchSubjects(fp);
    const tags = deriveTags(fp);

    const update: Record<string, unknown> = {};
    if (subjects.length === 1) {
      update.subject = subjects[0];
    } else if (subjects.length > 1) {
      passCAmbiguous++;
    }
    const existingTags = Array.isArray(data.tags) ? data.tags : [];
    const newTags = tags.filter((t) => !existingTags.includes(t));
    if (newTags.length > 0) update.tags = [...existingTags, ...newTags];

    const changed: Record<string, unknown> = {};
    if (update.subject !== undefined && data.subject !== update.subject) changed.subject = update.subject;
    if (update.tags !== undefined) changed.tags = update.tags;
    if (Object.keys(changed).length === 0) {
      if (subjects.length === 0) passCNoKeyword++;
      continue;
    }
    changed.updatedAt = FieldValue.serverTimestamp();

    console.log(`  [C] ${doc.id} — title="${data.title}", subject=${update.subject ?? '(ambiguous)'}, tags=${JSON.stringify(update.tags ?? [])}`);
    await enqueue(doc.ref, changed);
    if (update.subject !== undefined) passCSubject++;
    if (update.tags !== undefined) passCTags++;
  }
  await flush();
  console.log(`Pass C: ${passCSubject} subjects filled, ${passCTags} tag sets added, ${passCAmbiguous} ambiguous (skipped), ${passCNoKeyword} no keyword`);

  console.log();
  console.log('=== Summary ===');
  console.log(`  Total library_items:        ${allDocs.length}`);
  console.log(`  Storage docs:               ${storageDocs.length}`);
  console.log(`  Pass A titles fixed:        ${passA}`);
  console.log(`  Pass B assignment matches:  ${passB}`);
  console.log(`  Pass C subject fills:       ${passCSubject}`);
  if (passBMatches.length > 0) {
    console.log();
    console.log('  Sample assignment joins (up to 10):');
    for (const line of passBMatches.slice(0, 10)) console.log(line);
  }
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
