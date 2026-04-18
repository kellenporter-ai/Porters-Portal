import React, { useState } from 'react';
import { User, Submission, StudentBucketProfile, StudentAlert, Assignment, TelemetryBucket } from '../../types';
import { BUCKET_META } from '../../lib/telemetry';
import { Printer, Copy, Check, Calendar } from 'lucide-react';

interface ReportActionsProps {
  student: User;
  submissions: Submission[];
  assignments: Assignment[];
  bucket: StudentBucketProfile | null;
  alerts: StudentAlert[];
  daysRange: number;
  onDaysRangeChange: (days: number) => void;
}

const RANGE_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: 'All', value: 365 },
];

function generatePlainText(
  student: User,
  submissions: Submission[],
  assignments: Assignment[],
  bucket: StudentBucketProfile | null,
  alerts: StudentAlert[],
): string {
  const lines: string[] = [];
  const enrolledClasses = student.enrolledClasses || [];
  const xp = student.gamification?.xp || 0;
  const level = student.gamification?.level || 1;
  const completed = submissions.filter(s => s.status !== 'STARTED');

  lines.push(`STUDENT PROGRESS REPORT`);
  lines.push(`Generated: ${new Date().toLocaleDateString()}`);
  lines.push('');
  lines.push(`Name: ${student.name}`);
  lines.push(`Email: ${student.email}`);
  lines.push(`Section: ${student.section || 'Unassigned'}`);
  lines.push(`Classes: ${enrolledClasses.join(', ') || 'None'}`);
  lines.push(`Level: ${level} | XP: ${xp.toLocaleString()}`);
  lines.push('');

  // Bucket
  if (bucket) {
    const meta = BUCKET_META[bucket.bucket as TelemetryBucket];
    lines.push(`Engagement Bucket: ${meta?.label || bucket.bucket}`);
    lines.push(`Engagement Score: ${bucket.engagementScore}`);
  }

  // Alerts
  if (alerts.length > 0) {
    lines.push(`Active Alerts: ${alerts.map(a => `${a.riskLevel} (${a.reason.replace(/_/g, ' ')})`).join(', ')}`);
  }
  lines.push('');

  // Engagement
  const totalTime = Math.round(completed.reduce((a, s) => a + (s.metrics?.engagementTime || 0), 0) / 60);
  const avgTime = completed.length > 0 ? Math.round(totalTime / completed.length) : 0;
  lines.push(`ENGAGEMENT`);
  lines.push(`Total Time: ${totalTime} minutes | Submissions: ${completed.length} | Avg Time/Sub: ${avgTime} min`);
  lines.push('');

  // Assessments
  const assessed = completed.filter(s => s.isAssessment);
  if (assessed.length > 0) {
    lines.push(`ASSESSMENTS`);
    for (const s of assessed) {
      const a = assignments.find(a => a.id === s.assignmentId);
      const pct = s.rubricGrade?.overallPercentage ?? s.assessmentScore?.percentage ?? null;
      lines.push(`  ${a?.title || s.assignmentTitle}: ${pct !== null ? `${Math.round(pct)}%` : 'ungraded'}`);
    }
    lines.push('');
  }

  // Behavioral
  const totalPastes = completed.reduce((a, s) => a + (s.metrics?.pasteCount || 0), 0);
  const totalKeystrokes = completed.reduce((a, s) => a + (s.metrics?.keystrokes || 0), 0);
  const pasteRatio = (totalKeystrokes + totalPastes) > 0 ? Math.round((totalPastes / (totalKeystrokes + totalPastes)) * 100) : 0;
  lines.push(`BEHAVIORAL INDICATORS`);
  lines.push(`Paste Ratio: ${pasteRatio}% | Keystrokes: ${totalKeystrokes.toLocaleString()} | Pastes: ${totalPastes}`);

  return lines.join('\n');
}

const ReportActions: React.FC<ReportActionsProps> = ({
  student, submissions, assignments, bucket, alerts, daysRange, onDaysRangeChange
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = generatePlainText(student, submissions, assignments, bucket, alerts);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-3 print:hidden">
      {/* Date range selector */}
      <div className="flex items-center gap-1.5 bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl p-1">
        <Calendar className="w-4 h-4 text-[var(--text-muted)] ml-2" />
        {RANGE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onDaysRangeChange(opt.value)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
              daysRange === opt.value
                ? 'bg-purple-500/30 text-purple-300 border border-purple-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Copy */}
      <button
        onClick={handleCopy}
        className="flex items-center gap-2 px-4 py-2 bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] transition"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied!' : 'Copy as Text'}
      </button>

      {/* Print */}
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-xl text-xs font-bold text-purple-300 hover:bg-purple-500/30 transition"
      >
        <Printer className="w-4 h-4" />
        Print Report
      </button>
    </div>
  );
};

export default ReportActions;
