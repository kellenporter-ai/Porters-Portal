/**
 * resourceStatus — pure label selection for the student Resources tab.
 *
 * Assessments keep the submission-oriented vocabulary ("Not submitted").
 * Non-assessments have nothing to submit, so they use a durable two-state
 * open record instead: "New" until the student opens the resource, then
 * "Opened". The open record lives in `resource_opens` (never swept), unlike
 * `resource_sessions` which has a 24h TTL.
 */

export type ResourceStatusLabelKey =
  | 'resources.notSubmitted'
  | 'resources.opened'
  | 'resources.new';

export function resourceStatusLabel(
  isAssessment: boolean,
  isOpened: boolean,
): ResourceStatusLabelKey {
  if (isAssessment) return 'resources.notSubmitted';
  return isOpened ? 'resources.opened' : 'resources.new';
}
