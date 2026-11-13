// @vitest-environment happy-dom
/**
 * Student endgame class comparison — the close-of-event surface in
 * `BossQuizPanel.tsx`.
 *
 * The product rules under test are LOCKED. Each line is gated independently:
 *
 *   "N students have beaten this boss so far"   victor, mid-window, n >= 5
 *   victor/fighter totals                       victors, after close, fighters >= 5
 *   median victor over-par                      victors, after close, victors >= 5
 *   band sentence                               victors, after close, victors >= 10
 *   own progress % + "~X more correct"          non-victor who fought, after close
 *   any comparison to others                    NEVER for a non-victor
 *   the whole surface                           NEVER for a student who never fought
 *
 * There is no ordinal rank, percentile or histogram anywhere by design.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider } from '../../lib/i18n';
import type { BossEvent, BossEventProgress } from '../../types';
import { dataService, type BossClassSummary } from '../../services/dataService';


// The panel renders BattleScene (Babylon) for an unfinished fight. Every test
// here runs after the fight is over, so stub the scene out entirely.
vi.mock('./BattleScene', () => ({ default: () => null }));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getBossClassSummary: vi.fn(),
    getNextBossQuestion: vi.fn(),
    subscribeToBossEventProgress: vi.fn(() => () => {}),
    subscribeToBossEvents: vi.fn(() => () => {}),
  },
}));

vi.mock('../../lib/sfx', () => ({
  sfx: { modalOpen: vi.fn(), modalClose: vi.fn(), hit: vi.fn(), crit: vi.fn() },
}));

vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const getSummaryMock = vi.mocked(dataService.getBossClassSummary);
const subscribeEventsMock = vi.mocked(dataService.subscribeToBossEvents);
const subscribeProgressMock = vi.mocked(dataService.subscribeToBossEventProgress);

// Lazily import the panel after the mocks are registered.
const { default: BossQuizPanel } = await import('../../components/xp/BossQuizPanel');

const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2020-01-01T00:00:00.000Z';

const BOSS_MAX_HP = 1584;

function makeEvent(deadline: string): BossEvent {
  return {
    id: 'evt-kinematics',
    mode: 'QUIZ',
    bossName: 'Torque Wraith',
    description: 'Kinematics boss',
    maxHp: BOSS_MAX_HP,
    currentHp: 0,
    classType: 'AP Physics',
    isActive: true,
    deadline,
    rewards: { xp: 100, flux: 20 },
    questions: [],
  } as unknown as BossEvent;
}

/** A victor: killed the boss. `answered` is the stroke count used for over-par. */
function victorDoc(answered = 14): BossEventProgress {
  return {
    userId: 'uid-me',
    eventId: 'evt-kinematics',
    bossMaxHp: BOSS_MAX_HP,
    bossHp: 0,
    answeredCount: answered,
    correctCount: 12,
    victoryClaimed: true,
    knockoutCount: 0,
    answeredQuestionIds: [],
    activeAttempt: null,
  } as unknown as BossEventProgress;
}

/** A non-victor who fought: boss still standing. */
function fighterDoc(): BossEventProgress {
  return {
    userId: 'uid-me',
    eventId: 'evt-kinematics',
    bossMaxHp: BOSS_MAX_HP,
    bossHp: 600,
    answeredCount: 6,
    correctCount: 3,
    victoryClaimed: false,
    knockoutCount: 1,
    answeredQuestionIds: ['q1'],
    activeAttempt: null,
  } as unknown as BossEventProgress;
}

function summary(overrides: Partial<BossClassSummary> = {}): BossClassSummary {
  return {
    eventId: 'evt-kinematics',
    closed: false,
    fighters: 22,
    victors: 0,
    medianVictorOverPar: null,
    victorOverParBand: null,
    ...overrides,
  };
}

function renderPanel(deadline: string, progress: BossEventProgress | null) {
  const event = makeEvent(deadline);
  // Seed both subscriptions with the fixture before render so the endgame is
  // on screen after the first effect flush.
  subscribeEventsMock.mockImplementation((_classType: string, cb: (events: BossEvent[]) => void) => {
    queueMicrotask(() => cb([event]));
    return () => {};
  });
  subscribeProgressMock.mockImplementation(
    (_uid: string, _eid: string, cb: (p: BossEventProgress | null) => void) => {
      queueMicrotask(() => cb(progress));
      return () => {};
    },
  );

  return render(
    <LocaleProvider>
      <BossQuizPanel
        userId="uid-me"
        classType="AP Physics"
        playerStats={{ tech: 10, focus: 10, analysis: 10, charisma: 10 }}
        playerEquipped={{}}
        playerEvolutionLevel={0}
      />
    </LocaleProvider>,
  );
}

const card = () => screen.queryByTestId('boss-class-summary');

beforeEach(() => {
  vi.clearAllMocks();
  // The event window has already closed; the engine tells the card so, which is
  // also what flips the panel into its endgame view for a non-victor.
  vi.mocked(dataService.getNextBossQuestion).mockResolvedValue({ error: 'EVENT_CLOSED' } as never);
  subscribeEventsMock.mockImplementation((_classType: string, cb: (events: BossEvent[]) => void) => {
    void cb;
    return () => {};
  });
  subscribeProgressMock.mockImplementation(
    (_uid: string, _eid: string, _cb: (p: BossEventProgress | null) => void) => {
      return () => {};
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('victor, mid-window', () => {
  it('shows "won so far" once 5 students have won', async () => {
    getSummaryMock.mockResolvedValue(summary({ victors: 5, fighters: 12 }));
    renderPanel(FUTURE, victorDoc());

    expect(await screen.findByText(/5 students have beaten this boss so far/i)).toBeInTheDocument();
  });

  it('hides "won so far" below 5 victors but still shows the unlock notice', async () => {
    getSummaryMock.mockResolvedValue(summary({ victors: 4, fighters: 12 }));
    renderPanel(FUTURE, victorDoc());

    await waitFor(() => expect(getSummaryMock).toHaveBeenCalled());
    expect(screen.queryByText(/have beaten this boss so far/i)).not.toBeInTheDocument();
    // A victor mid-window still learns the class comparison is coming.
    expect(screen.getByText(/unlock when the event closes/i)).toBeInTheDocument();
  });

  it('never shows post-close lines mid-window, even with 20 victors', async () => {
    getSummaryMock.mockResolvedValue(
      summary({
        closed: false,
        victors: 20,
        fighters: 30,
        medianVictorOverPar: 4,
        victorOverParBand: { p25: 2, p75: 6 },
      }),
    );
    renderPanel(FUTURE, victorDoc());

    await waitFor(() => expect(getSummaryMock).toHaveBeenCalled());
    expect(screen.queryByText(/took it on/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/typical victor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ahead of most victors/i)).not.toBeInTheDocument();
  });
});

describe('victor, after close', () => {
  it('shows the band sentence at 10 victors', async () => {
    getSummaryMock.mockResolvedValue(
      summary({
        closed: true,
        victors: 10,
        fighters: 22,
        medianVictorOverPar: 4,
        victorOverParBand: { p25: 2, p75: 6 },
      }),
    );
    renderPanel(PAST, victorDoc(14));

    // Must say exactly one of the three band sentences.
    await waitFor(() => {
      const bandText =
        screen.queryByText(/ahead of most victors/i) ??
        screen.queryByText(/right around the typical victor/i) ??
        screen.queryByText(/took more swings than most/i);
      expect(bandText).not.toBeNull();
    });
  });

  it('shows the median at 9 victors but NOT the band', async () => {
    getSummaryMock.mockResolvedValue(
      summary({
        closed: true,
        victors: 9,
        fighters: 22,
        medianVictorOverPar: 4,
        // Server suppresses the band below 10 victors, so it is null here.
        victorOverParBand: null,
      }),
    );
    renderPanel(PAST, victorDoc(14));

    expect(await screen.findByText(/typical victor finished 4 over par/i)).toBeInTheDocument();
    expect(screen.queryByText(/ahead of most victors/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/right around the typical victor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/took more swings than most/i)).not.toBeInTheDocument();
  });

  it('renders "under par" phrasing when the median is negative', async () => {
    getSummaryMock.mockResolvedValue(
      summary({ closed: true, victors: 8, fighters: 20, medianVictorOverPar: -2 }),
    );
    renderPanel(PAST, victorDoc(10));

    expect(await screen.findByText(/typical victor finished 2 under par/i)).toBeInTheDocument();
  });

  it('shows victor/fighter totals when at least 5 fighters took part', async () => {
    getSummaryMock.mockResolvedValue(
      summary({ closed: true, victors: 6, fighters: 22, medianVictorOverPar: 3 }),
    );
    renderPanel(PAST, victorDoc(15));

    expect(await screen.findByText(/22 took it on\. 6 defeated it\./i)).toBeInTheDocument();
  });

  it('hides the totals line below 5 fighters', async () => {
    getSummaryMock.mockResolvedValue(
      summary({ closed: true, victors: 3, fighters: 4 }),
    );
    renderPanel(PAST, victorDoc(13));

    await waitFor(() => expect(getSummaryMock).toHaveBeenCalled());
    expect(screen.queryByText(/took it on/i)).not.toBeInTheDocument();
  });

  it('renders no comparison lines at all when every threshold is unmet', async () => {
    // 4 fighters, 3 victors: below the fighters minimum AND below the median
    // minimum. The card must not appear with empty headings or "N/A".
    getSummaryMock.mockResolvedValue(
      summary({ closed: true, victors: 3, fighters: 4 }),
    );
    renderPanel(PAST, victorDoc(13));

    await waitFor(() => expect(getSummaryMock).toHaveBeenCalled());
    expect(card()).toBeNull();
  });
});

describe('non-victor who fought', () => {
  it('shows own progress and the "more correct answers" line, with NO class comparison', async () => {
    renderPanel(PAST, fighterDoc());

    expect(await screen.findByText(/% health/i)).toBeInTheDocument();
    expect(screen.queryByText(/more correct answers would have finished it/i)).toBeInTheDocument();

    // The callable must never be called for a non-victor...
    expect(getSummaryMock).not.toHaveBeenCalled();
    // ...and no victor-only line may leak in.
    expect(screen.queryByText(/have beaten this boss so far/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/took it on/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/typical victor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ahead of most victors/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/right around the typical victor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/took more swings than most/i)).not.toBeInTheDocument();
  });

  it('does not fetch class data even when it is available', async () => {
    getSummaryMock.mockResolvedValue(summary({ closed: true, victors: 20, fighters: 30 }));
    renderPanel(PAST, fighterDoc());

    await screen.findByText(/% health/i);
    expect(getSummaryMock).not.toHaveBeenCalled();
  });
});

describe('student who never fought', () => {
  it('sees no comparison surface at all', async () => {
    const neverFought = {
      userId: 'uid-me',
      eventId: 'evt-kinematics',
      bossMaxHp: BOSS_MAX_HP,
      bossHp: BOSS_MAX_HP,
      answeredCount: 0,
      correctCount: 0,
      victoryClaimed: false,
      knockoutCount: 0,
      answeredQuestionIds: [],
    } as unknown as BossEventProgress;

    renderPanel(PAST, neverFought);

    expect(card()).toBeNull();
    expect(screen.queryByText(/% health/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/more correct answers/i)).not.toBeInTheDocument();
    expect(getSummaryMock).not.toHaveBeenCalled();
  });

  it('renders no comparison surface when there is no progress doc at all', async () => {
    renderPanel(PAST, null);
    expect(card()).toBeNull();
    expect(getSummaryMock).not.toHaveBeenCalled();
  });
});

describe('callable failure', () => {
  it('falls back to the student own lines without crashing', async () => {
    getSummaryMock.mockRejectedValue(new Error('FirebaseError: internal'));
    renderPanel(PAST, victorDoc(14));

    await waitFor(() => expect(getSummaryMock).toHaveBeenCalled());
    // No comparison lines, and the endgame itself still rendered.
    expect(screen.queryByText(/took it on/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/typical victor/i)).not.toBeInTheDocument();
  });
});

describe('no forbidden comparison surfaces exist', () => {
  it('never renders a rank, percentile or histogram', async () => {
    getSummaryMock.mockResolvedValue(
      summary({
        closed: true,
        victors: 12,
        fighters: 25,
        medianVictorOverPar: 4,
        victorOverParBand: { p25: 2, p75: 6 },
      }),
    );
    renderPanel(PAST, victorDoc(14));

    await findAnyComparisonLine();

    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/\brank\b/i);
    expect(body).not.toMatch(/%ile|percentile/i);
    expect(body).not.toMatch(/histogram/i);
    expect(body).not.toMatch(/#\d+\s+of\s+\d+/); // "3 of 22" ordinal phrasing
  });

  async function findAnyComparisonLine() {
    await waitFor(() => {
      const found =
        screen.queryByText(/ahead of most victors/i) ??
        screen.queryByText(/right around the typical victor/i) ??
        screen.queryByText(/took more swings than most/i);
      expect(found).not.toBeNull();
    });
  }
});
