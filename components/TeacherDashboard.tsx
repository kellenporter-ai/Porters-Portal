
import React, { useEffect, useState } from 'react';
import { User, ChatFlag, Announcement, Assignment, Submission } from '../types';
import { Users, Clock, FileText, Zap, ShieldAlert, CheckCircle, MicOff, AlertTriangle, RefreshCw, Check, Trash2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useConfirm } from './ConfirmDialog';
import AnnouncementManager from './AnnouncementManager';
import StudentDetailDrawer from './StudentDetailDrawer';

interface TeacherDashboardProps {
  users: User[];
  assignments?: Assignment[];
  submissions?: Submission[];
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ users, assignments = [], submissions = [] }) => {
  const { confirm } = useConfirm();
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [flags, setFlags] = useState<ChatFlag[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
      const unsub = dataService.subscribeToChatFlags(setFlags);
      const unsubAnnouncements = dataService.subscribeToAnnouncements(setAnnouncements);
      const interval = setInterval(() => setNow(Date.now()), 60000); // Update 'expires in' every minute
      return () => {
          unsub();
          unsubAnnouncements();
          clearInterval(interval);
      };
  }, []);

  const students = users.filter(u => u.role === 'STUDENT');
  
  // Stats
  const totalStudents = students.length;
  const avgTime = Math.round(students.reduce((acc, s) => acc + (s.stats?.totalTime || 0), 0) / (totalStudents || 1));
  const totalResourcesAccessed = students.reduce((acc, s) => acc + (s.stats?.problemsCompleted || 0), 0);
  const totalXP = students.reduce((acc, s) => acc + (s.gamification?.xp || 0), 0);

  // Derived Moderation Data
  const mutedStudents = students.filter(s => s.mutedUntil && new Date(s.mutedUntil).getTime() > now);

  const handleUnmute = async (userId: string) => {
      if(await confirm({ message: "Lift silence sanction for this operative?", confirmLabel: "Unmute", variant: "info" })) {
          await dataService.muteUser(userId, 0);
      }
  };

  const handleMuteFromFlag = async (senderId: string, senderName: string) => {
      if (await confirm({ message: `Mute ${senderName} for 1 hour?`, confirmLabel: "Mute", variant: "warning" })) {
          await dataService.muteUser(senderId, 60);
      }
  };

  const handleExtendMute = async (userId: string, currentMute: string) => {
      const currentEnd = new Date(currentMute).getTime();
      // Add 1 hour to the current expiry
      const newEnd = new Date(Math.max(currentEnd, Date.now()) + 60 * 60 * 1000); 
      // Calculate minutes from now
      const minutesFromNow = Math.ceil((newEnd.getTime() - Date.now()) / 60000);
      await dataService.muteUser(userId, minutesFromNow);
  };
  
  const StatCard = ({ label, value, icon, color }: { label: string, value: string | number, icon: React.ReactNode, color: string }) => (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-all duration-300">
      <div className={`absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity ${color}`}>
        {icon}
      </div>
      <div className="relative z-10">
        <div className="text-4xl font-bold text-white mb-2">{value}</div>
        <div className="text-sm font-medium text-gray-400 uppercase tracking-wider">{label}</div>
      </div>
      <div className={`absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r ${color}`}></div>
    </div>
  );

  const getTimeRemaining = (isoString: string) => {
      const end = new Date(isoString).getTime();
      const diff = end - now;
      if (diff <= 0) return 'Expired';
      const mins = Math.ceil(diff / 60000);
      if (mins > 60) return `${Math.ceil(mins/60)} hrs`;
      return `${mins} mins`;
  };

  const formatLastSeen = (dateStr?: string) => {
      if (!dateStr) return 'Never';
      const date = new Date(dateStr);
      const diff = Date.now() - date.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return date.toLocaleDateString();
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex justify-between items-end">
        <div>
            <h1 className="text-3xl font-bold text-white mb-2">Teacher Dashboard</h1>
            <p className="text-gray-400">Engagement analytics and operational overview.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="Total Students" value={totalStudents} icon={<Users className="w-12 h-12" />} color="from-blue-500 to-cyan-400" />
          <StatCard label="Total XP Awarded" value={totalXP.toLocaleString()} icon={<Zap className="w-12 h-12" />} color="from-purple-500 to-pink-500" />
          <StatCard label="Resources Viewed" value={totalResourcesAccessed} icon={<FileText className="w-12 h-12" />} color="from-emerald-500 to-teal-400" />
          <StatCard label="Avg Active Time" value={`${avgTime}m`} icon={<Clock className="w-12 h-12" />} color="from-amber-500 to-orange-400" />
      </div>

      {/* MODERATION SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Flags */}
          <div className={`border rounded-3xl p-6 backdrop-blur-md transition-colors ${flags.length > 0 ? 'bg-red-900/10 border-red-500/30' : 'bg-white/5 border-white/10'}`}>
              <div className="flex justify-between items-center mb-6">
                  <h3 className={`text-xl font-bold flex items-center gap-2 ${flags.length > 0 ? 'text-red-400' : 'text-white'}`}>
                      {flags.length > 0 ? <AlertTriangle className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5 text-gray-400" />}
                      Moderation Queue
                  </h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${flags.length > 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-green-500/20 text-green-400'}`}>
                      {flags.length > 0 ? `${flags.length} Issues` : 'Secure'}
                  </span>
              </div>
              
              {flags.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 italic">
                      <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-20" />
                      No active alerts. Comms channels are clear.
                  </div>
              ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                      {flags.map(flag => (
                          <div key={flag.id} className="bg-black/20 border border-red-500/20 p-3 rounded-xl">
                              <div className="flex justify-between items-start mb-2">
                                  <div>
                                      <div className="text-sm font-bold text-white">{flag.senderName} <span className="text-xs text-gray-500 font-normal">in {flag.classType}</span></div>
                                      <div className="text-xs text-red-300 italic mt-1">"{flag.content}"</div>
                                  </div>
                                  <div className="text-[10px] text-gray-500 whitespace-nowrap ml-2">
                                      {new Date(flag.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </div>
                              </div>
                              <div className="flex gap-2 mt-2">
                                  <button onClick={async () => { await dataService.resolveFlag(flag.id); if (flag.messageId) await dataService.unflagMessage(flag.messageId).catch(() => {}); }} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 rounded-lg text-[11px] font-bold transition">
                                      <Check className="w-3 h-3" /> Dismiss
                                  </button>
                                  <button onClick={async () => { if (!await confirm({ message: "Delete flagged message and resolve?", confirmLabel: "Delete" })) return; await dataService.resolveFlag(flag.id); if (flag.messageId) await dataService.deleteMessage(flag.messageId).catch(() => {}); }} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-400 rounded-lg text-[11px] font-bold transition">
                                      <Trash2 className="w-3 h-3" /> Delete
                                  </button>
                                  <button onClick={() => handleMuteFromFlag(flag.senderId, flag.senderName)} className="flex items-center justify-center gap-1 px-2 py-1.5 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/30 text-orange-400 rounded-lg text-[11px] font-bold transition" title="Mute 1hr">
                                      <MicOff className="w-3 h-3" />
                                  </button>
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </div>

          {/* Muted Students */}
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <MicOff className="w-5 h-5 text-orange-400" />
                  Silenced Operatives
              </h3>
              
              {mutedStudents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 italic">
                      <Users className="w-12 h-12 mx-auto mb-2 opacity-20" />
                      No active silence sanctions.
                  </div>
              ) : (
                  <div className="overflow-x-auto">
                      <table className="w-full text-left">
                          <thead>
                              <tr className="border-b border-white/10 text-[10px] uppercase font-bold text-gray-500">
                                  <th className="pb-2">Operative</th>
                                  <th className="pb-2">Remaining</th>
                                  <th className="pb-2 text-right">Protocol</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                              {mutedStudents.map(s => (
                                  <tr key={s.id} className="group hover:bg-white/5 transition">
                                      <td className="py-3">
                                          <div className="text-sm font-bold text-white">{s.name}</div>
                                          <div className="text-[10px] text-gray-500">{s.classType}</div>
                                      </td>
                                      <td className="py-3">
                                          <span className="bg-orange-500/20 text-orange-300 px-2 py-1 rounded text-xs font-mono">
                                              {getTimeRemaining(s.mutedUntil!)}
                                          </span>
                                      </td>
                                      <td className="py-3 text-right">
                                          <div className="flex justify-end gap-2">
                                              <button 
                                                  onClick={() => handleExtendMute(s.id, s.mutedUntil!)}
                                                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition"
                                                  title="Extend +1hr"
                                              >
                                                  <RefreshCw className="w-3.5 h-3.5" />
                                              </button>
                                              <button 
                                                  onClick={() => handleUnmute(s.id)}
                                                  className="p-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition"
                                                  title="Unmute"
                                              >
                                                  <CheckCircle className="w-3.5 h-3.5" />
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      </div>

      {/* ANNOUNCEMENTS */}
      <div className="mt-8">
          <AnnouncementManager announcements={announcements} studentIds={students.map(s => s.id)} />
      </div>

      {/* ENGAGEMENT RANKING TABLE */}
      <div className="mt-8 bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8">
          <h3 className="text-xl font-bold text-white mb-6">Student Engagement Ranking</h3>
          <div className="overflow-x-auto">
              <table className="w-full text-left">
                  <thead>
                      <tr className="border-b border-white/10 text-gray-400 text-sm">
                          <th className="p-3">Student</th>
                          <th className="p-3">Class</th>
                          <th className="p-3 text-center">Last Seen</th>
                          <th className="p-3 text-center">Total Time</th>
                          <th className="p-3 text-center">Resources</th>
                          <th className="p-3 text-right">XP</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                      {(() => {
                          const maxXP = Math.max(1, ...students.map(s => s.gamification?.xp || 0));
                          return students
                              .sort((a,b) => (b.gamification?.xp || 0) - (a.gamification?.xp || 0))
                              .map(student => {
                                  const xp = student.gamification?.xp || 0;
                                  const xpPct = Math.round((xp / maxXP) * 100);
                                  
                                  // Color-code last seen
                                  const lastLogin = student.lastLoginAt;
                                  const msSinceLogin = lastLogin ? Date.now() - new Date(lastLogin).getTime() : Infinity;
                                  const lastSeenColor = msSinceLogin < 3600000 ? 'text-green-400' 
                                      : msSinceLogin < 86400000 ? 'text-yellow-400' 
                                      : msSinceLogin < Infinity ? 'text-red-400' 
                                      : 'text-gray-600';
                                  const activityDot = msSinceLogin < 3600000 ? 'bg-green-500' 
                                      : msSinceLogin < 86400000 ? 'bg-yellow-500' 
                                      : msSinceLogin < Infinity ? 'bg-red-500' 
                                      : 'bg-gray-600';

                                  return (
                                      <tr key={student.id} className="hover:bg-white/5 transition cursor-pointer" onClick={() => setSelectedStudent(student)}>
                                          <td className="p-3 font-bold text-white">
                                              <div className="flex items-center gap-2">
                                                  <div className="relative">
                                                      {student.avatarUrl ? (
                                                          <img src={student.avatarUrl} alt={student.name} className="w-8 h-8 rounded-full border border-white/10 object-cover" />
                                                      ) : (
                                                          <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-xs">
                                                              {student.name.charAt(0)}
                                                          </div>
                                                      )}
                                                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0f0720] ${activityDot}`}></div>
                                                  </div>
                                                  <span className="truncate max-w-[120px]">{student.name}</span>
                                              </div>
                                          </td>
                                          <td className="p-3 text-sm text-gray-400">{student.classType}</td>
                                          <td className={`p-3 text-center text-xs font-mono ${lastSeenColor}`}>{formatLastSeen(student.lastLoginAt)}</td>
                                          <td className="p-3 text-center text-white">{student.stats?.totalTime || 0}m</td>
                                          <td className="p-3 text-center text-white">{student.stats?.problemsCompleted || 0}</td>
                                          <td className="p-3 text-right">
                                              <div className="flex items-center justify-end gap-2">
                                                  <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                      <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 rounded-full transition-all" style={{ width: `${xpPct}%` }}></div>
                                                  </div>
                                                  <span className="text-purple-400 font-bold text-sm min-w-[3rem] text-right">{xp}</span>
                                              </div>
                                          </td>
                                      </tr>
                                  );
                              });
                      })()}
                  </tbody>
              </table>
          </div>
      </div>

      {/* STUDENT DETAIL DRAWER */}
      {selectedStudent && (
        <StudentDetailDrawer
          student={selectedStudent}
          submissions={submissions.filter(s => s.userId === selectedStudent.id)}
          assignments={assignments}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
};

export default TeacherDashboard;
