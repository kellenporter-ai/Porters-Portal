
import React, { useState, useEffect } from 'react';
import { BossQuizEvent } from '../../types';
import { dataService } from '../../services/dataService';
import { sfx } from '../../lib/sfx';
import { useToast } from '../ToastProvider';
import { Brain, CheckCircle2, XCircle, Zap } from 'lucide-react';

interface BossQuizPanelProps {
  classType: string;
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
  answerResult: { correct: boolean; damage: number } | null;
}> = ({ quiz, onAnswer, submitting, currentQuestion, selectedAnswer, answerResult }) => {
  const currentHp = useQuizBossHealth(quiz.id, quiz.maxHp);
  const hpPercent = (currentHp / quiz.maxHp) * 100;
  const question = quiz.questions[currentQuestion % quiz.questions.length];
  const allAnswered = currentQuestion >= quiz.questions.length;

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 to-black/50 p-5 space-y-4">
      {/* Boss info */}
      <div>
        <h4 className="text-base font-black text-amber-400">{quiz.bossName}</h4>
        <p className="text-xs text-gray-500">{quiz.description}</p>
      </div>

      {/* HP bar — driven by distributed shard aggregation */}
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

      {/* Question */}
      {allAnswered ? (
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
                  disabled={submitting || !!answerResult}
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
              -{answerResult.damage} HP!
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

const BossQuizPanel: React.FC<BossQuizPanelProps> = ({ classType }) => {
  const [quizzes, setQuizzes] = useState<BossQuizEvent[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<number>(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<{ correct: boolean; damage: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = dataService.subscribeToBossQuizzes(classType, setQuizzes);
    } catch {
      // Firestore permission error — feature not available for this user
    }
    return () => unsub?.();
  }, [classType]);

  const handleAnswer = async (quizId: string, questionId: string, answer: number) => {
    if (submitting) return;
    setSubmitting(true);
    setSelectedAnswer(answer);

    try {
      const result = await dataService.answerBossQuiz(quizId, questionId, answer);
      if (result.alreadyAnswered) {
        toast.info('Already answered this question!');
      } else if (result.correct) {
        sfx.bossHit();
        if (result.bossDefeated) {
          sfx.bossDefeated();
          toast.success('Boss defeated! Completion rewards distributed to all contributors!');
        } else {
          toast.success(`Correct! Dealt ${result.damage} damage!`);
        }
      } else {
        toast.error('Incorrect. No damage dealt.');
      }
      setAnswerResult({ correct: result.correct, damage: result.damage });

      // Auto-advance after delay
      setTimeout(() => {
        setCurrentQuestion(prev => prev + 1);
        setSelectedAnswer(null);
        setAnswerResult(null);
      }, 2000);
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
        />
      ))}
    </div>
  );
};

export default BossQuizPanel;
