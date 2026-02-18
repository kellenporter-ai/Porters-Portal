
import React, { useMemo } from 'react';
import { User, Submission, Assignment } from '../types';
import { X, Zap, Clock, BookOpen, Shield, Crosshair, Flame, Package } from 'lucide-react';
import { getRankDetails, calculatePlayerStats, calculateGearScore } from '../lib/gamification';
import { getClassProfile } from '../lib/classProfile';

interface StudentDetailDrawerProps {
  student: User;
  submissions: Submission[];
  assignments: Assignment[];
  onClose: () => void;
}

const StudentDetailDrawer: React.FC<StudentDetailDrawerProps> = ({ student, submissions, assignments, onClose }) => {
  const level = student.gamification?.level || 1;
  const xp = student.gamification?.xp || 0;
  const currency = student.gamification?.currency || 0;
  const rankDetails = getRankDetails(level);
  const playerStats = calculatePlayerStats(student);
  const enrolledClasses = student.enrolledClasses || (student.classType ? [student.classType] : []);
  const completedQuests = student.gamification?.completedQuests?.length || 0;
  const activeQuests = student.gamification?.activeQuests?.filter(q => q.status === 'ACCEPTED' || q.status === 'DEPLOYED').length || 0;

  // Per-class breakdown
  const classBreakdown = useMemo(() => {
    return enrolledClasses.map(cls => {
      const classXp = student.gamification?.classXp?.[cls] || 0;
      const profile = getClassProfile(student, cls);
      const gearScore = calculateGearScore(profile.equipped);
      const inventoryCount = profile.inventory.length;
      const classSubs = submissions.filter(s => {
        const a = assignments.find(a => a.id === s.assignmentId);
        return a?.classType === cls;
      });
      const totalTime = Math.round(classSubs.reduce((acc, s) => acc + (s.metrics?.engagementTime || 0), 0) / 60);
      return { cls, classXp, gearScore, inventoryCount, resourcesViewed: classSubs.length, totalTime };
    });
  }, [student, submissions, assignments, enrolledClasses]);

  // Recent activity (last 10 submissions)
  const recentActivity = useMemo(() => {
    return submissions
      .filter(s => s.submittedAt)
      .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime())
      .slice(0, 10)
      .map(s => ({
        ...s,
        assignmentTitle: assignments.find(a => a.id === s.assignmentId)?.title || s.assignmentTitle,
        classType: assignments.find(a => a.id === s.assignmentId)?.classType || 'Unknown'
      }));
  }, [submissions, assignments]);

  const totalTime = Math.round(submissions.reduce((acc, s) => acc + (s.metrics?.engagementTime || 0), 0) / 60);

  // Streak (weeks with activity based on submission dates)
  const streak = useMemo(() => {
    const weeks = new Set<string>();
    submissions.forEach(s => {
      if (s.submittedAt) {
        const d = new Date(s.submittedAt);
        const year = d.getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
        weeks.add(`${year}-W${weekNum}`);
      }
    });
    // Count consecutive weeks ending at current
    const now = new Date();
    const year = now.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const currentWeek = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    let count = 0;
    for (let w = currentWeek; w > 0; w--) {
      if (weeks.has(`${year}-W${w}`)) count++;
      else break;
    }
    return count;
  }, [submissions]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#12132a]/98 border-l border-white/10 h-full overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-300 shadow-2xl">
        
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#12132a]/95 backdrop-blur-md border-b border-white/5 p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl p-0.5 bg-gradient-to-tr from-white/10 to-white/5 ${rankDetails.tierGlow} shadow-xl`}>
              {student.avatarUrl ? (
                <img src={student.avatarUrl} alt={student.name} className={`w-full h-full rounded-2xl border-2 object-cover ${rankDetails.tierColor.split(' ')[0]}`} />
              ) : (
                <div className={`w-full h-full rounded-2xl border-2 ${rankDetails.tierColor.split(' ')[0]} bg-purple-500/20 flex items-center justify-center text-xl font-bold text-white`}>
                  {student.name.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{student.name}</h2>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono uppercase font-bold tracking-widest ${rankDetails.tierColor.split(' ')[1]}`}>{rankDetails.rankName}</span>
                <span className="text-[10px] text-gray-500">· Lv.{level}</span>
              </div>
              {student.gamification?.codename && (
                <div className="text-[10px] text-purple-400 italic">"{student.gamification.codename}"</div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Zap className="w-5 h-5 text-purple-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{xp.toLocaleString()}</div>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Total XP</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Clock className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{totalTime}m</div>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Total Time</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <BookOpen className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{submissions.length}</div>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Resources</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Crosshair className="w-5 h-5 text-orange-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{completedQuests}</div>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Missions</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Package className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{currency}</div>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Cyber-Flux</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Flame className="w-5 h-5 text-red-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{streak}w</div>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Streak</div>
            </div>
          </div>

          {/* Stat Radar (text-based) */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Operative Stats</h4>
            <div className="space-y-2">
              {Object.entries(playerStats).map(([stat, val]) => (
                <div key={stat} className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-400 uppercase w-16 font-bold">{stat}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 rounded-full transition-all" style={{ width: `${Math.min(100, val)}%` }} />
                  </div>
                  <span className="text-xs text-white font-bold w-8 text-right">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-Class Breakdown */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Class Performance</h4>
            <div className="space-y-3">
              {classBreakdown.map(cb => (
                <div key={cb.cls} className="bg-black/20 rounded-xl p-3 border border-white/5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-white">{cb.cls}</span>
                    <span className="text-xs text-purple-400 font-bold">{cb.classXp.toLocaleString()} XP</span>
                  </div>
                  <div className="flex gap-4 text-[10px] text-gray-400">
                    <span><Shield className="w-3 h-3 inline mr-0.5" />{cb.gearScore} GS</span>
                    <span><Package className="w-3 h-3 inline mr-0.5" />{cb.inventoryCount} items</span>
                    <span><BookOpen className="w-3 h-3 inline mr-0.5" />{cb.resourcesViewed} viewed</span>
                    <span><Clock className="w-3 h-3 inline mr-0.5" />{cb.totalTime}m</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Recent Activity</h4>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-gray-500 italic text-center py-4">No recorded activity.</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map(s => {
                  const engMin = Math.round((s.metrics?.engagementTime || 0) / 60);
                  return (
                    <div key={s.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                      <div className={`w-2 h-2 rounded-full ${engMin >= 5 ? 'bg-green-500' : engMin >= 1 ? 'bg-yellow-500' : 'bg-gray-500'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white font-bold truncate">{s.assignmentTitle}</div>
                        <div className="text-[10px] text-gray-500">{s.classType} · {engMin}m engaged</div>
                      </div>
                      <div className="text-[10px] text-gray-500 whitespace-nowrap">
                        {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Quests */}
          {activeQuests > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Active Missions</h4>
              <div className="space-y-2">
                {student.gamification?.activeQuests?.filter(q => q.status === 'ACCEPTED' || q.status === 'DEPLOYED').map(q => (
                  <div key={q.questId} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-2">
                      <Crosshair className={`w-3.5 h-3.5 ${q.status === 'DEPLOYED' ? 'text-yellow-400' : 'text-blue-400'}`} />
                      <span className="text-xs text-white">{q.questId}</span>
                    </div>
                    <span className={`text-[10px] font-bold uppercase ${q.status === 'DEPLOYED' ? 'text-yellow-400' : 'text-blue-400'}`}>
                      {q.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="text-[10px] text-gray-600 space-y-1 pb-4">
            <div>Email: {student.email}</div>
            <div>Section: {student.section || 'Unassigned'}</div>
            <div>Enrolled: {enrolledClasses.join(', ') || 'None'}</div>
            <div>Last login: {student.lastLoginAt ? new Date(student.lastLoginAt).toLocaleString() : 'Never'}</div>
            <div>Created: {student.createdAt ? new Date(student.createdAt).toLocaleDateString() : '—'}</div>
            {student.mutedUntil && new Date(student.mutedUntil) > new Date() && (
              <div className="text-orange-400 font-bold">⚠ Muted until {new Date(student.mutedUntil).toLocaleString()}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDetailDrawer;
