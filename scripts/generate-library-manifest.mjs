// Build-time manifest generator for the Hosted Content Library.
// Run: node scripts/generate-library-manifest.mjs  (wired as a `prebuild` step)
//
// Scans public/ for standalone HTML content files (including public/tools/
// and public/textbook/*/index.html), excludes the SPA root index.html, and
// writes public/library-manifest.json. The deployed manifest is fetched by
// the `scanLibraryItems` Cloud Function to detect new bundled content.

import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const OUT_FILE = join(PUBLIC_DIR, 'library-manifest.json');

/** Return public-URL paths of standalone HTML content files under public/. */
function scan(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scan(abs));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const rel = relative(PUBLIC_DIR, abs).split(sep).join('/');
      if (rel === 'index.html') continue; // SPA entry — not library content
      // Textbook chapters index at their directory: /textbook/ch2-kinematics-1d/
      const path = rel.endsWith('/index.html')
        ? `/${rel.slice(0, -'index.html'.length)}`
        : `/${rel}`;
      results.push(path);
    }
  }
  return results;
}

const items = scan(PUBLIC_DIR)
  .sort()
  .map((path) => {
    const rel = path.replace(/^\//, '');
    const abs = join(PUBLIC_DIR, rel.endsWith('/') ? `${rel}index.html` : rel);
    const stat = statSync(abs);
    return {
      path,
      fingerprint: path, // stable dedup key — the URL path
      sizeBytes: stat.size,
    };
  });

const manifest = {
  generatedAt: new Date().toISOString(),
  items,
};

writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2) + '\n');
console.log(`library-manifest.json: ${items.length} item(s)`);
for (const item of items) console.log(`  ${item.path} (${item.sizeBytes} B)`);
