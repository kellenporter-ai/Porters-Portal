import * as admin from 'firebase-admin';
admin.initializeApp({ projectId: 'porters-portal', storageBucket: 'porters-portal.firebasestorage.app' });
const db = admin.firestore();
async function main() {
  const a = await db.collection('assignments').where('classType','==','Forensic Science').where('isAssessment','==',true).limit(3).get();
  a.docs.forEach(d=>console.log('ASSESSMENT:', d.id, JSON.stringify(d.data()).slice(0,900),'\n---'));
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
