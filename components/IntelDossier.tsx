
import React, { useMemo } from 'react';
import { User, Submission, Assignment, RPGItem, PlayerStats } from '../types';
import { deriveCombatStats, calculateGearScore, calculateGemStats, calculateRunewordStats, calculateSetBonusStats, getRankDetails } from '../lib/gamification';
import { classifyStudentBucket, BUCKET_META, getBucketRecommendation, AggregatedStudentMetrics } from '../lib/telemetry';
import { getClassProfile } from '../lib/classProfile';
import { getStreakMultiplier } from '../lib/achievements';
import { useT, useInterpolate } from '../lib/i18n';

const WEEKDAY_KEYS = ['dates.weekdaySun', 'dates.weekdayMon', 'dates.weekdayTue', 'dates.weekdayWed', 'dates.weekdayThu', 'dates.weekdayFri', 'dates.weekdaySat'];
import { Shield, Swords, Heart, Crosshair, Zap, Target, Activity, BarChart3, Flame, Star, ArrowUpRight, Sparkles, Brain } from 'lucide-react';

interface IntelDossierProps {
  user: User;
  submissions: Submission[];
  assignments: Assignment[];
  activeClass: string;
}

// ─── Stat bar with percentage fill ─────────────────────
const StatBar: React.FC<{ label: string; value: number; max: number; color: string; icon: React.ReactNode; description: string }> = ({
  label, value, max, color, icon, description
}) => {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="group relative">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-xs">
          <span className={color}>{icon}</span>
          <span className="text-[var(--text-tertiary)] font-bold uppercase tracking-wider">{label}</span>
        </div>
        <span className={`text-sm font-black ${color}`}>{value}</span>
      </div>
      <div className="h-2 bg-[var(--surface-glass)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${color.replace('text-', 'bg-').replace('400', '500/60')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="absolute -top-10 left-0 hidden group-hover:block z-20 w-56 p-2 bg-[var(--backdrop)] border border-[var(--border-strong)] rounded-lg text-[11.5px] text-[var(--text-secondary)] shadow-xl">
        {description}
      </div>
    </div>
  );
};

// ─── Mini metric card ──────────────────────────────────
const MetricCard: React.FC<{ label: string; value: string | number; sub?: string; color?: string; icon: React.ReactNode }> = ({
  label, value, sub, color = 'text-[var(--text-primary)]', icon
}) => (
  <div className="bg-[var(--panel-bg)] rounded-xl p-3 border border-[var(--border)]">
    <div className="flex items-center gap-2 mb-1">
      <span className="text-[var(--text-muted)]">{icon}</span>
      <span className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest">{label}</span>
    </div>
    <div className={`text-lg font-black ${color} leading-tight`}>{value}</div>
    {sub && <div className="text-[11.5px] text-[var(--text-muted)] mt-0.5">{sub}</div>}
  </div>
);

const IntelDossier: React.FC<IntelDossierProps> = ({ user, submissions, assignments, activeClass }) => {
  const t = useT();
  const interpolate = useInterpolate();
  const gam = user.gamification;
  const classXp = gam?.classXp?.[activeClass] || 0;
  const totalXp = gam?.xp || 0;
  const level = gam?.level || 1;
  const currency = gam?.currency || 0;
  const streak = gam?.engagementStreak || 0;
  const loginStreak = gam?.loginStreak || 0;
  const rankDetails = getRankDetails(level);

  // Class profile
  const classProfile = useMemo(() => getClassProfile(user, activeClass), [user, activeClass]);
  const equipped = classProfile.equipped;

  // Player stats (base + gear)
  const playerStats = useMemo(() => {
    const base: PlayerStats = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
    const items: RPGItem[] = Object.values(equipped).filter(Boolean) as RPGItem[];
    items.forEach(item => {
      if (item.stats) Object.entries(item.stats).forEach(([key, val]) => {
        base[key as keyof PlayerStats] += (val as number);
      });
    });
    return base;
  }, [equipped]);

  const combat = useMemo(() => deriveCombatStats(playerStats), [playerStats]);
  const gearScore = useMemo(() => calculateGearScore(equipped), [equipped]);
  const gemStats = useMemo(() => calculateGemStats(equipped), [equipped]);
  const runewordStats = useMemo(() => calculateRunewordStats(equipped), [equipped]);
  const setBonusStats = useMemo(() => calculateSetBonusStats(equipped), [equipped]);
  const streakMultiplier = useMemo(() => getStreakMultiplier(streak), [streak]);

  // ─── XP Breakdown by source ──────────────────────────
  const classSubmissions = useMemo(() => {
    const classAssignmentIds = new Set(assignments.filter(a => a.classType === activeClass).map(a => a.id));
    return submissions.filter(s => classAssignmentIds.has(s.assignmentId));
  }, [submissions, assignments, activeClass]);

  const xpBreakdown = useMemo(() => {
    // Engagement XP: approximate from total engagement time
    const totalEngagementSec = classSubmissions.reduce((acc, s) => acc + (s.metrics?.engagementTime || 0), 0);
    const engagementXp = Math.round(totalEngagementSec / 60) * 10; // ~10 XP per minute

    // Boss XP (from damage records)
    const bossDamage = gam?.bossDamageDealt || {};
    const bossXp = Object.values(bossDamage).reduce((sum: number, dmg) => sum + (dmg as number), 0) * 2; // approximate

    // Behavior awards, daily challenges etc. make up the rest
    const otherXp = Math.max(0, classXp - engagementXp - bossXp);

    return { engagementXp, bossXp, otherXp };
  }, [classSubmissions, gam, classXp]);

  // ─── Telemetry bucket classification ─────────────────
  const bucketInfo = useMemo(() => {
    // Aggregate metrics from submissions over last 7 days
    const now = Date.now();
    const windowMs = 7 * 24 * 60 * 60 * 1000;
    const recentSubs = classSubmissions.filter(s => {
      const t = s.submittedAt ? new Date(s.submittedAt).getTime() : 0;
      return t > now - windowMs;
    });

    const activityDays = new Set(
      recentSubs
        .filter(s => s.submittedAt)
        .map(s => new Date(s.submittedAt!).toISOString().split('T')[0])
    ).size;

    const metrics: AggregatedStudentMetrics = {
      totalTime: recentSubs.reduce((a, s) => a + (s.metrics?.engagementTime || 0), 0),
      submissionCount: recentSubs.length,
      totalClicks: recentSubs.reduce((a, s) => a + (s.metrics?.clickCount || 0), 0),
      totalPastes: recentSubs.reduce((a, s) => a + (s.metrics?.pasteCount || 0), 0),
      totalKeystrokes: recentSubs.reduce((a, s) => a + (s.metrics?.keystrokes || 0), 0),
      totalXP: classXp,
      activityDays,
    };

    // Estimate class mean/stddev from this student's data as a reference
    // (students only see their own data, so we provide a rough benchmark)
    const engagementScore = metrics.totalTime / 60 + metrics.submissionCount * 10;
    const estimatedMean = 150; // rough benchmark for a 7-day window
    const estimatedStdDev = 60;

    const bucket = classifyStudentBucket(metrics, engagementScore, estimatedMean, estimatedStdDev);
    const recommendation = getBucketRecommendation(bucket);
    const meta = BUCKET_META[bucket];

    return { bucket, recommendation, meta, metrics, engagementScore };
  }, [classSubmissions, classXp]);

  // ─── Activity timeline (last 7 days) ─────────────────
  const activityTimeline = useMemo(() => {
    const days: { label: string; count: number; minutes: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = t(WEEKDAY_KEYS[d.getDay()]);
      const daySubs = classSubmissions.filter(s => s.submittedAt?.startsWith(dateStr));
      days.push({
        label,
        count: daySubs.length,
        minutes: Math.round(daySubs.reduce((a, s) => a + (s.metrics?.engagementTime || 0), 0) / 60),
      });
    }
    return days;
  }, [classSubmissions, t]);

  const maxDayMinutes = useMemo(() => Math.max(1, ...activityTimeline.map(d => d.minutes)), [activityTimeline]);

  // ─── Submission status breakdown ──────────────────────
  const statusBreakdown = useMemo(() => {
    const counts = { SUCCESS: 0, NORMAL: 0, SUPPORT_NEEDED: 0, FLAGGED: 0, STARTED: 0 };
    classSubmissions.forEach(s => {
      if (s.status in counts) counts[s.status as keyof typeof counts]++;
    });
    return counts;
  }, [classSubmissions]);

  return (
    <div className="space-y-6" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-[var(--text-primary)] flex items-center gap-2">
            <Brain className="w-5 h-5 text-[var(--accent-text)]" />
            {t('stats.title')}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">{interpolate(t('stats.subtitle'), { className: activeClass })}</p>
        </div>
        <div className="text-right">
          <div className={`text-sm font-black ${rankDetails.tierColor.split(' ').slice(1).join(' ')}`}>{rankDetails.rankName}</div>
          <div className="text-[11.5px] text-[var(--text-muted)]">{interpolate(t('stats.level'), { level })}</div>
        </div>
      </div>

      {/* ═══════════════ ROW 1: OVERVIEW METRICS ═══════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label={t('stats.classXp')} value={classXp.toLocaleString()} sub={interpolate(t('stats.classXpSub'), { total: totalXp.toLocaleString() })} color="text-amber-600 dark:text-amber-400" icon={<Zap className="w-3.5 h-3.5" />} />
        <MetricCard label={t('stats.gearScore')} value={gearScore} sub={interpolate(t('stats.gearScoreSub'), { filled: Object.values(equipped).filter(Boolean).length })} color="text-purple-600 dark:text-purple-400" icon={<Shield className="w-3.5 h-3.5" />} />
        <MetricCard label={t('stats.resourcesAccessed')} value={classSubmissions.length} sub={interpolate(t('stats.resourcesSub'), { count: statusBreakdown.SUCCESS })} color="text-emerald-700 dark:text-emerald-400" icon={<Target className="w-3.5 h-3.5" />} />
        <MetricCard label={t('stats.cyberFlux')} value={currency} sub={t('stats.craftingCurrency')} color="text-cyan-700 dark:text-cyan-400" icon={<Sparkles className="w-3.5 h-3.5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══════════════ COMBAT STATS DEEP DIVE ═══════════════ */}
        <div className="bg-[var(--surface-glass)] border border-[var(--border-strong)] rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-2">
            <Swords className="w-4 h-4 text-red-600 dark:text-red-400" /> {t('stats.combatAnalysis')}
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] -mt-2">{t('stats.combatAnalysisDesc')}</p>

          <div className="space-y-3">
            <StatBar label={t('stats.tech')} value={playerStats.tech} max={100} color="text-blue-600 dark:text-blue-400" icon={<Zap className="w-3 h-3" />} description={t('stats.techDesc')} />
            <StatBar label={t('stats.focus')} value={playerStats.focus} max={100} color="text-green-600 dark:text-green-400" icon={<Crosshair className="w-3 h-3" />} description={interpolate(t('stats.focusDesc'), { critPct: (combat.critChance * 100).toFixed(0), mult: combat.critMultiplier.toFixed(2) })} />
            <StatBar label={t('stats.analysis')} value={playerStats.analysis} max={100} color="text-yellow-600 dark:text-yellow-400" icon={<Shield className="w-3 h-3" />} description={interpolate(t('stats.analysisDesc'), { pct: combat.armorPercent.toFixed(0) })} />
            <StatBar label={t('stats.charisma')} value={playerStats.charisma} max={100} color="text-purple-600 dark:text-purple-400" icon={<Heart className="w-3 h-3" />} description={interpolate(t('stats.charismaDesc'), { hp: combat.maxHp })} />
          </div>

          {/* Derived combat readouts */}
          <div className="grid grid-cols-4 gap-2 pt-3 border-t border-[var(--border)]">
            <div className="text-center">
              <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold">{t('stats.maxHp')}</div>
              <div className="text-sm font-black text-emerald-700 dark:text-emerald-400">{combat.maxHp}</div>
            </div>
            <div className="text-center">
              <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold">{t('stats.armor')}</div>
              <div className="text-sm font-black text-yellow-600 dark:text-yellow-400">{combat.armorPercent.toFixed(0)}%</div>
            </div>
            <div className="text-center">
              <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold">{t('stats.critPct')}</div>
              <div className="text-sm font-black text-green-600 dark:text-green-400">{(combat.critChance * 100).toFixed(0)}%</div>
            </div>
            <div className="text-center">
              <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold">{t('stats.critDmg')}</div>
              <div className="text-sm font-black text-red-600 dark:text-red-400">{combat.critMultiplier.toFixed(2)}x</div>
            </div>
          </div>

          {/* Stat source breakdown */}
          {(Object.keys(gemStats).length > 0 || Object.keys(runewordStats).length > 0 || Object.keys(setBonusStats).length > 0) && (
            <div className="pt-3 border-t border-[var(--border)] space-y-2">
              <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest">{t('stats.statSources')}</div>
              <div className="grid grid-cols-2 gap-1.5 text-[11.5px]">
                <div className="flex justify-between text-[var(--text-muted)]"><span>{t('stats.baseStats')}</span><span className="text-[var(--text-tertiary)]">{t('stats.baseStatsValue')}</span></div>
                {Object.keys(gemStats).length > 0 && (
                  <div className="flex justify-between text-cyan-700/70 dark:text-cyan-400/70"><span>{t('stats.gems')}</span><span>+{Object.values(gemStats).reduce((a, b) => a + b, 0)}</span></div>
                )}
                {Object.keys(runewordStats).length > 0 && (
                  <div className="flex justify-between text-orange-600 dark:text-orange-400/70"><span>{t('stats.runewords')}</span><span>+{Object.values(runewordStats).reduce((a, b) => a + b, 0)}</span></div>
                )}
                {Object.keys(setBonusStats).length > 0 && (
                  <div className="flex justify-between text-amber-600 dark:text-amber-400/70"><span>{t('stats.setBonus')}</span><span>+{Object.values(setBonusStats).reduce((a, b) => a + b, 0)}</span></div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════ XP BREAKDOWN ═══════════════ */}
        <div className="bg-[var(--surface-glass)] border border-[var(--border-strong)] rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" /> {t('stats.xpSources')}
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] -mt-2">{interpolate(t('stats.xpSourcesDesc'), { xp: classXp.toLocaleString(), className: activeClass })}</p>

          <div className="space-y-2">
            {[
              { key: 'engagement' as const, xp: xpBreakdown.engagementXp, color: 'bg-purple-500', textColor: 'text-purple-600 dark:text-purple-400' },
              { key: 'boss' as const, xp: xpBreakdown.bossXp, color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400' },
              { key: 'other' as const, xp: xpBreakdown.otherXp, color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-400' },
            ].filter(s => s.xp > 0).map(source => (
              <div key={source.key} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${source.color}`} />
                <div className="flex-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">{t(`stats.source${source.key.charAt(0).toUpperCase() + source.key.slice(1)}`)}</span>
                    <span className={`font-bold ${source.textColor}`}>{interpolate(t('stats.sourceXpValue'), { xp: source.xp.toLocaleString() })}</span>
                  </div>
                  <div className="text-[11.5px] text-[var(--text-muted)]">{t(`stats.source${source.key.charAt(0).toUpperCase() + source.key.slice(1)}Desc`)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Active multipliers */}
          {(streakMultiplier > 1) && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mt-2">
              <div className="flex items-center gap-2 text-xs">
                <Flame className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span className="text-orange-600 dark:text-orange-400 font-bold">{t('stats.streakBonusActive')}</span>
                <span className="ml-auto text-sm font-black text-yellow-600 dark:text-yellow-400">+{Math.round((streakMultiplier - 1) * 100)}%</span>
              </div>
              <div className="text-[11.5px] text-[var(--text-muted)] mt-1">{interpolate(t('stats.streakBonusSub'), { weeks: streak })}</div>
            </div>
          )}

          {/* Login streak */}
          {loginStreak > 1 && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border)]">
              <Star className="w-3.5 h-3.5 text-[var(--accent-text)]" />
              <span>{interpolate(t('stats.loginStreak'), { days: loginStreak })}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══════════════ TELEMETRY BUCKET ═══════════════ */}
        <div className={`border rounded-2xl p-5 space-y-4 ${bucketInfo.meta.bgColor} ${bucketInfo.meta.borderColor}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4" /> {t('stats.engagementStatus')}
            </h3>
            <span className={`text-sm font-black ${bucketInfo.meta.color}`}>{bucketInfo.meta.label}</span>
          </div>

          <p className="text-sm text-[var(--text-secondary)]">{bucketInfo.meta.description}</p>

          {/* Why this bucket */}
          <div className="bg-[var(--panel-bg)] rounded-xl p-3 border border-[var(--border)] space-y-2">
            <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest">{t('stats.whyThisClassification')}</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">{t('stats.activeTime7d')}</span>
                <span className="text-[var(--text-secondary)] font-mono">{Math.round(bucketInfo.metrics.totalTime / 60)}m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">{t('stats.resources7d')}</span>
                <span className="text-[var(--text-secondary)] font-mono">{bucketInfo.metrics.submissionCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">{t('stats.activeDays')}</span>
                <span className="text-[var(--text-secondary)] font-mono">{bucketInfo.metrics.activityDays}/{bucketInfo.metrics.schoolDaysInWindow7 ?? 7}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">{t('stats.keystrokes')}</span>
                <span className="text-[var(--text-secondary)] font-mono">{bucketInfo.metrics.totalKeystrokes}</span>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className="bg-[var(--panel-bg)] rounded-xl p-3 border border-[var(--border)]">
            <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-1">{t('stats.howToLevelUp')}</div>
            <p className="text-sm text-[var(--text-secondary)]">{bucketInfo.recommendation.studentTip}</p>
          </div>

          {/* Recommended resources */}
          <div>
            <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-2">{t('stats.recommendedForYou')}</div>
            <div className="flex flex-wrap gap-1.5">
              {bucketInfo.recommendation.categories.map(cat => (
                <span key={cat} className="text-[11.5px] bg-[var(--surface-glass)] border border-[var(--border-strong)] px-2.5 py-1 rounded-full text-[var(--text-secondary)] font-medium">
                  {cat}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════════ WEEKLY ACTIVITY CHART ═══════════════ */}
        <div className="bg-[var(--surface-glass)] border border-[var(--border-strong)] rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> {t('stats.sevenDayActivity')}
          </h3>

          <div className="flex items-end gap-2 h-32">
            {activityTimeline.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[11.5px] text-[var(--text-muted)] font-mono">{day.minutes}m</div>
                <div className="w-full bg-[var(--surface-glass)] rounded-t-lg relative flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t-lg transition-all duration-500 ${
                      day.minutes > 0 ? 'bg-purple-500/50 border border-purple-500/30' : 'bg-[var(--surface-glass)]'
                    }`}
                    style={{ height: `${Math.max(day.minutes > 0 ? 8 : 0, (day.minutes / maxDayMinutes) * 100)}%` }}
                  />
                </div>
                <div className="text-[11.5px] text-[var(--text-muted)] font-bold">{day.label}</div>
                {day.count > 0 && (
                  <div className="text-[8px] text-[var(--text-muted)]">{interpolate(t('stats.resAbbrev'), { count: day.count })}</div>
                )}
              </div>
            ))}
          </div>

          {/* Submission status breakdown */}
          <div className="pt-3 border-t border-[var(--border)]">
            <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-2">{t('stats.submissionQuality')}</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {statusBreakdown.SUCCESS > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[var(--text-tertiary)]">{t('stats.qualityExcellent')}</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold ml-auto">{statusBreakdown.SUCCESS}</span>
                </div>
              )}
              {statusBreakdown.NORMAL > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[var(--text-tertiary)]">{t('stats.qualityNormal')}</span>
                  <span className="text-blue-600 dark:text-blue-400 font-bold ml-auto">{statusBreakdown.NORMAL}</span>
                </div>
              )}
              {statusBreakdown.SUPPORT_NEEDED > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-[var(--text-tertiary)]">{t('stats.qualityNeedsSupport')}</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold ml-auto">{statusBreakdown.SUPPORT_NEEDED}</span>
                </div>
              )}
              {statusBreakdown.STARTED > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gray-500" />
                  <span className="text-[var(--text-tertiary)]">{t('stats.qualityStarted')}</span>
                  <span className="text-[var(--text-tertiary)] font-bold ml-auto">{statusBreakdown.STARTED}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ BOSS FIGHT READINESS ═══════════════ */}
      <div className="bg-[var(--surface-glass)] border border-[var(--border-strong)] rounded-2xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-2">
          <Swords className="w-4 h-4 text-red-600 dark:text-red-400" /> {t('stats.bossReadiness')}
        </h3>
        <p className="text-[11px] text-[var(--text-muted)] -mt-2">{t('stats.bossReadinessDesc')}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Offense */}
          <div className="bg-[var(--panel-bg)] rounded-xl p-4 border border-red-500/10 space-y-2">
            <div className="text-[11.5px] text-red-600 dark:text-red-400 uppercase font-bold tracking-widest flex items-center gap-1.5">
              <Swords className="w-3 h-3" /> {t('stats.offense')}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              {t('stats.offenseBody1')} <span className="text-blue-600 dark:text-blue-400 font-bold">{interpolate(t('stats.offenseBody2'), { stat: playerStats.tech })}</span> {t('stats.offenseBody3')}
              {playerStats.tech > 20 && <span className="text-emerald-700 dark:text-emerald-400"> {t('stats.offenseStrong')}</span>}
              {playerStats.tech <= 20 && playerStats.tech > 10 && <span className="text-yellow-600 dark:text-yellow-400"> {t('stats.offenseModerate')}</span>}
              {playerStats.tech <= 10 && <span className="text-red-600 dark:text-red-400"> {t('stats.offenseLow')}</span>}
            </div>
            <div className="text-[11.5px] text-[var(--text-muted)]">
              {t('stats.critChanceLine')} <span className="text-green-600 dark:text-green-400 font-bold">{(combat.critChance * 100).toFixed(0)}%</span> {interpolate(t('stats.critFromFocus'), { focus: playerStats.focus })}
            </div>
          </div>

          {/* Defense */}
          <div className="bg-[var(--panel-bg)] rounded-xl p-4 border border-yellow-500/10 space-y-2">
            <div className="text-[11.5px] text-yellow-600 dark:text-yellow-400 uppercase font-bold tracking-widest flex items-center gap-1.5">
              <Shield className="w-3 h-3" /> {t('stats.defense')}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              <span className="text-yellow-600 dark:text-yellow-400 font-bold">{interpolate(t('stats.armorBody1'), { pct: combat.armorPercent.toFixed(0) })}</span> {interpolate(t('stats.armorBody2'), { analysis: playerStats.analysis })}
              {combat.armorPercent >= 30 && <span className="text-emerald-700 dark:text-emerald-400"> {t('stats.armorExcellent')}</span>}
              {combat.armorPercent < 30 && combat.armorPercent >= 15 && <span className="text-yellow-600 dark:text-yellow-400"> {t('stats.armorDecent')}</span>}
              {combat.armorPercent < 15 && <span className="text-red-600 dark:text-red-400"> {t('stats.armorLow')}</span>}
            </div>
          </div>

          {/* Survivability */}
          <div className="bg-[var(--panel-bg)] rounded-xl p-4 border border-emerald-500/10 space-y-2">
            <div className="text-[11.5px] text-emerald-700 dark:text-emerald-400 uppercase font-bold tracking-widest flex items-center gap-1.5">
              <Heart className="w-3 h-3" /> {t('stats.survivability')}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              <span className="text-emerald-700 dark:text-emerald-400 font-bold">{interpolate(t('stats.hpBody1'), { hp: combat.maxHp })}</span> {interpolate(t('stats.hpBody2'), { charisma: playerStats.charisma })}
              {combat.maxHp >= 150 && <span className="text-emerald-700 dark:text-emerald-400"> {t('stats.hpLarge')}</span>}
              {combat.maxHp < 150 && combat.maxHp >= 120 && <span className="text-yellow-600 dark:text-yellow-400"> {t('stats.hpAverage')}</span>}
              {combat.maxHp < 120 && <span className="text-red-600 dark:text-red-400"> {t('stats.hpFragile')}</span>}
            </div>
          </div>
        </div>

        {/* Improvement tips */}
        <div className="bg-[var(--panel-bg)] rounded-xl p-3 border border-[var(--border)]">
          <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-2">{t('stats.recommendations')}</div>
          <div className="space-y-1.5">
            {gearScore < 100 && (
              <div className="flex items-start gap-2 text-[11px] text-[var(--text-tertiary)]">
                <ArrowUpRight className="w-3 h-3 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <span>{t('stats.recGearScore1')} <span className="text-amber-600 dark:text-amber-400 font-bold">{gearScore}</span>{t('stats.recGearScore2')}</span>
              </div>
            )}
            {playerStats.tech <= 15 && (
              <div className="flex items-start gap-2 text-[11px] text-[var(--text-tertiary)]">
                <ArrowUpRight className="w-3 h-3 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <span>{t('stats.recTech1')} <span className="text-blue-600 dark:text-blue-400 font-bold">{t('stats.recTech2')}</span>{t('stats.recTech3')}</span>
              </div>
            )}
            {combat.critChance < 0.1 && (
              <div className="flex items-start gap-2 text-[11px] text-[var(--text-tertiary)]">
                <ArrowUpRight className="w-3 h-3 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                <span>{t('stats.recFocus1')} <span className="text-green-600 dark:text-green-400 font-bold">{t('stats.recFocus2')}</span>{interpolate(t('stats.recFocus3'), { pct: (combat.critChance * 100).toFixed(0) })}</span>
              </div>
            )}
            {combat.armorPercent < 10 && (
              <div className="flex items-start gap-2 text-[11px] text-[var(--text-tertiary)]">
                <ArrowUpRight className="w-3 h-3 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                <span>{t('stats.recAnalysis1')} <span className="text-yellow-600 dark:text-yellow-400 font-bold">{t('stats.recAnalysis2')}</span>{t('stats.recAnalysis3')}</span>
              </div>
            )}
            {gearScore >= 100 && combat.critChance >= 0.1 && combat.armorPercent >= 10 && playerStats.tech > 15 && (
              <div className="flex items-start gap-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{t('stats.recBalanced')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntelDossier;
