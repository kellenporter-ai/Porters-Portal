import * as admin from 'firebase-admin';
import * as fs from 'fs';
admin.initializeApp({ projectId: 'porters-portal', storageBucket: 'porters-portal.firebasestorage.app' });
async function main(): Promise<void> {
  const snap = await admin.firestore().collection('library_items').limit(500).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  fs.writeFileSync('/home/kp/.cache/ea-agent/libaudit/library_items.json', JSON.stringify(docs, null, 1));
  console.log('count', docs.length);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
