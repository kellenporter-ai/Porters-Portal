
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { User, ChatFlag, Announcement, Assignment, Submission, StudentAlert, StudentBucketProfile, TelemetryBucket, LessonBlock, RubricGrade, RubricSkillGrade, getUserSectionForClass, DailyDigest } from '../types';
import { Users, Clock, FileText, Zap, ShieldAlert, CheckCircle, MicOff, AlertTriangle, RefreshCw, Check, Trash2, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, Activity, Search, Award, Download, Upload, Loader2, BarChart3, Shield, BookOpen, Save, Bot, Undo2, Fingerprint, Sparkles, X, Newspaper, Send, Eye } from 'lucide-react';
import AnalyticsTab from './dashboard/AnalyticsTab';
import { dataService } from '../services/dataService';
import { callTriggerDailyDigest, callReturnAssessment, callSubmitOnBehalf, callClassroomPushGrades } from '../lib/firebase';
import { getClassroomAccessToken } from '../lib/classroomAuth';
import ClassroomLinkModal from './ClassroomLinkModal';
import { BUCKET_META } from '../lib/telemetry';
import { calculateRubricPercentage } from '../lib/rubricParser';
import katex from 'katex';
import { analyzeIntegrity, type IntegrityReport } from '../lib/integrityAnalysis';
import { reportError } from '../lib/errorReporting';
import { FeatureErrorBoundary } from './ErrorBoundary';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import AnnouncementManager from './AnnouncementManager';
import StudentDetailDrawer from './StudentDetailDrawer';
import BehaviorQuickAward from './BehaviorQuickAward';
import { downloadGradeCSV } from '../lib/csvGradeExport';

import { lazyWithRetry } from '../lib/lazyWithRetry';
const RubricViewer = lazyWithRetry(() => import('./RubricViewer'));
import EarlyWarningPanel from './teacher/EarlyWarningPanel';
import { useClassConfig } from '../lib/AppDataContext';

interface TeacherDashboardProps {
  users: User[];
  assignments?: Assignment[];
  submissions?: Submission[];
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ users, assignments = [], submissions = [] }) => {
  const { confirm } = useConfirm();
  const toast = useToast();
  const { classConfigs } = useClassConfig();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [flags, setFlags] = useState<ChatFlag[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [alerts, setAlerts] = useState<StudentAlert[]>([]);
  const [bucketProfiles, setBucketProfiles] = useState<StudentBucketProfile[]>([]);
  const [now, setNow] = useState(Date.now());
  const [muteMenuFlagId, setMuteMenuFlagId] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string>('xp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [engagementSearch, setEngagementSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState<TelemetryBucket | ''>('');
  const [showBehaviorAward, setShowBehaviorAward] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adminTab, setAdminTab] = useState<'dashboard' | 'analytics' | 'assessments' | 'digest'>('dashboard');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [assessmentSortKey, setAssessmentSortKey] = useState<string>('submitted');
  const [assessmentSortDesc, setAssessmentSortDesc] = useState(true);
  const [draftSessions, setDraftSessions] = useState<Array<{ userId: string; startedAt: string }>>([]);
  const [rubricDraft, setRubricDraft] = useState<Record<string, Record<string, RubricSkillGrade>>>({});
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [isSavingRubric, setIsSavingRubric] = useState(false);
  const [assessmentSearch, setAssessmentSearch] = useState('');
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState('');
  const [assessmentSectionFilter, setAssessmentSectionFilter] = useState('');
  const [gradingStudentId, setGradingStudentId] = useState<string | null>(null);
  const [gradingAttemptId, setGradingAttemptId] = useState<string | null>(null);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [showIntegrityPanel, setShowIntegrityPanel] = useState(false);
  const [expandedPairIdx, setExpandedPairIdx] = useState<number | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [assessmentSubmissions, setAssessmentSubmissions] = useState<Submission[]>([]);
  const [dailyDigests, setDailyDigests] = useState<DailyDigest[]>([]);
  const [digestGenerating, setDigestGenerating] = useState(false);
  const [csvMaxPoints, setCsvMaxPoints] = useState(100);
  const [batchAcceptingAI, setBatchAcceptingAI] = useState(false);
  const [batchAcceptProgress, setBatchAcceptProgress] = useState<{ done: number; total: number } | null>(null);
  const [viewingDraftUserId, setViewingDraftUserId] = useState<string | null>(null);
  const [draftResponses, setDraftResponses] = useState<Record<string, unknown> | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [classroomLinkModalOpen, setClassroomLinkModalOpen] = useState(false);
  const [pushingToClassroom, setPushingToClassroom] = useState(false);
  const [showNudgeModal, setShowNudgeModal] = useState(false);
  const [nudgeTarget, setNudgeTarget] = useState<{ studentId: string; studentName: string; defaultMessage: string; classType: string } | null>(null);
  const [nudgeMessage, setNudgeMessage] = useState('');
  const [nudgeSending, setNudgeSending] = useState(false);

  const handleSort = useCallback((col: string) => {
    setSortCol(prev => {
      if (prev === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return prev; }
      setSortDir('asc');
      return col;
    });
  }, []);

  useEffect(() => {
      const unsub = dataService.subscribeToChatFlags(setFlags);
      const unsubAnnouncements = dataService.subscribeToAnnouncements(setAnnouncements);
      const unsubAlerts = dataService.subscribeToStudentAlerts(setAlerts);
      const unsubBuckets = dataService.subscribeToStudentBuckets(setBucketProfiles);
      const unsubDigests = dataService.subscribeToDailyDigests(setDailyDigests);
      const interval = setInterval(() => setNow(Date.now()), 60000); // Update 'expires in' every minute
      return () => {
          unsub();
          unsubAnnouncements();
          unsubAlerts();
          unsubBuckets();
          unsubDigests();
          clearInterval(interval);
      };
  }, []);

  // Subscribe to ALL submissions for the selected assessment (bypasses global 200-doc limit)
  useEffect(() => {
    if (!selectedAssessmentId) {
      setAssessmentSubmissions([]);
      return;
    }
    const unsub = dataService.subscribeToAssignmentSubmissions(selectedAssessmentId, setAssessmentSubmissions);
    return () => unsub();
  }, [selectedAssessmentId]);

  // Subscribe to open assessment sessions (draft tracking)
  useEffect(() => {
    if (!selectedAssessmentId) {
      setDraftSessions([]);
      return;
    }
    const unsub = dataService.subscribeToAssessmentSessions(selectedAssessmentId, setDraftSessions);
    return () => unsub();
  }, [selectedAssessmentId]);

  // When not_started filter is selected, auto-select first not-started student in unified list
  useEffect(() => {
    if (assessmentStatusFilter === 'not_started') {
      setGradingStudentId(null);
      setGradingAttemptId(null);
    }
  }, [assessmentStatusFilter]);

  const students = useMemo(() => users.filter(u => u.role === 'STUDENT'), [users]);
  const warningThresholds = useMemo(
    () => classConfigs.find(c => c.telemetryThresholds)?.telemetryThresholds,
    [classConfigs]
  );
  const availableSections = useMemo(() => {
    const sections = new Set<string>();
    students.forEach(s => { if (s.section) sections.add(s.section); });
    return Array.from(sections).sort();
  }, [students]);

  // EWS: Build alert lookup by student ID (highest severity per student)
  const alertsByStudent = useMemo(() => {
    const map = new Map<string, StudentAlert>();
    for (const alert of alerts) {
      const existing = map.get(alert.studentId);
      const severity: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };
      if (!existing || (severity[alert.riskLevel] || 0) > (severity[existing.riskLevel] || 0)) {
        map.set(alert.studentId, alert);
      }
    }
    return map;
  }, [alerts]);

  // Bucket lookup by student ID (pick first profile — typically one per student/class)
  const bucketsByStudent = useMemo(() => {
    const map = new Map<string, StudentBucketProfile>();
    for (const bp of bucketProfiles) {
      if (!map.has(bp.studentId)) map.set(bp.studentId, bp);
    }
    return map;
  }, [bucketProfiles]);

  // Bucket distribution for overview (includes ALL students)
  const bucketDistribution = useMemo(() => {
    const counts: Record<TelemetryBucket, number> = {
      THRIVING: 0, ON_TRACK: 0, COASTING: 0, SPRINTING: 0,
      STRUGGLING: 0, DISENGAGING: 0, INACTIVE: 0, COPYING: 0,
    };
    // Deduplicate: count each student once (across classes, take first)
    const seen = new Set<string>();
    for (const bp of bucketProfiles) {
      if (seen.has(bp.studentId)) continue;
      seen.add(bp.studentId);
      if (counts[bp.bucket] !== undefined) counts[bp.bucket]++;
    }
    // Students without a bucket profile default to INACTIVE
    for (const s of students) {
      if (!seen.has(s.id)) counts.INACTIVE++;
    }
    return counts;
  }, [bucketProfiles, students]);
  
  // Stats
  const { totalStudents, avgTime, totalResourcesAccessed, totalXP } = useMemo(() => {
    const total = students.length;
    return {
      totalStudents: total,
      avgTime: Math.round(students.reduce((acc, s) => acc + (s.stats?.totalTime || 0), 0) / (total || 1)),
      totalResourcesAccessed: students.reduce((acc, s) => acc + (s.stats?.problemsCompleted || 0), 0),
      totalXP: students.reduce((acc, s) => acc + (s.gamification?.xp || 0), 0),
    };
  }, [students]);

  // Derived Moderation Data
  const mutedStudents = useMemo(() => students.filter(s => s.mutedUntil && new Date(s.mutedUntil).getTime() > now), [students, now]);

  // Filtered + sorted student list (used by table + virtualizer)
  const sortedStudents = useMemo(() => {
    const filtered = students.filter(s => {
      const matchesSearch = !engagementSearch || s.name.toLowerCase().includes(engagementSearch.toLowerCase()) || s.email.toLowerCase().includes(engagementSearch.toLowerCase());
      const matchesBucket = !bucketFilter || bucketsByStudent.get(s.id)?.bucket === bucketFilter;
      return matchesSearch && matchesBucket;
    });
    return [...filtered].sort((a, b) => {
      switch (sortCol) {
        case 'name':      return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        case 'class':     return sortDir === 'asc' ? (a.classType||'').localeCompare(b.classType||'') : (b.classType||'').localeCompare(a.classType||'');
        case 'lastSeen':  { const av = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0; const bv = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0; return sortDir === 'asc' ? av - bv : bv - av; }
        case 'time':      { const av = a.stats?.totalTime || 0; const bv = b.stats?.totalTime || 0; return sortDir === 'asc' ? av - bv : bv - av; }
        case 'resources': { const av = a.stats?.problemsCompleted || 0; const bv = b.stats?.problemsCompleted || 0; return sortDir === 'asc' ? av - bv : bv - av; }
        case 'xp': default: { const av = a.gamification?.classXp?.[a.classType || ''] || 0; const bv = b.gamification?.classXp?.[b.classType || ''] || 0; return sortDir === 'asc' ? av - bv : bv - av; }
      }
    });
  }, [students, engagementSearch, bucketFilter, bucketsByStudent, sortCol, sortDir]);

  const maxXP = useMemo(() => Math.max(1, ...students.map(s => s.gamification?.classXp?.[s.classType || ''] || 0)), [students]);

  const tableVirtualizer = useVirtualizer({
    count: sortedStudents.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 52,
    overscan: 15,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Batch selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => prev.size === sortedStudents.length ? new Set() : new Set(sortedStudents.map(s => s.id)));
  }, [sortedStudents]);

  const exportCSV = useCallback(() => {
    const selected = students.filter(s => selectedIds.has(s.id));
    const rows = [['Name', 'Email', 'Class', 'XP', 'Total Time (min)', 'Resources', 'Last Login']];
    for (const s of selected) {
      rows.push([s.name, s.email, s.classType || '', String(s.gamification?.classXp?.[s.classType || ''] || 0), String(s.stats?.totalTime || 0), String(s.stats?.problemsCompleted || 0), s.lastLoginAt || 'Never']);
    }
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `students_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [students, selectedIds]);

  const handleUnmute = async (userId: string) => {
      if(await confirm({ message: "Lift silence sanction for this operative?", confirmLabel: "Unmute", variant: "info" })) {
          try {
              await dataService.muteUser(userId, 0);
          } catch {
              toast.error('Failed to unmute user.');
          }
      }
  };

  const MUTE_DURATIONS = [
      { label: '15 min', minutes: 15 },
      { label: '1 hour', minutes: 60 },
      { label: '24 hours', minutes: 1440 },
      { label: 'Indefinite', minutes: dataService.INDEFINITE_MUTE },
  ];

  const handleMuteFromFlag = async (senderId: string, minutes: number) => {
      try {
          await dataService.muteUser(senderId, minutes);
      } catch {
          toast.error('Failed to mute user.');
      }
      setMuteMenuFlagId(null);
  };

  const handleExtendMute = async (userId: string, currentMute: string) => {
      const currentEnd = new Date(currentMute).getTime();
      // Add 1 hour to the current expiry
      const newEnd = new Date(Math.max(currentEnd, Date.now()) + 60 * 60 * 1000);
      // Calculate minutes from now
      const minutesFromNow = Math.ceil((newEnd.getTime() - Date.now()) / 60000);
      try {
          await dataService.muteUser(userId, minutesFromNow);
      } catch {
          toast.error('Failed to extend mute.');
      }
  };
  
  const StatCard = React.memo(({ label, value, icon, color }: { label: string, value: string | number, icon: React.ReactNode, color: string }) => (
    <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] p-6 rounded-3xl relative overflow-hidden group hover:border-[var(--border-strong)] transition-all duration-300" aria-label={label}>
      <div className={`absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity ${color}`}>
        {icon}
      </div>
      <div className="relative z-10">
        <div className="text-4xl font-bold text-[var(--text-primary)] mb-2">{value}</div>
        <div className="text-sm font-medium text-[var(--text-tertiary)] uppercase tracking-wider">{label}</div>
      </div>
      <div className={`absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r ${color}`}></div>
    </div>
  ));

  const getTimeRemaining = (isoString: string) => {
      const end = new Date(isoString).getTime();
      const diff = end - now;
      if (diff <= 0) return 'Expired';
      const mins = Math.ceil(diff / 60000);
      if (mins > 60) return `${Math.ceil(mins/60)} hrs`;
      return `${mins} mins`;
  };

  const formatLastSeen = (dateStr?: string) => {
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

  return (
    <div className={`space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10 transition-[padding] duration-300 ${selectedStudentId ? 'xl:pr-[520px]' : ''}`}>
      <div className="flex justify-between items-end">
        <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Teacher Dashboard</h1>
            <p className="text-[var(--text-tertiary)]">Engagement analytics and operational overview.</p>
        </div>
        <div className="flex bg-[var(--panel-bg)] rounded-xl p-1 border border-[var(--border)]" role="tablist" aria-label="Dashboard sections">
          <button id="tab-dashboard" role="tab" aria-selected={adminTab === 'dashboard'} aria-controls="tabpanel-dashboard" onClick={() => setAdminTab('dashboard')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${adminTab === 'dashboard' ? 'bg-purple-600 text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>
            <Activity className="w-3.5 h-3.5" aria-hidden="true" /> Overview
          </button>
          <button id="tab-analytics" role="tab" aria-selected={adminTab === 'analytics'} aria-controls="tabpanel-analytics" onClick={() => setAdminTab('analytics')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${adminTab === 'analytics' ? 'bg-purple-600 text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>
            <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" /> Analytics
          </button>
          <button id="tab-assessments" role="tab" aria-selected={adminTab === 'assessments'} aria-controls="tabpanel-assessments" onClick={() => setAdminTab('assessments')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${adminTab === 'assessments' ? 'bg-purple-600 text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>
            <Shield className="w-3.5 h-3.5" aria-hidden="true" /> Assessments
          </button>
          <button id="tab-digest" role="tab" aria-selected={adminTab === 'digest'} aria-controls="tabpanel-digest" onClick={() => setAdminTab('digest')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${adminTab === 'digest' ? 'bg-purple-600 text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>
            <Newspaper className="w-3.5 h-3.5" aria-hidden="true" /> Daily Digest
          </button>
        </div>
      </div>

      {adminTab === 'analytics' && (
        <div role="tabpanel" id="tabpanel-analytics" aria-labelledby="tab-analytics"><FeatureErrorBoundary feature="Analytics Tab">
          <AnalyticsTab users={users} assignments={assignments} submissions={submissions} bucketProfiles={bucketProfiles} />
        </FeatureErrorBoundary></div>
      )}

      {adminTab === 'assessments' && (<div role="tabpanel" id="tabpanel-assessments" aria-labelledby="tab-assessments"><FeatureErrorBoundary feature="Assessments Tab">{(() => {
        const assessmentAssignments = assignments.filter(a => a.isAssessment);
        const selectedAssessment = assessmentAssignments.find(a => a.id === selectedAssessmentId) || null;
        // When a specific assessment is selected, use the dedicated assignment-scoped subscription
        // (bypasses the global 200-doc limit). Otherwise fall back to global submissions for the overview.
        const filteredAssessmentSubmissions = selectedAssessmentId
          ? assessmentSubmissions
          : submissions.filter(s => s.isAssessment);

        // Resolve section for each submission: prefer stored userSection, fall back to user lookup
        const getSubmissionSection = (s: Submission): string | undefined => {
          if (s.userSection) return s.userSection;
          if (selectedAssessment?.classType) {
            const u = users.find(u => u.id === s.userId);
            if (u) return getUserSectionForClass(u, selectedAssessment.classType);
          }
          return undefined;
        };

        // Compute available sections
        const availableSections = Array.from(new Set(
          filteredAssessmentSubmissions.map(getSubmissionSection).filter((s): s is string => !!s)
        )).sort();

        // Apply section filter early (before stats)
        const sectionFilteredSubs = assessmentSectionFilter
          ? filteredAssessmentSubmissions.filter(s => getSubmissionSection(s) === assessmentSectionFilter)
          : filteredAssessmentSubmissions;

        // Score helper
        const getEffectiveScore = (s: Submission) => s.rubricGrade?.overallPercentage ?? s.assessmentScore?.percentage ?? s.score ?? 0;
        const flaggedCount = sectionFilteredSubs.filter(s => s.status === 'FLAGGED' && !s.flaggedAsAI).length;
        const aiFlaggedCount = sectionFilteredSubs.filter(s => s.flaggedAsAI).length;

        // Group submissions by student
        const completedSubs = sectionFilteredSubs;
        const studentMap = new Map<string, Submission[]>();
        completedSubs.forEach(s => {
          const existing = studentMap.get(s.userId) || [];
          existing.push(s);
          studentMap.set(s.userId, existing);
        });

        // Helper: detect trivial/accidental submissions (very short time + 0% score)
        const isTrivialAttempt = (s: Submission) => {
          const engTime = s.metrics?.engagementTime || 0;
          const score = getEffectiveScore(s);
          return engTime < 30 && score === 0 && s.status !== 'FLAGGED';
        };

        const allStudentGroups = Array.from(studentMap.entries()).map(([userId, subs]) => {
          const sorted = [...subs].sort((a, b) => (b.attemptNumber || 1) - (a.attemptNumber || 1));
          const latest = sorted[0];
          // Best submission: prefer highest rubric grade, then highest assessment/auto score
          // Exclude AI-flagged submissions from best score calculation
          const nonFlaggedSubs = sorted.filter(s => !s.flaggedAsAI);
          const best = nonFlaggedSubs.length > 0
            ? nonFlaggedSubs.reduce((best, s) => getEffectiveScore(s) > getEffectiveScore(best) ? s : best, nonFlaggedSubs[0])
            : latest;
          // The graded submission is the one with a rubric grade and the highest rubric score
          const gradedSubs = sorted.filter(s => !!s.rubricGrade);
          const bestGraded = gradedSubs.length > 0
            ? gradedSubs.reduce((best, s) => (s.rubricGrade!.overallPercentage > best.rubricGrade!.overallPercentage ? s : best), gradedSubs[0])
            : null;
          return {
            userId,
            userName: latest.userName,
            userSection: getSubmissionSection(latest),
            submissions: sorted,
            latest,
            best,
            bestGraded,
            attemptCount: sorted.length,
            maxAttempts: selectedAssessment?.assessmentConfig?.maxAttempts || undefined,
            isInProgress: sorted.every(s => s.status === 'STARTED'),
            hasRubricGrade: gradedSubs.length > 0,
            needsGrading: selectedAssessment?.rubric ? sorted.some(s => !s.rubricGrade && !isTrivialAttempt(s)) : false,
            hasAISuggestion: sorted.some(s => s.aiSuggestedGrade?.status === 'pending_review'),
          };
        });

        // Cross-reference enrolled students to find those who haven't started
        const enrolledInClass = students.filter(s => {
          const ct = selectedAssessment?.classType;
          if (!ct) return false;
          return s.classType === ct || s.enrolledClasses?.includes(ct);
        });
        const enrolledFiltered = assessmentSectionFilter
          ? enrolledInClass.filter(s => {
              const sec = getUserSectionForClass(s, selectedAssessment!.classType);
              return sec === assessmentSectionFilter;
            })
          : enrolledInClass;
        const submittedUserIds = new Set(sectionFilteredSubs.map(s => s.userId));
        const draftUserIds = new Set(draftSessions.map(s => s.userId));
        const draftSessionMap = new Map(draftSessions.map(s => [s.userId, s.startedAt]));
        const hasDraftStudents = enrolledFiltered.filter(s => !submittedUserIds.has(s.id) && draftUserIds.has(s.id));
        const notStartedStudents = enrolledFiltered.filter(s => !submittedUserIds.has(s.id) && !draftUserIds.has(s.id));

        // Graded count and average score (best-per-student, not per-submission)
        const gradedCount = allStudentGroups.filter(g => g.hasRubricGrade).length;
        const aiSuggestedCount = allStudentGroups.filter(g => g.hasAISuggestion && !g.hasRubricGrade).length;
        const avgScore = allStudentGroups.length > 0
          ? Math.round(allStudentGroups.reduce((acc, g) => acc + getEffectiveScore(g.best), 0) / allStudentGroups.length)
          : 0;

        // Apply search filter
        const searchFiltered = assessmentSearch
          ? allStudentGroups.filter(g => g.userName.toLowerCase().includes(assessmentSearch.toLowerCase()))
          : allStudentGroups;

        // Apply status filter
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

        // Sort grouped rows
        const studentGroups = [...statusFiltered].sort((a, b) => {
          let av: number | string = 0, bv: number | string = 0;
          switch (assessmentSortKey) {
            case 'name': av = a.userName.toLowerCase(); bv = b.userName.toLowerCase(); return assessmentSortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
            case 'attempt': av = a.attemptCount; bv = b.attemptCount; break;
            case 'score': av = getEffectiveScore(a.best); bv = getEffectiveScore(b.best); break;
            case 'submitted': {
              const aTime = a.latest.submittedAt ? new Date(a.latest.submittedAt).getTime() : 0;
              const bTime = b.latest.submittedAt ? new Date(b.latest.submittedAt).getTime() : 0;
              return assessmentSortDesc ? bTime - aTime : aTime - bTime;
            }
            case 'status': av = a.latest.status; bv = b.latest.status; return assessmentSortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
            default: av = getEffectiveScore(a.best); bv = getEffectiveScore(b.best); break;
          }
          return assessmentSortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
        });

        // Unified student list: merge submitted, draft, and not-started students
        type UnifiedEntry =
          | { type: 'submitted'; group: typeof allStudentGroups[0] }
          | { type: 'draft'; student: typeof enrolledInClass[0]; startedAt?: string }
          | { type: 'not_started'; student: typeof enrolledInClass[0] };

        // Filter unified list based on status filter
        const showDraftAndNotStarted = !assessmentStatusFilter || assessmentStatusFilter === 'not_started';
        const showSubmitted = assessmentStatusFilter !== 'not_started';
        // Also apply search to draft/not-started
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

        const getUnifiedId = (entry: UnifiedEntry) => entry.type === 'submitted' ? entry.group.userId : entry.student.id;
        const getUnifiedName = (entry: UnifiedEntry) => entry.type === 'submitted' ? entry.group.userName : entry.student.name;

        const formatEngagementTime = (seconds: number) => {
          const m = Math.floor(seconds / 60);
          const s = seconds % 60;
          return `${m}m ${s}s`;
        };

        const getScoreColor = (pct: number) => pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400';
        const getTabSwitchColor = (count: number) => count > 5 ? 'text-red-400' : count >= 3 ? 'text-yellow-400' : 'text-green-400';

        return (
          <div className="space-y-6">
            {/* Assessment Selector */}
            <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl p-6 backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-400" aria-hidden="true" />
                  Assessment Review
                </h3>
                <span className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-widest">
                  {assessmentAssignments.length} assessment{assessmentAssignments.length !== 1 ? 's' : ''}
                </span>
              </div>

              <select
                aria-label="Select assessment"
                value={selectedAssessmentId || ''}
                onChange={e => { setSelectedAssessmentId(e.target.value || null); setGradingStudentId(null); setGradingAttemptId(null); setRubricDraft({}); setFeedbackDraft(''); setAssessmentSearch(''); setAssessmentStatusFilter(''); setAssessmentSectionFilter(''); setIntegrityReport(null); setShowIntegrityPanel(false); setExpandedPairIdx(null); setViewingDraftUserId(null); setDraftResponses(null); }}
                className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-purple-500/50 transition"
              >
                <option value="">Select an assessment...</option>
                {[...assessmentAssignments].sort((a, b) => {
                  const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return dateB - dateA;
                }).map(a => (
                  <option key={a.id} value={a.id}>
                    {a.title} ({a.classType}){a.dueDate ? ` — due ${new Date(a.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                  </option>
                ))}
              </select>

              {selectedAssessment && (
                <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-tertiary)]">
                  {selectedAssessment.createdAt && (
                    <span title={new Date(selectedAssessment.createdAt).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}>
                      Posted {new Date(selectedAssessment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                  {selectedAssessment.dueDate && (
                    <span className={new Date(selectedAssessment.dueDate) < new Date() ? 'text-red-400' : 'text-yellow-400'}
                      title={new Date(selectedAssessment.dueDate).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}>
                      Due {new Date(selectedAssessment.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {new Date(selectedAssessment.dueDate) < new Date() ? ' (past due)' : ''}
                    </span>
                  )}
                  {selectedAssessment.targetSections && selectedAssessment.targetSections.length > 0 && (
                    <span>Sections: {selectedAssessment.targetSections.join(', ')}</span>
                  )}
                </div>
              )}

              {selectedAssessment && gradedCount > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-xs text-[var(--text-tertiary)] whitespace-nowrap">Max pts:</label>
                  <input
                    type="number"
                    min={1}
                    aria-label="Maximum points for CSV export"
                    value={csvMaxPoints}
                    onChange={e => setCsvMaxPoints(Math.max(1, Number(e.target.value) || 1))}
                    className="w-16 bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-purple-500/50"
                  />
                  <button
                    onClick={() => {
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
                    }}
                    className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-strong)] rounded-lg px-3 py-1.5 transition bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] flex items-center gap-1.5"
                  >
                    <Download className="w-3 h-3" aria-hidden="true" />
                    Export Grades ({gradedCount})
                  </button>
                  <button
                    onClick={async () => {
                      if (!selectedAssessment) return;
                      if (!selectedAssessment.classroomLink) {
                        setClassroomLinkModalOpen(true);
                        return;
                      }
                      // Already linked — push grades directly
                      setPushingToClassroom(true);
                      try {
                        const accessToken = await getClassroomAccessToken();
                        const result = await callClassroomPushGrades({ accessToken, assignmentId: selectedAssessment.id });
                        const data = result.data as { pushed: number; skipped: number };
                        toast.success(`Pushed ${data.pushed} grades to Classroom${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}`);
                      } catch (err: any) {
                        toast.error(err.message || 'Failed to push grades to Classroom');
                      } finally {
                        setPushingToClassroom(false);
                      }
                    }}
                    disabled={pushingToClassroom}
                    className="text-xs text-green-400 hover:text-green-300 border border-green-500/20 hover:border-green-500/40 rounded-lg px-3 py-1.5 transition bg-green-500/10 hover:bg-green-500/20 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {pushingToClassroom ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3" aria-hidden="true" />
                    )}
                    {selectedAssessment.classroomLink ? `Push to Classroom (${gradedCount})` : 'Link & Push to Classroom'}
                  </button>
                </div>
              )}

              {!selectedAssessmentId && assessmentAssignments.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <h4 className="text-xs text-[var(--text-muted)] uppercase font-bold tracking-widest mb-2">Grading Progress</h4>
                  {[...assessmentAssignments].sort((a, b) => {
                    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return dateB - dateA;
                  }).map(assignment => {
                    if (!assignment.rubric) return null;
                    const assessmentSubs = submissions.filter(s => s.assignmentId === assignment.id && s.status !== 'STARTED');
                    const uniqueStudents = new Set(assessmentSubs.map(s => s.userId)).size;
                    const gradedStudents = new Set(
                      assessmentSubs.filter(s => s.rubricGrade).map(s => s.userId)
                    ).size;
                    const pct = uniqueStudents > 0 ? Math.round((gradedStudents / uniqueStudents) * 100) : 0;
                    return (
                      <button
                        key={assignment.id}
                        onClick={() => { setSelectedAssessmentId(assignment.id); setGradingStudentId(null); setGradingAttemptId(null); setRubricDraft({}); setAssessmentSearch(''); setAssessmentStatusFilter(''); setAssessmentSectionFilter(''); setIntegrityReport(null); setShowIntegrityPanel(false); setExpandedPairIdx(null); setViewingDraftUserId(null); setDraftResponses(null); }}
                        className="w-full text-left bg-[var(--panel-bg)] hover:bg-[var(--surface-glass-heavy)] border border-[var(--border)] hover:border-[var(--border-strong)] rounded-xl px-4 py-3 transition group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-[var(--text-primary)] group-hover:text-[var(--accent-text)] transition truncate mr-3 flex items-center gap-1.5">
                            {assignment.title}
                            {assignment.classroomLink && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/15 text-green-400 border border-green-500/20 flex-shrink-0" title={`Linked to ${assignment.classroomLink.courseName}`}>GC</span>
                            )}
                          </span>
                          <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap">{assignment.classType}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 bg-[var(--surface-glass-heavy)] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-purple-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`text-[10px] font-bold tabular-nums ${pct === 100 ? 'text-green-400' : 'text-[var(--text-tertiary)]'}`}>{gradedStudents}/{uniqueStudents}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {assessmentAssignments.length === 0 && (
                <div className="text-center py-8 text-[var(--text-muted)] italic mt-4">
                  <Shield className="w-12 h-12 mx-auto mb-2 opacity-20" aria-hidden="true" />
                  No assessments created yet. Toggle &quot;Assessment Mode&quot; in the Resource Editor to create one.
                </div>
              )}
            </div>

            {/* Summary Stats */}
            {selectedAssessmentId && (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4" role="group" aria-label="Assessment summary statistics">
                <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl p-5">
                  <div className="text-3xl font-bold text-[var(--text-primary)]">{avgScore}%</div>
                  <div className="text-sm text-[var(--text-tertiary)] uppercase tracking-wider mt-1">Average Score</div>
                </div>
                <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl p-5">
                  <div className="text-3xl font-bold text-[var(--text-primary)]">{allStudentGroups.length}</div>
                  <div className="text-sm text-[var(--text-tertiary)] uppercase tracking-wider mt-1">Students</div>
                </div>
                <div className={`border rounded-2xl p-5 ${flaggedCount > 0 ? 'bg-amber-900/10 border-amber-500/30' : 'bg-[var(--surface-glass)] border-[var(--border)]'}`}>
                  <div className={`text-3xl font-bold ${flaggedCount > 0 ? 'text-amber-400' : 'text-[var(--text-primary)]'}`}>{flaggedCount}</div>
                  <div className="text-sm text-[var(--text-tertiary)] uppercase tracking-wider mt-1">Auto Flagged</div>
                </div>
                <div className={`border rounded-2xl p-5 ${aiFlaggedCount > 0 ? 'bg-purple-900/10 border-purple-500/30' : 'bg-[var(--surface-glass)] border-[var(--border)]'}`}>
                  <div className={`text-3xl font-bold ${aiFlaggedCount > 0 ? 'text-purple-400' : 'text-[var(--text-primary)]'}`}>{aiFlaggedCount}</div>
                  <div className="text-sm text-[var(--text-tertiary)] uppercase tracking-wider mt-1">AI Flagged</div>
                </div>
                {selectedAssessment?.rubric && (
                  <div className={`border rounded-2xl p-5 ${gradedCount === allStudentGroups.length && allStudentGroups.length > 0 ? 'bg-green-900/10 border-green-500/30' : 'bg-[var(--surface-glass)] border-[var(--border)]'}`}>
                    <div className={`text-3xl font-bold ${gradedCount === allStudentGroups.length && allStudentGroups.length > 0 ? 'text-green-400' : 'text-[var(--text-primary)]'}`}>{gradedCount}/{allStudentGroups.length}</div>
                    <div className="text-sm text-[var(--text-tertiary)] uppercase tracking-wider mt-1">Graded</div>
                  </div>
                )}
                {selectedAssessment?.rubric && aiSuggestedCount > 0 && (
                  <div className="border rounded-2xl p-5 bg-amber-900/10 border-amber-500/30">
                    <div className="text-3xl font-bold text-amber-400 flex items-center gap-2">
                      <Sparkles className="w-6 h-6" aria-hidden="true" />{aiSuggestedCount}
                    </div>
                    <div className="text-sm text-[var(--text-tertiary)] uppercase tracking-wider mt-1">AI Suggested</div>
                    <button
                      disabled={batchAcceptingAI}
                      onClick={async () => {
                        const pending = allStudentGroups.filter(g => g.hasAISuggestion && !g.hasRubricGrade);
                        if (pending.length === 0) return;
                        const confirmed = await confirm({ message: `Accept all ${pending.length} AI-suggested grades? You can still edit them individually later.`, confirmLabel: 'Accept All', variant: 'info' });
                        if (!confirmed) return;
                        setBatchAcceptingAI(true);
                        setBatchAcceptProgress({ done: 0, total: pending.length });
                        const TIER_PERCENTAGES = [0, 55, 65, 85, 100];
                        let accepted = 0;
                        let failed = 0;
                        for (const group of pending) {
                          const sub = group.submissions.find(s => s.aiSuggestedGrade?.status === 'pending_review');
                          if (!sub?.aiSuggestedGrade || !selectedAssessment?.rubric) continue;
                          try {
                            const grades: Record<string, Record<string, RubricSkillGrade>> = {};
                            for (const q of selectedAssessment.rubric.questions) {
                              const aiQ = sub.aiSuggestedGrade.grades[q.id];
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
                            await dataService.acceptAISuggestedGrade(sub.id, rubricGrade, sub.userId, selectedAssessment.title);
                            setAssessmentSubmissions(prev => prev.map(s => s.id === sub.id ? {
                              ...s, rubricGrade, score: pct,
                              aiSuggestedGrade: { ...s.aiSuggestedGrade!, status: 'accepted' as const },
                            } : s));
                            accepted++;
                          } catch (err) {
                            reportError(err, { method: 'batchAcceptAI', submissionId: sub.id });
                            failed++;
                          }
                          setBatchAcceptProgress({ done: accepted + failed, total: pending.length });
                        }
                        setBatchAcceptingAI(false);
                        setBatchAcceptProgress(null);
                        toast.success(`Batch grading complete: ${accepted} accepted${failed > 0 ? `, ${failed} failed` : ''}`);
                      }}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 text-[10px] font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 rounded-lg px-2 py-1.5 transition disabled:opacity-50"
                    >
                      {batchAcceptingAI ? (
                        <><RefreshCw className="w-3 h-3 animate-spin" /> {batchAcceptProgress ? `${batchAcceptProgress.done}/${batchAcceptProgress.total}` : 'Processing...'}</>
                      ) : (
                        <><CheckCircle className="w-3 h-3" /> Accept All AI Grades</>
                      )}
                    </button>
                  </div>
                )}
                {/* In Progress stat */}
                {(() => {
                  const inProgressCount = allStudentGroups.filter(g => g.isInProgress).length;
                  return inProgressCount > 0 ? (
                    <div className="border rounded-2xl p-5 bg-blue-900/10 border-blue-500/30">
                      <div className="text-3xl font-bold text-blue-400">{inProgressCount}</div>
                      <div className="text-sm text-[var(--text-tertiary)] uppercase tracking-wider mt-1">In Progress</div>
                    </div>
                  ) : null;
                })()}
                {/* Has Draft stat */}
                {hasDraftStudents.length > 0 && (
                  <div className="border rounded-2xl p-5 bg-cyan-900/10 border-cyan-500/30">
                    <div className="text-3xl font-bold text-cyan-400">{hasDraftStudents.length}</div>
                    <div className="text-sm text-[var(--text-tertiary)] uppercase tracking-wider mt-1">Has Draft</div>
                  </div>
                )}
                {/* Not Started stat */}
                <div className={`border rounded-2xl p-5 ${notStartedStudents.length > 0 ? 'bg-orange-900/10 border-orange-500/30' : 'bg-[var(--surface-glass)] border-[var(--border)]'}`}>
                  <div className={`text-3xl font-bold ${notStartedStudents.length > 0 ? 'text-orange-400' : 'text-[var(--text-primary)]'}`}>{notStartedStudents.length}</div>
                  <div className="text-sm text-[var(--text-tertiary)] uppercase tracking-wider mt-1">Not Started</div>
                </div>
              </div>
            )}

            {/* Search & Filter Bar */}
            {selectedAssessmentId && (sectionFilteredSubs.length > 0 || notStartedStudents.length > 0) && (
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
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
                <button
                  onClick={() => {
                    if (showIntegrityPanel) {
                      setShowIntegrityPanel(false);
                    } else {
                      const report = analyzeIntegrity(completedSubs, selectedAssessment?.lessonBlocks || []);
                      setIntegrityReport(report);
                      setShowIntegrityPanel(true);
                      setExpandedPairIdx(null);
                    }
                  }}
                  className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl transition whitespace-nowrap ${showIntegrityPanel ? 'bg-amber-500 text-black' : 'bg-amber-600/80 hover:bg-amber-500 text-white'}`}
                >
                  <Fingerprint className="w-3.5 h-3.5" aria-hidden="true" />
                  {showIntegrityPanel ? 'Hide Report' : 'Check Integrity'}
                </button>
              </div>
            )}

            {/* Integrity Analysis Report Panel */}
            {showIntegrityPanel && integrityReport && (
              <div className="bg-amber-900/10 border border-amber-500/20 rounded-3xl p-6 backdrop-blur-md space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                    <Fingerprint className="w-5 h-5" aria-hidden="true" />
                    Integrity Analysis
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                    <span>{integrityReport.totalStudents} students</span>
                    <span className="text-[var(--text-muted)]">&bull;</span>
                    <span>{integrityReport.pairsAnalyzed} pairs compared</span>
                    <span className="text-[var(--text-muted)]">&bull;</span>
                    <span>{new Date(integrityReport.analyzedAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                {integrityReport.flaggedPairs.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400 opacity-40" aria-hidden="true" />
                    <p className="text-sm text-green-400 font-bold">No suspicious similarity detected</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">All student responses appear to be independently written.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-amber-400/70 font-bold uppercase tracking-widest mb-2">
                      {integrityReport.flaggedPairs.length} suspicious pair{integrityReport.flaggedPairs.length !== 1 ? 's' : ''} found
                    </div>
                    {integrityReport.flaggedPairs.map((pair, idx) => {
                      const isHigh = pair.overallSimilarity >= 90;
                      const isExpanded = expandedPairIdx === idx;
                      return (
                        <div key={idx} className={`border rounded-2xl overflow-hidden transition ${isHigh ? 'bg-red-900/10 border-red-500/20' : 'bg-amber-900/10 border-amber-500/15'}`}>
                          <div
                            className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[var(--surface-glass)] transition"
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedPairIdx(isExpanded ? null : idx)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedPairIdx(isExpanded ? null : idx); } }}
                          >
                            <div className={`px-2 py-1 rounded-lg text-xs font-bold ${isHigh ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                              {pair.overallSimilarity > 0 ? `${pair.overallSimilarity}%` : 'MC'}
                            </div>
                            <div className="flex-1 text-sm text-[var(--text-primary)]">
                              <span className="font-bold">{pair.studentA.userName}</span>
                              <span className="text-[var(--text-muted)] mx-2">&harr;</span>
                              <span className="font-bold">{pair.studentB.userName}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
                              {pair.flaggedBlocks.length > 0 && (
                                <span>{pair.flaggedBlocks.length} similar response{pair.flaggedBlocks.length !== 1 ? 's' : ''}</span>
                              )}
                              {pair.mcMatchCount > 0 && (
                                <span className="text-amber-400">{pair.mcMatchCount}/{pair.mcTotalWrong} shared wrong MC</span>
                              )}
                            </div>
                            <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>

                          {isExpanded && (
                            <div className="border-t border-[var(--border)] p-4 space-y-3 bg-[var(--panel-bg)]">
                              {pair.flaggedBlocks.length > 0 ? pair.flaggedBlocks.map((block, bi) => (
                                <div key={bi} className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${block.similarity >= 90 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                      {block.similarity}%
                                    </span>
                                    <span className="text-xs text-[var(--text-tertiary)]">{block.question.length > 120 ? block.question.slice(0, 120) + '...' : block.question}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-[var(--surface-glass)] rounded-lg p-3">
                                      <div className="text-xs text-[var(--text-tertiary)] font-bold mb-1">{pair.studentA.userName}</div>
                                      <div className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words">{block.textA}</div>
                                    </div>
                                    <div className="bg-[var(--surface-glass)] rounded-lg p-3">
                                      <div className="text-xs text-[var(--text-tertiary)] font-bold mb-1">{pair.studentB.userName}</div>
                                      <div className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words">{block.textB}</div>
                                    </div>
                                  </div>
                                </div>
                              )) : (
                                <div className="text-xs text-[var(--text-muted)] italic">
                                  Flagged based on shared wrong MC answers only &mdash; no comparable text responses.
                                </div>
                              )}
                              {pair.mcMatchCount > 0 && (
                                <div className="mt-2 bg-amber-900/20 border border-amber-500/10 rounded-lg p-3 text-xs text-amber-400/80">
                                  <span className="font-bold">MC Pattern:</span> {pair.mcMatchCount} of {pair.mcTotalWrong} incorrect MC answers are identical between these students.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 3-Panel Grading View (unified student list) */}
            {selectedAssessmentId && unifiedList.length > 0 && (() => {
              const computeTotalTime = (sub: Submission) => {
                if (sub.submittedAt && sub.metrics?.startTime) {
                  return Math.round((new Date(sub.submittedAt).getTime() - sub.metrics.startTime) / 1000);
                }
                return sub.metrics?.engagementTime || 0;
              };

              // Resolve the selected student group and submission
              const selectedGroup = studentGroups.find(g => g.userId === gradingStudentId) || null;
              const selectedSub = selectedGroup
                ? (selectedGroup.submissions.find(s => s.id === gradingAttemptId) || selectedGroup.best)
                : null;
              // Navigation index is based on unified list
              const selectedUnifiedId = gradingStudentId || viewingDraftUserId;
              const currentUnifiedIndex = selectedUnifiedId ? unifiedList.findIndex(e => getUnifiedId(e) === selectedUnifiedId) : -1;

              const selectStudent = (userId: string) => {
                const group = studentGroups.find(g => g.userId === userId);
                if (!group) return;
                setViewingDraftUserId(null);
                setDraftResponses(null);
                setGradingStudentId(userId);
                setGradingAttemptId(group.best.id);
                // Pre-populate from existing rubric grade, or from AI suggestion if available
                if (group.best.rubricGrade?.grades) {
                  setRubricDraft(group.best.rubricGrade.grades);
                  setFeedbackDraft(group.best.rubricGrade?.teacherFeedback || '');
                } else if (group.best.aiSuggestedGrade?.status === 'pending_review') {
                  // Convert AI suggestions to rubric draft format
                  const aiDraft: Record<string, Record<string, RubricSkillGrade>> = {};
                  for (const [qId, skills] of Object.entries(group.best.aiSuggestedGrade.grades)) {
                    aiDraft[qId] = {};
                    for (const [sId, sg] of Object.entries(skills)) {
                      aiDraft[qId][sId] = {
                        selectedTier: sg.suggestedTier,
                        percentage: sg.percentage,
                      };
                    }
                  }
                  setRubricDraft(aiDraft);
                  setFeedbackDraft('');
                } else {
                  setRubricDraft({});
                  setFeedbackDraft('');
                }
              };

              const selectDraftStudent = async (studentId: string) => {
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
              };

              const selectNotStartedStudent = (studentId: string) => {
                setGradingStudentId(null);
                setGradingAttemptId(null);
                setRubricDraft({});
                setFeedbackDraft('');
                setViewingDraftUserId(studentId);
                setDraftResponses(null);
              };

              const navigateUnified = (delta: number) => {
                const nextIdx = currentUnifiedIndex + delta;
                if (nextIdx < 0 || nextIdx >= unifiedList.length) return;
                const entry = unifiedList[nextIdx];
                if (entry.type === 'submitted') selectStudent(entry.group.userId);
                else if (entry.type === 'draft') selectDraftStudent(entry.student.id);
                else selectNotStartedStudent(entry.student.id);
              };

              return (
              <div
                className="flex flex-col lg:flex-row gap-0 bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl overflow-hidden backdrop-blur-md"
                onKeyDown={(e) => {
                  // Keyboard navigation: arrow keys when not focused on input/select/textarea
                  const tag = (e.target as HTMLElement).tagName;
                  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
                  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); navigateUnified(-1); }
                  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); navigateUnified(1); }
                }}
                tabIndex={0}
              >
                {/* Left Panel: Student List Sidebar */}
                <div className="w-full lg:w-[250px] lg:min-w-[250px] border-b lg:border-b-0 lg:border-r border-[var(--border)] flex flex-col">
                  <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-glass)]">
                    <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest">Students</h4>
                    <span className="text-xs text-[var(--text-muted)]">
                      {studentGroups.length} submitted
                      {hasDraftStudents.length > 0 && <span className="text-cyan-400"> · {hasDraftStudents.length} draft{hasDraftStudents.length !== 1 ? 's' : ''}</span>}
                      {notStartedStudents.length > 0 && <span className="text-orange-400"> · {notStartedStudents.length} not started</span>}
                    </span>
                  </div>
                  <div className="flex items-center border-b border-[var(--border)] bg-[var(--surface-glass)]">
                    {([['name', 'Name'], ['score', 'Score'], ['submitted', 'Time'], ['attempt', '#']] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => {
                          if (assessmentSortKey === key) setAssessmentSortDesc(d => !d);
                          else { setAssessmentSortKey(key); setAssessmentSortDesc(key === 'submitted' || key === 'score'); }
                        }}
                        className={`flex-1 text-center py-1.5 min-h-[44px] text-[9px] font-bold uppercase tracking-wider transition hover:bg-[var(--surface-glass)] ${assessmentSortKey === key ? 'text-purple-400' : 'text-[var(--text-muted)] hover:text-[var(--text-tertiary)]'}`}
                      >
                        {label}
                        {assessmentSortKey === key && (
                          <span className="ml-0.5">{assessmentSortDesc ? '\u25BE' : '\u25B4'}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(100vh - 420px)' }}>
                    {unifiedList.map(entry => {
                      const entryId = getUnifiedId(entry);
                      const entryName = getUnifiedName(entry);
                      const isSelected = entryId === gradingStudentId || entryId === viewingDraftUserId;

                      if (entry.type === 'submitted') {
                        const group = entry.group;
                        const bestPct = group.best.flaggedAsAI ? 0 : getEffectiveScore(group.best);
                        const bestGradedPct = group.bestGraded ? group.bestGraded.rubricGrade!.overallPercentage : null;
                        const displayPct = bestGradedPct != null ? bestGradedPct : bestPct;

                        return (
                          <div
                            key={entryId}
                            role="button"
                            tabIndex={0}
                            aria-label={`${group.userName}${group.hasRubricGrade ? ', graded' : ', ungraded'}${group.isInProgress ? ', in progress' : `, ${displayPct}%`}`}
                            onClick={() => selectStudent(group.userId)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStudent(group.userId); } }}
                            className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer transition border-b border-[var(--border)] focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset focus-visible:outline-none ${
                              isSelected ? 'bg-purple-500/15 border-l-2 border-l-purple-500' : 'hover:bg-[var(--surface-glass)] border-l-2 border-l-transparent'
                            } ${group.latest.flaggedAsAI ? 'bg-purple-900/5' : ''}`}
                          >
                            <div className="shrink-0">
                              {group.hasRubricGrade ? (
                                <CheckCircle className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full border border-[var(--border-strong)] bg-transparent" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-bold truncate ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                                  {group.userName}
                                </span>
                                {group.latest.flaggedAsAI && <Bot className="w-3 h-3 text-purple-400 shrink-0" aria-hidden="true" />}
                                {group.hasAISuggestion && !group.hasRubricGrade && (
                                  <Sparkles className="w-3 h-3 text-amber-400 shrink-0" aria-label="AI suggested grade — needs review" />
                                )}
                                {group.latest.status === 'FLAGGED' && !group.latest.flaggedAsAI && (
                                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" aria-hidden="true" />
                                )}
                                {group.attemptCount > 1 && (
                                  <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded shrink-0" aria-label={`Resubmitted ${group.attemptCount} attempts`}>
                                    ×{group.attemptCount}
                                  </span>
                                )}
                                {group.isInProgress && (
                                  <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded shrink-0">
                                    IN PROGRESS
                                  </span>
                                )}
                                {group.latest.status === 'RETURNED' && (
                                  <span className="text-[9px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded shrink-0">
                                    RETURNED
                                  </span>
                                )}
                                {group.attemptCount > 1 && group.latest.submittedAt && (Date.now() - new Date(group.latest.submittedAt).getTime() < 24 * 60 * 60 * 1000) && (
                                  <span className="text-[9px] font-bold bg-cyan-500/20 text-cyan-400 px-1 py-0.5 rounded shrink-0 animate-pulse">NEW</span>
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
                            <span className={`text-[11px] font-bold tabular-nums shrink-0 ${group.isInProgress ? 'text-blue-400' : getScoreColor(displayPct)}`}>
                              {group.isInProgress ? '\u2014' : `${displayPct}%`}
                            </span>
                          </div>
                        );
                      }

                      // Draft or not-started student
                      const student = entry.type === 'draft' ? entry.student : entry.student;
                      const isDraft = entry.type === 'draft';
                      const studentSection = getUserSectionForClass(student, selectedAssessment!.classType);

                      return (
                        <div
                          key={entryId}
                          role="button"
                          tabIndex={0}
                          aria-label={`${entryName}, ${isDraft ? 'has draft' : 'not started'}`}
                          onClick={() => isDraft ? selectDraftStudent(entryId) : selectNotStartedStudent(entryId)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isDraft ? selectDraftStudent(entryId) : selectNotStartedStudent(entryId); } }}
                          className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer transition border-b border-[var(--border)] focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset focus-visible:outline-none ${
                            isSelected
                              ? isDraft ? 'bg-cyan-500/15 border-l-2 border-l-cyan-500' : 'bg-orange-500/10 border-l-2 border-l-orange-500'
                              : 'hover:bg-[var(--surface-glass)] border-l-2 border-l-transparent'
                          }`}
                        >
                          <div className="shrink-0">
                            {isDraft ? (
                              <Eye className="w-3.5 h-3.5 text-cyan-400/60" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-[var(--border)] bg-transparent opacity-30" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-bold truncate ${isSelected ? 'text-[var(--text-primary)]' : isDraft ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}>
                                {entryName}
                              </span>
                              {isDraft ? (
                                <span className="text-[9px] font-bold bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded shrink-0">DRAFT</span>
                              ) : (
                                <span className="text-[9px] font-bold bg-orange-500/15 text-orange-400/70 px-1.5 py-0.5 rounded shrink-0">NOT STARTED</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {studentSection && !assessmentSectionFilter && availableSections.length > 1 && (
                                <span className="text-xs text-[var(--text-muted)]">{studentSection}</span>
                              )}
                              {isDraft && entry.startedAt && (
                                <span className="text-[9px] text-cyan-400/50">started {formatLastSeen(entry.startedAt)}</span>
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] font-bold tabular-nums shrink-0 text-[var(--text-muted)]">
                            —
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Center Panel: Student Work */}
                <div className="flex-1 min-w-0 flex flex-col">
                  {viewingDraftUserId && !selectedGroup ? (() => {
                    const draftStudent = users.find(u => u.id === viewingDraftUserId);
                    const draftStudentName = draftStudent?.name || 'Student';
                    const isNotStarted = !draftUserIds.has(viewingDraftUserId);
                    return (
                      <>
                        <div className={`px-4 py-3 border-b border-[var(--border)] flex items-center gap-3 ${isNotStarted ? 'bg-orange-500/[0.03]' : 'bg-cyan-500/[0.03]'}`}>
                          {/* Prev/Next navigation */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => navigateUnified(-1)}
                              disabled={currentUnifiedIndex <= 0}
                              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-[var(--surface-glass-heavy)] transition disabled:opacity-20 disabled:cursor-not-allowed"
                              aria-label="Previous student"
                            >
                              <ChevronLeft className="w-4 h-4 text-[var(--text-tertiary)]" />
                            </button>
                            <span className="text-xs text-[var(--text-muted)] tabular-nums">{currentUnifiedIndex + 1}/{unifiedList.length}</span>
                            <button
                              onClick={() => navigateUnified(1)}
                              disabled={currentUnifiedIndex >= unifiedList.length - 1}
                              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-[var(--surface-glass-heavy)] transition disabled:opacity-20 disabled:cursor-not-allowed"
                              aria-label="Next student"
                            >
                              <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
                            </button>
                          </div>
                          {isNotStarted ? <Users className="w-4 h-4 text-orange-400" /> : <Eye className="w-4 h-4 text-cyan-400" />}
                          <h4 className="text-sm font-bold text-[var(--text-primary)]">{draftStudentName}</h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isNotStarted ? 'bg-orange-500/20 text-orange-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                            {isNotStarted ? 'NOT STARTED' : 'DRAFT'}
                          </span>
                          {!isNotStarted && (
                            <div className="ml-auto flex items-center gap-2">
                              <button
                                onClick={async () => {
                                  try {
                                    await dataService.createAnnouncement({
                                      title: 'Assessment Reminder',
                                      content: `Reminder: You started "${selectedAssessment!.title}" but haven't submitted yet. Please finish and submit your work.`,
                                      classType: selectedAssessment!.classType,
                                      priority: 'INFO',
                                      createdAt: new Date().toISOString(),
                                      createdBy: 'Admin',
                                      targetStudentIds: [viewingDraftUserId],
                                    });
                                    toast.success(`Reminder sent to ${draftStudentName}`);
                                  } catch {
                                    toast.error('Failed to send reminder');
                                  }
                                }}
                                className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold px-2 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 transition"
                              >
                                Nudge
                              </button>
                              <button
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: 'Submit on Behalf',
                                    message: `This will submit ${draftStudentName}'s current draft work as their assessment attempt. Auto-gradable questions will be scored.`,
                                    confirmLabel: 'Submit Their Work',
                                    variant: 'warning',
                                  });
                                  if (!ok) return;
                                  try {
                                    await callSubmitOnBehalf({ userId: viewingDraftUserId, assignmentId: selectedAssessmentId });
                                    toast.success(`Submitted ${draftStudentName}'s assessment`);
                                  } catch (err) {
                                    reportError(err, { method: 'callSubmitOnBehalf' });
                                    toast.error('Failed to submit on behalf');
                                  }
                                }}
                                className="text-[10px] text-green-400 hover:text-green-300 font-bold px-2 py-1 rounded bg-green-500/10 hover:bg-green-500/20 transition flex items-center gap-0.5"
                              >
                                <Send className="w-3 h-3" /> Submit
                              </button>
                            </div>
                          )}
                          {isNotStarted && (
                            <div className="ml-auto">
                              <button
                                onClick={async () => {
                                  try {
                                    await dataService.createAnnouncement({
                                      title: 'Assessment Reminder',
                                      content: `Reminder: "${selectedAssessment!.title}" is waiting for you. Please complete it soon.`,
                                      classType: selectedAssessment!.classType,
                                      priority: 'INFO',
                                      createdAt: new Date().toISOString(),
                                      createdBy: 'Admin',
                                      targetStudentIds: [viewingDraftUserId],
                                    });
                                    toast.success(`Reminder sent to ${draftStudentName}`);
                                  } catch {
                                    toast.error('Failed to send reminder');
                                  }
                                }}
                                className="text-[10px] text-orange-400 hover:text-orange-300 font-bold px-2 py-1 rounded bg-orange-500/10 hover:bg-orange-500/20 transition"
                              >
                                Nudge
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="overflow-y-auto custom-scrollbar p-4" style={{ maxHeight: 'calc(100vh - 470px)' }}>
                          {draftLoading ? (
                            <div className="flex items-center justify-center py-12">
                              <div className="text-[var(--text-muted)] text-sm">Loading draft...</div>
                            </div>
                          ) : !draftResponses ? (
                            <div className="flex items-center justify-center py-12">
                              <div className="text-center">
                                <FileText className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)] opacity-30" />
                                {isNotStarted ? (
                                  <>
                                    <p className="text-orange-400/80 text-sm font-bold">Not Started</p>
                                    <p className="text-[var(--text-muted)] text-xs mt-1">This student hasn't opened the assessment yet.</p>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-[var(--text-muted)] text-sm">No draft responses found</p>
                                    <p className="text-[var(--text-muted)] text-xs mt-1">The student opened the assessment but may not have answered any questions yet.</p>
                                  </>
                                )}
                              </div>
                            </div>
                          ) : selectedAssessment?.lessonBlocks ? (
                            <div className="space-y-2">
                              {selectedAssessment.lessonBlocks
                                .filter((block: LessonBlock) => ['MC', 'SHORT_ANSWER', 'RANKING', 'SORTING', 'LINKED', 'DRAWING', 'MATH_RESPONSE', 'BAR_CHART'].includes(block.type))
                                .map((block: LessonBlock, qi: number) => {
                                  const rawAnswer = draftResponses[block.id] as Record<string, unknown> | undefined;
                                  const hasAnswer = rawAnswer != null;
                                  let displayAnswer = 'No answer yet';
                                  let richRenderer: React.ReactNode | null = null;

                                  if (hasAnswer) {
                                    if (block.type === 'SHORT_ANSWER') {
                                      displayAnswer = String((rawAnswer as { answer?: string }).answer || 'No answer yet');
                                    } else if (block.type === 'MC') {
                                      const selected = (rawAnswer as { selected?: number }).selected;
                                      displayAnswer = selected != null && block.options ? String(block.options[selected]) : 'No selection';
                                    } else if (block.type === 'RANKING') {
                                      const order = (rawAnswer as { order?: { item: string }[] }).order || [];
                                      displayAnswer = order.map(o => o.item).join(' \u2192 ') || 'No answer yet';
                                    } else if (block.type === 'SORTING') {
                                      const placements = (rawAnswer as { placements?: Record<string, string> }).placements || {};
                                      displayAnswer = Object.values(placements).join(', ') || 'No answer yet';
                                    } else if (block.type === 'DRAWING') {
                                      const elements = (rawAnswer as { elements?: Array<Record<string, unknown>> }).elements || [];
                                      displayAnswer = elements.length > 0 ? `Drawing (${elements.length} element${elements.length !== 1 ? 's' : ''})` : 'No drawing yet';
                                    } else if (block.type === 'MATH_RESPONSE') {
                                      const steps = (rawAnswer as { steps?: Array<{ label: string; latex: string; input?: string }> }).steps || [];
                                      if (steps.length > 0) {
                                        displayAnswer = `Math (${steps.length} step${steps.length !== 1 ? 's' : ''})`;
                                        richRenderer = (
                                          <div className="mt-1 space-y-1">
                                            {steps.map((step, i) => (
                                              <div key={i} className="flex items-start gap-2 bg-[var(--surface-glass)] rounded px-2 py-1">
                                                <span className="text-xs text-[var(--text-tertiary)] font-bold shrink-0 mt-0.5">{step.label}</span>
                                                <span className="text-xs text-[var(--text-secondary)]">{step.input || step.latex || '\u2014'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        );
                                      }
                                    } else if (block.type === 'BAR_CHART') {
                                      const chartData = rawAnswer as { initial?: Array<{ value: number; labelHTML: string }>; delta?: Array<{ value: number; labelHTML: string }>; final?: Array<{ value: number; labelHTML: string }> };
                                      if (chartData.initial) {
                                        const sections = ['initial', 'delta', 'final'] as const;
                                        const nonEmpty = sections.filter(s => chartData[s]?.some(b => b.value !== 0));
                                        displayAnswer = `Bar Chart (${nonEmpty.length > 0 ? nonEmpty.join(', ') : 'empty'})`;
                                      }
                                    } else {
                                      displayAnswer = typeof rawAnswer === 'string' ? rawAnswer : JSON.stringify(rawAnswer);
                                    }
                                  }

                                  return (
                                    <div key={block.id} className={`flex items-start gap-3 p-3 rounded-lg border ${hasAnswer ? 'bg-cyan-900/10 border-cyan-500/20' : 'bg-[var(--surface-glass)] border-[var(--border)]'}`}>
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${hasAnswer ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-500/20 text-[var(--text-muted)]'}`}>
                                        {qi + 1}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs text-[var(--text-secondary)] mb-1">
                                          <span className="font-bold text-[var(--text-tertiary)]">Q{qi + 1}:</span> {block.content.slice(0, 100)}{block.content.length > 100 ? '...' : ''}
                                        </div>
                                        <div className="text-[11px] text-[var(--text-muted)]">
                                          <span className="font-bold">Draft Answer:</span>{' '}
                                          <span className={hasAnswer ? 'text-cyan-400' : 'text-[var(--text-muted)] italic'}>{displayAnswer}</span>
                                        </div>
                                        {richRenderer}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {Object.entries(draftResponses).map(([blockId, answer]) => {
                                const ansObj = answer as Record<string, unknown> | null;
                                const answerText = ansObj != null
                                  ? (typeof ansObj === 'string' ? ansObj : (ansObj.answer as string) || (ansObj.selected != null ? `Option ${ansObj.selected}` : JSON.stringify(ansObj)))
                                  : 'No answer';
                                return (
                                  <div key={blockId} className="flex items-center gap-3 p-2 rounded-lg border bg-cyan-900/10 border-cyan-500/20">
                                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-cyan-500/20 text-cyan-400">?</div>
                                    <span className="text-xs text-[var(--text-tertiary)] font-mono truncate">{blockId.slice(0, 12)}...</span>
                                    <span className="text-xs text-cyan-300 truncate flex-1">{answerText}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })() : !selectedGroup || !selectedSub ? (
                    <div className="flex-1 flex items-center justify-center p-12" style={{ minHeight: 'calc(100vh - 420px)' }}>
                      <div className="text-center">
                        <FileText className="w-16 h-16 mx-auto mb-4 text-[var(--text-muted)] opacity-30" />
                        <p className="text-[var(--text-muted)] text-sm font-bold">Select a student to begin grading</p>
                        <p className="text-[var(--text-muted)] text-xs mt-1">Use the list on the left or arrow keys to navigate</p>
                      </div>
                    </div>
                  ) : (() => {
                    const sub = selectedSub;
                    const tabSwitches = sub.metrics?.tabSwitchCount || 0;
                    const activeTime = sub.metrics?.engagementTime || 0;
                    const totalTime = computeTotalTime(sub);
                    const inactiveTime = Math.max(0, totalTime - activeTime);

                    return (
                      <>
                        {/* Center panel header */}
                        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-glass)] flex items-center gap-3 flex-wrap">
                          {/* Prev/Next navigation */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => navigateUnified(-1)}
                              disabled={currentUnifiedIndex <= 0}
                              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-[var(--surface-glass-heavy)] transition disabled:opacity-20 disabled:cursor-not-allowed"
                              aria-label="Previous student"
                            >
                              <ChevronLeft className="w-4 h-4 text-[var(--text-tertiary)]" />
                            </button>
                            <span className="text-xs text-[var(--text-muted)] tabular-nums">{currentUnifiedIndex + 1}/{unifiedList.length}</span>
                            <button
                              onClick={() => navigateUnified(1)}
                              disabled={currentUnifiedIndex >= unifiedList.length - 1}
                              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-[var(--surface-glass-heavy)] transition disabled:opacity-20 disabled:cursor-not-allowed"
                              aria-label="Next student"
                            >
                              <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
                            </button>
                          </div>

                          {/* Student name */}
                          <h4 className="text-sm font-bold text-[var(--text-primary)]">{selectedGroup.userName}</h4>
                          {selectedGroup.userSection && (
                            <span className="text-xs text-[var(--text-tertiary)] bg-[var(--surface-glass)] px-2 py-0.5 rounded">{selectedGroup.userSection}</span>
                          )}

                          {/* Attempt selector */}
                          {selectedGroup.submissions.length > 1 && (
                            <select
                              aria-label="Select attempt"
                              value={gradingAttemptId || ''}
                              onChange={e => {
                                const newSub = selectedGroup.submissions.find(s => s.id === e.target.value);
                                if (newSub) {
                                  setGradingAttemptId(newSub.id);
                                  setRubricDraft(newSub.rubricGrade?.grades || {});
                                  setFeedbackDraft(newSub.rubricGrade?.teacherFeedback || '');
                                }
                              }}
                              className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-purple-500/50 transition"
                            >
                              {selectedGroup.submissions.map(s => (
                                <option key={s.id} value={s.id}>
                                  Attempt {s.attemptNumber || 1}{s.status === 'RETURNED' ? ' (Returned)' : ''}{s.id === selectedGroup.best.id ? ' (Best)' : ''}{s.rubricGrade ? ` - ${s.rubricGrade.overallPercentage}%` : ''}
                                </option>
                              ))}
                            </select>
                          )}

                          <div className="ml-auto flex items-center gap-2">
                            {/* Metrics badges */}
                            <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                              <span className={getTabSwitchColor(tabSwitches)}>{tabSwitches} tabs</span>
                              <span className="text-green-400">{formatEngagementTime(activeTime)}</span>
                              <span className={inactiveTime > 0 ? 'text-yellow-400' : 'text-[var(--text-muted)]'}>{formatEngagementTime(inactiveTime)} idle</span>
                              <span>{sub.metrics?.pasteCount || 0} pastes</span>
                              {(sub.metrics?.wordCount != null && sub.metrics.wordCount > 0) && (
                                <span className="text-blue-400">{sub.metrics.wordCount} words</span>
                              )}
                              {(sub.metrics?.wordsPerSecond != null && sub.metrics.wordsPerSecond > 0) && (
                                <span className={sub.metrics.wordsPerSecond > 1.5 ? 'text-red-400' : sub.metrics.wordsPerSecond > 0.8 ? 'text-yellow-400' : 'text-green-400'}>{sub.metrics.wordsPerSecond} w/s</span>
                              )}
                            </div>

                            {/* AI Flag button */}
                            {sub.flaggedAsAI ? (
                              <button
                                onClick={async () => {
                                  if (await confirm({ title: 'Remove AI Flag', message: 'Remove AI suspected flag from this submission? The original score and status will be restored.', variant: 'warning' })) {
                                    try {
                                      await dataService.unflagSubmissionAsAI(sub.id);
                                    } catch (err) {
                                      reportError(err, { method: 'unflagSubmissionAsAI' });
                                    }
                                  }
                                }}
                                className="flex items-center gap-1 bg-gray-600 hover:bg-gray-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition"
                              >
                                <Undo2 className="w-3 h-3" />
                                Remove AI Flag
                              </button>
                            ) : (
                              <button
                                onClick={async () => {
                                  if (await confirm({ title: 'Flag AI Suspected', message: `Flag ${sub.userName}'s submission as AI suspected? This will set their score to 0% and notify the student.`, variant: 'danger', confirmLabel: 'Flag as AI' })) {
                                    try {
                                      await dataService.flagSubmissionAsAI(sub.id, 'Admin', sub.userId, selectedAssessment?.title);
                                    } catch (err) {
                                      reportError(err, { method: 'flagSubmissionAsAI' });
                                    }
                                  }
                                }}
                                className="flex items-center gap-1 bg-red-600/80 hover:bg-red-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition"
                              >
                                <Bot className="w-3 h-3" />
                                Flag AI
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Center panel body: per-question breakdown */}
                        <div className="overflow-y-auto custom-scrollbar p-4" style={{ maxHeight: 'calc(100vh - 470px)' }}>
                          {sub.assessmentScore?.perBlock && selectedAssessment?.lessonBlocks ? (
                            <div className="space-y-2">
                              {selectedAssessment.lessonBlocks
                                .filter((block: LessonBlock) => ['MC', 'SHORT_ANSWER', 'RANKING', 'SORTING', 'LINKED', 'DRAWING', 'MATH_RESPONSE', 'BAR_CHART'].includes(block.type))
                                .map((block: LessonBlock, qi: number) => {
                                  const blockResult = sub.assessmentScore?.perBlock?.[block.id];
                                  const rawAnswer = sub.blockResponses?.[block.id] as Record<string, unknown> | undefined;
                                  const isPending = blockResult?.needsReview;

                                  let displayAnswer = 'No answer';
                                  // Rich renderers for non-text block types
                                  let richRenderer: React.ReactNode | null = null;
                                  if (rawAnswer != null) {
                                    if (block.type === 'SHORT_ANSWER') {
                                      displayAnswer = String((rawAnswer as { answer?: string }).answer || 'No answer');
                                    } else if (block.type === 'MC') {
                                      const selected = (rawAnswer as { selected?: number }).selected;
                                      displayAnswer = selected != null && block.options ? String(block.options[selected]) : 'No selection';
                                    } else if (block.type === 'RANKING') {
                                      const order = (rawAnswer as { order?: { item: string }[] }).order || [];
                                      displayAnswer = order.map(o => o.item).join(' \u2192 ') || 'No answer';
                                    } else if (block.type === 'SORTING') {
                                      const placements = (rawAnswer as { placements?: Record<string, string> }).placements || {};
                                      displayAnswer = Object.values(placements).join(', ') || 'No answer';
                                    } else if (block.type === 'DRAWING') {
                                      const elements = (rawAnswer as { elements?: Array<Record<string, unknown>> }).elements || [];
                                      if (elements.length > 0) {
                                        displayAnswer = `Drawing (${elements.length} element${elements.length !== 1 ? 's' : ''})`;
                                        // Compute bounding box from element coordinates (canvas may be wider than 800 on large screens)
                                        let maxX = 800, maxY = block.canvasHeight ?? 400;
                                        for (const el of elements) {
                                          const pts: { x: number; y: number }[] = [];
                                          if (el.type === 'stroke' && Array.isArray(el.points)) pts.push(...(el.points as { x: number; y: number }[]));
                                          if (el.type === 'arrow' || el.type === 'shape') {
                                            if (el.start) pts.push(el.start as { x: number; y: number });
                                            if (el.end) pts.push(el.end as { x: number; y: number });
                                          }
                                          if (el.type === 'text' && el.position) {
                                            const pos = el.position as { x: number; y: number };
                                            const fontSize = Number(el.fontSize || 14);
                                            const textLen = String(el.text || '').length;
                                            // Estimate rendered text width: ~0.6 × fontSize per character
                                            const estWidth = textLen * fontSize * 0.6;
                                            pts.push(pos);
                                            pts.push({ x: pos.x + estWidth, y: pos.y + fontSize });
                                          }
                                          for (const p of pts) {
                                            if (p.x > maxX) maxX = p.x;
                                            if (p.y > maxY) maxY = p.y;
                                          }
                                        }
                                        const vbW = Math.ceil(maxX + 20);
                                        const vbH = Math.ceil(maxY + 20);
                                        // Render SVG preview of drawing elements
                                        richRenderer = (
                                          <svg viewBox={`0 0 ${vbW} ${vbH}`} className="w-full max-w-2xl h-auto bg-white rounded mt-1 border border-[var(--border)]">
                                            {elements.map((el, i) => {
                                              if (el.type === 'arrow') {
                                                const sx = el.start as { x: number; y: number }, ex = el.end as { x: number; y: number };
                                                const markerId = `ah-${block.id}-${i}`;
                                                return (
                                                  <g key={i}>
                                                    <defs><marker id={markerId} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill={String(el.color || '#000')} /></marker></defs>
                                                    <line x1={sx.x} y1={sx.y} x2={ex.x} y2={ex.y} stroke={String(el.color || '#000')} strokeWidth="3" markerEnd={`url(#${markerId})`} />
                                                    {el.label1 ? <text x={(sx.x + ex.x) / 2} y={(sx.y + ex.y) / 2 - 8} textAnchor="middle" fill={String(el.color || '#000')} fontSize="12" fontWeight="bold">{String(el.label1)}</text> : null}
                                                  </g>
                                                );
                                              }
                                              if (el.type === 'stroke') {
                                                const pts = el.points as { x: number; y: number }[];
                                                if (!pts || pts.length < 2) return null;
                                                const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                                                return <path key={i} d={d} stroke={String(el.color || '#000')} strokeWidth={Number(el.width || 2)} fill="none" strokeLinecap="round" />;
                                              }
                                              if (el.type === 'shape') {
                                                const s = el.start as { x: number; y: number }, e = el.end as { x: number; y: number };
                                                if (el.shape === 'circle') {
                                                  const rx = Math.abs(e.x - s.x) / 2, ry = Math.abs(e.y - s.y) / 2;
                                                  return <ellipse key={i} cx={s.x + rx} cy={s.y + ry} rx={rx} ry={ry} stroke={String(el.color || '#000')} strokeWidth={Number(el.width || 2)} fill={String(el.fill || 'none')} fillOpacity={Number(el.fillOpacity || 0)} />;
                                                }
                                                if (el.shape === 'rectangle') return <rect key={i} x={Math.min(s.x, e.x)} y={Math.min(s.y, e.y)} width={Math.abs(e.x - s.x)} height={Math.abs(e.y - s.y)} stroke={String(el.color || '#000')} strokeWidth={Number(el.width || 2)} fill={String(el.fill || 'none')} fillOpacity={Number(el.fillOpacity || 0)} />;
                                                if (el.shape === 'line') return <line key={i} x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={String(el.color || '#000')} strokeWidth={Number(el.width || 2)} />;
                                              }
                                              if (el.type === 'text') {
                                                const pos = el.position as { x: number; y: number };
                                                return <text key={i} x={pos.x} y={pos.y} fill={String(el.color || '#000')} fontSize={Number(el.fontSize || 14)}>{String(el.text || '')}</text>;
                                              }
                                              return null;
                                            })}
                                          </svg>
                                        );
                                      }
                                    } else if (block.type === 'MATH_RESPONSE') {
                                      const steps = (rawAnswer as { steps?: Array<{ label: string; latex: string; input?: string }> }).steps || [];
                                      if (steps.length > 0) {
                                        displayAnswer = `Math (${steps.length} step${steps.length !== 1 ? 's' : ''})`;
                                        richRenderer = (
                                          <div className="mt-1 space-y-1">
                                            {steps.map((step, i) => (
                                              <div key={i} className="flex items-start gap-2 bg-[var(--surface-glass)] rounded px-2 py-1">
                                                <span className="text-xs text-[var(--text-tertiary)] font-bold shrink-0 mt-0.5">{step.label}</span>
                                                {step.latex ? (
                                                  <span className="text-xs text-[var(--text-secondary)]" dangerouslySetInnerHTML={{ __html: (() => { try { return katex.renderToString(step.latex, { throwOnError: false }); } catch { return step.input || step.latex; } })() }} />
                                                ) : (
                                                  <span className="text-xs text-[var(--text-secondary)]">{step.input || '—'}</span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        );
                                      }
                                    } else if (block.type === 'BAR_CHART') {
                                      const chartData = rawAnswer as { initial?: Array<{ value: number; labelHTML: string }>; delta?: Array<{ value: number; labelHTML: string }>; final?: Array<{ value: number; labelHTML: string }> };
                                      if (chartData.initial) {
                                        const sections = ['initial', 'delta', 'final'] as const;
                                        const nonEmpty = sections.filter(s => chartData[s]?.some(b => b.value !== 0));
                                        displayAnswer = `Bar Chart (${nonEmpty.length > 0 ? nonEmpty.join(', ') : 'empty'})`;
                                        richRenderer = (
                                          <div className="mt-1 space-y-1">
                                            {sections.map(section => {
                                              const bars = chartData[section];
                                              if (!bars || bars.every(b => b.value === 0)) return null;
                                              return (
                                                <div key={section} className="bg-[var(--surface-glass)] rounded px-2 py-1">
                                                  <span className="text-xs text-[var(--text-tertiary)] font-bold uppercase">{section}</span>
                                                  <div className="flex gap-2 mt-0.5">
                                                    {bars.map((bar, i) => (
                                                      <div key={i} className="flex flex-col items-center">
                                                        <div className="text-[10px] text-[var(--text-secondary)] font-mono">{bar.value}</div>
                                                        <div
                                                          className="w-6 rounded-t"
                                                          style={{
                                                            height: Math.max(4, Math.abs(bar.value) * 3),
                                                            backgroundColor: bar.value >= 0 ? '#22c55e' : '#ef4444',
                                                            opacity: 0.7,
                                                          }}
                                                        />
                                                        <div className="text-xs text-[var(--text-tertiary)] truncate max-w-[40px]" dangerouslySetInnerHTML={{ __html: bar.labelHTML || `${i + 1}` }} />
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      }
                                    } else {
                                      displayAnswer = typeof rawAnswer === 'string' ? rawAnswer : JSON.stringify(rawAnswer);
                                    }
                                  }

                                  const borderClass = isPending ? 'bg-amber-900/10 border-amber-500/20'
                                    : blockResult?.correct ? 'bg-green-900/10 border-green-500/20'
                                    : 'bg-red-900/10 border-red-500/20';
                                  const iconClass = isPending ? 'bg-amber-500/20 text-amber-400'
                                    : blockResult?.correct ? 'bg-green-500/20 text-green-400'
                                    : 'bg-red-500/20 text-red-400';
                                  const answerColor = isPending ? 'text-amber-400'
                                    : blockResult?.correct ? 'text-green-400'
                                    : 'text-red-400';

                                  return (
                                    <div key={block.id} className={`flex items-start gap-3 p-3 rounded-lg border ${borderClass}`}>
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${iconClass}`}>
                                        {isPending ? <Clock className="w-3.5 h-3.5" /> : blockResult?.correct ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs text-[var(--text-secondary)] mb-1">
                                          <span className="font-bold text-[var(--text-tertiary)]">Q{qi + 1}:</span> {block.content.slice(0, 100)}{block.content.length > 100 ? '...' : ''}
                                        </div>
                                        <div className="text-[11px] text-[var(--text-muted)]">
                                          {isPending ? (
                                            <span className="text-amber-400 font-bold">Pending Review</span>
                                          ) : (
                                            <>
                                              <span className="font-bold">Answer:</span>{' '}
                                              <span className={answerColor}>{displayAnswer}</span>
                                              {!blockResult?.correct && block.type === 'MC' && block.correctAnswer !== undefined && block.options && (
                                                <span className="ml-2 text-green-400/60">
                                                  (Correct: {block.options[block.correctAnswer]})
                                                </span>
                                              )}
                                            </>
                                          )}
                                          {isPending && displayAnswer !== 'No answer' && !richRenderer && (
                                            <div className="mt-1 text-[var(--text-secondary)] bg-[var(--surface-glass)] rounded px-2 py-1.5 whitespace-pre-wrap">{displayAnswer}</div>
                                          )}
                                          {richRenderer}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })
                              }
                            </div>
                          ) : sub.blockResponses ? (
                            <div className="space-y-2">
                              {Object.entries(sub.blockResponses).map(([blockId, answer]) => {
                                const blockResult = sub.assessmentScore?.perBlock?.[blockId];
                                const isPending = blockResult?.needsReview;
                                const ansObj = answer as Record<string, unknown> | null;
                                const answerText = ansObj != null
                                  ? (typeof ansObj === 'string' ? ansObj : (ansObj.answer as string) || (ansObj.selected != null ? `Option ${ansObj.selected}` : JSON.stringify(ansObj)))
                                  : 'No answer';
                                const borderClass = isPending ? 'bg-amber-900/10 border-amber-500/20'
                                  : blockResult?.correct ? 'bg-green-900/10 border-green-500/20'
                                  : blockResult ? 'bg-red-900/10 border-red-500/20'
                                  : 'bg-[var(--surface-glass)] border-white/5';
                                const iconClass = isPending ? 'bg-amber-500/20 text-amber-400'
                                  : blockResult?.correct ? 'bg-green-500/20 text-green-400'
                                  : blockResult ? 'bg-red-500/20 text-red-400'
                                  : 'bg-gray-500/20 text-[var(--text-tertiary)]';
                                return (
                                  <div key={blockId} className={`flex items-center gap-3 p-2 rounded-lg border ${borderClass}`}>
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${iconClass}`}>
                                      {isPending ? <Clock className="w-3 h-3" /> : blockResult?.correct ? <CheckCircle className="w-3 h-3" /> : blockResult ? <AlertTriangle className="w-3 h-3" /> : '?'}
                                    </div>
                                    <span className="text-xs text-[var(--text-tertiary)] font-mono truncate">{blockId.slice(0, 12)}...</span>
                                    <span className="text-xs text-[var(--text-secondary)] truncate flex-1">{answerText}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs text-[var(--text-muted)] italic">No per-question data available for this submission.</div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Right Panel: Draft/Not-Started notice */}
                {viewingDraftUserId && !selectedGroup && (() => {
                  const isNotStartedRight = !draftUserIds.has(viewingDraftUserId);
                  return (
                    <div className="w-full lg:w-[380px] lg:min-w-[380px] border-t lg:border-t-0 lg:border-l border-[var(--border)] flex flex-col">
                      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-glass)]">
                        <h5 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 ${isNotStartedRight ? 'text-orange-400' : 'text-cyan-400'}`}>
                          {isNotStartedRight ? <><Users className="w-3.5 h-3.5" /> Not Started</> : <><Eye className="w-3.5 h-3.5" /> Draft Preview</>}
                        </h5>
                      </div>
                      <div className="flex-1 flex items-center justify-center p-8">
                        <div className="text-center">
                          <FileText className={`w-12 h-12 mx-auto mb-3 ${isNotStartedRight ? 'text-orange-500/20' : 'text-cyan-500/20'}`} />
                          {isNotStartedRight ? (
                            <>
                              <p className="text-orange-400 text-sm font-bold mb-1">Not yet started</p>
                              <p className="text-[var(--text-muted)] text-xs leading-relaxed max-w-[250px]">
                                This student hasn't opened the assessment. Use Nudge to send them a reminder.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-cyan-400 text-sm font-bold mb-1">Draft — not yet submitted</p>
                              <p className="text-[var(--text-muted)] text-xs leading-relaxed max-w-[250px]">
                                This student's work is still in progress. You can nudge them to submit, or submit on their behalf using the header buttons.
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Right Panel: Rubric Grading */}
                {selectedAssessment?.rubric && selectedGroup && selectedSub && (() => {
                  const sub = selectedSub;
                  const TIER_PERCENTAGES = [0, 55, 65, 85, 100];
                  const currentGrades = { ...(sub.rubricGrade?.grades || {}), ...rubricDraft };
                  const rubricPct = calculateRubricPercentage(currentGrades, selectedAssessment.rubric);
                  const isAlreadyGraded = !!sub.rubricGrade;
                  const isReturnedAttempt = sub.status === 'RETURNED';

                  return (
                    <div className="w-full lg:w-[380px] lg:min-w-[380px] border-t lg:border-t-0 lg:border-l border-[var(--border)] flex flex-col">
                      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-glass)]">
                        <h5 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" /> Rubric Grading
                          {isAlreadyGraded && (
                            <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full ml-1">Graded</span>
                          )}
                        </h5>
                      </div>

                      <div className="overflow-y-auto custom-scrollbar flex-1 p-3" style={{ maxHeight: 'calc(100vh - 470px)' }}>
                        {sub.flaggedAsAI && (
                          <div className="mb-3 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center gap-2">
                            <Bot className="w-4 h-4 text-purple-400 shrink-0" />
                            <span className="text-[11px] text-purple-300">AI-flagged. Saving a grade will clear the flag.</span>
                          </div>
                        )}
                        {sub.aiSuggestedGrade?.status === 'pending_review' && !sub.rubricGrade && (
                          <div className="mb-3 p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-lg">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                              <span className="text-[11px] font-bold text-amber-300">AI Suggested — Needs Review</span>
                              <span className="text-[9px] text-amber-400/60 ml-auto">{sub.aiSuggestedGrade.model}</span>
                            </div>
                            <p className="text-[10px] text-amber-400/70 leading-relaxed">
                              Suggested {sub.aiSuggestedGrade.overallPercentage}% by local LLM. Tiers are pre-filled below — review and adjust before saving.
                            </p>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={async () => {
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
                                }}
                                className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-2 py-1 rounded-lg hover:bg-[var(--surface-glass-heavy)] transition"
                              >
                                <X className="w-3 h-3" /> Dismiss
                              </button>
                            </div>
                          </div>
                        )}
                        {isReturnedAttempt && (
                          <div className="mx-3 mt-3 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2">
                            <Undo2 className="w-4 h-4 text-amber-400 shrink-0" />
                            <span className="text-[11px] text-amber-300">This attempt was returned. Grades shown are from the prior review.</span>
                          </div>
                        )}
                        <React.Suspense fallback={<div className="text-xs text-[var(--text-tertiary)]">Loading rubric...</div>}>
                          <RubricViewer
                            rubric={selectedAssessment.rubric}
                            mode="grade"
                            compact
                            rubricGrade={{
                              grades: currentGrades,
                              overallPercentage: rubricPct,
                              gradedAt: sub.rubricGrade?.gradedAt || '',
                              gradedBy: sub.rubricGrade?.gradedBy || '',
                            }}
                            aiSuggestedGrade={sub.aiSuggestedGrade?.status === 'pending_review' && !sub.rubricGrade ? sub.aiSuggestedGrade : undefined}
                            onGradeChange={isReturnedAttempt ? undefined : (questionId, skillId, tierIndex) => {
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
                            }}
                            onAcceptAllAI={sub.aiSuggestedGrade?.status === 'pending_review' && !sub.rubricGrade ? () => {
                              const draft: Record<string, Record<string, RubricSkillGrade>> = {};
                              for (const q of selectedAssessment.rubric!.questions) {
                                const aiQ = sub.aiSuggestedGrade?.grades[q.id];
                                if (!aiQ) continue;
                                draft[q.id] = {};
                                for (const s of q.skills) {
                                  const aiS = aiQ[s.id];
                                  if (aiS) {
                                    draft[q.id][s.id] = {
                                      selectedTier: aiS.suggestedTier,
                                      percentage: TIER_PERCENTAGES[aiS.suggestedTier],
                                    };
                                  }
                                }
                              }
                              setRubricDraft(draft);
                            } : undefined}
                          />
                        </React.Suspense>
                      </div>

                      {/* Teacher feedback */}
                      {!isReturnedAttempt && (
                      <div className="px-4 py-2 border-t border-[var(--border)]">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1 block">Teacher Feedback</label>
                        <textarea
                          value={feedbackDraft}
                          onChange={e => setFeedbackDraft(e.target.value)}
                          placeholder="Optional feedback for the student..."
                          rows={2}
                          className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition resize-none"
                        />
                      </div>
                      )}

                      {/* Save bar — sticky at bottom */}
                      {!isReturnedAttempt && (
                      <div className="border-t border-[var(--border)] p-3 bg-[var(--surface-glass)]">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-[var(--text-tertiary)]">
                            Rubric Score: <span className="font-bold text-[var(--text-primary)] text-sm">{rubricPct}%</span>
                          </div>
                          {/* Return to Student button */}
                          {sub.status !== 'RETURNED' && sub.status !== 'STARTED' && (
                            <button
                              onClick={async () => {
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
                                  toast.error('Failed to return assessment');
                                }
                              }}
                              className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 px-3 py-2 rounded-lg transition"
                            >
                              <Undo2 className="w-3.5 h-3.5" /> Return to Student
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              setIsSavingRubric(true);
                              try {
                                const gradesToSave = { ...currentGrades, ...rubricDraft };
                                const hasAnyGrade = Object.values(gradesToSave).some(
                                  q => Object.keys(q).length > 0
                                );
                                if (!hasAnyGrade) {
                                  toast.error('Select at least one rubric tier before saving.');
                                  return;
                                }
                                const pct = calculateRubricPercentage(gradesToSave, selectedAssessment.rubric!);
                                const rubricGrade: RubricGrade = {
                                  grades: gradesToSave,
                                  overallPercentage: pct,
                                  gradedAt: new Date().toISOString(),
                                  gradedBy: 'Admin',
                                  ...(feedbackDraft.trim() ? { teacherFeedback: feedbackDraft.trim() } : {}),
                                };
                                // Use acceptAISuggestedGrade if this was an AI pre-fill
                                const hadAISuggestion = sub.aiSuggestedGrade?.status === 'pending_review';
                                const result = hadAISuggestion
                                  ? await dataService.acceptAISuggestedGrade(sub.id, rubricGrade, sub.userId, selectedAssessment.title)
                                  : await dataService.saveRubricGrade(sub.id, rubricGrade, sub.userId, selectedAssessment.title);
                                setAssessmentSubmissions(prev => prev.map(s => s.id === sub.id ? {
                                  ...s,
                                  rubricGrade,
                                  score: pct,
                                  ...(hadAISuggestion ? { aiSuggestedGrade: { ...s.aiSuggestedGrade!, status: 'accepted' as const } } : {}),
                                  ...(result.clearedAIFlag ? { flaggedAsAI: false, flaggedAsAIBy: '', flaggedAsAIAt: '', status: 'NORMAL' as const } : {}),
                                } : s));

                                // Record corrections for the feedback loop (fire-and-forget)
                                if (hadAISuggestion && sub.aiSuggestedGrade) {
                                  const corrections: Array<{
                                    assignmentId: string; assignmentTitle: string; submissionId: string;
                                    rubricQuestionId: string; skillId: string; skillText: string;
                                    aiSuggestedTier: number; teacherSelectedTier: number;
                                    aiRationale: string; studentAnswer: string; correctedAt: string; model: string;
                                  }> = [];
                                  for (const q of selectedAssessment.rubric!.questions) {
                                    for (const skill of q.skills) {
                                      const aiGrade = sub.aiSuggestedGrade.grades[q.id]?.[skill.id];
                                      const teacherGrade = gradesToSave[q.id]?.[skill.id];
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
                                  if (corrections.length > 0) {
                                    dataService.saveGradingCorrections(corrections);
                                  }
                                }

                                setRubricDraft({});
                                setFeedbackDraft('');
                                if (result.clearedAIFlag) {
                                  toast.success(`Grade saved: ${pct}% -- AI flag automatically cleared`);
                                } else {
                                  toast.success(`Grade saved: ${pct}%`);
                                }
                              } catch (err) {
                                reportError(err, { method: 'saveRubricGrade' });
                                toast.error('Failed to save grade. Check console for details.');
                              } finally {
                                setIsSavingRubric(false);
                              }
                            }}
                            disabled={isSavingRubric}
                            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition disabled:opacity-50"
                          >
                            {isSavingRubric ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                            {isSavingRubric ? 'Saving...' : isAlreadyGraded ? 'Update Grade' : 'Save Grade'}
                          </button>
                          {/* Grade Next — navigate to next ungraded submitted student (wraps around) */}
                          {(() => {
                            const submittedEntries = unifiedList.filter((e): e is Extract<UnifiedEntry, { type: 'submitted' }> => e.type === 'submitted');
                            const currentSubmittedIdx = submittedEntries.findIndex(e => e.group.userId === gradingStudentId);
                            const nextUngraded = submittedEntries.slice(currentSubmittedIdx + 1).find(e => e.group.needsGrading)
                              || submittedEntries.slice(0, currentSubmittedIdx).find(e => e.group.needsGrading);
                            return nextUngraded ? (
                              <button
                                onClick={() => selectStudent(nextUngraded.group.userId)}
                                className="flex items-center gap-1.5 text-xs font-bold text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 px-3 py-2 rounded-lg transition"
                              >
                                Grade Next <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            ) : null;
                          })()}
                        </div>
                        {isAlreadyGraded && sub.rubricGrade && (
                          <div className="text-xs text-[var(--text-muted)] mt-1.5">
                            Last graded by {sub.rubricGrade.gradedBy} on {new Date(sub.rubricGrade.gradedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              );
            })()}

            {/* Empty state when assessment selected but no submissions */}
            {selectedAssessmentId && completedSubs.length === 0 && (
              <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl p-8 text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)] opacity-30" />
                <p className="text-[var(--text-muted)] text-sm">No submissions yet for this assessment.</p>
              </div>
            )}

            {/* No results from search/filter */}
            {selectedAssessmentId && completedSubs.length > 0 && studentGroups.length === 0 && (
              <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl p-8 text-center">
                <Search className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)] opacity-30" />
                <p className="text-[var(--text-muted)] text-sm">No students match your search or filter.</p>
              </div>
            )}
          </div>
        );
      })()}</FeatureErrorBoundary></div>)}

      {adminTab === 'digest' && (<div role="tabpanel" id="tabpanel-digest" aria-labelledby="tab-digest"><FeatureErrorBoundary feature="Daily Digest">
        <div className="space-y-6">
          <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl p-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-blue-400" aria-hidden="true" />
                Daily Activity Digest
              </h3>
              <button
                disabled={digestGenerating}
                onClick={async () => {
                  setDigestGenerating(true);
                  try {
                    await callTriggerDailyDigest();
                  } catch (err) {
                    reportError(err instanceof Error ? err : new Error(String(err)), { source: 'triggerDailyDigest' });
                  } finally {
                    setDigestGenerating(false);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${digestGenerating ? 'animate-spin' : ''}`} />
                {digestGenerating ? 'Generating...' : 'Generate Now'}
              </button>
            </div>

            {dailyDigests.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-muted)]">
                <Newspaper className="w-12 h-12 mx-auto mb-3 opacity-20" aria-hidden="true" />
                <p className="text-sm font-bold">No digest reports yet</p>
                <p className="text-xs mt-1">Daily digests are generated automatically each morning at 6:30 AM.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dailyDigests.map(digest => (
                  <div key={digest.id} className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
                    {/* Date Header */}
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">
                        {new Date(digest.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      </h4>
                      <span className="text-xs text-[var(--text-tertiary)]">Generated {new Date(digest.generatedAt).toLocaleTimeString()}</span>
                    </div>

                    {/* Summary Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                        <div className="text-2xl font-bold text-green-400">{digest.summary.totalSubmissions}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Submissions</div>
                      </div>
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                        <div className="text-2xl font-bold text-blue-400">{digest.summary.totalResubmissions}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Resubmissions</div>
                      </div>
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                        <div className="text-2xl font-bold text-emerald-400">{digest.summary.totalGraded}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Graded</div>
                      </div>
                      {digest.summary.totalAutoFlagged > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-amber-400">{digest.summary.totalAutoFlagged}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Auto Flagged</div>
                        </div>
                      )}
                      {digest.summary.totalAIFlagged > 0 && (
                        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-purple-400">{digest.summary.totalAIFlagged}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">AI Flagged</div>
                        </div>
                      )}
                      {digest.summary.totalEWSAlerts > 0 && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-red-400">{digest.summary.totalEWSAlerts}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">EWS Alerts</div>
                        </div>
                      )}
                      {digest.summary.totalLevelUps > 0 && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-yellow-400">{digest.summary.totalLevelUps}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Level Ups</div>
                        </div>
                      )}
                      {digest.summary.totalQuestsCompleted > 0 && (
                        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-cyan-400">{digest.summary.totalQuestsCompleted}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Quests Done</div>
                        </div>
                      )}
                      {digest.summary.totalBossDefeated > 0 && (
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-orange-400">{digest.summary.totalBossDefeated}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Bosses Defeated</div>
                        </div>
                      )}
                      {digest.summary.totalNewEnrollments > 0 && (
                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-indigo-400">{digest.summary.totalNewEnrollments}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">New Students</div>
                        </div>
                      )}
                    </div>

                    {/* Event Feed */}
                    {digest.events.length > 0 && (
                      <div className="space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                        <div className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-widest mb-2">Activity Feed</div>
                        {digest.events.map((event, idx) => {
                          const eventColors: Record<string, string> = {
                            SUBMISSION: 'text-green-400',
                            RESUBMISSION: 'text-blue-400',
                            AUTO_FLAGGED: 'text-amber-400',
                            AI_FLAGGED: 'text-purple-400',
                            GRADED: 'text-emerald-400',
                            EWS_ALERT: 'text-red-400',
                            LEVEL_UP: 'text-yellow-400',
                            QUEST_COMPLETED: 'text-cyan-400',
                            BOSS_DEFEATED: 'text-orange-400',
                            NEW_ENROLLMENT: 'text-indigo-400',
                          };
                          const eventLabels: Record<string, string> = {
                            SUBMISSION: 'Submitted',
                            RESUBMISSION: 'Resubmitted',
                            AUTO_FLAGGED: 'Auto Flagged',
                            AI_FLAGGED: 'AI Flagged',
                            GRADED: 'Graded',
                            EWS_ALERT: 'EWS Alert',
                            LEVEL_UP: 'Level Up',
                            QUEST_COMPLETED: 'Quest Done',
                            BOSS_DEFEATED: 'Boss Defeated',
                            NEW_ENROLLMENT: 'Enrolled',
                          };
                          return (
                            <div key={idx} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-[var(--surface-glass)] transition text-xs">
                              <span className={`font-bold text-[10px] uppercase tracking-wider w-24 shrink-0 ${eventColors[event.type] || 'text-[var(--text-tertiary)]'}`}>
                                {eventLabels[event.type] || event.type}
                              </span>
                              <span className="text-[var(--text-secondary)] font-medium truncate">{event.studentName || 'System'}</span>
                              {event.assignmentTitle && (
                                <span className="text-[var(--text-muted)] truncate">{event.assignmentTitle}</span>
                              )}
                              {event.detail && (
                                <span className="text-[var(--text-muted)] text-[10px] shrink-0">{event.detail}</span>
                              )}
                              <span className="text-[var(--text-muted)] text-[10px] ml-auto shrink-0">
                                {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Empty day message */}
                    {digest.events.length === 0 && (
                      <div className="text-center py-4 text-[var(--text-muted)] text-xs italic">No activity recorded for this day.</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </FeatureErrorBoundary></div>)}

      <div className={adminTab === 'dashboard' ? 'space-y-6' : 'hidden'} role="tabpanel" id="tabpanel-dashboard" aria-labelledby="tab-dashboard">
      <FeatureErrorBoundary feature="Dashboard Overview">

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="Total Students" value={totalStudents} icon={<Users className="w-12 h-12" />} color="from-blue-500 to-cyan-400" />
          <StatCard label="Total XP Awarded" value={totalXP.toLocaleString()} icon={<Zap className="w-12 h-12" />} color="from-purple-500 to-pink-500" />
          <StatCard label="Resources Viewed" value={totalResourcesAccessed} icon={<FileText className="w-12 h-12" />} color="from-emerald-500 to-teal-400" />
          <StatCard label="Avg Active Time" value={`${avgTime}m`} icon={<Clock className="w-12 h-12" />} color="from-amber-500 to-orange-400" />
      </div>

      {/* MODERATION SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Flags */}
          <div className={`border rounded-3xl p-6 backdrop-blur-md transition-colors ${flags.length > 0 ? 'bg-red-900/10 border-red-500/30' : 'bg-[var(--surface-glass)] border-[var(--border)]'}`}>
              <div className="flex justify-between items-center mb-6">
                  <h3 className={`text-xl font-bold flex items-center gap-2 ${flags.length > 0 ? 'text-red-400' : 'text-[var(--text-primary)]'}`}>
                      {flags.length > 0 ? <AlertTriangle className="w-5 h-5" aria-hidden="true" /> : <ShieldAlert className="w-5 h-5 text-[var(--text-tertiary)]" aria-hidden="true" />}
                      Moderation Queue
                  </h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${flags.length > 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-green-500/20 text-green-400'}`}>
                      {flags.length > 0 ? `${flags.length} Issues` : 'Secure'}
                  </span>
              </div>
              
              {flags.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-muted)] italic">
                      <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-20" aria-hidden="true" />
                      No active alerts. Comms channels are clear.
                  </div>
              ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                      {flags.map(flag => (
                          <div key={flag.id} className="bg-[var(--panel-bg)] border border-red-500/20 p-3 rounded-xl">
                              <div className="flex justify-between items-start mb-2">
                                  <div>
                                      <div className="text-sm font-bold text-[var(--text-primary)]">{flag.senderName} <span className="text-xs text-[var(--text-muted)] font-normal">in {flag.classType}</span></div>
                                      <div className="text-xs text-red-300 italic mt-1">"{flag.content}"</div>
                                  </div>
                                  <div className="text-xs text-[var(--text-tertiary)] whitespace-nowrap ml-2">
                                      {new Date(flag.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </div>
                              </div>
                              <div className="flex gap-2 mt-2">
                                  <button onClick={async () => { await dataService.resolveFlag(flag.id); if (flag.messageId) await dataService.unflagMessage(flag.messageId).catch(err => reportError(err, { method: 'unflagMessage' })); }} className="flex-1 flex items-center justify-center gap-1 px-2 py-2.5 min-h-[44px] bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 rounded-lg text-[11px] font-bold transition">
                                      <Check className="w-3 h-3" aria-hidden="true" /> Dismiss
                                  </button>
                                  <button onClick={async () => { if (!await confirm({ message: "Delete flagged message and resolve?", confirmLabel: "Delete" })) return; await dataService.resolveFlag(flag.id); if (flag.messageId) await dataService.deleteMessage(flag.messageId).catch(err => reportError(err, { method: 'deleteFlaggedMessage' })); }} className="flex-1 flex items-center justify-center gap-1 px-2 py-2.5 min-h-[44px] bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-400 rounded-lg text-[11px] font-bold transition">
                                      <Trash2 className="w-3 h-3" aria-hidden="true" /> Delete
                                  </button>
                                  <div className="relative">
                                      <button onClick={() => setMuteMenuFlagId(muteMenuFlagId === flag.id ? null : flag.id)} className="flex items-center justify-center gap-1 px-2 py-2.5 min-h-[44px] bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/30 text-orange-400 rounded-lg text-[11px] font-bold transition" aria-label="Mute user" aria-haspopup="menu" aria-expanded={muteMenuFlagId === flag.id}>
                                          <MicOff className="w-3 h-3" aria-hidden="true" />
                                      </button>
                                      {muteMenuFlagId === flag.id && (
                                          <div role="menu" className="absolute bottom-full mb-1 right-0 bg-[var(--surface-overlay)] border border-orange-500/30 rounded-xl p-1 shadow-2xl z-50 animate-in zoom-in-95 whitespace-nowrap" onKeyDown={e => { if (e.key === 'Escape') setMuteMenuFlagId(null); }}>
                                              <div className="text-xs text-[var(--text-tertiary)] px-2 py-1 font-bold uppercase">Mute {flag.senderName}</div>
                                              {MUTE_DURATIONS.map(d => (
                                                  <button key={d.minutes} role="menuitem" onClick={() => handleMuteFromFlag(flag.senderId, d.minutes)} className="block w-full text-left px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-500/20 rounded-lg transition">{d.label}</button>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </div>

          {/* Muted Students */}
          <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl p-6 backdrop-blur-md">
              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
                  <MicOff className="w-5 h-5 text-orange-400" aria-hidden="true" />
                  Silenced Operatives
              </h3>
              
              {mutedStudents.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-muted)] italic">
                      <Users className="w-12 h-12 mx-auto mb-2 opacity-20" aria-hidden="true" />
                      No active silence sanctions.
                  </div>
              ) : (
                  <div className="overflow-x-auto">
                      <table className="w-full text-left">
                          <thead>
                              <tr className="border-b border-[var(--border)] text-[10px] uppercase font-bold text-[var(--text-muted)]">
                                  <th scope="col" className="pb-2">Operative</th>
                                  <th scope="col" className="pb-2">Remaining</th>
                                  <th scope="col" className="pb-2 text-right">Protocol</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                              {mutedStudents.map(s => (
                                  <tr key={s.id} className="group hover:bg-[var(--surface-glass)] transition">
                                      <td className="py-3">
                                          <div className="text-sm font-bold text-[var(--text-primary)]">{s.name}</div>
                                          <div className="text-xs text-[var(--text-tertiary)]">{s.classType}</div>
                                      </td>
                                      <td className="py-3">
                                          <span className="bg-orange-500/20 text-orange-300 px-2 py-1 rounded text-xs font-mono">
                                              {getTimeRemaining(s.mutedUntil!)}
                                          </span>
                                      </td>
                                      <td className="py-3 text-right">
                                          <div className="flex justify-end gap-2">
                                              <button
                                                  onClick={() => handleExtendMute(s.id, s.mutedUntil!)}
                                                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                                                  aria-label="Extend mute 1 hour"
                                              >
                                                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                                              </button>
                                              <button
                                                  onClick={() => handleUnmute(s.id)}
                                                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition"
                                                  aria-label="Unmute user"
                                              >
                                                  <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      </div>

      {/* EARLY WARNING PANEL */}
      <EarlyWarningPanel
        students={students}
        alerts={alerts}
        bucketProfiles={bucketProfiles}
        thresholds={warningThresholds}
        onMessage={(student) => {
          setNudgeTarget({
            studentId: student.id,
            studentName: student.name,
            defaultMessage: 'Your teacher wants to check in with you.',
            classType: student.classType || '',
          });
          setNudgeMessage('Your teacher wants to check in with you.');
          setShowNudgeModal(true);
        }}
        onViewProfile={(student) => {
          setSelectedStudentId(student.id);
        }}
      />

      {/* TELEMETRY BUCKET DISTRIBUTION */}
      {students.length > 0 && (
        <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl p-6 backdrop-blur-md">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" aria-hidden="true" />
              Student Engagement Buckets
            </h3>
            <span className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-widest">
              {students.length} student{students.length !== 1 ? 's' : ''} ({bucketProfiles.length} profiled)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(Object.keys(BUCKET_META) as TelemetryBucket[]).map(bucket => {
              const meta = BUCKET_META[bucket];
              const count = bucketDistribution[bucket];
              return (
                <div key={bucket} className={`border rounded-2xl p-3 ${meta.borderColor} ${meta.bgColor} transition hover:scale-[1.02]`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold ${meta.color}`}>{meta.label}</span>
                    <span className="text-lg font-bold text-[var(--text-primary)]">{count}</span>
                  </div>
                  <p className="text-[9px] text-[var(--text-tertiary)] leading-tight">{meta.description}</p>
                </div>
              );
            })}
          </div>
          {/* At-a-glance bar */}
          {(() => {
            const total = Object.values(bucketDistribution).reduce((a, b) => a + b, 0);
            if (total === 0) return null;
            return (
              <div className="mt-4 flex h-3 rounded-full overflow-hidden bg-[var(--surface-glass)]">
                {(Object.keys(BUCKET_META) as TelemetryBucket[]).map(bucket => {
                  const pct = (bucketDistribution[bucket] / total) * 100;
                  if (pct === 0) return null;
                  const colorMap: Record<string, string> = {
                    THRIVING: 'bg-emerald-500', ON_TRACK: 'bg-blue-500', COASTING: 'bg-yellow-500',
                    SPRINTING: 'bg-orange-500', STRUGGLING: 'bg-purple-500', DISENGAGING: 'bg-red-500',
                    INACTIVE: 'bg-gray-500', COPYING: 'bg-rose-500',
                  };
                  return (
                    <div
                      key={bucket}
                      className={`${colorMap[bucket] || 'bg-gray-500'} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${BUCKET_META[bucket].label}: ${bucketDistribution[bucket]} (${Math.round(pct)}%)`}
                    />
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ANNOUNCEMENTS */}
      <div>
          <AnnouncementManager announcements={announcements} studentIds={students.map(s => s.id)} availableSections={availableSections} />
      </div>

      {/* ENGAGEMENT RANKING TABLE */}
      <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-[var(--text-primary)]">Student Engagement Ranking</h3>

            <button
              onClick={() => setShowBehaviorAward(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition"
            >
              <Award className="w-3.5 h-3.5" aria-hidden="true" /> Quick Award
            </button>
          </div>
          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search students..."
                aria-label="Search students"
                value={engagementSearch}
                onChange={e => setEngagementSearch(e.target.value)}
                className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition"
              />
            </div>
            <select
              aria-label="Filter by engagement bucket"
              value={bucketFilter}
              onChange={e => setBucketFilter(e.target.value as TelemetryBucket | '')}
              className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-purple-500/50"
            >
              <option value="">All Buckets</option>
              {(Object.keys(BUCKET_META) as TelemetryBucket[]).map(b => (
                <option key={b} value={b}>{BUCKET_META[b].label}</option>
              ))}
            </select>
          </div>

          {/* Batch action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 mb-4 p-3 bg-purple-900/30 border border-purple-500/30 rounded-xl animate-in slide-in-from-top-2">
              <span className="text-sm font-bold text-purple-300">{selectedIds.size} selected</span>
              <div className="flex-1" />
              <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-glass-heavy)] hover:bg-[var(--surface-glass-heavy)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg text-xs font-bold transition">
                <Download className="w-3.5 h-3.5" aria-hidden="true" /> Export CSV
              </button>
              <button onClick={() => { setShowBehaviorAward(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/80 hover:bg-amber-500 border border-amber-500/30 text-white rounded-lg text-xs font-bold transition">
                <Zap className="w-3.5 h-3.5" aria-hidden="true" /> Bulk XP
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs transition">Clear</button>
            </div>
          )}

          {/* Header row */}
          <div role="table" aria-label="Student engagement">
          <div role="rowgroup">
          <div className="flex items-center border-b border-[var(--border)] text-[10px] uppercase font-bold text-[var(--text-muted)]" role="row">
            <div className="p-3 w-10 shrink-0" role="columnheader">
              <input type="checkbox" checked={selectedIds.size === sortedStudents.length && sortedStudents.length > 0} onChange={toggleSelectAll} className="accent-purple-500 w-4 h-4 cursor-pointer" aria-label="Select all students" />
            </div>
            <div className="p-3 flex-[2] min-w-0 cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded" role="columnheader" tabIndex={0} aria-sort={sortCol === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} aria-label="Sort by student name" onClick={() => handleSort('name')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('name'); } }}>
              <div className="flex items-center gap-1">
                <span>Student</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === 'name' && sortDir === 'asc' ? 'text-purple-400' : 'text-[var(--text-muted)]'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === 'name' && sortDir === 'desc' ? 'text-purple-400' : 'text-[var(--text-muted)]'} transition`} />
                </span>
              </div>
            </div>
            <div className="p-3 flex-1 cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded" role="columnheader" tabIndex={0} aria-sort={sortCol === 'class' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} aria-label="Sort by class" onClick={() => handleSort('class')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('class'); } }}>
              <div className="flex items-center gap-1">
                <span>Class</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === 'class' && sortDir === 'asc' ? 'text-purple-400' : 'text-[var(--text-muted)]'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === 'class' && sortDir === 'desc' ? 'text-purple-400' : 'text-[var(--text-muted)]'} transition`} />
                </span>
              </div>
            </div>
            <div className="p-3 flex-1 cursor-pointer select-none text-center focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded" role="columnheader" tabIndex={0} aria-sort={sortCol === 'lastSeen' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} aria-label="Sort by last seen" onClick={() => handleSort('lastSeen')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('lastSeen'); } }}>
              <div className="flex items-center gap-1 justify-center">
                <span>Last Seen</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === 'lastSeen' && sortDir === 'asc' ? 'text-purple-400' : 'text-[var(--text-muted)]'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === 'lastSeen' && sortDir === 'desc' ? 'text-purple-400' : 'text-[var(--text-muted)]'} transition`} />
                </span>
              </div>
            </div>
            <div className="p-3 flex-1 cursor-pointer select-none text-center focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded" role="columnheader" tabIndex={0} aria-sort={sortCol === 'time' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} aria-label="Sort by total time" onClick={() => handleSort('time')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('time'); } }}>
              <div className="flex items-center gap-1 justify-center">
                <span>Total Time</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === 'time' && sortDir === 'asc' ? 'text-purple-400' : 'text-[var(--text-muted)]'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === 'time' && sortDir === 'desc' ? 'text-purple-400' : 'text-[var(--text-muted)]'} transition`} />
                </span>
              </div>
            </div>
            <div className="p-3 flex-1 cursor-pointer select-none text-center focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded" role="columnheader" tabIndex={0} aria-sort={sortCol === 'resources' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} aria-label="Sort by resources completed" onClick={() => handleSort('resources')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('resources'); } }}>
              <div className="flex items-center gap-1 justify-center">
                <span>Resources</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === 'resources' && sortDir === 'asc' ? 'text-purple-400' : 'text-[var(--text-muted)]'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === 'resources' && sortDir === 'desc' ? 'text-purple-400' : 'text-[var(--text-muted)]'} transition`} />
                </span>
              </div>
            </div>
            <div className="p-3 flex-1 cursor-pointer select-none text-right focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded" role="columnheader" tabIndex={0} aria-sort={sortCol === 'xp' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} aria-label="Sort by XP" onClick={() => handleSort('xp')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('xp'); } }}>
              <div className="flex items-center gap-1 justify-end">
                <span>XP</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === 'xp' && sortDir === 'asc' ? 'text-purple-400' : 'text-[var(--text-muted)]'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === 'xp' && sortDir === 'desc' ? 'text-purple-400' : 'text-[var(--text-muted)]'} transition`} />
                </span>
              </div>
            </div>
          </div>
          </div>

          {/* Virtualized student rows */}
          <div role="rowgroup">
          <div ref={tableScrollRef} className="max-h-[520px] overflow-y-auto custom-scrollbar">
            <div style={{ height: `${tableVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {tableVirtualizer.getVirtualItems().map(virtualRow => {
                const student = sortedStudents[virtualRow.index];
                const xp = student.gamification?.classXp?.[student.classType || ''] || 0;
                const xpPct = Math.round((xp / maxXP) * 100);
                const lastLogin = student.lastLoginAt;
                const msSinceLogin = lastLogin ? Date.now() - new Date(lastLogin).getTime() : Infinity;
                const lastSeenColor = msSinceLogin < 3600000 ? 'text-green-400'
                  : msSinceLogin < 86400000 ? 'text-yellow-400'
                  : msSinceLogin < Infinity ? 'text-red-400'
                  : 'text-[var(--text-muted)]';
                const activityDot = msSinceLogin < 3600000 ? 'bg-green-500'
                  : msSinceLogin < 86400000 ? 'bg-yellow-500'
                  : msSinceLogin < Infinity ? 'bg-red-500'
                  : 'bg-gray-600';
                const studentAlert = alertsByStudent.get(student.id);
                const riskDot: Record<string, string> = { CRITICAL: 'bg-red-500 animate-pulse', HIGH: 'bg-orange-500', MODERATE: 'bg-yellow-500' };
                const studentBucket = bucketsByStudent.get(student.id);
                const bucketMeta = studentBucket ? BUCKET_META[studentBucket.bucket as TelemetryBucket] : null;
                const isSelected = selectedIds.has(student.id);

                return (
                  <div
                    key={student.id}
                    ref={tableVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    role="row"
                    tabIndex={0}
                    aria-label={`${student.name}, ${student.classType}, ${xp} XP`}
                    className={`absolute top-0 left-0 w-full flex items-center hover:bg-[var(--surface-glass)] transition cursor-pointer border-b border-[var(--border)] focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset focus-visible:outline-none ${studentAlert?.riskLevel === 'CRITICAL' ? 'bg-red-900/5' : ''} ${isSelected ? 'bg-purple-900/10' : ''}`}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                    onClick={() => setSelectedStudentId(student.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStudentId(student.id); } }}
                  >
                    <div className="p-3 w-10 shrink-0" role="cell">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(student.id)} onClick={e => e.stopPropagation()} className="accent-purple-500 w-4 h-4 cursor-pointer" aria-label={`Select ${student.name}`} />
                    </div>
                    <div className="p-3 font-bold text-[var(--text-primary)] flex-[2] min-w-0" role="cell">
                      <div className="flex items-center gap-2">
                        <div className="relative shrink-0">
                          {student.avatarUrl ? (
                            <img src={student.avatarUrl} alt={student.name} loading="lazy" className="w-8 h-8 rounded-full border border-[var(--border)] object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-xs">{student.name.charAt(0)}</div>
                          )}
                          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--surface-base)] ${activityDot}`} aria-label={msSinceLogin < 3600000 ? 'Active' : msSinceLogin < 86400000 ? 'Idle' : msSinceLogin < Infinity ? 'Inactive' : 'Never seen'} />
                        </div>
                        <span className="truncate max-w-[120px]">{student.name}</span>
                        {studentAlert && riskDot[studentAlert.riskLevel] && (
                          <span className={`w-2 h-2 rounded-full shrink-0 ${riskDot[studentAlert.riskLevel]}`} title={`${studentAlert.riskLevel} risk: ${studentAlert.reason}`} aria-label={`${studentAlert.riskLevel} risk`} />
                        )}
                        {bucketMeta && (
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${bucketMeta.bgColor} ${bucketMeta.color} border ${bucketMeta.borderColor}`} title={bucketMeta.description}>{bucketMeta.label}</span>
                        )}
                      </div>
                    </div>
                    <div className="p-3 text-sm text-[var(--text-tertiary)] flex-1" role="cell">{student.classType}</div>
                    <div className={`p-3 text-center text-xs font-mono flex-1 ${lastSeenColor}`} role="cell">{formatLastSeen(student.lastLoginAt)}</div>
                    <div className="p-3 text-center text-[var(--text-primary)] flex-1" role="cell">{student.stats?.totalTime || 0}m</div>
                    <div className="p-3 text-center text-[var(--text-primary)] flex-1" role="cell">{student.stats?.problemsCompleted || 0}</div>
                    <div className="p-3 text-right flex-1" role="cell">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-[var(--surface-glass-heavy)] rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 rounded-full transition-all" role="progressbar" aria-valuenow={xpPct} aria-valuemin={0} aria-valuemax={100} aria-label="XP progress" style={{ width: `${xpPct}%` }} />
                        </div>
                        <span className="text-purple-400 font-bold text-sm min-w-[3rem] text-right">{xp}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
          </div>
      </div>

      </FeatureErrorBoundary>
      </div>

      {/* STUDENT DETAIL DRAWER */}
      {selectedStudentId && (() => {
        const liveStudent = students.find(s => s.id === selectedStudentId);
        if (!liveStudent) return null;
        return (
          <StudentDetailDrawer
            student={liveStudent}
            submissions={submissions.filter(s => s.userId === selectedStudentId)}
            assignments={assignments}
            bucketProfiles={bucketProfiles.filter(bp => bp.studentId === selectedStudentId)}
            onClose={() => setSelectedStudentId(null)}
          />
        );
      })()}

      {/* Behavior Quick-Award Modal */}
      <BehaviorQuickAward
        students={students}
        isOpen={showBehaviorAward}
        onClose={() => setShowBehaviorAward(false)}
      />

      {/* Google Classroom Link Modal */}
      {classroomLinkModalOpen && selectedAssessmentId && (() => {
        const assignmentForModal = assignments.find(a => a.id === selectedAssessmentId);
        if (!assignmentForModal) return null;
        return (
          <ClassroomLinkModal
            isOpen={classroomLinkModalOpen}
            onClose={() => setClassroomLinkModalOpen(false)}
            assignment={assignmentForModal}
            onLinked={async (link) => {
              toast.success(`Linked to ${link.courseName} — ${link.courseWorkTitle}`);
              // Auto-push grades after linking
              setPushingToClassroom(true);
              try {
                const accessToken = await getClassroomAccessToken();
                const result = await callClassroomPushGrades({ accessToken, assignmentId: selectedAssessmentId });
                const data = result.data as { pushed: number; skipped: number };
                toast.success(`Pushed ${data.pushed} grades to Classroom${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}`);
              } catch (err: any) {
                toast.error(err.message || 'Failed to push grades after linking');
              } finally {
                setPushingToClassroom(false);
              }
            }}
            onUnlinked={() => {
              toast.success('Unlinked from Google Classroom');
            }}
          />
        );
      })()}

      {/* EWS Nudge Modal */}
      {showNudgeModal && nudgeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--backdrop)] backdrop-blur-sm"
          onClick={() => setShowNudgeModal(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowNudgeModal(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nudge-modal-title"
            className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="nudge-modal-title" className="text-lg font-bold text-[var(--text-primary)] mb-1">
              Send Nudge to {nudgeTarget.studentName}
            </h3>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">This sends a private notification only visible to this student.</p>
            <textarea
              ref={(el) => { if (el) el.focus(); }}
              aria-label="Nudge message"
              className="w-full bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl p-3 text-sm text-[var(--text-secondary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              rows={4}
              value={nudgeMessage}
              onChange={(e) => setNudgeMessage(e.target.value)}
              placeholder="Write a message..."
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowNudgeModal(false)}
                className="px-4 py-2 bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] border border-[var(--border)] text-[var(--text-secondary)] rounded-xl text-sm font-bold transition"
              >
                Cancel
              </button>
              <button
                disabled={nudgeSending || !nudgeMessage.trim()}
                onClick={async () => {
                  setNudgeSending(true);
                  try {
                    await dataService.createAnnouncement({
                      title: 'Check-in from your teacher',
                      content: nudgeMessage.trim(),
                      classType: nudgeTarget.classType,
                      priority: 'INFO',
                      createdAt: new Date().toISOString(),
                      createdBy: 'Admin',
                      targetStudentIds: [nudgeTarget.studentId],
                    });
                    toast.success(`Nudge sent to ${nudgeTarget.studentName}`);
                    setShowNudgeModal(false);
                    setNudgeTarget(null);
                    setNudgeMessage('');
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to send nudge');
                    reportError(err, { context: 'EWS nudge send' });
                  } finally {
                    setNudgeSending(false);
                  }
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition flex items-center gap-2"
              >
                {nudgeSending && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Nudge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
