import React, { useMemo, useState } from 'react';
import { User, WellnessCheckin, WellnessLevel } from '../../types';
import { MessageSquare, User as UserIcon, Filter } from 'lucide-react';

const LEVEL_ORDER: WellnessLevel[] = ['high', 'elevated', 'very-low', 'low', 'normal'];

const LEVEL_META: Record<WellnessLevel, {
  label: string;
  shortLabel: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  ringClass: string;
  priority: number;
  imageUrl: string;
}> = {
  'very-low': {
    label: 'Very Low',
    shortLabel: 'Exhausted',
    colorClass: 'text-blue-600 dark:text-blue-400',
    bgClass: 'bg-blue-500/10 dark:bg-blue-500/15',
    borderClass: 'border-blue-500/30 dark:border-blue-400/30',
    ringClass: 'ring-blue-500/40',
    priority: 2,
    imageUrl: '/assets/cortisol-faces/very-low.jpg',
  },
  'low': {
    label: 'Low',
    shortLabel: 'Calm',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    bgClass: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    borderClass: 'border-emerald-500/30 dark:border-emerald-400/30',
    ringClass: 'ring-emerald-500/40',
    priority: 4,
    imageUrl: '/assets/cortisol-faces/low.jpg',
  },
  'normal': {
    label: 'Normal',
    shortLabel: 'Balanced',
    colorClass: 'text-purple-600 dark:text-purple-400',
    bgClass: 'bg-purple-500/10 dark:bg-purple-500/15',
    borderClass: 'border-purple-500/30 dark:border-purple-400/30',
    ringClass: 'ring-purple-500/40',
    priority: 5,
    imageUrl: '/assets/cortisol-faces/normal.jpg',
  },
  'elevated': {
    label: 'Elevated',
    shortLabel: 'Anxious',
    colorClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-500/10 dark:bg-amber-500/15',
    borderClass: 'border-amber-500/30 dark:border-amber-400/30',
    ringClass: 'ring-amber-500/40',
    priority: 3,
    imageUrl: '/assets/cortisol-faces/elevated.jpg',
  },
  'high': {
    label: 'High',
    shortLabel: 'Stressed',
    colorClass: 'text-red-600 dark:text-red-400',
    bgClass: 'bg-red-500/10 dark:bg-red-500/15',
    borderClass: 'border-red-500/30 dark:border-red-400/30',
    ringClass: 'ring-red-500/40',
    priority: 1,
    imageUrl: '/assets/cortisol-faces/high.jpg',
  },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

interface WellnessMonitorProps {
  students: User[];
  checkins: WellnessCheckin[];
  onMessage?: (student: User) => void;
  onViewProfile?: (student: User) => void;
}

const WellnessMonitor: React.FC<WellnessMonitorProps> = ({
  students,
  checkins,
  onMessage,
  onViewProfile,
}) => {
  const [filterLevel, setFilterLevel] = useState<WellnessLevel | 'all'>('all');

  const checkinByUser = useMemo(() => {
    const map = new Map<string, WellnessCheckin>();
    checkins.forEach(c => {
      const existing = map.get(c.userId);
      if (!existing || new Date(c.updatedAt) > new Date(existing.updatedAt)) {
        map.set(c.userId, c);
      }
    });
    return map;
  }, [checkins]);

  const enriched = useMemo(() => {
    return students
      .map(student => {
        const checkin = checkinByUser.get(student.id);
        return { student, checkin };
      })
      .filter(({ checkin }) => !!checkin)
      .map(({ student, checkin }) => ({
        student,
        checkin: checkin!,
        meta: LEVEL_META[checkin!.level],
      }))
      .sort((a, b) => {
        // Sort by priority (high/elevated first), then by recency
        if (a.meta.priority !== b.meta.priority) {
          return a.meta.priority - b.meta.priority;
        }
        return new Date(b.checkin.updatedAt).getTime() - new Date(a.checkin.updatedAt).getTime();
      });
  }, [students, checkinByUser]);

  const filtered = useMemo(() => {
    if (filterLevel === 'all') return enriched;
    return enriched.filter(e => e.checkin.level === filterLevel);
  }, [enriched, filterLevel]);

  const counts = useMemo(() => {
    const c: Record<WellnessLevel | 'all' | 'none', number> = {
      all: enriched.length,
      none: students.length - enriched.length,
      'very-low': 0,
      'low': 0,
      'normal': 0,
      'elevated': 0,
      'high': 0,
    };
    enriched.forEach(e => { c[e.checkin.level] += 1; });
    return c;
  }, [enriched, students.length]);

  const notCheckedIn = students.length - enriched.length;

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="flex flex-wrap items-center gap-2">
        {LEVEL_ORDER.map(level => {
          const meta = LEVEL_META[level];
          const count = counts[level];
          const isActive = filterLevel === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => setFilterLevel(isActive ? 'all' : level)}
              className={`
                inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition
                ${isActive
                  ? `${meta.bgClass} ${meta.borderClass} ${meta.colorClass}`
                  : 'bg-[var(--surface-raised)] border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-glass-heavy)]'
                }
              `}
            >
              <img src={meta.imageUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
              {meta.shortLabel}
              <span className={`ml-0.5 min-w-[16px] h-4 inline-flex items-center justify-center rounded-full text-[10px] px-1 ${isActive ? 'bg-black/20' : 'bg-[var(--surface-sunken)]'}`}>
                {count}
              </span>
            </button>
          );
        })}

        {notCheckedIn > 0 && (
          <button
            type="button"
            onClick={() => setFilterLevel('all')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold border bg-[var(--surface-raised)] border-[var(--border)] text-[var(--text-muted)] transition"
          >
            <UserIcon className="w-3.5 h-3.5" />
            No response
            <span className="ml-0.5 min-w-[16px] h-4 inline-flex items-center justify-center rounded-full text-[10px] px-1 bg-[var(--surface-sunken)]">
              {notCheckedIn}
            </span>
          </button>
        )}

        {filterLevel !== 'all' && (
          <button
            type="button"
            onClick={() => setFilterLevel('all')}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent-text)] hover:opacity-70 transition ml-auto"
          >
            <Filter className="w-3 h-3" />
            Clear filter
          </button>
        )}
      </div>

      {/* Student grid */}
      {filtered.length === 0 ? (
        <div className="text-sm text-[var(--text-muted)] italic py-8 text-center bg-[var(--surface-sunken)] rounded-xl border border-dashed border-[var(--border)]">
          {filterLevel === 'all'
            ? 'No wellness check-ins today yet.'
            : `No students marked as "${LEVEL_META[filterLevel].label}" today.`}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(({ student, checkin, meta }) => (
            <div
              key={student.id}
              className={`
                relative rounded-2xl p-3 border transition
                ${meta.bgClass} ${meta.borderClass}
              `}
            >
              <div className="flex items-start gap-2.5">
                <div className={`relative w-10 h-10 rounded-full ring-2 ${meta.ringClass} overflow-hidden shrink-0`}>
                  <img
                    src={student.avatarUrl || '/assets/icons/default-avatar.png'}
                    alt={student.name}
                    className="w-full h-full rounded-full object-cover"
                    loading="lazy"
                  />
                  <img
                    src={meta.imageUrl}
                    alt={meta.label}
                    className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full object-cover ring-1 ring-[var(--surface-glass)]"
                    loading="lazy"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {student.name}
                  </div>
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${meta.colorClass}`}>
                    {meta.label}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {formatTime(checkin.updatedAt)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 mt-2.5">
                <button
                  type="button"
                  onClick={() => onMessage?.(student)}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-glass-heavy)] hover:text-[var(--text-primary)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  <MessageSquare className="w-3 h-3" />
                  Message
                </button>
                <button
                  type="button"
                  onClick={() => onViewProfile?.(student)}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-glass-heavy)] hover:text-[var(--text-primary)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  <UserIcon className="w-3 h-3" />
                  Profile
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WellnessMonitor;
