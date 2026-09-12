// Run: cd functions && npx ts-node scripts/sweep-storage-duplicates.ts [--dry-run]
//
// DESTRUCTIVE sweep — Kellen-approved. Re-uploads of resources/html/ objects
// accumulated versioned duplicates (162 objects / 113 distinct files at time
// of writing). Older versions are worse versions of the newest; delete them.
//
//   1. List objects under resources/html/, group by base filename (last path
//      segment with the ^[a-z0-9]{7}[_-] upload-prefix stripped, lowercased).
//      Only groups with 2+ objects are considered.
//   2. Per group KEEP the newest by timeCreated (tiebreak: largest size,
//      then name). All others are deletion candidates.
//   3. Reference safety check: an assignments doc whose contentUrl contains
//      the candidate's object path (raw or URL-encoded) REFERENCES that
//      object — the candidate is excluded and logged "referenced — kept".
//      library_items docs pointing at deleted objects are deleted too
//      (matched by sourceFingerprint == full object name, which is exactly
//      how scanLibraryItems writes it).
//   4. --dry-run (default behavior is ALSO dry-run unless --live is passed):
//      report keep/delete decisions, sizes, dates, bytes reclaimed. Zero
//      writes. STOP and let EA review before running with --live.
//
// Expected scale: ~29 groups, ~49 deletions. If materially different (>10%),
// the script halts before any deletion.
//
// Never touches: the newest object in any group, non-duplicated objects, or
// any prefix other than resources/html/.

import * as admin from 'firebase-admin';

// Explicit project/bucket — Admin SDK cannot resolve defaults outside the
// Functions runtime (proven by repair-script run, pipeline 55faaaa8).
const BUCKET = 'porters-portal.firebasestorage.app';
admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'porters-portal',
  storageBucket: BUCKET,
});
const db = admin.firestore();

const LIVE = process.argv.includes('--live');
const DRY_RUN = !LIVE;

const PREFIX = 'resources/html/';
// Mirrors the upload-prefix strip in library.ts titleFromFilename.
const PREFIX_RE = /^[a-z0-9]{7}[_-]/;

// Expected scale guardrails (from task brief).
const EXPECTED_GROUPS = 29;
const EXPECTED_DELETIONS = 49;
const TOLERANCE = 0.1;

interface StoredObject {
  name: string; // full object name, e.g. resources/html/sub/x.html
  size: number; // bytes
  timeCreated: Date;
}

interface DeletionCandidate {
  object: StoredObject;
  groupKey: string;
  referencedBy: string[]; // assignment doc ids
}

function baseKey(name: string): string {
  const last = name.split('/').pop() ?? name;
  return last.replace(PREFIX_RE, '').toLowerCase();
}

function fmtBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** contentUrl contains the object path (raw or URL-encoded), per Pass B in curate-library-items. */
function urlReferencesObject(url: string, objectName: string): boolean {
  return url.includes(objectName) || url.includes(encodeURIComponent(objectName));
}

async function main() {
  console.log('=== Sweep Storage duplicates under resources/html/ ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes/deletes)' : 'LIVE — DELETING'}`);
  console.log();

  // ---- Step 1: list + group -------------------------------------------
  const bucket = admin.storage().bucket(BUCKET);
  const [files] = await bucket.getFiles({ prefix: PREFIX });
  const objects: StoredObject[] = files
    .filter((f) => !f.name.endsWith('/'))
    .map((f) => ({
      name: f.name,
      size: Number(f.metadata.size ?? 0),
      timeCreated: new Date(f.metadata.timeCreated as string),
    }));

  const groups = new Map<string, StoredObject[]>();
  for (const o of objects) {
    const key = baseKey(o.name);
    const arr = groups.get(key) ?? [];
    arr.push(o);
    groups.set(key, arr);
  }
  const dupGroups = [...groups.entries()].filter(([, arr]) => arr.length >= 2);

  console.log(`Objects under ${PREFIX}: ${objects.length}`);
  console.log(`Distinct base filenames: ${groups.size}`);
  console.log(`Duplicate groups (2+ objects): ${dupGroups.length}`);
  console.log();

  // Scale guardrail — halt if materially different from expectations.
  const groupDiff = Math.abs(dupGroups.length - EXPECTED_GROUPS) / EXPECTED_GROUPS;
  if (groupDiff > TOLERANCE) {
    console.error(`HALT: ${dupGroups.length} groups differs from expected ~${EXPECTED_GROUPS} by >10%.`);
    process.exit(1);
  }

  // ---- Step 2: keep newest per group, mark others ----------------------
  const candidates: DeletionCandidate[] = [];
  let totalReclaim = 0;
  const singleObjects = objects.length - dupGroups.reduce((n, [, a]) => n + a.length, 0);

  const sortedGroups = dupGroups.sort((a, b) => a[0].localeCompare(b[0]));
  const rows: string[] = [];
  for (const [key, arr] of sortedGroups) {
    const sorted = arr.slice().sort((a, b) => {
      if (a.timeCreated.getTime() !== b.timeCreated.getTime()) return b.timeCreated.getTime() - a.timeCreated.getTime();
      if (a.size !== b.size) return b.size - a.size;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    const keep = sorted[0];
    const del = sorted.slice(1);
    const delLines: string[] = [];
    for (const d of del) {
      candidates.push({ object: d, groupKey: key, referencedBy: [] });
      totalReclaim += d.size;
      delLines.push(`    DEL   ${d.name}  ${fmtBytes(d.size)}  ${fmtDate(d.timeCreated)}`);
    }
    rows.push(
      `  ${key}  (${arr.length} copies)\n` +
        `    KEEP  ${keep.name}  ${fmtBytes(keep.size)}  ${fmtDate(keep.timeCreated)}\n` +
        delLines.join('\n')
    );
  }

  const delDiff = Math.abs(candidates.length - EXPECTED_DELETIONS) / EXPECTED_DELETIONS;
  if (delDiff > TOLERANCE) {
    console.error(`HALT: ${candidates.length} deletion candidates differs from expected ~${EXPECTED_DELETIONS} by >10%.`);
    console.error('Group table follows for review, but no deletion will proceed.');
    console.log();
    console.log(rows.join('\n'));
    process.exit(1);
  }

  // ---- Step 3: reference safety check ----------------------------------
  const assignmentsSnap = await db.collection('assignments').get();
  const assignments = assignmentsSnap.docs.map((d) => ({ id: d.id, contentUrl: d.data().contentUrl }));
  const contentUrlDocs = assignments.filter((a): a is { id: string; contentUrl: string } => typeof a.contentUrl === 'string' && a.contentUrl.length > 0);

  let referencedCount = 0;
  for (const c of candidates) {
    for (const a of contentUrlDocs) {
      if (urlReferencesObject(a.contentUrl, c.object.name)) c.referencedBy.push(a.id);
    }
    if (c.referencedBy.length > 0) referencedCount++;
  }

  const finalDeletes = candidates.filter((c) => c.referencedBy.length === 0);
  const finalReclaim = finalDeletes.reduce((n, c) => n + c.object.size, 0);

  // ---- Step 4: report ---------------------------------------------------
  console.log('--- Per-group decisions ---');
  console.log(rows.join('\n'));
  console.log();
  console.log(`Non-duplicated objects (untouched): ${singleObjects}`);

  if (referencedCount > 0) {
    console.log();
    console.log('--- Referenced — kept (excluded from deletion) ---');
    for (const c of candidates.filter((x) => x.referencedBy.length > 0)) {
      console.log(`  ${c.object.name}  <- assignments: ${c.referencedBy.join(', ')}`);
    }
  }

  console.log();
  console.log('=== Summary ===');
  console.log(`  Duplicate groups:            ${dupGroups.length}`);
  console.log(`  Deletion candidates:         ${candidates.length}`);
  console.log(`  Referenced — kept:           ${referencedCount}`);
  console.log(`  Final deletions:             ${finalDeletes.length}`);
  console.log(`  Bytes reclaimed (candidates):${fmtBytes(totalReclaim)} (${totalReclaim} B)`);
  console.log(`  Bytes reclaimed (final):     ${fmtBytes(finalReclaim)} (${finalReclaim} B)`);

  // Map deletion candidates -> library_items docs by sourceFingerprint.
  const libSnap = await db.collection('library_items').get();
  const libByFp = new Map<string, string[]>();
  for (const doc of libSnap.docs) {
    const fp = doc.data().sourceFingerprint;
    if (typeof fp === 'string') {
      const arr = libByFp.get(fp) ?? [];
      arr.push(doc.id);
      libByFp.set(fp, arr);
    }
  }
  let libDocsToDelete = 0;
  for (const c of finalDeletes) {
    libDocsToDelete += libByFp.get(c.object.name)?.length ?? 0;
  }
  console.log(`  library_items docs to delete:${libDocsToDelete} (matched by sourceFingerprint)`);

  if (DRY_RUN) {
    console.log();
    console.log('DRY RUN — no objects or documents were deleted. Re-run with --live after EA review.');
    return;
  }

  // ---- LIVE: delete ------------------------------------------------------
  console.log();
  console.log('--- LIVE deletion ---');
  let deletedObjects = 0;
  let failedObjects = 0;
  for (const c of finalDeletes) {
    try {
      await bucket.file(c.object.name).delete();
      deletedObjects++;
      console.log(`  [DEL STORAGE] ${c.object.name}`);
    } catch (err) {
      failedObjects++;
      console.error(`  [FAIL STORAGE] ${c.object.name} — ${err}`);
    }
  }

  let deletedLibDocs = 0;
  let failedLibDocs = 0;
  for (const c of finalDeletes) {
    for (const docId of libByFp.get(c.object.name) ?? []) {
      try {
        await db.collection('library_items').doc(docId).delete();
        deletedLibDocs++;
        console.log(`  [DEL LIBRARY ] library_items/${docId}  (sourceFingerprint=${c.object.name})`);
      } catch (err) {
        failedLibDocs++;
        console.error(`  [FAIL LIBRARY ] library_items/${docId} — ${err}`);
      }
    }
  }

  console.log();
  console.log('=== Live run summary ===');
  console.log(`  Storage objects deleted:   ${deletedObjects} (${fmtBytes(finalReclaim)} reclaimed)`);
  console.log(`  Storage deletions failed:  ${failedObjects}`);
  console.log(`  library_items docs deleted:${deletedLibDocs}`);
  console.log(`  library doc deletes failed:${failedLibDocs}`);
  console.log(`  Referenced — kept:         ${referencedCount}`);
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
