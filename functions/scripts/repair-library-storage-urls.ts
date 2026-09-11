// Run: cd functions && npx ts-node ../scripts/repair-library-storage-urls.ts [--dry-run]
//
// Repairs library_items docs whose hostingType is 'storage' but whose url is a
// raw GCS URL (https://storage.googleapis.com/...) that 403s for anonymous
// callers. Reuses/mints the object's Firebase download token (same logic as
// scanLibraryItems' ensureStorageDownloadUrl) and rewrites ONLY the `url`
// field. Idempotent — docs already holding a tokened URL are skipped.

import * as admin from 'firebase-admin';

// GOOGLE_CLOUD_PROJECT is set by the bwrap sandbox env; fall back to explicit
// project so Admin SDK never has to guess the project ID.
admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'porters-portal',
  // Explicit bucket required outside the Functions runtime — Admin SDK cannot
  // resolve the default bucket without FIREBASE_CONFIG.
  storageBucket: 'porters-portal.firebasestorage.app',
});
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const RAW_PREFIX = 'https://storage.googleapis.com/';

/** Mirrors ensureStorageDownloadUrl in src/library.ts — kept in sync. */
async function ensureStorageDownloadUrl(objectName: string): Promise<string> {
  const bucket = admin.storage().bucket();
  const file = bucket.file(objectName);
  const [metadata] = await file.getMetadata();
  const custom = metadata.metadata ?? {};
  let token = custom.firebaseStorageDownloadTokens;
  if (!token) {
    token = require('crypto').randomUUID();
    await file.setMetadata({ metadata: { ...custom, firebaseStorageDownloadTokens: token } });
  }
  const firstToken = String(token).split(',')[0].trim();
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectName)}?alt=media&token=${firstToken}`;
}

/** Derive the Storage object name from a raw GCS URL, or null if unrecognized. */
function objectNameFromRawUrl(url: string): string | null {
  // https://storage.googleapis.com/<bucket>/<object...>
  const match = url.match(/^https:\/\/storage\.googleapis\.com\/[^/]+\/(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function main() {
  console.log('=== Repair library_items storage URLs ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log();

  const snap = await db
    .collection('library_items')
    .where('hostingType', '==', 'storage')
    .get();

  let repaired = 0;
  let skippedNoMatch = 0;
  let skippedOtherUrl = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const url = typeof data.url === 'string' ? data.url : '';
    if (!url.startsWith(RAW_PREFIX)) {
      skippedOtherUrl++;
      continue;
    }
    const objectName = objectNameFromRawUrl(url);
    if (!objectName) {
      console.log(`  [SKIP] ${doc.id} — unparseable raw URL: ${url}`);
      skippedNoMatch++;
      continue;
    }
    try {
      const newUrl = await ensureStorageDownloadUrl(objectName);
      console.log(`  [REPAIR] ${doc.id}\n    old: ${url}\n    new: ${newUrl}`);
      if (!DRY_RUN) {
        await doc.ref.update({ url: newUrl, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
      repaired++;
    } catch (err) {
      console.log(`  [FAIL] ${doc.id} — ${err}`);
      failed++;
    }
  }

  console.log();
  console.log('=== Summary ===');
  console.log(`  Repaired:              ${repaired}`);
  console.log(`  Skipped (other URL):   ${skippedOtherUrl}`);
  console.log(`  Skipped (unparseable): ${skippedNoMatch}`);
  console.log(`  Failed:                ${failed}`);
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
