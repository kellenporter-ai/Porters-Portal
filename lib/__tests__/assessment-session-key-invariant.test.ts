/**
 * F1 invariant: no raw `assessment_session_${...}` template literal may exist
 * outside the seam module `lib/assessmentSessionKeys.ts`. All consumers must
 * build keys via the seam (user-scoped, Phase 1 R6 fix) so the legacy
 * unscoped format never regresses.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { resolve } from 'path';
import * as seam from '../assessmentSessionKeys';

const SEAM_MODULE = 'lib/assessmentSessionKeys.ts';

function grepRawKeys(): string[] {
  // Search components/ and lib/ for the raw template literal, excluding
  // test files and the seam module itself.
  const root = resolve(__dirname, '../..');
  const cmd =
    `grep -rn --include='*.ts' --include='*.tsx' -E 'assessment_session_\\$\\{' ` +
    `${root}/components ${root}/lib 2>/dev/null || true`;
  const out = execSync(cmd, { encoding: 'utf8' });
  return out
    .split('\n')
    .filter(Boolean)
    .filter(line => !line.includes(SEAM_MODULE) && !line.includes('__tests__'));
}

describe('assessment_session_ key string invariant (F1 seam drift guard)', () => {
  it('seam module exposes the canonical key builders', () => {
    expect(seam.assessmentSessionKey('u1', 'a1')).toBe('assessment_session_u1_a1');
    expect(seam.assessmentSessionSigKey('u1', 'a1')).toBe('assessment_session_u1_a1_sig');
    // Legacy unscoped format must be delete-only:
    expect(seam.legacyAssessmentSessionKey('a1')).toBe('assessment_session_a1');
  });

  it('no raw `assessment_session_${...}` literal outside the seam module', () => {
    const hits = grepRawKeys();
    expect(hits).toEqual([]);
  });
});
