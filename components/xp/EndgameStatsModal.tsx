
import React from 'react';
import { User, BossQuizEvent, BossQuizProgress, BOSS_REWARD_TIERS, BOSS_PARTICIPATION_MIN_ATTEMPTS, BOSS_PARTICIPATION_MIN_CORRECT } from '../../types';
import { Crown, Eye } from 'lucide-react';
import Modal from '../Modal';

interface EndgameStatsModalProps {
  quiz: BossQuizEvent | null;
  progress: BossQuizProgress[];
  loading: boolean;
  users: User[];
  onClose: () => void;
}

const EndgameStatsModal: React.FC<EndgameStatsModalProps> = ({ quiz, progress, loading, users, onClose }) => {
  return (
    <Modal isOpen={!!quiz} onClose={onClose} title={quiz ? `Endgame: ${quiz.bossName}` : 'Endgame'} maxWidth="max-w-3xl">
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading endgame data...</div>
      ) : quiz && (
        <div className="space-y-6 p-2 max-h-[75vh] overflow-y-auto">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
