// One-off post-state verification for the storage sweep live run.
// Run: cd functions && npx ts-node scripts/verify-sweep-poststate.ts
import * as admin from 'firebase-admin';

const BUCKET = 'porters-portal.firebasestorage.app';
admin.initializeApp({ projectId: 'porters-portal', storageBucket: BUCKET });
const db = admin.firestore();

async function main() {
  const bucket = admin.storage().bucket(BUCKET);
  const [files] = await bucket.getFiles({ prefix: 'resources/html/' });
  const objects = files.filter((f) => !f.name.endsWith('/'));
  console.log(`objects_under_resources_html=${objects.length}`);

  const libSnap = await db.collection('library_items').get();
  console.log(`library_items_count=${libSnap.size}`);

  // Surviving doc for the kept shattered-showcase object.
  const keptFp = 'resources/html/sbiqqq0_shattered-showcase.html';
  const survivors = libSnap.docs.filter((d) => d.data().sourceFingerprint === keptFp);
  console.log(`shattered-showcase survivor docs=${survivors.length}`);
  if (survivors.length > 0) {
    const d = survivors[0].data();
    console.log(`doc_id=${survivors[0].id}`);
    console.log(`contentUrl=${d.contentUrl}`);
    console.log(`storageUrl=${d.storageUrl ?? '(absent)'}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
