import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Search } from 'lucide-react';
import { hasClassroomLinks } from '../../types';
import type { Assignment, User } from '../../types';
import { getAssessmentStats } from '../../services/dataService';
import type { AssessmentStats } from '../../services/dataService';

interface AssessmentListPageProps {
  assessmentAssignments: Assignment[];
  users: User[];
}

function getClassBadgeStyle(classType: string): string {
  const lower = classType.toLowerCase();
  if (lower.includes('ap') || lower.includes('physics')) return 'bg-blue-500/15 text-blue-400 border border-blue-500/25';
  if (lower.includes('honors')) return 'bg-purple-500/15 text-purple-400 border border-purple-500/25';
  if (lower.includes('forensic') || lower.includes('forensics')) return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25';
  return 'bg-[var(--surface-glass)] text-[var(--text-tertiary)] border border-[var(--border)]';
}

const AssessmentListPage: React.FC<AssessmentListPageProps> = ({ assessmentAssignments, users }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statsByAssessment, setStatsByAssessment] = useState<Record<string, AssessmentStats>>({});
  const [statsLoading, setStatsLoading] = useState(true);

  const assessmentIdsKey = useMemo(
    () => assessmentAssignments.map(a => a.id).join(','),
    [assessmentAssignments]
  );

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    Promise.all(
      assessmentAssignments.map(a =>
        getAssessmentStats(a.id, a, users).then(stats => [a.id, stats] as const)
      )
    ).then(entries => {
      if (cancelled) return;
      setStatsByAssessment(Object.fromEntries(entries));
      setStatsLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentIdsKey]);

  const filtered = useMemo(() => {
    const sorted = [...assessmentAssignments].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    if (!search) return sorted;
    return sorted.filter(a => a.title.toLowerCase().includes(search.toLowerCase()));
  }, [assessmentAssignments, search]);

  if (assessmentAssignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Shield className="w-16 h-16 mb-4 text-[var(--text-muted)] opacity-20" aria-hidden="true" />
        <p className="text-[var(--text-muted)] text-sm font-bold">No assessments yet</p>
        <p className="text-[var(--text-muted)] text-xs mt-1">Toggle &ldquo;Assessment Mode&rdquo; in the Resource Editor to create one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
        <input
          type="text"
          placeholder="Search assessments..."
          aria-label="Search assessments"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          <Search className="w-10 h-10 mx-auto mb-2 opacity-20" aria-hidden="true" />
          <p className="text-sm">No assessments match &ldquo;{search}&rdquo;</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(assessment => {
            const stats = statsByAssessment[assessment.id] ?? { submitted: 0, graded: 0, flagged: 0, aiFlagged: 0, draft: 0, notStarted: 0 };
            const gradePct = stats.submitted > 0 ? Math.round((stats.graded / stats.submitted) * 100) : 0;
            const isOverdue = assessment.dueDate ? new Date(assessment.dueDate) < new Date() : false;

            return (
              <button
                key={assessment.id}
                onClick={() => navigate(`/grading/${assessment.id}`)}
                className="text-left bg-[var(--surface-glass)] border border-[var(--border)] hover:border-[var(--border-strong)] rounded-2xl p-5 transition group hover:bg-[var(--surface-glass-heavy)]"
              >
                {/* Title + class badge */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-text)] transition leading-snug">
                    {assessment.title}
                    {hasClassroomLinks(assessment) && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/15 text-green-400 border border-green-500/20">
                        {(assessment.classroomLinks?.length ?? 0) > 1 ? `GC \u00d7${assessment.classroomLinks!.length}` : 'GC'}
                      </span>
                    )}
                  </h3>
                  {assessment.classType && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${getClassBadgeStyle(assessment.classType)}`}>
                      {assessment.classType}
                    </span>
                  )}
                </div>

                {/* Due date */}
                {assessment.dueDate && (
                  <p className={`text-xs mb-3 ${isOverdue ? 'text-red-400' : 'text-[var(--text-tertiary)]'}`}>
                    Due {new Date(assessment.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {isOverdue && ' (overdue)'}
                  </p>
                )}

                {/* Progress bar */}
                {assessment.rubric && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-1.5 bg-[var(--surface-glass-heavy)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${gradePct === 100 ? 'bg-green-500' : 'bg-purple-500'}`}
                        style={{ width: `${gradePct}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-bold tabular-nums ${gradePct === 100 ? 'text-green-400' : 'text-[var(--text-tertiary)]'}`}>
                      {statsLoading ? '—' : `${stats.graded}/${stats.submitted}`}
                    </span>
                  </div>
                )}

                {/* Stats row */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
                  <span>{statsLoading ? '—' : `${stats.submitted} submitted`}</span>
                  {assessment.rubric && <span className="text-green-400/80">{statsLoading ? '—' : `${stats.graded} graded`}</span>}
                  {!statsLoading && stats.flagged > 0 && <span className="text-amber-400">{stats.flagged} flagged</span>}
                  {!statsLoading && stats.aiFlagged > 0 && <span className="text-purple-400">{stats.aiFlagged} AI flagged</span>}
                  {!statsLoading && stats.draft > 0 && <span className="text-cyan-400">{stats.draft} draft{stats.draft !== 1 ? 's' : ''}</span>}
                  {!statsLoading && stats.notStarted > 0 && <span className="text-orange-400">{stats.notStarted} not started</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AssessmentListPage;
