
import React, { useState, useEffect } from 'react';
import { BossQuizEvent, BossQuizProgress, BossModifier, BOSS_MODIFIER_DEFS, BossModifierType, BOSS_PARTICIPATION_MIN_ATTEMPTS, BOSS_PARTICIPATION_MIN_CORRECT } from '../../types';
import { dataService } from '../../services/dataService';
import { sfx } from '../../lib/sfx';
import { useToast } from '../ToastProvider';
import { Brain, CheckCircle2, XCircle, Zap, Heart, Shield, Flame, Crown, Target, TrendingUp, Swords } from 'lucide-react';
import { deriveCombatStats } from '../../lib/gamification';
import BattleScene from './BattleScene';

// Seeded PRNG (mulberry32) — deterministic random from a 32-bit seed
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Simple string → 32-bit hash
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h;
}

// Fisher-Yates shuffle with a seeded PRNG — returns index mapping
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const shuffled = [...arr];
  const rand = mulberry32(seed);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface BossQuizPanelProps {
  userId: string;
  classType: string;
  userSection?: string;
  playerStats?: { tech: number; focus: number; analysis: number; charisma: number };
  playerAppearance?: {
    bodyType?: 'A' | 'B' | 'C';
    hue?: number;
    skinTone?: number;
    hairStyle?: number;
    hairColor?: number;
  };
  playerEquipped?: Record<string, { rarity?: string; visualId?: string } | null | undefined>;
  playerEvolutionLevel?: number;
}

// Aggregates distributed shard damage for a single quiz boss
function useQuizBossHealth(quizId: string, maxHp: number): number {
  const [currentHp, setCurrentHp] = useState(maxHp);
  useEffect(() => {
    const unsub = dataService.subscribeToBossQuizShards(quizId, (totalDamage) => {
      setCurrentHp(Math.max(0, maxHp - totalDamage));
    });
    return () => unsub();
  }, [quizId, maxHp]);
  return currentHp;
}

// Modifier announcement badge component
const ModifierBadge: React.FC<{ modifier: BossModifier }> = ({ modifier }) => {
  const def = BOSS_MODIFIER_DEFS[modifier.type as BossModifierType];
  if (!def) return null;
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/10 border border-pink-500/20 text-[9px] font-bold text-pink-400 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <Flame className="w-2.5 h-2.5" />
      {modifier.label || def.name}
      {def.hasValue && modifier.value !== undefined && <span className="text-pink-300 ml-0.5">{modifier.value}{def.unit}</span>}
    </div>
  );
};

// Student endgame view after boss is defeated
const StudentEndgame: React.FC<{
  quiz: BossQuizEvent;
  progress: BossQuizProgress | null;
}> = ({ quiz, progress }) => {
  const stats = progress?.combatStats;
  const rewardTier = (progress as Record<string, unknown> | null)?.rewardTier as number | undefined;
  const rewardMultiplier = (progress as Record<string, unknown> | null)?.rewardMultiplier as number | undefined;
  const participated = (progress as Record<string, unknown> | null)?.participated as boolean | undefined;

  const attempted = stats?.questionsAttempted || 0;
  const correct = stats?.questionsCorrect || 0;
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

  const tierLabel = rewardTier && rewardTier > 0 ? `#${rewardTier}` : null;
  const tierColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600', 'text-blue-400', 'text-purple-400'];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Victory Banner */}
      <div className="text-center py-4">
        <Crown className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
        <h4 className="text-lg font-black text-yellow-400">Boss Defeated!</h4>
        <p className="text-xs text-gray-500">{quiz.bossName} has been vanquished</p>
      </div>

      {/* Reward Tier */}
      {participated ? (
        <div className="text-center p-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-yellow-500/20">
          {tierLabel && (
            <div className={`text-2xl font-black ${tierColors[(rewardTier || 1) - 1] || 'text-gray-400'}`}>{tierLabel} Place</div>
          )}
          <div className="flex items-center justify-center gap-4 mt-2 text-sm">
            <span className="text-yellow-400 font-bold">{Math.round((quiz.rewards?.xp || 0) * (rewardMultiplier || 1))} XP</span>
            <span className="text-cyan-400 font-bold">{Math.round((quiz.rewards?.flux || 0) * (rewardMultiplier || 1))} Flux</span>
            {rewardMultiplier && rewardMultiplier > 1 && (
              <span className="text-pink-400 font-bold text-xs">({rewardMultiplier}x bonus!)</span>
            )}
          </div>
        </div>
      ) : participated === false ? (
        <div className="text-center p-3 rounded-xl bg-red-500/5 border border-red-500/20">
          <p className="text-sm text-red-400 font-bold">Did not qualify for rewards</p>
          <p className="text-[10px] text-gray-500 mt-1">Needed {BOSS_PARTICIPATION_MIN_ATTEMPTS} attempts and {BOSS_PARTICIPATION_MIN_CORRECT} correct answer</p>
        </div>
      ) : null}

      {/* Personal Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-black/30 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1 text-[9px] text-gray-500 uppercase font-bold mb-1"><Swords className="w-3 h-3" /> Damage Dealt</div>
            <div className="text-lg font-black text-amber-400">{stats.totalDamageDealt.toLocaleString()}</div>
          </div>
          <div className="bg-black/30 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1 text-[9px] text-gray-500 uppercase font-bold mb-1"><Target className="w-3 h-3" /> Accuracy</div>
            <div className="text-lg font-black text-green-400">{accuracy}%</div>
            <div className="text-[10px] text-gray-500">{correct}/{attempted}</div>
          </div>
          <div className="bg-black/30 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1 text-[9px] text-gray-500 uppercase font-bold mb-1"><Zap className="w-3 h-3" /> Critical Hits</div>
            <div className="text-lg font-black text-red-400">{stats.criticalHits}</div>
          </div>
          <div className="bg-black/30 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1 text-[9px] text-gray-500 uppercase font-bold mb-1"><Shield className="w-3 h-3" /> Damage Mitigated</div>
            <div className="text-lg font-black text-cyan-400">{stats.damageReduced}</div>
          </div>
          <div className="bg-black/30 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1 text-[9px] text-gray-500 uppercase font-bold mb-1"><TrendingUp className="w-3 h-3" /> Longest Streak</div>
            <div className="text-lg font-black text-purple-400">{stats.longestStreak}</div>
          </div>
          <div className="bg-black/30 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1 text-[9px] text-gray-500 uppercase font-bold mb-1"><Heart className="w-3 h-3" /> Healing Received</div>
            <div className="text-lg font-black text-emerald-400">{stats.healingReceived}</div>
          </div>
        </div>
      )}

      {/* Difficulty Breakdown */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          {(['EASY', 'MEDIUM', 'HARD'] as const).map(diff => {
            const c = stats.correctByDifficulty[diff] || 0;
            const ic = stats.incorrectByDifficulty[diff] || 0;
            const t = c + ic;
            const pct = t > 0 ? Math.round((c / t) * 100) : 0;
            return (
              <div key={diff} className={`rounded-lg p-2 border text-center ${
                diff === 'EASY' ? 'border-green-500/20 bg-green-500/5' :
                diff === 'MEDIUM' ? 'border-yellow-500/20 bg-yellow-500/5' :
                'border-red-500/20 bg-red-500/5'
              }`}>
                <div className={`text-[9px] font-bold uppercase ${
                  diff === 'EASY' ? 'text-green-400' : diff === 'MEDIUM' ? 'text-yellow-400' : 'text-red-400'
                }`}>{diff}</div>
                <div className="text-sm font-black text-white">{pct}%</div>
                <div className="text-[9px] text-gray-500">{c}/{t}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Individual quiz boss card that subscribes to its own shards
const QuizBossCard: React.FC<{
  quiz: BossQuizEvent;
  userId: string;
  onAnswer: (quizId: string, questionId: string, answer: number) => void;
  submitting: boolean;
  currentQuestion: number;
  selectedAnswer: number | null;
  answerResult: { correct: boolean; damage: number; playerDamage?: number; playerHp?: number; playerMaxHp?: number; knockedOut?: boolean; isCrit?: boolean; healAmount?: number; shieldBlocked?: boolean } | null;
  playerHp: number;
  playerMaxHp: number;
  knockedOut: boolean;
  playerAppearance?: BossQuizPanelProps['playerAppearance'];
  playerEquipped: Record<string, { rarity?: string; visualId?: string } | null | undefined>;
  playerEvolutionLevel: number;
  attackState: 'idle' | 'player-attack' | 'boss-attack';
  attackDamage?: number;
}> = ({ quiz, userId, onAnswer, submitting, currentQuestion, selectedAnswer, answerResult, playerHp, playerMaxHp, knockedOut,
        playerAppearance, playerEquipped, playerEvolutionLevel, attackState, attackDamage }) => {
  const currentHp = useQuizBossHealth(quiz.id, quiz.maxHp);
  const hpPercent = (currentHp / quiz.maxHp) * 100;
  const playerHpPercent = playerMaxHp > 0 ? (playerHp / playerMaxHp) * 100 : 100;

  // Shuffle questions deterministically per student so each sees a unique order
  const shuffledQuestions = React.useMemo(
    () => seededShuffle(quiz.questions, hashString(userId + quiz.id)),
    [quiz.questions, userId, quiz.id]
  );
  const question = shuffledQuestions[currentQuestion % shuffledQuestions.length];
  const allAnswered = currentQuestion >= shuffledQuestions.length;
  const bossDefeated = currentHp <= 0;

  // Subscribe to player's progress for this quiz (for endgame display)
  const [progress, setProgress] = useState<BossQuizProgress | null>(null);
  useEffect(() => {
    const unsub = dataService.subscribeToBossQuizProgress(userId, quiz.id, setProgress);
    return () => unsub();
  }, [userId, quiz.id]);

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 to-black/50 p-5 space-y-4">
      {/* Boss info */}
      <div>
        <h4 className="text-base font-black text-amber-400">{quiz.bossName}</h4>
        <p className="text-xs text-gray-500">{quiz.description}</p>
      </div>

      {/* Active Modifiers */}
      {quiz.modifiers && quiz.modifiers.length > 0 && !bossDefeated && (
        <div className="flex flex-wrap gap-1.5">
          {quiz.modifiers.map((mod, i) => (
            <ModifierBadge key={i} modifier={mod} />
          ))}
        </div>
      )}

      {/* Boss Defeated Endgame */}
      {bossDefeated ? (
        <StudentEndgame quiz={quiz} progress={progress} />
      ) : (
        <>
          {/* Battle Scene — animated player vs boss */}
          <div className="rounded-xl bg-black/30 border border-white/5 overflow-hidden">
            <BattleScene
              playerAppearance={playerAppearance}
              playerEquipped={playerEquipped}
              playerEvolutionLevel={playerEvolutionLevel}
              bossAppearance={quiz.bossAppearance}
              attackState={attackState}
              damage={attackDamage}
              playerHpPercent={playerHpPercent}
              bossHpPercent={hpPercent}
            />
          </div>

          {/* Boss HP bar */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-red-400 font-mono">{currentHp} HP</span>
              <span className="text-gray-600">{quiz.maxHp}</span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-red-600 to-orange-500 transition-all duration-500"
                style={{ width: `${hpPercent}%` }}
              />
            </div>
          </div>

          {/* Player HP bar */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-emerald-400 font-mono flex items-center gap-1"><Heart className="w-3 h-3" /> Your HP: {playerHp}</span>
              <span className="text-gray-600">{playerMaxHp}</span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${playerHpPercent > 50 ? 'bg-gradient-to-r from-emerald-600 to-green-500' : playerHpPercent > 25 ? 'bg-gradient-to-r from-yellow-600 to-orange-500' : 'bg-gradient-to-r from-red-700 to-red-500'}`}
                style={{ width: `${playerHpPercent}%` }}
              />
            </div>
          </div>

          {/* Knocked out state */}
          {knockedOut ? (
            <div className="text-center py-8">
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-red-400">Knocked Out!</p>
              <p className="text-xs text-gray-500 mt-1">The boss has defeated you. Gear up with better armor (Analysis) and health (Charisma) to survive longer.</p>
            </div>
          ) : allAnswered ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-2" />
              <p className="text-sm text-gray-300">All questions answered!</p>
              <p className="text-xs text-gray-500 mt-1">Check back for more questions tomorrow.</p>
            </div>
          ) : question ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Question {currentQuestion + 1} / {shuffledQuestions.length}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  question.difficulty === 'HARD' ? 'bg-red-500/20 text-red-400' :
                  question.difficulty === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-green-500/20 text-green-400'
                }`}>
                  {question.difficulty}
                  {question.damageBonus ? ` (+${question.damageBonus} dmg)` : ''}
                </span>
              </div>

              <p className="text-sm text-white font-medium">{question.stem}</p>

              <div className="space-y-2">
                {question.options.map((option, idx) => {
                  const isSelected = selectedAnswer === idx;
                  const showResult = answerResult && isSelected;
                  const isCorrect = answerResult?.correct;

                  return (
                    <button
                      key={idx}
                      onClick={() => onAnswer(quiz.id, question.id, idx)}
                      disabled={submitting || !!answerResult || knockedOut}
                      className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                        showResult && isCorrect ? 'border-green-500/50 bg-green-500/10 text-green-400' :
                        showResult && !isCorrect ? 'border-red-500/50 bg-red-500/10 text-red-400' :
                        isSelected ? 'border-amber-500/30 bg-amber-500/10' :
                        'border-white/10 bg-white/5 hover:bg-white/10 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-600 w-5">{String.fromCharCode(65 + idx)}.</span>
                        <span>{option}</span>
                        {showResult && isCorrect && <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto" />}
                        {showResult && !isCorrect && <XCircle className="w-4 h-4 text-red-400 ml-auto" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Answer result feedback */}
              {answerResult && answerResult.correct && (
                <div className="text-center space-y-1">
                  <div className="text-sm text-amber-400 font-bold animate-bounce">
                    <Zap className="w-4 h-4 inline mr-1" />
                    {answerResult.isCrit ? 'CRITICAL HIT! ' : ''}-{answerResult.damage} HP to boss!
                  </div>
                  {answerResult.healAmount && answerResult.healAmount > 0 && (
                    <div className="text-xs text-emerald-400 font-bold">
                      <Heart className="w-3 h-3 inline mr-1" /> +{answerResult.healAmount} HP healed
                    </div>
                  )}
                </div>
              )}
              {answerResult && !answerResult.correct && answerResult.shieldBlocked && (
                <div className="text-center text-sm text-cyan-400 font-bold animate-bounce">
                  <Shield className="w-4 h-4 inline mr-1" />
                  Shield blocked the attack!
                </div>
              )}
              {answerResult && !answerResult.correct && !answerResult.shieldBlocked && answerResult.playerDamage && answerResult.playerDamage > 0 && (
                <div className="text-center text-sm text-red-400 font-bold animate-bounce">
                  <Heart className="w-4 h-4 inline mr-1" />
                  Boss hits you for {answerResult.playerDamage} damage!
                </div>
              )}
            </div>
          ) : null}

          {/* Participation requirement (subtle) */}
          {progress && !bossDefeated && !knockedOut && !allAnswered && (
            <div className="text-[9px] text-gray-600 text-center pt-1">
              {(progress.combatStats?.questionsAttempted || 0) < BOSS_PARTICIPATION_MIN_ATTEMPTS || (progress.combatStats?.questionsCorrect || 0) < BOSS_PARTICIPATION_MIN_CORRECT ? (
                <span>
                  Rewards: {progress.combatStats?.questionsAttempted || 0}/{BOSS_PARTICIPATION_MIN_ATTEMPTS} attempts
                  {' '}&middot;{' '}
                  {progress.combatStats?.questionsCorrect || 0}/{BOSS_PARTICIPATION_MIN_CORRECT} correct needed
                </span>
              ) : (
                <span className="text-green-600">Reward participation met</span>
              )}
            </div>
          )}

          {/* Rewards */}
          <div className="flex items-center gap-3 text-[10px] text-gray-500 border-t border-white/5 pt-3">
            <span>Defeat rewards:</span>
            <span className="text-yellow-400">{quiz.rewards.xp} XP</span>
            <span className="text-cyan-400">{quiz.rewards.flux} Flux</span>
            {quiz.rewards.itemRarity && <span className="text-purple-400">{quiz.rewards.itemRarity} item</span>}
          </div>
        </>
      )}
    </div>
  );
};

const BossQuizPanel: React.FC<BossQuizPanelProps> = ({ userId, classType, userSection, playerStats, playerAppearance, playerEquipped, playerEvolutionLevel }) => {
  const [allQuizzes, setAllQuizzes] = useState<BossQuizEvent[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<number>(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<{ correct: boolean; damage: number; playerDamage?: number; playerHp?: number; playerMaxHp?: number; knockedOut?: boolean; isCrit?: boolean; healAmount?: number; shieldBlocked?: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [playerHp, setPlayerHp] = useState<number>(-1); // -1 = not initialized
  const [playerMaxHp, setPlayerMaxHp] = useState<number>(100);
  const [knockedOut, setKnockedOut] = useState(false);
  const [attackState, setAttackState] = useState<'idle' | 'player-attack' | 'boss-attack'>('idle');
  const [attackDamage, setAttackDamage] = useState<number | undefined>(undefined);
  const toast = useToast();

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = dataService.subscribeToBossQuizzes(classType, setAllQuizzes);
    } catch {
      // Firestore permission error — feature not available for this user
    }
    return () => unsub?.();
  }, [classType]);

  // Filter by section if the quiz targets specific sections
  const quizzes = allQuizzes.filter(q =>
    !q.targetSections?.length || q.targetSections.includes(userSection || '')
  );

  // Initialize player HP from stats
  useEffect(() => {
    if (playerStats) {
      const combat = deriveCombatStats(playerStats);
      setPlayerMaxHp(combat.maxHp);
      if (playerHp === -1) setPlayerHp(combat.maxHp);
    }
  }, [playerStats]);

  const handleAnswer = async (quizId: string, questionId: string, answer: number) => {
    if (submitting || knockedOut) return;
    setSubmitting(true);
    setSelectedAnswer(answer);

    try {
      const result = await dataService.answerBossQuiz(quizId, questionId, answer);
      if (result.alreadyAnswered) {
        toast.info('Already answered this question!');
      } else if (result.correct) {
        // Trigger player-attack animation
        setAttackDamage(result.damage);
        setAttackState('player-attack');
        setTimeout(() => setAttackState('idle'), 800);

        sfx.bossHit();
        if (result.bossDefeated) {
          sfx.bossDefeated();
          toast.success('Boss defeated! Completion rewards distributed to all contributors!');
        } else if (result.isCrit) {
          toast.success(`CRITICAL HIT! Dealt ${result.damage} damage!`);
        } else {
          toast.success(`Correct! Dealt ${result.damage} damage!`);
        }
      } else {
        if (result.shieldBlocked) {
          toast.info('Shield blocked the attack!');
        } else if (result.playerDamage && result.playerDamage > 0) {
          // Trigger boss-attack animation
          setAttackDamage(result.playerDamage);
          setAttackState('boss-attack');
          setTimeout(() => setAttackState('idle'), 800);
          toast.error(`Wrong! The boss hits you for ${result.playerDamage} damage!`);
        } else {
          toast.error('Incorrect. No damage dealt.');
        }
      }

      // Handle healing feedback
      if (result.healAmount && result.healAmount > 0 && result.correct) {
        // Healing is already applied server-side, just visual feedback
      }

      // Update player HP from server response
      if (result.playerHp !== undefined) setPlayerHp(result.playerHp);
      if (result.playerMaxHp !== undefined) setPlayerMaxHp(result.playerMaxHp);
      if (result.knockedOut) {
        setKnockedOut(true);
        sfx.bossHit();
      }

      setAnswerResult({
        correct: result.correct,
        damage: result.damage,
        playerDamage: result.playerDamage,
        playerHp: result.playerHp,
        playerMaxHp: result.playerMaxHp,
        knockedOut: result.knockedOut,
        isCrit: result.isCrit,
        healAmount: result.healAmount,
        shieldBlocked: result.shieldBlocked,
      });

      // Auto-advance after delay (unless knocked out)
      if (!result.knockedOut) {
        setTimeout(() => {
          setCurrentQuestion(prev => prev + 1);
          setSelectedAnswer(null);
          setAnswerResult(null);
        }, 2000);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit answer');
    }
    setSubmitting(false);
  };

  if (quizzes.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
        <Brain className="w-5 h-5" /> Boss Quiz Challenge
      </h3>

      {quizzes.map(quiz => (
        <QuizBossCard
          key={quiz.id}
          quiz={quiz}
          userId={userId}
          onAnswer={handleAnswer}
          submitting={submitting}
          currentQuestion={currentQuestion}
          selectedAnswer={selectedAnswer}
          answerResult={answerResult}
          playerHp={playerHp === -1 ? playerMaxHp : playerHp}
          playerMaxHp={playerMaxHp}
          knockedOut={knockedOut}
          playerAppearance={playerAppearance}
          playerEquipped={playerEquipped || {}}
          playerEvolutionLevel={playerEvolutionLevel || 1}
          attackState={attackState}
          attackDamage={attackDamage}
        />
      ))}
    </div>
  );
};

export default BossQuizPanel;
