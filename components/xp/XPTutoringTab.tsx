import React, { useState, useMemo } from 'react';
import { TutoringSession } from '../../types';
import { GraduationCap, MessageCircle, CheckCircle2, X } from 'lucide-react';

interface XPTutoringTabProps {
  allSessions: TutoringSession[];
  onVerify: (sessionId: string, tutorId: string) => void;
  onCancel: (sessionId: string) => void;
}

const XPTutoringTab: React.FC<XPTutoringTabProps> = ({ allSessions, onVerify, onCancel }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('pending');

  const pendingTutoringSessions = useMemo(
    () => allSessions.filter(s => ['OPEN', 'MATCHED', 'IN_PROGRESS', 'COMPLETED'].includes(s.status)),
    [allSessions]
  );

  const displayedSessions = activeTab === 'pending' ? pendingTutoringSessions : allSessions;

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-muted)] mb-2">
        Monitor peer tutoring sessions. Verify completed sessions to award XP and Flux to tutors.
      </p>

      {/* Sub-tab switcher */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'pending'
              ? 'bg-amber-600 text-white'
              : 'bg-[var(--surface-glass)] text-[var(--text-tertiary)] hover:bg-[var(--surface-glass-heavy)]'
          }`}
        >
          Pending ({pendingTutoringSessions.length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'all'
              ? 'bg-purple-600 text-white'
              : 'bg-[var(--surface-glass)] text-[var(--text-tertiary)] hover:bg-[var(--surface-glass-heavy)]'
          }`}
        >
          All Sessions ({allSessions.length})
        </button>
      </div>

      {/* Empty state */}
      {displayedSessions.length === 0 && (
        <div className="text-center py-14 text-[var(--text-muted)]">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-bold">
            {activeTab === 'pending' ? 'No pending sessions.' : 'No tutoring sessions yet.'}
          </p>
        </div>
      )}

      {/* Session cards */}
      {displayedSessions.map(session => (
        <div
          key={session.id}
          className={`p-5 rounded-2xl border transition-all ${
            session.status === 'VERIFIED'
              ? 'bg-green-600/5 border-green-500/20'
              : session.status === 'MATCHED' || session.status === 'IN_PROGRESS'
                ? 'bg-purple-600/5 border-purple-500/20'
                : session.status === 'OPEN'
                  ? 'bg-blue-600/5 border-blue-500/20'
                  : 'bg-[var(--panel-bg)] border-[var(--border)]'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0">
              {/* Topic + status badge */}
              <div className="flex items-center gap-2 mb-1">
                <MessageCircle className="w-4 h-4 text-[var(--text-muted)]" />
                <h4 className="font-bold text-[var(--text-primary)] text-sm truncate">{session.topic}</h4>
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full border font-bold ${
                    session.status === 'OPEN'
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      : session.status === 'MATCHED'
                        ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                        : session.status === 'IN_PROGRESS'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          : session.status === 'VERIFIED'
                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                            : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                  }`}
                >
                  {session.status}
                </span>
              </div>

              {/* Session metadata */}
              <div className="flex flex-wrap gap-3 text-[10px] text-[var(--text-muted)]">
                <span>
                  Requester: <span className="text-[var(--text-secondary)] font-bold">{session.requesterName}</span>
                </span>
                {session.tutorName && (
                  <span>
                    Tutor: <span className="text-green-400 font-bold">{session.tutorName}</span>
                  </span>
                )}
                <span>
                  Class: <span className="text-purple-400">{session.classType}</span>
                </span>
                <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                {session.completedAt && (
                  <span>Completed: {new Date(session.completedAt).toLocaleDateString()}</span>
                )}
              </div>

              {/* Feedback display */}
              {(session.requesterFeedback || session.tutorFeedback) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  {session.requesterFeedback && (
                    <div className="p-2 bg-[var(--panel-bg)] rounded-lg border border-[var(--border)]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold text-cyan-700 dark:text-cyan-400 uppercase">
                          Student Feedback
                        </span>
                        <span className="text-[9px] text-yellow-400">
                          {'★'.repeat(session.requesterFeedback.rating)}
                          {'☆'.repeat(5 - session.requesterFeedback.rating)}
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)]">
                          Comm: {session.requesterFeedback.communicationRating}/5
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
                        {session.requesterFeedback.response}
                      </p>
                    </div>
                  )}
                  {session.tutorFeedback && (
                    <div className="p-2 bg-[var(--panel-bg)] rounded-lg border border-[var(--border)]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold text-green-400 uppercase">
                          Tutor Feedback
                        </span>
                        <span className="text-[9px] text-yellow-400">
                          {'★'.repeat(session.tutorFeedback.rating)}
                          {'☆'.repeat(5 - session.tutorFeedback.rating)}
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)]">
                          Engage: {session.tutorFeedback.communicationRating}/5
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
                        {session.tutorFeedback.response}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {session.tutorId && session.status === 'COMPLETED' && (
                <button
                  onClick={() => onVerify(session.id, session.tutorId!)}
                  className="px-3 py-1.5 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 transition border border-green-500/20 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3" /> Verify & Award
                </button>
              )}
              {session.status !== 'VERIFIED' && (
                <button
                  onClick={() => onCancel(session.id)}
                  className="px-3 py-1.5 bg-red-600/10 text-red-400 rounded-lg hover:bg-red-600/20 transition border border-red-500/20 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              )}
              {session.status === 'VERIFIED' && (
                <span className="text-[10px] text-green-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> +{session.xpReward} XP, +{session.fluxReward || 25} Flux
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default XPTutoringTab;
