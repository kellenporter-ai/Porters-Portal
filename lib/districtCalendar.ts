/**
 * Perth Amboy Public Schools 2025–2026 District Calendar Events.
 *
 * All dates are YYYY-MM-DD strings. Ranges use startDate + endDate (inclusive).
 * audience field is present for future filtering; currently all events are ['student','teacher','admin'].
 */

export type CalendarEventCategory =
  | 'district_assessment'
  | 'ap_exam'
  | 'iready_star'
  | 'psat_sat'
  | 'marking_period'
  | 'progress_report'
  | 'ng_date'
  | 'ic_window'
  | 'conference'
  | 'holiday'
  | 'no_school'
  | 'half_day'
  | 'pd_day'
  | 'other';

export interface DistrictCalendarEvent {
  id: string;
  title: string;
  category: CalendarEventCategory;
  startDate: string;   // YYYY-MM-DD
  endDate?: string;    // YYYY-MM-DD inclusive — present for multi-day ranges
  time?: string;       // e.g. "6:00 PM – 7:30 PM"
  audience: ('student' | 'teacher' | 'admin')[];
  notes?: string;
}

const ALL: ('student' | 'teacher' | 'admin')[] = ['student', 'teacher', 'admin'];

export const DISTRICT_EVENTS_2025_2026: DistrictCalendarEvent[] = [
  // ─── Marking Periods ───────────────────────────────────────────────
  { id: 'mp1', title: 'Marking Period 1', category: 'marking_period', startDate: '2025-09-04', endDate: '2025-11-13', audience: ALL },
  { id: 'mp2', title: 'Marking Period 2', category: 'marking_period', startDate: '2025-11-14', endDate: '2026-02-02', audience: ALL },
  { id: 'mp3', title: 'Marking Period 3', category: 'marking_period', startDate: '2026-02-03', endDate: '2026-04-16', audience: ALL },
  { id: 'mp4', title: 'Marking Period 4', category: 'marking_period', startDate: '2026-04-17', endDate: '2026-06-25', audience: ALL },

  // ─── NG Dates ──────────────────────────────────────────────────────
  { id: 'ng-mp1', title: 'MP1 NG Date', category: 'ng_date', startDate: '2025-10-09', audience: ALL },
  { id: 'ng-mp2', title: 'MP2 NG Date', category: 'ng_date', startDate: '2026-01-05', audience: ALL },
  { id: 'ng-mp3', title: 'MP3 NG Date', category: 'ng_date', startDate: '2026-03-12', audience: ALL },
  { id: 'ng-mp4', title: 'MP4 NG Date', category: 'ng_date', startDate: '2026-05-22', audience: ALL },

  // ─── Progress Report IC Windows ────────────────────────────────────
  { id: 'pr-mp1', title: 'MP1 Progress Reports IC Window', category: 'progress_report', startDate: '2025-10-06', endDate: '2025-10-08', audience: ALL },
  { id: 'pr-mp2', title: 'MP2 Progress Reports IC Window', category: 'progress_report', startDate: '2025-12-18', endDate: '2025-12-22', audience: ALL },
  { id: 'pr-mp3', title: 'MP3 Progress Reports IC Window', category: 'progress_report', startDate: '2026-03-09', endDate: '2026-03-11', audience: ALL },
  { id: 'pr-mp4', title: 'MP4 Progress Reports IC Window', category: 'progress_report', startDate: '2026-05-19', endDate: '2026-05-21', audience: ALL },

  // ─── MP/Final/IEP IC Windows ───────────────────────────────────────
  { id: 'ic-mp1',    title: 'MP1/Final/IEP IC Window',          category: 'ic_window', startDate: '2025-11-11', endDate: '2025-11-13', audience: ALL },
  { id: 'ic-mp2',    title: 'MP2/Final/IEP IC Window',          category: 'ic_window', startDate: '2026-01-29', endDate: '2026-02-02', audience: ALL },
  { id: 'ic-mp3',    title: 'MP3/Final/IEP IC Window',          category: 'ic_window', startDate: '2026-04-14', endDate: '2026-04-16', audience: ALL },
  { id: 'ic-mp4-12', title: 'MP4/Final/IEP IC Window (Gr. 12)', category: 'ic_window', startDate: '2026-06-16', endDate: '2026-06-18', audience: ALL },
  { id: 'ic-mp4-911',title: 'MP4/Final/IEP IC Window (Gr. 9–11)',category: 'ic_window', startDate: '2026-06-22', endDate: '2026-06-24', audience: ALL },

  // ─── District Assessments ──────────────────────────────────────────
  { id: 'mid-window',  title: 'Midterm Exam Window',                      category: 'district_assessment', startDate: '2026-01-21', endDate: '2026-01-27', audience: ALL },
  { id: 'mid-makeup',  title: 'Midterm Make-Ups',                         category: 'district_assessment', startDate: '2026-01-28', endDate: '2026-01-30', audience: ALL },
  { id: 'mid-pm',      title: 'Midterm Scores in Performance Matters',    category: 'district_assessment', startDate: '2026-01-30', audience: ALL },
  { id: 'mid-ic',      title: 'Midterm Scores in Infinite Campus',        category: 'district_assessment', startDate: '2026-02-02', audience: ALL },
  { id: 'final-window',title: 'Final Exam Window',                        category: 'district_assessment', startDate: '2026-06-09', endDate: '2026-06-15', audience: ALL },
  { id: 'final-makeup',title: 'Final Make-Ups',                          category: 'district_assessment', startDate: '2026-06-16', endDate: '2026-06-17', audience: ALL },
  { id: 'final-pm',    title: 'Final Scores in Performance Matters',     category: 'district_assessment', startDate: '2026-06-18', audience: ALL },
  { id: 'final-ic',    title: 'Final Scores in Infinite Campus',         category: 'district_assessment', startDate: '2026-06-24', audience: ALL },

  // ─── AP Exams ──────────────────────────────────────────────────────
  { id: 'ap-0504', title: 'AP: Biology, Latin, Microeconomics, European History', category: 'ap_exam', startDate: '2026-05-04', audience: ALL },
  { id: 'ap-0505', title: 'AP: Human Geography, Chemistry, US Government and Politics', category: 'ap_exam', startDate: '2026-05-05', audience: ALL },
  { id: 'ap-0506', title: 'AP: English Lit, Comparative Gov, Physics 1 Algebra-Based', category: 'ap_exam', startDate: '2026-05-06', audience: ALL },
  { id: 'ap-0507', title: 'AP: African American Studies, Statistics, World History', category: 'ap_exam', startDate: '2026-05-07', audience: ALL },
  { id: 'ap-0508', title: 'AP: US History, Macroeconomics', category: 'ap_exam', startDate: '2026-05-08', audience: ALL },
  { id: 'ap-0511', title: 'AP: Calculus AB/BC, Music Theory, Seminar', category: 'ap_exam', startDate: '2026-05-11', audience: ALL },
  { id: 'ap-0512', title: 'AP: French Language and Culture, Precalculus, Psychology', category: 'ap_exam', startDate: '2026-05-12', audience: ALL },
  { id: 'ap-0513', title: 'AP: English Language and Composition, Spanish Lit', category: 'ap_exam', startDate: '2026-05-13', audience: ALL },
  { id: 'ap-0514', title: 'AP: Art History, Spanish Language, Computer Science Principles', category: 'ap_exam', startDate: '2026-05-14', audience: ALL },
  { id: 'ap-0515', title: 'AP: Environmental Science, Computer Science A', category: 'ap_exam', startDate: '2026-05-15', audience: ALL },
  { id: 'ap-art-deadline',     title: 'AP Art & Design Portfolio Deadline',                    category: 'ap_exam', startDate: '2026-05-08', time: '8:00 PM ET', audience: ALL },
  { id: 'ap-seminar-deadline', title: 'AP Seminar/Research/CSP Performance Tasks Deadline',    category: 'ap_exam', startDate: '2026-04-30', time: '11:59 PM ET', audience: ALL },
  { id: 'ap-late',             title: 'AP Late-Testing Window',                                category: 'ap_exam', startDate: '2026-05-18', endDate: '2026-05-22', audience: ALL },

  // ─── i-Ready / Spanish STAR Reading and Math ───────────────────────
  { id: 'iready-fall',   title: 'i-Ready / STAR: Fall Window',   category: 'iready_star', startDate: '2025-09-15', endDate: '2025-09-26', audience: ALL },
  { id: 'iready-winter', title: 'i-Ready / STAR: Winter Window', category: 'iready_star', startDate: '2026-01-05', endDate: '2026-01-16', audience: ALL },
  { id: 'iready-spring', title: 'i-Ready / STAR: Spring Window', category: 'iready_star', startDate: '2026-05-18', endDate: '2026-06-02', audience: ALL },

  // ─── PSAT / SAT ────────────────────────────────────────────────────
  { id: 'psat-89',   title: 'Grade 9 PSAT 8/9',            category: 'psat_sat', startDate: '2026-04-15', audience: ALL },
  { id: 'psat-1011', title: 'Grades 10–11 PSAT/NMSQT',     category: 'psat_sat', startDate: '2025-10-22', audience: ALL },
  { id: 'sat-gr12',  title: 'Grade 12 SAT (Fall)',          category: 'psat_sat', startDate: '2025-10-22', audience: ALL },
  { id: 'sat-gr11',  title: 'Grade 11 SAT (Spring)',        category: 'psat_sat', startDate: '2026-04-15', audience: ALL },

  // ─── Conferences ───────────────────────────────────────────────────
  { id: 'btsn',      title: 'Back to School Night',         category: 'conference', startDate: '2025-09-25', time: '6:00 PM – 7:30 PM', audience: ALL },
  { id: 'conf-1021', title: 'Parent-Teacher Conferences',   category: 'conference', startDate: '2025-10-21', time: '1:20 PM – 3:00 PM', audience: ALL },
  { id: 'conf-1022', title: 'Parent-Teacher Conferences',   category: 'conference', startDate: '2025-10-22', time: '6:00 PM – 7:30 PM', audience: ALL },
  { id: 'conf-0203', title: 'Parent-Teacher Conferences',   category: 'conference', startDate: '2026-02-03', time: '1:20 PM – 3:00 PM', audience: ALL },
  { id: 'conf-0204', title: 'Parent-Teacher Conferences',   category: 'conference', startDate: '2026-02-04', time: '6:00 PM – 7:30 PM', audience: ALL },
  { id: 'conf-0326', title: 'Parent-Teacher Conferences',   category: 'conference', startDate: '2026-03-26', time: '1:20 PM – 3:00 PM', audience: ALL },

  // ─── Holidays ──────────────────────────────────────────────────────
  { id: 'holiday-labor-day',      title: 'Labor Day',                   category: 'holiday',  startDate: '2025-09-01', audience: ALL },
  { id: 'holiday-thanksgiving',   title: 'Thanksgiving Recess',         category: 'holiday',  startDate: '2025-11-27', endDate: '2025-11-28', audience: ALL },
  { id: 'holiday-dec',            title: 'Holiday Recess',              category: 'holiday',  startDate: '2025-12-24', endDate: '2025-12-31', audience: ALL },
  { id: 'holiday-jan',            title: 'Holiday Recess (cont.)',      category: 'holiday',  startDate: '2026-01-01', endDate: '2026-01-02', audience: ALL },
  { id: 'holiday-mlk',            title: 'Dr. Martin Luther King Jr. Day',  category: 'holiday',  startDate: '2026-01-19', audience: ALL },
  { id: 'holiday-presidents',     title: "President's Day",             category: 'holiday',  startDate: '2026-02-16', audience: ALL },
  { id: 'holiday-memorial',       title: 'Memorial Day',                category: 'holiday',  startDate: '2026-05-25', audience: ALL },
  { id: 'holiday-juneteenth',     title: 'Juneteenth',                  category: 'holiday',  startDate: '2026-06-19', audience: ALL },

  // ─── No-School / Recesses ──────────────────────────────────────────
  { id: 'recess-fall',    title: 'Fall Recess',    category: 'no_school', startDate: '2025-11-03', endDate: '2025-11-07', audience: ALL },
  { id: 'holiday-dec-recess', title: 'Holiday Recess',  category: 'no_school', startDate: '2025-12-24', endDate: '2025-12-31', audience: ALL },
  { id: 'holiday-jan-recess', title: 'Holiday Recess',  category: 'no_school', startDate: '2026-01-01', endDate: '2026-01-02', audience: ALL },
  { id: 'recess-spring',  title: 'Spring Recess',  category: 'no_school', startDate: '2026-04-03', endDate: '2026-04-10', audience: ALL },

  // ─── School Open/Close ────────────────────────────────────────────
  { id: 'other-first-day', title: 'First Day of School', category: 'other', startDate: '2025-09-04', audience: ALL },
  { id: 'other-school-reopens', title: 'School Re-Opens', category: 'other', startDate: '2026-01-05', audience: ALL },

  // ─── Staff In-Service / PD Days ────────────────────────────────────
  { id: 'pd-0902', title: 'Staff In-Service Days', category: 'pd_day', startDate: '2025-09-02', endDate: '2025-09-03', audience: ALL },
  { id: 'pd-1013', title: 'Staff In-Service Day', category: 'pd_day', startDate: '2025-10-13', audience: ALL },

  // ─── Half Days / Early Dismissal ───────────────────────────────────
  { id: 'half-1126', title: 'Early Dismissal',          category: 'half_day', startDate: '2025-11-26', audience: ALL },
  { id: 'half-1223', title: 'Early Dismissal',          category: 'half_day', startDate: '2025-12-23', audience: ALL },
  { id: 'half-0402', title: 'Early Dismissal',          category: 'half_day', startDate: '2026-04-02', audience: ALL },
  { id: 'half-0625', title: 'Last Day of School (Early Dismissal)', category: 'half_day', startDate: '2026-06-25', audience: ALL },
];

/**
 * Returns all district events that fall on the given date string (YYYY-MM-DD).
 * Handles both single-day and range events.
 */
export function getDistrictEventsForDate(dateStr: string): DistrictCalendarEvent[] {
  return DISTRICT_EVENTS_2025_2026.filter(e => {
    if (e.endDate) return dateStr >= e.startDate && dateStr <= e.endDate;
    return e.startDate === dateStr;
  });
}

/**
 * Converts a Date to a YYYY-MM-DD string using local time (avoids UTC-shift bugs).
 */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface CategoryMeta {
  label: string;
  dot: string;   // Tailwind bg- class for the calendar dot
  chip: string;  // Tailwind bg-/text- classes for the event chip
}

export const CATEGORY_META: Record<CalendarEventCategory, CategoryMeta> = {
  district_assessment: {
    label: 'District Assessment',
    dot:  'bg-orange-500',
    chip: 'bg-orange-500/20 text-orange-700 dark:text-orange-300',
  },
  ap_exam: {
    label: 'AP Exam',
    dot:  'bg-red-500',
    chip: 'bg-red-500/20 text-red-700 dark:text-red-300',
  },
  iready_star: {
    label: 'i-Ready / STAR',
    dot:  'bg-cyan-500',
    chip: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300',
  },
  psat_sat: {
    label: 'PSAT / SAT',
    dot:  'bg-indigo-500',
    chip: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
  },
  marking_period: {
    label: 'Marking Period',
    dot:  'bg-blue-600',
    chip: 'bg-blue-600/20 text-blue-700 dark:text-blue-300',
  },
  progress_report: {
    label: 'Progress Report',
    dot:  'bg-blue-400',
    chip: 'bg-blue-400/20 text-blue-700 dark:text-blue-200',
  },
  ng_date: {
    label: 'NG Date',
    dot:  'bg-blue-300',
    chip: 'bg-blue-300/20 text-blue-700 dark:text-blue-100',
  },
  ic_window: {
    label: 'IC Window',
    dot:  'bg-sky-500',
    chip: 'bg-sky-500/20 text-sky-700 dark:text-sky-300',
  },
  conference: {
    label: 'Conference',
    dot:  'bg-violet-500',
    chip: 'bg-violet-500/20 text-violet-700 dark:text-violet-300',
  },
  holiday: {
    label: 'Holiday',
    dot:  'bg-green-500',
    chip: 'bg-green-500/20 text-green-700 dark:text-green-300',
  },
  no_school: {
    label: 'No School',
    dot:  'bg-green-600',
    chip: 'bg-green-600/20 text-green-700 dark:text-green-300',
  },
  half_day: {
    label: 'Half Day',
    dot:  'bg-yellow-500',
    chip: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
  },
  pd_day: {
    label: 'PD Day',
    dot:  'bg-amber-500',
    chip: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  },
  other: {
    label: 'Other',
    dot:  'bg-gray-500',
    chip: 'bg-gray-500/20 text-gray-700 dark:text-gray-300',
  },
};
