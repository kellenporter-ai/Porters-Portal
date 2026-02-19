
import React, { useEffect, useState, useMemo } from 'react';
import { User, DefaultClassTypes } from '../types';
import { dataService } from '../services/dataService';
import { Trophy, Medal, Lock, ChevronDown, Users, Eye } from 'lucide-react';
import { getRankDetails } from '../lib/gamification';
import PlayerInspectModal from './xp/PlayerInspectModal';

interface LeaderboardProps {
  user: User;
}

const LeaderboardSkeleton = () => (
    <div className="grid grid-cols-1 divide-y divide-white/5">
        {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-6 flex items-center gap-6 animate-pulse">
                <div className="w-12 h-8 bg-white/5 rounded" />
                <div className="w-16 h-16 rounded-full bg-white/5" />
                <div className="flex-1 space-y-2">
                    <div className="h-5 bg-white/5 rounded w-40" />
                    <div className="h-3 bg-white/5 rounded w-24" />
                </div>
                <div className="space-y-2 text-right">
                    <div className="h-7 bg-white/5 rounded w-20 ml-auto" />
                    <div className="h-3 bg-white/5 rounded w-14 ml-auto" />
                </div>
            </div>
        ))}
    </div>
);

const Leaderboard: React.FC<LeaderboardProps> = ({ user }) => {
  const [allStudents, setAllStudents] = useState<User[]>([]);
  // Default to the student's currently active class
  const [selectedClass, setSelectedClass] = useState<string>(user.classType || user.enrolledClasses?.[0] || DefaultClassTypes.AP_PHYSICS);
  const [isLoading, setIsLoading] = useState(true);
  const [inspectUserId, setInspectUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = dataService.subscribeToLeaderboard((users) => {
        setAllStudents(users);
        setIsLoading(false);
    });
    return () => unsub();
  }, []);

  // Only show classes the current student is enrolled in
  const availableClasses = useMemo(() => {
    const enrolled = user.enrolledClasses || [];
    if (enrolled.length > 0) return enrolled.sort();
    // Fallback: derive from all students (shouldn't normally happen)
    const classes = new Set<string>();
    allStudents.forEach(u => u.enrolledClasses?.forEach(c => classes.add(c)));
    return Array.from(classes).sort();
  }, [user.enrolledClasses, allStudents]);

  const leaders = useMemo(() => {
    return allStudents
        .filter(u => u.enrolledClasses?.includes(selectedClass))
        .sort((a, b) => {
            const xpA = a.gamification?.classXp?.[selectedClass] || 0;
            const xpB = b.gamification?.classXp?.[selectedClass] || 0;
            return xpB - xpA;
        })
        .slice(0, 10);
  }, [allStudents, selectedClass]);

  return (
    <div className="max-w-4xl mx-auto pt-8">
        <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-2">
                Class Rankings
            </h1>
            <p className="text-gray-400 mb-6">Top operatives by XP accumulated.</p>
            
            <div className="inline-block relative">
                <select 
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="appearance-none bg-white/5 border border-white/20 text-white font-bold py-2 pl-4 pr-10 rounded-xl focus:outline-none focus:border-purple-500 cursor-pointer min-w-[200px]"
                >
                    {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    {availableClasses.length === 0 && <option>{selectedClass}</option>}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            {isLoading ? (
                <LeaderboardSkeleton />
            ) : (
            <>
            {/* PODIUM — Top 3 */}
            {leaders.length >= 3 && (
                <div className="flex items-end justify-center gap-4 px-6 pt-10 pb-6 bg-gradient-to-b from-purple-500/10 to-transparent border-b border-white/5">
                    {[1, 0, 2].map(rank => {
                        const u = leaders[rank];
                        if (!u) return null;
                        const isPrivate = u.settings?.privacyMode;
                        const displayName = isPrivate ? (u.gamification?.codename || 'Unknown Agent') : u.name;
                        const classXP = u.gamification?.classXp?.[selectedClass] || 0;
                        const lvl = u.gamification?.level || 1;
                        const rd = getRankDetails(lvl);
                        const isFirst = rank === 0;
                        const heights = ['h-28', 'h-20', 'h-16'];
                        const sizes = ['w-20 h-20', 'w-14 h-14', 'w-14 h-14'];
                        const badges = [
                            { icon: <Trophy className="w-5 h-5" />, color: 'bg-yellow-500 text-yellow-900', ring: 'ring-yellow-400/40' },
                            { icon: <Medal className="w-4 h-4" />, color: 'bg-gray-300 text-gray-700', ring: 'ring-gray-300/30' },
                            { icon: <Medal className="w-4 h-4" />, color: 'bg-amber-600 text-amber-100', ring: 'ring-amber-600/30' },
                        ];
                        return (
                            <div key={u.id} className={`flex flex-col items-center ${isFirst ? 'order-2' : rank === 1 ? 'order-1' : 'order-3'}`}
                                 style={{ animation: `fadeSlideUp 0.5s ease-out ${0.1 + rank * 0.15}s both` }}>
                                <div className={`relative mb-2 ${isFirst ? 'mb-3' : ''}`}>
                                    <div className={`${sizes[rank]} rounded-full p-0.5 bg-white/10 ring-2 ${badges[rank].ring} relative ${isFirst ? 'shadow-[0_0_30px_rgba(234,179,8,0.3)]' : ''}`}>
                                        <img src={u.avatarUrl} alt={displayName} className={`w-full h-full rounded-full border-2 ${rd.tierColor.split(' ')[0]} object-cover`} />
                                    </div>
                                    <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 ${badges[rank].color} rounded-full w-6 h-6 flex items-center justify-center shadow-lg`}>
                                        {badges[rank].icon}
                                    </div>
                                </div>
                                <div className={`text-center ${isFirst ? 'mt-2' : 'mt-1'}`}>
                                    <div className={`font-bold truncate max-w-[100px] ${isFirst ? 'text-sm text-white' : 'text-xs text-gray-300'} ${isPrivate ? 'italic' : ''}`}>{displayName}</div>
                                    <div className={`font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 ${isFirst ? 'text-xl' : 'text-base'}`}>{classXP.toLocaleString()}</div>
                                    <div className={`text-[9px] font-mono uppercase ${rd.tierColor.split(' ')[1]}`}>{rd.rankName}</div>
                                    <button onClick={() => setInspectUserId(u.id)} className="mt-1 text-[10px] text-gray-500 hover:text-purple-400 transition flex items-center gap-0.5 mx-auto">
                                        <Eye className="w-3 h-3" /> Inspect
                                    </button>
                                </div>
                                {/* Podium bar */}
                                <div className={`${heights[rank]} w-20 mt-2 rounded-t-lg bg-gradient-to-t ${rank === 0 ? 'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30' : rank === 1 ? 'from-gray-400/15 to-gray-400/5 border-gray-400/20' : 'from-amber-600/15 to-amber-600/5 border-amber-600/20'} border border-b-0`}></div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* REST OF LIST — #4 onward (or all if < 3) */}
            <div className="grid grid-cols-1 divide-y divide-white/5">
                {leaders.slice(leaders.length >= 3 ? 3 : 0).map((u, idx) => {
                    const i = leaders.length >= 3 ? idx + 3 : idx;
                    const isPrivate = u.settings?.privacyMode;
                    const displayName = isPrivate ? (u.gamification?.codename || 'Unknown Agent') : u.name;
                    const classXP = u.gamification?.classXp?.[selectedClass] || 0;
                    const level = u.gamification?.level || 1;
                    const rankDetails = getRankDetails(level);

                    return (
                        <div key={u.id} className="p-5 flex items-center gap-5 transition hover:bg-white/5"
                             style={{ animation: `fadeSlideUp 0.4s ease-out ${0.05 * i}s both` }}>
                            <div className="w-10 text-center font-bold text-lg text-gray-600 font-mono">
                                {i < 3 && i === 0 && <Trophy className="w-6 h-6 text-yellow-400 mx-auto" />}
                                {i < 3 && i === 1 && <Medal className="w-6 h-6 text-gray-300 mx-auto" />}
                                {i < 3 && i === 2 && <Medal className="w-6 h-6 text-amber-600 mx-auto" />}
                                {i >= 3 && `#${i+1}`}
                            </div>
                            
                            <div className="w-12 h-12 rounded-full p-0.5 bg-white/5 relative">
                                <img src={u.avatarUrl} alt={displayName} className={`w-full h-full rounded-full border-2 ${rankDetails.tierColor.split(' ')[0]}`} />
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center text-[9px] font-bold border border-gray-600 text-white">
                                    {level}
                                </div>
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className={`text-base font-bold truncate ${isPrivate ? 'text-purple-300 italic' : 'text-white'}`}>
                                    {displayName}
                                    {isPrivate && <Lock className="w-3 h-3 text-gray-500 inline ml-1" />}
                                </h3>
                                <span className={`text-[10px] font-mono uppercase font-bold tracking-widest ${rankDetails.tierColor.split(' ')[1]}`}>
                                    {rankDetails.rankName}
                                </span>
                            </div>

                            <div className="text-right">
                                <div className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                                    {classXP.toLocaleString()}
                                </div>
                                <div className="text-[9px] text-gray-500 font-mono tracking-widest">CLASS XP</div>
                            </div>
                            <button
                                onClick={() => setInspectUserId(u.id)}
                                className="p-2 text-gray-600 hover:text-purple-400 transition rounded-lg hover:bg-white/5"
                                title="Inspect player"
                            >
                                <Eye className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })}
                {leaders.length === 0 && (
                    <div className="p-10 text-center text-gray-500 italic flex flex-col items-center gap-2">
                        <Users className="w-8 h-8 opacity-20" />
                        No operatives ranked in {selectedClass}.
                    </div>
                )}
            </div>
            </>
            )}
        </div>

        {/* Player Inspect Modal */}
        {inspectUserId && (
            <PlayerInspectModal
                userId={inspectUserId}
                classType={selectedClass}
                onClose={() => setInspectUserId(null)}
            />
        )}
    </div>
  );
};

export default Leaderboard;
