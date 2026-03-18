import React, { useMemo } from 'react';
import { Submission, StudentBucketProfile } from '../../types';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { useChartTheme } from '../../lib/useChartTheme';

interface EngagementSummaryProps {
  submissions: Submission[];
  bucket: StudentBucketProfile | null;
  daysRange: number;
}

const EngagementSummary: React.FC<EngagementSummaryProps> = ({ submissions, bucket, daysRange }) => {
  const chartTheme = useChartTheme();

  // Engagement over time (line chart)
  const trendData = useMemo(() => {
    const now = new Date();
    const data: { date: string; time: number; subs: number }[] = [];
    for (let i = daysRange - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const daySubs = submissions.filter(s => s.submittedAt?.startsWith(dateStr));
      const dayTime = daySubs.reduce((acc, s) => acc + (s.metrics?.engagementTime || 0), 0);
      data.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        time: Math.round(dayTime / 60),
        subs: daySubs.length,
      });
    }
    return data;
  }, [submissions, daysRange]);

  // Summary stats
  const stats = useMemo(() => {
    const totalTime = submissions.reduce((a, s) => a + (s.metrics?.engagementTime || 0), 0);
    const avgTime = submissions.length > 0 ? totalTime / submissions.length : 0;
    const activityDays = new Set(submissions.map(s => s.submittedAt?.split('T')[0]).filter(Boolean)).size;

    // Trend: compare recent half vs earlier half
    const mid = Math.floor(trendData.length / 2);
    const recentAvg = trendData.slice(mid).reduce((a, d) => a + d.time, 0) / Math.max(1, trendData.length - mid);
    const earlierAvg = trendData.slice(0, mid).reduce((a, d) => a + d.time, 0) / Math.max(1, mid);
    const trend: 'up' | 'down' | 'flat' = recentAvg > earlierAvg * 1.2 ? 'up' : recentAvg < earlierAvg * 0.6 ? 'down' : 'flat';

    return {
      totalTime: Math.round(totalTime / 60),
      avgTime: Math.round(avgTime / 60),
      totalSubs: submissions.length,
      activityDays,
      engagementScore: bucket?.engagementScore ?? null,
      trend,
    };
  }, [submissions, bucket, trendData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-widest print:text-gray-700">Engagement Summary</h3>
        <div className="flex items-center gap-1.5">
          {stats.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-400" />}
          {stats.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
          {stats.trend === 'flat' && <Minus className="w-4 h-4 text-[var(--text-tertiary)]" />}
          <span className={`text-xs font-bold ${stats.trend === 'up' ? 'text-green-400' : stats.trend === 'down' ? 'text-red-400' : 'text-[var(--text-tertiary)]'}`}>
            {stats.trend === 'up' ? 'Trending Up' : stats.trend === 'down' ? 'Declining' : 'Stable'}
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Time', value: `${stats.totalTime}m`, icon: <Activity className="w-4 h-4 text-blue-400 print:text-blue-600" /> },
          { label: 'Avg / Submission', value: `${stats.avgTime}m` },
          { label: 'Submissions', value: String(stats.totalSubs) },
          { label: 'Activity Days', value: String(stats.activityDays) },
          ...(stats.engagementScore !== null ? [{ label: 'Engagement Score', value: String(stats.engagementScore) }] : []),
        ].map(s => (
          <div key={s.label} className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl p-3 print:border-gray-300 print:bg-gray-50">
            <div className="text-[9px] text-[var(--text-muted)] uppercase font-bold tracking-widest">{s.label}</div>
            <div className="text-lg font-bold text-[var(--text-primary)] print:text-black mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <div className="h-48 print:h-36 bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl p-4 print:border-gray-300 print:bg-white">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
            <XAxis
              dataKey="date"
              tick={{ fill: chartTheme.tickColor, fontSize: 10 }}
              interval={Math.max(0, Math.floor(trendData.length / 8))}
              axisLine={{ stroke: chartTheme.axisColor }}
            />
            <YAxis
              tick={{ fill: chartTheme.tickColor, fontSize: 10 }}
              axisLine={{ stroke: chartTheme.axisColor }}
              label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fill: chartTheme.tickColor, fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{ ...chartTheme.tooltipStyle, fontSize: 12 }}
              labelStyle={{ color: chartTheme.tickColor }}
              formatter={(value: number, name: string) => [
                `${value}${name === 'time' ? ' min' : ''}`,
                name === 'time' ? 'Engagement' : 'Submissions'
              ]}
            />
            <Line type="monotone" dataKey="time" stroke="#8b5cf6" strokeWidth={2} dot={false} name="time" />
            <Line type="monotone" dataKey="subs" stroke="#06b6d4" strokeWidth={2} dot={false} name="subs" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default EngagementSummary;
