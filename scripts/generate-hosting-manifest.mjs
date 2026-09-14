/**
 * Generate lib/hosting-manifest.json from firebase.json rewrites + the
 * directory structure of public/. Consumed by
 * lib/resourceContentUrl.ts to decide whether a bare site-relative path is a
 * rewrite-backed clean URL (pass through — firebase.json rewrites it in prod)
 * or a real hosted directory (append /index.html).
 *
 * Run automatically as part of `prebuild`/`pretest` so the manifest always
 * matches the code being built/tested.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const firebase = JSON.parse(readFileSync(path.join(root, 'firebase.json'), 'utf8'));

// Rewrite sources, keyed by source -> destination. Skip the SPA catch-all.
const rewrites = {};
for (const r of firebase.hosting?.rewrites ?? []) {
  if (r.source && r.source !== '**' && r.destination) {
    rewrites[r.source] = r.destination;
  }
}

// Every directory under public/ that contains an index.html (i.e. a real
// hosted multi-file site). Reconstructed from the firebase.json rewrites too,
// so directories still work even if public/ is not checked out in some envs.
const dirs = new Set();
function walk(dir, rel) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  if (entries.includes('index.html')) dirs.add(rel);
  for (const e of entries) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, `${rel}/${e}`);
  }
}
const publicDir = path.join(root, 'public');
if (existsSync(publicDir)) walk(publicDir, '');

for (const dest of Object.values(rewrites)) {
  if (dest.endsWith('/index.html')) {
    dirs.add(dest.slice(0, -'/index.html'.length));
  }
}

const manifest = {
  generatedAt: new Date().toISOString(),
  rewrites,
  dirs: [...dirs].sort(),
};

const out = path.join(root, 'lib', 'hosting-manifest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`hosting manifest: ${Object.keys(rewrites).length} rewrites, ${dirs.size} hosted dirs -> ${path.relative(root, out)}`);
