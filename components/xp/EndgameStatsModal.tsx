
import React, { useMemo, useCallback } from 'react';
import { User, BossQuizEvent, BossQuizProgress, BOSS_REWARD_TIERS, BOSS_PARTICIPATION_MIN_ATTEMPTS, BOSS_PARTICIPATION_MIN_CORRECT } from '../../types';
import { Crown, Eye, Download, AlertTriangle } from 'lucide-react';
import Modal from '../Modal';

interface EndgameStatsModalProps {
  quiz: BossQuizEvent | null;
  progress: BossQuizProgress[];
  loading: boolean;
  users: User[];
  onClose: () => void;
}

const EndgameStatsModal: React.FC<EndgameStatsModalProps> = ({ quiz, progress, loading, users, onClose }) => {
  // --- Per-question analytics ---
  const questionAnalytics = useMemo(() => {
    if (!quiz) return [];
    return quiz.questions.map(q => {
      let attempts = 0;
      progress.forEach(p => {
        if (p.answeredQuestions?.includes(q.id)) {
          attempts++;
        }
      });
      // Use difficulty-based aggregation as best approximation
      const diff = q.difficulty;
      const totalCorrectDiff = progress.reduce((s, p) => s + (p.combatStats?.correctByDifficulty?.[diff] || 0), 0);
      const totalIncorrectDiff = progress.reduce((s, p) => s + (p.combatStats?.incorrectByDifficulty?.[diff] || 0), 0);
      const totalDiff = totalCorrectDiff + totalIncorrectDiff;
      // Per-question estimate: use total attempts for this question and difficulty-level accuracy
      const diffAccuracy = totalDiff > 0 ? totalCorrectDiff / totalDiff : 0;
      return {
        ...q,
        attempts,
        estimatedAccuracy: Math.round(diffAccuracy * 100),
        difficultyAccuracy: diffAccuracy,
      };
    });
  }, [quiz, progress]);

  // Most-missed questions (lowest accuracy, sorted)
  const mostMissed = useMemo(() => {
    return [...questionAnalytics]
      .sort((a, b) => a.estimatedAccuracy - b.estimatedAccuracy)
      .slice(0, 5);
  }, [questionAnalytics]);

  // --- CSV Export ---
  const handleExportCSV = useCallback(() => {
    if (!quiz) return;
    const headers = ['Rank', 'Student', 'Email', 'Damage', 'Correct', 'Attempted', 'Accuracy%', 'Crits', 'Streak', 'Mitigated', 'Status'];
    const sorted = [...progress].sort((a, b) => (b.combatStats?.totalDamageDealt || 0) - (a.combatStats?.totalDamageDealt || 0));
    const rows = sorted.map((prog, idx) => {
      const student = users.find(u => u.id === prog.userId);
      const s = prog.combatStats;
      const attempted = s?.questionsAttempted || 0;
      const correct = s?.questionsCorrect || 0;
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      const participated = attempted >= BOSS_PARTICIPATION_MIN_ATTEMPTS && correct >= BOSS_PARTICIPATION_MIN_CORRECT;
      return [idx + 1, student?.name || prog.userId, student?.email || '', s?.totalDamageDealt || 0, correct, attempted, accuracy, s?.criticalHits || 0, s?.longestStreak || 0, s?.damageReduced || 0, participated ? 'QUALIFIED' : 'DNQ'].join(',');
    });

    const questionHeaders = ['Question#', 'Stem', 'Difficulty', 'CorrectAnswer', 'EstimatedAccuracy%'];
    const questionRows = questionAnalytics.map((q, i) => [
      i + 1,
      `"${q.stem.replace(/"/g, '""')}"`,
      q.difficulty,
      `"${q.options[q.correctAnswer]?.replace(/"/g, '""') || ''}"`,
      q.estimatedAccuracy,
    ].join(','));

    const csv = [
      `Boss Quiz: ${quiz.bossName}`,
      '',
      'PARTICIPANT DATA',
      headers.join(','),
      ...rows,
      '',
      'QUESTION DATA',
      questionHeaders.join(','),
      ...questionRows,
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `boss-quiz-${quiz.bossName.replace(/\s+/g, '-').toLowerCase()}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [quiz, progress, users, questionAnalytics]);

  return (
    <Modal isOpen={!!quiz} onClose={onClose} title={quiz ? `Endgame: ${quiz.bossName}` : 'Endgame'} maxWidth="max-w-4xl">
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading endgame data...</div>
      ) : quiz && (
        <div className="space-y-6 p-2 max-h-[75vh] overflow-y-auto">
          {/* Summary + Export */}
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
              <div className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                <div className="text-2xl font-black text-white">{progress.length}</div>
                <div className="text-[10px] text-gray-500 uppercase font-bold">Participants</div>
              </div>
              <div className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                <div className="text-2xl font-black text-amber-400">{progress.reduce((s, p) => s + (p.combatStats?.totalDamageDealt || 0), 0).toLocaleString()}</div>
                <div className="text-[10px] text-gray-500 uppercase font-bold">Total Damage</div>
              </div>
              <div className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                <div className="text-2xl font-black text-green-400">{progress.reduce((s, p) => s + (p.combatStats?.questionsCorrect || 0), 0)}</div>
                <div className="text-[10px] text-gray-500 uppercase font-bold">Total Correct</div>
              </div>
              <div className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                <div className="text-2xl font-black text-red-400">{progress.reduce((s, p) => s + (p.combatStats?.criticalHits || 0), 0)}</div>
                <div className="text-[10px] text-gray-500 uppercase font-bold">Total Crits</div>
              </div>
            </div>
            <button
              onClick={handleExportCSV}
              className="ml-3 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/10 transition flex items-center gap-1.5 flex-shrink-0"
              title="Export to CSV"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>

          {/* Top 5 Leaderboard */}
          <div>
            <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-3"><Crown className="w-4 h-4" /> Top Damage Dealers</h4>
            <div className="space-y-2">
              {[...progress]
                .sort((a, b) => (b.combatStats?.totalDamageDealt || 0) - (a.combatStats?.totalDamageDealt || 0))
                .slice(0, 5)
                .map((prog, idx) => {
                  const student = users.find(u => u.id === prog.userId);
                  const stats = prog.combatStats;
                  const multiplier = idx < BOSS_REWARD_TIERS.length ? BOSS_REWARD_TIERS[idx] : 1;
                  const participated = (stats?.questionsAttempted || 0) >= BOSS_PARTICIPATION_MIN_ATTEMPTS && (stats?.questionsCorrect || 0) >= BOSS_PARTICIPATION_MIN_CORRECT;
                  const medalColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600', 'text-blue-400', 'text-purple-400'];
                  return (
                    <div key={prog.userId} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${idx === 0 ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-black/20 border-white/5'}`}>
                      <div className={`text-xl font-black w-8 text-center ${medalColors[idx] || 'text-gray-500'}`}>#{idx + 1}</div>
                      {student?.avatarUrl && <img src={student.avatarUrl} className="w-8 h-8 rounded-lg border border-white/10" alt="" loading="lazy" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{student?.name || prog.userId}</div>
                        <div className="flex gap-2 text-[10px] text-gray-500">
                          <span className="text-amber-400 font-bold">{stats?.totalDamageDealt?.toLocaleString() || 0} dmg</span>
                          <span>{stats?.questionsCorrect || 0}/{stats?.questionsAttempted || 0} correct</span>
                          <span>{stats?.criticalHits || 0} crits</span>
                          <span>Streak: {stats?.longestStreak || 0}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {participated ? (
                          <span className={`text-xs font-bold ${idx < 5 ? medalColors[idx] : 'text-gray-400'}`}>{multiplier}x</span>
                        ) : (
                          <span className="text-[10px] text-red-400 font-bold">DNQ</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Per-Question Analytics */}
          {quiz.questions.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-orange-400" /> Question Analytics</h4>
              <div className="text-[10px] text-gray-500 mb-3">Accuracy rates based on per-difficulty aggregation across all participants.</div>

              {/* Most Missed */}
              {mostMissed.length > 0 && mostMissed[0].estimatedAccuracy < 70 && (
                <div className="mb-4 p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                  <div className="text-[10px] font-bold text-red-400 uppercase mb-2">Most Challenging Questions (Consider Re-teaching)</div>
                  <div className="space-y-2">
                    {mostMissed.filter(q => q.estimatedAccuracy < 70).map(q => (
                      <div key={q.id} className="flex items-start gap-2">
                        <span className="text-[10px] text-red-400 font-bold mt-0.5">Q{quiz.questions.indexOf(q) + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white truncate">{q.stem}</div>
                          <div className="flex gap-2 mt-0.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${q.difficulty === 'EASY' ? 'bg-green-500/10 text-green-400' : q.difficulty === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>{q.difficulty}</span>
                            <span className="text-[9px] text-gray-500">{q.estimatedAccuracy}% accuracy</span>
                            <span className="text-[9px] text-green-400">Answer: {q.options[q.correctAnswer]}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Question Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead><tr className="text-[9px] text-gray-500 uppercase font-bold border-b border-white/5">
                    <th className="pb-2 pl-2">#</th>
                    <th className="pb-2">Question</th>
                    <th className="pb-2 text-center">Difficulty</th>
                    <th className="pb-2 text-center">Est. Accuracy</th>
                    <th className="pb-2">Correct Answer</th>
                  </tr></thead>
                  <tbody className="divide-y divide-white/5">
                    {questionAnalytics.map((q, idx) => (
                      <tr key={q.id} className={`hover:bg-white/5 ${q.estimatedAccuracy < 50 ? 'bg-red-500/5' : ''}`}>
                        <td className="py-2 pl-2 font-bold text-gray-500">{idx + 1}</td>
                        <td className="py-2 text-white max-w-[300px] truncate">{q.stem}</td>
                        <td className="py-2 text-center">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${q.difficulty === 'EASY' ? 'bg-green-500/10 text-green-400' : q.difficulty === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>{q.difficulty}</span>
                        </td>
                        <td className="py-2 text-center">
                          <span className={`font-bold ${q.estimatedAccuracy >= 70 ? 'text-green-400' : q.estimatedAccuracy >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {q.estimatedAccuracy}%
                          </span>
                        </td>
                        <td className="py-2 text-gray-400 max-w-[200px] truncate">{q.options[q.correctAnswer]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Suggested Difficulty Adjustments */}
              {questionAnalytics.some(q => (q.difficulty === 'EASY' && q.estimatedAccuracy < 50) || (q.difficulty === 'HARD' && q.estimatedAccuracy > 80)) && (
                <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                  <div className="text-[10px] font-bold text-amber-400 uppercase mb-2">Suggested Difficulty Adjustments</div>
                  <div className="space-y-1">
                    {questionAnalytics
                      .filter(q => (q.difficulty === 'EASY' && q.estimatedAccuracy < 50) || (q.difficulty === 'HARD' && q.estimatedAccuracy > 80))
                      .map(q => (
                        <div key={q.id} className="text-[10px] text-gray-400 flex items-center gap-2">
                          <span className="font-bold text-white">Q{quiz.questions.indexOf(q) + 1}:</span>
                          {q.difficulty === 'EASY' && q.estimatedAccuracy < 50 && (
                            <span>Marked as <span className="text-green-400">EASY</span> but only {q.estimatedAccuracy}% accuracy — consider upgrading to <span className="text-yellow-400">MEDIUM</span></span>
                          )}
                          {q.difficulty === 'HARD' && q.estimatedAccuracy > 80 && (
                            <span>Marked as <span className="text-red-400">HARD</span> but {q.estimatedAccuracy}% accuracy — consider downgrading to <span className="text-yellow-400">MEDIUM</span></span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Full Participant Table */}
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-3"><Eye className="w-4 h-4" /> All Participants</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="text-[9px] text-gray-500 uppercase font-bold border-b border-white/5">
                  <th className="pb-2 pl-2">#</th>
                  <th className="pb-2">Student</th>
                  <th className="pb-2 text-center">Damage</th>
                  <th className="pb-2 text-center">Correct</th>
                  <th className="pb-2 text-center">Attempted</th>
                  <th className="pb-2 text-center">Accuracy</th>
                  <th className="pb-2 text-center">Crits</th>
                  <th className="pb-2 text-center">Streak</th>
                  <th className="pb-2 text-center">Mitigated</th>
                  <th className="pb-2 text-center">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-white/5">
                  {[...progress]
                    .sort((a, b) => (b.combatStats?.totalDamageDealt || 0) - (a.combatStats?.totalDamageDealt || 0))
                    .map((prog, idx) => {
                      const student = users.find(u => u.id === prog.userId);
                      const s = prog.combatStats;
                      const attempted = s?.questionsAttempted || 0;
                      const correct = s?.questionsCorrect || 0;
                      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
                      const participated = attempted >= BOSS_PARTICIPATION_MIN_ATTEMPTS && correct >= BOSS_PARTICIPATION_MIN_CORRECT;
                      return (
                        <tr key={prog.userId} className="hover:bg-white/5">
                          <td className="py-2 pl-2 font-bold text-gray-500">{idx + 1}</td>
                          <td className="py-2 font-bold text-white">{student?.name || prog.userId.slice(0, 8)}</td>
                          <td className="py-2 text-center text-amber-400 font-bold">{(s?.totalDamageDealt || 0).toLocaleString()}</td>
                          <td className="py-2 text-center text-green-400">{correct}</td>
                          <td className="py-2 text-center text-gray-400">{attempted}</td>
                          <td className="py-2 text-center text-gray-300">{accuracy}%</td>
                          <td className="py-2 text-center text-red-400">{s?.criticalHits || 0}</td>
                          <td className="py-2 text-center text-purple-400">{s?.longestStreak || 0}</td>
                          <td className="py-2 text-center text-cyan-400">{s?.damageReduced || 0}</td>
                          <td className="py-2 text-center">{participated
                            ? <span className="text-green-400 text-[9px] font-bold">QUALIFIED</span>
                            : <span className="text-red-400 text-[9px] font-bold">DNQ</span>}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Difficulty Breakdown */}
          <div>
            <h4 className="text-sm font-bold text-white mb-3">Performance by Difficulty</h4>
            <div className="grid grid-cols-3 gap-3">
              {(['EASY', 'MEDIUM', 'HARD'] as const).map(diff => {
                const totalCorrect = progress.reduce((s, p) => s + (p.combatStats?.correctByDifficulty?.[diff] || 0), 0);
                const totalIncorrect = progress.reduce((s, p) => s + (p.combatStats?.incorrectByDifficulty?.[diff] || 0), 0);
                const total = totalCorrect + totalIncorrect;
                const accuracy = total > 0 ? Math.round((totalCorrect / total) * 100) : 0;
                const color = diff === 'EASY' ? 'green' : diff === 'MEDIUM' ? 'yellow' : 'red';
                return (
                  <div key={diff} className={`bg-${color}-500/5 border border-${color}-500/20 rounded-xl p-3 text-center`}>
                    <div className={`text-[10px] font-bold text-${color}-400 uppercase mb-1`}>{diff}</div>
                    <div className="text-lg font-black text-white">{accuracy}%</div>
                    <div className="text-[10px] text-gray-500">{totalCorrect}/{total} correct</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default EndgameStatsModal;
