import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Search, Shield, FileText } from 'lucide-react';
import type { User, Assignment, Submission } from '../../types';
import { useGradingState } from './useGradingState';
import GradingStatsBar from './GradingStatsBar';
import IntegrityPanel from './IntegrityPanel';
import StudentListPanel from './StudentListPanel';
import StudentResponsePanel from './StudentResponsePanel';
import RubricGradingPanel from './RubricGradingPanel';
import ClassroomLinkModal from '../ClassroomLinkModal';
import { callClassroomPushGrades } from '../../lib/firebase';
import { reportError } from '../../lib/errorReporting';
import { useToast } from '../ToastProvider';

interface AssessmentGradingViewProps {
  users: User[];
  assignments: Assignment[];
  submissions: Submission[];
}

const AssessmentGradingView: React.FC<AssessmentGradingViewProps> = ({ users, assignments, submissions }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const state = useGradingState({ users, assignments, submissions });

  const {
    selectedAssessmentId,
    selectedAssessment,
    allStudentGroups,
    studentGroups,
    unifiedList,
    hasDraftStudents,
    notStartedStudents,
    draftUserIds,
    availableSections,
    gradedCount,
    aiSuggestedCount,
    avgScore,
    flaggedCount,
    aiFlaggedCount,
    selectedGroup,
    sub,
    gradingStudentId,
    gradingAttemptId,
    rubricDraft,
    feedbackDraft,
    setFeedbackDraft,
    isSavingRubric,
    currentUnifiedIndex,
    assessmentSearch,
    setAssessmentSearch,
    assessmentStatusFilter,
    setAssessmentStatusFilter,
    assessmentSectionFilter,
    setAssessmentSectionFilter,
    assessmentSortKey,
    setAssessmentSortKey,
    assessmentSortDesc,
    setAssessmentSortDesc,
    integrityReport,
    showIntegrityPanel,
    expandedPairIdx,
    setExpandedPairIdx,
    viewingDraftUserId,
    draftResponses,
    draftLoading,
    batchAcceptingAI,
    batchAcceptProgress,
    csvMaxPoints,
    setCsvMaxPoints,
    classroomLinkModalOpen,
    setClassroomLinkModalOpen,
    pushingToClassroom,
    selectStudent,
    selectDraftStudent,
    selectNotStartedStudent,
    navigateUnified,
    handleAttemptChange,
    handleSaveRubric,
    handleReturnToStudent,
    handleFlagAsAI,
    handleUnflagAI,
    handleBatchAcceptAI,
    handleCheckIntegrity,
    handleDownloadCSV,
    handleClassroomPush,
    handleRubricGradeChange,
    handleDismissAISuggestion,
    handleAcceptAllAI,
  } = state;

  const hasSubs = unifiedList.length > 0;
  const hasNoResults = selectedAssessmentId && allStudentGroups.length === 0 && studentGroups.length === 0 && notStartedStudents.length === 0;

  const handleSort = (key: string) => {
    if (assessmentSortKey === key) setAssessmentSortDesc(d => !d);
    else { setAssessmentSortKey(key); setAssessmentSortDesc(key === 'submitted' || key === 'score'); }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
        <button
          onClick={() => navigate('/grading')}
          className="hover:text-[var(--text-primary)] transition"
          aria-label="Back to grading list"
        >
          Grading
        </button>
        {selectedAssessment && (
          <>
            <ChevronRight className="w-3 h-3" aria-hidden="true" />
            <span className="text-[var(--text-primary)] font-medium truncate max-w-[300px]">{selectedAssessment.title}</span>
          </>
        )}
        {gradingStudentId && selectedGroup && (
          <>
            <ChevronRight className="w-3 h-3" aria-hidden="true" />
            <span className="text-[var(--text-primary)] font-medium">{selectedGroup.userName}</span>
          </>
        )}
      </div>

      {/* Search & Filter Bar */}
      {selectedAssessmentId && hasSubs && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search students..."
              aria-label="Search students in assessment"
              value={assessmentSearch}
              onChange={e => setAssessmentSearch(e.target.value)}
              className="w-full bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition"
            />
          </div>
          <select
            aria-label="Filter by status"
            value={assessmentStatusFilter}
            onChange={e => setAssessmentStatusFilter(e.target.value)}
            className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-purple-500/50 transition"
          >
            <option value="">All Statuses</option>
            <option value="flagged">Auto Flagged</option>
            <option value="ai_flagged">AI Flagged</option>
            {selectedAssessment?.rubric && <option value="ai_suggested">AI Suggested</option>}
            {selectedAssessment?.rubric && <option value="needs_grading">Needs Grading</option>}
            {selectedAssessment?.rubric && <option value="graded">Graded</option>}
            <option value="in_progress">In Progress</option>
            <option value="not_started">Not Started</option>
            <option value="normal">Normal</option>
          </select>
          {availableSections.length > 1 && (
            <select
              aria-label="Filter by section"
              value={assessmentSectionFilter}
              onChange={e => setAssessmentSectionFilter(e.target.value)}
              className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-purple-500/50 transition"
            >
              <option value="">All Sections</option>
              {availableSections.map(sec => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Stats Bar */}
      {selectedAssessmentId && hasSubs && (
        <GradingStatsBar
          avgScore={avgScore}
          gradedCount={gradedCount}
          totalStudents={allStudentGroups.length}
          flaggedCount={flaggedCount}
          aiFlaggedCount={aiFlaggedCount}
          aiSuggestedCount={aiSuggestedCount}
          hasDraftCount={hasDraftStudents.length}
          notStartedCount={notStartedStudents.length}
          hasRubric={!!selectedAssessment?.rubric}
          csvMaxPoints={csvMaxPoints}
          onCsvMaxPointsChange={setCsvMaxPoints}
          batchAcceptingAI={batchAcceptingAI}
          batchAcceptProgress={batchAcceptProgress}
          onBatchAcceptAI={aiSuggestedCount > 0 ? handleBatchAcceptAI : undefined}
          selectedAssessment={selectedAssessment}
          onCheckIntegrity={handleCheckIntegrity}
          onDownloadCSV={handleDownloadCSV}
          onClassroomPush={handleClassroomPush}
          pushingToClassroom={pushingToClassroom}
          showIntegrityPanel={showIntegrityPanel}
        />
      )}

      {/* Integrity Panel */}
      {showIntegrityPanel && integrityReport && (
        <IntegrityPanel
          report={integrityReport}
          expandedPairIdx={expandedPairIdx}
          onTogglePair={i => setExpandedPairIdx(expandedPairIdx === i ? null : i)}
        />
      )}

      {/* 3-Panel Grading View */}
      {selectedAssessmentId && hasSubs && (
        <div
          className="flex flex-col lg:flex-row gap-0 bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl overflow-hidden backdrop-blur-md"
          onKeyDown={(e) => {
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); navigateUnified(-1); }
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); navigateUnified(1); }
          }}
          tabIndex={0}
        >
          {/* Left: Student List */}
          <StudentListPanel
            assessmentId={selectedAssessmentId}
            assessmentClassType={selectedAssessment?.classType || ''}
            studentGroups={studentGroups}
            unifiedList={unifiedList}
            hasDraftStudents={hasDraftStudents}
            notStartedStudents={notStartedStudents}
            gradingStudentId={gradingStudentId}
            viewingDraftUserId={viewingDraftUserId}
            assessmentSortKey={assessmentSortKey}
            assessmentSortDesc={assessmentSortDesc}
            assessmentSectionFilter={assessmentSectionFilter}
            availableSections={availableSections}
            onSort={handleSort}
            onSelectStudent={selectStudent}
            onSelectDraft={selectDraftStudent}
            onSelectNotStarted={selectNotStartedStudent}
          />

          {/* Center: Student Work */}
          <div className="flex-1 min-w-0 flex flex-col">
            <StudentResponsePanel
              selectedGroup={selectedGroup}
              sub={sub}
              selectedAssessment={selectedAssessment}
              selectedAssessmentId={selectedAssessmentId}
              viewingDraftUserId={viewingDraftUserId}
              draftUserIds={draftUserIds}
              draftResponses={draftResponses}
              draftLoading={draftLoading}
              currentUnifiedIndex={currentUnifiedIndex}
              totalUnified={unifiedList.length}
              gradingAttemptId={gradingAttemptId}
              onNavigate={navigateUnified}
              onFlagAsAI={handleFlagAsAI}
              onUnflagAI={handleUnflagAI}
              onAttemptChange={handleAttemptChange}
              users={users}
            />
          </div>

          {/* Right: Rubric Grading */}
          <RubricGradingPanel
            selectedGroup={selectedGroup}
            sub={sub}
            selectedAssessment={selectedAssessment}
            rubricDraft={rubricDraft}
            feedbackDraft={feedbackDraft}
            isSavingRubric={isSavingRubric}
            viewingDraftUserId={viewingDraftUserId}
            draftUserIds={draftUserIds}
            unifiedList={unifiedList}
            gradingStudentId={gradingStudentId}
            onFeedbackChange={setFeedbackDraft}
            onGradeChange={handleRubricGradeChange}
            onAcceptAllAI={handleAcceptAllAI}
            onDismissAISuggestion={handleDismissAISuggestion}
            onSaveRubric={handleSaveRubric}
            onReturnToStudent={handleReturnToStudent}
            onSelectStudent={selectStudent}
          />
        </div>
      )}

      {/* Empty state: no submissions */}
      {selectedAssessmentId && !hasSubs && (
        <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl p-8 text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)] opacity-30" aria-hidden="true" />
          <p className="text-[var(--text-muted)] text-sm">No submissions yet for this assessment.</p>
        </div>
      )}

      {/* No results from filter */}
      {hasNoResults && (
        <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl p-8 text-center">
          <Search className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)] opacity-30" aria-hidden="true" />
          <p className="text-[var(--text-muted)] text-sm">No students match your search or filter.</p>
        </div>
      )}

      {/* No assessment selected */}
      {!selectedAssessmentId && (
        <div className="flex flex-col items-center justify-center py-24">
          <Shield className="w-16 h-16 mb-4 text-[var(--text-muted)] opacity-20" aria-hidden="true" />
          <p className="text-[var(--text-muted)] text-sm font-bold">No assessment selected</p>
        </div>
      )}

      {/* Classroom Link Modal */}
      {classroomLinkModalOpen && selectedAssessment && (
        <ClassroomLinkModal
          isOpen={classroomLinkModalOpen}
          onClose={() => setClassroomLinkModalOpen(false)}
          assignment={selectedAssessment}
          classType={selectedAssessment.classType || ''}
          students={users.filter(u => u.role === 'STUDENT')}
          onLinked={async (links, token) => {
            const first = links[0];
            toast.success(links.length > 1
              ? `Linked ${links.length} sections to Classroom`
              : `Linked to ${first?.courseName ?? ''} \u2014 ${first?.courseWorkTitle ?? ''}`);
            setClassroomLinkModalOpen(false);
            if (!token || !selectedAssessmentId) return;
            try {
              const result = await callClassroomPushGrades({ accessToken: token, assignmentId: selectedAssessmentId });
              const data = result.data as { pushed: number; skipped: number };
              toast.success(`Pushed ${data.pushed} grades to Classroom${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}`);
            } catch (err) {
              reportError(err, { method: 'classroomPushAfterLink' });
              toast.error((err as Error).message || 'Failed to push grades after linking');
            }
          }}
          onUnlinked={() => {
            toast.success('Unlinked from Google Classroom');
          }}
        />
      )}
    </div>
  );
};

export default AssessmentGradingView;
