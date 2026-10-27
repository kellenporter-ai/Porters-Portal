// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { resolveBankTopicId, slugifyBankTopicId } from '../../components/xp/QuestionBankFormModal';
import TopicMasteryAnalytics from '../../components/dashboard/TopicMasteryAnalytics';
import { LocaleProvider } from '../i18n';

const topic = (topicId: string) => ({
  topicId,
  topicName: topicId,
  level: 1,
  accuracyHistory: [1],
  currentAccuracy: 1,
  questionsAnswered: 1,
  questionsCorrect: 1,
  lastUpdated: new Date(0).toISOString(),
});

describe('topic mastery authoring and display', () => {
  it('slugifies bank names with a safe fallback', () => {
    expect(slugifyBankTopicId('Unit 1.2: Energy!')).toBe('unit_1_2_energy');
    expect(slugifyBankTopicId(' --- ')).toBe('general');
    expect(resolveBankTopicId('  existing.topic  ', 'Fallback Bank')).toBe('existing.topic');
    expect(resolveBankTopicId('  ', 'Fallback Bank')).toBe('fallback_bank');
  });

  it('filters legacy junk keys and renders the localized empty state', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(
      <LocaleProvider>
        <TopicMasteryAnalytics topicMastery={{ undefined: topic('undefined'), null: topic('null'), kinematics: topic('kinematics') }} />
      </LocaleProvider>
    ));
    expect(container.textContent).toContain('kinematics');
    expect(container.textContent).not.toContain('Undefined');

    await act(async () => root.render(
      <LocaleProvider>
        <TopicMasteryAnalytics topicMastery={{ undefined: topic('undefined'), null: topic('null') }} />
      </LocaleProvider>
    ));
    expect(container.textContent).toContain('No topic data yet');
    await act(async () => root.unmount());
  });
});
