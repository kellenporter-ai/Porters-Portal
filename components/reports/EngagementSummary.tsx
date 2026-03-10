import React, { useMemo } from 'react';
import { Submission, StudentBucketProfile } from '../../types';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

interface EngagementSummaryProps {
  submissions: Submission[];
  bucket: StudentBucketProfile | null;
  daysRange: number;
}

const EngagementSummary: React.FC<EngagementSummaryProps> = ({ submissions, bucket, daysRange }) => {
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
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest print:text-gray-700">Engagement Summary</h3>
        <div className="flex items-center gap-1.5">
          {stats.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-400" />}
          {stats.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
          {stats.trend === 'flat' && <Minus className="w-4 h-4 text-gray-400" />}
          <span className={`text-xs font-bold ${stats.trend === 'up' ? 'text-green-400' : stats.trend === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
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
          <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-3 print:border-gray-300 print:bg-gray-50">
            <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">{s.label}</div>
            <div className="text-lg font-bold text-white print:text-black mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <div className="h-48 print:h-36 bg-white/5 border border-white/10 rounded-2xl p-4 print:border-gray-300 print:bg-white">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              interval={Math.max(0, Math.floor(trendData.length / 8))}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1a1b2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: 12 }}
              labelStyle={{ color: '#9ca3af' }}
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
