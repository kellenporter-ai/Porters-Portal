import React, { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts';
import { Assignment, Submission, User, StudentBucketProfile, TelemetryBucket } from '../../types';
import { BUCKET_META } from '../../lib/telemetry';
import { useChartTheme } from '../../lib/useChartTheme';
import { BarChart3, TrendingUp, PieChart as PieChartIcon, Activity } from 'lucide-react';

interface AnalyticsTabProps {
  users: User[];
  assignments: Assignment[];
  submissions: Submission[];
  bucketProfiles: StudentBucketProfile[];
}

const BUCKET_COLORS: Record<TelemetryBucket, string> = {
  THRIVING: '#34d399',
  ON_TRACK: '#60a5fa',
  COASTING: '#facc15',
  SPRINTING: '#fb923c',
  STRUGGLING: '#c084fc',
  DISENGAGING: '#f87171',
  INACTIVE: '#9ca3af',
  COPYING: '#fb7185',
};

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ users, assignments, submissions, bucketProfiles }) => {
  const chartTheme = useChartTheme();

  // ─── Engagement Trends (submissions over last 30 days) ───
  const engagementTrends = useMemo(() => {
    const now = new Date();
    const days = 30;
    const buckets: Record<string, { date: string; submissions: number; avgTime: number; totalTime: number }> = {};

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      buckets[key] = { date: `${d.getMonth() + 1}/${d.getDate()}`, submissions: 0, avgTime: 0, totalTime: 0 };
    }

    for (const sub of submissions) {
      if (!sub.submittedAt) continue;
      const key = sub.submittedAt.split('T')[0];
      if (buckets[key]) {
        buckets[key].submissions += 1;
        buckets[key].totalTime += sub.metrics?.engagementTime || 0;
      }
    }

    return Object.values(buckets).map(b => ({
      ...b,
      avgTime: b.submissions > 0 ? Math.round(b.totalTime / b.submissions / 60) : 0,
    }));
  }, [submissions]);

  // ─── Completion Rates by Unit ───
  const completionByUnit = useMemo(() => {
    const units: Record<string, { unit: string; total: number; completed: number }> = {};

    for (const a of assignments) {
      if (a.status !== 'ACTIVE') continue;
      const unit = a.unit || 'General';
      if (!units[unit]) units[unit] = { unit, total: 0, completed: 0 };
      units[unit].total += users.length;

      const completedCount = submissions.filter(
        s => s.assignmentId === a.id && s.status !== 'STARTED'
      ).length;
      units[unit].completed += completedCount;
    }

    return Object.values(units)
      .map(u => ({ ...u, rate: u.total > 0 ? Math.round((u.completed / u.total) * 100) : 0 }))
      .sort((a, b) => b.rate - a.rate);
  }, [assignments, submissions, users]);

  // ─── XP Distribution Histogram ───
  const xpDistribution = useMemo(() => {
    const xps = users.map(u => {
      const classXps = u.gamification?.classXp || {};
      return Object.values(classXps).reduce((a: number, b: unknown) => a + (typeof b === 'number' ? b : 0), 0);
    });

    if (xps.length === 0) return [];

    const maxXp = Math.max(...xps, 100);
    const bucketSize = Math.max(50, Math.ceil(maxXp / 10 / 50) * 50);
    const bucketCount = Math.ceil(maxXp / bucketSize) + 1;
    const hist: { range: string; count: number }[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const low = i * bucketSize;
      const high = low + bucketSize;
      const count = xps.filter(x => x >= low && x < high).length;
      hist.push({ range: `${low}–${high}`, count });
    }

    return hist.filter(h => h.count > 0 || hist.indexOf(h) < 5);
  }, [users]);

  // ─── Telemetry Bucket Breakdown ───
  const bucketBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const bp of bucketProfiles) {
      counts[bp.bucket] = (counts[bp.bucket] || 0) + 1;
    }
    return (Object.keys(BUCKET_META) as TelemetryBucket[])
      .map(bucket => ({
        name: BUCKET_META[bucket].label,
        value: counts[bucket] || 0,
        bucket,
        color: BUCKET_COLORS[bucket],
      }))
      .filter(b => b.value > 0);
  }, [bucketProfiles]);

  const totalProfiled = bucketBreakdown.reduce((a, b) => a + b.value, 0);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ─── Engagement Trends ─── */}
      <section className="bg-[var(--surface-glass)] border border-[var(--border-strong)] rounded-3xl p-6 backdrop-blur-md">
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          Engagement Trends
        </h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">Submissions and average engagement time over the last 30 days</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={engagementTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
              <XAxis
                dataKey="date"
                tick={{ fill: chartTheme.tickColor, fontSize: 10 }}
                interval={4}
                axisLine={{ stroke: chartTheme.axisColor }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: chartTheme.tickColor, fontSize: 10 }}
                axisLine={{ stroke: chartTheme.axisColor }}
                label={{ value: 'Submissions', angle: -90, position: 'insideLeft', fill: chartTheme.tickColor, fontSize: 10 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: chartTheme.tickColor, fontSize: 10 }}
                axisLine={{ stroke: chartTheme.axisColor }}
                label={{ value: 'Avg Time (min)', angle: 90, position: 'insideRight', fill: chartTheme.tickColor, fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{ ...chartTheme.tooltipStyle, fontSize: 12 }}
                labelStyle={{ color: chartTheme.tickColor }}
              />
              <Line yAxisId="left" type="monotone" dataKey="submissions" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Submissions" />
              <Line yAxisId="right" type="monotone" dataKey="avgTime" stroke="#06b6d4" strokeWidth={2} dot={false} name="Avg Time (min)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Completion Rates by Unit ─── */}
        <section className="bg-[var(--surface-glass)] border border-[var(--border-strong)] rounded-3xl p-6 backdrop-blur-md">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            Completion by Unit
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-4">Percentage of students who completed each unit&rsquo;s assignments</p>
          {completionByUnit.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={completionByUnit} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: chartTheme.tickColor, fontSize: 10 }}
                    axisLine={{ stroke: chartTheme.axisColor }}
                    tickFormatter={v => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="unit"
                    width={120}
                    tick={{ fill: chartTheme.labelColor, fontSize: 10 }}
                    axisLine={{ stroke: chartTheme.axisColor }}
                  />
                  <Tooltip
                    contentStyle={{ ...chartTheme.tooltipStyle, fontSize: 12 }}
                    formatter={(value: number) => [`${value}%`, 'Completion']}
                  />
                  <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                    {completionByUnit.map((entry, i) => (
                      <Cell key={i} fill={entry.rate >= 80 ? '#34d399' : entry.rate >= 50 ? '#60a5fa' : entry.rate >= 25 ? '#facc15' : '#f87171'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-12 text-[var(--text-muted)] italic">No assignment data available</div>
          )}
        </section>

        {/* ─── XP Distribution ─── */}
        <section className="bg-[var(--surface-glass)] border border-[var(--border-strong)] rounded-3xl p-6 backdrop-blur-md">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--accent-text)]" />
            XP Distribution
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-4">Student XP histogram across all classes</p>
          {xpDistribution.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={xpDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                  <XAxis
                    dataKey="range"
                    tick={{ fill: chartTheme.tickColor, fontSize: 9 }}
                    axisLine={{ stroke: chartTheme.axisColor }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fill: chartTheme.tickColor, fontSize: 10 }}
                    axisLine={{ stroke: chartTheme.axisColor }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ ...chartTheme.tooltipStyle, fontSize: 12 }}
                    formatter={(value: number) => [value, 'Students']}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-12 text-[var(--text-muted)] italic">No XP data available</div>
          )}
        </section>
      </div>

      {/* ─── Telemetry Bucket Breakdown ─── */}
      <section className="bg-[var(--surface-glass)] border border-[var(--border-strong)] rounded-3xl p-6 backdrop-blur-md">
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
          <Activity className="w-5 h-5 text-amber-400" />
          Engagement Bucket Breakdown
        </h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">Distribution of students across behavioral engagement buckets</p>
        {bucketBreakdown.length > 0 ? (
          <div className="flex flex-col lg:flex-row items-center gap-8">
            <div className="w-64 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={bucketBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    dataKey="value"
                    nameKey="name"
                    stroke="none"
                  >
                    {bucketBreakdown.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ ...chartTheme.tooltipStyle, fontSize: 12 }}
                    formatter={(value: number, name: string) => [`${value} (${Math.round((value / totalProfiled) * 100)}%)`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {bucketBreakdown.map(b => {
                const meta = BUCKET_META[b.bucket as TelemetryBucket];
                return (
                  <div key={b.bucket} className={`${meta.bgColor} border ${meta.borderColor} rounded-xl p-3`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${meta.color}`}>{meta.label}</span>
                      <span className="text-lg font-bold text-[var(--text-primary)]">{b.value}</span>
                    </div>
                    <div className="text-[11.5px] text-[var(--text-tertiary)]">
                      {totalProfiled > 0 ? Math.round((b.value / totalProfiled) * 100) : 0}% of class
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-[var(--text-muted)] italic flex flex-col items-center gap-2">
            <PieChartIcon className="w-8 h-8 opacity-20" />
            No bucket profile data available yet
          </div>
        )}
      </section>
    </div>
  );
};

export default React.memo(AnalyticsTab);
