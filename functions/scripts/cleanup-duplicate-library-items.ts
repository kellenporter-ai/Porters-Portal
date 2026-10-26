// One-off: delete scan-created duplicate library_items docs.
//
// The teacher scan registers directory pages as `/x/` (from
// library-manifest.json's path) while curated seed entries use `/x/index.html`,
// so a page can appear twice in the Library: the curated card plus an
// untagged stub whose title is just "/x/".
//
// Run: cd functions && GOOGLE_APPLICATION_CREDENTIALS=... npx ts-node \
//        scripts/cleanup-duplicate-library-items.ts [--dry-run]

import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();
const DRY = process.argv.includes('--dry-run');

interface Doc {
  id: string;
  data: Record<string, unknown>;
}

async function main() {
  const snap = await db.collection('library_items').get();
  const docs: Doc[] = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

  const curatedFps = new Set(
    docs
      .filter((d) => d.data.untagged !== true)
      .map((d) => String(d.data.sourceFingerprint ?? ''))
  );

  // A doc counts as a duplicate when it is an untagged stub whose path form
  // differs from a curated doc for the same page: `/x/` vs `/x/index.html`
  // (directory pages) or `/x.html` vs `/x` (clean-URL pages).
  const duplicates = docs.filter((d) => {
    if (d.data.untagged !== true) return false;
    const fp = String(d.data.sourceFingerprint ?? '');
    if (fp.endsWith('/') && curatedFps.has(`${fp}index.html`)) return true;
    if (fp.endsWith('.html') && curatedFps.has(fp.slice(0, -'.html'.length))) return true;
    if (curatedFps.has(`${fp}.html`)) return true;
    return false;
  });

  for (const d of duplicates) {
    const fp = String(d.data.sourceFingerprint);
    console.log(
      `  [DELETE] ${d.id} ${fp} (twin: ${fp}index.html) | title shown was: ${d.data.title}`
    );
    if (!DRY) await db.collection('library_items').doc(d.id).delete();
  }

  console.log(`\n${DRY ? 'WOULD DELETE' : 'DELETED'}: ${duplicates.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
