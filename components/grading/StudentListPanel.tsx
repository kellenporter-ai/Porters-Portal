/**
 * StudentListPanel — left column of the grading workspace.
 * Lists student groups, drafts, and not-started students with selection,
 * filtering, and keyboard navigation.
 */
import React, { useMemo, useState } from 'react';
import {
  ChevronUp, ChevronDown, CheckCircle2, Undo2, Flag,
} from 'lucide-react';
import type { User } from '../../types';
import type { StudentGroup, UnifiedEntry } from './gradingHelpers';
import { getEffectiveScore, getScoreColor, formatLastSeen } from './gradingHelpers';

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
  // Selection / bulk return
  selectedIds: Set<string>;
  isBulkReturning: boolean;
  onToggleSelected: (submissionId: string) => void;
  onSelectAllVisible: (submissionIds: string[]) => void;
  onClearSelection: () => void;
  onBulkReturn: () => void;
  // Arrow-key navigation between visible submitted rows
  onKeyboardNav: (dir: 1 | -1) => void;
}

type ChipKey = 'all' | 'submitted' | 'returned' | 'in_progress' | 'flagged';

const CHIPS: Array<{ key: ChipKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'returned', label: 'Returned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'flagged', label: 'Flagged' },
];

const sortIcon = (key: string, sortKey: string, desc: boolean) =>
  sortKey === key ? (desc ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronUp className="w-3 h-3" aria-hidden="true" />) : null;

const StudentListPanel: React.FC<StudentListPanelProps> = ({
  studentGroups,
  unifiedList,
  gradingStudentId,
  viewingDraftUserId,
  assessmentSortKey,
  assessmentSortDesc,
  onSort,
  onSelectStudent,
  onSelectDraft,
  onSelectNotStarted,
  selectedIds,
  isBulkReturning,
  onToggleSelected,
  onSelectAllVisible,
  onClearSelection,
  onBulkReturn,
  onKeyboardNav,
}) => {
  const [chipFilter, setChipFilter] = useState<ChipKey>('all');

  // Presentation-only filter over the grouped output.
  const filteredGroups = useMemo(() => {
    switch (chipFilter) {
      case 'submitted':
        return studentGroups.filter(g => !g.isInProgress && g.latest.status !== 'RETURNED' && g.latest.status !== 'FLAGGED');
      case 'returned':
        return studentGroups.filter(g => g.latest.status === 'RETURNED');
      case 'in_progress':
        return studentGroups.filter(g => g.isInProgress);
      case 'flagged':
        return studentGroups.filter(g => g.latest.status === 'FLAGGED' || !!g.latest.flaggedAsAI);
      default:
        return studentGroups;
    }
  }, [studentGroups, chipFilter]);

  const visibleSubmissionIds = useMemo(
    () => filteredGroups.map(g => g.latest.id),
    [filteredGroups],
  );
  const eligibleIds = useMemo(
    () => visibleSubmissionIds.filter(id => {
      const g = filteredGroups.find(x => x.latest.id === id);
      return g && g.latest.status !== 'RETURNED';
    }),
    [filteredGroups, visibleSubmissionIds],
  );
  const allVisibleSelected = eligibleIds.length > 0 && eligibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = eligibleIds.some(id => selectedIds.has(id));

  // Show unified groups (submitted + draft + not-started) when unfiltered,
  // the chip-filtered submitted groups otherwise.
  const showUnified = chipFilter === 'all';
  const submittedEntries: UnifiedEntry[] = showUnified
    ? unifiedList
    : filteredGroups.map(g => ({ type: 'submitted' as const, group: g }));

  const countForChip = (key: ChipKey): number | null => {
    switch (key) {
      case 'submitted': return studentGroups.filter(g => !g.isInProgress && g.latest.status !== 'RETURNED' && g.latest.status !== 'FLAGGED').length;
      case 'returned': return studentGroups.filter(g => g.latest.status === 'RETURNED').length;
      case 'in_progress': return studentGroups.filter(g => g.isInProgress).length;
      case 'flagged': return studentGroups.filter(g => g.latest.status === 'FLAGGED' || !!g.latest.flaggedAsAI).length;
      default: return null;
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); onKeyboardNav(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); onKeyboardNav(-1); }
  };

  const renderGroupRow = (group: StudentGroup) => {
    const isSelected = gradingStudentId === group.userId;
    const sub = group.latest;
    const score = getEffectiveScore(group.best);
    const isReturned = sub.status === 'RETURNED';
    const eligible = !isReturned;
    const isChecked = selectedIds.has(sub.id);

    return (
      <div
        key={group.userId}
        role="button"
        tabIndex={0}
        aria-current={isSelected ? 'true' : undefined}
        onClick={() => onSelectStudent(group.userId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelectStudent(group.userId); }
        }}
        className={`w-full text-left px-2.5 py-2 border-b border-[var(--border)] transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${
          isSelected ? 'bg-purple-500/10 border-l-2 border-l-purple-500' : 'hover:bg-[var(--surface-glass)]'
        }`}
      >
        {/* Line 1: name + score */}
        <div className="flex items-center gap-2">
          {eligible && (
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggleSelected(sub.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${group.userName} for bulk return`}
              className="shrink-0 w-4 h-4 accent-purple-600 cursor-pointer"
            />
          )}
          <span
            className="flex-1 min-w-[60px] truncate text-sm font-medium text-[var(--text-primary)]"
            title={group.userName}
          >
            {group.userName}
          </span>
          <span className={`text-sm font-bold tabular-nums shrink-0 ${getScoreColor(score)}`}>
            {Math.round(score)}%
          </span>
        </div>
        {/* Line 2: period/time + all status badges */}
        <div className="flex flex-wrap justify-end items-center gap-1 mt-1">
          {group.userSection && (
            <span className="text-[10px] text-[var(--text-tertiary)] mr-auto">{group.userSection}</span>
          )}
          <span className="text-[10px] text-[var(--text-tertiary)]">{formatLastSeen(sub.submittedAt)}</span>
          {sub.submittedLate === true && (
            <span className="text-[10px] font-bold bg-orange-500/20 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded shrink-0">Late</span>
          )}
          {sub.status === 'FLAGGED' && !sub.flaggedAsAI && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
              <Flag className="w-2.5 h-2.5" aria-hidden="true" /> FLAGGED
            </span>
          )}
          {sub.flaggedAsAI && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
              AI FLAG
            </span>
          )}
          {isReturned && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
              <Undo2 className="w-2.5 h-2.5" aria-hidden="true" /> RETURNED
            </span>
          )}
          {!isReturned && !group.isInProgress && (
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">NEW</span>
          )}
          {group.attemptCount > 1 && (
            <span className="text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--surface-glass)] px-1.5 py-0.5 rounded">×{group.attemptCount}</span>
          )}
          {group.hasAISuggestion && !group.hasRubricGrade && (
            <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">AI</span>
          )}
          {group.hasRubricGrade && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
              <CheckCircle2 className="w-2.5 h-2.5" aria-hidden="true" /> Graded
            </span>
          )}
          {group.needsGrading && (
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Needs grading</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full lg:w-[300px] shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--surface-glass)] min-h-0">
      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1 px-2.5 py-2 border-b border-[var(--border)]" role="group" aria-label="Filter students by status">
        {CHIPS.map(chip => {
          const active = chipFilter === chip.key;
          const count = countForChip(chip.key);
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setChipFilter(chip.key)}
              aria-pressed={active}
              className={`text-[11px] font-semibold px-2 py-1 rounded-full transition ${
                active
                  ? 'bg-purple-600 text-white'
                  : 'text-[var(--text-secondary)] bg-[var(--surface-glass)] hover:bg-[var(--surface-glass)] border border-[var(--border)]'
              }`}
            >
              {chip.label}{count !== null && count > 0 ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      {/* Column headers + select-all */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[var(--border)] text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
        <input
          type="checkbox"
          checked={allVisibleSelected}
          ref={(el) => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
          onChange={() => onSelectAllVisible(visibleSubmissionIds)}
          disabled={eligibleIds.length === 0}
          aria-label="Select all visible students for bulk return"
          className="w-4 h-4 accent-purple-600 cursor-pointer disabled:opacity-40"
        />
        <button type="button" onClick={() => onSort('name')} className="flex-1 text-left min-w-[60px] hover:text-[var(--text-primary)] transition">
          <span className="inline-flex items-center gap-0.5">Name {sortIcon('name', assessmentSortKey, assessmentSortDesc)}</span>
        </button>
        <button type="button" onClick={() => onSort('score')} className="hover:text-[var(--text-primary)] transition">
          <span className="inline-flex items-center gap-0.5">Score {sortIcon('score', assessmentSortKey, assessmentSortDesc)}</span>
        </button>
      </div>

      {/* Rows */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar min-h-0"
        role="listbox"
        aria-label="Students"
        onKeyDown={handleListKeyDown}
      >
        {submittedEntries.map(entry => {
          if (entry.type === 'submitted' && entry.group) return renderGroupRow(entry.group);
          if (entry.type === 'draft') {
            const student = entry.student;
            const isSelected = viewingDraftUserId === student.id;
            return (
              <div
                key={`draft-${student.id}`}
                role="button"
                tabIndex={0}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelectDraft(student.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectDraft(student.id); } }}
                className={`w-full text-left px-2.5 py-2 border-b border-[var(--border)] transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${
                  isSelected ? 'bg-purple-500/10 border-l-2 border-l-purple-500' : 'hover:bg-[var(--surface-glass)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-[60px] truncate text-sm font-medium text-[var(--text-primary)]" title={student.name}>
                    {student.name}
                  </span>
                  <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">In progress</span>
                </div>
              </div>
            );
          }
          if (entry.type === 'not_started') {
            const student = entry.student;
            return (
              <div
                key={`ns-${student.id}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelectNotStarted(student.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNotStarted(student.id); } }}
                className="w-full text-left px-2.5 py-2 border-b border-[var(--border)] transition cursor-pointer hover:bg-[var(--surface-glass)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-[60px] truncate text-sm font-medium text-[var(--text-tertiary)]" title={student.name}>
                    {student.name}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-tertiary)] bg-[var(--surface-glass)] px-1.5 py-0.5 rounded">Not started</span>
                </div>
              </div>
            );
          }
          return null;
        })}
        {submittedEntries.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-[var(--text-tertiary)]">No students match this filter.</div>
        )}
      </div>

      {/* Floating bulk-action bar */}
      {selectedIds.size > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl shadow-lg px-3 py-2">
          <button
            type="button"
            onClick={onBulkReturn}
            disabled={isBulkReturning}
            className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3 py-2 min-h-[44px] rounded-lg transition disabled:opacity-50"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            {isBulkReturning ? 'Returning...' : `Return ${selectedIds.size} assessment${selectedIds.size === 1 ? '' : 's'}`}
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={isBulkReturning}
            className="text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-2 min-h-[44px] rounded-lg transition disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};

export default StudentListPanel;
