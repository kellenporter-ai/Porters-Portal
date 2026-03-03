import React, { useState, useEffect } from 'react';
import { Dungeon, DungeonRun, DungeonRoom } from '../../types';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import { db } from '../../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Swords, Heart, Star, Lock, Trophy, ChevronRight, MapPin, Shield, CheckCircle2, XCircle, Zap } from 'lucide-react';
import { calculateGearScore } from '../../lib/gamification';

interface DungeonPanelProps {
  userId: string;
  classType: string;
}

// Reset timer label from resetsAt field
function resetLabel(resetsAt?: string): string {
  if (!resetsAt) return 'Unlimited runs';
  if (resetsAt === 'DAILY') return 'Resets daily';
  return 'Resets weekly';
}

// Room type badge colors
const roomTypeBadge: Record<string, string> = {
  COMBAT:   'text-red-400 bg-red-500/10 border-red-500/20',
  PUZZLE:   'text-blue-400 bg-blue-500/10 border-blue-500/20',
  BOSS:     'text-amber-400 bg-amber-500/10 border-amber-500/20',
  REST:     'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  TREASURE: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
};

// -------------------------------------------------------
// Dungeon list card
// -------------------------------------------------------
const DungeonCard: React.FC<{
  dungeon: Dungeon;
  playerLevel: number;
  gearScore: number;
  onStart: (dungeonId: string) => void;
  loading: boolean;
}> = ({ dungeon, playerLevel, gearScore, onStart, loading }) => {
  const levelLocked = dungeon.minLevel !== undefined && playerLevel < dungeon.minLevel;
  const gearLocked  = dungeon.minGearScore !== undefined && gearScore < dungeon.minGearScore;
  const locked = levelLocked || gearLocked;

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${locked ? 'border-white/5 bg-black/20 opacity-60' : 'border-white/10 bg-black/30'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-white text-base leading-snug">{dungeon.name}</h4>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{dungeon.description}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] font-bold text-gray-500">{dungeon.rooms.length} rooms</span>
          <span className="text-[10px] text-gray-600">{resetLabel(dungeon.resetsAt)}</span>
        </div>
      </div>

      {/* Requirements row */}
      <div className="flex flex-wrap gap-1.5">
        {dungeon.minLevel && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${levelLocked ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-gray-500 bg-white/5 border-white/5'}`}>
            {levelLocked && <Lock className="w-2.5 h-2.5 inline mr-0.5" />}
            Lv. {dungeon.minLevel}+
          </span>
        )}
        {dungeon.minGearScore && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${gearLocked ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-gray-500 bg-white/5 border-white/5'}`}>
            {gearLocked && <Lock className="w-2.5 h-2.5 inline mr-0.5" />}
            GS {dungeon.minGearScore}+
          </span>
        )}
        {dungeon.rooms.slice(0, 5).map((room, i) => (
          <span key={i} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${roomTypeBadge[room.type] || 'text-gray-500 bg-white/5 border-white/5'}`}>
            {room.type[0]}
          </span>
        ))}
      </div>

      {/* Rewards row */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500 border-t border-white/5 pt-2">
        <span className="text-yellow-400 font-bold">{dungeon.rewards.xp} XP</span>
        <span className="text-cyan-400 font-bold">{dungeon.rewards.flux} Flux</span>
        {dungeon.rewards.itemRarity && (
          <span className="text-purple-400 font-bold">{dungeon.rewards.itemRarity} item</span>
        )}
      </div>

      <button
        onClick={() => onStart(dungeon.id)}
        disabled={locked || loading}
        className={`w-full py-2.5 rounded-xl text-sm font-bold transition ${
          locked ? 'bg-gray-800 text-gray-600 cursor-not-allowed' :
          'bg-amber-600 hover:bg-amber-500 text-white'
        }`}
      >
        {locked ? (
          <><Lock className="w-3.5 h-3.5 inline mr-1.5" />Locked</>
        ) : (
          <><Swords className="w-3.5 h-3.5 inline mr-1.5" />Enter Dungeon</>
        )}
      </button>
    </div>
  );
};

// -------------------------------------------------------
// Dungeon map progress bar
// -------------------------------------------------------
const DungeonMap: React.FC<{ rooms: DungeonRoom[]; currentRoom: number }> = ({ rooms, currentRoom }) => (
  <div className="flex items-center gap-1 overflow-x-auto pb-1">
    {rooms.map((room, i) => {
      const cleared = i < currentRoom;
      const active  = i === currentRoom;
      return (
        <React.Fragment key={room.id}>
          <div className={`flex flex-col items-center gap-0.5 flex-shrink-0 ${active ? 'scale-110' : ''} transition-transform`}>
            <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-[9px] font-black ${
              cleared ? 'bg-emerald-600 border-emerald-500 text-white' :
              active  ? 'bg-amber-600 border-amber-400 text-white animate-pulse' :
                        'bg-black/40 border-white/10 text-gray-600'
            }`}>
              {cleared ? '✓' : room.type[0]}
            </div>
            <span className={`text-[8px] font-bold ${active ? 'text-amber-400' : cleared ? 'text-emerald-500' : 'text-gray-700'}`}>
              {room.name.slice(0, 4)}
            </span>
          </div>
          {i < rooms.length - 1 && (
            <ChevronRight className={`w-3 h-3 flex-shrink-0 ${cleared ? 'text-emerald-600' : 'text-gray-700'}`} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// -------------------------------------------------------
// HP bar (reused for both player and enemy)
// -------------------------------------------------------
const HpBar: React.FC<{ label: string; current: number; max: number; color: 'player' | 'enemy' }> = ({ label, current, max, color }) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const gradientClass = color === 'player'
    ? pct > 50 ? 'bg-gradient-to-r from-emerald-600 to-green-500'
               : pct > 25 ? 'bg-gradient-to-r from-yellow-600 to-orange-500'
                           : 'bg-gradient-to-r from-red-700 to-red-500'
    : 'bg-gradient-to-r from-red-600 to-orange-500';

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className={`font-mono ${color === 'player' ? 'text-emerald-400' : 'text-red-400'} flex items-center gap-1`}>
          {color === 'player' && <Heart className="w-3 h-3" />}
          {label}: {current}
        </span>
        <span className="text-gray-600">{max}</span>
      </div>
      <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden">
        <div className={`h-2.5 rounded-full transition-all duration-500 ${gradientClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

// -------------------------------------------------------
// Active room combat/question view
// -------------------------------------------------------
interface RoomAnswerResult {
  correct: boolean;
  damage: number;
  playerDamage?: number;
  playerHp: number;
  enemyHp: number;
  roomCleared: boolean;
  runCompleted: boolean;
  isCrit?: boolean;
  healAmount?: number;
  loot?: { itemName: string; rarity: string };
}

const ActiveRoomView: React.FC<{
  run: DungeonRun;
  room: DungeonRoom;
  onAnswer: (questionId: string, answer: number) => Promise<void>;
  submitting: boolean;
  lastResult: RoomAnswerResult | null;
}> = ({ run, room, onAnswer, submitting, lastResult }) => {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);

  const handleSelect = async (idx: number) => {
    if (submitting || selectedAnswer !== null) return;
    setSelectedAnswer(idx);
    const q = room.questions?.find(q => !run.answeredQuestions.includes(q.id));
    if (q) await onAnswer(q.id, idx);
  };

  // Reset selection when room advances
  useEffect(() => { setSelectedAnswer(null); }, [run.currentRoom]);

  const question = room.questions?.find(q => !run.answeredQuestions.includes(q.id));
  const enemyHp = run.currentRoomEnemyHp ?? (room.enemyHp || 0);
  const enemyMaxHp = room.enemyHp || 0;
  const isRestRoom = room.type === 'REST';
  const isTreasureRoom = room.type === 'TREASURE';

  return (
    <div className="space-y-4">
      {/* Room header */}
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${roomTypeBadge[room.type] || 'text-gray-500 bg-white/5 border-white/5'}`}>
          {room.type}
        </span>
        <span className="text-sm font-bold text-white">{room.name}</span>
        <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded ${
          room.difficulty === 'HARD' ? 'bg-red-500/20 text-red-400' :
          room.difficulty === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-green-500/20 text-green-400'
        }`}>{room.difficulty}</span>
      </div>

      {/* Player HP */}
      <HpBar label="Your HP" current={run.playerHp} max={run.maxHp} color="player" />

      {/* Enemy HP (combat/boss rooms) */}
      {(room.type === 'COMBAT' || room.type === 'BOSS') && enemyMaxHp > 0 && (
        <HpBar label={room.enemyName || 'Enemy'} current={enemyHp} max={enemyMaxHp} color="enemy" />
      )}

      {/* REST room */}
      {isRestRoom && (
        <div className="text-center py-6 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
          <Heart className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-emerald-400">Rest Area</p>
          <p className="text-xs text-gray-500 mt-1">
            {room.healAmount ? `Restoring +${room.healAmount} HP...` : 'Catching your breath...'}
          </p>
          {lastResult?.healAmount && (
            <div className="mt-2 text-emerald-400 font-bold text-sm">+{lastResult.healAmount} HP restored!</div>
          )}
        </div>
      )}

      {/* TREASURE room */}
      {isTreasureRoom && (
        <div className="text-center py-6 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
          <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-yellow-400">Treasure Room</p>
          {lastResult?.loot ? (
            <p className="text-xs text-gray-300 mt-1">Found: <span className="text-purple-400 font-bold">{lastResult.loot.itemName}</span></p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">Searching for loot...</p>
          )}
        </div>
      )}

      {/* Question (COMBAT/PUZZLE/BOSS) */}
      {question && !isRestRoom && !isTreasureRoom && (
        <div className="space-y-3">
          <p className="text-base text-white font-semibold leading-relaxed">{question.stem}</p>
          <div className="space-y-2.5">
            {question.options.map((option, idx) => {
              const isSelected = selectedAnswer === idx;
              const showResult = lastResult && isSelected;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  disabled={submitting || selectedAnswer !== null}
                  className={`w-full text-left p-4 rounded-xl border text-base transition-all ${
                    showResult && lastResult.correct ? 'border-green-500/50 bg-green-500/10 text-green-400' :
                    showResult && !lastResult.correct ? 'border-red-500/50 bg-red-500/10 text-red-400' :
                    isSelected ? 'border-amber-500/30 bg-amber-500/10' :
                    'border-white/10 bg-white/5 hover:bg-white/10 text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-gray-600 w-6">{String.fromCharCode(65 + idx)}.</span>
                    <span>{option}</span>
                    {showResult && lastResult.correct  && <CheckCircle2 className="w-5 h-5 text-green-400 ml-auto shrink-0" />}
                    {showResult && !lastResult.correct && <XCircle    className="w-5 h-5 text-red-400 ml-auto shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Answer feedback */}
          {lastResult && lastResult.correct && (
            <div className="text-center text-base text-amber-400 font-bold">
              <Zap className="w-4 h-4 inline mr-1" />
              {lastResult.isCrit ? 'CRITICAL HIT! ' : ''}-{lastResult.damage} HP!
            </div>
          )}
          {lastResult && !lastResult.correct && lastResult.playerDamage && lastResult.playerDamage > 0 && (
            <div className="text-center text-sm text-red-400 font-bold">
              <Heart className="w-4 h-4 inline mr-1" />
              Enemy hits you for {lastResult.playerDamage} damage!
            </div>
          )}
        </div>
      )}

      {/* No question left in room but not cleared */}
      {!question && !isRestRoom && !isTreasureRoom && !lastResult?.roomCleared && (
        <div className="text-center py-6 text-gray-500 text-sm">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
          All questions answered in this room.
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------
// Completion view
// -------------------------------------------------------
const CompletionView: React.FC<{
  run: DungeonRun;
  onClaim: () => void;
  claiming: boolean;
}> = ({ run, onClaim, claiming }) => {
  const accuracy = run.questionsAttempted > 0
    ? Math.round((run.questionsCorrect / run.questionsAttempted) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
        <h4 className="text-lg font-black text-yellow-400">Dungeon Cleared!</h4>
        <p className="text-xs text-gray-500">{run.dungeonName} conquered</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-black/30 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Rooms Cleared
          </div>
          <div className="text-lg font-black text-amber-400">{run.roomsCleared}</div>
        </div>
        <div className="bg-black/30 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
            <Star className="w-3 h-3" /> Accuracy
          </div>
          <div className="text-lg font-black text-green-400">{accuracy}%</div>
          <div className="text-[10px] text-gray-500">{run.questionsCorrect}/{run.questionsAttempted}</div>
        </div>
        <div className="bg-black/30 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
            <Swords className="w-3 h-3" /> Damage Dealt
          </div>
          <div className="text-lg font-black text-red-400">{run.totalDamageDealt.toLocaleString()}</div>
        </div>
        <div className="bg-black/30 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
            <Heart className="w-3 h-3" /> HP Remaining
          </div>
          <div className="text-lg font-black text-emerald-400">{run.playerHp}</div>
        </div>
      </div>

      {run.lootCollected.length > 0 && (
        <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-1">
          <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">Loot Collected</div>
          {run.lootCollected.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-gray-300">{item.itemName}</span>
              <span className={`font-bold ${
                item.rarity === 'UNIQUE' ? 'text-yellow-400' :
                item.rarity === 'RARE'   ? 'text-purple-400' :
                item.rarity === 'UNCOMMON' ? 'text-blue-400' : 'text-gray-400'
              }`}>{item.rarity}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onClaim}
        disabled={claiming}
        className="w-full py-3 rounded-xl font-bold text-sm bg-amber-600 hover:bg-amber-500 text-white transition disabled:opacity-50"
      >
        {claiming ? 'Claiming...' : 'Claim Rewards'}
      </button>
    </div>
  );
};

// -------------------------------------------------------
// Main DungeonPanel
// -------------------------------------------------------
const DungeonPanel: React.FC<DungeonPanelProps> = ({ userId, classType }) => {
  const [dungeons, setDungeons] = useState<Dungeon[]>([]);
  const [activeRun, setActiveRun] = useState<DungeonRun | null>(null);
  const [activeDungeon, setActiveDungeon] = useState<Dungeon | null>(null);
  const [lastResult, setLastResult] = useState<RoomAnswerResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [gearScore, setGearScore] = useState(0);
  const toast = useToast();

  // Subscribe to user doc for level and gear score
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      const data = snap.data();
      if (!data) return;
      const gam = data.gamification || {};
      setPlayerLevel(gam.level || 1);
      setGearScore(calculateGearScore(gam.equipped));
    });
    return unsub;
  }, [userId]);

  // Subscribe to available dungeons
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = dataService.subscribeToDungeons(classType, setDungeons);
    } catch { /* permission error */ }
    return () => unsub?.();
  }, [classType]);

  // Subscribe to active run — update whenever dungeons or userId changes
  useEffect(() => {
    if (!activeDungeon) return;
    let unsub: (() => void) | undefined;
    try {
      unsub = dataService.subscribeToActiveDungeonRun(userId, activeDungeon.id, (run) => {
        setActiveRun(run);
      });
    } catch { /* permission error */ }
    return () => unsub?.();
  }, [userId, activeDungeon]);

  const handleStart = async (dungeonId: string) => {
    setStarting(true);
    try {
      const result = await dataService.startDungeonRun(dungeonId);
      const dungeon = dungeons.find(d => d.id === dungeonId) ?? null;
      setActiveDungeon(dungeon);
      setActiveRun(result);
      if (result.resumed) {
        toast.info('Resumed your existing run.');
      } else {
        toast.success('Dungeon run started!');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start dungeon');
    } finally {
      setStarting(false);
    }
  };

  const handleAnswer = async (questionId: string, answer: number) => {
    if (!activeRun) return;
    setSubmitting(true);
    try {
      const result = await dataService.answerDungeonRoom(activeRun.id, questionId, answer);
      setLastResult(result as RoomAnswerResult);

      if (result.correct) {
        if (result.isCrit) {
          toast.success(`CRITICAL HIT! -${result.damage} HP!`);
        } else {
          toast.success(`Correct! -${result.damage} HP!`);
        }
      } else if ((result as RoomAnswerResult).playerDamage && (result as RoomAnswerResult).playerDamage! > 0) {
        toast.error(`Wrong! Enemy hits you for ${(result as RoomAnswerResult).playerDamage} damage!`);
      } else {
        toast.error('Incorrect.');
      }

      // Advance to next room after delay if room was cleared
      if ((result as RoomAnswerResult).roomCleared && !(result as RoomAnswerResult).runCompleted) {
        setTimeout(() => setLastResult(null), 1800);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async () => {
    if (!activeRun) return;
    setClaiming(true);
    try {
      const rewards = await dataService.claimDungeonRewards(activeRun.id);
      toast.success(`Claimed: ${(rewards as { xp: number }).xp} XP + ${(rewards as { flux: number }).flux} Flux!`);
      setActiveRun(null);
      setActiveDungeon(null);
      setLastResult(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to claim rewards');
    } finally {
      setClaiming(false);
    }
  };

  // Active run in progress
  if (activeRun && activeDungeon) {
    const currentRoom: DungeonRoom | undefined = activeDungeon.rooms[activeRun.currentRoom];
    const isCompleted = activeRun.status === 'COMPLETED';

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
            <Swords className="w-5 h-5" /> {activeDungeon.name}
          </h3>
          <button
            onClick={() => { setActiveRun(null); setActiveDungeon(null); setLastResult(null); }}
            className="text-xs text-gray-600 hover:text-gray-400 transition"
          >
            Back to list
          </button>
        </div>

        {/* Dungeon map */}
        <div className="bg-black/20 rounded-xl p-3 border border-white/5">
          <DungeonMap rooms={activeDungeon.rooms} currentRoom={activeRun.currentRoom} />
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 to-black/50 p-5">
          {isCompleted ? (
            <CompletionView run={activeRun} onClaim={handleClaim} claiming={claiming} />
          ) : currentRoom ? (
            <ActiveRoomView
              run={activeRun}
              room={currentRoom}
              onAnswer={handleAnswer}
              submitting={submitting}
              lastResult={lastResult}
            />
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">Loading room...</div>
          )}
        </div>
      </div>
    );
  }

  // Dungeon list
  if (dungeons.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
        <MapPin className="w-5 h-5" /> Dungeon Expeditions
      </h3>
      {dungeons.map(dungeon => (
        <DungeonCard
          key={dungeon.id}
          dungeon={dungeon}
          playerLevel={playerLevel}
          gearScore={gearScore}
          onStart={handleStart}
          loading={starting}
        />
      ))}
    </div>
  );
};

export default DungeonPanel;
