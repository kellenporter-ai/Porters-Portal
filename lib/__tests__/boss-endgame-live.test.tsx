// @vitest-environment happy-dom
/**
 * Teacher "Results" screen — live async boss roster.
 *
 * The roster is derived from `boss_event_progress` docs written by the async
 * engine (functions/src/bosses.ts). The fixtures below are REAL production
 * shapes, not the dead pre-async fields (`totalDamageDealt`, `combatStats`,
 * `attempts[]`) that rendered 0 for everything before this screen existed —
 * the whole point of these tests is that reading those fields would fail
 * them.
 */
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { dataService } from '../../services/dataService';
import type { BossEvent, BossEventProgress, User } from '../../types';
import EndgameStatsModal from '../../components/xp/EndgameStatsModal';

vi.mock('../../services/dataService', () => ({
  dataService: {
    getBossEventStats: vi.fn(),
  },
}));

vi.mock('../../lib/sfx', () => ({
  sfx: { modalOpen: vi.fn(), modalClose: vi.fn() },
}));

const getStatsMock = vi.mocked(dataService.getBossEventStats);

const EVENT = {
  id: 'evt-kinematics',
  mode: 'QUIZ',
  bossName: 'Torque Wraith',
  description: 'Kinematics boss',
  maxHp: 1584,
  currentHp: 1584,
  classType: 'AP Physics',
  isActive: true,
  deadline: '2099-01-01T00:00:00.000Z',
  rewards: { xp: 100, flux: 20 },
  questions: [
    { id: 'q1', stem: 'Which graph shows constant acceleration?', options: ['A', 'B', 'C'], correctAnswer: 1, difficulty: 'MEDIUM' },
    { id: 'q2', stem: 'A cart speeds up at 2 m/s^2. Displacement in 3 s?', options: ['9 m', '18 m', '6 m'], correctAnswer: 0, difficulty: 'EASY' },
  ],
} as unknown as BossEvent;

const USERS = [
  { id: 'uid-0001-aaa', name: 'Ada Byron', email: 'ada@example.org', role: 'STUDENT' },
  { id: 'uid-0002-bbb', name: 'Blaise Pascal', email: 'blaise@example.org', role: 'STUDENT' },
  { id: 'uid-0003-ccc', name: 'Caroline Herschel', email: 'caroline@example.org', role: 'STUDENT' },
] as unknown as User[];

/**
 * A victor: killed a 1584 HP boss in 12 answers with 10 correct.
 * bossHp 0 → damage 1584, the value that used to render as 0.
 */
const VICTOR_DOC = {
  userId: 'uid-0001-aaa',
  eventId: 'evt-kinematics',
  bossMaxHp: 1584,
  bossHp: 0,
  answeredCount: 12,
  correctCount: 10,
  victoryClaimed: true,
  knockoutCount: 1,
  answeredQuestionIds: ['q1', 'q2'],
  cooldownUntil: null,
  session: null,
  lastCompletedAttempt: { attemptId: 'a3', presentations: [] },
} as unknown as BossEventProgress;

/** Mid-fight: fight open, boss still standing. */
const FIGHTING_DOC = {
  userId: 'uid-0002-bbb',
  eventId: 'evt-kinematics',
  bossMaxHp: 1584,
  bossHp: 1100,
  answeredCount: 4,
  correctCount: 2,
  victoryClaimed: false,
  knockoutCount: 0,
  answeredQuestionIds: ['q1'],
  cooldownUntil: null,
  activeAttempt: { attemptId: 'a1', presentations: [], answeredCount: 1 },
} as unknown as BossEventProgress;

/**
 * Legacy doc from before the async engine: no numeric bossMaxHp at all.
 * deriveBossResult flags it and every HP-derived cell must be an em dash.
 */
const LEGACY_DOC = {
  userId: 'uid-0003-ccc',
  eventId: 'evt-kinematics',
  attempts: [],
  totalDamageDealt: 0,
  participationMet: false,
  rewardClaimed: false,
} as unknown as BossEventProgress;

/** Answered something but has no fight open and no activity timestamp. */
const IDLE_DOC = {
  userId: 'uid-0004-ddd',
  eventId: 'evt-kinematics',
  bossMaxHp: 1584,
  bossHp: 900,
  answeredCount: 6,
  correctCount: 3,
  victoryClaimed: false,
  knockoutCount: 2,
  answeredQuestionIds: ['q1', 'q2'],
  cooldownUntil: null,
} as unknown as BossEventProgress;

/** Stalled: nothing for two days, timestamp present on the doc. */
const STALLED_DOC = {
  userId: 'uid-0005-eee',
  eventId: 'evt-kinematics',
  bossMaxHp: 1584,
  bossHp: 1300,
  answeredCount: 3,
  correctCount: 1,
  victoryClaimed: false,
  knockoutCount: 0,
  answeredQuestionIds: ['q1'],
  lastAnsweredAt: '2020-01-01T00:00:00.000Z',
} as unknown as BossEventProgress;

/** Never opened the fight. */
const NOT_STARTED_DOC = {
  userId: 'uid-0006-fff',
  eventId: 'evt-kinematics',
  bossMaxHp: 1584,
  bossHp: 1584,
  answeredCount: 0,
  correctCount: 0,
  victoryClaimed: false,
  knockoutCount: 0,
  answeredQuestionIds: [],
} as unknown as BossEventProgress;

const ROSTER = [VICTOR_DOC, FIGHTING_DOC, LEGACY_DOC, IDLE_DOC, STALLED_DOC, NOT_STARTED_DOC];

function renderScreen(overrides: Partial<React.ComponentProps<typeof EndgameStatsModal>> = {}) {
  return render(
    <EndgameStatsModal
      quiz={EVENT}
      progress={ROSTER}
      loading={false}
      users={USERS}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

/** The roster table (first table in the modal). */
function rosterTable(): HTMLElement {
  return screen.getAllByRole('table')[0];
}

function rowFor(name: string): HTMLElement {
  const row = within(rosterTable()).getByText(name).closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row as HTMLElement;
}

describe('teacher boss results screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStatsMock.mockResolvedValue({
      eventId: 'evt-kinematics',
      truncated: false,
      totalAnswers: 0,
      perQuestion: [],
      answeredQuestionIds: [],
    });
  });

  it('renders a victor from live engine fields: 1,584 damage and a VICTOR badge', () => {
    renderScreen();
    const row = rowFor('Ada Byron');

    expect(within(row).getByText('VICTOR')).toBeInTheDocument();

    // Cells: Student | Status | Answered | Correct | Accuracy | Damage | %Defeated | OverPar | KO | LastActivity
    const cells = within(row).getAllByRole('cell').map(td => td.textContent);
    expect(cells[5]).toBe('1,584'); // damage = bossMaxHp - bossHp = 1584 - 0
    expect(cells[4]).toBe('83%'); // 10/12 accuracy
    expect(cells[6]).toBe('100%'); // 1584/1584 defeated
    // The old screen read combatStats.totalDamageDealt, which is absent on a
    // live doc — it rendered 0 in this column.
    expect(cells[5]).not.toBe('0');
  });

  it('renders an em dash (never 0) for a legacy document', () => {
    renderScreen();
    const row = rowFor('Caroline Herschel');
    const cells = within(row).getAllByRole('cell').map(td => td.textContent);

    // Damage (5) and % Defeated (6) have no live source on a legacy doc.
    // They must be em dashes, not the 0 the old screen rendered.
    expect(cells[5]).toBe('—');
    expect(cells[6]).toBe('—');
    expect(cells[7]).toBe('—'); // Over Par — non-victor and legacy
    // Legacy carries no fight state — it must not be claimed as a victor.
    expect(within(row).queryByText('VICTOR')).not.toBeInTheDocument();
    expect(within(row).getByText('NOT STARTED')).toBeInTheDocument();
  });

  it('sorts victors first by default, ahead of fighters and idle students', () => {
    renderScreen();
    const names = within(rosterTable())
      .getAllByRole('row')
      .slice(1) // drop the header row
      .map(tr => within(tr as HTMLElement).getAllByRole('cell')[0].textContent);

    expect(names[0]).toBe('Ada Byron');
    const victorIndex = names.indexOf('Ada Byron');
    const fighterIndex = names.indexOf('Blaise Pascal');
    const notStartedIndex = names.indexOf('Caroline Herschel');
    expect(victorIndex).toBeLessThan(fighterIndex);
    expect(fighterIndex).toBeLessThan(notStartedIndex);
  });

  it('derives the remaining status bands', () => {
    renderScreen();
    expect(within(rowFor('Blaise Pascal')).getByText('FIGHTING')).toBeInTheDocument();
    expect(within(rowFor('uid-0004')).getByText('FIGHTING')).toBeInTheDocument(); // no timestamp → not provably stalled
    expect(within(rowFor('uid-0005')).getByText('STALLED')).toBeInTheDocument();
    expect(within(rowFor('uid-0006')).getByText('NOT STARTED')).toBeInTheDocument();
  });

  it('shows the Last Activity cell from lastAnsweredAt and em dash when absent', () => {
    renderScreen();

    // Stalled doc carries 2020-01-01; the cell must render a real date, not an em dash.
    const stalledCells = within(rowFor('uid-0005')).getAllByRole('cell').map(td => td.textContent);
    expect(stalledCells[9]).not.toBe('—');
    // Formatted as "Mon D, h:mm AM/PM" (no year), so assert on the month/day.
    expect(stalledCells[9]).toMatch(/Dec 31/);

    // A doc with no timestamp reads as unknown, not as activity at time zero.
    const idleCells = within(rowFor('uid-0004')).getAllByRole('cell').map(td => td.textContent);
    expect(idleCells[9]).toBe('—');
  });

  it('does NOT mark a doc stalled when it has no timestamp (unknown != idle)', () => {
    // uid-0004 answered 6 questions, no fight open, and carries no timestamp.
    // We cannot prove it went quiet, so it must stay FIGHTING.
    renderScreen();
    const row = rowFor('uid-0004');
    expect(within(row).queryByText('STALLED')).not.toBeInTheDocument();
    expect(within(row).getByText('FIGHTING')).toBeInTheDocument();
  });

  it('marks a recently-active non-victor as FIGHTING, not STALLED', () => {
    const fresh = {
      ...IDLE_DOC,
      userId: 'uid-0007-ggg',
      lastAnsweredAt: new Date().toISOString(),
    } as unknown as BossEventProgress;
    renderScreen({ progress: [...ROSTER, fresh] });
    const row = rowFor('uid-0007');
    expect(within(row).getByText('FIGHTING')).toBeInTheDocument();
    expect(within(row).queryByText('STALLED')).not.toBeInTheDocument();
  });

  it('falls back to the first 8 chars of the uid when no user record matches', () => {
    renderScreen();
    expect(within(rosterTable()).getByText('uid-0004')).toBeInTheDocument();
    expect(within(rosterTable()).getByText('uid-0005')).toBeInTheDocument();
  });

  it('summarises fighters, victors and median accuracy from the live rows', () => {
    renderScreen();
    // Fighters = answeredCount > 0 → victor, fighting, idle, stalled.
    const fightersTile = screen.getByText('Fighters').previousElementSibling;
    expect(fightersTile?.textContent).toBe('4');
    const victorsTile = screen.getByText('Victors').previousElementSibling;
    expect(victorsTile?.textContent).toBe('1');
    // Median over-par needs 5 victors — one victor must show an em dash.
    const overParTile = screen.getByText('Median Over-Par').previousElementSibling;
    expect(overParTile?.textContent).toBe('—');
  });

  it('re-sorts when a column header is clicked and never defaults to raw damage', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /Answered/i }));
    const ordered = within(rosterTable()).getAllByRole('row').slice(1) as HTMLElement[];
    const answered = ordered.map(tr => Number(within(tr).getAllByRole('cell')[2].textContent));
    // First click on a numeric column sorts descending (most engaged first).
    expect(answered).toEqual([...answered].sort((a, b) => b - a));
  });

  it('fetches per-question analytics only when the tab is opened', async () => {
    renderScreen();
    expect(getStatsMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Question Analytics/i }));
    expect(getStatsMock).toHaveBeenCalledTimes(1);
    expect(getStatsMock).toHaveBeenCalledWith('evt-kinematics');
    // The question table renders once the callable resolves.
    expect(await screen.findByText(/constant acceleration/i)).toBeInTheDocument();
  });

  it('shows the truncation banner instead of silently under-reporting', async () => {
    getStatsMock.mockResolvedValue({
      eventId: 'evt-kinematics',
      truncated: true,
      totalAnswers: 20000,
      perQuestion: [],
      answeredQuestionIds: [],
    });
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /Question Analytics/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/20,000-answer cap/i);
  });

  it('shows a retry path when the analytics callable fails', async () => {
    getStatsMock.mockRejectedValue(new Error('FirebaseError: internal'));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /Question Analytics/i }));

    expect(await screen.findByText('internal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('badges the screen CLOSED once the deadline has passed', () => {
    renderScreen({ quiz: { ...EVENT, deadline: '2020-01-01T00:00:00.000Z' } as BossEvent });
    expect(screen.getByText('CLOSED')).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  it('badges the screen LIVE while the boss window is open', () => {
    renderScreen();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});
