import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'fs';

const ACTIVITY = 'cuticle-ovality-lab';

(async () => {
  const testEnv = await initializeTestEnvironment({
    projectId: 'porters-portal',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: parseInt(String(process.env.FIREBASE_FIRESTORE_EMULATOR_ADDRESS || '127.0.0.1:8085').split(':').pop(), 10),
    },
  });

  const payload = JSON.stringify({
    v: 1,
    reading: { r0: { pick: 'straight', done: false, support: 'the outline is circular', against: 'only one view' } },
  });
  // updatedAt is REQUIRED by the rules (d.updatedAt == request.time).
  const docData = { payload, rev: 1, schemaVersion: 1, updatedAt: serverTimestamp() };

  // Seed the whitelist with an OUTSIDE the rules context (admin bypass)
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'allowed_emails/student@example.org'), { email: 'student@example.org' });
  });

  const results = {};

  // 1. whitelisted student writes their OWN doc
  {
    const db = testEnv.authenticatedContext('uidStudent', {
      email: 'student@example.org',
      token: { email: 'student@example.org' },
    }).firestore();
    try {
      await assertSucceeds(setDoc(doc(db, `resource_saves/uidStudent/items/${ACTIVITY}`), docData));
      results.whitelisted_own_write = 'ALLOW (correct)';
    } catch (e) {
      results.whitelisted_own_write = 'DENY (WRONG): ' + e.message.slice(0, 120);
    }
  }

  // 2. student reads their own doc back
  {
    const db = testEnv.authenticatedContext('uidStudent', {
      email: 'student@example.org',
      token: { email: 'student@example.org' },
    }).firestore();
    try {
      await assertSucceeds(getDoc(doc(db, `resource_saves/uidStudent/items/${ACTIVITY}`)));
      results.whitelisted_own_read = 'ALLOW (correct)';
    } catch (e) {
      results.whitelisted_own_read = 'DENY (WRONG): ' + e.message.slice(0, 120);
    }
  }

  // 3. NOT-whitelisted account writes its own doc -> must fail
  {
    const db = testEnv.authenticatedContext('uidStranger', {
      email: 'stranger@gmail.com',
      token: { email: 'stranger@gmail.com' },
    }).firestore();
    try {
      await assertFails(setDoc(doc(db, `resource_saves/uidStranger/items/${ACTIVITY}`), docData));
      results.stranger_own_write = 'DENY (correct)';
    } catch (e) {
      results.stranger_own_write = 'ALLOW (WRONG): ' + e.message.slice(0, 120);
    }
  }

  // 4. whitelisted student writes ANOTHER student's doc -> must fail
  {
    const db = testEnv.authenticatedContext('uidStudent', {
      email: 'student@example.org',
      token: { email: 'student@example.org' },
    }).firestore();
    try {
      await assertFails(setDoc(doc(db, `resource_saves/uidVictim/items/${ACTIVITY}`), docData));
      results.cross_student_write = 'DENY (correct)';
    } catch (e) {
      results.cross_student_write = 'ALLOW (WRONG): ' + e.message.slice(0, 120);
    }
  }

  console.log(JSON.stringify(results, null, 1));
  await testEnv.cleanup();
})().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
