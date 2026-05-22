import type { SimilarityPair } from './integrityAnalysis';

export interface Clique {
  /** Student IDs in the clique */
  members: string[];
  /** Human-readable names */
  memberNames: string[];
  /** Number of students in the clique */
  size: number;
  /** Average confidence score across all edges in the clique */
  avgConfidence: number;
  /** Maximum confidence score of any edge */
  maxConfidence: number;
  /** All pair indices that form this clique (references into the flaggedPairs array) */
  pairIndices: number[];
}

/**
 * Build an adjacency list from flagged pairs.
 * Only includes edges where confidenceScore >= minConfidence.
 */
function buildAdjacencyList(
  pairs: SimilarityPair[],
  minConfidence: number
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const pair of pairs) {
    if (pair.confidenceScore < minConfidence) continue;
    const a = pair.studentA.userId;
    const b = pair.studentB.userId;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  return adj;
}

/**
 * Find all maximal cliques of size >= minSize using Bron–Kerbosch with pivoting.
 * This is exponential in the worst case, but graphs here are small (< 100 nodes).
 */
function bronKerbosch(
  adj: Map<string, Set<string>>,
  R: Set<string>,
  P: Set<string>,
  X: Set<string>,
  cliques: Set<string>[]
): void {
  if (P.size === 0 && X.size === 0) {
    cliques.push(new Set(R));
    return;
  }
  // Pivot: choose vertex in P ∪ X with max degree in P
  const union = new Set([...P, ...X]);
  let pivot = '';
  let maxDeg = -1;
  for (const u of union) {
    const neighbors = adj.get(u) || new Set();
    const deg = [...P].filter(v => neighbors.has(v)).length;
    if (deg > maxDeg) {
      maxDeg = deg;
      pivot = u;
    }
  }
  const pivotNeighbors = adj.get(pivot) || new Set();
  const candidates = [...P].filter(v => !pivotNeighbors.has(v));
  for (const v of candidates) {
    const vNeighbors = adj.get(v) || new Set();
    bronKerbosch(
      adj,
      new Set([...R, v]),
      new Set([...P].filter(u => vNeighbors.has(u))),
      new Set([...X].filter(u => vNeighbors.has(u))),
      cliques
    );
    P.delete(v);
    X.add(v);
  }
}

/**
 * Detect collusion rings (cliques of size >= 3) from flagged similarity pairs.
 *
 * @param pairs — flagged similarity pairs from analyzeIntegrity
 * @param minConfidence — minimum confidence score for an edge to be considered (default 60)
 * @param minSize — minimum clique size to report (default 3)
 */
export function detectCollusionRings(
  pairs: SimilarityPair[],
  minConfidence = 60,
  minSize = 3
): Clique[] {
  if (pairs.length === 0) return [];

  const adj = buildAdjacencyList(pairs, minConfidence);
  const allNodes = new Set(adj.keys());
  const cliques: Set<string>[] = [];

  bronKerbosch(adj, new Set(), new Set(allNodes), new Set(), cliques);

  // Filter by minSize and deduplicate (same set of members)
  const seen = new Set<string>();
  const result: Clique[] = [];

  for (const clique of cliques) {
    if (clique.size < minSize) continue;
    const key = [...clique].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    // Compute avg/max confidence across all edges in the clique
    let totalConf = 0;
    let edgeCount = 0;
    let maxConf = 0;
    const members = [...clique];
    const pairIndices: number[] = [];

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const pair = pairs.find(
          p =>
            (p.studentA.userId === members[i] && p.studentB.userId === members[j]) ||
            (p.studentA.userId === members[j] && p.studentB.userId === members[i])
        );
        if (pair) {
          totalConf += pair.confidenceScore;
          maxConf = Math.max(maxConf, pair.confidenceScore);
          edgeCount++;
          const idx = pairs.indexOf(pair);
          if (idx >= 0 && !pairIndices.includes(idx)) pairIndices.push(idx);
        }
      }
    }

    if (edgeCount === 0) continue;

    // Map IDs to names
    const nameMap = new Map<string, string>();
    for (const pair of pairs) {
      nameMap.set(pair.studentA.userId, pair.studentA.userName);
      nameMap.set(pair.studentB.userId, pair.studentB.userName);
    }

    result.push({
      members,
      memberNames: members.map(id => nameMap.get(id) || id),
      size: members.length,
      avgConfidence: Math.round(totalConf / edgeCount),
      maxConfidence: maxConf,
      pairIndices,
    });
  }

  // Sort by size desc, then avgConfidence desc
  result.sort((a, b) => {
    if (b.size !== a.size) return b.size - a.size;
    return b.avgConfidence - a.avgConfidence;
  });

  return result;
}
