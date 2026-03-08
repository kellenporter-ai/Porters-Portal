/**
 * CSV Grade Export for Google Classroom
 *
 * Generates a CSV string from graded Portal submissions and optionally
 * triggers a browser file download. The CSV format matches Google
 * Classroom's grade import expectations.
 */

export interface GradedStudent {
  email: string;
  displayName: string;
  overallPercentage: number;
}

export interface GradeCSVParams {
  students: GradedStudent[];
  maxPoints: number;
  assessmentTitle: string;
}

/**
 * Convert an overall percentage (0–100) to points for the assignment.
 */
function toPoints(percentage: number, maxPoints: number): number {
  return Math.round((percentage / 100) * maxPoints * 100) / 100;
}

/**
 * Sanitize a string for use as a filename — strips characters that are
 * problematic on common file systems and replaces spaces with hyphens.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate a CSV string suitable for Google Classroom grade import.
 *
 * Output format:
 * ```
 * Email,Grade
 * student@school.com,85
 * ```
 */
export function generateGradeCSV({
  students,
  maxPoints,
}: GradeCSVParams): string {
  const header = "Email,Grade";
  const rows = students.map(
    (s) => `${s.email},${toPoints(s.overallPercentage, maxPoints)}`
  );
  return [header, ...rows].join("\n") + "\n";
}

/**
 * Trigger a browser file download of the grade CSV.
 */
export function downloadGradeCSV(params: GradeCSVParams): void {
  const csv = generateGradeCSV(params);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const filename = `${sanitizeFilename(params.assessmentTitle)}-grades.csv`;

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
