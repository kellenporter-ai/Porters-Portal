import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User, BossEvent, BossEventProgress } from '../../types';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Download,
  ListChecks,
  Loader2,
  RefreshCw,
  Radio,
  DownloadCloud,
} from 'lucide-react';
import Modal from '../Modal';
import { getDifficultyClasses } from '../../lib/difficultyPills';
import {
  BOSS_COMPARISON_MIN_VICTORS_MEDIAN,
  computeBossPar,
  deriveBossResult,
  median,
  type BossResult,
} from '../../lib/bossResults';
import { dataService, type BossEventStats } from '../../services/dataService';

interface EndgameStatsModalProps {
  quiz: BossEvent | null;
  progress: BossEventProgress[];
  loading: boolean;
  users: User[];
  onClose: () => void;
}

// ─── Status model ────────────────────────────────────────────────────────────

type RosterStatus = 'VICTOR' | 'FIGHTING' | 'STALLED' | 'NOT_STARTED';

/** Sort weight — the default order the teacher wants: winners first, idle last. */
const STATUS_ORDER: Record<RosterStatus, number> = {
  VICTOR: 0,
  FIGHTING: 1,
  STALLED: 2,
  NOT_STARTED: 3,
};

const STATUS_LABEL: Record<RosterStatus, string> = {
  VICTOR: 'VICTOR',
  FIGHTING: 'FIGHTING',
  STALLED: 'STALLED',
  NOT_STARTED: 'NOT STARTED',
};

const STATUS_CLASSES: Record<RosterStatus, string> = {
  VICTOR: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  FIGHTING: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  STALLED: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  NOT_STARTED: 'bg-[var(--surface-glass)] text-[var(--text-muted)] border-[var(--border)]',
};

/** A fight with no answer in this long is considered abandoned. */
const STALL_MS = 24 * 60 * 60 * 1000;

/**
 * Most recent answer timestamp, taken from the DERIVED result — never off the
 * raw document.
 *
 * `deriveBossResult` is the single read path for boss progress: it validates
 * the stored `lastAnsweredAt` and collapses anything missing or unparseable to
 * null. Reading the doc here would bypass that validation and let a corrupt
 * value through as if it were a real timestamp.
 *
 * null means UNKNOWN activity (every document written before the field
 * existed). Callers must show an em dash and refuse to classify the student as
 * stalled — guessing activity from `bossHp` or `answeredCount` would fabricate
 * a timestamp.
 */
function lastActivityIso(result: BossResult): string | null {
  return result.lastAnsweredAt;
}

function formatLastActivity(iso: string | null): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '—';
  return new Date(parsed).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function resolveStatus(result: BossResult, lastActivity: string | null): RosterStatus {
  if (result.victory) return 'VICTOR';
  if (result.inProgress) return 'FIGHTING';
  if (result.answeredCount === 0) return 'NOT_STARTED';
  if (lastActivity) {
    const parsed = Date.parse(lastActivity);
    if (!Number.isNaN(parsed) && Date.now() - parsed > STALL_MS) return 'STALLED';
  }
  // Answered, not currently in a fight, no usable timestamp — we cannot prove
  // the student has gone quiet, so surface the weaker signal rather than
  // inventing a stall.
  return 'FIGHTING';
}

// ─── Roster row model ────────────────────────────────────────────────────────

type SortKey =
  | 'student'
  | 'status'
  | 'answered'
  | 'correct'
  | 'accuracy'
  | 'damage'
  | 'pctDefeated'
  | 'overPar'
  | 'knockouts'
  | 'lastActivity';

type SortDir = 'asc' | 'desc';

interface RosterRow {
  /** React key. */
  key: string;
  userId: string;
  studentName: string;
  status: RosterStatus;
  answered: number;
  correct: number;
  /** 0..1, null when nothing answered. */
  accuracy: number | null;
  /** null on a legacy doc — must render as an em dash, never 0. */
  damage: number | null;
  /** 0..1, null on a legacy doc. */
  pctDefeated: number | null;
  /** null for non-victors, legacy docs, and legacy boss HP. */
  overPar: number | null;
  knockouts: number;
  lastActivity: string | null;
  /** Non-victor placeholder for sorting. */
  result: BossResult;
}

const EM_DASH = '—';

function buildRow(progress: BossEventProgress, users: User[]): RosterRow | null {
  const result = deriveBossResult(
    progress as unknown as Record<string, unknown>,
    0,
    0,
  );
  if (!result) return null;

  const lastActivity = lastActivityIso(result);
  const status = resolveStatus(result, lastActivity);

  // Over-par compares each victor against their OWN fight: bossMaxHp is
  // PPI-scaled per student, so par differs per build. Non-victors have no
  // meaningful "swings to kill" figure — an in-progress student showing
  // over-par would read as a failure they have not earned yet.
  let overPar: number | null = null;
  if (result.victory && !result.isLegacy) {
    const par = computeBossPar(result.bossMaxHp, result.answeredCount, result.correctCount);
    overPar = par.overPar;
  }

  const matched = users.find(u => u.id === result.userId);

  return {
    key: `${result.userId}:${result.eventId}`,
    userId: result.userId,
    studentName: matched?.name || result.userId.slice(0, 8),
    status,
    answered: result.answeredCount,
    correct: result.correctCount,
    accuracy: result.accuracy,
    damage: result.damage,
    pctDefeated: result.pctDefeated,
    overPar,
    knockouts: result.knockoutCount,
    lastActivity,
    result,
  };
}

/** nulls always sort to the bottom regardless of direction. */
function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

function sortRows(rows: RosterRow[], key: SortKey, dir: SortDir): RosterRow[] {
  const sorted = [...rows].sort((a, b) => {
    switch (key) {
      case 'student':
        return dir === 'asc'
          ? a.studentName.localeCompare(b.studentName)
          : b.studentName.localeCompare(a.studentName);
      case 'status': {
        const delta = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        return dir === 'asc' ? delta : -delta;
      }
      case 'answered':
        return compareNullable(a.answered, b.answered, dir);
      case 'correct':
        return compareNullable(a.correct, b.correct, dir);
      case 'accuracy':
        return compareNullable(a.accuracy, b.accuracy, dir);
      case 'damage':
        return compareNullable(a.damage, b.damage, dir);
      case 'pctDefeated':
        return compareNullable(a.pctDefeated, b.pctDefeated, dir);
      case 'overPar':
        return compareNullable(a.overPar, b.overPar, dir);
      case 'knockouts':
        return compareNullable(a.knockouts, b.knockouts, dir);
      case 'lastActivity':
        return compareNullable(
          a.lastActivity ? Date.parse(a.lastActivity) : null,
          b.lastActivity ? Date.parse(b.lastActivity) : null,
          dir,
        );
      default:
        return 0;
    }
  });
  return sorted;
}

/**
 * Default order: status band (VICTOR → FIGHTING → STALLED → NOT STARTED), then
 * % defeated descending inside the band.
 *
 * Deliberately NOT by raw damage: damage scales with each student's own gear,
 * so a well-equipped student and a bare one are not comparable on that number.
 */
function defaultSort(rows: RosterRow[]): RosterRow[] {
  return [...rows].sort((a, b) => {
    const band = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (band !== 0) return band;
    return compareNullable(a.pctDefeated, b.pctDefeated, 'desc');
  });
}

function pctLabel(value: number | null): string {
  return value === null ? EM_DASH : `${Math.round(value * 100)}%`;
}

function overParLabel(value: number | null): string {
  if (value === null) return EM_DASH;
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return '0';
}

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// ─── Component ───────────────────────────────────────────────────────────────

type Tab = 'roster' | 'questions';

const EndgameStatsModal: React.FC<EndgameStatsModalProps> = ({ quiz, progress, loading, users, onClose }) => {
  const [tab, setTab] = useState<Tab>('roster');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Per-question analytics are NOT fetched on mount — the roster is what the
  // teacher watches during a live fight, and the answer scan is the expensive
  // half of this screen.
  const [stats, setStats] = useState<BossEventStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const statsRequestId = useRef(0);

  const eventId = quiz?.id ?? null;

  const loadStats = useCallback(async () => {
    if (!eventId) return;
    const requestId = ++statsRequestId.current;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const result = await dataService.getBossEventStats(eventId);
      if (requestId !== statsRequestId.current) return; // a newer request won
      setStats(result);
    } catch (error) {
      if (requestId !== statsRequestId.current) return;
      const message =
        error instanceof Error && error.message
          ? error.message.replace(/^FirebaseError:\s*/, '')
          : 'Could not load question analytics.';
      setStatsError(message);
    } finally {
      if (requestId === statsRequestId.current) setStatsLoading(false);
    }
  }, [eventId]);

  // Reset all per-event state when the teacher switches boss.
  useEffect(() => {
    setStats(null);
    setStatsError(null);
    setStatsLoading(false);
    setTab('roster');
    statsRequestId.current += 1;
  }, [eventId]);

  const openQuestionTab = useCallback(() => {
    setTab('questions');
    if (!stats && !statsLoading) void loadStats();
  }, [stats, statsLoading, loadStats]);

  const refresh = useCallback(() => {
    // In LIVE mode the listener is authoritative for the roster; only the
    // analytics callable is refreshed. In CLOSED mode nothing is changing on
    // its own any more, so a refresh is still just the analytics call.
    void loadStats();
  }, [loadStats]);

  const isLive = useMemo(() => {
    if (!quiz) return false;
    if (!quiz.isActive) return false;
    const deadline = quiz.deadline ? Date.parse(quiz.deadline) : Number.NaN;
    if (Number.isNaN(deadline)) return true;
    return Date.now() <= deadline;
  }, [quiz]);

  // ── Derived roster ──
  const rows = useMemo(() => {
    return progress
      .map(p => buildRow(p, users))
      .filter((r): r is RosterRow => r !== null);
  }, [progress, users]);

  const visibleRows = useMemo(() => {
    if (sortKey === 'status' && sortDir === 'asc') return defaultSort(rows);
    return sortRows(rows, sortKey, sortDir);
  }, [rows, sortKey, sortDir]);

  const summary = useMemo(() => {
    const fighters = rows.filter(r => r.answered > 0).length;
    const victors = rows.filter(r => r.result.victory).length;

    const accuracies = rows
      .map(r => r.accuracy)
      .filter((a): a is number => a !== null);
    // Median over two students is noise; require a real sample.
    const medianAccuracy = accuracies.length >= 3 ? median(accuracies) : null;

    const victorOverPar = rows
      .filter(r => r.result.victory && r.overPar !== null)
      .map(r => r.overPar as number);
    const medianOverPar =
      victorOverPar.length >= BOSS_COMPARISON_MIN_VICTORS_MEDIAN ? median(victorOverPar) : null;

    return { fighters, victors, medianAccuracy, medianOverPar, victorSamples: victorOverPar.length };
  }, [rows]);

  // ── Per-question table ──
  const questionRows = useMemo(() => {
    if (!quiz) return [];
    const byId = new Map(stats?.perQuestion.map(q => [q.questionId, q]) ?? []);
    const ordered = (quiz.questions || []).map((q, index) => ({
      index,
      question: q,
      stats: byId.get(q.id) ?? null,
    }));
    // Worst accuracy first — the re-teach list IS the top of this table.
    return ordered.sort((a, b) => {
      const aAcc = a.stats?.accuracy ?? null;
      const bAcc = b.stats?.accuracy ?? null;
      if (aAcc === null && bAcc === null) return a.index - b.index;
      if (aAcc === null) return 1;
      if (bAcc === null) return -1;
      return aAcc - bAcc;
    });
  }, [quiz, stats]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir(key === 'student' || key === 'status' ? 'asc' : 'desc');
      return key;
    });
  }, []);

  // ── CSV export ──
  // Exports exactly what is on screen: same rows, same order, same derived
  // values (em dash for missing), so the file and the table cannot disagree.
  const handleExportCSV = useCallback(() => {
    if (!quiz) return;

    const headers = [
      'Student',
      'Status',
      'Answered',
      'Correct',
      'Accuracy%',
      'Damage',
      'Defeated%',
      'OverPar',
      'Knockouts',
      'LastActivity',
    ];
    const rosterRows = visibleRows.map(row => [
      csvCell(row.studentName),
      csvCell(STATUS_LABEL[row.status]),
      row.answered,
      row.correct,
      row.accuracy === null ? EM_DASH : Math.round(row.accuracy * 100),
      row.damage === null ? EM_DASH : row.damage,
      row.pctDefeated === null ? EM_DASH : Math.round(row.pctDefeated * 100),
      overParLabel(row.overPar),
      row.knockouts,
      row.lastActivity ? formatLastActivity(row.lastActivity) : EM_DASH,
    ].join(','));

    const sections: string[] = [
      csvCell(`Boss Results: ${quiz.bossName}`),
      csvCell(`Mode: ${isLive ? 'LIVE' : 'CLOSED'}`),
      '',
      'ROSTER',
      headers.join(','),
      ...rosterRows,
    ];

    if (stats) {
      sections.push(
        '',
        'QUESTION ANALYTICS',
        ['Question#', 'Stem', 'Difficulty', 'AnswerKey', 'Answers', 'Accuracy%', 'Revisions', 'CorrectAfterRevision'].join(','),
        ...questionRows.map(({ index, question, stats: qStats }) => [
          index + 1,
          csvCell(question.stem),
          csvCell(question.difficulty),
          csvCell(question.options?.[question.correctAnswer] ?? ''),
          qStats?.answers ?? '',
          qStats?.accuracy === null || qStats === null || qStats.accuracy === undefined
            ? ''
            : Math.round(qStats.accuracy * 100),
          qStats?.revisions ?? '',
          qStats?.correctAfterRevision ?? '',
        ].join(',')),
      );
    }

    const csv = sections.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `boss-results-${quiz.bossName.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [quiz, isLive, visibleRows, stats, questionRows]);

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 inline ml-1" aria-hidden="true" />
      : <ArrowDown className="w-3 h-3 inline ml-1" aria-hidden="true" />;
  };

  const headerButton = (key: SortKey, label: string, align: 'left' | 'center' = 'left') => (
    <th
      className={`pb-2 ${align === 'center' ? 'text-center' : 'text-left pl-2'}`}
      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => handleSort(key)}
        className="font-bold uppercase tracking-wide text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
      >
        {label}
        {sortIndicator(key)}
      </button>
    </th>
  );

  return (
    <Modal
      isOpen={!!quiz}
      onClose={onClose}
      title={quiz ? `Results: ${quiz.bossName}` : 'Results'}
      maxWidth="max-w-6xl w-[95vw]"
    >
      {!quiz ? null : loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]" role="status">
          <Loader2 className="w-6 h-6 mx-auto mb-3 animate-spin opacity-60" />
          Waiting for the first progress snapshot…
        </div>
      ) : (
        <div className="space-y-5 p-2 max-h-[75vh] overflow-y-auto">
          {/* Header: mode badge + refresh + export */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {isLive ? (
                <span
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11.5px] font-black uppercase tracking-widest"
                  role="status"
                >
                  <Radio className="w-3 h-3 animate-pulse" aria-hidden="true" /> LIVE
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-glass)] border border-[var(--border)] text-[var(--text-muted)] text-[11.5px] font-black uppercase tracking-widest">
                  CLOSED
                </span>
              )}
              <span className="text-[11.5px] text-[var(--text-muted)]">
                {isLive ? 'Roster updates as students fight.' : 'Boss window has ended.'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={refresh}
                disabled={statsLoading}
                className="px-3 py-2 bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] transition flex items-center gap-1.5 disabled:opacity-50"
                title={isLive ? 'Roster is live; refreshes question analytics' : 'Re-fetch question analytics'}
              >
                {statsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </button>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] transition flex items-center gap-1.5"
                title="Export to CSV"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[var(--panel-bg)] rounded-xl p-3 border border-[var(--border)] text-center">
              <div className="text-2xl font-black text-[var(--text-primary)]">{summary.fighters}</div>
              <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold">Fighters</div>
            </div>
            <div className="bg-[var(--panel-bg)] rounded-xl p-3 border border-[var(--border)] text-center">
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{summary.victors}</div>
              <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold">Victors</div>
            </div>
            <div className="bg-[var(--panel-bg)] rounded-xl p-3 border border-[var(--border)] text-center">
              <div className="text-2xl font-black text-[var(--text-primary)]">
                {summary.medianAccuracy === null ? EM_DASH : `${Math.round(summary.medianAccuracy * 100)}%`}
              </div>
              <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold">Median Accuracy</div>
            </div>
            <div className="bg-[var(--panel-bg)] rounded-xl p-3 border border-[var(--border)] text-center">
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {summary.medianOverPar === null ? EM_DASH : overParLabel(Math.round(summary.medianOverPar))}
              </div>
              <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold">Median Over-Par</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setTab('roster')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                tab === 'roster'
                  ? 'bg-purple-600 text-white'
                  : 'bg-[var(--surface-glass)] text-[var(--text-tertiary)] hover:bg-[var(--surface-glass-heavy)]'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" /> Roster ({rows.length})
            </button>
            <button
              onClick={openQuestionTab}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                tab === 'questions'
                  ? 'bg-purple-600 text-white'
                  : 'bg-[var(--surface-glass)] text-[var(--text-tertiary)] hover:bg-[var(--surface-glass-heavy)]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Question Analytics
            </button>
          </div>

          {/* ── Roster ── */}
          {tab === 'roster' && (
            <div className="overflow-x-auto">
              {rows.length === 0 ? (
                <div className="text-center py-10 text-[var(--text-muted)]">
                  No students have started this boss yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      {headerButton('student', 'Student')}
                      {headerButton('status', 'Status')}
                      {headerButton('answered', 'Answered', 'center')}
                      {headerButton('correct', 'Correct', 'center')}
                      {headerButton('accuracy', 'Accuracy', 'center')}
                      {headerButton('damage', 'Damage', 'center')}
                      {headerButton('pctDefeated', '% Defeated', 'center')}
                      {headerButton('overPar', 'Over Par', 'center')}
                      {headerButton('knockouts', 'Knockouts', 'center')}
                      {headerButton('lastActivity', 'Last Activity', 'center')}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {visibleRows.map(row => (
                      <tr key={row.key} className="hover:bg-[var(--surface-glass)]">
                        <td className="py-2 pl-2 font-bold text-[var(--text-primary)] max-w-[180px] truncate">
                          {row.studentName}
                        </td>
                        <td className="py-2">
                          <span
                            className={`text-[10.5px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide border ${STATUS_CLASSES[row.status]}`}
                          >
                            {STATUS_LABEL[row.status]}
                          </span>
                        </td>
                        <td className="py-2 text-center text-[var(--text-tertiary)]">{row.answered}</td>
                        <td className="py-2 text-center text-green-600 dark:text-green-400">
                          {row.answered === 0 && row.correct === 0 ? EM_DASH : row.correct}
                        </td>
                        <td className="py-2 text-center text-[var(--text-secondary)]">{pctLabel(row.accuracy)}</td>
                        <td className="py-2 text-center text-amber-600 dark:text-amber-400 font-bold">
                          {row.damage === null ? EM_DASH : row.damage.toLocaleString()}
                        </td>
                        <td className="py-2 text-center text-[var(--text-secondary)]">{pctLabel(row.pctDefeated)}</td>
                        <td className="py-2 text-center text-[var(--text-secondary)]">{overParLabel(row.overPar)}</td>
                        <td className="py-2 text-center text-red-600 dark:text-red-400">{row.knockouts}</td>
                        <td className="py-2 text-center text-[var(--text-muted)]">
                          {formatLastActivity(row.lastActivity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Per-question analytics ── */}
          {tab === 'questions' && (
            <div className="space-y-3">
              {statsError ? (
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl text-center">
                  <div className="text-xs text-red-600 dark:text-red-400 mb-3">{statsError}</div>
                  <button
                    onClick={loadStats}
                    className="px-3 py-1.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-500/20 transition border border-red-500/20 text-[11.5px] font-bold uppercase"
                  >
                    Retry
                  </button>
                </div>
              ) : statsLoading || !stats ? (
                <div className="space-y-2" role="status" aria-label="Loading question analytics">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className="h-8 rounded-lg bg-[var(--surface-glass)] animate-pulse"
                      style={{ animationDelay: `${i * 80}ms` }}
                    />
                  ))}
                </div>
              ) : (
                <>
                  {stats.truncated && (
                    <div
                      className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11.5px] font-bold text-amber-700 dark:text-amber-400 flex items-start gap-2"
                      role="alert"
                    >
                      <DownloadCloud className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        Question analytics hit the 20,000-answer cap for this event. Counts may be incomplete.
                      </span>
                    </div>
                  )}
                  <div className="text-[11.5px] text-[var(--text-muted)]">
                    Sorted by accuracy, worst first — the top of this list is your re-teach set. Revision
                    retries are counted separately and excluded from the Answers/Accuracy columns.
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold border-b border-[var(--border)]">
                          <th className="pb-2 pl-2">#</th>
                          <th className="pb-2">Question</th>
                          <th className="pb-2 text-center">Difficulty</th>
                          <th className="pb-2 text-center">Answers</th>
                          <th className="pb-2 text-center">Accuracy</th>
                          <th className="pb-2 text-center">Revisions</th>
                          <th className="pb-2">Answer key</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {questionRows.map(({ index, question, stats: qStats }) => {
                          const accuracy = qStats?.accuracy ?? null;
                          return (
                            <tr
                              key={question.id}
                              className={`hover:bg-[var(--surface-glass)] ${
                                accuracy !== null && accuracy < 0.5 ? 'bg-red-500/5' : ''
                              }`}
                            >
                              <td className="py-2 pl-2 font-bold text-[var(--text-muted)]">{index + 1}</td>
                              <td className="py-2 text-[var(--text-primary)] max-w-[280px] truncate">{question.stem}</td>
                              <td className="py-2 text-center">
                                <span
                                  className={`text-[11.5px] px-1.5 py-0.5 rounded font-bold ${getDifficultyClasses(question.difficulty)}`}
                                >
                                  {question.difficulty}
                                </span>
                              </td>
                              <td className="py-2 text-center text-[var(--text-tertiary)]">
                                {qStats ? qStats.answers : EM_DASH}
                              </td>
                              <td className="py-2 text-center">
                                <span
                                  className={`font-bold ${
                                    accuracy === null
                                      ? 'text-[var(--text-muted)]'
                                      : accuracy >= 0.7
                                        ? 'text-green-600 dark:text-green-400'
                                        : accuracy >= 0.5
                                          ? 'text-yellow-600 dark:text-yellow-400'
                                          : 'text-red-600 dark:text-red-400'
                                  }`}
                                >
                                  {qStats ? pctLabel(accuracy) : EM_DASH}
                                </span>
                              </td>
                              <td className="py-2 text-center text-[var(--text-tertiary)]">
                                {qStats ? qStats.revisions : EM_DASH}
                              </td>
                              <td className="py-2 text-green-600 dark:text-green-400 max-w-[200px] truncate flex items-center gap-1">
                                <Check className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                                {question.options?.[question.correctAnswer] ?? EM_DASH}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default EndgameStatsModal;
