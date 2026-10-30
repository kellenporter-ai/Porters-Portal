import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import BossQuizPanel from '../../components/xp/BossQuizPanel';
import { dataService } from '../../services/dataService';
import type { BossEvent } from '../../types';
import { LocaleProvider } from '../../lib/i18n';

vi.mock('../../services/dataService', () => ({ dataService: {
  subscribeToBossEvents: vi.fn(), subscribeToBossEventProgress: vi.fn(),
  getNextBossQuestion: vi.fn(), answerBossEvent: vi.fn(), medevacBoss: vi.fn(),
} }));
vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  ToastProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../components/xp/BattleScene', () => ({ default: () => <div /> }));
vi.mock('../../lib/sfx', () => ({ sfx: { bossHit: vi.fn(), bossDefeated: vi.fn() } }));

const quiz = {
  id: 'event-1', mode: 'QUIZ', bossName: 'Test Boss', description: 'Practice',
  maxHp: 500, currentHp: 500, classType: 'PHYSICS', isActive: true,
  deadline: '2030-01-01', rewards: { xp: 50, flux: 10 }, questions: [],
} as unknown as BossEvent;

describe('BossQuizPanel heal cap feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataService.subscribeToBossEvents).mockImplementation((_type, callback) => {
      callback([quiz]);
      return () => {};
    });
    vi.mocked(dataService.subscribeToBossEventProgress).mockImplementation((_uid, _id, callback) => {
      callback(null);
      return () => {};
    });
    vi.mocked(dataService.getNextBossQuestion).mockResolvedValue({
      presentation: {
        presentationId: 'presentation-1', stem: 'Which statement matches the model?',
        options: ['Zeta choice', 'Alpha choice'], difficulty: 'MEDIUM', isRevision: false,
        attemptAnsweredCount: 2, attemptSize: 5,
      },
      attemptState: { attemptId: 'attempt-1', answeredCount: 2, targetSize: 5, complete: false, revisionsPending: false },
      complete: false, bossHp: 500, bossMaxHp: 500, playerHp: 100, playerMaxHp: 100,
      streak: 3, cooldownUntil: null, medevacCost: 25, knockoutCount: 0, victoryClaimed: false,
    });
    vi.mocked(dataService.answerBossEvent).mockResolvedValue({
      correct: true, damage: 20, isCrit: false, bossHp: 480, bossMaxHp: 500,
      playerHp: 100, playerMaxHp: 100, knockedOut: false, cooldownUntil: null,
      victoryClaimed: false, streak: 4, attemptComplete: false,
      healApplied: 0, healCapped: true,
    });
  });

  it('shows a neutral cap note when no healing was applied', async () => {
    render(<LocaleProvider><BossQuizPanel userId="test-user" classType="PHYSICS" /></LocaleProvider>);
    fireEvent.click(await screen.findByRole('radio', { name: /Alpha choice/ }));
    expect(await screen.findByText('Healing limit reached for this attempt')).toBeInTheDocument();
    expect(screen.queryByText(/HP healed/)).not.toBeInTheDocument();
  });
});
