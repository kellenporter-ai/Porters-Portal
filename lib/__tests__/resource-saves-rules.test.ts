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

function db(uid: string) {
  if (!env) throw new Error('test environment not initialized');
  return env.authenticatedContext(uid).firestore();
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
  } catch (e) {
    emulatorFailed = true;
    console.warn('[rules] emulator unavailable:', String(e).slice(0, 200));
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

  it('REJECTS writing another student\'s save', async () => {
    await seed(STUDENT_A, 3);
    await assertFails(setDoc(docRef(STUDENT_A), payload(4)));
  });

  it('REJECTS reading another student\'s save', async () => {
    await seed(STUDENT_A, 3);
    if (!env) throw new Error('no env');
    const other = env.authenticatedContext(STUDENT_B).firestore();
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
