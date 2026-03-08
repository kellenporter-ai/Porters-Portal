#!/usr/bin/env node
/**
 * Compress GLB character models with meshoptimizer via gltf-transform.
 *
 * Usage: node scripts/compress-models.mjs
 *
 * - Reads all .glb files from public/assets/models/characters/
 * - Backs up originals to public/assets/models/characters/.originals/ (first run only)
 * - Applies meshopt quantization + compression (EXT_meshopt_compression)
 * - Deduplicates accessors and prunes unused data
 * - Overwrites the .glb files in-place
 * - Idempotent: re-running produces the same output
 */

import { readdir, stat, mkdir, copyFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const MODELS_DIR = join(PROJECT_ROOT, 'public', 'assets', 'models', 'characters');
const BACKUP_DIR = join(MODELS_DIR, '.originals');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // Initialize meshoptimizer encoder/decoder
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;

  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression])
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });

  // Find all .glb files
  const files = (await readdir(MODELS_DIR)).filter(f => f.endsWith('.glb')).sort();
  if (files.length === 0) {
    console.log('No .glb files found in', MODELS_DIR);
    return;
  }

  console.log(`Found ${files.length} GLB files to compress.\n`);

  // Create backup directory if it doesn't exist
  if (!(await exists(BACKUP_DIR))) {
    await mkdir(BACKUP_DIR, { recursive: true });
    console.log(`Created backup directory: ${BACKUP_DIR}\n`);
  }

  let totalBefore = 0;
  let totalAfter = 0;

  for (const file of files) {
    const filePath = join(MODELS_DIR, file);
    const backupPath = join(BACKUP_DIR, file);

    // Get original size
    const beforeStats = await stat(filePath);
    const beforeSize = beforeStats.size;
    totalBefore += beforeSize;

    // Back up original if not already backed up
    if (!(await exists(backupPath))) {
      await copyFile(filePath, backupPath);
    }

    // Read the GLB (always from backup to ensure idempotency)
    const document = await io.read(backupPath);

    // Apply compression pipeline
    // meshopt() internally handles reorder + quantize, so no separate quantize() call needed.
    await document.transform(
      // Remove duplicate accessors/meshes
      dedup(),
      // Remove unused nodes, textures, etc.
      prune(),
      // Apply meshopt quantization + compression (EXT_meshopt_compression)
      meshopt({ encoder: MeshoptEncoder }),
    );

    // Write compressed GLB back to original location
    await io.write(filePath, document);

    // Get compressed size
    const afterStats = await stat(filePath);
    const afterSize = afterStats.size;
    totalAfter += afterSize;

    const reduction = ((1 - afterSize / beforeSize) * 100).toFixed(1);
    const beforeKB = (beforeSize / 1024).toFixed(0);
    const afterKB = (afterSize / 1024).toFixed(0);
    console.log(`  ${file.padEnd(28)} ${beforeKB.padStart(6)} KB → ${afterKB.padStart(6)} KB  (${reduction}% reduction)`);
  }

  const totalReduction = ((1 - totalAfter / totalBefore) * 100).toFixed(1);
  const totalBeforeKB = (totalBefore / 1024).toFixed(0);
  const totalAfterKB = (totalAfter / 1024).toFixed(0);

  console.log(`\n  ${'TOTAL'.padEnd(28)} ${totalBeforeKB.padStart(6)} KB → ${totalAfterKB.padStart(6)} KB  (${totalReduction}% reduction)`);
  console.log(`\nOriginals backed up to: ${BACKUP_DIR}`);
  console.log('Done.');
}

main().catch(err => {
  console.error('Compression failed:', err);
  process.exit(1);
});
