import React, { useState, useMemo } from 'react';
import { Submission } from '../../types';
import {
  Clock, BarChart3, Users, TrendingUp, Activity, LayoutGrid, List,
} from 'lucide-react';

interface EngagementSummaryProps {
  submissions: Submission[];
}

const EngagementSummary: React.FC<EngagementSummaryProps> = ({ submissions }) => {
  const [activityView, setActivityView] = useState<'grid' | 'list'>('grid');
  const [expanded, setExpanded] = useState(false);

  const engagementLogs: Submission[] = useMemo(() => {
    const rawSubs = Array.isArray(submissions) ? submissions : [];
    return [...rawSubs].sort((a, b) => {
      const dateA = new Date(a.submittedAt || 0).getTime();
      const dateB = new Date(b.submittedAt || 0).getTime();
      return dateB - dateA;
    });
  }, [submissions]);

  const engagementStats = useMemo(() => {
    const totalXP = engagementLogs.reduce((sum, s) => sum + Math.round(s.score), 0);
    const uniqueStudents = new Set(engagementLogs.map(s => s.userId)).size;
    const avgXP = engagementLogs.length > 0 ? Math.round(totalXP / engagementLogs.length) : 0;
    return { totalXP, uniqueStudents, avgXP, totalSubmissions: engagementLogs.length };
  }, [engagementLogs]);

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Submissions', value: engagementStats.totalSubmissions, icon: <BarChart3 className="w-5 h-5" />, color: 'purple' },
          { label: 'Unique Students', value: engagementStats.uniqueStudents, icon: <Users className="w-5 h-5" />, color: 'blue' },
          { label: 'Total XP Earned', value: engagementStats.totalXP.toLocaleString(), icon: <TrendingUp className="w-5 h-5" />, color: 'emerald' },
          { label: 'Avg XP / Submission', value: engagementStats.avgXP, icon: <Activity className="w-5 h-5" />, color: 'amber' },
        ].map(stat => (
          <div key={stat.label} className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className={`text-${stat.color}-400`}>{stat.icon}</span>
              <span className="text-[11.5px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{stat.label}</span>
            </div>
            <div className="text-2xl font-black text-[var(--text-primary)]">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Collapsible Activity Feed */}
      <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-3xl p-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setExpanded(prev => !prev)}
            className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-2 hover:text-[var(--text-primary)] transition cursor-pointer"
          >
            <Clock className="w-4 h-4 text-[var(--accent-text)]" /> Recent Engagement
            <span className="text-[11.5px] text-[var(--text-muted)]">({engagementLogs.length})</span>
            <span className="text-[11.5px] text-[var(--text-muted)]">{expanded ? '▲' : '▼'}</span>
          </button>
          {expanded && (
            <div className="flex items-center gap-1 bg-[var(--surface-glass)] border border-[var(--border)] rounded-lg p-0.5">
              <button onClick={() => setActivityView('grid')} className={`p-1.5 rounded-md transition ${activityView === 'grid' ? 'bg-purple-500/20 text-purple-300' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`} title="Grid view" aria-label="Grid view"><LayoutGrid className="w-3.5 h-3.5" /></button>
              <button onClick={() => setActivityView('list')} className={`p-1.5 rounded-md transition ${activityView === 'list' ? 'bg-purple-500/20 text-purple-300' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`} title="List view" aria-label="List view"><List className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>

        {expanded && (
          <>
            {engagementLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Clock className="w-12 h-12 text-gray-700 mb-4" />
                <p className="text-[var(--text-muted)] text-sm font-medium">No engagement data yet</p>
                <p className="text-[var(--text-muted)] text-xs mt-1 max-w-sm">Activity will appear here as students complete resources.</p>
              </div>
            ) : (
              <>
                {activityView === 'grid' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
                    {engagementLogs.map((sub: Submission) => (
                      <div key={sub.id} className="bg-[var(--panel-bg)] border border-[var(--border)] p-4 rounded-2xl hover:border-purple-500/20 transition group">
                        <div className="flex justify-between items-start mb-3">
                          <div className="min-w-0">
                            <span className="font-bold text-[var(--text-secondary)] text-sm block truncate">{sub.userName}</span>
                            <span className="text-[11.5px] text-[var(--text-muted)] font-medium uppercase tracking-tight line-clamp-1">{sub.assignmentTitle}</span>
                          </div>
                          <span className="text-[11.5px] font-bold text-blue-400 bg-blue-900/30 px-2.5 py-1 rounded-full shrink-0 ml-2">{Math.round(sub.score)} XP</span>
                        </div>
                        <div className="text-[11.5px] text-[var(--text-muted)] border-t border-[var(--border)] pt-2 flex justify-between">
                          <span>{Math.round(sub.metrics.engagementTime / 60)}m active</span>
                          <span className="opacity-0 group-hover:opacity-100 transition">{new Date(sub.submittedAt || '').toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {activityView === 'list' && (
                  <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left table-fixed">
                      <thead className="sticky top-0 bg-[var(--panel-bg)] z-10">
                        <tr className="text-[11.5px] font-bold text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border)]">
                          <th scope="col" className="py-2 px-3 w-[25%]">Student</th>
                          <th scope="col" className="py-2 px-3 w-[35%]">Resource</th>
                          <th scope="col" className="py-2 px-3 text-right w-[12%]">XP</th>
                          <th scope="col" className="py-2 px-3 text-right w-[13%]">Time</th>
                          <th scope="col" className="py-2 px-3 text-right w-[15%]">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {engagementLogs.map((sub: Submission) => (
                          <tr key={sub.id} className="border-b border-[var(--border)] hover:bg-purple-500/5 transition text-xs">
                            <td className="py-2 px-3 font-medium text-[var(--text-secondary)] truncate max-w-[200px]">{sub.userName}</td>
                            <td className="py-2 px-3 text-[var(--text-muted)] truncate max-w-[250px]">{sub.assignmentTitle}</td>
                            <td className="py-2 px-3 text-right font-bold text-blue-400">{Math.round(sub.score)}</td>
                            <td className="py-2 px-3 text-right text-[var(--text-muted)]">{Math.round(sub.metrics.engagementTime / 60)}m</td>
                            <td className="py-2 px-3 text-right text-[var(--text-muted)]">{sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EngagementSummary;
