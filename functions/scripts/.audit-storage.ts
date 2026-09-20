import * as admin from 'firebase-admin';
admin.initializeApp({ projectId: 'porters-portal', storageBucket: 'porters-portal.firebasestorage.app' });
async function main(): Promise<void> {
  const bucket = admin.storage().bucket('porters-portal.firebasestorage.app');
  const [files] = await bucket.getFiles({ prefix: 'resources/html/' });
  const out = files.map((f) => ({ name: f.name, size: f.metadata.size, updated: f.metadata.updated }));
  console.log(JSON.stringify(out));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
