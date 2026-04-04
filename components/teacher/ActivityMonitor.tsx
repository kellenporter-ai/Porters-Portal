
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { User, Assignment, Submission, StudentBucketProfile, TelemetryBucket, StudentAlert } from '../../types';
import { Search, Star, MessageSquare, Eye, Download, Zap } from 'lucide-react';
import { BUCKET_META } from '../../lib/telemetry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveSessionEntry {
  assignmentId: string;
  assignmentTitle: string;
  startedAt: string;
}

interface ActivityMonitorProps {
  students: User[];
  activeSessions: Map<string, ActiveSessionEntry>;
  assignments: Assignment[];
  submissions: Submission[];
  bucketsByStudent: Map<string, StudentBucketProfile>;
  alertsByStudent: Map<string, StudentAlert>;
  onViewProfile?: (student: User) => void;
  onMessage?: (student: User) => void;
  /** Called when the user triggers the award flow. The parent opens BehaviorQuickAward; no per-student argument is needed because BehaviorQuickAward has its own search. */
  onAward?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  if (ms < 60_000) return 'Just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Returns timestamp for "most recently active" — max of lastLoginAt and most recent submission */
function lastActiveMs(student: User, submissionsByStudent: Map<string, number>): number {
  const loginTs = student.lastLoginAt ? new Date(student.lastLoginAt).getTime() : 0;
  const subTs = submissionsByStudent.get(student.id) ?? 0;
  return Math.max(loginTs, subTs);
}

function statusDotClass(msSince: number): string {
  if (msSince === 0) return 'bg-gray-600';
  if (msSince < 15 * 60_000) return 'bg-green-500';
  if (msSince < 60 * 60_000) return 'bg-yellow-500';
  return 'bg-red-500';
}

function statusDotLabel(msSince: number): string {
  if (msSince === 0) return 'Never seen';
  if (msSince < 15 * 60_000) return 'Active';
  if (msSince < 60 * 60_000) return 'Recent';
  return 'Inactive';
}

// ─── Component ────────────────────────────────────────────────────────────────

const ActivityMonitor: React.FC<ActivityMonitorProps> = ({
  students,
  activeSessions,
  assignments,
  submissions,
  bucketsByStudent,
  alertsByStudent,
  onViewProfile,
  onMessage,
  onAward,
}) => {
  const [search, setSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState<TelemetryBucket | ''>('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Build assignment id → title map for resolving active session titles
  const assignmentTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) {
      map.set(a.id, a.title);
    }
    return map;
  }, [assignments]);

  // Build most-recent-submission timestamp per student
  const submissionsByStudent = useMemo(() => {
    const map = new Map<string, number>();
    for (const sub of submissions) {
      if (!sub.submittedAt) continue;
      const ts = new Date(sub.submittedAt).getTime();
      const existing = map.get(sub.userId) ?? 0;
      if (ts > existing) map.set(sub.userId, ts);
    }
    return map;
  }, [submissions]);

  // Filtered + sorted list (most recently active first)
  const sortedStudents = useMemo(() => {
    const now = Date.now();
    const filtered = students.filter(s => {
      if (search) {
        const q = search.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
      }
      if (bucketFilter && bucketsByStudent.get(s.id)?.bucket !== bucketFilter) return false;
      if (onlineOnly) {
        const lastTs = lastActiveMs(s, submissionsByStudent);
        if (lastTs === 0 || now - lastTs >= 60 * 60_000) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const aTs = lastActiveMs(a, submissionsByStudent);
      const bTs = lastActiveMs(b, submissionsByStudent);
      return bTs - aTs; // most recent first
    });
  }, [students, search, bucketFilter, onlineOnly, submissionsByStudent, bucketsByStudent]);

  // Batch selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev =>
      prev.size === sortedStudents.length ? new Set() : new Set(sortedStudents.map(s => s.id))
    );
  }, [sortedStudents]);

  const exportCSV = useCallback(() => {
    const now = Date.now();
    const selected = students.filter(s => selectedIds.has(s.id));
    const rows: string[][] = [['Name', 'Email', 'Class', 'Current Activity', 'Last Active']];
    for (const s of selected) {
      const session = activeSessions.get(s.id);
      const activity = session
        ? `Taking: ${session.assignmentTitle || assignmentTitleMap.get(session.assignmentId) || session.assignmentId}`
        : 'Idle';
      const lastTs = lastActiveMs(s, submissionsByStudent);
      const lastActive = lastTs ? relativeTime(now - lastTs) : 'Never';
      rows.push([s.name, s.email, s.classType || '', activity, lastActive]);
    }
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [students, selectedIds, activeSessions, assignmentTitleMap, submissionsByStudent]);

  const virtualizer = useVirtualizer({
    count: sortedStudents.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 52,
    overscan: 15,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const riskDotClasses: Record<string, string> = {
    CRITICAL: 'bg-red-500 animate-pulse',
    HIGH: 'bg-orange-500',
    MODERATE: 'bg-yellow-500',
  };

  return (
    <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-3xl p-6">
      {/* Compact header row: title + search + bucket filter + online only + quick award */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h3 className="text-base font-bold text-[var(--text-primary)] shrink-0 mr-1">Activity Monitor</h3>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search students..."
            aria-label="Search students"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition"
          />
        </div>
        <select
          aria-label="Filter by engagement bucket"
          value={bucketFilter}
          onChange={e => setBucketFilter(e.target.value as TelemetryBucket | '')}
          className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-purple-500/50 shrink-0"
        >
          <option value="">All Buckets</option>
          {(Object.keys(BUCKET_META) as TelemetryBucket[]).map(b => (
            <option key={b} value={b}>{BUCKET_META[b].label}</option>
          ))}
        </select>
        <button
          onClick={() => setOnlineOnly(v => !v)}
          aria-pressed={onlineOnly}
          className={`px-3 py-2 rounded-xl text-sm font-bold border transition shrink-0 ${
            onlineOnly
              ? 'bg-green-500/20 border-green-500/40 text-green-400'
              : 'bg-[var(--panel-bg)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          Online Only
        </button>
        <button
          onClick={() => onAward?.()}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition shrink-0 ml-auto"
          aria-label="Open Quick Award"
        >
          <Star className="w-3.5 h-3.5" aria-hidden="true" /> Quick Award
        </button>
      </div>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-purple-900/30 border border-purple-500/30 rounded-xl animate-in slide-in-from-top-2">
          <span className="text-sm font-bold text-purple-300">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-glass-heavy)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg text-xs font-bold transition hover:opacity-80"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Export CSV
          </button>
          <button
            onClick={() => onAward?.()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/80 hover:bg-amber-500 border border-amber-500/30 text-white rounded-lg text-xs font-bold transition"
          >
            <Zap className="w-3.5 h-3.5" aria-hidden="true" /> Bulk XP
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs transition"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div role="table" aria-label="Student activity monitor">
        {/* Header */}
        <div role="rowgroup">
          <div
            className="flex items-center border-b border-[var(--border)] text-[10px] uppercase font-bold text-[var(--text-muted)]"
            role="row"
          >
            <div className="p-3 w-10 shrink-0" role="columnheader">
              <input
                type="checkbox"
                checked={selectedIds.size === sortedStudents.length && sortedStudents.length > 0}
                onChange={toggleSelectAll}
                className="accent-purple-500 w-4 h-4 cursor-pointer"
                aria-label="Select all students"
              />
            </div>
            {/* status dot column */}
            <div className="p-3 w-6 shrink-0" role="columnheader" aria-label="Status" />
            <div className="p-3 flex-[2] min-w-0" role="columnheader">Student</div>
            <div className="p-3 flex-1" role="columnheader">Class</div>
            <div className="p-3 flex-[2] min-w-0" role="columnheader">Current Activity</div>
            <div className="p-3 flex-1 text-right" role="columnheader">Last Active</div>
            <div className="p-3 w-28 shrink-0 text-right" role="columnheader">Actions</div>
          </div>
        </div>

        {/* Virtualized rows */}
        <div role="rowgroup">
          <div ref={tableScrollRef} className="max-h-[520px] overflow-y-auto custom-scrollbar">
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              {virtualizer.getVirtualItems().map(virtualRow => {
                const student = sortedStudents[virtualRow.index];
                const now = Date.now();
                const lastTs = lastActiveMs(student, submissionsByStudent);
                const msSince = lastTs ? now - lastTs : 0;
                const dotClass = statusDotClass(msSince);
                const dotLabel = statusDotLabel(msSince);
                const lastActiveLabel = lastTs ? relativeTime(msSince) : 'Never';

                const session = activeSessions.get(student.id);
                let activityText = '';
                let activityTitle = '';
                if (session) {
                  activityTitle = session.assignmentTitle || assignmentTitleMap.get(session.assignmentId) || session.assignmentId;
                  activityText = `Taking: ${activityTitle}`;
                }

                const studentAlert = alertsByStudent.get(student.id);
                const studentBucket = bucketsByStudent.get(student.id);
                const bucketMeta = studentBucket ? BUCKET_META[studentBucket.bucket as TelemetryBucket] : null;
                const isSelected = selectedIds.has(student.id);

                return (
                  <div
                    key={student.id}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    role="row"
                    tabIndex={0}
                    aria-label={`${student.name}, ${student.classType}, ${session ? activityTitle : 'Idle'}`}
                    className={`absolute top-0 left-0 w-full flex items-center hover:bg-[var(--surface-glass)] transition cursor-pointer border-b border-[var(--border)] focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset focus-visible:outline-none ${studentAlert?.riskLevel === 'CRITICAL' ? 'bg-red-900/5' : ''} ${isSelected ? 'bg-purple-900/10' : ''}`}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                    onClick={() => onViewProfile?.(student)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onViewProfile?.(student);
                      }
                    }}
                  >
                    {/* Checkbox */}
                    <div className="p-3 w-10 shrink-0" role="cell">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(student.id)}
                        onClick={e => e.stopPropagation()}
                        className="accent-purple-500 w-4 h-4 cursor-pointer"
                        aria-label={`Select ${student.name}`}
                      />
                    </div>

                    {/* Status dot */}
                    <div className="p-3 w-6 shrink-0 flex items-center" role="cell">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${dotClass}`}
                        aria-label={dotLabel}
                        title={dotLabel}
                      />
                    </div>

                    {/* Student name + avatar */}
                    <div className="p-3 font-bold text-[var(--text-primary)] flex-[2] min-w-0" role="cell">
                      <div className="flex items-center gap-2">
                        <div className="relative shrink-0">
                          {student.avatarUrl ? (
                            <img
                              src={student.avatarUrl}
                              alt={student.name}
                              loading="lazy"
                              className="w-8 h-8 rounded-full border border-[var(--border)] object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-xs">
                              {student.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <span className="truncate max-w-[120px]">{student.name}</span>
                        {studentAlert && riskDotClasses[studentAlert.riskLevel] && (
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${riskDotClasses[studentAlert.riskLevel]}`}
                            title={`${studentAlert.riskLevel} risk: ${studentAlert.reason}`}
                            aria-label={`${studentAlert.riskLevel} risk`}
                          />
                        )}
                        {bucketMeta && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${bucketMeta.bgColor} ${bucketMeta.color} border ${bucketMeta.borderColor}`}
                            title={bucketMeta.description}
                          >
                            {bucketMeta.label}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Class */}
                    <div className="p-3 text-sm text-[var(--text-tertiary)] flex-1" role="cell">
                      {student.classType}
                    </div>

                    {/* Current Activity */}
                    <div className="p-3 flex-[2] min-w-0" role="cell">
                      {session ? (
                        <span className="text-sm text-[var(--text-primary)] truncate block" title={activityText}>
                          {activityText}
                        </span>
                      ) : (
                        <span className="text-sm text-[var(--text-muted)] italic">Idle</span>
                      )}
                    </div>

                    {/* Last Active */}
                    <div className="p-3 text-right text-xs font-mono text-[var(--text-muted)] flex-1" role="cell">
                      {lastActiveLabel}
                    </div>

                    {/* Actions */}
                    <div
                      className="p-3 w-28 shrink-0 flex items-center justify-end gap-1"
                      role="cell"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onAward?.()}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-amber-400 hover:bg-amber-400/10 transition"
                        aria-label={`Award ${student.name}`}
                        title="Award XP"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onMessage?.(student)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-blue-400 hover:bg-blue-400/10 transition"
                        aria-label={`Message ${student.name}`}
                        title="Send message"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onViewProfile?.(student)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-purple-400 hover:bg-purple-400/10 transition"
                        aria-label={`View profile for ${student.name}`}
                        title="View profile"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {sortedStudents.length === 0 && (
        <p className="text-center text-sm text-[var(--text-muted)] py-8">No students match your filters.</p>
      )}
    </div>
  );
};

export default ActivityMonitor;
