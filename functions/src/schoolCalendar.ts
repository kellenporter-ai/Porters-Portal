/**
 * Perth Amboy Public Schools 2026–2027 school calendar utilities.
 *
 * School year: 2026-09-03 through 2027-06-24.
 * Non-student days: weekends, holidays, recesses, and staff in-service days.
 * Early dismissal days (Nov 25, Dec 23, Mar 25, Jun 24) ARE school days.
 */

// All non-student dates (closed or in-service — students don't attend).
// Represented as a Set<string> of YYYY-MM-DD strings for O(1) lookup.
const NON_STUDENT_DATES = new Set<string>([
  // Staff In-Service (pre-year)
  "2026-09-01",
  "2026-09-02",
  // Labor Day
  "2026-09-07",
  // Staff In-Service
  "2026-10-12",
  // Fall Recess
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
  // Thanksgiving
  "2026-11-26",
  "2026-11-27",
  // Holiday Recess (December)
  "2026-12-24",
  "2026-12-25",
  "2026-12-28",
  "2026-12-29",
  "2026-12-30",
  "2026-12-31",
  // Holiday Recess (January)
  "2027-01-01",
  // MLK Day
  "2027-01-18",
  // President's Day
  "2027-02-15",
  // Spring Recess (Mar 26 Fri through Apr 2 Fri)
  "2027-03-26",
  "2027-03-29",
  "2027-03-30",
  "2027-03-31",
  "2027-04-01",
  "2027-04-02",
  // Memorial Day
  "2027-05-31",
  // Juneteenth
  "2027-06-18",
]);

const SCHOOL_YEAR_START = "2026-09-03"; // first day (inclusive)
const SCHOOL_YEAR_END   = "2027-06-24"; // last day (inclusive)

/**
 * Returns true if the given ISO date string (YYYY-MM-DD) is a school day:
 * - Falls within the school year
 * - Is not a weekend (Sat/Sun)
 * - Is not in the NON_STUDENT_DATES set
 */
export function isSchoolDay(dateStr: string): boolean {
  if (dateStr < SCHOOL_YEAR_START || dateStr > SCHOOL_YEAR_END) return false;
  // dateStr is YYYY-MM-DD; parse weekday without timezone shift
  const [year, month, day] = dateStr.split("-").map(Number);
  const dow = new Date(year, month - 1, day).getDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  if (NON_STUDENT_DATES.has(dateStr)) return false;
  return true;
}

/**
 * Counts school days in the half-open interval [startISO, endISO).
 * Both parameters should be ISO date strings (YYYY-MM-DD or full ISO).
 */
export function schoolDaysInWindow(startISO: string, endISO: string): number {
  const startDate = startISO.split("T")[0];
  const endDate   = endISO.split("T")[0];
  let count = 0;
  // Iterate day by day — 7-day windows are small, this is fine
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur < end) {
    const ymd = cur.toISOString().split("T")[0];
    if (isSchoolDay(ymd)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
