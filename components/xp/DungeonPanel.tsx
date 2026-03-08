import React, { useState, useEffect, useRef } from 'react';
import { Dungeon, DungeonRun, DungeonRoom, BossAppearance } from '../../types';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import { sfx } from '../../lib/sfx';
import { db } from '../../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  Swords, Heart, Star, Lock, Trophy, ChevronRight,
  MapPin, Shield, CheckCircle2, XCircle, Zap, Brain, Crown, Gift,
} from 'lucide-react';
import { calculateGearScore } from '../../lib/gamification';
import BattleScene from './BattleScene';
import BossAvatar from './BossAvatar';
import OperativeAvatar from '../dashboard/OperativeAvatar';
import Avatar3D from '../dashboard/Avatar3D';

// -------------------------------------------------------
// Props interface — extended with player visual data
// -------------------------------------------------------
interface DungeonPanelProps {
  userId: string;
  classType: string;
  playerAppearance?: {
    bodyType?: 'A' | 'B' | 'C';
    hue?: number;
    skinTone?: number;
    hairStyle?: number;
    hairColor?: number;
  };
  playerEquipped?: Record<string, { rarity?: string; visualId?: string } | null | undefined>;
  playerEvolutionLevel?: number;
  selectedCharacterModel?: string;
}

// Reset timer label from resetsAt field
function resetLabel(resetsAt?: string): string {
  if (!resetsAt) return 'Unlimited runs';
  if (resetsAt === 'DAILY') return 'Resets daily';
  return 'Resets weekly';
}

// Rarity display color for loot text
const rarityColor: Record<string, string> = {
  UNIQUE:   'text-yellow-400',
  RARE:     'text-purple-400',
  UNCOMMON: 'text-blue-400',
  COMMON:   'text-gray-400',
};

// Room type badge color classes
const roomTypeBadge: Record<string, string> = {
  COMBAT:   'text-red-400 bg-red-500/10 border-red-500/20',
  PUZZLE:   'text-blue-400 bg-blue-500/10 border-blue-500/20',
  BOSS:     'text-amber-400 bg-amber-500/10 border-amber-500/20',
  REST:     'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  TREASURE: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
};

// Icon per room type — used in the map tiles
const RoomIcon: React.FC<{ type: string; className?: string }> = ({ type, className = 'w-5 h-5' }) => {
  switch (type) {
    case 'COMBAT':   return <Swords  className={className} />;
    case 'PUZZLE':   return <Brain   className={className} />;
    case 'BOSS':     return <Crown   className={className} />;
    case 'REST':     return <Heart   className={className} />;
    case 'TREASURE': return <Gift    className={className} />;
    default:         return <MapPin  className={className} />;
  }
};

// -------------------------------------------------------
// HP bar (reused for player and enemy)
// -------------------------------------------------------
const HpBar: React.FC<{
  label: string;
  current: number;
  max: number;
  color: 'player' | 'enemy';
}> = ({ label, current, max, color }) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const gradientClass = color === 'player'
    ? pct > 50  ? 'bg-gradient-to-r from-emerald-600 to-green-500'
                : pct > 25 ? 'bg-gradient-to-r from-yellow-600 to-orange-500'
                           : 'bg-gradient-to-r from-red-700 to-red-500'
    : 'bg-gradient-to-r from-red-600 to-orange-500';

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className={`font-mono flex items-center gap-1 ${color === 'player' ? 'text-emerald-400' : 'text-red-400'}`}>
          {color === 'player' && <Heart className="w-3 h-3" aria-hidden="true" />}
          {label}: {current}
        </span>
        <span className="text-gray-600">{max}</span>
      </div>
      <div
        className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden"
        /* Screen readers see the numeric label above; the bar is decorative */
        aria-hidden="true"
      >
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ${gradientClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

// -------------------------------------------------------
// Agent status bar — compact stats strip at run top
// -------------------------------------------------------
interface AgentStatusBarProps {
  playerAppearance?: DungeonPanelProps['playerAppearance'];
  playerEquipped:    DungeonPanelProps['playerEquipped'];
  playerEvolutionLevel?: number;
  selectedCharacterModel?: string;
  run: DungeonRun;
}

const AgentStatusBar: React.FC<AgentStatusBarProps> = ({
  playerAppearance,
  playerEquipped,
  playerEvolutionLevel,
  selectedCharacterModel,
  run,
}) => {
  // Derive display stats from the run's recorded combat stats (atk = totalDamageDealt
  // isn't a static stat, so we use combatStats fields that map to gear-derived numbers).
  // The most reliable values available at runtime come from the run's combatStats object.
  const stats = run.combatStats;
  const atk    = Math.round(run.totalDamageDealt > 0 ? run.totalDamageDealt / Math.max(1, stats.questionsCorrect) : 0);
  const critPct = stats.questionsAttempted > 0
    ? Math.round((stats.criticalHits / stats.questionsAttempted) * 100)
    : 0;
  const armPct  = stats.questionsAttempted > 0
    ? Math.round((stats.damageReduced / Math.max(1, stats.damageReduced + stats.bossDamageTaken)) * 100)
    : 0;

  const equipped = playerEquipped ?? {};

  return (
    /* aria-label identifies this region to screen readers */
    <section
      aria-label="Agent status"
      className="flex items-center gap-3 bg-black/30 border border-white/10 rounded-xl px-3 py-2"
    >
      {/* Tiny avatar — decorative complement to the text stats */}
      <div className="w-8 h-8 flex-shrink-0" aria-hidden="true">
        {selectedCharacterModel ? (
          <Avatar3D characterModelId={selectedCharacterModel} appearance={playerAppearance} evolutionLevel={playerEvolutionLevel ?? 1} compact />
        ) : (
          <OperativeAvatar equipped={equipped} appearance={playerAppearance} evolutionLevel={playerEvolutionLevel ?? 1} />
        )}
      </div>

      {/* HP bar */}
      <div className="flex-1 min-w-0">
        <HpBar label="HP" current={run.playerHp} max={run.maxHp} color="player" />
      </div>

      {/* Compact combat stats — text so screen readers surface them */}
      <div className="flex-shrink-0 text-[10px] font-mono text-gray-400 leading-tight text-right">
        <span className="text-red-400 font-bold">ATK {atk}</span>
        {' | '}
        <span className="text-amber-400 font-bold">CRIT {critPct}%</span>
        {' | '}
        <span className="text-cyan-400 font-bold">ARM {armPct}%</span>
      </div>
    </section>
  );
};

// -------------------------------------------------------
// Dungeon map — visual room tiles with scroll to active
// -------------------------------------------------------
const DungeonMap: React.FC<{
  rooms: DungeonRoom[];
  currentRoom: number;
}> = ({ rooms, currentRoom }) => {
  const scrollRef  = useRef<HTMLDivElement>(null);
  const activeRef  = useRef<HTMLDivElement>(null);

  // Auto-scroll to the active tile whenever it changes
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentRoom]);

  return (
    /* overflow-x-auto lets narrow Chromebook viewports scroll the map */
    <div
      ref={scrollRef}
      className="flex items-center gap-1 overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      role="list"
      aria-label="Dungeon rooms"
    >
      {rooms.map((room, i) => {
        const cleared = i < currentRoom;
        const active  = i === currentRoom;

        return (
          <React.Fragment key={room.id}>
            {/* Room tile */}
            <div
              ref={active ? activeRef : null}
              role="listitem"
              /* aria-current marks the room the player is in right now */
              aria-current={active ? 'step' : undefined}
              aria-label={`${room.name} — ${room.type}${cleared ? ', cleared' : active ? ', current room' : ', not yet reached'}`}
              className={`
                flex flex-col items-center justify-center gap-1 flex-shrink-0
                w-16 rounded-xl border px-1 py-2 transition-all duration-300 select-none
                ${cleared
                  ? 'border-emerald-500/50 bg-emerald-600/10 text-emerald-400'
                  : active
                  ? 'border-amber-400/70 bg-amber-500/15 text-amber-300 scale-105 shadow-[0_0_12px_rgba(251,191,36,0.25)] animate-pulse'
                  : 'border-white/5 bg-black/20 text-gray-700 opacity-50'
                }
              `}
            >
              {/* Room type icon */}
              <span aria-hidden="true">
                {cleared
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  : <RoomIcon type={room.type} />
                }
              </span>
              {/* Truncated room name */}
              <span className="text-[8px] font-bold leading-none text-center line-clamp-2 w-full px-0.5">
                {room.name}
              </span>
            </div>

            {/* Connector between tiles */}
            {i < rooms.length - 1 && (
              <ChevronRight
                aria-hidden="true"
                className={`w-3 h-3 flex-shrink-0 ${cleared ? 'text-emerald-600' : 'text-gray-700'}`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// -------------------------------------------------------
// Room cleared overlay — briefly shown on room advance
// -------------------------------------------------------
const RoomClearedOverlay: React.FC<{ visible: boolean }> = ({ visible }) => (
  /* aria-live="polite" announces room completion without interrupting reading */
  <div
    aria-live="polite"
    role="status"
    className={`
      absolute inset-0 z-20 flex items-center justify-center
      bg-black/60 rounded-2xl transition-opacity duration-500
      ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
    `}
  >
    <div className="flex flex-col items-center gap-2">
      <CheckCircle2 className="w-10 h-10 text-emerald-400" aria-hidden="true" />
      <span className="text-lg font-black text-emerald-400 tracking-wide">Room Cleared!</span>
    </div>
  </div>
);

// -------------------------------------------------------
// Answer result — shared type
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

// -------------------------------------------------------
// Healing particles that float upward in the REST room
// (pure CSS SVG animation — no JS timers needed)
// -------------------------------------------------------
const HealParticles: React.FC = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 120 80"
    className="absolute inset-0 w-full h-full pointer-events-none"
  >
    {[20, 40, 60, 80, 100].map((cx, i) => (
      <circle key={i} cx={cx} cy={70} r="2.5" fill="#4ade80" fillOpacity="0.6">
        <animate
          attributeName="cy"
          values={`70;${10 + i * 6};70`}
          dur={`${2 + i * 0.4}s`}
          repeatCount="indefinite"
        />
        <animate
          attributeName="fillOpacity"
          values="0.6;0;0.6"
          dur={`${2 + i * 0.4}s`}
          repeatCount="indefinite"
        />
      </circle>
    ))}
  </svg>
);

// -------------------------------------------------------
// Treasure glow effect behind the avatar
// -------------------------------------------------------
const TreasureGlow: React.FC = () => (
  <div
    aria-hidden="true"
    className="absolute inset-0 rounded-xl bg-yellow-400/10 animate-pulse pointer-events-none"
    style={{ boxShadow: '0 0 32px 8px rgba(251,191,36,0.2)' }}
  />
);

// -------------------------------------------------------
// Active room view
// -------------------------------------------------------
interface ActiveRoomViewProps {
  run: DungeonRun;
  room: DungeonRoom;
  onAnswer: (questionId: string, answer: number) => Promise<void>;
  submitting: boolean;
  lastResult: RoomAnswerResult | null;
  playerAppearance?: DungeonPanelProps['playerAppearance'];
  playerEquipped:    DungeonPanelProps['playerEquipped'];
  playerEvolutionLevel?: number;
  selectedCharacterModel?: string;
}

const ActiveRoomView: React.FC<ActiveRoomViewProps> = ({
  run, room, onAnswer, submitting, lastResult,
  playerAppearance, playerEquipped, playerEvolutionLevel, selectedCharacterModel,
}) => {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  // attackState drives the BattleScene animation — resets after 600ms
  const [attackState, setAttackState] = useState<'idle' | 'player-attack' | 'boss-attack'>('idle');
  const [animDamage, setAnimDamage] = useState<number | undefined>(undefined);
  const [animCrit, setAnimCrit]     = useState<boolean | undefined>(undefined);
  const attackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const equipped = playerEquipped ?? {};

  // Derive the current question so we can reset selection when it changes
  const question     = room.questions?.find(q => !run.answeredQuestions.includes(q.id));
  const questionId   = question?.id ?? null;

  // Reset selection when room advances OR when the current question changes
  // (e.g. after answering one question in a multi-question room)
  useEffect(() => {
    setSelectedAnswer(null);
    setAttackState('idle');
    setAnimDamage(undefined);
    setAnimCrit(undefined);
  }, [run.currentRoom, questionId]);

  const handleSelect = async (idx: number) => {
    if (submitting || selectedAnswer !== null) return;
    setSelectedAnswer(idx);
    const q = room.questions?.find(q => !run.answeredQuestions.includes(q.id));
    if (!q) return;
    await onAnswer(q.id, idx);
  };

  // Trigger attack animation when a result arrives
  useEffect(() => {
    if (!lastResult) return;

    // Clear any prior timer
    if (attackTimer.current) clearTimeout(attackTimer.current);

    if (lastResult.correct) {
      setAnimDamage(lastResult.damage);
      setAnimCrit(lastResult.isCrit);
      setAttackState('player-attack');
    } else if ((lastResult.playerDamage ?? 0) > 0) {
      setAnimDamage(lastResult.playerDamage);
      setAnimCrit(false);
      setAttackState('boss-attack');
    }

    // Reset to idle after animation window
    attackTimer.current = setTimeout(() => {
      setAttackState('idle');
      setAnimDamage(undefined);
      setAnimCrit(undefined);
    }, 600);

    return () => {
      if (attackTimer.current) clearTimeout(attackTimer.current);
    };
  }, [lastResult]);

  const enemyHp      = run.currentRoomEnemyHp ?? (room.enemyHp || 0);
  const enemyMaxHp   = room.enemyHp || 0;
  const playerHpPct  = run.maxHp > 0 ? Math.max(0, (run.playerHp / run.maxHp) * 100) : 0;
  const bossHpPct    = enemyMaxHp > 0 ? Math.max(0, (enemyHp / enemyMaxHp) * 100) : 0;
  const isRestRoom     = room.type === 'REST';
  const isTreasureRoom = room.type === 'TREASURE';
  const isCombatRoom   = room.type === 'COMBAT' || room.type === 'BOSS';

  // Default boss appearance for combat rooms without an explicit appearance
  const bossAppearance: BossAppearance = room.enemyAppearance ?? { bossType: 'BRUTE', hue: 0 };

  return (
    <div className="space-y-4">
      {/* Room header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${roomTypeBadge[room.type] ?? 'text-gray-500 bg-white/5 border-white/5'}`}
          aria-label={`Room type: ${room.type}`}
        >
          {room.type}
        </span>
        <h4 className="text-sm font-bold text-white">{room.name}</h4>
        <span
          className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded ${
            room.difficulty === 'HARD'   ? 'bg-red-500/20 text-red-400' :
            room.difficulty === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' :
                                           'bg-green-500/20 text-green-400'
          }`}
          aria-label={`Difficulty: ${room.difficulty}`}
        >
          {room.difficulty}
        </span>
      </div>

      {/* ── COMBAT / BOSS rooms: BattleScene + HP bars ── */}
      {isCombatRoom && (
        <>
          {/* BattleScene renders the full animated encounter visual */}
          <div
            className="rounded-xl overflow-hidden bg-black/20 border border-white/5"
            /* Announce battle events through the result text below, not the visual */
            aria-hidden="true"
          >
            <BattleScene
              playerAppearance={playerAppearance}
              playerEquipped={equipped}
              playerEvolutionLevel={playerEvolutionLevel ?? 1}
              selectedCharacterModel={selectedCharacterModel}
              bossAppearance={bossAppearance}
              attackState={attackState}
              damage={animDamage}
              isCrit={animCrit}
              playerHpPercent={playerHpPct}
              bossHpPercent={bossHpPct}
              healAmount={lastResult?.healAmount}
              playerRole={run.combatStats.role}
              phaseTransition={null}
              triggeredAbility={null}
            />
          </div>

          {/* Enemy HP bar — accessible numeric readout */}
          {enemyMaxHp > 0 && (
            <HpBar
              label={room.enemyName || 'Enemy'}
              current={enemyHp}
              max={enemyMaxHp}
              color="enemy"
            />
          )}
        </>
      )}

      {/* ── REST room ── */}
      {isRestRoom && (
        <div className="relative text-center py-8 rounded-xl bg-emerald-500/5 border border-emerald-500/20 overflow-hidden">
          {/* Healing particles float up behind the avatar */}
          <HealParticles />

          {/* Player avatar, centered — makes the agent present in the room */}
          <div
            className="relative mx-auto w-16 h-24 z-10"
            aria-hidden="true"
          >
            {selectedCharacterModel ? (
              <Avatar3D characterModelId={selectedCharacterModel} appearance={playerAppearance} evolutionLevel={playerEvolutionLevel ?? 1} compact />
            ) : (
              <OperativeAvatar equipped={equipped} appearance={playerAppearance} evolutionLevel={playerEvolutionLevel ?? 1} />
            )}
          </div>

          <p className="relative z-10 text-sm font-bold text-emerald-400 mt-2">Rest Area</p>
          <p className="relative z-10 text-xs text-gray-500 mt-0.5">
            {room.healAmount ? `Restoring +${room.healAmount} HP...` : 'Catching your breath...'}
          </p>
          {/* aria-live announces the heal result to screen readers */}
          <div aria-live="polite" role="status">
            {lastResult?.healAmount && (
              <p className="relative z-10 mt-2 text-emerald-400 font-bold text-sm">
                +{lastResult.healAmount} HP restored!
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── TREASURE room ── */}
      {isTreasureRoom && (
        <div className="relative text-center py-8 rounded-xl bg-yellow-500/5 border border-yellow-500/20 overflow-hidden">
          <TreasureGlow />

          {/* Player avatar with loot glow context */}
          <div
            className="relative mx-auto w-16 h-24 z-10"
            aria-hidden="true"
          >
            {selectedCharacterModel ? (
              <Avatar3D characterModelId={selectedCharacterModel} appearance={playerAppearance} evolutionLevel={playerEvolutionLevel ?? 1} compact />
            ) : (
              <OperativeAvatar equipped={equipped} appearance={playerAppearance} evolutionLevel={playerEvolutionLevel ?? 1} />
            )}
          </div>

          <p className="relative z-10 text-sm font-bold text-yellow-400 mt-2">Treasure Room</p>

          {/* aria-live announces loot discovery */}
          <div aria-live="polite" role="status">
            {lastResult?.loot ? (
              <p className="relative z-10 text-xs text-gray-300 mt-1">
                Found:{' '}
                <span className={`font-bold ${rarityColor[lastResult.loot.rarity] ?? 'text-gray-400'}`}>
                  {lastResult.loot.itemName}
                </span>
              </p>
            ) : (
              <p className="relative z-10 text-xs text-gray-500 mt-1">Searching for loot...</p>
            )}
          </div>
        </div>
      )}

      {/* ── Question (COMBAT / PUZZLE / BOSS) ── */}
      {question && !isRestRoom && !isTreasureRoom && (
        <div className="space-y-3">
          <p className="text-base text-white font-semibold leading-relaxed">{question.stem}</p>

          {/* Answer choices */}
          <fieldset>
            {/* Visually hidden legend provides accessible group label */}
            <legend className="sr-only">Choose your answer</legend>
            <div className="space-y-2.5">
              {question.options.map((option, idx) => {
                const isSelected  = selectedAnswer === idx;
                const showResult  = lastResult && isSelected;
                const isCorrect   = showResult && lastResult.correct;
                const isWrong     = showResult && !lastResult.correct;

                return (
                  <button
                    key={idx}
                    onClick={() => handleSelect(idx)}
                    disabled={submitting || selectedAnswer !== null}
                    /* Explicit type prevents accidental form submission */
                    type="button"
                    aria-pressed={isSelected}
                    className={`
                      w-full text-left p-4 rounded-xl border text-base transition-all
                      focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                      focus-visible:outline-amber-400
                      ${isCorrect  ? 'border-green-500/50 bg-green-500/10 text-green-400' :
                        isWrong    ? 'border-red-500/50 bg-red-500/10 text-red-400' :
                        isSelected ? 'border-amber-500/30 bg-amber-500/10' :
                                     'border-white/10 bg-white/5 hover:bg-white/10 text-gray-300'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-gray-600 w-6" aria-hidden="true">
                        {String.fromCharCode(65 + idx)}.
                      </span>
                      <span>{option}</span>
                      {/* Result icons — color alone is never the sole signal; icon + aria-pressed together signal state */}
                      {isCorrect && <CheckCircle2 className="w-5 h-5 text-green-400 ml-auto shrink-0" aria-label="Correct" />}
                      {isWrong   && <XCircle      className="w-5 h-5 text-red-400 ml-auto shrink-0"   aria-label="Incorrect" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Answer feedback — announced by aria-live */}
          <div aria-live="polite" role="status" className="text-center space-y-1">
            {lastResult?.correct && (
              <p className="text-base text-amber-400 font-bold">
                <Zap className="w-4 h-4 inline mr-1" aria-hidden="true" />
                {lastResult.isCrit ? 'Critical hit! ' : ''}
                {lastResult.damage} damage dealt!
              </p>
            )}
            {lastResult && !lastResult.correct && (lastResult.playerDamage ?? 0) > 0 && (
              <p className="text-sm text-red-400 font-bold">
                <Heart className="w-4 h-4 inline mr-1" aria-hidden="true" />
                Enemy hits you for {lastResult.playerDamage} damage!
              </p>
            )}
          </div>
        </div>
      )}

      {/* No questions remaining but room not yet marked cleared */}
      {!question && !isRestRoom && !isTreasureRoom && !lastResult?.roomCleared && (
        <div className="text-center py-6 text-gray-500 text-sm">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" aria-hidden="true" />
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
        <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-2" aria-hidden="true" />
        {/* h4 sits inside the panel which already has an h3 heading — correct hierarchy */}
        <h4 className="text-lg font-black text-yellow-400">Dungeon Cleared!</h4>
        <p className="text-xs text-gray-500">{run.dungeonName} conquered</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-black/30 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
            <MapPin className="w-3 h-3" aria-hidden="true" /> Rooms Cleared
          </div>
          <div className="text-lg font-black text-amber-400">{run.roomsCleared}</div>
        </div>
        <div className="bg-black/30 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
            <Star className="w-3 h-3" aria-hidden="true" /> Accuracy
          </div>
          <div className="text-lg font-black text-green-400">{accuracy}%</div>
          <div className="text-[10px] text-gray-500">{run.questionsCorrect}/{run.questionsAttempted}</div>
        </div>
        <div className="bg-black/30 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
            <Swords className="w-3 h-3" aria-hidden="true" /> Damage Dealt
          </div>
          <div className="text-lg font-black text-red-400">{run.totalDamageDealt.toLocaleString()}</div>
        </div>
        <div className="bg-black/30 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
            <Heart className="w-3 h-3" aria-hidden="true" /> HP Remaining
          </div>
          <div className="text-lg font-black text-emerald-400">{run.playerHp}</div>
        </div>
      </div>

      {run.lootCollected.length > 0 && (
        <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-1">
          <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">Loot Collected</div>
          <ul className="space-y-1" aria-label="Collected loot">
            {run.lootCollected.map((item, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-300">{item.itemName}</span>
                <span className={`font-bold ${rarityColor[item.rarity] ?? 'text-gray-400'}`}>
                  {item.rarity}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onClaim}
        disabled={claiming}
        className="w-full py-3 rounded-xl font-bold text-sm bg-amber-600 hover:bg-amber-500 text-white transition disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
      >
        {claiming ? 'Claiming rewards...' : 'Claim Rewards'}
      </button>
    </div>
  );
};

// -------------------------------------------------------
// DungeonCard — dungeon list entry with enemy preview
// -------------------------------------------------------
const DungeonCard: React.FC<{
  dungeon: Dungeon;
  playerLevel: number;
  gearScore: number;
  onStart: (dungeonId: string) => void;
  loading: boolean;
}> = ({ dungeon, playerLevel, gearScore, onStart, loading }) => {
  const levelLocked = dungeon.minLevel    !== undefined && playerLevel < dungeon.minLevel;
  const gearLocked  = dungeon.minGearScore !== undefined && gearScore  < dungeon.minGearScore;
  const locked      = levelLocked || gearLocked;

  // Find the first enemy/boss room with an appearance to show a preview
  const previewRoom = dungeon.rooms.find(
    r => (r.type === 'COMBAT' || r.type === 'BOSS') && r.enemyAppearance,
  );
  const previewBoss = previewRoom?.enemyAppearance;

  return (
    <article
      className={`rounded-2xl border p-4 space-y-3 ${locked ? 'border-white/5 bg-black/20 opacity-60' : 'border-white/10 bg-black/30'}`}
      aria-label={`Dungeon: ${dungeon.name}${locked ? ' — locked' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* h4 inside the card; the outer panel has h3 — sequential hierarchy maintained */}
          <h4 className="font-bold text-white text-base leading-snug">{dungeon.name}</h4>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{dungeon.description}</p>
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] font-bold text-gray-500">{dungeon.rooms.length} rooms</span>
          <span className="text-[10px] text-gray-600">{resetLabel(dungeon.resetsAt)}</span>
        </div>
      </div>

      {/* Enemy preview thumbnail — decorative, so aria-hidden */}
      {previewBoss && (
        <div
          className="flex items-center gap-2 bg-black/20 rounded-lg p-2 border border-white/5"
          aria-hidden="true"
        >
          <div className="w-10 h-12 flex-shrink-0">
            <BossAvatar bossType={previewBoss.bossType} hue={previewBoss.hue} size={48} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-gray-600 uppercase font-bold">Enemies await</p>
            <p className={`text-[10px] font-bold ${roomTypeBadge[previewRoom!.type]?.split(' ')[0] ?? 'text-gray-400'}`}>
              {previewRoom!.enemyName ?? previewBoss.bossType}
            </p>
          </div>
        </div>
      )}

      {/* Requirements row */}
      <div className="flex flex-wrap gap-1.5">
        {dungeon.minLevel && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${levelLocked ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-gray-500 bg-white/5 border-white/5'}`}
            aria-label={`Requires level ${dungeon.minLevel}${levelLocked ? ' — not met' : ''}`}
          >
            {levelLocked && <Lock className="w-2.5 h-2.5 inline mr-0.5" aria-hidden="true" />}
            Lv. {dungeon.minLevel}+
          </span>
        )}
        {dungeon.minGearScore && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${gearLocked ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-gray-500 bg-white/5 border-white/5'}`}
            aria-label={`Requires gear score ${dungeon.minGearScore}${gearLocked ? ' — not met' : ''}`}
          >
            {gearLocked && <Lock className="w-2.5 h-2.5 inline mr-0.5" aria-hidden="true" />}
            GS {dungeon.minGearScore}+
          </span>
        )}
        {/* Room type summary badges */}
        {dungeon.rooms.slice(0, 5).map((room, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${roomTypeBadge[room.type] ?? 'text-gray-500 bg-white/5 border-white/5'}`}
          >
            {room.type[0]}
          </span>
        ))}
      </div>

      {/* Rewards row */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500 border-t border-white/5 pt-2" aria-label="Rewards">
        <span className="text-yellow-400 font-bold">{dungeon.rewards.xp} XP</span>
        <span className="text-cyan-400 font-bold">{dungeon.rewards.flux} Flux</span>
        {dungeon.rewards.itemRarity && (
          <span className={`font-bold ${rarityColor[dungeon.rewards.itemRarity] ?? 'text-gray-400'}`}>
            {dungeon.rewards.itemRarity} item
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onStart(dungeon.id)}
        disabled={locked || loading}
        aria-busy={loading ? true : undefined}
        className={`
          w-full py-2.5 rounded-xl text-sm font-bold transition
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-amber-400
          ${locked
            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
            : 'bg-amber-600 hover:bg-amber-500 text-white'
          }
        `}
      >
        {locked ? (
          <>
            <Lock className="w-3.5 h-3.5 inline mr-1.5" aria-hidden="true" />
            Locked
          </>
        ) : loading ? (
          <>
            <svg className="w-3.5 h-3.5 inline mr-1.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Entering Dungeon...
          </>
        ) : (
          <>
            <Swords className="w-3.5 h-3.5 inline mr-1.5" aria-hidden="true" />
            Enter Dungeon
          </>
        )}
      </button>
    </article>
  );
};

// -------------------------------------------------------
// Main DungeonPanel
// -------------------------------------------------------
const DungeonPanel: React.FC<DungeonPanelProps> = ({
  userId,
  classType,
  playerAppearance,
  playerEquipped,
  playerEvolutionLevel,
  selectedCharacterModel,
}) => {
  const [dungeons,      setDungeons]      = useState<Dungeon[]>([]);
  const [activeRun,     setActiveRun]     = useState<DungeonRun | null>(null);
  const [activeDungeon, setActiveDungeon] = useState<Dungeon | null>(null);
  const [lastResult,    setLastResult]    = useState<RoomAnswerResult | null>(null);
  const [starting,      setStarting]      = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [claiming,      setClaiming]      = useState(false);
  const [playerLevel,   setPlayerLevel]   = useState(1);
  const [gearScore,     setGearScore]     = useState(0);
  // Controls the "Room Cleared!" overlay
  const [showRoomCleared, setShowRoomCleared] = useState(false);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Subscribe to available dungeons for this class
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = dataService.subscribeToDungeons(classType, setDungeons);
    } catch { /* permission error — silently skip */ }
    return () => unsub?.();
  }, [classType]);

  // Subscribe to the active run whenever a dungeon is entered
  useEffect(() => {
    if (!activeDungeon) return;
    let unsub: (() => void) | undefined;
    try {
      unsub = dataService.subscribeToActiveDungeonRun(userId, activeDungeon.id, (run) => {
        setActiveRun(run);
      });
    } catch { /* permission error — silently skip */ }
    return () => unsub?.();
  }, [userId, activeDungeon]);

  // Clean up overlay timer on unmount
  useEffect(() => {
    return () => { if (overlayTimer.current) clearTimeout(overlayTimer.current); };
  }, []);

  const handleStart = async (dungeonId: string) => {
    setStarting(true);
    try {
      const result      = await dataService.startDungeonRun(dungeonId);
      sfx.dungeonEntry();
      const dungeon     = dungeons.find(d => d.id === dungeonId) ?? null;
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

      const r = result as RoomAnswerResult;

      if (r.correct) {
        toast.success(r.isCrit ? `Critical hit! -${r.damage} HP!` : `Correct! -${r.damage} HP!`);
      } else if ((r.playerDamage ?? 0) > 0) {
        toast.error(`Wrong! Enemy hits you for ${r.playerDamage} damage!`);
      } else {
        toast.error('Incorrect.');
      }

      // Show "Room Cleared!" overlay then clear it so the next room can begin
      if (r.roomCleared && !r.runCompleted) {
        if (overlayTimer.current) clearTimeout(overlayTimer.current);
        setShowRoomCleared(true);
        overlayTimer.current = setTimeout(() => {
          setShowRoomCleared(false);
          setLastResult(null);
        }, 1400);
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

  // ── Active run in progress ──────────────────────────────────────────────
  if (activeRun && activeDungeon) {
    const currentRoom: DungeonRoom | undefined = activeDungeon.rooms[activeRun.currentRoom];
    const isCompleted = activeRun.status === 'COMPLETED';

    return (
      /* role="region" + aria-label gives screen readers a named landmark */
      <section aria-label={`Active dungeon run: ${activeDungeon.name}`} className="space-y-4">
        {/* Run header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
            <Swords className="w-5 h-5" aria-hidden="true" />
            {activeDungeon.name}
          </h3>
          <button
            type="button"
            onClick={() => { setActiveRun(null); setActiveDungeon(null); setLastResult(null); }}
            className="text-xs text-gray-600 hover:text-gray-400 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 rounded"
          >
            Back to dungeon list
          </button>
        </div>

        {/* Agent status bar (hidden during completion screen) */}
        {!isCompleted && (
          <AgentStatusBar
            playerAppearance={playerAppearance}
            playerEquipped={playerEquipped}
            playerEvolutionLevel={playerEvolutionLevel}
            selectedCharacterModel={selectedCharacterModel}
            run={activeRun}
          />
        )}

        {/* Visual dungeon map */}
        <div className="bg-black/20 rounded-xl p-3 border border-white/5">
          <DungeonMap rooms={activeDungeon.rooms} currentRoom={activeRun.currentRoom} />
        </div>

        {/* Room content panel — position:relative required for the overlay */}
        <div className="relative rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 to-black/50 p-5">
          {/* Room cleared transition overlay */}
          <RoomClearedOverlay visible={showRoomCleared} />

          {isCompleted ? (
            <CompletionView run={activeRun} onClaim={handleClaim} claiming={claiming} />
          ) : currentRoom ? (
            <ActiveRoomView
              run={activeRun}
              room={currentRoom}
              onAnswer={handleAnswer}
              submitting={submitting}
              lastResult={lastResult}
              playerAppearance={playerAppearance}
              playerEquipped={playerEquipped}
              playerEvolutionLevel={playerEvolutionLevel}
              selectedCharacterModel={selectedCharacterModel}
            />
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm" aria-live="polite">
              Loading room...
            </div>
          )}
        </div>
      </section>
    );
  }

  // ── Dungeon list ────────────────────────────────────────────────────────
  if (dungeons.length === 0) return null;

  return (
    <section aria-label="Dungeon expeditions" className="space-y-4">
      <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
        <MapPin className="w-5 h-5" aria-hidden="true" />
        Dungeon Expeditions
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
    </section>
  );
};

export default DungeonPanel;
