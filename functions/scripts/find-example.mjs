import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'porters-portal' });
const db = admin.firestore();
// any assessment, any class
const a = await db.collection('assignments').where('isAssessment','==',true).limit(2).get();
console.log('any assessments:', a.size);
a.docs.forEach(d=>console.log('\n',d.id,'\n',JSON.stringify(d.data()).slice(0,1600),'\n---'));
// forensic science non-assessments
const f = await db.collection('assignments').where('classType','==','Forensic Science').limit(2).get();
console.log('forensic assignments:', f.size);
f.docs.forEach(d=>console.log('\n',d.id,'\n',JSON.stringify(d.data()).slice(0,1200),'\n---'));
// assignment_content shape
if (f.size) {
  const ac = await db.collection('assignment_content').doc(f.docs[0].id).get();
  console.log('content doc exists:', ac.exists, ac.exists ? JSON.stringify(ac.data()).slice(0,600) : '');
}
process.exit(0);
