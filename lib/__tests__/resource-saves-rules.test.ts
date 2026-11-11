/**
 * resource_saves rules — behavioral proof against the Firestore emulator.
 *
 * A rules file that COMPILES proves nothing. These tests assert the properties
 * that keep one device from destroying another device's newer work.
 *
 * CRITICAL TEST-DESIGN NOTE (learned the hard way):
 * The rules require `updatedAt == request.time`. A client `new Date()` can never
 * equal the server commit time, so seeding with one makes EVERY assertFails pass
 * for the wrong reason and every assertSucceeds fail. All writes here therefore
 * use `serverTimestamp()`, and each negative test seeds a known-good doc then
 * varies exactly ONE factor — otherwise a denial does not prove which check fired.
 *
 * Run:
 *   firebase emulators:exec --only firestore --project porters-portal-rules-test \
 *     "npx vitest run lib/__tests__/resource-saves-rules.test.ts"
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function hasJava(): boolean {
  try {
    execSync('java -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const JAVA = hasJava();
if (!JAVA) {
  console.warn(
    '\n[rules] SKIPPED — no Java on this machine, so the Firestore emulator cannot start.\n' +
    '[rules] resource_saves rev-concurrency checks are UNVERIFIED until this runs.\n',
  );
}

const suite = JAVA ? describe : describe.skip;

let env: RulesTestEnvironment | undefined;
let emulatorFailed = false;

const STUDENT_A = 'studentA';
const STUDENT_B = 'studentB';
const ACTIVITY = 'cart-04-corrupted-lab';

// The `resource_saves` rules gate writes on membership in `allowed_emails`
// (the teacher-curated whitelist), because the project apiKey is public and any
// Google account can otherwise create docs. Every authenticated context in this
// file therefore carries a whitelisted email claim.
const ROSTER: Record<string, string> = {
  [STUDENT_A]: 'student.a@students.pahs.edu',
  [STUDENT_B]: 'student.b@students.pahs.edu',
};

function db(uid: string) {
  if (!env) throw new Error('test environment not initialized');
  const email = ROSTER[uid];
  return env.authenticatedContext(uid, email ? { email } : {}).firestore();
}

function docRef(uid: string, activityId = ACTIVITY) {
  return doc(db(uid), 'resource_saves', uid, 'items', activityId);
}

/** A well-formed save. serverTimestamp() is REQUIRED by the rules. */
function payload(rev: number, body = '{"answers":[]}') {
  return { payload: body, rev, schemaVersion: 1, updatedAt: serverTimestamp() };
}

/** Seed a known-good doc bypassing rules, so a later denial is attributable. */
async function seed(uid: string, rev: number, activityId = ACTIVITY, body = '{"answers":[]}') {
  if (!env) throw new Error('no env');
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), 'resource_saves', uid, 'items', activityId),
      { payload: body, rev, schemaVersion: 1, updatedAt: serverTimestamp() },
    );
  });
}

async function clear(uid: string, activityId = ACTIVITY) {
  if (!env) throw new Error('no env');
  await env.withSecurityRulesDisabled(async (ctx) => {
    await deleteDoc(doc(ctx.firestore(), 'resource_saves', uid, 'items', activityId));
  });
}

beforeAll(async () => {
  if (!JAVA) return;
  try {
    env = await initializeTestEnvironment({
      projectId: 'porters-portal-rules-test',
      firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
    });
    // Seed the teacher-maintained whitelist (rules bypassed).
    //
    // Ordering matters: this must be the FIRST Firestore operation in the file.
    // If any authenticated client runs first, the SDK has already started its
    // Firestore instance and `withSecurityRulesDisabled` throws
    // "Firestore has already been started".
    try {
      await env.withSecurityRulesDisabled(async (ctx) => {
        for (const email of Object.values(ROSTER)) {
          await setDoc(doc(ctx.firestore(), 'allowed_emails', email), { classType: 'test' });
        }
      });
    } catch (e) {
      // The rules-disabled client writes successfully, then the SDK throws
      // "Firestore has already been started" while tearing down. The writes land
      // (proven: the allow-path tests below only pass when this runs), so this
      // specific teardown error is not a failure of the seed.
      if (!/already been started/.test(String(e))) throw e;
    }
  } catch (e) {
    emulatorFailed = true;
    console.warn('[rules] emulator unavailable:', e);
  }
});

afterAll(async () => {
  if (env) await env.cleanup();
});

suite('resource_saves rules', () => {
  it('emulator is actually reachable (guards against a silent skip)', () => {
    expect(emulatorFailed).toBe(false);
    expect(env).toBeDefined();
  });

  it('allows a student to create their own save at rev 1', async () => {
    await clear(STUDENT_A);
    await assertSucceeds(setDoc(docRef(STUDENT_A), payload(1)));
  });

  it('allows an in-order update (rev 1 -> 2) even though the timestamp is client-set', async () => {
    // If this fails, the rules require true server time and the app's write path
    // (which uses a REQUEST_TIME transform) is the only acceptable client.
    await seed(STUDENT_A, 1);
    await assertSucceeds(setDoc(docRef(STUDENT_A), payload(2)));
  });

  it('REJECTS a stale update that repeats the current rev', async () => {
    await seed(STUDENT_A, 2);
    await assertFails(setDoc(docRef(STUDENT_A), payload(2)));
  });

  it('REJECTS a write that skips rev numbers', async () => {
    await seed(STUDENT_A, 2);
    await assertFails(setDoc(docRef(STUDENT_A), payload(9)));
  });

  it('REJECTS a write that decrements rev', async () => {
    await seed(STUDENT_A, 5);
    await assertFails(setDoc(docRef(STUDENT_A), payload(2)));
  });

  it('REJECTS a create that does not start at rev 1', async () => {
    await clear(STUDENT_B, 'other-activity');
    await assertFails(setDoc(docRef(STUDENT_B, 'other-activity'), payload(5)));
  });

  // NOTE: this test must build the doc path MANUALLY rather than using docRef().
  // docRef(uid) derives the path from the same uid it authenticates as, so
  // `docRef(STUDENT_A)` always means "A writing A's own doc" — which the rules
  // are supposed to allow. An earlier version of this test used docRef(STUDENT_A)
  // and therefore asserted that a legitimate rev 3 -> 4 write failed; it passed
  // for A and could only ever fail on a rules regression, never test cross-
  // student isolation. The identity and the target must be varied independently.
  it('REJECTS writing another student\'s save', async () => {
    await seed(STUDENT_A, 3);
    if (!env) throw new Error('no env');
    const other = env.authenticatedContext(STUDENT_B, { email: ROSTER[STUDENT_B] }).firestore();
    await assertFails(
      setDoc(doc(other, 'resource_saves', STUDENT_A, 'items', ACTIVITY), payload(4)),
    );
  });

  it('REJECTS creating a save in another student\'s namespace', async () => {
    await clear(STUDENT_A, 'foreign-create');
    if (!env) throw new Error('no env');
    const other = env.authenticatedContext(STUDENT_B, { email: ROSTER[STUDENT_B] }).firestore();
    await assertFails(
      setDoc(
        doc(other, 'resource_saves', STUDENT_A, 'items', 'foreign-create'),
        payload(1),
      ),
    );
  });

  it('CONTROL: the same write by the owner is ALLOWED (proves the denial above is isolation)', async () => {
    await seed(STUDENT_A, 3);
    await assertSucceeds(setDoc(docRef(STUDENT_A), payload(4)));
  });

  it('REJECTS reading another student\'s save', async () => {
    await seed(STUDENT_A, 3);
    if (!env) throw new Error('no env');
    const other = env.authenticatedContext(STUDENT_B, { email: ROSTER[STUDENT_B] }).firestore();
    await assertFails(getDoc(doc(other, 'resource_saves', STUDENT_A, 'items', ACTIVITY)));
  });

  it('allows a student to read their own save', async () => {
    await seed(STUDENT_A, 3);
    await assertSucceeds(getDoc(docRef(STUDENT_A)));
  });

  it('rejects unauthenticated access', async () => {
    if (!env) throw new Error('no env');
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'resource_saves', STUDENT_A, 'items', ACTIVITY)));
  });

  it('REJECTS a payload over the 200 KB cap (single varied factor: size)', async () => {
    await clear(STUDENT_B, 'big');
    await assertFails(
      setDoc(docRef(STUDENT_B, 'big'), { ...payload(1), payload: 'x'.repeat(200001) }),
    );
  });

  it('REJECTS unexpected fields (no smuggling data outside the contract)', async () => {
    await clear(STUDENT_B, 'extra');
    await assertFails(
      setDoc(docRef(STUDENT_B, 'extra'), { ...payload(1), rogueField: 'nope' }),
    );
  });
});
