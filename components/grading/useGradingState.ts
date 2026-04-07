/**
 * useGradingState — custom hook that owns all assessment grading state.
 * URL-driven: assessmentId and studentId come from useParams().
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { User, Assignment, Submission, RubricSkillGrade, RubricGrade } from '../../types';
import { dataService } from '../../services/dataService';
import { calculateRubricPercentage } from '../../lib/rubricParser';
import { callReturnAssessment, callClassroomPushGrades } from '../../lib/firebase';
import { getClassroomAccessToken } from '../../lib/classroomAuth';
import { analyzeIntegrity, type IntegrityReport } from '../../lib/integrityAnalysis';
import { reportError } from '../../lib/errorReporting';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../ToastProvider';
import { downloadGradeCSV } from '../../lib/csvGradeExport';
import { hasClassroomLinks } from '../../types';
import { buildStudentGroups } from './gradingHelpers';

interface UseGradingStateParams {
  users: User[];
  assignments: Assignment[];
  submissions: Submission[];
}

const TIER_PERCENTAGES = [0, 55, 65, 85, 100] as const;

// localStorage helpers
const STORAGE_KEY_PREFIX = 'feedback-draft-';
const DRAFT_TTL_DAYS = 7;

function getDraftKey(submissionId: string): string {
  return `${STORAGE_KEY_PREFIX}${submissionId}`;
}

function saveDraftToLocalStorage(submissionId: string, text: string): void {
  const draft = { text, updatedAt: new Date().toISOString() };
  localStorage.setItem(getDraftKey(submissionId), JSON.stringify(draft));
}

function loadDraftFromLocalStorage(submissionId: string): { text: string; updatedAt: string } | null {
  const raw = localStorage.getItem(getDraftKey(submissionId));
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as { text: string; updatedAt: string };
    // Check TTL
    const ageMs = Date.now() - new Date(draft.updatedAt).getTime();
    const ttlMs = DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000;
    if (ageMs > ttlMs) return null;
    return draft;
  } catch {
    return null;
  }
}

function clearDraftFromLocalStorage(submissionId: string): void {
  localStorage.removeItem(getDraftKey(submissionId));
}

export function useGradingState({ users, assignments, submissions }: UseGradingStateParams) {
  const navigate = useNavigate();
  const params = useParams<{ assessmentId?: string; studentId?: string }>();
  const { confirm } = useConfirm();
  const toast = useToast();

  // ─── URL-synced selected IDs ──────────────────────────────────────────────
  const selectedAssessmentId = params.assessmentId || null;
  const urlStudentId = params.studentId || null;

  // ─── Local state ──────────────────────────────────────────────────────────
  const [rubricDraft, setRubricDraft] = useState<Record<string, Record<string, RubricSkillGrade>>>({});
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [isSavingRubric, setIsSavingRubric] = useState(false);
  const [assessmentSearch, setAssessmentSearch] = useState('');
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState('');
  const [assessmentSectionFilter, setAssessmentSectionFilter] = useState('');
  const [gradingStudentId, setGradingStudentId] = useState<string | null>(urlStudentId);
  const [gradingAttemptId, setGradingAttemptId] = useState<string | null>(null);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [showIntegrityPanel, setShowIntegrityPanel] = useState(false);
  const [expandedPairIdx, setExpandedPairIdx] = useState<number | null>(null);
  const [assessmentSubmissions, setAssessmentSubmissions] = useState<Submission[]>([]);
  const [draftSessions, setDraftSessions] = useState<Array<{ userId: string; startedAt: string }>>([]);
  const [draftResponseUserIds, setDraftResponseUserIds] = useState<Set<string>>(new Set());
  const [assessmentSortKey, setAssessmentSortKey] = useState<string>('submitted');
  const [assessmentSortDesc, setAssessmentSortDesc] = useState(true);
  const [batchAcceptingAI, setBatchAcceptingAI] = useState(false);
  const [batchAcceptProgress, setBatchAcceptProgress] = useState<{ done: number; total: number } | null>(null);
  const [csvMaxPoints, setCsvMaxPoints] = useState(100);
  const [viewingDraftUserId, setViewingDraftUserId] = useState<string | null>(null);
  const [draftResponses, setDraftResponses] = useState<Record<string, unknown> | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [classroomLinkModalOpen, setClassroomLinkModalOpen] = useState(false);
  const [pushingToClassroom, setPushingToClassroom] = useState(false);

  // ─── Sync URL assessmentId → reset state ────────────────────────────────
  useEffect(() => {
    if (!selectedAssessmentId) {
      setAssessmentSubmissions([]);
      setGradingStudentId(null);
      setGradingAttemptId(null);
      setRubricDraft({});
      setFeedbackDraft('');
    }
  }, [selectedAssessmentId]);

  // Sync URL studentId → load student
  useEffect(() => {
    if (urlStudentId !== gradingStudentId) {
      if (urlStudentId) {
        setGradingStudentId(urlStudentId);
        setViewingDraftUserId(null);
        setDraftResponses(null);
      } else {
        setGradingStudentId(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStudentId]);

  // ─── Subscriptions ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAssessmentId) { setAssessmentSubmissions([]); return; }
    const unsub = dataService.subscribeToAssignmentSubmissions(selectedAssessmentId, setAssessmentSubmissions);
    return () => unsub();
  }, [selectedAssessmentId]);

  useEffect(() => {
    if (!selectedAssessmentId) { setDraftSessions([]); return; }
    const unsub = dataService.subscribeToAssessmentSessions(selectedAssessmentId, setDraftSessions);
    return () => unsub();
  }, [selectedAssessmentId]);

  useEffect(() => {
    if (!selectedAssessmentId) { setDraftResponseUserIds(new Set()); return; }
    const unsub = dataService.subscribeToDraftResponseUsers(selectedAssessmentId, setDraftResponseUserIds);
    return () => unsub();
  }, [selectedAssessmentId]);

  // When not_started filter is selected, deselect current student
  useEffect(() => {
    if (assessmentStatusFilter === 'not_started') {
      setGradingStudentId(null);
      setGradingAttemptId(null);
    }
  }, [assessmentStatusFilter]);

  // ─── Derived data ─────────────────────────────────────────────────────────
  const assessmentAssignments = useMemo(
    () => assignments.filter(a => a.isAssessment),
    [assignments]
  );

  const selectedAssessment = useMemo(
    () => assessmentAssignments.find(a => a.id === selectedAssessmentId) || null,
    [assessmentAssignments, selectedAssessmentId]
  );

  const filteredAssessmentSubmissions = useMemo(
    () => selectedAssessmentId ? assessmentSubmissions : submissions.filter(s => s.isAssessment),
    [selectedAssessmentId, assessmentSubmissions, submissions]
  );

  const students = useMemo(() => users.filter(u => u.role === 'STUDENT'), [users]);

  const groupsData = useMemo(() => buildStudentGroups({
    submissions: filteredAssessmentSubmissions,
    enrolledStudents: students,
    draftSessions,
    draftResponseUserIds,
    selectedAssessment,
    users,
    assessmentSearch,
    assessmentStatusFilter,
    assessmentSectionFilter,
    assessmentSortKey,
    assessmentSortDesc,
  }), [
    filteredAssessmentSubmissions, students, draftSessions, draftResponseUserIds,
    selectedAssessment, users, assessmentSearch, assessmentStatusFilter,
    assessmentSectionFilter, assessmentSortKey, assessmentSortDesc,
  ]);

  const {
    allStudentGroups,
    studentGroups,
    unifiedList,
    hasDraftStudents,
    notStartedStudents,
    draftUserIds,
    draftSessionMap,
    availableSections,
    gradedCount,
    aiSuggestedCount,
    avgScore,
    flaggedCount,
    aiFlaggedCount,
  } = groupsData;

  // Selected group and submission
  const selectedGroup = studentGroups.find(g => g.userId === gradingStudentId) || null;
  const sub = selectedGroup
    ? (selectedGroup.submissions.find(s => s.id === gradingAttemptId) || selectedGroup.best)
    : null;

  // Debounced localStorage save for feedback draft
  useEffect(() => {
    if (!selectedGroup || !sub?.id) return;
    const timer = setTimeout(() => {
      saveDraftToLocalStorage(sub.id, feedbackDraft);
    }, 1000);
    return () => clearTimeout(timer);
  }, [feedbackDraft, selectedGroup, sub]);

  // Restore draft from localStorage on mount or student selection
  useEffect(() => {
    if (!selectedGroup || !sub?.id) return;
    const existingDraft = loadDraftFromLocalStorage(sub.id);
    if (existingDraft && existingDraft.text !== sub.rubricGrade?.teacherFeedback) {
      setFeedbackDraft(existingDraft.text);
    }
  }, [selectedGroup, sub]);

  // Auto-populate rubricDraft when student changes from URL
  useEffect(() => {
    if (!urlStudentId || !selectedGroup) return;
    const bestSub = selectedGroup.best;
    if (bestSub.rubricGrade?.grades) {
      setRubricDraft(bestSub.rubricGrade.grades);
      setFeedbackDraft(bestSub.rubricGrade?.teacherFeedback || '');
    } else if (bestSub.aiSuggestedGrade?.status === 'pending_review') {
      const aiDraft: Record<string, Record<string, RubricSkillGrade>> = {};
      for (const [qId, skills] of Object.entries(bestSub.aiSuggestedGrade.grades)) {
        aiDraft[qId] = {};
        for (const [sId, sg] of Object.entries(skills)) {
          aiDraft[qId][sId] = { selectedTier: sg.suggestedTier, percentage: sg.percentage };
        }
      }
      setRubricDraft(aiDraft);
      setFeedbackDraft('');
    } else {
      setRubricDraft({});
      setFeedbackDraft('');
    }
    setGradingAttemptId(bestSub.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStudentId, selectedGroup?.userId]);

  // Unified navigation index
  const selectedUnifiedId = gradingStudentId || viewingDraftUserId;
  const currentUnifiedIndex = selectedUnifiedId
    ? unifiedList.findIndex(e => (e.type === 'submitted' ? e.group.userId : e.student.id) === selectedUnifiedId)
    : -1;

  // ─── Navigation helpers ───────────────────────────────────────────────────
  const selectAssessment = useCallback((id: string) => {
    navigate(`/grading/${id}`);
    setGradingStudentId(null);
    setGradingAttemptId(null);
    setRubricDraft({});
    setFeedbackDraft('');
    setAssessmentSearch('');
    setAssessmentStatusFilter('');
    setAssessmentSectionFilter('');
    setIntegrityReport(null);
    setShowIntegrityPanel(false);
    setExpandedPairIdx(null);
    setViewingDraftUserId(null);
    setDraftResponses(null);
  }, [navigate]);

  const goBackToList = useCallback(() => {
    navigate('/grading');
  }, [navigate]);

  const selectStudent = useCallback((userId: string) => {
    const group = studentGroups.find(g => g.userId === userId);
    if (!group) return;
    navigate(`/grading/${selectedAssessmentId}/${userId}`);
    setViewingDraftUserId(null);
    setDraftResponses(null);
    // rubricDraft will be populated by the URL-sync effect above
    const bestSub = group.best;
    setGradingAttemptId(bestSub.id);
    if (bestSub.rubricGrade?.grades) {
      setRubricDraft(bestSub.rubricGrade.grades);
      setFeedbackDraft(bestSub.rubricGrade?.teacherFeedback || '');
    } else if (bestSub.aiSuggestedGrade?.status === 'pending_review') {
      const aiDraft: Record<string, Record<string, RubricSkillGrade>> = {};
      for (const [qId, skills] of Object.entries(bestSub.aiSuggestedGrade.grades)) {
        aiDraft[qId] = {};
        for (const [sId, sg] of Object.entries(skills)) {
          aiDraft[qId][sId] = { selectedTier: sg.suggestedTier, percentage: sg.percentage };
        }
      }
      setRubricDraft(aiDraft);
      setFeedbackDraft('');
    } else {
      setRubricDraft({});
      setFeedbackDraft('');
    }
  }, [navigate, selectedAssessmentId, studentGroups]);

  const selectDraftStudent = useCallback(async (studentId: string) => {
    setGradingStudentId(null);
    setGradingAttemptId(null);
    setRubricDraft({});
    setFeedbackDraft('');
    setViewingDraftUserId(studentId);
    setDraftLoading(true);
    try {
      const responses = await dataService.fetchDraftResponses(studentId, selectedAssessmentId!);
      setDraftResponses(responses);
    } catch (err) {
      reportError(err, { method: 'fetchDraftResponses' });
      setDraftResponses(null);
      toast.error('Failed to load draft');
    } finally {
      setDraftLoading(false);
    }
  }, [selectedAssessmentId, toast]);

  const selectNotStartedStudent = useCallback((studentId: string) => {
    setGradingStudentId(null);
    setGradingAttemptId(null);
    setRubricDraft({});
    setFeedbackDraft('');
    setViewingDraftUserId(studentId);
    setDraftResponses(null);
  }, []);

  const navigateUnified = useCallback((delta: number) => {
    const nextIdx = currentUnifiedIndex + delta;
    if (nextIdx < 0 || nextIdx >= unifiedList.length) return;
    const entry = unifiedList[nextIdx];
    if (entry.type === 'submitted') selectStudent(entry.group.userId);
    else if (entry.type === 'draft') selectDraftStudent(entry.student.id);
    else selectNotStartedStudent(entry.student.id);
  }, [currentUnifiedIndex, unifiedList, selectStudent, selectDraftStudent, selectNotStartedStudent]);

  const handleAttemptChange = useCallback((attemptId: string) => {
    const newSub = selectedGroup?.submissions.find(s => s.id === attemptId);
    if (newSub) {
      setGradingAttemptId(newSub.id);
      setRubricDraft(newSub.rubricGrade?.grades || {});
      setFeedbackDraft(newSub.rubricGrade?.teacherFeedback || '');
    }
  }, [selectedGroup]);

  // ─── Action handlers ──────────────────────────────────────────────────────
  const handleSaveRubric = useCallback(async () => {
    if (!selectedAssessment?.rubric || !sub) return;
    setIsSavingRubric(true);
    try {
      const currentGrades = { ...(sub.rubricGrade?.grades || {}), ...rubricDraft };
      const hasAnyGrade = Object.values(currentGrades).some(q => Object.keys(q).length > 0);
      if (!hasAnyGrade) {
        toast.error('Select at least one rubric tier before saving.');
        return;
      }
      const pct = calculateRubricPercentage(currentGrades, selectedAssessment.rubric);
      const rubricGrade: RubricGrade = {
        grades: currentGrades,
        overallPercentage: pct,
        gradedAt: new Date().toISOString(),
        gradedBy: 'Admin',
        ...(feedbackDraft.trim() ? { teacherFeedback: feedbackDraft.trim() } : {}),
      };
      const hadAISuggestion = sub.aiSuggestedGrade?.status === 'pending_review';
      const result = hadAISuggestion
        ? await dataService.acceptAISuggestedGrade(sub.id, rubricGrade, sub.userId, selectedAssessment.title)
        : await dataService.saveRubricGrade(sub.id, rubricGrade, sub.userId, selectedAssessment.title);
      setAssessmentSubmissions(prev => prev.map(s => s.id === sub.id ? {
        ...s, rubricGrade, score: pct,
        ...(hadAISuggestion ? { aiSuggestedGrade: { ...s.aiSuggestedGrade!, status: 'accepted' as const } } : {}),
        ...(result.clearedAIFlag ? { flaggedAsAI: false, flaggedAsAIBy: '', flaggedAsAIAt: '', status: 'NORMAL' as const } : {}),
      } : s));

      // Record corrections for AI feedback loop
      if (hadAISuggestion && sub.aiSuggestedGrade) {
        const corrections: Array<{
          assignmentId: string; assignmentTitle: string; submissionId: string;
          rubricQuestionId: string; skillId: string; skillText: string;
          aiSuggestedTier: number; teacherSelectedTier: number;
          aiRationale: string; studentAnswer: string; correctedAt: string; model: string;
        }> = [];
        for (const q of selectedAssessment.rubric.questions) {
          for (const skill of q.skills) {
            const aiGrade = sub.aiSuggestedGrade.grades[q.id]?.[skill.id];
            const teacherGrade = currentGrades[q.id]?.[skill.id];
            if (aiGrade && teacherGrade && aiGrade.suggestedTier !== teacherGrade.selectedTier) {
              const blockAnswer = sub.blockResponses ? JSON.stringify(sub.blockResponses).slice(0, 200) : '';
              corrections.push({
                assignmentId: sub.assignmentId,
                assignmentTitle: sub.assignmentTitle,
                submissionId: sub.id,
                rubricQuestionId: q.id,
                skillId: skill.id,
                skillText: skill.skillText,
                aiSuggestedTier: aiGrade.suggestedTier,
                teacherSelectedTier: teacherGrade.selectedTier,
                aiRationale: aiGrade.rationale,
                studentAnswer: blockAnswer,
                correctedAt: new Date().toISOString(),
                model: sub.aiSuggestedGrade.model,
              });
            }
          }
        }
        if (corrections.length > 0) dataService.saveGradingCorrections(corrections);
      }

      setRubricDraft({});
      setFeedbackDraft('');
      clearDraftFromLocalStorage(sub.id);
      if (result.clearedAIFlag) {
        toast.success(`Grade saved: ${pct}% -- AI flag automatically cleared`);
      } else {
        toast.success(`Grade saved: ${pct}%`);
      }
    } catch (err) {
      reportError(err, { method: 'saveRubricGrade' });
      toast.error('Could not save grade. Please try again.');
    } finally {
      setIsSavingRubric(false);
    }
  }, [selectedAssessment, sub, rubricDraft, feedbackDraft, toast]);

  const handleReturnToStudent = useCallback(async () => {
    if (!sub || !selectedGroup) return;
    const ok = await confirm({
      title: 'Return Assessment',
      message: `This will return ${selectedGroup.userName}'s assessment for revision. Their previous answers will be preserved and they can edit and resubmit. The existing grade will be kept for your reference.`,
      confirmLabel: 'Return to Student',
      variant: 'warning',
    });
    if (!ok) return;
    try {
      await callReturnAssessment({ submissionId: sub.id });
      setAssessmentSubmissions(prev => prev.map(s => s.id === sub.id ? {
        ...s,
        status: 'RETURNED' as const,
        returnedAt: new Date().toISOString(),
        returnedBy: 'Admin',
      } : s));
      toast.success(`Assessment returned to ${selectedGroup.userName}`);
    } catch (err) {
      reportError(err, { method: 'callReturnAssessment' });
      toast.error('Could not return this assessment. Try again.');
    }
  }, [sub, selectedGroup, confirm, toast]);

  const handleFlagAsAI = useCallback(async () => {
    if (!sub || !selectedAssessment) return;
    if (await confirm({
      title: 'Flag AI Suspected',
      message: `Flag ${sub.userName}'s submission as AI suspected? This will set their score to 0% and notify the student.`,
      variant: 'danger',
      confirmLabel: 'Flag as AI',
    })) {
      try {
        await dataService.flagSubmissionAsAI(sub.id, 'Admin', sub.userId, selectedAssessment?.title);
      } catch (err) {
        reportError(err, { method: 'flagSubmissionAsAI' });
      }
    }
  }, [sub, selectedAssessment, confirm]);

  const handleUnflagAI = useCallback(async () => {
    if (!sub) return;
    if (await confirm({
      title: 'Remove AI Flag',
      message: 'Remove AI suspected flag from this submission? The original score and status will be restored.',
      variant: 'warning',
    })) {
      try {
        await dataService.unflagSubmissionAsAI(sub.id);
      } catch (err) {
        reportError(err, { method: 'unflagSubmissionAsAI' });
      }
    }
  }, [sub, confirm]);

  const handleBatchAcceptAI = useCallback(async () => {
    if (!selectedAssessment?.rubric) return;
    const pending = allStudentGroups.filter(g => g.hasAISuggestion && !g.hasRubricGrade);
    if (pending.length === 0) return;
    const confirmed = await confirm({
      message: `Accept all ${pending.length} AI-suggested grades? You can still edit them individually later.`,
      confirmLabel: 'Accept All',
      variant: 'info',
    });
    if (!confirmed) return;
    setBatchAcceptingAI(true);
    setBatchAcceptProgress({ done: 0, total: pending.length });
    let accepted = 0;
    let failed = 0;
    for (const group of pending) {
      const pendingSub = group.submissions.find(s => s.aiSuggestedGrade?.status === 'pending_review');
      if (!pendingSub?.aiSuggestedGrade || !selectedAssessment?.rubric) continue;
      try {
        const grades: Record<string, Record<string, RubricSkillGrade>> = {};
        for (const q of selectedAssessment.rubric.questions) {
          const aiQ = pendingSub.aiSuggestedGrade.grades[q.id];
          if (!aiQ) continue;
          grades[q.id] = {};
          for (const s of q.skills) {
            const aiS = aiQ[s.id];
            if (aiS) {
              grades[q.id][s.id] = { selectedTier: aiS.suggestedTier, percentage: TIER_PERCENTAGES[aiS.suggestedTier] };
            }
          }
        }
        const pct = calculateRubricPercentage(grades, selectedAssessment.rubric);
        const rubricGrade: RubricGrade = { grades, overallPercentage: pct, gradedAt: new Date().toISOString(), gradedBy: 'Admin (batch)' };
        await dataService.acceptAISuggestedGrade(pendingSub.id, rubricGrade, pendingSub.userId, selectedAssessment.title);
        setAssessmentSubmissions(prev => prev.map(s => s.id === pendingSub.id ? {
          ...s, rubricGrade, score: pct,
          aiSuggestedGrade: { ...s.aiSuggestedGrade!, status: 'accepted' as const },
        } : s));
        accepted++;
      } catch (err) {
        reportError(err, { method: 'batchAcceptAI', submissionId: pendingSub.id });
        failed++;
      }
      setBatchAcceptProgress({ done: accepted + failed, total: pending.length });
    }
    setBatchAcceptingAI(false);
    setBatchAcceptProgress(null);
    toast.success(`Batch grading complete: ${accepted} accepted${failed > 0 ? `, ${failed} failed` : ''}`);
  }, [selectedAssessment, allStudentGroups, confirm, toast]);

  const handleCheckIntegrity = useCallback(() => {
    if (showIntegrityPanel) {
      setShowIntegrityPanel(false);
    } else {
      const report = analyzeIntegrity(groupsData.sectionFilteredSubs, selectedAssessment?.lessonBlocks || []);
      setIntegrityReport(report);
      setShowIntegrityPanel(true);
      setExpandedPairIdx(null);
    }
  }, [showIntegrityPanel, groupsData.sectionFilteredSubs, selectedAssessment]);

  const handleDownloadCSV = useCallback(() => {
    if (!selectedAssessment) return;
    const gradedStudents = allStudentGroups
      .filter(g => g.hasRubricGrade && g.bestGraded?.rubricGrade)
      .map(g => {
        const studentUser = users.find(u => u.id === g.userId);
        return {
          email: studentUser?.email || '',
          displayName: g.userName,
          overallPercentage: g.bestGraded!.rubricGrade!.overallPercentage,
        };
      })
      .filter(s => s.email);
    downloadGradeCSV({
      students: gradedStudents,
      maxPoints: csvMaxPoints,
      assessmentTitle: selectedAssessment.title,
    });
    toast.success(`Exported ${gradedStudents.length} grades as CSV`);
  }, [selectedAssessment, allStudentGroups, users, csvMaxPoints, toast]);

  const handleClassroomPush = useCallback(async () => {
    if (!selectedAssessment) return;
    if (!hasClassroomLinks(selectedAssessment)) {
      setClassroomLinkModalOpen(true);
      return;
    }
    setPushingToClassroom(true);
    try {
      const accessToken = await getClassroomAccessToken();
      const result = await callClassroomPushGrades({ accessToken, assignmentId: selectedAssessment.id });
      const data = result.data as { pushed: number; skipped: number };
      toast.success(`Pushed ${data.pushed} grades to Classroom${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}`);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to push grades to Classroom');
    } finally {
      setPushingToClassroom(false);
    }
  }, [selectedAssessment, toast]);

  const handleRubricGradeChange = useCallback((questionId: string, skillId: string, tierIndex: number) => {
    setRubricDraft(prev => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {}),
        [skillId]: {
          selectedTier: tierIndex,
          percentage: TIER_PERCENTAGES[tierIndex],
        },
      },
    }));
  }, []);

  const handleDismissAISuggestion = useCallback(async () => {
    if (!sub) return;
    try {
      await dataService.dismissAISuggestedGrade(sub.id);
      setRubricDraft({});
      setAssessmentSubmissions(prev => prev.map(s => s.id === sub.id ? {
        ...s,
        aiSuggestedGrade: { ...s.aiSuggestedGrade!, status: 'rejected' as const },
      } : s));
      toast.info('AI suggestion dismissed');
    } catch (err) {
      reportError(err, { method: 'dismissAISuggestedGrade' });
    }
  }, [sub, toast]);

  const handleAcceptAllAI = useCallback(() => {
    if (!selectedAssessment?.rubric || !sub?.aiSuggestedGrade) return;
    const draft: Record<string, Record<string, RubricSkillGrade>> = {};
    for (const q of selectedAssessment.rubric.questions) {
      const aiQ = sub.aiSuggestedGrade.grades[q.id];
      if (!aiQ) continue;
      draft[q.id] = {};
      for (const skill of q.skills) {
        const aiS = aiQ[skill.id];
        if (aiS) {
          draft[q.id][skill.id] = {
            selectedTier: aiS.suggestedTier,
            percentage: TIER_PERCENTAGES[aiS.suggestedTier],
          };
        }
      }
    }
    setRubricDraft(draft);
  }, [selectedAssessment, sub]);

  return {
    // URL state
    selectedAssessmentId,
    urlStudentId,
    // Assessment data
    assessmentAssignments,
    selectedAssessment,
    allStudentGroups,
    studentGroups,
    unifiedList,
    hasDraftStudents,
    notStartedStudents,
    draftUserIds,
    draftSessionMap,
    availableSections,
    gradedCount,
    aiSuggestedCount,
    avgScore,
    flaggedCount,
    aiFlaggedCount,
    // Grading state
    selectedGroup,
    sub,
    gradingStudentId,
    gradingAttemptId,
    rubricDraft,
    feedbackDraft,
    setFeedbackDraft,
    isSavingRubric,
    currentUnifiedIndex,
    // Filter/search state
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
    // Integrity state
    integrityReport,
    showIntegrityPanel,
    expandedPairIdx,
    setExpandedPairIdx,
    // Draft state
    viewingDraftUserId,
    draftResponses,
    draftLoading,
    // Batch accept state
    batchAcceptingAI,
    batchAcceptProgress,
    // CSV / Classroom state
    csvMaxPoints,
    setCsvMaxPoints,
    classroomLinkModalOpen,
    setClassroomLinkModalOpen,
    pushingToClassroom,
    // Navigation handlers
    selectAssessment,
    goBackToList,
    selectStudent,
    selectDraftStudent,
    selectNotStartedStudent,
    navigateUnified,
    handleAttemptChange,
    // Action handlers
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
  };
}

export type GradingState = ReturnType<typeof useGradingState>;
