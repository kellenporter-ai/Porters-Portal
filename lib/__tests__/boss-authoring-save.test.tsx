// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuizBossFormModal, { buildBossSavePayload, normalizeImportedQuestion } from '../../components/xp/QuizBossFormModal';
import { dataService } from '../../services/dataService';
import type { BossEvent, BossQuestionBank } from '../../types';

vi.mock('../../services/dataService', () => ({
  dataService: { saveBossEvent: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));
vi.mock('../../components/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../components/xp/BossAvatar', () => ({ default: () => <div /> }));
vi.mock('../../lib/AppDataContext', () => ({
  useClassConfig: () => ({ classConfigs: [{ className: 'AP Physics' }] }),
}));

const legacyQuestion = {
  id: 'question-1', stem: 'What is acceleration?', options: ['Change in velocity', 'Position'],
  correctAnswer: 0, difficulty: 'MEDIUM' as const, topicId: 'kinematics', damageBonus: 0,
};

const legacyBoss = {
  id: 'boss-legacy', mode: 'QUIZ', bossName: 'Legacy Boss', description: 'Existing description',
  maxHp: 900, currentHp: 450, classType: 'AP Physics', isActive: true,
  deadline: '2030-02-01T12:00:00.000Z', scheduledAt: '2030-01-01T12:00:00.000Z',
  damagePerCorrect: 75, questions: [{ ...legacyQuestion }],
  rewards: { xp: 250, flux: 30, itemRarity: 'RARE' }, targetSections: ['Period 2'],
  bossAppearance: { bossType: 'GOLEM', hue: 120 },
  phases: [{ id: 'phase-1', name: 'Legacy phase' }],
  modifiers: [{ id: 'modifier-1', name: 'Legacy modifier' }],
  lootTable: [{ itemId: 'legacy-item', dropChance: 1 }],
  difficultyTier: 'NIGHTMARE', autoScale: { enabled: true }, unknownLegacyKey: { retained: true },
} as unknown as BossEvent;

const bank: BossQuestionBank = {
  id: 'bank-1', name: 'Kinematics Bank', classType: 'AP Physics', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  questions: [{ ...legacyQuestion, id: 'bank-question-1' }],
} as BossQuestionBank;

function renderModal(questionBanks: BossQuestionBank[] = []) {
  return render(<QuizBossFormModal
    isOpen onClose={vi.fn()} editingQuizBoss={legacyBoss}
    questionBanks={questionBanks} availableSections={['Period 1', 'Period 2']}
  />);
}

describe('quiz boss authoring save contract', () => {
  beforeEach(() => { vi.mocked(dataService.saveBossEvent).mockClear(); });

  it('preserves legacy and unknown fields and required values through a real modal save', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Boss Name'), { target: { value: 'Updated Legacy Boss' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Quiz Boss' }));

    await waitFor(() => expect(dataService.saveBossEvent).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(dataService.saveBossEvent).mock.calls[0][0];
    expect(payload.phases).toEqual(legacyBoss.phases);
    expect(payload.modifiers).toEqual(legacyBoss.modifiers);
    expect(payload.lootTable).toEqual(legacyBoss.lootTable);
    expect(payload.difficultyTier).toBe('NIGHTMARE');
    expect((payload as BossEvent & { unknownLegacyKey: unknown }).unknownLegacyKey).toEqual({ retained: true });
    expect(payload.bossName).toBe('Updated Legacy Boss');
    expect(payload.classType).toBe('AP Physics');
    expect(payload.questions?.[0].stem).toBe(legacyQuestion.stem);
    expect(payload.rewards).toEqual({ xp: 250, flux: 30, itemRarity: 'RARE' });
    expect(payload.currentHp).toBe(450);
  });

  it('retains topicId on inline questions and bank imports', async () => {
    renderModal([bank]);
    fireEvent.click(screen.getByRole('button', { name: /Import All/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Update Quiz Boss' }));
    await waitFor(() => expect(dataService.saveBossEvent).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(dataService.saveBossEvent).mock.calls[0][0];
    expect(payload.questions).toHaveLength(2);
    expect(payload.questions?.every(question => question.topicId === 'kinematics')).toBe(true);
    expect((payload as BossEvent & { questionBankIds?: string[] }).questionBankIds).toEqual(['bank-1']);
    expect(normalizeImportedQuestion({ ...legacyQuestion, id: '' }).topicId).toBe('kinematics');
  });

  it('does not render removed difficulty, auto-scale, or loot authoring controls', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: /Nightmare/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Auto.?Scale/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Loot Table/i)).not.toBeInTheDocument();
  });

  it('builder round-trips supported fields without dropping deprecated values', () => {
    const payload = buildBossSavePayload({
      bossName: 'Round Trip', description: 'Description', maxHp: 1000, classType: 'AP Physics',
      damagePerCorrect: 50, rewardXp: 500, rewardFlux: 100, rewardItemRarity: 'UNCOMMON',
      deadline: '2030-03-01T10:30', scheduledAt: '2030-02-01T10:30',
      questions: [{ ...legacyQuestion }], targetSections: ['Period 1'], bossType: 'BRUTE', bossHue: 20,
    }, legacyBoss);
    expect(payload).toMatchObject({
      bossName: 'Round Trip', classType: 'AP Physics', maxHp: 1000,
      rewards: { xp: 500, flux: 100, itemRarity: 'UNCOMMON' },
      phases: legacyBoss.phases, modifiers: legacyBoss.modifiers, lootTable: legacyBoss.lootTable,
    });
    expect(payload.questions?.[0].topicId).toBe('kinematics');
  });
});
