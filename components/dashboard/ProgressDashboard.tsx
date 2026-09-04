import React, { useMemo } from 'react';
import { Assignment, Submission } from '../../types';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Cell,
} from 'recharts';
import { TrendingUp, CheckCircle2, Clock, Target, Activity, BarChart3 } from 'lucide-react';
import { useChartTheme } from '../../lib/useChartTheme';
import { useT, useInterpolate } from '../../lib/i18n';

interface ProgressDashboardProps {
  assignments: Assignment[];
  submissions: Submission[];
  activeClass: string;
}

// ─── Stat card ──────────────────────────────
const StatCard: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, sub, icon, color }) => (
  <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4">
    <div className="flex items-center gap-2 mb-2">
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <span className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest">{label}</span>
    </div>
    <div className="text-2xl font-black text-[var(--text-primary)] leading-tight">{value}</div>
    {sub && <div className="text-[11.5px] text-[var(--text-muted)] mt-1">{sub}</div>}
  </div>
);

// ─── Custom tooltip ─────────────────────────
const ChartTooltip: React.FC<{ active?: boolean; payload?: { value: number }[]; label?: string; valueLabel?: string; valueSuffix?: string }> = ({
  active, payload, label, valueLabel, valueSuffix = '',
}) => {
  const t = useT();
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--backdrop)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-[var(--text-tertiary)] mb-1">{label}</div>
      <div className="text-[var(--text-primary)] font-bold">{valueLabel ?? t('progress.tooltipValue')}: {Math.round(payload[0].value)}{valueSuffix}</div>
    </div>
  );
};

const ProgressDashboard: React.FC<ProgressDashboardProps> = ({ assignments, submissions, activeClass }) => {
  const t = useT();
  const interpolate = useInterpolate();
  const chartTheme = useChartTheme();

  // Localized relative-time helper ("5m ago", "3h ago", "2d ago", "1w ago")
  const timeAgo = (date: Date): string => {
    const diff = Date.now() - date.getTime();
    const minutes = Math.max(0, Math.floor(diff / 60000));
    if (minutes < 60) return interpolate('progress.minAgo', { minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return interpolate('progress.hoursAgo', { hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return interpolate('progress.daysAgo', { days });
    return interpolate('progress.weeksAgo', { weeks: Math.floor(days / 7) });
  };

  // Filter to active class
  const classAssignments = useMemo(
    () => assignments.filter(a => a.classType === activeClass && a.status === 'ACTIVE'),
    [assignments, activeClass],
  );

  // ─── Completion rates ───────────────────
  const completionStats = useMemo(() => {
    const total = classAssignments.length;
    // Deduplicate: count each assignment at most once (retakes shouldn't inflate count)
    const completedIds = new Set(
      submissions
        .filter(s => classAssignments.some(a => a.id === s.assignmentId) && s.status !== 'STARTED')
        .map(s => s.assignmentId),
    );
    const completed = completedIds.size;
    // For avg score, take the best score per assignment
    const bestScores = new Map<string, number>();
    submissions
      .filter(s => classAssignments.some(a => a.id === s.assignmentId) && s.score > 0)
      .forEach(s => {
        const prev = bestScores.get(s.assignmentId) || 0;
        if (s.score > prev) bestScores.set(s.assignmentId, s.score);
      });
    const scoreValues = [...bestScores.values()];
    const avgScore = scoreValues.length > 0
      ? scoreValues.reduce((sum, v) => sum + v, 0) / scoreValues.length
      : 0;
    const rate = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    return { total, completed, rate, avgScore: Math.round(avgScore), scoredCount: scoreValues.length };
  }, [classAssignments, submissions]);

  // ─── Scores over time (by submission date) ───
  const scoresOverTime = useMemo(() => {
    const scored = submissions
      .filter(s => classAssignments.some(a => a.id === s.assignmentId) && s.score > 0 && s.submittedAt)
      .sort((a, b) => new Date(a.submittedAt!).getTime() - new Date(b.submittedAt!).getTime());

    return scored.map(s => {
      const assignment = classAssignments.find(a => a.id === s.assignmentId);
      const date = new Date(s.submittedAt!);
      return {
        date: `${date.getMonth() + 1}/${date.getDate()}`,
        score: s.score,
        title: assignment?.title?.slice(0, 25) || t('progress.unknownAssignment'),
      };
    });
  }, [classAssignments, submissions]);

  // ─── Engagement trends (engagement minutes per week) ───
  const engagementByWeek = useMemo(() => {
    const weekMap: Record<string, number> = {};
    submissions
      .filter(s => classAssignments.some(a => a.id === s.assignmentId) && s.submittedAt)
      .forEach(s => {
        const d = new Date(s.submittedAt!);
        // ISO week label
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
        weekMap[label] = (weekMap[label] || 0) + (s.metrics?.engagementTime || 0);
      });

    return Object.entries(weekMap)
      .map(([week, seconds]) => ({ week, minutes: Math.round(seconds / 60) }))
      .slice(-12); // Last 12 weeks
  }, [classAssignments, submissions]);

  // ─── Per-unit completion breakdown ───
  const unitBreakdown = useMemo(() => {
    const units: Record<string, { total: number; completed: number }> = {};
    classAssignments.forEach(a => {
      const unit = a.unit || 'General';
      if (!units[unit]) units[unit] = { total: 0, completed: 0 };
      units[unit].total++;
      const sub = submissions.find(s => s.assignmentId === a.id && s.status !== 'STARTED');
      if (sub) units[unit].completed++;
    });
    return Object.entries(units).map(([unit, data]) => ({
      unit: unit.length > 18 ? unit.slice(0, 16) + '…' : unit,
      fullUnit: unit,
      completed: data.completed,
      remaining: data.total - data.completed,
      pct: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
    }));
  }, [classAssignments, submissions]);

  // ─── Recent activity feed ───
  const recentActivity = useMemo(() => {
    return submissions
      .filter(s => classAssignments.some(a => a.id === s.assignmentId) && s.submittedAt)
      .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime())
      .slice(0, 8)
      .map(s => {
        const assignment = classAssignments.find(a => a.id === s.assignmentId);
        const d = new Date(s.submittedAt!);
        const ago = timeAgo(d);
        return {
          title: assignment?.title || 'Unknown',
          score: s.score,
          status: s.status,
          ago,
          engagementMin: Math.round((s.metrics?.engagementTime || 0) / 60),
        };
      });
  }, [classAssignments, submissions]);

  const totalEngagementMin = useMemo(() => {
    return Math.round(
      submissions
        .filter(s => classAssignments.some(a => a.id === s.assignmentId))
        .reduce((sum, s) => sum + (s.metrics?.engagementTime || 0), 0) / 60,
    );
  }, [classAssignments, submissions]);

  const COLORS = ['#8b5cf6', '#06b6d4', '#22c55e', '#eab308', '#f97316', '#ec4899', '#6366f1', '#14b8a6'];

  return (
    <div style={{ animation: 'tabEnter 0.3s ease-out both' }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-[var(--accent-muted)] rounded-xl text-[var(--accent-text)]">
          <BarChart3 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('progress.title')}</h2>
          <p className="text-xs text-[var(--text-muted)]">{interpolate('progress.subtitle', { className: activeClass })}</p>
        </div>
      </div>

      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label={t('progress.completion')}
          value={`${completionStats.rate}%`}
          sub={interpolate('progress.completionSub', { done: completionStats.completed, total: completionStats.total })}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
        />
        <StatCard
          label={t('progress.avgScore')}
          value={completionStats.avgScore > 0 ? `${completionStats.avgScore}%` : '—'}
          sub={completionStats.scoredCount > 0 ? interpolate('progress.avgScoreSub', { count: completionStats.scoredCount }) : t('progress.noGradedYet')}
          icon={<Target className="w-4 h-4" />}
          color="bg-blue-500/20 text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label={t('progress.engagement')}
          value={`${totalEngagementMin}m`}
          sub={t('progress.engagementSub')}
          icon={<Clock className="w-4 h-4" />}
          color="bg-amber-500/20 text-amber-300"
        />
        <StatCard
          label={t('progress.trend')}
          value={scoresOverTime.length >= 2
            ? (scoresOverTime[scoresOverTime.length - 1].score >= scoresOverTime[scoresOverTime.length - 2].score ? '↑' : '↓')
            : '—'}
          sub={scoresOverTime.length >= 2 ? t('progress.trendUp') : t('progress.needTwoScores')}
          icon={<TrendingUp className="w-4 h-4" />}
          color="bg-purple-500/20 text-purple-600 dark:text-purple-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* ─── Scores Over Time ─── */}
        <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4">
          <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            {t('progress.scoresOverTime')}
          </h3>
          {scoresOverTime.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={scoresOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: chartTheme.tickColor }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: chartTheme.tickColor }} />
                <Tooltip content={<ChartTooltip valueLabel={t('progress.tooltipScore')} valueSuffix="%" />} />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#a78bfa' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-[var(--text-muted)] text-sm">
              {t('progress.noScoredSubmissions')}
            </div>
          )}
        </div>

        {/* ─── Engagement Trends ─── */}
        <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4">
          <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            {t('progress.engagementByWeek')}
          </h3>
          {engagementByWeek.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={engagementByWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: chartTheme.tickColor }} />
                <YAxis tick={{ fontSize: 10, fill: chartTheme.tickColor }} />
                <Tooltip content={<ChartTooltip valueLabel={t('progress.tooltipMinutes')} valueSuffix="m" />} />
                <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
                  {engagementByWeek.map((_, i) => (
                    <Cell key={i} fill={i === engagementByWeek.length - 1 ? '#22c55e' : 'rgba(34,197,94,0.3)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-[var(--text-muted)] text-sm">
              {t('progress.noEngagementData')}
            </div>
          )}
        </div>
      </div>

      {/* ─── Unit Completion Breakdown ─── */}
      {unitBreakdown.length > 0 && (
        <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4 mb-6">
          <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            {t('progress.completionByUnit')}
          </h3>
          <div className="space-y-3">
            {unitBreakdown.map((u, i) => (
              <div key={u.fullUnit}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[var(--text-tertiary)] font-medium">{u.unit}</span>
                  <span className="text-[var(--text-muted)]">{u.completed}/{u.completed + u.remaining} ({u.pct}%)</span>
                </div>
                <div className="h-2 bg-[var(--surface-glass)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${u.pct}%`,
                      backgroundColor: COLORS[i % COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Recent Activity ─── */}
      {recentActivity.length > 0 && (
        <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4">
          <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-3">{t('progress.recentActivity')}</h3>
          <div className="space-y-2">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  a.status === 'SUCCESS' ? 'bg-emerald-400' :
                  a.status === 'FLAGGED' ? 'bg-red-400' :
                  a.status === 'SUPPORT_NEEDED' ? 'bg-yellow-400' : 'bg-gray-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--text-secondary)] truncate">{a.title}</div>
                  <div className="text-[11.5px] text-[var(--text-muted)]">{a.ago} · {interpolate('progress.minEngagement', { minutes: a.engagementMin })}</div>
                </div>
                {a.score > 0 && (
                  <div className={`text-sm font-bold ${a.score >= 80 ? 'text-emerald-700 dark:text-emerald-400' : a.score >= 60 ? 'text-yellow-300' : 'text-red-600 dark:text-red-400'}`}>
                    {a.score}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ProgressDashboard);
