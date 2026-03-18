import React, { useMemo } from 'react';
import { Submission, Assignment } from '../../types';
import { BookOpen } from 'lucide-react';

interface AcademicPerformanceProps {
  submissions: Submission[];
  assignments: Assignment[];
  enrolledClasses: string[];
}

const AcademicPerformance: React.FC<AcademicPerformanceProps> = ({ submissions, assignments, enrolledClasses }) => {
  // Assessment scores
  const assessmentResults = useMemo(() => {
    return submissions
      .filter(s => s.isAssessment && s.status !== 'STARTED')
      .map(s => {
        const assignment = assignments.find(a => a.id === s.assignmentId);
        const percentage = s.rubricGrade?.overallPercentage
          ?? s.assessmentScore?.percentage
          ?? null;
        return {
          id: s.id,
          title: assignment?.title || s.assignmentTitle,
          classType: assignment?.classType || '',
          percentage,
          submittedAt: s.submittedAt,
          status: s.status,
        };
      })
      .sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
  }, [submissions, assignments]);

  // Completion stats
  const completionStats = useMemo(() => {
    const activeAssignments = assignments.filter(a =>
      a.status === 'ACTIVE' && enrolledClasses.includes(a.classType)
    );
    const attemptedIds = new Set(submissions.filter(s => s.status !== 'STARTED').map(s => s.assignmentId));
    const attempted = activeAssignments.filter(a => attemptedIds.has(a.id)).length;
    return {
      total: activeAssignments.length,
      attempted,
      rate: activeAssignments.length > 0 ? Math.round((attempted / activeAssignments.length) * 100) : 0,
    };
  }, [submissions, assignments, enrolledClasses]);

  // Average assessment score
  const avgScore = useMemo(() => {
    const scored = assessmentResults.filter(r => r.percentage !== null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((a, r) => a + (r.percentage || 0), 0) / scored.length);
  }, [assessmentResults]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-widest print:text-gray-700">Academic Performance</h3>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl p-3 print:border-gray-300 print:bg-gray-50">
          <div className="text-[9px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Completion Rate</div>
          <div className="text-lg font-bold text-[var(--text-primary)] print:text-black">{completionStats.rate}%</div>
          <div className="text-[10px] text-[var(--text-muted)]">{completionStats.attempted}/{completionStats.total} resources</div>
        </div>
        <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl p-3 print:border-gray-300 print:bg-gray-50">
          <div className="text-[9px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Avg Assessment</div>
          <div className={`text-lg font-bold ${avgScore !== null ? (avgScore >= 75 ? 'text-emerald-400 print:text-emerald-600' : avgScore >= 50 ? 'text-yellow-400 print:text-yellow-600' : 'text-red-400 print:text-red-600') : 'text-[var(--text-muted)]'}`}>
            {avgScore !== null ? `${avgScore}%` : 'N/A'}
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">{assessmentResults.length} assessment{assessmentResults.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl p-3 print:border-gray-300 print:bg-gray-50">
          <div className="text-[9px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Total Submissions</div>
          <div className="text-lg font-bold text-[var(--text-primary)] print:text-black">{submissions.filter(s => s.status !== 'STARTED').length}</div>
          <div className="text-[10px] text-[var(--text-muted)]">completed</div>
        </div>
      </div>

      {/* Assessment scores table */}
      {assessmentResults.length > 0 && (
        <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl overflow-hidden print:border-gray-300">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] print:border-gray-300">
                <th className="text-left px-4 py-2.5 text-[var(--text-muted)] font-bold uppercase tracking-widest text-[10px]">Assessment</th>
                <th className="text-left px-4 py-2.5 text-[var(--text-muted)] font-bold uppercase tracking-widest text-[10px]">Class</th>
                <th className="text-center px-4 py-2.5 text-[var(--text-muted)] font-bold uppercase tracking-widest text-[10px]">Score</th>
                <th className="text-right px-4 py-2.5 text-[var(--text-muted)] font-bold uppercase tracking-widest text-[10px]">Date</th>
              </tr>
            </thead>
            <tbody>
              {assessmentResults.map(r => (
                <tr key={r.id} className="border-b border-[var(--border)] last:border-0 print:border-gray-200">
                  <td className="px-4 py-2.5 text-[var(--text-primary)] print:text-black font-medium truncate max-w-[200px]">
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                      {r.title}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-tertiary)] print:text-gray-600">{r.classType}</td>
                  <td className="px-4 py-2.5 text-center">
                    {r.percentage !== null ? (
                      <span className={`font-bold ${r.percentage >= 75 ? 'text-emerald-400' : r.percentage >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {Math.round(r.percentage)}%
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                    {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assessmentResults.length === 0 && (
        <div className="text-center py-8 text-[var(--text-muted)] italic text-xs">No assessment submissions yet.</div>
      )}
    </div>
  );
};

export default AcademicPerformance;
