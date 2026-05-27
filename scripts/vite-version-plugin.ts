import type { Plugin } from 'vite';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export function versionPlugin(): Plugin {
  return {
    name: 'vite-version-plugin',
    writeBundle(options) {
      const outDir = options.dir || 'dist';
      try {
        const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
        const buildTime = new Date().toISOString();
        const versionData = JSON.stringify({ commitHash, buildTime }, null, 2);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(resolve(outDir, 'version.json'), versionData);
        console.log(`[version-plugin] Wrote version.json → ${commitHash} @ ${buildTime}`);
      } catch {
        // Git not available or not a repo — write a fallback
        const buildTime = new Date().toISOString();
        const versionData = JSON.stringify({ commitHash: 'unknown', buildTime }, null, 2);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(resolve(outDir, 'version.json'), versionData);
      }
    },
  };
}
