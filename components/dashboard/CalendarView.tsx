import React, { useMemo, useState } from 'react';
import { Assignment, Submission } from '../../types';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, CheckCircle2, AlertTriangle, LayoutGrid, List } from 'lucide-react';

interface CalendarViewProps {
  assignments: Assignment[];
  submissions: Submission[];
  activeClass: string;
  enrolledClasses?: string[];
  onStartAssignment?: (id: string) => void;
}

interface DayData {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  assignments: (Assignment & { isOverdue: boolean; isCompleted: boolean; classColor: string })[];
}

type ViewMode = 'month' | 'week';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Color-code assignments by class
const CLASS_COLORS = [
  'bg-blue-400', 'bg-emerald-400', 'bg-amber-400', 'bg-pink-400',
  'bg-cyan-400', 'bg-violet-400', 'bg-orange-400', 'bg-rose-400',
];

function getClassColor(classType: string, enrolledClasses: string[]): string {
  const idx = enrolledClasses.indexOf(classType);
  return CLASS_COLORS[idx >= 0 ? idx % CLASS_COLORS.length : 0];
}

const CalendarView: React.FC<CalendarViewProps> = ({ assignments, submissions, activeClass, enrolledClasses = [], onStartAssignment }) => {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  const allEnrolled = useMemo(() => enrolledClasses.length > 0 ? enrolledClasses : [activeClass], [enrolledClasses, activeClass]);

  // Filter assignments with due dates in active class
  const classAssignments = useMemo(
    () => assignments.filter(a => a.classType === activeClass && a.status === 'ACTIVE' && a.dueDate),
    [assignments, activeClass],
  );

  // Build calendar grid
  const calendarDays = useMemo((): DayData[] => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: DayData[] = [];
    const now = new Date();

    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, daysInPrevMonth - i);
      days.push({ date, isCurrentMonth: false, isToday: false, assignments: [] });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = date.toISOString().split('T')[0];
      const isToday = date.toDateString() === today.toDateString();

      const dayAssignments = classAssignments
        .filter(a => a.dueDate && a.dueDate.split('T')[0] === dateStr)
        .map(a => {
          const sub = submissions.find(s => s.assignmentId === a.id && s.status !== 'STARTED');
          const isCompleted = !!sub;
          const isOverdue = !isCompleted && new Date(a.dueDate!) < now;
          const classColor = getClassColor(a.classType || activeClass, allEnrolled);
          return { ...a, isCompleted, isOverdue, classColor };
        });

      days.push({ date, isCurrentMonth: true, isToday, assignments: dayAssignments });
    }

    // Next month padding to fill 6 rows
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({ date, isCurrentMonth: false, isToday: false, assignments: [] });
    }

    return days;
  }, [viewDate, classAssignments, submissions, today]);

  // Week view: compute current week days
  const weekDays = useMemo((): DayData[] => {
    const startOfWeek = new Date(viewDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const now = new Date();
    const days: DayData[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const isToday = date.toDateString() === today.toDateString();
      const dayAssignments = classAssignments
        .filter(a => a.dueDate && a.dueDate.split('T')[0] === dateStr)
        .map(a => {
          const sub = submissions.find(s => s.assignmentId === a.id && s.status !== 'STARTED');
          const isCompleted = !!sub;
          const isOverdue = !isCompleted && new Date(a.dueDate!) < now;
          const classColor = getClassColor(a.classType || activeClass, allEnrolled);
          return { ...a, isCompleted, isOverdue, classColor };
        });
      days.push({ date, isCurrentMonth: true, isToday, assignments: dayAssignments });
    }
    return days;
  }, [viewDate, classAssignments, submissions, today, activeClass, allEnrolled]);

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  const prevWeek = () => { const d = new Date(viewDate); d.setDate(d.getDate() - 7); setViewDate(d); };
  const nextWeek = () => { const d = new Date(viewDate); d.setDate(d.getDate() + 7); setViewDate(d); };
  const goToday = () => {
    setViewDate(viewMode === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date());
    setSelectedDay(null);
  };

  // Upcoming due dates
  const upcoming = useMemo(() => {
    const now = new Date();
    return classAssignments
      .map(a => {
        const sub = submissions.find(s => s.assignmentId === a.id && s.status !== 'STARTED');
        return { ...a, isCompleted: !!sub, isOverdue: !sub && new Date(a.dueDate!) < now };
      })
      .filter(a => !a.isCompleted && new Date(a.dueDate!) >= now)
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 5);
  }, [classAssignments, submissions]);

  return (
    <div style={{ animation: 'tabEnter 0.3s ease-out both' }}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Calendar</h2>
            <p className="text-xs text-gray-500">Assignment due dates for {activeClass}</p>
          </div>
        </div>
        <div className="flex bg-black/30 rounded-lg p-0.5 border border-white/10">
          <button
            onClick={() => setViewMode('month')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold transition ${viewMode === 'month' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
            aria-label="Month view"
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Month
          </button>
          <button
            onClick={() => { setViewMode('week'); setViewDate(new Date()); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold transition ${viewMode === 'week' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
            aria-label="Week view"
          >
            <List className="w-3.5 h-3.5" /> Week
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Calendar Grid ─── */}
        <div className="lg:col-span-2 bg-black/20 border border-white/5 rounded-2xl p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={viewMode === 'month' ? prevMonth : prevWeek} className="p-2 hover:bg-white/5 rounded-lg transition" aria-label={viewMode === 'month' ? 'Previous month' : 'Previous week'}>
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
            <div className="flex items-center gap-3">
              <h3 className="text-white font-bold">
                {viewMode === 'month'
                  ? `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`
                  : (() => {
                      const start = new Date(viewDate);
                      start.setDate(start.getDate() - start.getDay());
                      const end = new Date(start);
                      end.setDate(end.getDate() + 6);
                      return `${MONTHS[start.getMonth()]} ${start.getDate()} – ${start.getMonth() !== end.getMonth() ? MONTHS[end.getMonth()] + ' ' : ''}${end.getDate()}`;
                    })()
                }
              </h3>
              <button
                onClick={goToday}
                className="text-[10px] text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider transition"
              >
                Today
              </button>
            </div>
            <button onClick={viewMode === 'month' ? nextMonth : nextWeek} className="p-2 hover:bg-white/5 rounded-lg transition" aria-label={viewMode === 'month' ? 'Next month' : 'Next week'}>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {viewMode === 'month' ? (
            <>
              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map(d => (
                  <div key={d} className="text-center text-[10px] text-gray-600 font-bold uppercase tracking-wider py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                  const hasAssignments = day.assignments.length > 0;
                  const isSelected = selectedDay?.date.toDateString() === day.date.toDateString();

                  return (
                    <button
                      key={i}
                      onClick={() => hasAssignments ? setSelectedDay(day) : setSelectedDay(null)}
                      className={`
                        relative min-h-[48px] p-1 rounded-lg text-center transition text-xs
                        ${day.isCurrentMonth ? 'text-gray-300' : 'text-gray-700'}
                        ${day.isToday ? 'ring-1 ring-purple-500/50 bg-purple-500/10' : ''}
                        ${isSelected ? 'bg-white/10 ring-1 ring-white/20' : ''}
                        ${hasAssignments ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'}
                      `}
                    >
                      <span className={`text-[11px] font-bold ${day.isToday ? 'text-purple-400' : ''}`}>
                        {day.date.getDate()}
                      </span>
                      {hasAssignments && (
                        <div className="flex justify-center gap-0.5 mt-0.5">
                          {day.assignments.slice(0, 3).map((a, j) => (
                            <div
                              key={j}
                              className={`w-1.5 h-1.5 rounded-full ${
                                a.isCompleted ? 'bg-emerald-400' :
                                a.isOverdue ? 'bg-red-400' : a.classColor
                              }`}
                            />
                          ))}
                          {day.assignments.length > 3 && (
                            <span className="text-[8px] text-gray-500">+{day.assignments.length - 3}</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            /* ─── Week View ─── */
            <div className="space-y-1">
              {weekDays.map((day, i) => {
                const hasAssignments = day.assignments.length > 0;
                const isSelected = selectedDay?.date.toDateString() === day.date.toDateString();
                return (
                  <button
                    key={i}
                    onClick={() => hasAssignments ? setSelectedDay(day) : setSelectedDay(null)}
                    className={`w-full flex items-center gap-4 p-3 rounded-xl text-left transition ${
                      day.isToday ? 'ring-1 ring-purple-500/50 bg-purple-500/10' : ''
                    } ${isSelected ? 'bg-white/10 ring-1 ring-white/20' : ''} ${hasAssignments ? 'hover:bg-white/5' : ''}`}
                  >
                    <div className="w-14 text-center">
                      <div className="text-[10px] text-gray-500 font-bold uppercase">{WEEKDAYS[day.date.getDay()]}</div>
                      <div className={`text-lg font-bold ${day.isToday ? 'text-purple-400' : 'text-gray-300'}`}>{day.date.getDate()}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      {hasAssignments ? (
                        <div className="space-y-1">
                          {day.assignments.map(a => (
                            <div key={a.id} className="flex items-center gap-2 text-xs">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${a.isCompleted ? 'bg-emerald-400' : a.isOverdue ? 'bg-red-400' : a.classColor}`} />
                              <span className={`truncate ${a.isCompleted ? 'text-gray-500 line-through' : a.isOverdue ? 'text-red-400' : 'text-gray-300'}`}>
                                {a.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-700 italic">No assignments due</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <div className={`w-2 h-2 rounded-full ${getClassColor(activeClass, allEnrolled)}`} /> {activeClass}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <div className="w-2 h-2 rounded-full bg-emerald-400" /> Completed
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <div className="w-2 h-2 rounded-full bg-red-400" /> Overdue
            </div>
          </div>
        </div>

        {/* ─── Side Panel ─── */}
        <div className="space-y-4">
          {/* Selected day details */}
          {selectedDay && selectedDay.assignments.length > 0 && (
            <div className="bg-black/20 border border-white/5 rounded-2xl p-4">
              <h4 className="text-sm font-bold text-white mb-3">
                {MONTHS[selectedDay.date.getMonth()]} {selectedDay.date.getDate()}
              </h4>
              <div className="space-y-2">
                {selectedDay.assignments.map(a => (
                  <button
                    key={a.id}
                    onClick={() => onStartAssignment?.(a.id)}
                    className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl p-3 transition"
                  >
                    <div className="flex items-start gap-2">
                      {a.isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : a.isOverdue ? (
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      ) : (
                        <Clock className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm text-gray-200 font-medium truncate">{a.title}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {a.unit || 'General'} · {a.category || 'Resource'}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming due dates */}
          <div className="bg-black/20 border border-white/5 rounded-2xl p-4">
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Upcoming Due Dates
            </h4>
            {upcoming.length > 0 ? (
              <div className="space-y-2">
                {upcoming.map(a => {
                  const due = new Date(a.dueDate!);
                  const daysLeft = Math.ceil((due.getTime() - new Date().getTime()) / 86400000);
                  return (
                    <button
                      key={a.id}
                      onClick={() => onStartAssignment?.(a.id)}
                      className="w-full text-left hover:bg-white/5 rounded-lg p-2 transition"
                    >
                      <div className="text-sm text-gray-300 truncate">{a.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-bold ${
                          daysLeft <= 1 ? 'text-red-400' :
                          daysLeft <= 3 ? 'text-yellow-400' : 'text-gray-500'
                        }`}>
                          {daysLeft === 0 ? 'Due today' :
                           daysLeft === 1 ? 'Due tomorrow' :
                           `${daysLeft} days left`}
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {due.getMonth() + 1}/{due.getDate()}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-gray-600 text-center py-4">
                No upcoming due dates
              </div>
            )}
          </div>

          {/* Summary stats */}
          <div className="bg-black/20 border border-white/5 rounded-2xl p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <div className="text-2xl font-black text-white">
                  {classAssignments.filter(a => {
                    const sub = submissions.find(s => s.assignmentId === a.id && s.status !== 'STARTED');
                    return !sub && new Date(a.dueDate!) >= new Date();
                  }).length}
                </div>
                <div className="text-[10px] text-gray-500 font-bold uppercase">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-red-400">
                  {classAssignments.filter(a => {
                    const sub = submissions.find(s => s.assignmentId === a.id && s.status !== 'STARTED');
                    return !sub && new Date(a.dueDate!) < new Date();
                  }).length}
                </div>
                <div className="text-[10px] text-gray-500 font-bold uppercase">Overdue</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CalendarView);
