
import React, { useState, useEffect } from 'react';
import { TutoringSession } from '../../types';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import { GraduationCap, Hand, CheckCircle2, Clock, Plus, Users } from 'lucide-react';

interface TutoringPanelProps {
  userId: string;
  userName: string;
  classType: string;
  isAdmin?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  MATCHED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  IN_PROGRESS: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  COMPLETED: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  VERIFIED: 'bg-green-500/10 text-green-400 border-green-500/20',
};

const TutoringPanel: React.FC<TutoringPanelProps> = ({ userId, userName, classType, isAdmin }) => {
  const [sessions, setSessions] = useState<TutoringSession[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [topic, setTopic] = useState('');
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = dataService.subscribeToTutoringSessions(classType, setSessions);
    } catch {
      // Firestore permission error — feature not available for this user
    }
    return () => unsub?.();
  }, [classType]);

  const handleCreateRequest = async () => {
    if (!topic.trim() || creating) return;
    setCreating(true);
    try {
      await dataService.createTutoringRequest(userId, userName, topic, classType);
      toast.success('Tutoring request posted!');
      setTopic('');
      setShowCreate(false);
    } catch (err) {
      toast.error('Failed to create request');
    }
    setCreating(false);
  };

  const handleClaimTutor = async (sessionId: string) => {
    try {
      await dataService.claimTutorRole(sessionId, userId, userName);
      toast.success('You are now the tutor for this session!');
    } catch (err) {
      toast.error('Failed to claim tutor role');
    }
  };

  const handleStartSession = async (sessionId: string) => {
    try {
      await dataService.startTutoringSession(sessionId);
      toast.success('Session started!');
    } catch (err) {
      toast.error('Failed to start session');
    }
  };

  const handleMarkComplete = async (sessionId: string) => {
    try {
      await dataService.markTutoringComplete(sessionId);
      toast.success('Session marked complete — awaiting admin verification.');
    } catch (err) {
      toast.error('Failed to mark complete');
    }
  };

  const handleVerify = async (sessionId: string, tutorId: string) => {
    try {
      const result = await dataService.completeTutoring(sessionId, tutorId);
      toast.success(`Verified! Tutor earned ${result.xpAwarded} XP and ${result.fluxAwarded} Flux`);
    } catch (err) {
      toast.error('Failed to verify session');
    }
  };

  const openSessions = sessions.filter(s => s.status === 'OPEN');
  const activeSessions = sessions.filter(s => ['MATCHED', 'IN_PROGRESS'].includes(s.status));
  const completedSessions = sessions.filter(s => s.status === 'VERIFIED');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-green-400" /> Peer Tutoring
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1 px-3 py-1.5 bg-green-600/20 border border-green-500/30 text-green-400 text-xs font-bold rounded-lg hover:bg-green-600/30 transition"
        >
          <Plus className="w-3 h-3" /> Request Help
        </button>
      </div>

      <p className="text-xs text-gray-500">Help classmates and earn XP + Cyber-Flux rewards!</p>

      {/* Create request form */}
      {showCreate && (
        <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-2">
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="What do you need help with?"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-green-500/50"
            maxLength={200}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateRequest}
              disabled={!topic.trim() || creating}
              className="px-4 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-500 transition disabled:opacity-50"
            >
              {creating ? 'Posting...' : 'Post Request'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-gray-400 text-xs hover:text-white transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Open requests */}
      {openSessions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-gray-600 flex items-center gap-1">
            <Hand className="w-3 h-3" /> Open Requests
          </h4>
          {openSessions.map(session => (
            <div key={session.id} className="p-3 bg-white/5 border border-white/10 rounded-xl">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-white font-medium">{session.topic}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Requested by {session.requesterName} - {new Date(session.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[session.status]}`}>
                  {session.status}
                </span>
              </div>
              {session.requesterId !== userId && (
                <button
                  onClick={() => handleClaimTutor(session.id)}
                  className="mt-2 px-3 py-1 bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xs font-bold rounded-lg hover:bg-blue-600/30 transition"
                >
                  <Users className="w-3 h-3 inline mr-1" /> I can help!
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Active sessions */}
      {activeSessions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-gray-600 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Active Sessions
          </h4>
          {activeSessions.map(session => {
            const isParticipant = session.requesterId === userId || session.tutorId === userId;
            return (
            <div key={session.id} className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl">
              <p className="text-sm text-white font-medium">{session.topic}</p>
              <p className="text-[10px] text-gray-500">
                {session.requesterName} ↔ {session.tutorName || 'Finding tutor...'}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[session.status]}`}>
                  {session.status}
                </span>
                {/* Matched → Start working */}
                {session.status === 'MATCHED' && isParticipant && (
                  <button onClick={() => handleStartSession(session.id)}
                    className="px-3 py-1 bg-purple-600/20 border border-purple-500/30 text-purple-400 text-xs font-bold rounded-lg hover:bg-purple-600/30 transition">
                    Start Session
                  </button>
                )}
                {/* In Progress → Mark complete */}
                {session.status === 'IN_PROGRESS' && isParticipant && (
                  <button onClick={() => handleMarkComplete(session.id)}
                    className="px-3 py-1 bg-green-600/20 border border-green-500/30 text-green-400 text-xs font-bold rounded-lg hover:bg-green-600/30 transition">
                    <CheckCircle2 className="w-3 h-3 inline mr-1" /> Mark Complete
                  </button>
                )}
                {isAdmin && session.tutorId && session.status !== 'VERIFIED' && (
                  <button onClick={() => handleVerify(session.id, session.tutorId!)}
                    className="px-3 py-1 bg-green-600/20 border border-green-500/30 text-green-400 text-xs font-bold rounded-lg">
                    <CheckCircle2 className="w-3 h-3 inline mr-1" /> Verify & Award
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Sessions awaiting verification */}
      {sessions.filter(s => s.status === 'COMPLETED').length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-amber-600 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Awaiting Verification
          </h4>
          {sessions.filter(s => s.status === 'COMPLETED').map(session => (
            <div key={session.id} className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <p className="text-sm text-white font-medium">{session.topic}</p>
              <p className="text-[10px] text-gray-500">{session.requesterName} ↔ {session.tutorName}</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20 mt-1 inline-block">
                Awaiting teacher verification
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Completed */}
      {completedSessions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-gray-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-400" /> Completed ({completedSessions.length})
          </h4>
          {completedSessions.slice(0, 3).map(session => (
            <div key={session.id} className="p-2 bg-green-500/5 border border-green-500/10 rounded-lg flex justify-between items-center">
              <span className="text-xs text-gray-400 truncate">{session.topic}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[session.status]}`}>
                {session.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {sessions.length === 0 && (
        <div className="text-center py-6 text-gray-600">
          <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-xs">No tutoring sessions yet. Be the first to ask for help!</p>
        </div>
      )}
    </div>
  );
};

export default TutoringPanel;
