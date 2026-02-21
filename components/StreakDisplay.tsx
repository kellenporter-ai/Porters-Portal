
import React, { useEffect, useState } from 'react';
import { Flame, Snowflake, Trophy } from 'lucide-react';
import { StreakData } from '../types';
import { dataService } from '../services/dataService';

interface StreakDisplayProps {
  userId: string;
  streakData?: StreakData;
  compact?: boolean;
}

const MILESTONE_COLORS: Record<number, string> = {
  3: 'text-blue-400',
  7: 'text-green-400',
  14: 'text-purple-400',
  21: 'text-amber-400',
  30: 'text-red-400',
  50: 'text-pink-400',
  100: 'text-cyan-400',
};

const StreakDisplay: React.FC<StreakDisplayProps> = ({ userId, streakData, compact }) => {
  const [streak, setStreak] = useState<StreakData | null>(streakData || null);
  const [showToast, setShowToast] = useState<{ message: string; type: 'streak' | 'freeze' | 'milestone' } | null>(null);

  // Update streak on mount (once per day)
  useEffect(() => {
    const updateStreak = async () => {
      try {
        const result = await dataService.updateDailyStreak(userId);
        if (result.freezeUsed) {
          setShowToast({ message: 'Streak Freeze used! Streak saved.', type: 'freeze' });
          setTimeout(() => setShowToast(null), 3000);
        } else if (result.newMilestone) {
          setShowToast({ message: `${result.newMilestone}-day streak milestone!`, type: 'milestone' });
          setTimeout(() => setShowToast(null), 3000);
        }
      } catch {
        // silent
      }
    };
    updateStreak();
  }, [userId]);

  // Update local state when prop changes
  useEffect(() => {
    if (streakData) setStreak(streakData);
  }, [streakData]);

  if (!streak) return null;

  const flameIntensity = streak.currentStreak >= 30 ? 'text-red-400 animate-pulse'
    : streak.currentStreak >= 14 ? 'text-orange-400'
    : streak.currentStreak >= 7 ? 'text-amber-400'
    : streak.currentStreak >= 3 ? 'text-yellow-400'
    : 'text-gray-500';

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <Flame className={`w-4 h-4 ${flameIntensity}`} />
        <span className={`text-sm font-bold ${streak.currentStreak > 0 ? 'text-amber-300' : 'text-gray-500'}`}>
          {streak.currentStreak}
        </span>
        {streak.freezeTokens > 0 && (
          <div className="flex items-center gap-0.5 ml-1" title={`${streak.freezeTokens} streak freeze${streak.freezeTokens !== 1 ? 's' : ''}`}>
            {Array.from({ length: streak.freezeTokens }).map((_, i) => (
              <Snowflake key={i} className="w-3 h-3 text-cyan-400" />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Last 7 days visualization
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0];
    const isActive = streak.streakHistory?.includes(date);
    const isToday = date === new Date().toISOString().split('T')[0];
    const dayLabel = new Date(date).toLocaleDateString('en-US', { weekday: 'narrow' });
    return { date, isActive, isToday, dayLabel };
  });

  return (
    <div className="relative">
      {/* Toast */}
      {showToast && (
        <div className={`absolute -top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-bold animate-in slide-in-from-bottom-2 fade-in duration-300 whitespace-nowrap ${
          showToast.type === 'freeze' ? 'bg-cyan-600/90 text-white'
          : showToast.type === 'milestone' ? 'bg-amber-600/90 text-white'
          : 'bg-orange-600/90 text-white'
        }`}>
          {showToast.type === 'freeze' && <Snowflake className="w-3 h-3 inline mr-1" />}
          {showToast.type === 'milestone' && <Trophy className="w-3 h-3 inline mr-1" />}
          {showToast.message}
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Flame className={`w-7 h-7 ${flameIntensity}`} />
            <div>
              <div className={`text-2xl font-bold ${streak.currentStreak > 0 ? 'text-amber-300' : 'text-gray-400'}`}>
                {streak.currentStreak} Day{streak.currentStreak !== 1 ? 's' : ''}
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                Current Streak | Best: {streak.longestStreak}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1" title={`${streak.freezeTokens} / ${streak.maxFreezeTokens} freeze tokens`}>
            {Array.from({ length: streak.maxFreezeTokens }).map((_, i) => (
              <Snowflake key={i} className={`w-5 h-5 ${i < streak.freezeTokens ? 'text-cyan-400' : 'text-gray-700'}`} />
            ))}
          </div>
        </div>

        {/* 7-day calendar */}
        <div className="flex gap-1.5">
          {last7Days.map(day => (
            <div key={day.date} className="flex-1 text-center">
              <div className="text-[9px] text-gray-500 mb-1">{day.dayLabel}</div>
              <div className={`w-full aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition ${
                day.isActive
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20'
                  : day.isToday
                    ? 'border-2 border-dashed border-amber-500/40 text-amber-500/40'
                    : 'bg-white/5 text-gray-700'
              }`}>
                {day.isActive ? <Flame className="w-3.5 h-3.5" /> : ''}
              </div>
            </div>
          ))}
        </div>

        {/* Milestones */}
        {(streak.milestones?.length || 0) > 0 && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
            {streak.milestones?.map(m => (
              <span key={m} className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 ${MILESTONE_COLORS[m] || 'text-white'}`}>
                {m}d
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StreakDisplay;
