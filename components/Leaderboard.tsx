
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { User, DefaultClassTypes } from '../types';
import { dataService } from '../services/dataService';
import { Trophy, Medal, Lock, ChevronDown, Users, Eye } from 'lucide-react';
import { getRankDetails, levelForXp } from '../lib/gamification';
import { useReducedMotion } from '../lib/useReducedMotion';
import PlayerInspectModal from './xp/PlayerInspectModal';
import ProfileFrame from './dashboard/ProfileFrame';

interface LeaderboardProps {
  user: User;
}

const LeaderboardSkeleton = React.memo(() => (
    <div className="grid grid-cols-1 divide-y divide-[var(--border)]">
        {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-6 flex items-center gap-6 animate-pulse">
                <div className="w-12 h-8 bg-[var(--surface-glass)] rounded" />
                <div className="w-16 h-16 rounded-full bg-[var(--surface-glass)]" />
                <div className="flex-1 space-y-2">
                    <div className="h-5 bg-[var(--surface-glass)] rounded w-40" />
                    <div className="h-3 bg-[var(--surface-glass)] rounded w-24" />
                </div>
                <div className="space-y-2 text-right">
                    <div className="h-7 bg-[var(--surface-glass)] rounded w-20 ml-auto" />
                    <div className="h-3 bg-[var(--surface-glass)] rounded w-14 ml-auto" />
                </div>
            </div>
        ))}
    </div>
));

const Leaderboard: React.FC<LeaderboardProps> = ({ user }) => {
  const [allStudents, setAllStudents] = useState<User[]>([]);
  // Default to the student's currently active class
  const [selectedClass, setSelectedClass] = useState<string>(user.classType || user.enrolledClasses?.[0] || DefaultClassTypes.AP_PHYSICS);
  const [isLoading, setIsLoading] = useState(true);
  const [inspectUserId, setInspectUserId] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const handleInspect = useCallback((id: string) => setInspectUserId(id), []);
  const handleCloseInspect = useCallback(() => setInspectUserId(null), []);

  useEffect(() => {
    const unsub = dataService.subscribeToLeaderboard((users) => {
        setAllStudents(users);
        setIsLoading(false);
    }, 200);
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
        });
  }, [allStudents, selectedClass]);

  const restOfList = useMemo(() => leaders.slice(leaders.length >= 3 ? 3 : 0), [leaders]);

  const listParentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: restOfList.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 72,
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  return (
    <div className="max-w-4xl mx-auto pt-8">
        <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-700 dark:from-purple-400 to-pink-700 dark:to-pink-600 mb-2">
                Class Rankings
            </h1>
            <p className="text-[var(--text-tertiary)] mb-6">Top operatives by XP accumulated.</p>
            
            <div className="inline-block relative">
                <select 
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="appearance-none bg-[var(--surface-glass)] border border-[var(--border-strong)] text-[var(--text-primary)] font-bold py-2 pl-4 pr-10 rounded-xl focus:outline-none focus:border-purple-500 cursor-pointer min-w-[200px]"
                >
                    {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    {availableClasses.length === 0 && <option>{selectedClass}</option>}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
            </div>
        </div>

        <div className="bg-[var(--surface-glass)] backdrop-blur-xl border border-[var(--border-strong)] rounded-3xl overflow-hidden shadow-2xl">
            {isLoading ? (
                <LeaderboardSkeleton />
            ) : (
            <>
            {/* PODIUM — Top 3 */}
            {leaders.length >= 3 && (
                <div className="flex items-end justify-center gap-4 px-6 pt-10 pb-6 bg-gradient-to-b from-purple-500/10 to-transparent border-b border-[var(--border)]">
                    {[1, 0, 2].map(rank => {
                        const u = leaders[rank];
                        if (!u) return null;
                        const isPrivate = u.settings?.privacyMode;
                        const displayName = isPrivate ? (u.gamification?.codename || 'Unknown Agent') : u.name;
                        const classXP = u.gamification?.classXp?.[selectedClass] || 0;
                        const lvl = levelForXp(classXP);
                        const rd = getRankDetails(lvl);
                        const isFirst = rank === 0;
                        const heights = ['h-28', 'h-20', 'h-16'];
                        const badges = [
                            { icon: <Trophy className="w-5 h-5" />, color: 'bg-yellow-500 text-yellow-900', ring: 'ring-yellow-400/40' },
                            { icon: <Medal className="w-4 h-4" />, color: 'bg-gray-300 text-gray-700', ring: 'ring-gray-300/30' },
                            { icon: <Medal className="w-4 h-4" />, color: 'bg-amber-600 text-amber-100', ring: 'ring-amber-600/30' },
                        ];
                        return (
                            <div key={u.id} className={`flex flex-col items-center ${isFirst ? 'order-2' : rank === 1 ? 'order-1' : 'order-3'}`}
                                 style={!reducedMotion ? { animation: `fadeSlideUp 0.5s ease-out ${0.1 + rank * 0.15}s both` } : undefined}>
                                <div className={`relative mb-2 ${isFirst ? 'mb-3' : ''}`}>
                                    <ProfileFrame
                                        photoUrl={u.avatarUrl}
                                        initials={displayName}
                                        frameId={u.gamification?.activeCosmetics?.frame}
                                        size={isFirst ? 80 : 56}
                                        className={`ring-2 ${badges[rank].ring} rounded-full ${isFirst ? 'shadow-[0_0_30px_rgba(234,179,8,0.3)]' : ''}`}
                                    />
                                    <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 ${badges[rank].color} rounded-full w-6 h-6 flex items-center justify-center shadow-lg`}>
                                        {badges[rank].icon}
                                    </div>
                                </div>
                                <div className={`text-center ${isFirst ? 'mt-2' : 'mt-1'}`}>
                                    <div className={`font-bold truncate max-w-[100px] ${isFirst ? 'text-sm text-[var(--text-primary)]' : 'text-xs text-[var(--text-secondary)]'} ${isPrivate ? 'italic' : ''}`}>{displayName}</div>
                                    <div className={`font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-700 dark:from-cyan-400 to-blue-700 dark:to-blue-500 ${isFirst ? 'text-xl' : 'text-base'}`}>{classXP.toLocaleString()}</div>
                                    <div className={`text-[11.5px] font-mono uppercase ${rd.tierColor.split(' ').slice(1).join(' ')}`}>{rd.rankName}</div>
                                    <button onClick={() => handleInspect(u.id)} className="mt-1 text-[11.5px] text-[var(--text-muted)] hover:text-purple-700 dark:hover:text-purple-400 transition flex items-center gap-0.5 mx-auto">
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

            {/* REST OF LIST — #4 onward (or all if < 3), virtualized */}
            {leaders.length === 0 ? (
                <div className="p-10 text-center text-[var(--text-muted)] italic flex flex-col items-center gap-2">
                    <Users className="w-8 h-8 opacity-20" />
                    No operatives ranked in {selectedClass}.
                </div>
            ) : (
                <div ref={listParentRef} className="max-h-[480px] overflow-auto" role="list" aria-label={`${selectedClass} rankings`}>
                    <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                        {rowVirtualizer.getVirtualItems().map(virtualRow => {
                            const u = restOfList[virtualRow.index];
                            const i = leaders.length >= 3 ? virtualRow.index + 3 : virtualRow.index;
                            const isPrivate = u.settings?.privacyMode;
                            const displayName = isPrivate ? (u.gamification?.codename || 'Unknown Agent') : u.name;
                            const classXP = u.gamification?.classXp?.[selectedClass] || 0;
                            const level = levelForXp(classXP);
                            const rankDetails = getRankDetails(level);

                            return (
                                <div
                                    key={u.id}
                                    ref={rowVirtualizer.measureElement}
                                    data-index={virtualRow.index}
                                    role="listitem"
                                    aria-label={`Rank ${i + 1}: ${displayName}, ${classXP.toLocaleString()} XP`}
                                    className="p-5 flex items-center gap-5 transition hover:bg-[var(--surface-glass)] border-b border-[var(--border)] absolute top-0 left-0 w-full"
                                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                                >
                                    <div className="w-10 text-center font-bold text-lg text-[var(--text-muted)] font-mono">
                                        {i < 3 && i === 0 && <Trophy className="w-6 h-6 text-yellow-400 mx-auto" />}
                                        {i < 3 && i === 1 && <Medal className="w-6 h-6 text-gray-300 mx-auto" />}
                                        {i < 3 && i === 2 && <Medal className="w-6 h-6 text-amber-600 mx-auto" />}
                                        {i >= 3 && `#${i+1}`}
                                    </div>

                                    <div className="relative">
                                        <ProfileFrame
                                            photoUrl={u.avatarUrl}
                                            initials={displayName}
                                            frameId={u.gamification?.activeCosmetics?.frame}
                                            size={48}
                                        />
                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[var(--surface-raised)] rounded-full flex items-center justify-center text-[11.5px] font-bold border border-[var(--border)] text-[var(--text-primary)]">
                                            {level}
                                        </div>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <h3 className={`text-base font-bold truncate ${isPrivate ? 'text-purple-700 dark:text-purple-300 italic' : 'text-[var(--text-primary)]'}`}>
                                            {displayName}
                                            {isPrivate && <Lock className="w-3 h-3 text-[var(--text-muted)] inline ml-1" />}
                                        </h3>
                                        <span className={`text-[11.5px] font-mono uppercase font-bold tracking-widest ${rankDetails.tierColor.split(' ').slice(1).join(' ')}`}>
                                            {rankDetails.rankName}
                                        </span>
                                    </div>

                                    <div className="text-right">
                                        <div className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-700 dark:from-cyan-400 to-blue-700 dark:to-blue-500">
                                            {classXP.toLocaleString()}
                                        </div>
                                        <div className="text-[11.5px] text-[var(--text-muted)] font-mono tracking-widest">CLASS XP</div>
                                    </div>
                                    <button
                                        onClick={() => handleInspect(u.id)}
                                        className="p-2 text-[var(--text-muted)] hover:text-purple-700 dark:hover:text-purple-400 transition rounded-lg hover:bg-[var(--surface-glass)]"
                                        aria-label={`Inspect ${displayName}`}
                                    >
                                        <Eye className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            </>
            )}
        </div>

        {/* Player Inspect Modal */}
        {inspectUserId && (
            <PlayerInspectModal
                userId={inspectUserId}
                classType={selectedClass}
                onClose={handleCloseInspect}
            />
        )}
    </div>
  );
};

export default Leaderboard;
