import React from 'react';
import { Fingerprint, Download, Upload, RefreshCw, Sparkles } from 'lucide-react';
import { hasClassroomLinks } from '../../types';
import type { Assignment } from '../../types';

interface GradingStatsBarProps {
  avgScore: number;
  gradedCount: number;
  totalStudents: number;
  flaggedCount: number;
  aiFlaggedCount: number;
  aiSuggestedCount: number;
  hasDraftCount: number;
  notStartedCount: number;
  hasRubric: boolean;
  csvMaxPoints: number;
  onCsvMaxPointsChange: (value: number) => void;
  batchAcceptingAI?: boolean;
  batchAcceptProgress?: { done: number; total: number } | null;
  onBatchAcceptAI?: () => void;
  selectedAssessment?: Assignment | null;
  onCheckIntegrity: () => void;
  onDownloadCSV: () => void;
  onClassroomPush?: () => void;
  pushingToClassroom?: boolean;
  showIntegrityPanel?: boolean;
}

const GradingStatsBar: React.FC<GradingStatsBarProps> = ({
  avgScore,
  gradedCount,
  totalStudents,
  flaggedCount,
  aiFlaggedCount,
  aiSuggestedCount,
  hasDraftCount,
  notStartedCount,
  hasRubric,
  csvMaxPoints,
  onCsvMaxPointsChange,
  batchAcceptingAI,
  batchAcceptProgress,
  onBatchAcceptAI,
  selectedAssessment,
  onCheckIntegrity,
  onDownloadCSV,
  onClassroomPush,
  pushingToClassroom,
  showIntegrityPanel,
}) => {
  const Dot = () => <span className="text-[var(--text-muted)] mx-1">&middot;</span>;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg text-xs">
      {/* Stats */}
      <span>
        <strong className="text-[var(--text-primary)]">{avgScore}%</strong>{' '}
        <span className="text-[var(--text-tertiary)]">avg</span>
      </span>
      <Dot />
      {hasRubric && (
        <>
          <span>
            <strong className={gradedCount === totalStudents && totalStudents > 0 ? 'text-green-400' : 'text-[var(--text-primary)]'}>
              {gradedCount}/{totalStudents}
            </strong>{' '}
            <span className="text-[var(--text-tertiary)]">graded</span>
          </span>
          <Dot />
        </>
      )}
      {flaggedCount > 0 && (
        <>
          <span>
            <strong className="text-amber-400">{flaggedCount}</strong>{' '}
            <span className="text-[var(--text-tertiary)]">flagged</span>
          </span>
          <Dot />
        </>
      )}
      {aiFlaggedCount > 0 && (
        <>
          <span>
            <strong className="text-purple-400">{aiFlaggedCount}</strong>{' '}
            <span className="text-[var(--text-tertiary)]">AI flagged</span>
          </span>
          <Dot />
        </>
      )}
      {aiSuggestedCount > 0 && (
        <>
          <span>
            <strong className="text-amber-400">{aiSuggestedCount}</strong>{' '}
            <span className="text-[var(--text-tertiary)]">AI suggested</span>
          </span>
          <Dot />
        </>
      )}
      {hasDraftCount > 0 && (
        <>
          <span>
            <strong className="text-cyan-400">{hasDraftCount}</strong>{' '}
            <span className="text-[var(--text-tertiary)]">draft</span>
          </span>
          <Dot />
        </>
      )}
      <span>
        <strong className={notStartedCount > 0 ? 'text-orange-400' : 'text-[var(--text-primary)]'}>{notStartedCount}</strong>{' '}
        <span className="text-[var(--text-tertiary)]">not started</span>
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* CSV max points input */}
        {hasRubric && gradedCount > 0 && (
          <div className="flex items-center gap-1">
            <label className="text-[var(--text-tertiary)] whitespace-nowrap">Max pts:</label>
            <input
              type="number"
              min={1}
              aria-label="Maximum points for CSV export"
              value={csvMaxPoints}
              onChange={e => onCsvMaxPointsChange(Math.max(1, Number(e.target.value) || 1))}
              className="w-14 bg-[var(--panel-bg)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-purple-500/50"
            />
          </div>
        )}

        {/* Check Integrity */}
        <button
          onClick={onCheckIntegrity}
          className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg transition whitespace-nowrap ${
            showIntegrityPanel ? 'bg-amber-500 text-black' : 'bg-amber-600/80 hover:bg-amber-500 text-white'
          }`}
          aria-label="Check assessment integrity"
        >
          <Fingerprint className="w-3 h-3" aria-hidden="true" />
          {showIntegrityPanel ? 'Hide Report' : 'Integrity'}
        </button>

        {/* Download CSV */}
        {hasRubric && gradedCount > 0 && (
          <button
            onClick={onDownloadCSV}
            className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-strong)] rounded-lg px-2.5 py-1.5 transition bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)]"
            aria-label={`Export ${gradedCount} grades as CSV`}
          >
            <Download className="w-3 h-3" aria-hidden="true" />
            CSV ({gradedCount})
          </button>
        )}

        {/* Classroom Push */}
        {onClassroomPush && hasRubric && gradedCount > 0 && (
          <button
            onClick={onClassroomPush}
            disabled={pushingToClassroom}
            className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 border border-green-500/20 hover:border-green-500/40 rounded-lg px-2.5 py-1.5 transition bg-green-500/10 hover:bg-green-500/20 disabled:opacity-50"
            aria-label="Push grades to Google Classroom"
          >
            {pushingToClassroom ? (
              <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="w-3 h-3" aria-hidden="true" />
            )}
            {selectedAssessment && hasClassroomLinks(selectedAssessment)
              ? `Classroom (${gradedCount})${(selectedAssessment.classroomLinks?.length ?? 0) > 1 ? ` ×${selectedAssessment.classroomLinks!.length}` : ''}`
              : 'Link Classroom'}
          </button>
        )}

        {/* Batch Accept AI */}
        {aiSuggestedCount > 0 && onBatchAcceptAI && (
          <button
            disabled={batchAcceptingAI}
            onClick={onBatchAcceptAI}
            className="flex items-center gap-1 text-xs font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 rounded-lg px-2.5 py-1.5 transition disabled:opacity-50"
            aria-label={`Accept all ${aiSuggestedCount} AI-suggested grades`}
          >
            {batchAcceptingAI ? (
              <><RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />{batchAcceptProgress ? `${batchAcceptProgress.done}/${batchAcceptProgress.total}` : '...'}</>
            ) : (
              <><Sparkles className="w-3 h-3" aria-hidden="true" />Accept All AI</>
            )}
          </button>
        )}
      </div>

    </div>
  );
};

export default GradingStatsBar;
