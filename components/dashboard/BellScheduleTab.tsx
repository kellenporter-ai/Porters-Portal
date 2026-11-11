import React, { useEffect, useState } from 'react';
import { Check, Clock, Loader2, RotateCcw } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { useT } from '../../lib/i18n';
import { auth } from '../../lib/firebase';
import {
  BELL_SCHEDULES,
  SCHEDULE_ORDER,
  resolveLiveSchedule,
  scheduleDateKey,
  type BellScheduleId,
  type BellScheduleOverride,
} from '../../lib/bellSchedule';

/**
 * BellScheduleTab — admin control for which schedule is live today.
 *
 * Homeroom Hold can be called at random by the office, so the live schedule is
 * settable rather than purely date-derived. Setting a schedule writes a single
 * `config/bell_schedule` doc carrying today's date; students read it live.
 *
 * The override self-expires: resolveLiveSchedule() ignores any doc whose dateKey
 * is not today, so a forgotten switch reverts to Regular at midnight without a
 * scheduled job. This tab mirrors that rule explicitly — if the stored doc is
 * stale it is shown as "yesterday's override" rather than looking active.
 */
const BellScheduleTab: React.FC<{ currentUserId?: string }> = ({ currentUserId }) => {
  const t = useT();
  // Fall back to the real signed-in uid when no explicit prop is passed — the
  // audit trail must record who actually made the switch, never a guess.
  const adminUid = currentUserId ?? auth.currentUser?.uid;
  const [override, setOverride] = useState<BellScheduleOverride | null>(null);
  const [saving, setSaving] = useState<BellScheduleId | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsub = dataService.subscribeToBellScheduleOverride((o) => {
      setOverride(o);
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  const now = new Date();
  const todayKey = scheduleDateKey(now);
  const { schedule: liveSchedule, source } = resolveLiveSchedule(now, override);
  const isStale = !!override && override.dateKey !== todayKey;

  const apply = async (id: BellScheduleId) => {
    if (!adminUid) return;
    setSaving(id);
    setError(null);
    try {
      await dataService.setBellScheduleOverride(id, adminUid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const clear = async () => {
    setSaving('clear');
    setError(null);
    try {
      await dataService.clearBellScheduleOverride();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <h2 className="text-lg font-black text-[var(--text-primary)]">{t('admin.bellSchedule.title')}</h2>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">
          {t('admin.bellSchedule.subtitle')}
        </p>
      </header>

      {/* Live status */}
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface-glass)] px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Clock className="w-4 h-4 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
          <span className="text-kicker uppercase font-bold text-[var(--text-muted)]">
            {t('admin.bellSchedule.liveNow')}
          </span>
          <span className="text-sm font-black text-[var(--text-primary)]">{liveSchedule.label}</span>
          {source === 'override' && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--accent-muted)] text-[var(--accent-text)] border border-[var(--border)]">
              {t('admin.bellSchedule.overridden')}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mt-1.5">
          {source === 'override'
            ? t('admin.bellSchedule.appliesToday')
            : t('admin.bellSchedule.defaultApplies')}
        </p>
        {isStale && override && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1.5 font-semibold">
            {t('admin.bellSchedule.staleNotice').replace('{date}', override.dateKey)}
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Schedule choices */}
      <div className="space-y-2">
        <h3 className="text-kicker uppercase font-bold text-[var(--text-muted)]">
          {t('admin.bellSchedule.choose')}
        </h3>
        {SCHEDULE_ORDER.map((id) => {
          const sched = BELL_SCHEDULES[id];
          const isActive = source === 'override' && liveSchedule.id === id;
          const isDefault = source === 'default' && id === 'regular';
          const empty = sched.periods.length === 0;
          return (
            <div
              key={id}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition ${
                isActive || isDefault
                  ? 'border-[var(--border-strong)] bg-[var(--accent-muted)]'
                  : 'border-[var(--border)] bg-[var(--surface-raised)]'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-[var(--text-primary)]">{sched.label}</span>
                  {(isActive || isDefault) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
                      <Check className="w-3 h-3" aria-hidden="true" />
                      {isDefault ? t('admin.bellSchedule.defaultBadge') : t('admin.bellSchedule.activeBadge')}
                    </span>
                  )}
                  {empty && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      {t('admin.bellSchedule.notPosted')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  {empty
                    ? t('admin.bellSchedule.noPeriods')
                    : t('admin.bellSchedule.periodCount').replace('{count}', String(sched.periods.length))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => apply(id)}
                disabled={saving !== null || !adminUid || (isActive || isDefault)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold min-h-[44px] bg-[var(--surface-glass)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] transition"
              >
                {saving === id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {isActive || isDefault
                  ? t('admin.bellSchedule.inUse')
                  : t('admin.bellSchedule.setForToday')}
              </button>
            </div>
          );
        })}
      </div>

      {/* Reset */}
      <div className="pt-1">
        <button
          type="button"
          onClick={clear}
          disabled={saving !== null || !override}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold min-h-[44px] bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-glass-heavy)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] transition"
        >
          {saving === 'clear' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {t('admin.bellSchedule.resetToRegular')}
        </button>
        <p className="text-xs text-[var(--text-tertiary)] mt-2">
          {t('admin.bellSchedule.resetHint')}
        </p>
      </div>

      {loaded && !override && (
        <p className="text-xs text-[var(--text-muted)] italic">
          {t('admin.bellSchedule.noOverride')}
        </p>
      )}
    </div>
  );
};

export default BellScheduleTab;
