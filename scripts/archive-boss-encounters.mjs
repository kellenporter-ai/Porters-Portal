#!/usr/bin/env node
/**
 * Archive the legacy boss_encounters collection without modifying Firestore.
 *
 * Usage:
 *   node scripts/archive-boss-encounters.mjs --dry-run
 *   node scripts/archive-boss-encounters.mjs
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SCRIPT_DIR, '..');
const CREDENTIALS_PATH = fileURLToPath(new URL('../../../tools/service-account.json', import.meta.url));
const COLLECTION = 'boss_encounters';
const SUBCOLLECTIONS = ['shards', 'damage_log'];
const dryRun = process.argv.includes('--dry-run');

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

async function initializeFirestore() {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error('Firebase Admin credentials are unavailable; configure the expected service-account file before archiving.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(await readFile(CREDENTIALS_PATH, 'utf8'));
  } catch {
    throw new Error('Firebase Admin credentials could not be read or parsed; verify the service-account file.');
  }

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.firestore();
}

async function main() {
  const db = await initializeFirestore();
  const encounterRefs = await db.collection(COLLECTION).listDocuments();
  const documents = [];
  const subcollections = Object.fromEntries(SUBCOLLECTIONS.map((name) => [name, []]));
  const counts = Object.fromEntries(SUBCOLLECTIONS.map((name) => [name, 0]));

  for (const encounterRef of encounterRefs) {
    if (!dryRun) {
      const snapshot = await encounterRef.get();
      documents.push({ id: snapshot.id, path: snapshot.ref.path, data: snapshot.data() ?? null });
    }

    for (const name of SUBCOLLECTIONS) {
      const childRefs = await encounterRef.collection(name).listDocuments();
      counts[name] += childRefs.length;
      if (dryRun) continue;

      for (const childRef of childRefs) {
        const snapshot = await childRef.get();
        subcollections[name].push({
          encounterId: encounterRef.id,
          id: snapshot.id,
          path: snapshot.ref.path,
          data: snapshot.data() ?? null,
        });
      }
    }
  }

  console.log(`${COLLECTION}: ${encounterRefs.length} document(s)`);
  for (const name of SUBCOLLECTIONS) {
    console.log(`${COLLECTION}/*/${name}: ${counts[name]} document(s)`);
  }

  if (dryRun) {
    console.log('Dry run complete; no archive file or Firestore data was written.');
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const archiveDir = join(PROJECT_ROOT, 'archives');
  const archivePath = join(archiveDir, `boss_encounters-${date}.json`);
  await mkdir(archiveDir, { recursive: true });
  await writeFile(archivePath, `${JSON.stringify({
    exportedAt: new Date().toISOString(),
    collection: COLLECTION,
    documents,
    subcollections,
  }, null, 2)}\n`, 'utf8');
  console.log(`Archive written to ${archivePath}`);
}

main().catch((error) => {
  console.error(`Boss encounter archive failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
