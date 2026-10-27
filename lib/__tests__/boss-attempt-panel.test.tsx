// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import BossQuizPanel from '../../components/xp/BossQuizPanel';
import { dataService } from '../../services/dataService';
import type { BossEvent } from '../../types';
import { LocaleProvider } from '../../lib/i18n';

vi.mock('../../services/dataService', () => ({ dataService: {
  subscribeToBossEvents: vi.fn(),
  subscribeToBossEventProgress: vi.fn(),
  getNextBossQuestion: vi.fn(),
  answerBossEvent: vi.fn(),
  medevacBoss: vi.fn(),
} }));
vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  ToastProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../components/xp/BattleScene', () => ({ default: () => <div /> }));
vi.mock('../../lib/sfx', () => ({ sfx: { bossHit: vi.fn(), bossDefeated: vi.fn() } }));

const nextMock = vi.mocked(dataService.getNextBossQuestion);
const answerMock = vi.mocked(dataService.answerBossEvent);
const quiz = {
  id: 'event-1', mode: 'QUIZ', bossName: 'Test Boss', description: 'Practice',
  maxHp: 500, currentHp: 500, classType: 'PHYSICS', isActive: true,
  deadline: '2030-01-01', rewards: { xp: 50, flux: 10 }, questions: [],
} as unknown as BossEvent;

function response(overrides: Record<string, unknown> = {}) {
  return {
    presentation: {
      presentationId: 'presentation-1', stem: 'Which statement matches the model?',
      options: ['Zeta choice', 'Alpha choice', 'Middle choice'], difficulty: 'MEDIUM',
      isRevision: false, attemptAnsweredCount: 2, attemptSize: 5,
    },
    attemptState: { attemptId: 'attempt-1', answeredCount: 2, targetSize: 5, complete: false, revisionsPending: false },
    complete: false, bossHp: 500, bossMaxHp: 500, playerHp: 100, playerMaxHp: 100,
    streak: 3, cooldownUntil: null, medevacCost: 25, knockoutCount: 0, victoryClaimed: false,
    ...overrides,
  } as Awaited<ReturnType<typeof dataService.getNextBossQuestion>>;
}

function setup() {
  vi.mocked(dataService.subscribeToBossEvents).mockImplementation((_type, callback) => {
    callback([quiz]);
    return () => {};
  });
  vi.mocked(dataService.subscribeToBossEventProgress).mockImplementation((_uid, _id, callback) => {
    callback(null);
    return () => {};
  });
  return render(<LocaleProvider><BossQuizPanel userId="test-user" classType="PHYSICS" /></LocaleProvider>);
}

describe('BossQuizPanel five-question attempt contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextMock.mockResolvedValue(response());
    answerMock.mockResolvedValue({ correct: true, damage: 20, isCrit: false, bossHp: 480, bossMaxHp: 500, playerHp: 100, playerMaxHp: 100, knockedOut: false, cooldownUntil: null, victoryClaimed: false, streak: 4, attemptComplete: false });
  });

  it('renders options in server order and shows attempt progress', async () => {
    setup();
    const options = await screen.findAllByRole('radio');
    expect(options.map(option => option.textContent)).toEqual(['A.Zeta choice', 'B.Alpha choice', 'C.Middle choice']);
    expect(screen.getByText('Question 3 of 5')).toBeInTheDocument();
    expect(nextMock).toHaveBeenCalledTimes(1);
  });

  it('submits the displayed index once when an option is double-clicked', async () => {
    let resolveAnswer!: (value: Awaited<ReturnType<typeof dataService.answerBossEvent>>) => void;
    answerMock.mockReturnValue(new Promise(resolve => { resolveAnswer = resolve; }));
    setup();
    const option = await screen.findByRole('radio', { name: /Alpha choice/ });
    fireEvent.click(option);
    fireEvent.click(option);
    expect(answerMock).toHaveBeenCalledTimes(1);
    expect(answerMock).toHaveBeenCalledWith('event-1', 'presentation-1', 1);
    resolveAnswer({ correct: true, damage: 20, isCrit: false, bossHp: 480, bossMaxHp: 500, playerHp: 100, playerMaxHp: 100, knockedOut: false, cooldownUntil: null, victoryClaimed: false, streak: 4, attemptComplete: false });
    expect(await screen.findByText('-20 HP to boss!')).toBeInTheDocument();
  });

  it('shows the attempt summary and next-attempt button without starting cooldown', async () => {
    nextMock.mockResolvedValue(response({ presentation: null, complete: true, attemptState: { attemptId: 'attempt-1', answeredCount: 5, targetSize: 5, complete: true, revisionsPending: false } }));
    setup();
    expect(await screen.findByText('Attempt complete!')).toBeInTheDocument();
    expect(screen.getByText('Questions answered: 5')).toBeInTheDocument();
    expect(screen.getByText('Streak: 3')).toBeInTheDocument();
    expect(screen.queryByText(/Recovers in/)).not.toBeInTheDocument();
    nextMock.mockResolvedValue(response());
    fireEvent.click(screen.getByRole('button', { name: 'Next attempt' }));
    await screen.findByText('Question 3 of 5');
    expect(nextMock).toHaveBeenCalledTimes(2);
  });

  it('shows a neutral revision badge', async () => {
    nextMock.mockResolvedValue(response({ presentation: { ...response().presentation, isRevision: true } }));
    setup();
    const badge = await screen.findByText('Revisiting an earlier idea.');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).not.toMatch(/wrong|incorrect|answer/i);
  });

  it('renders the cooldown and server-provided Medevac cost', async () => {
    nextMock.mockResolvedValue(response({ presentation: null, playerHp: 0, cooldownUntil: '2030-01-01T00:00:00.000Z', medevacCost: 42 }));
    setup();
    expect(await screen.findByRole('button', { name: /42/ })).toBeInTheDocument();
    expect(screen.getByText(/Recovers in/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});
