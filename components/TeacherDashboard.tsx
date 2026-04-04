
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { User, Announcement, Assignment, Submission, StudentAlert, StudentBucketProfile, TelemetryBucket } from '../types';
import { Users, Clock, FileText, Zap, ChevronUp, ChevronDown, Activity, Search, Award, Loader2, BarChart3, Download } from 'lucide-react';
import AnalyticsTab from './dashboard/AnalyticsTab';
import { dataService } from '../services/dataService';
import { BUCKET_META } from '../lib/telemetry';
import { reportError } from '../lib/errorReporting';
import { FeatureErrorBoundary } from './ErrorBoundary';
import { useToast } from './ToastProvider';
import AnnouncementManager from './AnnouncementManager';
import StudentDetailDrawer from './StudentDetailDrawer';
import BehaviorQuickAward from './BehaviorQuickAward';
import EarlyWarningPanel from './teacher/EarlyWarningPanel';
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
  const [sortCol, setSortCol] = useState<string>('xp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [engagementSearch, setEngagementSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState<TelemetryBucket | ''>('');
  const [showBehaviorAward, setShowBehaviorAward] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adminTab, setAdminTab] = useState<'dashboard' | 'analytics'>('dashboard');
  const tableScrollRef = useRef<HTMLDivElement>(null);
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
      const unsubAnnouncements = dataService.subscribeToAnnouncements(setAnnouncements);
      const unsubAlerts = dataService.subscribeToStudentAlerts(setAlerts);
      const unsubBuckets = dataService.subscribeToStudentBuckets(setBucketProfiles);
      return () => {
          unsubAnnouncements();
          unsubAlerts();
          unsubBuckets();
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
        </div>
      </div>

      {adminTab === 'analytics' && (
        <div role="tabpanel" id="tabpanel-analytics" aria-labelledby="tab-analytics"><FeatureErrorBoundary feature="Analytics Tab">
          <AnalyticsTab users={users} assignments={assignments} submissions={submissions} bucketProfiles={bucketProfiles} />
        </FeatureErrorBoundary></div>
      )}



      <div className={adminTab === 'dashboard' ? 'space-y-6' : 'hidden'} role="tabpanel" id="tabpanel-dashboard" aria-labelledby="tab-dashboard">
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
