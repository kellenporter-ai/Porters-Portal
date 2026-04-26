import React, { useState } from 'react';
import { CheckCircle, Bot, Sparkles, AlertTriangle, Eye, EyeOff, CheckCircle2, Search } from 'lucide-react';
import type { StudentGroup, UnifiedEntry } from './gradingHelpers';
import type { User } from '../../types';
import { getScoreColor, formatLastSeen } from './gradingHelpers';
import { getUserSectionForClass } from '../../types';

interface StudentListPanelProps {
  assessmentId: string;
  assessmentClassType: string;
  studentGroups: StudentGroup[];
  unifiedList: UnifiedEntry[];
  hasDraftStudents: User[];
  notStartedStudents: User[];
  gradingStudentId: string | null;
  viewingDraftUserId: string | null;
  assessmentSortKey: string;
  assessmentSortDesc: boolean;
  assessmentSectionFilter: string;
  availableSections: string[];
  onSort: (key: string) => void;
  onSelectStudent: (userId: string) => void;
  onSelectDraft: (userId: string) => void;
  onSelectNotStarted: (userId: string) => void;
}

const StudentListPanel: React.FC<StudentListPanelProps> = ({
  assessmentClassType,
  studentGroups,
  unifiedList,
  hasDraftStudents,
  notStartedStudents,
  gradingStudentId,
  viewingDraftUserId,
  assessmentSortKey,
  assessmentSortDesc,
  assessmentSectionFilter,
  availableSections,
  onSort,
  onSelectStudent,
  onSelectDraft,
  onSelectNotStarted,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const getUnifiedId = (entry: UnifiedEntry): string =>
    entry.type === 'submitted' ? entry.group.userId : entry.student.id;

  const filteredList = searchQuery.trim()
    ? unifiedList.filter(entry => {
        const name = entry.type === 'submitted' ? entry.group.userName : entry.student.name;
        return name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      })
    : unifiedList;

  return (
    <div className="w-full lg:w-[250px] lg:min-w-[250px] border-b lg:border-b-0 lg:border-r border-[var(--border)] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-glass)]">
        <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest">Students</h4>
        <span className="text-xs text-[var(--text-muted)]">
          {studentGroups.length} submitted
          {hasDraftStudents.length > 0 && (
            <span className="text-cyan-600 dark:text-cyan-400"> &middot; {hasDraftStudents.length} draft{hasDraftStudents.length !== 1 ? 's' : ''}</span>
          )}
          {notStartedStudents.length > 0 && (
            <span className="text-orange-600 dark:text-orange-400"> &middot; {notStartedStudents.length} not started</span>
          )}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-glass)]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search students..."
            className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition"
            aria-label="Search students"
          />
        </div>
      </div>

      {/* Sort bar */}
      <div className="flex items-center border-b border-[var(--border)] bg-[var(--surface-glass)]">
        {([['name', 'Name'], ['score', 'Score'], ['submitted', 'Time'], ['attempt', '#']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => onSort(key)}
            className={`flex-1 text-center py-1.5 min-h-[44px] text-[11.5px] font-bold uppercase tracking-wider transition hover:bg-[var(--surface-glass)] ${assessmentSortKey === key ? 'text-purple-600 dark:text-purple-400' : 'text-[var(--text-muted)] hover:text-[var(--text-tertiary)]'}`}
          >
            {label}
            {assessmentSortKey === key && (
              <span className="ml-0.5">{assessmentSortDesc ? '\u25BE' : '\u25B4'}</span>
            )}
          </button>
        ))}
      </div>

      {/* Student list */}
      <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0">
        {filteredList.length === 0 && searchQuery.trim() && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-[var(--text-muted)]">No students match "{searchQuery}"</p>
          </div>
        )}
        {filteredList.map(entry => {
          const entryId = getUnifiedId(entry);
          const isSelected = entryId === gradingStudentId || entryId === viewingDraftUserId;

          if (entry.type === 'submitted') {
            const group = entry.group;
            const bestPct = group.best.flaggedAsAI ? 0 : (group.best.rubricGrade?.overallPercentage ?? group.best.assessmentScore?.percentage ?? group.best.score ?? 0);
            const bestGradedPct = group.bestGraded ? group.bestGraded.rubricGrade!.overallPercentage : null;
            const displayPct = bestGradedPct != null ? bestGradedPct : bestPct;

            return (
              <div
                key={entryId}
                role="button"
                tabIndex={0}
                aria-label={`${group.userName}${group.hasRubricGrade ? ', graded' : ', ungraded'}${group.isInProgress ? ', in progress' : `, ${displayPct}%`}`}
                onClick={() => onSelectStudent(group.userId)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectStudent(group.userId); } }}
                className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer transition border-b border-[var(--border)] focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset focus-visible:outline-none ${
                  isSelected ? 'bg-purple-500/15 border-l-2 border-l-purple-500' : 'hover:bg-[var(--surface-glass)] border-l-2 border-l-transparent'
                } ${group.latest.flaggedAsAI ? 'bg-purple-900/5' : ''}`}
              >
                <div className="shrink-0">
                  {group.hasRubricGrade ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" aria-hidden="true" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-[var(--border-strong)] bg-transparent" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold truncate ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                      {group.userName}
                    </span>
                    {group.latest.flaggedAsAI && <Bot className="w-3 h-3 text-purple-600 dark:text-purple-400 shrink-0" aria-hidden="true" />}
                    {group.hasAISuggestion && !group.hasRubricGrade && (
                      <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" aria-label="AI suggested grade — needs review" />
                    )}
                    {group.latest.status === 'FLAGGED' && !group.latest.flaggedAsAI && (
                      <span title={group.latest.feedback || "Server integrity flag"}>
                        <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                      </span>
                    )}
                    {group.attemptCount > 1 && (
                      <span className="text-[11.5px] font-bold bg-blue-500/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded shrink-0" aria-label={`Resubmitted ${group.attemptCount} attempts`}>
                        &times;{group.attemptCount}
                      </span>
                    )}
                    {group.isInProgress && (
                      <span className="text-[11.5px] font-bold bg-blue-500/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded shrink-0">IN PROGRESS</span>
                    )}
                    {group.latest.status === 'RETURNED' && (
                      <span className="text-[11.5px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded shrink-0">RETURNED</span>
                    )}
                    {group.attemptCount > 1 && group.latest.submittedAt && (Date.now() - new Date(group.latest.submittedAt).getTime() < 24 * 60 * 60 * 1000) && (
                      <span className="text-[11.5px] font-bold bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 px-1 py-0.5 rounded shrink-0 animate-pulse">NEW</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {group.userSection && !assessmentSectionFilter && availableSections.length > 1 && (
                      <span className="text-xs text-[var(--text-muted)]">{group.userSection}</span>
                    )}
                    {group.latest.submittedAt && !group.isInProgress && (
                      <span className="text-xs text-[var(--text-muted)]">{formatLastSeen(group.latest.submittedAt)}</span>
                    )}
                  </div>
                </div>
                <span className={`text-[11px] font-bold tabular-nums shrink-0 ${group.isInProgress ? 'text-blue-600 dark:text-blue-400' : getScoreColor(displayPct)}`}>
                  {group.isInProgress ? '\u2014' : `${displayPct}%`}
                </span>
                {/* Feedback read status badges */}
                {group.hasRubricGrade && group.best.rubricGrade?.teacherFeedback && (
                  <div className="ml-1" aria-label="Feedback read status">
                    {group.best.feedbackReadAt ? (
                      group.best.feedbackReviewedAt ? (
                        <span className="text-[11.5px] font-bold bg-green-500/20 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded shrink-0" aria-label="Feedback reviewed">
                          <CheckCircle2 className="w-2.5 h-2.5 inline mr-0.5" aria-hidden="true" />
                          Reviewed
                        </span>
                      ) : (
                        <span className="text-[11.5px] font-bold bg-blue-500/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded shrink-0" aria-label="Feedback read">
                          <Eye className="w-2.5 h-2.5 inline mr-0.5" aria-hidden="true" />
                          Read
                        </span>
                      )
                    ) : (
                      <span className="text-[11.5px] font-bold bg-[var(--text-muted)]/20 text-[var(--text-muted)] px-1.5 py-0.5 rounded shrink-0" aria-label="Feedback unread">
                        <EyeOff className="w-2.5 h-2.5 inline mr-0.5" aria-hidden="true" />
                        Unread
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // Draft or not-started
          const student = entry.student;
          const isDraft = entry.type === 'draft';
          const studentSection = getUserSectionForClass(student, assessmentClassType);

          return (
            <div
              key={entryId}
              role="button"
              tabIndex={0}
              aria-label={`${student.name}, ${isDraft ? 'has draft' : 'not started'}`}
              onClick={() => isDraft ? onSelectDraft(entryId) : onSelectNotStarted(entryId)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isDraft ? onSelectDraft(entryId) : onSelectNotStarted(entryId); } }}
              className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer transition border-b border-[var(--border)] focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset focus-visible:outline-none ${
                isSelected
                  ? isDraft ? 'bg-cyan-500/15 border-l-2 border-l-cyan-500' : 'bg-orange-500/10 border-l-2 border-l-orange-500'
                  : 'hover:bg-[var(--surface-glass)] border-l-2 border-l-transparent'
              }`}
            >
              <div className="shrink-0">
                {isDraft ? (
                  <Eye className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400/60" aria-hidden="true" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-[var(--border)] bg-transparent opacity-30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold truncate ${isSelected ? 'text-[var(--text-primary)]' : isDraft ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}>
                    {student.name}
                  </span>
                  {isDraft ? (
                    <span className="text-[11.5px] font-bold bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 px-1.5 py-0.5 rounded shrink-0">DRAFT</span>
                  ) : (
                    <span className="text-[11.5px] font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400/70 px-1.5 py-0.5 rounded shrink-0">NOT STARTED</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {studentSection && !assessmentSectionFilter && availableSections.length > 1 && (
                    <span className="text-xs text-[var(--text-muted)]">{studentSection}</span>
                  )}
                  {isDraft && entry.type === 'draft' && entry.startedAt && (
                    <span className="text-[11.5px] text-cyan-600 dark:text-cyan-400/50">started {formatLastSeen(entry.startedAt)}</span>
                  )}
                </div>
              </div>
              <span className="text-[11px] font-bold tabular-nums shrink-0 text-[var(--text-muted)]">&mdash;</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StudentListPanel;
