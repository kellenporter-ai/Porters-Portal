
import React, { useEffect, useState, useMemo } from 'react';
import { User, Announcement, Assignment, Submission, StudentAlert, StudentBucketProfile, BugReport, SongRequest } from '../types';
import { Users, Clock, FileText, Zap, Activity, Loader2, BarChart3 } from 'lucide-react';
import AnalyticsTab from './dashboard/AnalyticsTab';
import { dataService } from '../services/dataService';
import { reportError } from '../lib/errorReporting';
import { FeatureErrorBoundary } from './ErrorBoundary';
import { useToast } from './ToastProvider';
import AnnouncementManager from './AnnouncementManager';
import StudentDetailDrawer from './StudentDetailDrawer';
import BehaviorQuickAward from './BehaviorQuickAward';
import EarlyWarningPanel from './teacher/EarlyWarningPanel';
import ActivityMonitor from './teacher/ActivityMonitor';
import BugReportsTab from './teacher/BugReportsTab';
import SongQueueTab from './teacher/SongQueueTab';
import EngagementSummary from './teacher/EngagementSummary';
import { useClassConfig } from '../lib/AppDataContext';

interface TeacherDashboardProps {
  users: User[];
  assignments?: Assignment[];
  submissions?: Submission[];
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ users, assignments = [], submissions = [] }) => {
  const toast = useToast();
  const { classConfigs } = useClassConfig();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [alerts, setAlerts] = useState<StudentAlert[]>([]);
  const [bucketProfiles, setBucketProfiles] = useState<StudentBucketProfile[]>([]);
  const [activeSessions, setActiveSessions] = useState<Map<string, { assignmentId: string; assignmentTitle: string; startedAt: string }>>(new Map());
  const [showBehaviorAward, setShowBehaviorAward] = useState(false);
  const [adminTab, setAdminTab] = useState<'dashboard' | 'analytics'>('dashboard');
  const [overviewTab, setOverviewTab] = useState<'alerts' | 'announcements' | 'students' | 'bugs' | 'songs'>('alerts');
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [songRequests, setSongRequests] = useState<SongRequest[]>([]);
  const [showNudgeModal, setShowNudgeModal] = useState(false);
  const [nudgeTarget, setNudgeTarget] = useState<{ studentId: string; studentName: string; defaultMessage: string; classType: string } | null>(null);
  const [nudgeMessage, setNudgeMessage] = useState('');
  const [nudgeSending, setNudgeSending] = useState(false);

  useEffect(() => {
      const unsubAnnouncements = dataService.subscribeToAnnouncements(setAnnouncements);
      const unsubAlerts = dataService.subscribeToStudentAlerts(setAlerts);
      const unsubBuckets = dataService.subscribeToStudentBuckets(setBucketProfiles);
      const unsubSessions = dataService.subscribeToActiveAssessmentSessions(setActiveSessions);
      const unsubBugs = dataService.subscribeToBugReports(setBugReports);
      const unsubSongs = dataService.subscribeToSongRequests(setSongRequests);
      return () => {
          unsubAnnouncements();
          unsubAlerts();
          unsubBuckets();
          unsubSessions();
          unsubBugs();
          unsubSongs();
      };
  }, []);

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

  // Badge counts for sub-tabs
  const flaggedCount = useMemo(() => alertsByStudent.size, [alertsByStudent]);
  const activeAnnouncementCount = useMemo(() => announcements.length, [announcements]);
  const unresolvedBugCount = useMemo(() => bugReports.filter(r => !r.resolved).length, [bugReports]);
  const pendingSongCount = useMemo(() => songRequests.filter(r => r.status === 'pending').length, [songRequests]);

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
        </div>
      </div>

      {adminTab === 'analytics' && (
        <div role="tabpanel" id="tabpanel-analytics" aria-labelledby="tab-analytics"><FeatureErrorBoundary feature="Analytics Tab">
          <AnalyticsTab users={users} assignments={assignments} submissions={submissions} bucketProfiles={bucketProfiles} />
        </FeatureErrorBoundary></div>
      )}




      <div className={adminTab === 'dashboard' ? 'space-y-3' : 'hidden'} role="tabpanel" id="tabpanel-dashboard" aria-labelledby="tab-dashboard">
      <FeatureErrorBoundary feature="Dashboard Overview">

      {/* STAT STRIP */}
      <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-2xl px-6 flex items-center gap-6 h-12" role="group" aria-label="Class overview statistics">
        <div className="flex items-center gap-2 shrink-0">
          <Users className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
          <span className="text-lg font-bold text-[var(--text)]">{totalStudents}</span>
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Students</span>
        </div>
        <div className="w-px h-5 bg-[var(--border)] shrink-0" />
        <div className="flex items-center gap-2 shrink-0">
          <Zap className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
          <span className="text-lg font-bold text-[var(--text)]">{totalXP.toLocaleString()}</span>
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">XP Awarded</span>
        </div>
        <div className="w-px h-5 bg-[var(--border)] shrink-0" />
        <div className="flex items-center gap-2 shrink-0">
          <FileText className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
          <span className="text-lg font-bold text-[var(--text)]">{totalResourcesAccessed}</span>
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Resources Viewed</span>
        </div>
        <div className="w-px h-5 bg-[var(--border)] shrink-0" />
        <div className="flex items-center gap-2 shrink-0">
          <Clock className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
          <span className="text-lg font-bold text-[var(--text)]">{avgTime}m</span>
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Avg Active Time</span>
        </div>
      </div>

      {/* OVERVIEW SUB-TABS */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] pb-0" role="tablist" aria-label="Overview sections">
        {(
          [
            { key: 'alerts', label: 'Alerts', count: flaggedCount },
            { key: 'announcements', label: 'Announcements', count: activeAnnouncementCount },
            { key: 'students', label: 'Students', count: totalStudents },
            { key: 'bugs', label: 'Bug Reports', count: unresolvedBugCount },
            { key: 'songs', label: 'Song Queue', count: pendingSongCount },
          ] as { key: 'alerts' | 'announcements' | 'students' | 'bugs' | 'songs'; label: string; count: number }[]
        ).map(({ key, label, count }) => (
          <button
            key={key}
            role="tab"
            aria-selected={overviewTab === key}
            onClick={() => setOverviewTab(key)}
            className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition rounded-t-lg -mb-px border-b-2 ${
              overviewTab === key
                ? 'text-[var(--text)] border-purple-500'
                : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text)] hover:border-[var(--border)]'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                overviewTab === key
                  ? key === 'bugs' ? 'bg-red-600/30 text-red-300'
                    : key === 'songs' ? 'bg-amber-600/30 text-amber-300'
                    : 'bg-purple-600/30 text-purple-300'
                  : key === 'bugs' ? 'bg-red-500/20 text-red-400'
                    : key === 'songs' ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-[var(--surface-glass)] text-[var(--text-muted)]'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* OVERVIEW CONTENT AREA */}
      {overviewTab === 'alerts' && (
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
      )}

      {overviewTab === 'announcements' && (
        <AnnouncementManager announcements={announcements} studentIds={students.map(s => s.id)} availableSections={availableSections} />
      )}

      {overviewTab === 'students' && (
        <>
        <EngagementSummary submissions={submissions} />
        <ActivityMonitor
          students={students}
          activeSessions={activeSessions}
          assignments={assignments}
          submissions={submissions}
          bucketsByStudent={bucketsByStudent}
          alertsByStudent={alertsByStudent}
          onViewProfile={(student) => setSelectedStudentId(student.id)}
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
          onAward={() => setShowBehaviorAward(true)}
        />
        </>
      )}

      {overviewTab === 'bugs' && (
        <BugReportsTab bugReports={bugReports} />
      )}
      {overviewTab === 'songs' && (
        <SongQueueTab songRequests={songRequests} />
      )}

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
