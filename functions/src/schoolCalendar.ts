/**
 * Perth Amboy Public Schools 2025–2026 school calendar utilities.
 *
 * School year: 2025-09-04 through 2026-06-25.
 * Non-student days: weekends, holidays, recesses, and staff in-service days.
 * Early dismissal days (Nov 26, Dec 23, Apr 2, Jun 11, Jun 25) ARE school days.
 */

// All non-student dates (closed or in-service — students don't attend).
// Represented as a Set<string> of YYYY-MM-DD strings for O(1) lookup.
const NON_STUDENT_DATES = new Set<string>([
  // Staff In-Service (pre-year)
  "2025-09-02",
  "2025-09-03",
  // Labor Day
  "2025-09-01",
  // Staff In-Service
  "2025-10-13",
  // Fall Recess
  "2025-11-03",
  "2025-11-04",
  "2025-11-05",
  "2025-11-06",
  "2025-11-07",
  // Thanksgiving
  "2025-11-27",
  "2025-11-28",
  // Holiday Recess (December)
  "2025-12-24",
  "2025-12-25",
  "2025-12-26",
  "2025-12-29",
  "2025-12-30",
  "2025-12-31",
  // Holiday Recess (January)
  "2026-01-01",
  "2026-01-02",
  // MLK Day
  "2026-01-19",
  // President's Day
  "2026-02-16",
  // Spring Recess (Apr 3 Fri through Apr 10 Fri)
  "2026-04-03",
  "2026-04-06",
  "2026-04-07",
  "2026-04-08",
  "2026-04-09",
  "2026-04-10",
  // Memorial Day
  "2026-05-25",
  // Juneteenth
  "2026-06-19",
]);

const SCHOOL_YEAR_START = "2025-09-04"; // first day (inclusive)
const SCHOOL_YEAR_END   = "2026-06-25"; // last day (inclusive)

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
