// Audit Phase 2.1 (Task F): vitest config for pure-logic unit tests of compiled
// Cloud Functions modules. Run AFTER `tsc` (npm run build) — tests import lib/.
// Usage: cd functions && npm run build && npm test
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // firebase-admin is not installed under the ROOT node_modules (it lives in
      // functions/node_modules); map it there so vitest resolves it from the CWD.
      'firebase-admin': r('./node_modules/firebase-admin'),
    },
  },
  test: {
    include: ['__tests__/**/*.test.mjs'],
    environment: 'node',
  },
});
