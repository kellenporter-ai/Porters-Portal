import React from 'react';
import { User, StudentBucketProfile, StudentAlert, TelemetryBucket } from '../../types';
import { BUCKET_META } from '../../lib/telemetry';
import { Zap, Shield, Flame, AlertTriangle } from 'lucide-react';

interface OverallStandingProps {
  student: User;
  bucket: StudentBucketProfile | null;
  alerts: StudentAlert[];
}

const RISK_ORDER = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 } as const;

const OverallStanding: React.FC<OverallStandingProps> = ({ student, bucket, alerts }) => {
  const xp = student.gamification?.xp || 0;
  const level = student.gamification?.level || 1;
  const currency = student.gamification?.currency || 0;
  const enrolledClasses = student.enrolledClasses || [];
  const classXp = student.gamification?.classXp || {};
  const loginStreak = student.gamification?.loginStreak || 0;

  const highestAlert = alerts.length > 0
    ? alerts.sort((a, b) => (RISK_ORDER[a.riskLevel as keyof typeof RISK_ORDER] ?? 3) - (RISK_ORDER[b.riskLevel as keyof typeof RISK_ORDER] ?? 3))[0]
    : null;

  const bucketMeta = bucket ? BUCKET_META[bucket.bucket as TelemetryBucket] : null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-widest print:text-gray-700">Overall Standing</h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl p-4 text-center print:border-gray-300 print:bg-gray-50">
          <Zap className="w-5 h-5 text-purple-400 mx-auto mb-1 print:text-purple-600" />
          <div className="text-lg font-bold text-[var(--text-primary)] print:text-black">{xp.toLocaleString()}</div>
          <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Total XP</div>
        </div>
        <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl p-4 text-center print:border-gray-300 print:bg-gray-50">
          <Shield className="w-5 h-5 text-cyan-400 mx-auto mb-1 print:text-cyan-600" />
          <div className="text-lg font-bold text-[var(--text-primary)] print:text-black">Lv. {level}</div>
          <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Level</div>
        </div>
        <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl p-4 text-center print:border-gray-300 print:bg-gray-50">
          <Flame className="w-5 h-5 text-orange-400 mx-auto mb-1 print:text-orange-600" />
          <div className="text-lg font-bold text-[var(--text-primary)] print:text-black">{loginStreak}</div>
          <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Login Streak</div>
        </div>
        <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl p-4 text-center print:border-gray-300 print:bg-gray-50">
          <Zap className="w-5 h-5 text-yellow-400 mx-auto mb-1 print:text-yellow-600" />
          <div className="text-lg font-bold text-[var(--text-primary)] print:text-black">{currency}</div>
          <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Cyber-Flux</div>
        </div>
      </div>

      {/* Per-class XP */}
      {enrolledClasses.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {enrolledClasses.map(cls => (
            <div key={cls} className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl px-3 py-1.5 text-xs print:border-gray-300">
              <span className="text-[var(--text-tertiary)] print:text-gray-600">{cls}:</span>{' '}
              <span className="text-[var(--text-primary)] font-bold print:text-black">{(classXp[cls] || 0).toLocaleString()} XP</span>
            </div>
          ))}
        </div>
      )}

      {/* Bucket + Alert */}
      <div className="flex flex-wrap gap-3">
        {bucketMeta && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${bucketMeta.borderColor} ${bucketMeta.bgColor}`}>
            <span className="text-[11.5px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">Bucket:</span>
            <span className={`text-sm font-bold ${bucketMeta.color}`}>{bucketMeta.label}</span>
            {bucket && <span className="text-[11.5px] text-[var(--text-muted)]">ES: {bucket.engagementScore}</span>}
          </div>
        )}
        {highestAlert && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
            highestAlert.riskLevel === 'CRITICAL' ? 'border-red-500/50 bg-red-500/10' :
            highestAlert.riskLevel === 'HIGH' ? 'border-orange-500/50 bg-orange-500/10' :
            highestAlert.riskLevel === 'MODERATE' ? 'border-yellow-500/50 bg-yellow-500/10' :
            'border-blue-500/50 bg-blue-500/10'
          }`}>
            <AlertTriangle className={`w-4 h-4 ${
              highestAlert.riskLevel === 'CRITICAL' ? 'text-red-400' :
              highestAlert.riskLevel === 'HIGH' ? 'text-orange-400' :
              highestAlert.riskLevel === 'MODERATE' ? 'text-yellow-400' : 'text-blue-400'
            }`} />
            <span className="text-xs font-bold text-[var(--text-primary)] print:text-black">{highestAlert.riskLevel}</span>
            <span className="text-[11.5px] text-[var(--text-tertiary)] print:text-[var(--text-tertiary)]">{highestAlert.reason.replace(/_/g, ' ')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default OverallStanding;
