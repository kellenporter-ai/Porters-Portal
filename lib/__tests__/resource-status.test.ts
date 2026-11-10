/**
 * resourceStatus — label selection for the student Resources tab.
 *
 * Non-assessment resources have nothing to submit, so they use a durable
 * two-state open record ("New" → "Opened") instead of the completion-style
 * "Not started" / "In progress" vocabulary. Assessments are unchanged.
 */
import { describe, it, expect } from 'vitest';
import { resourceStatusLabel, type ResourceStatusLabelKey } from '../resourceStatus';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

describe('resourceStatusLabel', () => {
  it('assessments always use the submission vocabulary', () => {
    expect(resourceStatusLabel(true, false)).toBe('resources.notSubmitted');
    expect(resourceStatusLabel(true, true)).toBe('resources.notSubmitted');
  });

  it('non-assessments are "New" until opened', () => {
    expect(resourceStatusLabel(false, false)).toBe('resources.new');
  });

  it('non-assessments are "Opened" once opened', () => {
    expect(resourceStatusLabel(false, true)).toBe('resources.opened');
  });

  it('never returns the retired completion-style keys', () => {
    const retired = ['resources.notStarted', 'resources.inProgressShort'];
    for (const isAssessment of [true, false]) {
      for (const isOpened of [true, false]) {
        expect(retired).not.toContain(resourceStatusLabel(isAssessment, isOpened));
      }
    }
  });
});

describe('resourceStatusLabel i18n coverage', () => {
  const allKeys: ResourceStatusLabelKey[] = [
    'resources.notSubmitted',
    'resources.opened',
    'resources.new',
  ];

  it('every returnable key resolves in EN', () => {
    for (const key of allKeys) {
      expect(en[key], `missing EN key ${key}`).toBeTruthy();
    }
  });

  it('every returnable key resolves in ES', () => {
    for (const key of allKeys) {
      expect(es[key], `missing ES key ${key}`).toBeTruthy();
    }
  });

  it('the decision function is exhaustive over its return type', () => {
    const produced = new Set<string>();
    for (const isAssessment of [true, false]) {
      for (const isOpened of [true, false]) {
        produced.add(resourceStatusLabel(isAssessment, isOpened));
      }
    }
    expect([...produced].sort()).toEqual([...allKeys].sort());
  });
});
