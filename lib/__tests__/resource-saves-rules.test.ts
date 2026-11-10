/**
 * resource_saves rules — behavioral proof against the Firestore emulator.
 *
 * A rules file that COMPILES proves nothing. These tests assert the two things
 * that matter:
 *   1. a stale write (wrong rev) is REJECTED — this is what stops one device
 *      silently destroying another device's newer work
 *   2. a user cannot read or write another student's saves
 *
 * Run: firebase emulators:exec --only firestore "npx vitest run lib/__tests__/resource-saves-rules.test.ts"
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * These tests need the Firestore emulator, which needs a JVM. On a machine with
 * no Java they are SKIPPED, not silently passed — a rules suite that "passes"
 * without running is exactly the false green this file exists to prevent.
 *
 * Run properly:
 *   firebase emulators:exec --only firestore --project porters-portal-rules-test \
 *     "npx vitest run lib/__tests__/resource-saves-rules.test.ts"
 */
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

function payload(rev: number, body = '{"answers":[]}') {
  return {
    payload: body,
    rev,
    schemaVersion: 1,
    updatedAt: new Date(), // request.time in the emulator
  };
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
    console.warn('[rules] emulator unavailable — suite will not assert:', String(e).slice(0, 200));
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
    await assertSucceeds(
      setDoc(doc(db(STUDENT_A), 'resource_saves', STUDENT_A, 'items', ACTIVITY), payload(1)),
    );
  });

  it('allows an in-order update (rev 1 -> 2)', async () => {
    await assertSucceeds(
      setDoc(doc(db(STUDENT_A), 'resource_saves', STUDENT_A, 'items', ACTIVITY), payload(2)),
    );
  });

  it('REJECTS a stale update that does not increment rev', async () => {
    // A second tab still believes it is on rev 2 and writes rev 2 again.
    await assertFails(
      setDoc(doc(db(STUDENT_A), 'resource_saves', STUDENT_A, 'items', ACTIVITY), payload(2)),
    );
  });

  it('REJECTS a write that skips rev numbers', async () => {
    await assertFails(
      setDoc(doc(db(STUDENT_A), 'resource_saves', STUDENT_A, 'items', ACTIVITY), payload(9)),
    );
  });

  it('REJECTS a create that does not start at rev 1', async () => {
    await assertFails(
      setDoc(doc(db(STUDENT_B), 'resource_saves', STUDENT_B, 'items', 'other-activity'), payload(5)),
    );
  });

  it('REJECTS writing another student\'s save', async () => {
    await assertFails(
      setDoc(doc(db(STUDENT_B), 'resource_saves', STUDENT_A, 'items', ACTIVITY), payload(3)),
    );
  });

  it('REJECTS reading another student\'s save', async () => {
    await assertFails(
      getDoc(doc(db(STUDENT_B), 'resource_saves', STUDENT_A, 'items', ACTIVITY)),
    );
  });

  it('allows a student to read their own save', async () => {
    await assertSucceeds(
      getDoc(doc(db(STUDENT_A), 'resource_saves', STUDENT_A, 'items', ACTIVITY)),
    );
  });

  it('rejects unauthenticated access', async () => {
    const anon = (env as RulesTestEnvironment).unauthenticatedContext().firestore();
    await assertFails(
      getDoc(doc(anon, 'resource_saves', STUDENT_A, 'items', ACTIVITY)),
    );
  });

  it('REJECTS a payload over the 200 KB cap', async () => {
    const huge = 'x'.repeat(200001);
    await assertFails(
      setDoc(doc(db(STUDENT_B), 'resource_saves', STUDENT_B, 'items', 'big'), {
        ...payload(1),
        payload: huge,
      }),
    );
  });

  it('REJECTS unexpected fields (no smuggling data outside the contract)', async () => {
    await assertFails(
      setDoc(doc(db(STUDENT_B), 'resource_saves', STUDENT_B, 'items', 'extra'), {
        ...payload(1),
        rogueField: 'should not be allowed',
      }),
    );
  });
});
