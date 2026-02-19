
import React, { useState, useEffect } from 'react';
import { BossQuizEvent } from '../../types';
import { dataService } from '../../services/dataService';
import { sfx } from '../../lib/sfx';
import { useToast } from '../ToastProvider';
import { Brain, CheckCircle2, XCircle, Zap, Heart } from 'lucide-react';
import { deriveCombatStats } from '../../lib/gamification';
import BattleScene from './BattleScene';

interface BossQuizPanelProps {
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

// Individual quiz boss card that subscribes to its own shards
const QuizBossCard: React.FC<{
  quiz: BossQuizEvent;
  onAnswer: (quizId: string, questionId: string, answer: number) => void;
  submitting: boolean;
  currentQuestion: number;
  selectedAnswer: number | null;
  answerResult: { correct: boolean; damage: number; playerDamage?: number; playerHp?: number; playerMaxHp?: number; knockedOut?: boolean } | null;
  playerHp: number;
  playerMaxHp: number;
  knockedOut: boolean;
  playerAppearance?: BossQuizPanelProps['playerAppearance'];
  playerEquipped: Record<string, { rarity?: string; visualId?: string } | null | undefined>;
  playerEvolutionLevel: number;
  attackState: 'idle' | 'player-attack' | 'boss-attack';
  attackDamage?: number;
}> = ({ quiz, onAnswer, submitting, currentQuestion, selectedAnswer, answerResult, playerHp, playerMaxHp, knockedOut,
        playerAppearance, playerEquipped, playerEvolutionLevel, attackState, attackDamage }) => {
  const currentHp = useQuizBossHealth(quiz.id, quiz.maxHp);
  const hpPercent = (currentHp / quiz.maxHp) * 100;
  const playerHpPercent = playerMaxHp > 0 ? (playerHp / playerMaxHp) * 100 : 100;
  const question = quiz.questions[currentQuestion % quiz.questions.length];
  const allAnswered = currentQuestion >= quiz.questions.length;

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 to-black/50 p-5 space-y-4">
      {/* Boss info */}
      <div>
        <h4 className="text-base font-black text-amber-400">{quiz.bossName}</h4>
        <p className="text-xs text-gray-500">{quiz.description}</p>
      </div>

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
            <span>Question {currentQuestion + 1} / {quiz.questions.length}</span>
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

          {answerResult && answerResult.correct && (
            <div className="text-center text-sm text-amber-400 font-bold animate-bounce">
              <Zap className="w-4 h-4 inline mr-1" />
              -{answerResult.damage} HP to boss!
            </div>
          )}
          {answerResult && !answerResult.correct && answerResult.playerDamage && answerResult.playerDamage > 0 && (
            <div className="text-center text-sm text-red-400 font-bold animate-bounce">
              <Heart className="w-4 h-4 inline mr-1" />
              Boss hits you for {answerResult.playerDamage} damage!
            </div>
          )}
        </div>
      ) : null}

      {/* Rewards */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500 border-t border-white/5 pt-3">
        <span>Defeat rewards:</span>
        <span className="text-yellow-400">{quiz.rewards.xp} XP</span>
        <span className="text-cyan-400">{quiz.rewards.flux} Flux</span>
        {quiz.rewards.itemRarity && <span className="text-purple-400">{quiz.rewards.itemRarity} item</span>}
      </div>
    </div>
  );
};

const BossQuizPanel: React.FC<BossQuizPanelProps> = ({ classType, userSection, playerStats, playerAppearance, playerEquipped, playerEvolutionLevel }) => {
  const [allQuizzes, setAllQuizzes] = useState<BossQuizEvent[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<number>(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<{ correct: boolean; damage: number; playerDamage?: number; playerHp?: number; playerMaxHp?: number; knockedOut?: boolean } | null>(null);
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
        } else {
          toast.success(`Correct! Dealt ${result.damage} damage!`);
        }
      } else {
        // Trigger boss-attack animation
        if (result.playerDamage && result.playerDamage > 0) {
          setAttackDamage(result.playerDamage);
          setAttackState('boss-attack');
          setTimeout(() => setAttackState('idle'), 800);
          toast.error(`Wrong! The boss hits you for ${result.playerDamage} damage!`);
        } else {
          toast.error('Incorrect. No damage dealt.');
        }
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
