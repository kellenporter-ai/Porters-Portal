
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { User, ChatFlag, Announcement, Assignment, Submission, StudentAlert, StudentBucketProfile, TelemetryBucket, LessonBlock, RubricGrade, RubricSkillGrade, getUserSectionForClass, DailyDigest } from '../types';
import { Users, Clock, FileText, Zap, ShieldAlert, CheckCircle, MicOff, AlertTriangle, RefreshCw, Check, Trash2, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, Activity, Search, Award, Download, BarChart3, Shield, BookOpen, Save, Bot, Undo2, Fingerprint, Sparkles, X, Newspaper } from 'lucide-react';
import AnalyticsTab from './dashboard/AnalyticsTab';
import { dataService } from '../services/dataService';
import { callTriggerDailyDigest } from '../lib/firebase';
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

interface TeacherDashboardProps {
  users: User[];
  assignments?: Assignment[];
  submissions?: Submission[];
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ users, assignments = [], submissions = [] }) => {
  const { confirm } = useConfirm();
  const toast = useToast();
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
  const [assessmentSortKey] = useState<string>('score');
  const [assessmentSortDesc] = useState(true);
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
  const [showNotStarted, setShowNotStarted] = useState(false);
  const [batchAcceptingAI, setBatchAcceptingAI] = useState(false);
  const [batchAcceptProgress, setBatchAcceptProgress] = useState<{ done: number; total: number } | null>(null);

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

  const students = useMemo(() => users.filter(u => u.role === 'STUDENT'), [users]);
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
    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-all duration-300">
      <div className={`absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity ${color}`}>
        {icon}
      </div>
      <div className="relative z-10">
        <div className="text-4xl font-bold text-white mb-2">{value}</div>
        <div className="text-sm font-medium text-gray-400 uppercase tracking-wider">{label}</div>
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
            <h1 className="text-3xl font-bold text-white mb-2">Teacher Dashboard</h1>
            <p className="text-gray-400">Engagement analytics and operational overview.</p>
        </div>
        <div className="flex bg-black/30 rounded-xl p-1 border border-white/10">
          <button onClick={() => setAdminTab('dashboard')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${adminTab === 'dashboard' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Activity className="w-3.5 h-3.5" /> Overview
          </button>
          <button onClick={() => setAdminTab('analytics')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${adminTab === 'analytics' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <BarChart3 className="w-3.5 h-3.5" /> Analytics
          </button>
          <button onClick={() => setAdminTab('assessments')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${adminTab === 'assessments' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Shield className="w-3.5 h-3.5" /> Assessments
          </button>
          <button onClick={() => setAdminTab('digest')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${adminTab === 'digest' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Newspaper className="w-3.5 h-3.5" /> Daily Digest
          </button>
        </div>
      </div>

      {adminTab === 'analytics' && (
        <FeatureErrorBoundary feature="Analytics Tab">
          <AnalyticsTab users={users} assignments={assignments} submissions={submissions} bucketProfiles={bucketProfiles} />
        </FeatureErrorBoundary>
      )}

      {adminTab === 'assessments' && (<FeatureErrorBoundary feature="Assessments Tab">{(() => {
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
        const notStartedStudents = enrolledFiltered.filter(s => !submittedUserIds.has(s.id));

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
            case 'status': av = a.latest.status; bv = b.latest.status; return assessmentSortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
            default: av = getEffectiveScore(a.best); bv = getEffectiveScore(b.best); break;
          }
          return assessmentSortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
        });

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
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-400" />
                  Assessment Review
                </h3>
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
                  {assessmentAssignments.length} assessment{assessmentAssignments.length !== 1 ? 's' : ''}
                </span>
              </div>

              <select
                value={selectedAssessmentId || ''}
                onChange={e => { setSelectedAssessmentId(e.target.value || null); setGradingStudentId(null); setGradingAttemptId(null); setRubricDraft({}); setFeedbackDraft(''); setAssessmentSearch(''); setAssessmentStatusFilter(''); setAssessmentSectionFilter(''); setIntegrityReport(null); setShowIntegrityPanel(false); setExpandedPairIdx(null); setShowNotStarted(false); }}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 transition"
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
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
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
                  <label className="text-xs text-gray-400 whitespace-nowrap">Max pts:</label>
                  <input
                    type="number"
                    min={1}
                    value={csvMaxPoints}
                    onChange={e => setCsvMaxPoints(Math.max(1, Number(e.target.value) || 1))}
                    className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50"
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
                    className="text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition bg-white/5 hover:bg-white/10 flex items-center gap-1.5"
                  >
                    <Download className="w-3 h-3" />
                    Export Grades ({gradedCount})
                  </button>
                </div>
              )}

              {!selectedAssessmentId && assessmentAssignments.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <h4 className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-2">Grading Progress</h4>
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
                        onClick={() => { setSelectedAssessmentId(assignment.id); setGradingStudentId(null); setGradingAttemptId(null); setRubricDraft({}); setAssessmentSearch(''); setAssessmentStatusFilter(''); setAssessmentSectionFilter(''); setIntegrityReport(null); setShowIntegrityPanel(false); setExpandedPairIdx(null); setShowNotStarted(false); }}
                        className="w-full text-left bg-black/20 hover:bg-black/30 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 transition group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-white group-hover:text-purple-300 transition truncate mr-3">
                            {assignment.title}
                          </span>
                          <span className="text-[10px] text-gray-500 whitespace-nowrap">{assignment.classType}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-purple-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`text-[10px] font-bold tabular-nums ${pct === 100 ? 'text-green-400' : 'text-gray-400'}`}>{gradedStudents}/{uniqueStudents}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {assessmentAssignments.length === 0 && (
                <div className="text-center py-8 text-gray-500 italic mt-4">
                  <Shield className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  No assessments created yet. Toggle &quot;Assessment Mode&quot; in the Resource Editor to create one.
                </div>
              )}
            </div>

            {/* Summary Stats */}
            {selectedAssessmentId && (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <div className="text-3xl font-bold text-white">{avgScore}%</div>
                  <div className="text-sm text-gray-400 uppercase tracking-wider mt-1">Average Score</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <div className="text-3xl font-bold text-white">{allStudentGroups.length}</div>
                  <div className="text-sm text-gray-400 uppercase tracking-wider mt-1">Students</div>
                </div>
                <div className={`border rounded-2xl p-5 ${flaggedCount > 0 ? 'bg-amber-900/10 border-amber-500/30' : 'bg-white/5 border-white/10'}`}>
                  <div className={`text-3xl font-bold ${flaggedCount > 0 ? 'text-amber-400' : 'text-white'}`}>{flaggedCount}</div>
                  <div className="text-sm text-gray-400 uppercase tracking-wider mt-1">Auto Flagged</div>
                </div>
                <div className={`border rounded-2xl p-5 ${aiFlaggedCount > 0 ? 'bg-purple-900/10 border-purple-500/30' : 'bg-white/5 border-white/10'}`}>
                  <div className={`text-3xl font-bold ${aiFlaggedCount > 0 ? 'text-purple-400' : 'text-white'}`}>{aiFlaggedCount}</div>
                  <div className="text-sm text-gray-400 uppercase tracking-wider mt-1">AI Flagged</div>
                </div>
                {selectedAssessment?.rubric && (
                  <div className={`border rounded-2xl p-5 ${gradedCount === allStudentGroups.length && allStudentGroups.length > 0 ? 'bg-green-900/10 border-green-500/30' : 'bg-white/5 border-white/10'}`}>
                    <div className={`text-3xl font-bold ${gradedCount === allStudentGroups.length && allStudentGroups.length > 0 ? 'text-green-400' : 'text-white'}`}>{gradedCount}/{allStudentGroups.length}</div>
                    <div className="text-sm text-gray-400 uppercase tracking-wider mt-1">Graded</div>
                  </div>
                )}
                {selectedAssessment?.rubric && aiSuggestedCount > 0 && (
                  <div className="border rounded-2xl p-5 bg-amber-900/10 border-amber-500/30">
                    <div className="text-3xl font-bold text-amber-400 flex items-center gap-2">
                      <Sparkles className="w-6 h-6" />{aiSuggestedCount}
                    </div>
                    <div className="text-sm text-gray-400 uppercase tracking-wider mt-1">AI Suggested</div>
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
                      <div className="text-sm text-gray-400 uppercase tracking-wider mt-1">In Progress</div>
                    </div>
                  ) : null;
                })()}
                {/* Not Started stat */}
                <div className={`border rounded-2xl p-5 ${notStartedStudents.length > 0 ? 'bg-orange-900/10 border-orange-500/30' : 'bg-white/5 border-white/10'}`}>
                  <div className={`text-3xl font-bold ${notStartedStudents.length > 0 ? 'text-orange-400' : 'text-white'}`}>{notStartedStudents.length}</div>
                  <div className="text-sm text-gray-400 uppercase tracking-wider mt-1">Not Started</div>
                </div>
              </div>
            )}

            {/* Search & Filter Bar */}
            {selectedAssessmentId && (sectionFilteredSubs.length > 0 || notStartedStudents.length > 0) && (
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={assessmentSearch}
                    onChange={e => setAssessmentSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition"
                  />
                </div>
                <select
                  value={assessmentStatusFilter}
                  onChange={e => setAssessmentStatusFilter(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition"
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
                    value={assessmentSectionFilter}
                    onChange={e => setAssessmentSectionFilter(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition"
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
                  <Fingerprint className="w-3.5 h-3.5" />
                  {showIntegrityPanel ? 'Hide Report' : 'Check Integrity'}
                </button>
              </div>
            )}

            {/* Integrity Analysis Report Panel */}
            {showIntegrityPanel && integrityReport && (
              <div className="bg-amber-900/10 border border-amber-500/20 rounded-3xl p-6 backdrop-blur-md space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                    <Fingerprint className="w-5 h-5" />
                    Integrity Analysis
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{integrityReport.totalStudents} students</span>
                    <span className="text-gray-600">&bull;</span>
                    <span>{integrityReport.pairsAnalyzed} pairs compared</span>
                    <span className="text-gray-600">&bull;</span>
                    <span>{new Date(integrityReport.analyzedAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                {integrityReport.flaggedPairs.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400 opacity-40" />
                    <p className="text-sm text-green-400 font-bold">No suspicious similarity detected</p>
                    <p className="text-xs text-gray-500 mt-1">All student responses appear to be independently written.</p>
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
                            className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/5 transition"
                            onClick={() => setExpandedPairIdx(isExpanded ? null : idx)}
                          >
                            <div className={`px-2 py-1 rounded-lg text-xs font-bold ${isHigh ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                              {pair.overallSimilarity > 0 ? `${pair.overallSimilarity}%` : 'MC'}
                            </div>
                            <div className="flex-1 text-sm text-white">
                              <span className="font-bold">{pair.studentA.userName}</span>
                              <span className="text-gray-500 mx-2">&harr;</span>
                              <span className="font-bold">{pair.studentB.userName}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-gray-400">
                              {pair.flaggedBlocks.length > 0 && (
                                <span>{pair.flaggedBlocks.length} similar response{pair.flaggedBlocks.length !== 1 ? 's' : ''}</span>
                              )}
                              {pair.mcMatchCount > 0 && (
                                <span className="text-amber-400">{pair.mcMatchCount}/{pair.mcTotalWrong} shared wrong MC</span>
                              )}
                            </div>
                            <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>

                          {isExpanded && (
                            <div className="border-t border-white/5 p-4 space-y-3 bg-black/20">
                              {pair.flaggedBlocks.length > 0 ? pair.flaggedBlocks.map((block, bi) => (
                                <div key={bi} className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${block.similarity >= 90 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                      {block.similarity}%
                                    </span>
                                    <span className="text-xs text-gray-400">{block.question.length > 120 ? block.question.slice(0, 120) + '...' : block.question}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-white/5 rounded-lg p-3">
                                      <div className="text-[10px] text-gray-500 font-bold mb-1">{pair.studentA.userName}</div>
                                      <div className="text-xs text-gray-300 whitespace-pre-wrap break-words">{block.textA}</div>
                                    </div>
                                    <div className="bg-white/5 rounded-lg p-3">
                                      <div className="text-[10px] text-gray-500 font-bold mb-1">{pair.studentB.userName}</div>
                                      <div className="text-xs text-gray-300 whitespace-pre-wrap break-words">{block.textB}</div>
                                    </div>
                                  </div>
                                </div>
                              )) : (
                                <div className="text-xs text-gray-500 italic">
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

            {/* Not Started Students Panel */}
            {selectedAssessmentId && notStartedStudents.length > 0 && (
              <div className="bg-orange-900/10 border border-orange-500/20 rounded-2xl p-4">
                <button
                  onClick={() => setShowNotStarted(!showNotStarted)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <h4 className="text-sm font-bold text-orange-400 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Not Started ({notStartedStudents.length})
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await dataService.createAnnouncement({
                            title: 'Assessment Reminder',
                            content: `Reminder: "${selectedAssessment!.title}" hasn't been started yet. Please begin working on it.`,
                            classType: selectedAssessment!.classType,
                            priority: 'WARNING',
                            createdAt: new Date().toISOString(),
                            createdBy: 'Admin',
                            targetStudentIds: notStartedStudents.map(s => s.id),
                          });
                          toast.success(`Reminder sent to ${notStartedStudents.length} student${notStartedStudents.length !== 1 ? 's' : ''}`);
                        } catch {
                          toast.error('Failed to send reminder');
                        }
                      }}
                      className="text-[10px] text-orange-400 hover:text-orange-300 font-bold px-3 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 transition flex items-center gap-1"
                    >
                      <Zap className="w-3 h-3" /> Nudge All
                    </button>
                    {showNotStarted ? <ChevronUp className="w-4 h-4 text-orange-400" /> : <ChevronDown className="w-4 h-4 text-orange-400" />}
                  </div>
                </button>
                {showNotStarted && (
                  <div className="mt-3 space-y-1">
                    {notStartedStudents.map(student => (
                      <div key={student.id} className="flex items-center justify-between px-3 py-2 bg-black/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-300 font-bold">{student.name}</span>
                          {(() => {
                            const sec = getUserSectionForClass(student, selectedAssessment!.classType);
                            return sec && !assessmentSectionFilter ? <span className="text-[9px] text-gray-600">{sec}</span> : null;
                          })()}
                        </div>
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
                                targetStudentIds: [student.id],
                              });
                              toast.success(`Reminder sent for ${student.name}`);
                            } catch {
                              toast.error('Failed to send reminder');
                            }
                          }}
                          className="text-[10px] text-orange-400 hover:text-orange-300 font-bold px-2 py-1 rounded bg-orange-500/10 hover:bg-orange-500/20 transition"
                        >
                          Nudge
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3-Panel Grading View */}
            {selectedAssessmentId && studentGroups.length > 0 && (() => {
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
              const currentStudentIndex = selectedGroup ? studentGroups.indexOf(selectedGroup) : -1;

              const selectStudent = (userId: string) => {
                const group = studentGroups.find(g => g.userId === userId);
                if (!group) return;
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

              const navigateStudent = (delta: number) => {
                const nextIdx = currentStudentIndex + delta;
                if (nextIdx >= 0 && nextIdx < studentGroups.length) {
                  selectStudent(studentGroups[nextIdx].userId);
                }
              };

              return (
              <div
                className="flex flex-col lg:flex-row gap-0 bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md"
                onKeyDown={(e) => {
                  // Keyboard navigation: arrow keys when not focused on input/select/textarea
                  const tag = (e.target as HTMLElement).tagName;
                  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
                  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); navigateStudent(-1); }
                  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); navigateStudent(1); }
                }}
                tabIndex={0}
              >
                {/* Left Panel: Student List Sidebar */}
                <div className="w-full lg:w-[250px] lg:min-w-[250px] border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col">
                  <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02]">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Students</h4>
                    <span className="text-[10px] text-gray-600">{studentGroups.length} result{studentGroups.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(100vh - 420px)' }}>
                    {studentGroups.map(group => {
                      const isSelected = group.userId === gradingStudentId;
                      const bestPct = group.best.flaggedAsAI ? 0 : getEffectiveScore(group.best);
                      const bestGradedPct = group.bestGraded ? group.bestGraded.rubricGrade!.overallPercentage : null;
                      const displayPct = bestGradedPct != null ? bestGradedPct : bestPct;

                      return (
                        <div
                          key={group.userId}
                          role="button"
                          tabIndex={0}
                          aria-label={`${group.userName}${group.hasRubricGrade ? ', graded' : ', ungraded'}${group.isInProgress ? ', in progress' : `, ${displayPct}%`}`}
                          onClick={() => selectStudent(group.userId)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStudent(group.userId); } }}
                          className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer transition border-b border-white/5 focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset focus-visible:outline-none ${
                            isSelected ? 'bg-purple-500/15 border-l-2 border-l-purple-500' : 'hover:bg-white/5 border-l-2 border-l-transparent'
                          } ${group.latest.flaggedAsAI ? 'bg-purple-900/5' : ''}`}
                        >
                          {/* Graded indicator */}
                          <div className="shrink-0">
                            {group.hasRubricGrade ? (
                              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-gray-600 bg-transparent" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                                {group.userName}
                              </span>
                              {group.latest.flaggedAsAI && <Bot className="w-3 h-3 text-purple-400 shrink-0" />}
                              {group.hasAISuggestion && !group.hasRubricGrade && (
                                <Sparkles className="w-3 h-3 text-amber-400 shrink-0" aria-label="AI suggested grade — needs review" />
                              )}
                              {group.latest.status === 'FLAGGED' && !group.latest.flaggedAsAI && (
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
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
                            </div>
                            {group.userSection && !assessmentSectionFilter && availableSections.length > 1 && (
                              <span className="text-[9px] text-gray-600 block">{group.userSection}</span>
                            )}
                          </div>

                          <span className={`text-[11px] font-bold tabular-nums shrink-0 ${group.isInProgress ? 'text-blue-400' : getScoreColor(displayPct)}`}>
                            {group.isInProgress ? '\u2014' : `${displayPct}%`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Center Panel: Student Work */}
                <div className="flex-1 min-w-0 flex flex-col">
                  {!selectedGroup || !selectedSub ? (
                    <div className="flex-1 flex items-center justify-center p-12" style={{ minHeight: 'calc(100vh - 420px)' }}>
                      <div className="text-center">
                        <FileText className="w-16 h-16 mx-auto mb-4 text-gray-700 opacity-30" />
                        <p className="text-gray-500 text-sm font-bold">Select a student to begin grading</p>
                        <p className="text-gray-600 text-xs mt-1">Use the list on the left or arrow keys to navigate</p>
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
                        <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center gap-3 flex-wrap">
                          {/* Prev/Next navigation */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => navigateStudent(-1)}
                              disabled={currentStudentIndex <= 0}
                              className="p-1.5 rounded-lg hover:bg-white/10 transition disabled:opacity-20 disabled:cursor-not-allowed"
                              title="Previous student"
                            >
                              <ChevronLeft className="w-4 h-4 text-gray-400" />
                            </button>
                            <span className="text-[10px] text-gray-600 tabular-nums">{currentStudentIndex + 1}/{studentGroups.length}</span>
                            <button
                              onClick={() => navigateStudent(1)}
                              disabled={currentStudentIndex >= studentGroups.length - 1}
                              className="p-1.5 rounded-lg hover:bg-white/10 transition disabled:opacity-20 disabled:cursor-not-allowed"
                              title="Next student"
                            >
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            </button>
                          </div>

                          {/* Student name */}
                          <h4 className="text-sm font-bold text-white">{selectedGroup.userName}</h4>
                          {selectedGroup.userSection && (
                            <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded">{selectedGroup.userSection}</span>
                          )}

                          {/* Attempt selector */}
                          {selectedGroup.submissions.length > 1 && (
                            <select
                              value={gradingAttemptId || ''}
                              onChange={e => {
                                const newSub = selectedGroup.submissions.find(s => s.id === e.target.value);
                                if (newSub) {
                                  setGradingAttemptId(newSub.id);
                                  setRubricDraft(newSub.rubricGrade?.grades || {});
                                  setFeedbackDraft(newSub.rubricGrade?.teacherFeedback || '');
                                }
                              }}
                              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50 transition"
                            >
                              {selectedGroup.submissions.map(s => (
                                <option key={s.id} value={s.id}>
                                  Attempt {s.attemptNumber || 1}{s.id === selectedGroup.best.id ? ' (Best)' : ''}{s.rubricGrade ? ` - ${s.rubricGrade.overallPercentage}%` : ''}
                                </option>
                              ))}
                            </select>
                          )}

                          <div className="ml-auto flex items-center gap-2">
                            {/* Metrics badges */}
                            <div className="hidden md:flex items-center gap-2 text-[10px] text-gray-500">
                              <span className={getTabSwitchColor(tabSwitches)}>{tabSwitches} tabs</span>
                              <span className="text-green-400">{formatEngagementTime(activeTime)}</span>
                              <span className={inactiveTime > 0 ? 'text-yellow-400' : 'text-gray-600'}>{formatEngagementTime(inactiveTime)} idle</span>
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
                                          <svg viewBox={`0 0 ${vbW} ${vbH}`} className="w-full max-w-2xl h-auto bg-white rounded mt-1 border border-white/10">
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
                                              <div key={i} className="flex items-start gap-2 bg-white/5 rounded px-2 py-1">
                                                <span className="text-[10px] text-gray-500 font-bold shrink-0 mt-0.5">{step.label}</span>
                                                {step.latex ? (
                                                  <span className="text-xs text-gray-200" dangerouslySetInnerHTML={{ __html: (() => { try { return katex.renderToString(step.latex, { throwOnError: false }); } catch { return step.input || step.latex; } })() }} />
                                                ) : (
                                                  <span className="text-xs text-gray-300">{step.input || '—'}</span>
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
                                                <div key={section} className="bg-white/5 rounded px-2 py-1">
                                                  <span className="text-[10px] text-gray-500 font-bold uppercase">{section}</span>
                                                  <div className="flex gap-2 mt-0.5">
                                                    {bars.map((bar, i) => (
                                                      <div key={i} className="flex flex-col items-center">
                                                        <div className="text-[10px] text-gray-300 font-mono">{bar.value}</div>
                                                        <div
                                                          className="w-6 rounded-t"
                                                          style={{
                                                            height: Math.max(4, Math.abs(bar.value) * 3),
                                                            backgroundColor: bar.value >= 0 ? '#22c55e' : '#ef4444',
                                                            opacity: 0.7,
                                                          }}
                                                        />
                                                        <div className="text-[9px] text-gray-500 truncate max-w-[40px]" dangerouslySetInnerHTML={{ __html: bar.labelHTML || `${i + 1}` }} />
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
                                        <div className="text-xs text-gray-300 mb-1">
                                          <span className="font-bold text-gray-400">Q{qi + 1}:</span> {block.content.slice(0, 100)}{block.content.length > 100 ? '...' : ''}
                                        </div>
                                        <div className="text-[11px] text-gray-500">
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
                                            <div className="mt-1 text-gray-300 bg-white/5 rounded px-2 py-1.5 whitespace-pre-wrap">{displayAnswer}</div>
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
                                  : 'bg-white/5 border-white/5';
                                const iconClass = isPending ? 'bg-amber-500/20 text-amber-400'
                                  : blockResult?.correct ? 'bg-green-500/20 text-green-400'
                                  : blockResult ? 'bg-red-500/20 text-red-400'
                                  : 'bg-gray-500/20 text-gray-400';
                                return (
                                  <div key={blockId} className={`flex items-center gap-3 p-2 rounded-lg border ${borderClass}`}>
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${iconClass}`}>
                                      {isPending ? <Clock className="w-3 h-3" /> : blockResult?.correct ? <CheckCircle className="w-3 h-3" /> : blockResult ? <AlertTriangle className="w-3 h-3" /> : '?'}
                                    </div>
                                    <span className="text-xs text-gray-400 font-mono truncate">{blockId.slice(0, 12)}...</span>
                                    <span className="text-xs text-gray-300 truncate flex-1">{answerText}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500 italic">No per-question data available for this submission.</div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Right Panel: Rubric Grading */}
                {selectedAssessment?.rubric && selectedGroup && selectedSub && (() => {
                  const sub = selectedSub;
                  const TIER_PERCENTAGES = [0, 55, 65, 85, 100];
                  const currentGrades = { ...(sub.rubricGrade?.grades || {}), ...rubricDraft };
                  const rubricPct = calculateRubricPercentage(currentGrades, selectedAssessment.rubric);
                  const isAlreadyGraded = !!sub.rubricGrade;

                  return (
                    <div className="w-full lg:w-[380px] lg:min-w-[380px] border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col">
                      <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02]">
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
                                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition"
                              >
                                <X className="w-3 h-3" /> Dismiss
                              </button>
                            </div>
                          </div>
                        )}
                        <React.Suspense fallback={<div className="text-[10px] text-gray-500">Loading rubric...</div>}>
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
                            onGradeChange={(questionId, skillId, tierIndex) => {
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
                      <div className="px-4 py-2 border-t border-white/10">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Teacher Feedback</label>
                        <textarea
                          value={feedbackDraft}
                          onChange={e => setFeedbackDraft(e.target.value)}
                          placeholder="Optional feedback for the student..."
                          rows={2}
                          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition resize-none"
                        />
                      </div>

                      {/* Save bar — sticky at bottom */}
                      <div className="border-t border-white/10 p-3 bg-white/[0.02]">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-400">
                            Rubric Score: <span className="font-bold text-white text-sm">{rubricPct}%</span>
                          </div>
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
                          {/* Grade Next — navigate to next ungraded student */}
                          {(() => {
                            const nextUngraded = studentGroups.find(g => g.needsGrading && g.userId !== gradingStudentId);
                            return nextUngraded ? (
                              <button
                                onClick={() => selectStudent(nextUngraded.userId)}
                                className="flex items-center gap-1.5 text-xs font-bold text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 px-3 py-2 rounded-lg transition"
                              >
                                Grade Next <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            ) : null;
                          })()}
                        </div>
                        {isAlreadyGraded && sub.rubricGrade && (
                          <div className="text-[10px] text-gray-600 mt-1.5">
                            Last graded by {sub.rubricGrade.gradedBy} on {new Date(sub.rubricGrade.gradedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
              );
            })()}

            {/* Empty state when assessment selected but no submissions */}
            {selectedAssessmentId && completedSubs.length === 0 && (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-600 opacity-30" />
                <p className="text-gray-500 text-sm">No submissions yet for this assessment.</p>
              </div>
            )}

            {/* No results from search/filter */}
            {selectedAssessmentId && completedSubs.length > 0 && studentGroups.length === 0 && (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center">
                <Search className="w-12 h-12 mx-auto mb-3 text-gray-600 opacity-30" />
                <p className="text-gray-500 text-sm">No students match your search or filter.</p>
              </div>
            )}
          </div>
        );
      })()}</FeatureErrorBoundary>)}

      {adminTab === 'digest' && (<FeatureErrorBoundary feature="Daily Digest">
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-blue-400" />
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
              <div className="text-center py-12 text-gray-500">
                <Newspaper className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-bold">No digest reports yet</p>
                <p className="text-xs mt-1">Daily digests are generated automatically each morning at 6:30 AM.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dailyDigests.map(digest => (
                  <div key={digest.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                    {/* Date Header */}
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white">
                        {new Date(digest.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      </h4>
                      <span className="text-[10px] text-gray-500">Generated {new Date(digest.generatedAt).toLocaleTimeString()}</span>
                    </div>

                    {/* Summary Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                        <div className="text-2xl font-bold text-green-400">{digest.summary.totalSubmissions}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Submissions</div>
                      </div>
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                        <div className="text-2xl font-bold text-blue-400">{digest.summary.totalResubmissions}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Resubmissions</div>
                      </div>
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                        <div className="text-2xl font-bold text-emerald-400">{digest.summary.totalGraded}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Graded</div>
                      </div>
                      {digest.summary.totalAutoFlagged > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-amber-400">{digest.summary.totalAutoFlagged}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider">Auto Flagged</div>
                        </div>
                      )}
                      {digest.summary.totalAIFlagged > 0 && (
                        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-purple-400">{digest.summary.totalAIFlagged}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider">AI Flagged</div>
                        </div>
                      )}
                      {digest.summary.totalEWSAlerts > 0 && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-red-400">{digest.summary.totalEWSAlerts}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider">EWS Alerts</div>
                        </div>
                      )}
                      {digest.summary.totalLevelUps > 0 && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-yellow-400">{digest.summary.totalLevelUps}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider">Level Ups</div>
                        </div>
                      )}
                      {digest.summary.totalQuestsCompleted > 0 && (
                        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-cyan-400">{digest.summary.totalQuestsCompleted}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider">Quests Done</div>
                        </div>
                      )}
                      {digest.summary.totalBossDefeated > 0 && (
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-orange-400">{digest.summary.totalBossDefeated}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider">Bosses Defeated</div>
                        </div>
                      )}
                      {digest.summary.totalNewEnrollments > 0 && (
                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3">
                          <div className="text-2xl font-bold text-indigo-400">{digest.summary.totalNewEnrollments}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider">New Students</div>
                        </div>
                      )}
                    </div>

                    {/* Event Feed */}
                    {digest.events.length > 0 && (
                      <div className="space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-2">Activity Feed</div>
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
                            <div key={idx} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-white/5 transition text-xs">
                              <span className={`font-bold text-[10px] uppercase tracking-wider w-24 shrink-0 ${eventColors[event.type] || 'text-gray-400'}`}>
                                {eventLabels[event.type] || event.type}
                              </span>
                              <span className="text-gray-300 font-medium truncate">{event.studentName || 'System'}</span>
                              {event.assignmentTitle && (
                                <span className="text-gray-500 truncate">{event.assignmentTitle}</span>
                              )}
                              {event.detail && (
                                <span className="text-gray-600 text-[10px] shrink-0">{event.detail}</span>
                              )}
                              <span className="text-gray-600 text-[10px] ml-auto shrink-0">
                                {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Empty day message */}
                    {digest.events.length === 0 && (
                      <div className="text-center py-4 text-gray-600 text-xs italic">No activity recorded for this day.</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </FeatureErrorBoundary>)}

      <div className={adminTab === 'dashboard' ? '' : 'hidden'}>
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
          <div className={`border rounded-3xl p-6 backdrop-blur-md transition-colors ${flags.length > 0 ? 'bg-red-900/10 border-red-500/30' : 'bg-white/5 border-white/10'}`}>
              <div className="flex justify-between items-center mb-6">
                  <h3 className={`text-xl font-bold flex items-center gap-2 ${flags.length > 0 ? 'text-red-400' : 'text-white'}`}>
                      {flags.length > 0 ? <AlertTriangle className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5 text-gray-400" />}
                      Moderation Queue
                  </h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${flags.length > 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-green-500/20 text-green-400'}`}>
                      {flags.length > 0 ? `${flags.length} Issues` : 'Secure'}
                  </span>
              </div>
              
              {flags.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 italic">
                      <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-20" />
                      No active alerts. Comms channels are clear.
                  </div>
              ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                      {flags.map(flag => (
                          <div key={flag.id} className="bg-black/20 border border-red-500/20 p-3 rounded-xl">
                              <div className="flex justify-between items-start mb-2">
                                  <div>
                                      <div className="text-sm font-bold text-white">{flag.senderName} <span className="text-xs text-gray-500 font-normal">in {flag.classType}</span></div>
                                      <div className="text-xs text-red-300 italic mt-1">"{flag.content}"</div>
                                  </div>
                                  <div className="text-[10px] text-gray-500 whitespace-nowrap ml-2">
                                      {new Date(flag.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </div>
                              </div>
                              <div className="flex gap-2 mt-2">
                                  <button onClick={async () => { await dataService.resolveFlag(flag.id); if (flag.messageId) await dataService.unflagMessage(flag.messageId).catch(err => reportError(err, { method: 'unflagMessage' })); }} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 rounded-lg text-[11px] font-bold transition">
                                      <Check className="w-3 h-3" /> Dismiss
                                  </button>
                                  <button onClick={async () => { if (!await confirm({ message: "Delete flagged message and resolve?", confirmLabel: "Delete" })) return; await dataService.resolveFlag(flag.id); if (flag.messageId) await dataService.deleteMessage(flag.messageId).catch(err => reportError(err, { method: 'deleteFlaggedMessage' })); }} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-400 rounded-lg text-[11px] font-bold transition">
                                      <Trash2 className="w-3 h-3" /> Delete
                                  </button>
                                  <div className="relative">
                                      <button onClick={() => setMuteMenuFlagId(muteMenuFlagId === flag.id ? null : flag.id)} className="flex items-center justify-center gap-1 px-2 py-1.5 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/30 text-orange-400 rounded-lg text-[11px] font-bold transition" aria-label="Mute user">
                                          <MicOff className="w-3 h-3" />
                                      </button>
                                      {muteMenuFlagId === flag.id && (
                                          <div className="absolute bottom-full mb-1 right-0 bg-black/95 border border-orange-500/30 rounded-xl p-1 shadow-2xl z-50 animate-in zoom-in-95 whitespace-nowrap">
                                              <div className="text-[9px] text-gray-500 px-2 py-1 font-bold uppercase">Mute {flag.senderName}</div>
                                              {MUTE_DURATIONS.map(d => (
                                                  <button key={d.minutes} onClick={() => handleMuteFromFlag(flag.senderId, d.minutes)} className="block w-full text-left px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-500/20 rounded-lg transition">{d.label}</button>
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
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <MicOff className="w-5 h-5 text-orange-400" />
                  Silenced Operatives
              </h3>
              
              {mutedStudents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 italic">
                      <Users className="w-12 h-12 mx-auto mb-2 opacity-20" />
                      No active silence sanctions.
                  </div>
              ) : (
                  <div className="overflow-x-auto">
                      <table className="w-full text-left">
                          <thead>
                              <tr className="border-b border-white/10 text-[10px] uppercase font-bold text-gray-500">
                                  <th scope="col" className="pb-2">Operative</th>
                                  <th scope="col" className="pb-2">Remaining</th>
                                  <th scope="col" className="pb-2 text-right">Protocol</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                              {mutedStudents.map(s => (
                                  <tr key={s.id} className="group hover:bg-white/5 transition">
                                      <td className="py-3">
                                          <div className="text-sm font-bold text-white">{s.name}</div>
                                          <div className="text-xs text-gray-400">{s.classType}</div>
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
                                                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition"
                                                  aria-label="Extend mute 1 hour"
                                              >
                                                  <RefreshCw className="w-3.5 h-3.5" />
                                              </button>
                                              <button
                                                  onClick={() => handleUnmute(s.id)}
                                                  className="p-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition"
                                                  aria-label="Unmute user"
                                              >
                                                  <CheckCircle className="w-3.5 h-3.5" />
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

      {/* EARLY WARNING SYSTEM */}
      {alerts.length > 0 && (
        <div className="bg-amber-900/10 border border-amber-500/30 rounded-3xl p-6 backdrop-blur-md">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-amber-400 flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Early Warning System
            </h3>
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-amber-500/20 text-amber-300">
              {alerts.length} Alert{alerts.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar pr-2">
            {alerts.map(alert => {
              const riskColors: Record<string, string> = {
                CRITICAL: 'border-red-500/40 bg-red-900/20',
                HIGH: 'border-orange-500/30 bg-orange-900/10',
                MODERATE: 'border-yellow-500/20 bg-yellow-900/10',
                LOW: 'border-blue-500/20 bg-blue-900/10',
              };
              const riskBadge: Record<string, string> = {
                CRITICAL: 'bg-red-500 text-white',
                HIGH: 'bg-orange-500 text-white',
                MODERATE: 'bg-yellow-500/80 text-black',
                LOW: 'bg-blue-500/60 text-white',
              };
              const bucketInfo = alert.bucket ? BUCKET_META[alert.bucket as TelemetryBucket] : null;
              return (
                <div key={alert.id} className={`border p-4 rounded-xl ${riskColors[alert.riskLevel] || riskColors.LOW}`}>
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${riskBadge[alert.riskLevel] || riskBadge.LOW}`}>
                          {alert.riskLevel}
                        </span>
                        {bucketInfo && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${bucketInfo.bgColor} ${bucketInfo.color} ${bucketInfo.borderColor} border`}>
                            {bucketInfo.label}
                          </span>
                        )}
                        <span className="text-sm font-bold text-white truncate">{alert.studentName}</span>
                        <span className="text-[10px] text-gray-500">{alert.classType}</span>
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">{alert.message}</p>
                      {bucketInfo && (
                        <p className="text-[10px] text-gray-400 mt-1 italic">{bucketInfo.description}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-[10px] text-gray-500">
                        <span>ES: {alert.engagementScore}</span>
                        <span>Class Avg: {alert.classMean}</span>
                        <span>{new Date(alert.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setSelectedStudentId(alert.studentId)}
                        className="px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white rounded-lg text-[11px] font-bold transition"
                      >
                        View
                      </button>
                      <button
                        onClick={async () => { await dataService.dismissAlert(alert.id); }}
                        className="px-2 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 rounded-lg text-[11px] font-bold transition"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TELEMETRY BUCKET DISTRIBUTION */}
      {students.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Student Engagement Buckets
            </h3>
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
              {students.length} student{students.length !== 1 ? 's' : ''} ({bucketProfiles.length} profiled)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(Object.keys(BUCKET_META) as TelemetryBucket[]).map(bucket => {
              const meta = BUCKET_META[bucket];
              const count = bucketDistribution[bucket];
              return (
                <div key={bucket} className={`border rounded-xl p-3 ${meta.borderColor} ${meta.bgColor} transition hover:scale-[1.02]`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold ${meta.color}`}>{meta.label}</span>
                    <span className="text-lg font-bold text-white">{count}</span>
                  </div>
                  <p className="text-[9px] text-gray-400 leading-tight">{meta.description}</p>
                </div>
              );
            })}
          </div>
          {/* At-a-glance bar */}
          {(() => {
            const total = Object.values(bucketDistribution).reduce((a, b) => a + b, 0);
            if (total === 0) return null;
            return (
              <div className="mt-4 flex h-3 rounded-full overflow-hidden bg-white/5">
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
      <div className="mt-8">
          <AnnouncementManager announcements={announcements} studentIds={students.map(s => s.id)} availableSections={availableSections} />
      </div>

      {/* ENGAGEMENT RANKING TABLE */}
      <div className="mt-8 bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">Student Engagement Ranking</h3>
            <button
              onClick={() => setShowBehaviorAward(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition"
            >
              <Award className="w-3.5 h-3.5" /> Quick Award
            </button>
          </div>
          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search students..."
                value={engagementSearch}
                onChange={e => setEngagementSearch(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition"
              />
            </div>
            <select
              value={bucketFilter}
              onChange={e => setBucketFilter(e.target.value as TelemetryBucket | '')}
              className="bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"
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
              <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-lg text-xs font-bold transition">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
              <button onClick={() => { setShowBehaviorAward(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/80 hover:bg-amber-500 border border-amber-500/30 text-white rounded-lg text-xs font-bold transition">
                <Zap className="w-3.5 h-3.5" /> Bulk XP
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-gray-400 hover:text-white text-xs transition">Clear</button>
            </div>
          )}

          {/* Header row */}
          <div className="flex items-center border-b border-white/10 text-[10px] uppercase font-bold text-gray-500" role="row">
            <div className="p-3 w-10 shrink-0" role="columnheader">
              <input type="checkbox" checked={selectedIds.size === sortedStudents.length && sortedStudents.length > 0} onChange={toggleSelectAll} className="accent-purple-500 w-4 h-4 cursor-pointer" aria-label="Select all students" />
            </div>
            <div className="p-3 flex-[2] min-w-0 cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded" role="columnheader" tabIndex={0} aria-sort={sortCol === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} aria-label="Sort by student name" onClick={() => handleSort('name')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('name'); } }}>
              <div className="flex items-center gap-1">
                <span>Student</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === 'name' && sortDir === 'asc' ? 'text-purple-400' : 'text-gray-600'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === 'name' && sortDir === 'desc' ? 'text-purple-400' : 'text-gray-600'} transition`} />
                </span>
              </div>
            </div>
            <div className="p-3 flex-1 cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded" role="columnheader" tabIndex={0} aria-sort={sortCol === 'class' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} aria-label="Sort by class" onClick={() => handleSort('class')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('class'); } }}>
              <div className="flex items-center gap-1">
                <span>Class</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === 'class' && sortDir === 'asc' ? 'text-purple-400' : 'text-gray-600'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === 'class' && sortDir === 'desc' ? 'text-purple-400' : 'text-gray-600'} transition`} />
                </span>
              </div>
            </div>
            <div className="p-3 flex-1 cursor-pointer select-none text-center focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded" role="columnheader" tabIndex={0} aria-sort={sortCol === 'lastSeen' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} aria-label="Sort by last seen" onClick={() => handleSort('lastSeen')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('lastSeen'); } }}>
              <div className="flex items-center gap-1 justify-center">
                <span>Last Seen</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === 'lastSeen' && sortDir === 'asc' ? 'text-purple-400' : 'text-gray-600'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === 'lastSeen' && sortDir === 'desc' ? 'text-purple-400' : 'text-gray-600'} transition`} />
                </span>
              </div>
            </div>
            <div className="p-3 flex-1 cursor-pointer select-none text-center focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded" role="columnheader" tabIndex={0} aria-sort={sortCol === 'time' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} aria-label="Sort by total time" onClick={() => handleSort('time')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('time'); } }}>
              <div className="flex items-center gap-1 justify-center">
                <span>Total Time</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === 'time' && sortDir === 'asc' ? 'text-purple-400' : 'text-gray-600'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === 'time' && sortDir === 'desc' ? 'text-purple-400' : 'text-gray-600'} transition`} />
                </span>
              </div>
            </div>
            <div className="p-3 flex-1 cursor-pointer select-none text-center focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded" role="columnheader" tabIndex={0} aria-sort={sortCol === 'resources' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} aria-label="Sort by resources completed" onClick={() => handleSort('resources')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('resources'); } }}>
              <div className="flex items-center gap-1 justify-center">
                <span>Resources</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === 'resources' && sortDir === 'asc' ? 'text-purple-400' : 'text-gray-600'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === 'resources' && sortDir === 'desc' ? 'text-purple-400' : 'text-gray-600'} transition`} />
                </span>
              </div>
            </div>
            <div className="p-3 flex-1 cursor-pointer select-none text-right focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded" role="columnheader" tabIndex={0} aria-sort={sortCol === 'xp' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} aria-label="Sort by XP" onClick={() => handleSort('xp')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('xp'); } }}>
              <div className="flex items-center gap-1 justify-end">
                <span>XP</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === 'xp' && sortDir === 'asc' ? 'text-purple-400' : 'text-gray-600'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === 'xp' && sortDir === 'desc' ? 'text-purple-400' : 'text-gray-600'} transition`} />
                </span>
              </div>
            </div>
          </div>

          {/* Virtualized student rows */}
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
                  : 'text-gray-500';
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
                    className={`absolute top-0 left-0 w-full flex items-center hover:bg-white/5 transition cursor-pointer border-b border-white/5 focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset focus-visible:outline-none ${studentAlert?.riskLevel === 'CRITICAL' ? 'bg-red-900/5' : ''} ${isSelected ? 'bg-purple-900/10' : ''}`}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                    onClick={() => setSelectedStudentId(student.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStudentId(student.id); } }}
                  >
                    <div className="p-3 w-10 shrink-0" role="cell">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(student.id)} onClick={e => e.stopPropagation()} className="accent-purple-500 w-4 h-4 cursor-pointer" aria-label={`Select ${student.name}`} />
                    </div>
                    <div className="p-3 font-bold text-white flex-[2] min-w-0" role="cell">
                      <div className="flex items-center gap-2">
                        <div className="relative shrink-0">
                          {student.avatarUrl ? (
                            <img src={student.avatarUrl} alt={student.name} loading="lazy" className="w-8 h-8 rounded-full border border-white/10 object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-xs">{student.name.charAt(0)}</div>
                          )}
                          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0f0720] ${activityDot}`} />
                        </div>
                        <span className="truncate max-w-[120px]">{student.name}</span>
                        {studentAlert && riskDot[studentAlert.riskLevel] && (
                          <span className={`w-2 h-2 rounded-full shrink-0 ${riskDot[studentAlert.riskLevel]}`} title={`${studentAlert.riskLevel} risk: ${studentAlert.reason}`} />
                        )}
                        {bucketMeta && (
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${bucketMeta.bgColor} ${bucketMeta.color} border ${bucketMeta.borderColor}`} title={bucketMeta.description}>{bucketMeta.label}</span>
                        )}
                      </div>
                    </div>
                    <div className="p-3 text-sm text-gray-400 flex-1" role="cell">{student.classType}</div>
                    <div className={`p-3 text-center text-xs font-mono flex-1 ${lastSeenColor}`} role="cell">{formatLastSeen(student.lastLoginAt)}</div>
                    <div className="p-3 text-center text-white flex-1" role="cell">{student.stats?.totalTime || 0}m</div>
                    <div className="p-3 text-center text-white flex-1" role="cell">{student.stats?.problemsCompleted || 0}</div>
                    <div className="p-3 text-right flex-1" role="cell">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 rounded-full transition-all" style={{ width: `${xpPct}%` }} />
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
    </div>
  );
};

export default TeacherDashboard;
