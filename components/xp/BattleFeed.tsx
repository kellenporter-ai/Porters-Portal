
import React, { useState, useEffect, useRef } from 'react';
import { dataService } from '../../services/dataService';
import { Zap } from 'lucide-react';

interface BattleFeedProps {
  bossId: string;
  maxEntries?: number;
}

interface FeedEntry {
  userId: string;
  userName: string;
  damage: number;
  isCrit?: boolean;
  timestamp: string;
}

const BattleFeed: React.FC<BattleFeedProps> = ({ bossId, maxEntries = 5 }) => {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = dataService.subscribeToBossQuizDamageLog(bossId, (log) => {
      const sorted = [...log].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEntries(sorted.slice(0, maxEntries));
    });
    return () => unsub();
  }, [bossId, maxEntries]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest flex items-center gap-1">
        <Zap className="w-2.5 h-2.5" /> Live Battle Feed
      </div>
      <div ref={containerRef} className="max-h-24 overflow-y-auto custom-scrollbar space-y-0.5">
        {entries.map((entry, i) => (
          <div
            key={`${entry.userId}-${entry.timestamp}`}
            className={`flex items-center gap-2 text-[11.5px] py-0.5 px-2 rounded-lg ${
              i === 0 ? 'bg-amber-500/5 animate-in fade-in slide-in-from-top-1 duration-300' : 'opacity-60'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-purple-500/20 flex items-center justify-center text-[8px] font-bold text-purple-600 dark:text-purple-400 shrink-0">
              {entry.userName.charAt(0)}
            </span>
            <span className="text-[var(--text-tertiary)] truncate flex-1">{entry.userName}</span>
            <span className={`font-bold ${entry.isCrit ? 'text-yellow-200 font-black drop-shadow-[0_0_6px_rgba(253,224,71,0.6)]' : 'text-amber-600 dark:text-amber-400'}`}>
              -{entry.damage}{entry.isCrit ? '!' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BattleFeed;
