// Run: cd functions && npx ts-node scripts/backup-sweep-duplicates.ts
//
// Companion to sweep-storage-duplicates.ts. Downloads every deletion
// candidate (same grouping logic: newest per base filename kept, all others
// are candidates) to a local backup dir, and exports the matching
// library_items docs (matched by sourceFingerprint == full object name) to
// a single JSON file. Read-only against GCS/Firestore. Verification at the
// end: file count + non-zero sizes, JSON entry count.

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const BUCKET = 'porters-portal.firebasestorage.app';
admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'porters-portal',
  storageBucket: BUCKET,
});
const db = admin.firestore();

const PREFIX = 'resources/html/';
const PREFIX_RE = /^[a-z0-9]{7}[_-]/;

const BACKUP_DIR = '/home/kp/Desktop/Executive Assistant/backups/storage-sweep-2026-09-11';
const LIB_EXPORT = path.join(BACKUP_DIR, 'library-items.json');

interface StoredObject {
  name: string;
  size: number;
  timeCreated: Date;
}

function baseKey(name: string): string {
  const last = name.split('/').pop() ?? name;
  return last.replace(PREFIX_RE, '').toLowerCase();
}

function backupFileName(objectName: string): string {
  // All candidates live directly under PREFIX; fall back to _ for any
  // deeper nesting just in case.
  return objectName.slice(PREFIX.length).replace(/\//g, '_');
}

async function main() {
  console.log('=== Backup sweep deletion candidates ===');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // ---- Candidate selection (mirrors sweep-storage-duplicates.ts) -------
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

  const candidates: StoredObject[] = [];
  for (const [, arr] of groups) {
    if (arr.length < 2) continue;
    const sorted = arr.slice().sort((a, b) => {
      if (a.timeCreated.getTime() !== b.timeCreated.getTime()) return b.timeCreated.getTime() - a.timeCreated.getTime();
      if (a.size !== b.size) return b.size - a.size;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    candidates.push(...sorted.slice(1));
  }
  console.log(`Candidates: ${candidates.length} objects (${objects.length} total under ${PREFIX})`);

  // ---- Download each candidate -----------------------------------------
  let downloaded = 0;
  let failed = 0;
  let totalBytes = 0;
  for (const c of candidates) {
    const dest = path.join(BACKUP_DIR, backupFileName(c.name));
    try {
      await bucket.file(c.name).download({ destination: dest });
      const onDisk = fs.statSync(dest).size;
      if (onDisk !== c.size) {
        console.error(`  [SIZE MISMATCH] ${c.name} — gcs=${c.size} disk=${onDisk}`);
        failed++;
        continue;
      }
      downloaded++;
      totalBytes += onDisk;
      console.log(`  [OK] ${backupFileName(c.name)}  (${onDisk} B)`);
    } catch (err) {
      failed++;
      console.error(`  [FAIL] ${c.name} — ${err}`);
    }
  }

  // ---- Export matching library_items docs -------------------------------
  const libSnap = await db.collection('library_items').get();
  const candidateNames = new Set(candidates.map((c) => c.name));
  const exported = libSnap.docs
    .filter((d) => {
      const fp = d.data().sourceFingerprint;
      return typeof fp === 'string' && candidateNames.has(fp);
    })
    .map((d) => ({ id: d.id, ...d.data() }));

  fs.writeFileSync(LIB_EXPORT, JSON.stringify(exported, null, 2));
  const jsonBytes = fs.statSync(LIB_EXPORT).size;

  // ---- Verify ------------------------------------------------------------
  const filesOnDisk = fs.readdirSync(BACKUP_DIR).filter((f) => f !== 'library-items.json');
  const zeroSize = filesOnDisk.filter((f) => fs.statSync(path.join(BACKUP_DIR, f)).size === 0);

  console.log();
  console.log('=== Backup summary ===');
  console.log(`  Backup dir:            ${BACKUP_DIR}`);
  console.log(`  Objects downloaded:    ${downloaded} (${totalBytes} B)`);
  console.log(`  Download failures:     ${failed}`);
  console.log(`  Files on disk:         ${filesOnDisk.length}`);
  console.log(`  Zero-size files:       ${zeroSize.length}${zeroSize.length ? ' — ' + zeroSize.join(', ') : ''}`);
  console.log(`  library-items.json:    ${exported.length} entries, ${jsonBytes} B`);

  const ok = failed === 0 && filesOnDisk.length === candidates.length && zeroSize.length === 0 && exported.length > 0 && jsonBytes > 0;
  console.log(ok ? 'Backup verification PASSED.' : 'Backup verification FAILED — do not run --live.');
  if (!ok) process.exit(1);
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
