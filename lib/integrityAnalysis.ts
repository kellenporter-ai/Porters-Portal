import type { Submission, LessonBlock } from '../types';

export interface BlockSimilarity {
  blockId: string;
  question: string;
  similarity: number;
  textA: string;
  textB: string;
}

export interface SimilarityPair {
  studentA: { userId: string; userName: string };
  studentB: { userId: string; userName: string };
  overallSimilarity: number;
  flaggedBlocks: BlockSimilarity[];
  mcMatchCount: number;
  mcTotalWrong: number;
}

export interface IntegrityReport {
  analyzedAt: string;
  totalStudents: number;
  pairsAnalyzed: number;
  flaggedPairs: SimilarityPair[];
}

/** Normalize text for comparison: lowercase, strip punctuation, collapse whitespace */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

/** Generate character n-grams (shingles) from text */
function charNgrams(text: string, n: number): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i <= text.length - n; i++) grams.add(text.slice(i, i + n));
  return grams;
}

/** Jaccard similarity coefficient between two sets */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of smaller) if (larger.has(item)) intersection++;
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Compute text similarity between two responses (0–1 scale).
 *  Uses character trigram Jaccard (60%) + word-level Jaccard (40%). */
export function textSimilarity(rawA: string, rawB: string): number {
  const a = normalize(rawA);
  const b = normalize(rawB);
  if (!a || !b) return 0;
  if (a === b) return 1;
  // Too short for n-gram comparison — require exact match
  if (a.length < 15 || b.length < 15) return 0;
  const triSim = jaccard(charNgrams(a, 3), charNgrams(b, 3));
  const wA = new Set(a.split(' ').filter(w => w.length > 2));
  const wB = new Set(b.split(' ').filter(w => w.length > 2));
  const wordSim = jaccard(wA, wB);
  return triSim * 0.6 + wordSim * 0.4;
}

/** Extract the text string from a block response object */
function extractText(resp: unknown, type: string): string {
  if (!resp) return '';
  if (typeof resp === 'string') return resp;
  const r = resp as Record<string, unknown>;
  if (type === 'SHORT_ANSWER') return String(r.answer || '');
  return String(r.answer || r.text || r.content || '');
}

/** Analyze assessment submissions for potential copying between students.
 *  Compares text responses (n-gram Jaccard) and MC wrong-answer patterns. */
export function analyzeIntegrity(
  submissions: Submission[],
  lessonBlocks: LessonBlock[],
  threshold = 0.7
): IntegrityReport {
  // Use latest attempt per student only
  const latest = new Map<string, Submission>();
  for (const sub of submissions) {
    const prev = latest.get(sub.userId);
    if (!prev || (sub.attemptNumber || 1) > (prev.attemptNumber || 1))
      latest.set(sub.userId, sub);
  }
  const subs = Array.from(latest.values());

  const textBlocks = lessonBlocks.filter(b => b.type === 'SHORT_ANSWER' || b.type === 'LINKED');
  const mcBlocks = lessonBlocks.filter(b => b.type === 'MC');

  const flaggedPairs: SimilarityPair[] = [];

  for (let i = 0; i < subs.length; i++) {
    for (let j = i + 1; j < subs.length; j++) {
      const a = subs[i], b = subs[j];
      if (!a.blockResponses || !b.blockResponses) continue;

      // ── Text similarity ──
      const flaggedBlocks: BlockSimilarity[] = [];
      let simSum = 0, compared = 0;

      for (const block of textBlocks) {
        const tA = extractText(a.blockResponses[block.id], block.type);
        const tB = extractText(b.blockResponses[block.id], block.type);
        // Skip empty / too-short responses
        if (!tA || !tB || tA.split(/\s+/).length < 3 || tB.split(/\s+/).length < 3) continue;
        // Skip if both answers marked correct (expected similarity)
        const rA = a.assessmentScore?.perBlock?.[block.id];
        const rB = b.assessmentScore?.perBlock?.[block.id];
        if (rA?.correct && rB?.correct) continue;

        const sim = textSimilarity(tA, tB);
        compared++;
        simSum += sim;
        if (sim >= threshold) {
          flaggedBlocks.push({
            blockId: block.id,
            question: block.content || '',
            similarity: Math.round(sim * 100),
            textA: tA,
            textB: tB,
          });
        }
      }

      // ── MC wrong-answer pattern matching ──
      // Only count questions where BOTH students answered incorrectly
      let mcMatch = 0, mcWrong = 0;
      for (const block of mcBlocks) {
        if (block.correctAnswer == null) continue; // skip blocks without answer key
        const rA = a.blockResponses[block.id] as { selected?: number } | undefined;
        const rB = b.blockResponses[block.id] as { selected?: number } | undefined;
        if (rA?.selected == null || rB?.selected == null) continue;
        const aWrong = rA.selected !== block.correctAnswer;
        const bWrong = rB.selected !== block.correctAnswer;
        if (aWrong && bWrong) {
          mcWrong++;
          if (rA.selected === rB.selected) mcMatch++;
        }
      }

      const overall = compared > 0 ? Math.round((simSum / compared) * 100) : 0;
      const mcSuspicious = mcWrong >= 3 && mcMatch / mcWrong >= 0.75;

      if (flaggedBlocks.length > 0 || overall >= threshold * 100 || mcSuspicious) {
        flaggedPairs.push({
          studentA: { userId: a.userId, userName: a.userName },
          studentB: { userId: b.userId, userName: b.userName },
          overallSimilarity: overall,
          flaggedBlocks,
          mcMatchCount: mcMatch,
          mcTotalWrong: mcWrong,
        });
      }
    }
  }

  // Sort by combined signal: text similarity + MC match ratio (weighted)
  flaggedPairs.sort((a, b) => {
    const aScore = a.overallSimilarity + (a.mcTotalWrong > 0 ? (a.mcMatchCount / a.mcTotalWrong) * 50 : 0);
    const bScore = b.overallSimilarity + (b.mcTotalWrong > 0 ? (b.mcMatchCount / b.mcTotalWrong) * 50 : 0);
    return bScore - aScore;
  });

  return {
    analyzedAt: new Date().toISOString(),
    totalStudents: subs.length,
    pairsAnalyzed: Math.floor((subs.length * (subs.length - 1)) / 2),
    flaggedPairs,
  };
}
