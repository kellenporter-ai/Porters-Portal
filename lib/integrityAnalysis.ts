import type { Submission, LessonBlock } from '../types';
import type { Clique } from './collusionGraph';
import { detectCollusionRings } from './collusionGraph';
export type { Clique } from './collusionGraph';

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
  confidenceScore: number;
  confidenceFactors: string[];
  temporalScore: number;
  flaggedBlocks: BlockSimilarity[];
  mcMatchCount: number;
  mcTotalWrong: number;
}

export interface IntegrityReport {
  analyzedAt: string;
  totalStudents: number;
  pairsAnalyzed: number;
  flaggedPairs: SimilarityPair[];
  cliques: Clique[];
}

/** English stopwords to ignore in similarity computation */
const STOPWORDS = new Set([
  'the','and','for','are','but','not','you','all','can','had','her','was','one','our','out','day','get','has','him','his','how','its','may','new','now','old','see','two','way','who','boy','did','she','use','her','than','them','well','were','what','with','have','from','they','know','want','been','good','much','some','time','very','when','come','here','just','like','long','make','many','over','such','take','than','them','well','were','what','will','would','there','their','said','each','which','about','could','other','after','first','never','these','think','where','being','every','great','might','shall','still','those','under','while','this','that','into','back','only','also','then','most','even','more','very','before','through','between','another','because','without','against','during','however','something','someone','anyone','everyone','everything','nothing','anything','somebody','anybody','everybody','nobody'
]);

/** Normalize text for comparison: lowercase, strip punctuation, collapse whitespace */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

/** Tokenize into filtered words (no stopwords, min length 3) */
function tokenize(text: string): string[] {
  const normalized = normalize(text);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

/** Compute term frequency map */
function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  return tf;
}

/** Compute TF-IDF vector from term frequencies and IDF map */
function tfidfVector(tf: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const vec = new Map<string, number>();
  for (const [term, freq] of tf) {
    const idfVal = idf.get(term) || 0;
    vec.set(term, freq * idfVal);
  }
  return vec;
}

/** Cosine similarity between two TF-IDF vectors (0–1) */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, valA] of a) {
    const valB = b.get(term) || 0;
    dot += valA * valB;
    normA += valA * valA;
  }
  for (const val of b.values()) {
    normB += val * val;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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
 *  Uses character trigram Jaccard (40%) + word-level Jaccard (20%) + TF-IDF cosine (40%). */
export function textSimilarity(rawA: string, rawB: string, idf?: Map<string, number>): number {
  const a = normalize(rawA);
  const b = normalize(rawB);
  if (!a || !b) return 0;
  // Too short for n-gram comparison — require exact match only if long enough
  if (a.length < 15 || b.length < 15) return a === b ? 1 : 0;

  const triSim = jaccard(charNgrams(a, 3), charNgrams(b, 3));

  const wA = new Set(a.split(' ').filter(w => w.length > 2));
  const wB = new Set(b.split(' ').filter(w => w.length > 2));
  const wordSim = jaccard(wA, wB);

  // Semantic similarity via TF-IDF cosine (if IDF corpus provided)
  let semanticSim = 0;
  if (idf && idf.size > 0) {
    const tokensA = tokenize(rawA);
    const tokensB = tokenize(rawB);
    if (tokensA.length > 0 && tokensB.length > 0) {
      const tfA = termFreq(tokensA);
      const tfB = termFreq(tokensB);
      const vecA = tfidfVector(tfA, idf);
      const vecB = tfidfVector(tfB, idf);
      semanticSim = cosineSimilarity(vecA, vecB);
    }
  }

  return triSim * 0.4 + wordSim * 0.2 + semanticSim * 0.4;
}

/** Extract the text string from a block response object */
function extractText(resp: unknown, type: string): string {
  if (!resp) return '';
  if (typeof resp === 'string') return resp;
  const r = resp as Record<string, unknown>;
  if (type === 'SHORT_ANSWER') return String(r.answer || '');
  return String(r.answer || r.text || r.content || '');
}

/** Build IDF map from all text responses in the corpus */
function buildIdf(
  submissions: Submission[],
  lessonBlocks: LessonBlock[]
): Map<string, number> {
  const textBlocks = lessonBlocks.filter(b => b.type === 'SHORT_ANSWER' || b.type === 'LINKED');
  const docFreq = new Map<string, number>();
  let docCount = 0;

  for (const sub of submissions) {
    if (!sub.blockResponses) continue;
    let hasText = false;
    const seenTerms = new Set<string>();
    for (const block of textBlocks) {
      const text = extractText(sub.blockResponses[block.id], block.type);
      const tokens = tokenize(text);
      if (tokens.length > 0) hasText = true;
      for (const t of tokens) {
        if (!seenTerms.has(t)) {
          seenTerms.add(t);
          docFreq.set(t, (docFreq.get(t) || 0) + 1);
        }
      }
    }
    if (hasText) docCount++;
  }

  const idf = new Map<string, number>();
  for (const [term, df] of docFreq) {
    idf.set(term, Math.log(docCount / df) + 1);
  }
  return idf;
}

/** Compute telemetry-based confidence boost and temporal score for a pair */
function computeTelemetryConfidence(
  a: Submission,
  b: Submission
): { score: number; temporalScore: number; factors: string[] } {
  const factors: string[] = [];
  let score = 0;
  let temporalScore = 0;

  const metricsA = a.metrics;
  const metricsB = b.metrics;

  if (metricsA && metricsB) {
    // Both have high paste count
    if (metricsA.pasteCount > 3 && metricsB.pasteCount > 3) {
      score += 15;
      factors.push('Both students have elevated paste counts');
    }

    // Both have very low engagement
    if (metricsA.engagementTime < 120 && metricsB.engagementTime < 120) {
      score += 15;
      factors.push('Both submitted with very low engagement time');
    }

    // Both have zero keystrokes (pure paste)
    if (metricsA.keystrokes === 0 && metricsB.keystrokes === 0) {
      score += 20;
      factors.push('Both have zero keystrokes — possible pure paste');
    }

    // Both have excessive tab switching
    if ((metricsA.tabSwitchCount || 0) > 3 && (metricsB.tabSwitchCount || 0) > 3) {
      score += 10;
      factors.push('Both students switched tabs frequently');
    }
  }

  // Temporal analysis: submissions within close proximity
  if (a.submittedAt && b.submittedAt) {
    const tA = new Date(a.submittedAt).getTime();
    const tB = new Date(b.submittedAt).getTime();
    if (!isNaN(tA) && !isNaN(tB)) {
      const diffMs = Math.abs(tA - tB);
      if (diffMs < 30000) {
        temporalScore += 50;
        factors.push('Submissions within 30 seconds — strong temporal collusion signal');
      } else if (diffMs < 120000) {
        temporalScore += 25;
        factors.push('Submissions within 2 minutes — moderate temporal collusion signal');
      }
    }
  }

  // TODO: Phase 3.5 extension — per-block save timestamps from lesson_block_responses
  // If both students saved the same block within 5 seconds, add up to 50 temporalScore points.

  return { score: Math.min(100, score), temporalScore: Math.min(100, temporalScore), factors };
}

/** Analyze assessment submissions for potential copying between students.
 *  Compares text responses (n-gram Jaccard + TF-IDF cosine) and MC wrong-answer patterns. */
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

  // Build TF-IDF corpus for semantic similarity
  const idf = buildIdf(subs, lessonBlocks);

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

        const sim = textSimilarity(tA, tB, idf);
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

      // Telemetry confidence scoring
      const telemetryConf = computeTelemetryConfidence(a, b);

      if (flaggedBlocks.length > 0 || overall >= threshold * 100 || mcSuspicious) {
        const confidenceScore = Math.min(100, overall + telemetryConf.score + telemetryConf.temporalScore);
        flaggedPairs.push({
          studentA: { userId: a.userId, userName: a.userName },
          studentB: { userId: b.userId, userName: b.userName },
          overallSimilarity: overall,
          confidenceScore,
          confidenceFactors: telemetryConf.factors,
          temporalScore: telemetryConf.temporalScore,
          flaggedBlocks,
          mcMatchCount: mcMatch,
          mcTotalWrong: mcWrong,
        });
      }
    }
  }

  // Sort by combined signal: confidence score (includes temporal) + MC match ratio (weighted)
  flaggedPairs.sort((a, b) => {
    const aScore = a.confidenceScore + (a.mcTotalWrong > 0 ? (a.mcMatchCount / a.mcTotalWrong) * 50 : 0);
    const bScore = b.confidenceScore + (b.mcTotalWrong > 0 ? (b.mcMatchCount / b.mcTotalWrong) * 50 : 0);
    return bScore - aScore;
  });

  // Detect collusion rings (cliques of 3+ mutually similar students)
  const cliques = detectCollusionRings(flaggedPairs, 60, 3);

  return {
    analyzedAt: new Date().toISOString(),
    totalStudents: subs.length,
    pairsAnalyzed: Math.floor((subs.length * (subs.length - 1)) / 2),
    flaggedPairs,
    cliques,
  };
}
