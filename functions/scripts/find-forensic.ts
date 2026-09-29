import * as admin from 'firebase-admin';
admin.initializeApp({ projectId: 'porters-portal', storageBucket: 'porters-portal.firebasestorage.app' });
const db = admin.firestore();
async function main() {
  const snap = await db.collection('class_configs').get();
  snap.docs.forEach(d => console.log('CLASS_CONFIG:', d.id, '|', (d.data().className)||'', '| features:', JSON.stringify(d.data().features||{})));
  const a = await db.collection('assignments').where('title','==','The Break-In: Evidence Types').get();
  console.log('existing assessments with exact title:', a.size);
  const a2 = await db.collection('assignments').where('title','>=','The Break-In').where('title','<=','The Break-In\u{f8ff}').get();
  a2.docs.forEach(d=>console.log('candidate:', d.id, JSON.stringify({title:d.data().title, classType:d.data().classType, status:d.data().status})));
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
