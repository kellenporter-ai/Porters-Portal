import type { Assignment, Submission } from '../types';

export type PracticeCompletion = Record<
  string,
  { completed: boolean; totalCompletions: number; bestScore: number | null; completedAt: string | null }
>;

/** Compute unit progress: {completed, total, pct}. Only "completable"
 *  items count toward the total: assessments, and resources with lesson
 *  blocks (practice completions). Pure reading resources (no blocks, not
 *  an assessment) can never be completed, so a unit made up only of them
 *  reports total === 0 and renders a "Reading" tag instead of a
 *  progress bar. */
export function computeUnitProgress(
  items: Array<Pick<Assignment, 'id' | 'isAssessment' | 'lessonBlocks' | 'blockCount'>>,
  practiceCompletion: PracticeCompletion,
  submissions: Pick<Submission, 'assignmentId' | 'isAssessment' | 'status'>[],
): { completed: number; total: number; pct: number } {
  let completed = 0;
  let total = 0;
  for (const r of items) {
    const isCompletable = !!r.isAssessment || (r.lessonBlocks?.length ?? r.blockCount ?? 0) > 0;
    if (!isCompletable) continue;
    total += 1;
    if (practiceCompletion[r.id]?.completed) { completed += 1; continue; }
    if (r.isAssessment) {
      const sub = submissions.find(s => s.assignmentId === r.id && s.isAssessment);
      if (sub && sub.status !== 'STARTED') { completed += 1; continue; }
    }
  }
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, pct };
}
