import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import {
  DISTRICT_EVENTS_2025_2026,
  getDistrictEventsForDate,
  toLocalDateStr,
  CATEGORY_META,
  type CalendarEventCategory,
  type DistrictCalendarEvent,
} from '../../lib/districtCalendar';

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Ordered list of categories for the filter UI
const ALL_CATEGORIES: CalendarEventCategory[] = [
  'holiday', 'no_school', 'half_day', 'pd_day',
  'marking_period', 'district_assessment',
  'ap_exam', 'psat_sat', 'iready_star',
  'progress_report', 'ng_date', 'ic_window',
  'conference', 'other',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Component ────────────────────────────────────────────────────────────────

const DistrictCalendarTab: React.FC = () => {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Set<CalendarEventCategory>>(new Set());

  // Visible events after applying category filters
  const visibleEvents = useMemo(
    () => DISTRICT_EVENTS_2025_2026.filter(e => !hiddenCategories.has(e.category)),
    [hiddenCategories],
  );

  // Build the 42-cell month grid
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const todayStr = toLocalDateStr(today);

    const days: { dateStr: string; date: Date; isCurrentMonth: boolean; isToday: boolean; events: DistrictCalendarEvent[] }[] = [];

    // Previous-month padding
    for (let i = firstDow - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, daysInPrevMonth - i);
      days.push({ dateStr: toLocalDateStr(date), date, isCurrentMonth: false, isToday: false, events: [] });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = toLocalDateStr(date);
      days.push({
        dateStr,
        date,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        events: getDistrictEventsForDate(dateStr).filter(e => !hiddenCategories.has(e.category)),
      });
    }
    // Next-month padding to fill 6 rows
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({ dateStr: toLocalDateStr(date), date, isCurrentMonth: false, isToday: false, events: [] });
    }
    return days;
  }, [viewDate, hiddenCategories, today]);

  // Selected-day events
  const selectedDayEvents = useMemo(
    () => (selectedDateStr ? getDistrictEventsForDate(selectedDateStr).filter(e => !hiddenCategories.has(e.category)) : []),
    [selectedDateStr, hiddenCategories],
  );

  // Upcoming events within next 30 days
  const upcoming = useMemo(() => {
    const todayStr = toLocalDateStr(today);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 30);
    const cutoffStr = toLocalDateStr(cutoff);
    return visibleEvents
      .filter(e => {
        const start = e.startDate;
        const end = e.endDate ?? e.startDate;
        // Event overlaps [today, cutoff] range
        return end >= todayStr && start <= cutoffStr;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 8);
  }, [visibleEvents, today]);

  const toggleCategory = (cat: CalendarEventCategory) => {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  const goToday = () => { setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDateStr(null); };

  return (
    <div style={{ animation: 'tabEnter 0.3s ease-out both' }}>
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-xl text-blue-600 dark:text-blue-400" aria-hidden="true">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">District Calendar</h2>
            <p className="text-xs text-[var(--text-muted)]">2025–2026 school year</p>
          </div>
        </div>
      </div>

      {/* ─── Category Filters ────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-5" role="group" aria-label="Filter calendar categories">
        {ALL_CATEGORIES.map(cat => {
          const meta = CATEGORY_META[cat];
          const isActive = !hiddenCategories.has(cat);
          return (
            <button
              key={cat}
              aria-pressed={isActive}
              onClick={() => toggleCategory(cat)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition border ${
                isActive
                  ? 'border-transparent bg-[var(--surface-glass-heavy)] text-[var(--text-secondary)]'
                  : 'border-[var(--border)] bg-transparent text-[var(--text-muted)] opacity-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} aria-hidden="true" />
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* ─── Main Grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2 bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-[var(--surface-glass)] rounded-lg transition"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4 text-[var(--text-tertiary)]" />
            </button>
            <div className="flex items-center gap-3">
              <h3 className="text-[var(--text-primary)] font-bold">
                {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
              </h3>
              <button
                onClick={goToday}
                className="text-[11.5px] text-purple-600 dark:text-purple-400 hover:opacity-70 font-bold uppercase tracking-wider transition"
              >
                Today
              </button>
            </div>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-[var(--surface-glass)] rounded-lg transition"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[11.5px] text-[var(--text-muted)] font-bold uppercase tracking-wider py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()} calendar`}>
            {calendarDays.map((day, i) => {
              const hasEvents = day.events.length > 0;
              const isSelected = selectedDateStr === day.dateStr;
              const dots = day.events.slice(0, 3);
              const overflow = day.events.length - 3;
              const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;

              return (
                <button
                  key={i}
                  role="gridcell"
                  aria-label={`${MONTHS[day.date.getMonth()]} ${day.date.getDate()}${hasEvents ? `, ${day.events.length} event${day.events.length !== 1 ? 's' : ''}` : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => hasEvents ? setSelectedDateStr(isSelected ? null : day.dateStr) : setSelectedDateStr(null)}
                  className={`
                    relative min-h-[48px] p-1 rounded-lg text-center transition text-xs
                    ${day.isCurrentMonth ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}
                    ${isWeekend && day.isCurrentMonth ? 'opacity-60' : ''}
                    ${day.isToday ? 'ring-1 ring-purple-500/50 bg-purple-500/10' : ''}
                    ${isSelected ? 'bg-[var(--surface-glass-heavy)] ring-1 ring-[var(--border-strong)]' : ''}
                    ${hasEvents ? 'hover:bg-[var(--surface-glass)] cursor-pointer' : 'cursor-default'}
                  `}
                >
                  <span className={`text-[11px] font-bold ${day.isToday ? 'text-purple-600 dark:text-purple-400' : ''}`}>
                    {day.date.getDate()}
                  </span>
                  {hasEvents && (
                    <div className="flex justify-center gap-0.5 mt-0.5 flex-wrap">
                      {dots.map((e, j) => (
                        <span
                          key={j}
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${CATEGORY_META[e.category].dot}`}
                          aria-hidden="true"
                        />
                      ))}
                      {overflow > 0 && (
                        <span className="text-[8px] text-[var(--text-muted)]">+{overflow}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-[var(--border)]">
            {ALL_CATEGORIES.filter(cat => !hiddenCategories.has(cat)).map(cat => (
              <div key={cat} className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_META[cat].dot}`} aria-hidden="true" />
                {CATEGORY_META[cat].label}
              </div>
            ))}
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Selected day detail */}
          {selectedDateStr && selectedDayEvents.length > 0 && (
            <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">
                {(() => {
                  const [y, m, d] = selectedDateStr.split('-').map(Number);
                  return `${MONTHS[m - 1]} ${d}, ${y}`;
                })()}
              </h3>
              <div className="space-y-2">
                {selectedDayEvents.map(e => {
                  const meta = CATEGORY_META[e.category];
                  return (
                    <div
                      key={e.id}
                      className="rounded-xl p-3 border border-[var(--border)] bg-[var(--surface-glass)]"
                    >
                      <div className="flex items-start gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${meta.dot}`} aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--text-secondary)]">{e.title}</div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${meta.chip}`}>
                              {meta.label}
                            </span>
                            {e.time && (
                              <span className="text-[11px] text-[var(--text-muted)]">{e.time}</span>
                            )}
                            {e.endDate && e.endDate !== e.startDate && (
                              <span className="text-[11px] text-[var(--text-muted)]">
                                through {(() => {
                                  const [, m, d] = e.endDate.split('-').map(Number);
                                  return `${MONTHS[m - 1]} ${d}`;
                                })()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming events */}
          <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              Upcoming (30 days)
            </h3>
            {upcoming.length > 0 ? (
              <div className="space-y-2">
                {upcoming.map(e => {
                  const meta = CATEGORY_META[e.category];
                  const [, m, d] = e.startDate.split('-').map(Number);
                  const dateLabel = `${MONTHS[m - 1].slice(0, 3)} ${d}`;
                  return (
                    <button
                      key={e.id}
                      onClick={() => setSelectedDateStr(e.startDate)}
                      className="w-full text-left hover:bg-[var(--surface-glass)] rounded-lg p-2 transition"
                    >
                      <div className="flex items-start gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${meta.dot}`} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-[var(--text-secondary)] truncate">{e.title}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-[var(--text-muted)] font-bold">{dateLabel}</span>
                            {e.time && <span className="text-[11px] text-[var(--text-muted)]">{e.time}</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">
                No upcoming events in the next 30 days
              </p>
            )}
          </div>

          {/* Event count stats */}
          <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <div className="text-2xl font-black text-[var(--text-primary)]">
                  {DISTRICT_EVENTS_2025_2026.length}
                </div>
                <div className="text-[11.5px] text-[var(--text-muted)] font-bold uppercase tracking-wide">Total Events</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-[var(--text-primary)]">
                  {ALL_CATEGORIES.length - hiddenCategories.size}
                </div>
                <div className="text-[11.5px] text-[var(--text-muted)] font-bold uppercase tracking-wide">Shown</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DistrictCalendarTab;
