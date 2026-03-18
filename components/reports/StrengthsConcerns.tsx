import React, { useMemo } from 'react';
import { Submission, StudentBucketProfile, StudentAlert, TelemetryBucket } from '../../types';
import { CheckCircle, AlertTriangle } from 'lucide-react';

interface StrengthsConcernsProps {
  submissions: Submission[];
  bucket: StudentBucketProfile | null;
  alerts: StudentAlert[];
}

const StrengthsConcerns: React.FC<StrengthsConcernsProps> = ({ submissions, bucket, alerts }) => {
  const { strengths, concerns } = useMemo(() => {
    const strengths: string[] = [];
    const concerns: string[] = [];
    const completed = submissions.filter(s => s.status !== 'STARTED');

    // Bucket-based
    if (bucket) {
      const b = bucket.bucket as TelemetryBucket;
      if (b === 'THRIVING') strengths.push('Classified as THRIVING — consistently high engagement with original work');
      if (b === 'ON_TRACK') strengths.push('Classified as ON TRACK — meeting expectations with steady engagement');
      if (b === 'STRUGGLING') concerns.push('Classified as STRUGGLING — high effort but low results; may need direct support');
      if (b === 'DISENGAGING') concerns.push('Classified as DISENGAGING — activity is declining from previous levels');
      if (b === 'INACTIVE') concerns.push('Classified as INACTIVE — no meaningful activity in recent analysis window');
      if (b === 'COPYING') concerns.push('Classified as COPYING — high paste-to-keystroke ratio suggests copy-paste behavior');
      if (b === 'COASTING') concerns.push('Classified as COASTING — doing the minimum; engagement is below average');
      if (b === 'SPRINTING') concerns.push('Classified as SPRINTING — bursts of activity with gaps; inconsistent work habits');
    }

    // Alert-based
    for (const alert of alerts) {
      concerns.push(`${alert.riskLevel} alert: ${alert.message || alert.reason.replace(/_/g, ' ')}`);
    }

    // Engagement metrics
    if (completed.length > 0) {
      const totalTime = completed.reduce((a, s) => a + (s.metrics?.engagementTime || 0), 0);
      const avgTime = totalTime / completed.length / 60; // minutes
      const totalPastes = completed.reduce((a, s) => a + (s.metrics?.pasteCount || 0), 0);
      const totalKeystrokes = completed.reduce((a, s) => a + (s.metrics?.keystrokes || 0), 0);
      const pasteRatio = (totalKeystrokes + totalPastes) > 0 ? totalPastes / (totalKeystrokes + totalPastes) : 0;
      const activityDays = new Set(completed.map(s => s.submittedAt?.split('T')[0]).filter(Boolean)).size;

      if (avgTime >= 10) strengths.push(`Strong engagement: averaging ${Math.round(avgTime)} minutes per submission`);
      if (avgTime < 2 && completed.length > 3) concerns.push(`Very low engagement time: averaging only ${Math.round(avgTime)} minutes per submission`);
      if (activityDays >= 5) strengths.push(`Consistent activity: active on ${activityDays} distinct days`);
      if (activityDays <= 1 && completed.length >= 3) concerns.push('Activity concentrated in a single day — inconsistent work habit');
      if (pasteRatio > 0.3) concerns.push(`Elevated paste ratio (${Math.round(pasteRatio * 100)}%) — review for academic integrity`);
      if (pasteRatio < 0.05 && totalKeystrokes > 200) strengths.push('Low paste ratio with high keystroke count — strong independent work');

      // Assessment performance
      const assessed = completed.filter(s => s.isAssessment);
      const scores = assessed.map(s => s.rubricGrade?.overallPercentage ?? s.assessmentScore?.percentage).filter((v): v is number => v != null);
      if (scores.length > 0) {
        const avg = scores.reduce((a, v) => a + v, 0) / scores.length;
        if (avg >= 80) strengths.push(`Strong assessment performance: averaging ${Math.round(avg)}%`);
        if (avg < 50) concerns.push(`Low assessment scores: averaging ${Math.round(avg)}%`);
      }
    } else {
      concerns.push('No completed submissions found in this time period');
    }

    return { strengths, concerns };
  }, [submissions, bucket, alerts]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-widest print:text-gray-700">Strengths & Areas of Concern</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Strengths */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 print:border-emerald-300 print:bg-emerald-50">
          <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-1.5 print:text-emerald-700">
            <CheckCircle className="w-4 h-4" /> Strengths
          </h4>
          {strengths.length > 0 ? (
            <ul className="space-y-2">
              {strengths.map((s, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] print:text-gray-700 flex items-start gap-2">
                  <span className="text-emerald-400 print:text-emerald-600 mt-0.5 shrink-0">+</span>
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--text-muted)] italic">No notable strengths identified in this period.</p>
          )}
        </div>

        {/* Concerns */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 print:border-red-300 print:bg-red-50">
          <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3 flex items-center gap-1.5 print:text-red-700">
            <AlertTriangle className="w-4 h-4" /> Areas of Concern
          </h4>
          {concerns.length > 0 ? (
            <ul className="space-y-2">
              {concerns.map((c, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] print:text-gray-700 flex items-start gap-2">
                  <span className="text-red-400 print:text-red-600 mt-0.5 shrink-0">!</span>
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--text-muted)] italic">No concerns identified — student is performing well.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default StrengthsConcerns;
