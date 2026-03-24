import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import { User, Quest, XPEvent, BossQuizEvent } from '../../types';
import { BarChart3, TrendingUp, Users, Trophy, Zap, Target } from 'lucide-react';
import { getRankDetails } from '../../lib/gamification';
import { useChartTheme } from '../../lib/useChartTheme';

interface GamificationAnalyticsTabProps {
  students: User[];
  quests: Quest[];
  events: XPEvent[];
  quizBosses: BossQuizEvent[];
}

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

const StatCard = ({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) => (
  <div className="bg-[var(--panel-bg)] rounded-xl p-4 border border-[var(--border)]">
    <div className="flex items-center gap-2 mb-2 text-[var(--text-tertiary)]">{icon}<span className="text-[10px] font-bold uppercase tracking-widest">{label}</span></div>
    <div className="text-2xl font-black text-[var(--text-primary)]">{value}</div>
    {sub && <div className="text-[10px] text-[var(--text-muted)] mt-1">{sub}</div>}
  </div>
);

const GamificationAnalyticsTab: React.FC<GamificationAnalyticsTabProps> = ({ students, quests, events, quizBosses }) => {
  const chartTheme = useChartTheme();

  // --- XP Distribution ---
  const xpDistribution = useMemo(() => {
    const brackets = [
      { label: '0-499', min: 0, max: 499, count: 0 },
      { label: '500-999', min: 500, max: 999, count: 0 },
      { label: '1K-2.5K', min: 1000, max: 2499, count: 0 },
      { label: '2.5K-5K', min: 2500, max: 4999, count: 0 },
      { label: '5K-10K', min: 5000, max: 9999, count: 0 },
      { label: '10K+', min: 10000, max: Infinity, count: 0 },
    ];
    students.forEach(s => {
      const xp = s.gamification?.xp || 0;
      const bracket = brackets.find(b => xp >= b.min && xp <= b.max);
      if (bracket) bracket.count++;
    });
    return brackets;
  }, [students]);

  // --- Level Distribution ---
  const levelDistribution = useMemo(() => {
    const levels: Record<number, number> = {};
    students.forEach(s => {
      const lvl = s.gamification?.level || 1;
      levels[lvl] = (levels[lvl] || 0) + 1;
    });
    return Object.entries(levels)
      .map(([level, count]) => ({ level: `Lv${level}`, count }))
      .sort((a, b) => parseInt(a.level.slice(2)) - parseInt(b.level.slice(2)));
  }, [students]);

  // --- Class XP breakdown ---
  const classXpData = useMemo(() => {
    const totals: Record<string, number> = {};
    students.forEach(s => {
      const classXp = s.gamification?.classXp || {};
      Object.entries(classXp).forEach(([cls, xp]) => {
        totals[cls] = (totals[cls] || 0) + (xp as number);
      });
    });
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [students]);

  // --- Quest Completion Stats ---
  const questStats = useMemo(() => {
    const activeQuests = quests.filter(q => q.isActive).length;
    const totalQuests = quests.length;
    let totalCompletions = 0;
    students.forEach(s => {
      totalCompletions += s.gamification?.completedQuests?.length || 0;
    });
    const avgCompletionsPerStudent = students.length > 0 ? (totalCompletions / students.length).toFixed(1) : '0';
    return { activeQuests, totalQuests, totalCompletions, avgCompletionsPerStudent };
  }, [quests, students]);

  // --- Quest type distribution ---
  const questTypeData = useMemo(() => {
    const types: Record<string, number> = {};
    quests.forEach(q => { types[q.type] = (types[q.type] || 0) + 1; });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [quests]);

  // --- Flux Economy ---
  const fluxStats = useMemo(() => {
    let total = 0;
    let maxFlux = 0;
    students.forEach(s => {
      const flux = s.gamification?.currency || 0;
      total += flux;
      if (flux > maxFlux) maxFlux = flux;
    });
    const avg = students.length > 0 ? Math.round(total / students.length) : 0;
    return { total, avg, max: maxFlux };
  }, [students]);

  // --- Summary stats ---
  const summaryStats = useMemo(() => {
    const totalXP = students.reduce((s, u) => s + (u.gamification?.xp || 0), 0);
    const avgXP = students.length > 0 ? Math.round(totalXP / students.length) : 0;
    const maxLevel = students.reduce((m, u) => Math.max(m, u.gamification?.level || 1), 1);
    const activeEvents = events.filter(e => e.isActive).length;
    const activeBosses = quizBosses.filter(b => b.isActive).length;
    return { totalXP, avgXP, maxLevel, activeEvents, activeBosses };
  }, [students, events, quizBosses]);

  // --- Engagement metrics ---
  const engagementData = useMemo(() => {
    const streakBuckets = [
      { label: '0 weeks', count: 0 },
      { label: '1-2 weeks', count: 0 },
      { label: '3-4 weeks', count: 0 },
      { label: '5+ weeks', count: 0 },
    ];
    students.forEach(s => {
      const streak = s.gamification?.engagementStreak || 0;
      if (streak === 0) streakBuckets[0].count++;
      else if (streak <= 2) streakBuckets[1].count++;
      else if (streak <= 4) streakBuckets[2].count++;
      else streakBuckets[3].count++;
    });
    return streakBuckets;
  }, [students]);

  // --- Top Performers ---
  const topPerformers = useMemo(() => {
    return [...students]
      .sort((a, b) => (b.gamification?.xp || 0) - (a.gamification?.xp || 0))
      .slice(0, 5);
  }, [students]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Students" value={students.length} icon={<Users className="w-4 h-4" />} />
        <StatCard label="Avg XP" value={summaryStats.avgXP.toLocaleString()} sub={`${summaryStats.totalXP.toLocaleString()} total`} icon={<Zap className="w-4 h-4" />} />
        <StatCard label="Max Level" value={summaryStats.maxLevel} icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard label="Active Quests" value={questStats.activeQuests} sub={`${questStats.totalQuests} total`} icon={<Target className="w-4 h-4" />} />
        <StatCard label="Active Events" value={summaryStats.activeEvents} icon={<Zap className="w-4 h-4" />} />
        <StatCard label="Active Bosses" value={summaryStats.activeBosses} icon={<Trophy className="w-4 h-4" />} />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* XP Distribution */}
        <div className="bg-[var(--panel-bg)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[var(--accent-text)]" /> XP Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={xpDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
              <XAxis dataKey="label" tick={{ fill: chartTheme.tickColor, fontSize: 10 }} />
              <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 10 }} />
              <Tooltip contentStyle={{ ...chartTheme.tooltipStyle, fontSize: 12 }} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Level Distribution */}
        <div className="bg-[var(--panel-bg)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-cyan-400" /> Level Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={levelDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
              <XAxis dataKey="level" tick={{ fill: chartTheme.tickColor, fontSize: 10 }} />
              <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 10 }} />
              <Tooltip contentStyle={{ ...chartTheme.tooltipStyle, fontSize: 12 }} />
              <Bar dataKey="count" fill="#06b6d4" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Class XP Breakdown */}
        <div className="bg-[var(--panel-bg)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4">Class XP Breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={classXpData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {classXpData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ ...chartTheme.tooltipStyle, fontSize: 12 }} formatter={(value: number) => value.toLocaleString()} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Quest Type Distribution */}
        <div className="bg-[var(--panel-bg)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4">Quest Types</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={questTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                {questTypeData.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ ...chartTheme.tooltipStyle, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Engagement Streaks */}
        <div className="bg-[var(--panel-bg)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4">Engagement Streaks</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={engagementData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
              <XAxis dataKey="label" tick={{ fill: chartTheme.tickColor, fontSize: 10 }} />
              <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 10 }} />
              <Tooltip contentStyle={{ ...chartTheme.tooltipStyle, fontSize: 12 }} />
              <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Flux Economy */}
        <div className="bg-[var(--panel-bg)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4">Flux Economy</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <div className="text-xl font-black text-cyan-700 dark:text-cyan-400">{fluxStats.total.toLocaleString()}</div>
              <div className="text-[9px] text-[var(--text-muted)] uppercase font-bold">Total in Circulation</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-black text-cyan-700 dark:text-cyan-400">{fluxStats.avg.toLocaleString()}</div>
              <div className="text-[9px] text-[var(--text-muted)] uppercase font-bold">Avg per Student</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-black text-cyan-700 dark:text-cyan-400">{fluxStats.max.toLocaleString()}</div>
              <div className="text-[9px] text-[var(--text-muted)] uppercase font-bold">Max Holdings</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">
            Quest completions: {questStats.totalCompletions} total ({questStats.avgCompletionsPerStudent} avg/student)
          </div>
        </div>

        {/* Top 5 Performers */}
        <div className="bg-[var(--panel-bg)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /> Top 5 Operatives</h3>
          <div className="space-y-2">
            {topPerformers.map((s, idx) => {
              const xp = s.gamification?.xp || 0;
              const lvl = s.gamification?.level || 1;
              const rd = getRankDetails(lvl);
              const medalColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600', 'text-blue-400', 'text-purple-400'];
              return (
                <div key={s.id} className="flex items-center gap-3 p-2 rounded-xl bg-[var(--panel-bg)] border border-[var(--border)]">
                  <span className={`text-sm font-black w-6 text-center ${medalColors[idx]}`}>#{idx + 1}</span>
                  {s.avatarUrl && <img src={s.avatarUrl} className="w-7 h-7 rounded-lg border border-[var(--border-strong)]" alt={s.name} loading="lazy" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-[var(--text-primary)] truncate">{s.name}</div>
                    <div className={`text-[9px] font-mono ${rd.tierColor.split(' ').slice(1).join(' ')}`}>{rd.rankName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-[var(--accent-text)]">{xp.toLocaleString()}</div>
                    <div className="text-[9px] text-[var(--text-muted)]">Lv{lvl}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GamificationAnalyticsTab;
