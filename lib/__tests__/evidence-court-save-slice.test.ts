/**
 * Pilot slice — save layer wiring for a STANDALONE activity (evidence-court.html).
 *
 * This activity has no portalBridge (postMessage) path: its only remote transport
 * is portal-save.js over REST, which the emulator-proven Firestore rules cover.
 * That is why it was chosen as the pilot — one remote writer, no arbitration.
 *
 * The tests below assert the properties that matter for "a wipe must not destroy
 * student work", not implementation details.
 *
 * Run:
 *   firebase emulators:exec --only firestore --project porters-portal-rules-test \
 *     "npx vitest run lib/__tests__/evidence-court-save-slice.test.ts"
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

function hasJava(): boolean {
  try {
    execSync('java -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const JAVA = hasJava();
const suite = JAVA ? describe : describe.skip;

const SRC = readFileSync(
  resolve(__dirname, '../../public/evidence-court.html'),
  'utf8',
);

let env: RulesTestEnvironment | undefined;
const ACTIVITY = 'evidence-court';
const STUDENT = 'studentA';
const STUDENT_EMAIL = 'student.a@students.pahs.edu';

beforeAll(async () => {
  if (!JAVA) return;
  env = await initializeTestEnvironment({
    projectId: 'porters-portal-rules-test',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
  });
  // The rules gate writes on the allowed_emails whitelist (the apiKey is public,
  // so any Google account can otherwise sign in). Seed it before any client runs.
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'allowed_emails', STUDENT_EMAIL), { classType: 'test' });
    });
  } catch (e) {
    if (!/already been started/.test(String(e))) throw e;
  }
});

afterAll(async () => {
  if (env) await env.cleanup();
});

function payload(rev: number, body: unknown) {
  return {
    payload: JSON.stringify(body),
    rev,
    schemaVersion: 1,
    updatedAt: serverTimestamp(),
  };
}

suite('evidence-court pilot slice — activity wiring', () => {
  it('loads portal-save.js (the only remote transport)', () => {
    expect(SRC).toContain('/portal-save.js');
  });

  it('does NOT load portalBridge.js (that would create a second writer)', () => {
    expect(SRC).not.toContain('portalBridge.js');
  });

  it('declares the activity id the rules will key on', () => {
    expect(SRC).toMatch(/ACTIVITY_ID\s*=\s*['"]evidence-court['"]/);
  });

  it('keeps the local device save as a fallback that is NOT gated behind auth', () => {
    // A save that requires a network round-trip before touching the device would
    // turn a re-login into a data-loss event.
    expect(SRC).toContain('saveToDevice');
    expect(SRC).toContain('localStorage.setItem');
  });

  it('never reports success from the local write alone', () => {
    // The green/saved state must be driven by a server acknowledgement.
    // The local setItem must not be the thing that produces the success message.
    const localSave = SRC.slice(SRC.indexOf('function saveToDevice'));
    const fn = localSave.slice(0, localSave.indexOf('\n}\n') + 3);
    expect(fn).not.toMatch(/setStatus\(\s*t\('savedOk'\)\s*\)\s*;?\s*\}\s*$/m);
  });
});

suite('evidence-court pilot slice — durability contract', () => {
  function ref() {
    if (!env) throw new Error('no env');
    const db = env.authenticatedContext(STUDENT, { email: STUDENT_EMAIL }).firestore();
    return doc(db, 'resource_saves', STUDENT, 'items', ACTIVITY);
  }

  it('a student can persist this activity payload to the server', async () => {
    await assertSucceeds(
      setDoc(ref(), payload(1, { group: 'P1', story: 'x', exhibits: [] })),
    );
  });

  it('the persisted payload round-trips byte-identically', async () => {
    // "Byte-match" is the acceptance criterion for a wipe recovery. If the
    // server cannot return exactly what was sent, the student gets a mutated
    // version of their work back.
    const original = {
      group: 'P1',
      story: 'line one\nline two — em dash, "quotes", è ünïcode',
      exhibits: [
        { text: 'a', claim: 'i' },
        { text: 'b', claim: 'c' },
      ],
    };
    await assertSucceeds(setDoc(ref(), payload(2, original)));
    if (!env) throw new Error('no env');
    const snap = await assertSucceeds(getDoc(ref())) as unknown as {
      data(): { payload: string };
    };
    expect(JSON.parse(snap.data().payload)).toEqual(original);
    expect(snap.data().payload).toBe(JSON.stringify(original));
  });

  it('a stale tab cannot overwrite a newer revision', async () => {
    await assertSucceeds(setDoc(ref(), payload(3, { group: 'P1', story: 'newer', exhibits: [] })));
    await assertFails(setDoc(ref(), payload(3, { group: 'P1', story: 'older', exhibits: [] })));
  });

  it('rejects an oversized payload instead of silently truncating', async () => {
    await assertFails(
      setDoc(ref(), {
        payload: 'x'.repeat(200_001),
        rev: 4,
        schemaVersion: 1,
        updatedAt: serverTimestamp(),
      }),
    );
  });
});
