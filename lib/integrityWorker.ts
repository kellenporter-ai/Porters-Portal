/**
 * Web Worker for offloading integrity analysis.
 * Prevents UI freezing when analyzing large classes (> 60 students).
 *
 * Usage:
 *   const worker = new Worker(new URL('./integrityWorker.ts', import.meta.url), { type: 'module' });
 *   worker.postMessage({ submissions, lessonBlocks, threshold });
 *   worker.onmessage = (e) => { const report = e.data; ... };
 */

import { analyzeIntegrity } from './integrityAnalysis';
import type { Submission, LessonBlock } from '../types';

interface WorkerMessage {
  submissions: Submission[];
  lessonBlocks: LessonBlock[];
  threshold?: number;
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { submissions, lessonBlocks, threshold = 0.7 } = event.data;
  try {
    const report = analyzeIntegrity(submissions, lessonBlocks, threshold);
    self.postMessage({ type: 'success', report });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: 'error', message });
  }
};

export {};
