import * as admin from 'firebase-admin';
import * as fs from 'fs';
admin.initializeApp({ projectId: 'porters-portal', storageBucket: 'porters-portal.firebasestorage.app' });
const files = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as { name: string }[];
async function main(): Promise<void> {
  const bucket = admin.storage().bucket('porters-portal.firebasestorage.app');
  for (const f of files) {
    const dest = '/home/kp/.cache/ea-agent/libaudit/html/' + f.name.split('/').pop();
    await bucket.file(f.name).download({ destination: dest });
  }
  console.log('downloaded', files.length);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
