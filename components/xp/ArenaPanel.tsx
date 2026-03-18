import React, { useState, useEffect, useRef } from 'react';
import { ArenaMatch, ArenaProfile, ArenaRound } from '../../types';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import { db } from '../../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Swords, TrendingUp, TrendingDown, Loader2, X, Star, Zap, Shield, ShieldCheck, Target, Crown, type LucideIcon } from 'lucide-react';
import { calculateGearScore } from '../../lib/gamification';

interface ArenaPanelProps {
  userId: string;
  classType: string;
}

// Role badge color mapping
const ROLE_COLORS: Record<string, string> = {
  VANGUARD:   'text-red-400 bg-red-500/10 border-red-500/20',
  SENTINEL:   'text-blue-400 bg-blue-500/10 border-blue-500/20',
  COMMANDER:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  SPECIALIST: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  GHOST:      'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

// Rating brackets — spy/operative themed
const RATING_BRACKETS: readonly { name: string; min: number; max: number; color: string; barColor: string; bg: string; border: string; Icon: LucideIcon }[] = [
  { name: 'Recruit',          min: 0,    max: 799,      color: 'text-gray-400',   barColor: 'bg-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/20',   Icon: Shield },
  { name: 'Field Agent',      min: 800,  max: 999,      color: 'text-green-400',  barColor: 'bg-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  Icon: Shield },
  { name: 'Specialist',       min: 1000, max: 1199,     color: 'text-blue-400',   barColor: 'bg-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   Icon: ShieldCheck },
  { name: 'Elite Operative',  min: 1200, max: 1499,     color: 'text-purple-400', barColor: 'bg-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', Icon: Target },
  { name: 'Shadow Commander', min: 1500, max: Infinity,  color: 'text-amber-400',  barColor: 'bg-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  Icon: Crown },
];

function getRatingBracket(rating: number) {
  return RATING_BRACKETS.find(b => rating >= b.min && rating <= b.max) || RATING_BRACKETS[0];
}

// HP bar component
const HpBar: React.FC<{ current: number; max: number; color: 'blue' | 'red' }> = ({ current, max, color }) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className="w-full h-2 bg-[var(--panel-bg)] rounded-full overflow-hidden border border-[var(--border)]">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color === 'blue' ? 'bg-blue-500' : 'bg-red-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

// Individual round row
const RoundRow: React.FC<{ round: ArenaRound; p1Name: string; p2Name: string; p1MaxHp: number; p2MaxHp: number; visible: boolean }> = ({
  round, p1Name, p2Name, p1MaxHp, p2MaxHp, visible
}) => (
  <div className={`transition-all duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
    <div className="flex items-center gap-2 text-xs py-1.5 border-b border-[var(--border)]">
      <span className="text-[var(--text-muted)] w-14 flex-shrink-0 font-mono">Rnd {round.roundNumber}</span>
      {/* P1 action */}
      <span className="text-blue-400 flex-1 truncate">
        {p1Name}: <span className={`font-bold ${round.p1Action.isCrit ? 'text-yellow-400' : 'text-blue-300'}`}>
          {round.p1Action.damage} dmg{round.p1Action.isCrit ? ' CRIT' : ''}
        </span>
        {round.p1Action.blocked > 0 && <span className="text-[var(--text-muted)]"> (-{round.p1Action.blocked} blocked)</span>}
      </span>
      {/* P2 HP after */}
      <div className="w-16 flex-shrink-0">
        <HpBar current={round.p2HpAfter} max={p2MaxHp} color="red" />
        <span className="text-[9px] text-[var(--text-muted)]">{round.p2HpAfter}/{p2MaxHp}</span>
      </div>
    </div>
    <div className="flex items-center gap-2 text-xs py-1.5 border-b border-[var(--border)]">
      <span className="text-[var(--text-muted)] w-14 flex-shrink-0" />
      {/* P2 action */}
      <span className="text-red-400 flex-1 truncate">
        {p2Name}: <span className={`font-bold ${round.p2Action.isCrit ? 'text-yellow-400' : 'text-red-300'}`}>
          {round.p2Action.damage} dmg{round.p2Action.isCrit ? ' CRIT' : ''}
        </span>
        {round.p2Action.blocked > 0 && <span className="text-[var(--text-muted)]"> (-{round.p2Action.blocked} blocked)</span>}
      </span>
      {/* P1 HP after */}
      <div className="w-16 flex-shrink-0">
        <HpBar current={round.p1HpAfter} max={p1MaxHp} color="blue" />
        <span className="text-[9px] text-[var(--text-muted)]">{round.p1HpAfter}/{p1MaxHp}</span>
      </div>
    </div>
  </div>
);

// Match history row
const MatchHistoryRow: React.FC<{ match: ArenaMatch; userId: string }> = ({ match, userId }) => {
  const isP1 = match.player1?.userId === userId;
  const opponent = isP1 ? match.player2 : match.player1;
  const won = match.winnerId === userId;
  const tied = match.winnerId === null || match.winnerId === undefined;
  const ratingChange = tied ? 0 : won ? 15 : -10;

  return (
    <div className="flex items-center gap-3 py-2 border-b border-[var(--border)] text-xs">
      <span className={`w-10 text-center font-black text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${
        tied ? 'text-gray-400 bg-gray-500/10 border-gray-500/20' :
        won  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
               'text-red-400 bg-red-500/10 border-red-500/20'
      }`}>
        {tied ? 'TIE' : won ? 'WIN' : 'LOSS'}
      </span>
      <span className="text-[var(--text-secondary)] flex-1 truncate">vs {opponent?.name || 'Unknown'}</span>
      <span className={`font-bold flex-shrink-0 ${ratingChange > 0 ? 'text-emerald-400' : ratingChange < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
        {ratingChange > 0 ? `+${ratingChange}` : ratingChange}
      </span>
    </div>
  );
};

// -------------------------------------------------------
// Main ArenaPanel component
// -------------------------------------------------------
const ArenaPanel: React.FC<ArenaPanelProps> = ({ userId, classType }) => {
  const toast = useToast();
  const [gearScore, setGearScore] = useState(0);

  // Arena profile state (from user gamification data — passed via parent or fetched here)
  const [arenaProfile, setArenaProfile] = useState<ArenaProfile>({
    rating: 1000, wins: 0, losses: 0, matchesPlayedToday: 0
  });

  // Subscribe to user doc for gear score and arena profile
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      const data = snap.data();
      if (!data) return;
      const gam = data.gamification || {};
      setGearScore(calculateGearScore(gam.equipped));
      if (gam.arenaProfile) setArenaProfile(gam.arenaProfile);
    });
    return unsub;
  }, [userId]);

  // Match flow state
  const [phase, setPhase] = useState<'LOBBY' | 'QUEUED' | 'RESULT'>('LOBBY');
  const [queueMatchId, setQueueMatchId] = useState<string | null>(null);
  const [completedMatch, setCompletedMatch] = useState<ArenaMatch | null>(null);
  const [matchResult, setMatchResult] = useState<{ winnerId: string | null; xpEarned: number; fluxEarned: number } | null>(null);
  const [loading, setLoading] = useState(false);

  // Round replay state
  const [visibleRounds, setVisibleRounds] = useState(0);
  const [replaying, setReplaying] = useState(false);

  // Match history
  const [history, setHistory] = useState<ArenaMatch[]>([]);

  const unsubQueueRef = useRef<(() => void) | null>(null);
  const unsubHistoryRef = useRef<(() => void) | null>(null);
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to match history
  useEffect(() => {
    unsubHistoryRef.current = dataService.subscribeToArenaMatches(userId, classType, (matches) => {
      setHistory(matches);
    });
    return () => {
      unsubHistoryRef.current?.();
    };
  }, [userId, classType]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
      unsubQueueRef.current?.();
    };
  }, []);

  const dailyMatchesUsed = arenaProfile.matchesPlayedToday || 0;
  const dailyLimit = 5;
  const matchesRemaining = Math.max(0, dailyLimit - dailyMatchesUsed);
  const today = new Date().toDateString();
  const limitReached = arenaProfile.lastMatchDate === today && dailyMatchesUsed >= dailyLimit;

  // Start matchmaking
  const handleFindMatch = async () => {
    if (limitReached || loading) return;
    setLoading(true);
    try {
      const result = await dataService.queueArenaDuel(classType);

      if (result.status === 'MATCHED' && result.rounds && result.rounds.length > 0) {
        // Immediate match found — build a synthetic ArenaMatch for display
        const syntheticMatch: ArenaMatch = {
          id: result.matchId,
          classType,
          mode: 'AUTO_DUEL',
          player1: result.opponent as any,
          player2: {
            userId,
            name: 'You',
            gearScore,
            stats: { tech: 10, focus: 10, analysis: 10, charisma: 10 },
            role: '',
            hp: 0,
            maxHp: result.rounds[0] ? result.rounds[0].p1HpAfter + result.rounds[0].p1Action.damage : 100,
          },
          rounds: result.rounds as any[],
          winnerId: result.winnerId || undefined,
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        const won = result.winnerId === userId;
        const tied = result.winnerId === null || result.winnerId === undefined;
        setCompletedMatch(syntheticMatch);
        setMatchResult({
          winnerId: result.winnerId ?? null,
          xpEarned: won ? 50 : 20,
          fluxEarned: won ? 10 : 5,
        });
        // Update local profile optimistically
        setArenaProfile(prev => ({
          ...prev,
          rating: Math.max(0, prev.rating + (won ? 15 : tied ? 0 : -10)),
          wins: prev.wins + (won ? 1 : 0),
          losses: prev.losses + (!won && !tied ? 1 : 0),
          matchesPlayedToday: (prev.lastMatchDate === today ? prev.matchesPlayedToday : 0) + 1,
          lastMatchDate: today,
        }));
        setVisibleRounds(0);
        setPhase('RESULT');
      } else if (result.status === 'QUEUED') {
        setQueueMatchId(result.matchId);
        setPhase('QUEUED');
        // Subscribe to the queued document to detect when an opponent joins
        if (unsubQueueRef.current) {
          unsubQueueRef.current();
          unsubQueueRef.current = null;
        }
        unsubQueueRef.current = dataService.subscribeToArenaQueue(result.matchId, (match) => {
          if (match && match.status === 'COMPLETED') {
            unsubQueueRef.current?.();
            unsubQueueRef.current = null;
            const won = match.winnerId === userId;
            const tied = !match.winnerId;
            setCompletedMatch(match);
            setMatchResult({
              winnerId: match.winnerId ?? null,
              xpEarned: won ? 50 : 20,
              fluxEarned: won ? 10 : 5,
            });
            setArenaProfile(prev => ({
              ...prev,
              rating: Math.max(0, prev.rating + (won ? 15 : tied ? 0 : -10)),
              wins: prev.wins + (won ? 1 : 0),
              losses: prev.losses + (!won && !tied ? 1 : 0),
              matchesPlayedToday: (prev.lastMatchDate === today ? prev.matchesPlayedToday : 0) + 1,
              lastMatchDate: today,
            }));
            setVisibleRounds(0);
            setPhase('RESULT');
          }
        });
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to enter arena.');
    } finally {
      setLoading(false);
    }
  };

  // Cancel queue
  const handleCancelQueue = async () => {
    if (!queueMatchId) return;
    try {
      await dataService.cancelArenaQueue(queueMatchId);
      unsubQueueRef.current?.();
      unsubQueueRef.current = null;
      setQueueMatchId(null);
      setPhase('LOBBY');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to cancel queue.');
    }
  };

  // Animate round replay
  const handlePlayReplay = () => {
    if (!completedMatch || replaying) return;
    setVisibleRounds(0);
    setReplaying(true);
    const totalRounds = completedMatch.rounds.length;
    const showNext = (n: number) => {
      setVisibleRounds(n);
      if (n < totalRounds) {
        replayTimerRef.current = setTimeout(() => showNext(n + 1), 700);
      } else {
        setReplaying(false);
      }
    };
    showNext(1);
  };

  const handleBackToLobby = () => {
    setCompletedMatch(null);
    setMatchResult(null);
    setVisibleRounds(0);
    setPhase('LOBBY');
  };

  // -------------------------------------------------------
  // PHASE: LOBBY
  // -------------------------------------------------------
  if (phase === 'LOBBY') {
    return (
      <div className="space-y-4">
        {/* Header stats */}
        <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--panel-bg)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-widest">PvP Arena</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xl font-black text-amber-400">{arenaProfile.rating}</div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Rating</div>
            </div>
            <div>
              <div className="text-xl font-black text-emerald-400">{arenaProfile.wins}</div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Wins</div>
            </div>
            <div>
              <div className="text-xl font-black text-red-400">{arenaProfile.losses}</div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Losses</div>
            </div>
          </div>
          {/* Rating bracket card */}
          {(() => {
            const bracket = getRatingBracket(arenaProfile.rating);
            const bracketIdx = RATING_BRACKETS.indexOf(bracket);
            const nextBracket = RATING_BRACKETS[bracketIdx + 1];
            const progressInBracket = nextBracket
              ? Math.round(((arenaProfile.rating - bracket.min) / (nextBracket.min - bracket.min)) * 100)
              : 100;
            const BracketIcon = bracket.Icon;
            return (
              <div className={`${bracket.bg} border ${bracket.border} rounded-xl p-3`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-black ${bracket.color} flex items-center gap-1.5`}>
                    <BracketIcon className="w-4 h-4" />{bracket.name}
                  </span>
                  <span className="text-xs font-mono text-[var(--text-tertiary)]">{arenaProfile.rating} SR</span>
                </div>
                {nextBracket && (
                  <div className="mt-2">
                    <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${bracket.barColor} transition-all duration-500`}
                        style={{ width: `${progressInBracket}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-[var(--text-muted)] mt-0.5">
                      <span>{bracket.min}</span>
                      <span>{nextBracket.min} ({nextBracket.name})</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Daily matches remaining */}
          <div className="flex items-center justify-between text-xs border-t border-[var(--border)] pt-2">
            <span className="text-[var(--text-muted)]">Daily matches</span>
            <span className={`font-bold ${matchesRemaining === 0 ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>
              {dailyMatchesUsed}/{dailyLimit} used
            </span>
          </div>
          {/* Gear score bracket info */}
          <div className="text-[10px] text-[var(--text-muted)] text-center">
            Gear Score: <span className="text-[var(--text-tertiary)] font-bold">{gearScore}</span>
            {' '}&mdash; Bracket: <span className="text-[var(--text-tertiary)]">{Math.max(0, gearScore - 100)} &ndash; {gearScore + 100}</span>
          </div>
        </div>

        {/* Find match button */}
        <button
          onClick={handleFindMatch}
          disabled={limitReached || loading}
          className={`w-full py-3 rounded-xl font-black text-sm transition ${
            limitReached
              ? 'bg-[var(--surface-raised)] text-[var(--text-muted)] cursor-not-allowed'
              : loading
              ? 'bg-amber-700/50 text-amber-300 cursor-wait'
              : 'bg-amber-600 hover:bg-amber-500 text-white'
          }`}
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 inline mr-2 animate-spin" />Finding Opponent...</>
          ) : limitReached ? (
            'Daily Limit Reached'
          ) : (
            <><Swords className="w-4 h-4 inline mr-2" />Find Match</>
          )}
        </button>

        {/* Match history */}
        <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--panel-bg)] p-4">
          <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">Recent Matches</h4>
          {history.length > 0 ? (
            history.map((m) => (
              <MatchHistoryRow key={m.id} match={m} userId={userId} />
            ))
          ) : (
            <div className="text-center py-12">
              <Swords className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)] opacity-40" />
              <p className="text-sm text-[var(--text-tertiary)]">No arena matches yet</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Challenge a classmate to climb the ranks!</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // PHASE: QUEUED (searching)
  // -------------------------------------------------------
  if (phase === 'QUEUED') {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-center space-y-4">
          <Loader2 className="w-10 h-10 text-amber-400 animate-spin mx-auto" />
          <div>
            <p className="text-[var(--text-primary)] font-bold">Searching for opponent...</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Gear Score bracket: {Math.max(0, gearScore - 100)} &ndash; {gearScore + 100}
            </p>
          </div>
          <div className="text-xs text-[var(--text-muted)]">Bracket expands to &plusmn;150 after 30s</div>
          <button
            onClick={handleCancelQueue}
            className="flex items-center gap-2 mx-auto text-xs text-[var(--text-tertiary)] hover:text-red-400 transition px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-red-500/20"
          >
            <X className="w-3.5 h-3.5" />Cancel
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // PHASE: RESULT
  // -------------------------------------------------------
  if (phase === 'RESULT' && completedMatch && matchResult) {
    const isP1 = completedMatch.player1?.userId === userId;
    const me = isP1 ? completedMatch.player1 : completedMatch.player2;
    const opponent = isP1 ? completedMatch.player2 : completedMatch.player1;
    const won = matchResult.winnerId === userId;
    const tied = matchResult.winnerId === null || matchResult.winnerId === undefined;
    const ratingChange = tied ? 0 : won ? 15 : -10;

    // For the round display, normalize so "P1" is always the player viewing
    const rounds = isP1 ? completedMatch.rounds : completedMatch.rounds.map(r => ({
      ...r,
      p1Action: r.p2Action,
      p2Action: r.p1Action,
      p1HpAfter: r.p2HpAfter,
      p2HpAfter: r.p1HpAfter,
    }));

    const p1MaxHp = completedMatch.player1?.maxHp || 100;
    const p2MaxHp = completedMatch.player2?.maxHp || 100;
    const myMaxHp = isP1 ? p1MaxHp : p2MaxHp;
    const oppMaxHp = isP1 ? p2MaxHp : p1MaxHp;

    return (
      <div className="space-y-4">
        {/* Victory / Defeat banner */}
        <div className={`rounded-2xl border p-4 text-center ${
          tied ? 'border-gray-500/20 bg-gray-500/5' :
          won  ? 'border-emerald-500/30 bg-emerald-500/5' :
                 'border-red-500/30 bg-red-500/5'
        }`}>
          <div className={`text-2xl font-black uppercase tracking-widest ${
            tied ? 'text-gray-300' : won ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {tied ? 'Draw' : won ? 'Victory' : 'Defeat'}
          </div>
          <div className="flex items-center justify-center gap-4 mt-2 text-sm">
            <span className="text-yellow-400 font-bold flex items-center gap-1">
              <Star className="w-3.5 h-3.5" />+{matchResult.xpEarned} XP
            </span>
            <span className="text-cyan-400 font-bold flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" />+{matchResult.fluxEarned} Flux
            </span>
            <span className={`font-bold flex items-center gap-1 ${ratingChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {ratingChange >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {ratingChange > 0 ? `+${ratingChange}` : ratingChange} rating
            </span>
          </div>
        </div>

        {/* Combatant row */}
        <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--panel-bg)] p-4">
          <div className="flex items-center gap-3">
            {/* My card */}
            <div className="flex-1 text-center space-y-1">
              <div className="text-xs font-bold text-blue-300 truncate">{me?.name || 'You'}</div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${ROLE_COLORS[me?.role || ''] || 'text-[var(--text-muted)] bg-[var(--surface-glass)] border-[var(--border)]'}`}>
                {me?.role || '—'}
              </span>
              <div className="text-[10px] text-[var(--text-muted)]">GS {me?.gearScore || 0}</div>
            </div>
            <div className="text-xs font-black text-[var(--text-muted)]">VS</div>
            {/* Opponent card */}
            <div className="flex-1 text-center space-y-1">
              <div className="text-xs font-bold text-red-300 truncate">{opponent?.name || 'Opponent'}</div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${ROLE_COLORS[opponent?.role || ''] || 'text-[var(--text-muted)] bg-[var(--surface-glass)] border-[var(--border)]'}`}>
                {opponent?.role || '—'}
              </span>
              <div className="text-[10px] text-[var(--text-muted)]">GS {opponent?.gearScore || 0}</div>
            </div>
          </div>
        </div>

        {/* Round replay */}
        <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--panel-bg)] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest">Combat Log</h4>
            {!replaying && visibleRounds < rounds.length && (
              <button
                onClick={handlePlayReplay}
                className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 transition"
              >
                <Swords className="w-3 h-3" />Play
              </button>
            )}
            {replaying && (
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            )}
            {!replaying && visibleRounds === rounds.length && rounds.length > 0 && (
              <span className="text-[10px] text-[var(--text-muted)]">Complete</span>
            )}
          </div>
          {rounds.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">No combat rounds recorded.</p>
          ) : (
            <div className="space-y-0 max-h-64 overflow-y-auto pr-1">
              {rounds.map((round, i) => (
                <RoundRow
                  key={round.roundNumber}
                  round={round}
                  p1Name={me?.name || 'You'}
                  p2Name={opponent?.name || 'Opponent'}
                  p1MaxHp={myMaxHp}
                  p2MaxHp={oppMaxHp}
                  visible={i < visibleRounds}
                />
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleBackToLobby}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-[var(--panel-bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition"
        >
          Back to Arena Lobby
        </button>
      </div>
    );
  }

  return null;
};

export default ArenaPanel;
