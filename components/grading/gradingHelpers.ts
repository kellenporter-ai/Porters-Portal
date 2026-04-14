/**
 * Pure helper functions and types for the grading interface.
 * Extracted from TeacherDashboard.tsx.
 */
import { Submission, Assignment, User, getUserSectionForClass } from '../../types';
import {
  classifyAssessmentParticipants,
  filterEnrolledInClass,
} from '../../lib/assessmentClassifier';

// ─── Types ───────────────────────────────────────────────────────────────────

export type StudentGroup = {
  userId: string;
  userName: string;
  userSection: string | undefined;
  submissions: Submission[];
  latest: Submission;
  best: Submission;
  bestGraded: Submission | null;
  attemptCount: number;
  maxAttempts: number | undefined;
  isInProgress: boolean;
  hasRubricGrade: boolean;
  needsGrading: boolean;
  hasAISuggestion: boolean;
};

export type UnifiedEntry =
  | { type: 'submitted'; group: StudentGroup }
  | { type: 'draft'; student: User; startedAt?: string }
  | { type: 'not_started'; student: User };

// ─── Pure score helpers ───────────────────────────────────────────────────────

export const getEffectiveScore = (s: Submission): number =>
  s.rubricGrade?.overallPercentage ?? s.assessmentScore?.percentage ?? s.score ?? 0;

export const isTrivialAttempt = (s: Submission): boolean => {
  const engTime = s.metrics?.engagementTime || 0;
  const score = getEffectiveScore(s);
  return engTime < 30 && score === 0 && s.status !== 'FLAGGED';
};

export const getScoreColor = (pct: number): string =>
  pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400';

export const getTabSwitchColor = (count: number): string =>
  count > 5 ? 'text-red-400' : count >= 3 ? 'text-yellow-400' : 'text-green-400';

export const computeTotalTime = (sub: Submission): number => {
  if (sub.submittedAt && sub.metrics?.startTime) {
    return Math.round((new Date(sub.submittedAt).getTime() - sub.metrics.startTime) / 1000);
  }
  return sub.metrics?.engagementTime || 0;
};

export const formatLastSeen = (dateStr?: string): string => {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString();
};

export const formatEngagementTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
};

// ─── Student grouping ─────────────────────────────────────────────────────────

interface BuildStudentGroupsParams {
  submissions: Submission[];
  enrolledStudents: User[];
  draftSessions: Array<{ userId: string; startedAt: string }>;
  draftResponseUserIds: Set<string>;
  selectedAssessment: Assignment | null;
  users: User[];
  assessmentSearch: string;
  assessmentStatusFilter: string;
  assessmentSectionFilter: string;
  assessmentSortKey: string;
  assessmentSortDesc: boolean;
}

interface BuildStudentGroupsResult {
  allStudentGroups: StudentGroup[];
  studentGroups: StudentGroup[];
  unifiedList: UnifiedEntry[];
  enrolledInClass: User[];
  enrolledFiltered: User[];
  hasDraftStudents: User[];
  notStartedStudents: User[];
  draftUserIds: Set<string>;
  draftSessionMap: Map<string, string>;
  availableSections: string[];
  gradedCount: number;
  aiSuggestedCount: number;
  avgScore: number;
  flaggedCount: number;
  aiFlaggedCount: number;
  sectionFilteredSubs: Submission[];
}

function getSubmissionSection(s: Submission, selectedAssessment: Assignment | null, users: User[]): string | undefined {
  if (s.userSection) return s.userSection;
  if (selectedAssessment?.classType) {
    const u = users.find(u => u.id === s.userId);
    if (u) return getUserSectionForClass(u, selectedAssessment.classType);
  }
  return undefined;
}

export function buildStudentGroups(params: BuildStudentGroupsParams): BuildStudentGroupsResult {
  const {
    submissions,
    enrolledStudents,
    draftSessions,
    draftResponseUserIds,
    selectedAssessment,
    users,
    assessmentSearch,
    assessmentStatusFilter,
    assessmentSectionFilter,
    assessmentSortKey,
    assessmentSortDesc,
  } = params;

  const getSection = (s: Submission) => getSubmissionSection(s, selectedAssessment, users);

  // Compute available sections
  const availableSections = Array.from(
    new Set(submissions.map(getSection).filter((s): s is string => !!s))
  ).sort();

  // Section filter
  const sectionFilteredSubs = assessmentSectionFilter
    ? submissions.filter(s => getSection(s) === assessmentSectionFilter)
    : submissions;

  const flaggedCount = sectionFilteredSubs.filter(s => s.status === 'FLAGGED' && !s.flaggedAsAI).length;
  const aiFlaggedCount = sectionFilteredSubs.filter(s => s.flaggedAsAI).length;

  // Group by student
  const studentMap = new Map<string, Submission[]>();
  sectionFilteredSubs.forEach(s => {
    const existing = studentMap.get(s.userId) || [];
    existing.push(s);
    studentMap.set(s.userId, existing);
  });

  const allStudentGroups: StudentGroup[] = Array.from(studentMap.entries()).map(([userId, subs]) => {
    const sorted = [...subs].sort((a, b) => (b.attemptNumber || 1) - (a.attemptNumber || 1));
    const latest = sorted[0];
    const nonFlaggedSubs = sorted.filter(s => !s.flaggedAsAI);
    const best = nonFlaggedSubs.length > 0
      ? nonFlaggedSubs.reduce((best, s) => getEffectiveScore(s) > getEffectiveScore(best) ? s : best, nonFlaggedSubs[0])
      : latest;
    const gradedSubs = sorted.filter(s => !!s.rubricGrade);
    const bestGraded = gradedSubs.length > 0
      ? gradedSubs.reduce((best, s) => (s.rubricGrade!.overallPercentage > best.rubricGrade!.overallPercentage ? s : best), gradedSubs[0])
      : null;
    return {
      userId,
      userName: latest.userName,
      userSection: getSection(latest),
      submissions: sorted,
      latest,
      best,
      bestGraded,
      attemptCount: sorted.length,
      maxAttempts: selectedAssessment?.assessmentConfig?.maxAttempts || undefined,
      isInProgress: sorted.every(s => s.status === 'STARTED'),
      hasRubricGrade: gradedSubs.length > 0,
      needsGrading: selectedAssessment?.rubric
        ? sorted.some(s => !s.rubricGrade && !isTrivialAttempt(s))
        : false,
      hasAISuggestion: sorted.some(s => s.aiSuggestedGrade?.status === 'pending_review'),
    };
  });

  // Draft user sets — delegated to shared classifier so dataService.getAssessmentStats
  // and this helper apply the same rules for "what counts as a draft".
  const classified = classifyAssessmentParticipants({
    submissions: sectionFilteredSubs,
    sessionDraftUserIds: new Set(draftSessions.map(s => s.userId)),
    responseDraftUserIds: draftResponseUserIds,
  });
  const submittedUserIds = classified.submittedUserIds;
  const draftUserIds = classified.draftUserIds;

  // Enrolled cross-reference (falls back to draft users when enrollment data is drifted)
  const enrolledInClass = filterEnrolledInClass(enrolledStudents, selectedAssessment, draftUserIds);
  if (selectedAssessment?.classType && enrolledStudents.length > 0 && enrolledInClass.length === 0) {
    console.warn('[gradingHelpers] enrolledInClass is empty despite classType being set — possible enrollment data mismatch', {
      classType: selectedAssessment.classType,
      sampleStudentClassType: enrolledStudents[0]?.classType,
      sampleEnrolledClasses: enrolledStudents[0]?.enrolledClasses,
    });
  }
  const enrolledFiltered = assessmentSectionFilter
    ? enrolledInClass.filter(s => {
        const sec = getUserSectionForClass(s, selectedAssessment!.classType);
        return sec === assessmentSectionFilter;
      })
    : enrolledInClass;
  const draftSessionMap = new Map(draftSessions.map(s => [s.userId, s.startedAt]));
  const hasDraftStudents = enrolledFiltered.filter(s => !submittedUserIds.has(s.id) && draftUserIds.has(s.id));
  const notStartedStudents = enrolledFiltered.filter(s => !submittedUserIds.has(s.id) && !draftUserIds.has(s.id));

  const gradedCount = allStudentGroups.filter(g => g.hasRubricGrade).length;
  const aiSuggestedCount = allStudentGroups.filter(g => g.hasAISuggestion && !g.hasRubricGrade).length;
  const avgScore = allStudentGroups.length > 0
    ? Math.round(allStudentGroups.reduce((acc, g) => acc + getEffectiveScore(g.best), 0) / allStudentGroups.length)
    : 0;

  // Search filter
  const searchFiltered = assessmentSearch
    ? allStudentGroups.filter(g => g.userName.toLowerCase().includes(assessmentSearch.toLowerCase()))
    : allStudentGroups;

  // Status filter
  const statusFiltered = assessmentStatusFilter
    ? searchFiltered.filter(g => {
        switch (assessmentStatusFilter) {
          case 'flagged': return g.latest.status === 'FLAGGED' && !g.latest.flaggedAsAI;
          case 'ai_flagged': return !!g.latest.flaggedAsAI;
          case 'ai_suggested': return g.hasAISuggestion && !g.hasRubricGrade;
          case 'needs_grading': return g.needsGrading;
          case 'graded': return g.hasRubricGrade;
          case 'in_progress': return g.isInProgress;
          case 'not_started': return false;
          case 'normal': return g.latest.status !== 'FLAGGED' && !g.latest.flaggedAsAI && !g.needsGrading;
          default: return true;
        }
      })
    : searchFiltered;

  // Sort
  const studentGroups: StudentGroup[] = [...statusFiltered].sort((a, b) => {
    let av: number | string = 0, bv: number | string = 0;
    switch (assessmentSortKey) {
      case 'name': av = a.userName.toLowerCase(); bv = b.userName.toLowerCase();
        return assessmentSortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
      case 'attempt': av = a.attemptCount; bv = b.attemptCount; break;
      case 'score': av = getEffectiveScore(a.best); bv = getEffectiveScore(b.best); break;
      case 'submitted': {
        const aTime = a.latest.submittedAt ? new Date(a.latest.submittedAt).getTime() : 0;
        const bTime = b.latest.submittedAt ? new Date(b.latest.submittedAt).getTime() : 0;
        return assessmentSortDesc ? bTime - aTime : aTime - bTime;
      }
      case 'status': av = a.latest.status; bv = b.latest.status;
        return assessmentSortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
      default: av = getEffectiveScore(a.best); bv = getEffectiveScore(b.best); break;
    }
    return assessmentSortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
  });

  // Unified list
  const showDraftAndNotStarted = !assessmentStatusFilter || assessmentStatusFilter === 'not_started';
  const showSubmitted = assessmentStatusFilter !== 'not_started';
  const draftSearchFiltered = assessmentSearch
    ? hasDraftStudents.filter(s => s.name.toLowerCase().includes(assessmentSearch.toLowerCase()))
    : hasDraftStudents;
  const notStartedSearchFiltered = assessmentSearch
    ? notStartedStudents.filter(s => s.name.toLowerCase().includes(assessmentSearch.toLowerCase()))
    : notStartedStudents;

  const unifiedList: UnifiedEntry[] = [
    ...(showSubmitted ? studentGroups.map(g => ({ type: 'submitted' as const, group: g })) : []),
    ...(showDraftAndNotStarted ? draftSearchFiltered.map(s => ({ type: 'draft' as const, student: s, startedAt: draftSessionMap.get(s.id) })) : []),
    ...(showDraftAndNotStarted ? notStartedSearchFiltered.map(s => ({ type: 'not_started' as const, student: s })) : []),
  ];

  return {
    allStudentGroups,
    studentGroups,
    unifiedList,
    enrolledInClass,
    enrolledFiltered,
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
    sectionFilteredSubs,
  };
}
