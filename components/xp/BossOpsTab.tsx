import React, { useState } from 'react';
import { BossQuizEvent, BossQuestionBank } from '../../types';
import { Brain, Trash2, Pencil, Plus, Swords, Database, BarChart3 } from 'lucide-react';

interface BossOpsTabProps {
  quizBosses: BossQuizEvent[];
  questionBanks: BossQuestionBank[];
  onEditQuizBoss: (quiz: BossQuizEvent) => void;
  onToggleQuizBoss: (quiz: BossQuizEvent) => void;
  onDeleteQuizBoss: (quiz: BossQuizEvent) => void;
  onEditBank: (bank: BossQuestionBank) => void;
  onDeleteBank: (bank: BossQuestionBank) => void;
  onCreateBank: () => void;
  onOpenEndgameView: (quiz: BossQuizEvent) => void;
}

const BossOpsTab: React.FC<BossOpsTabProps> = ({
  quizBosses,
  questionBanks,
  onEditQuizBoss,
  onToggleQuizBoss,
  onDeleteQuizBoss,
  onEditBank,
  onDeleteBank,
  onCreateBank,
  onOpenEndgameView,
}) => {
  const [subTab, setSubTab] = useState<'bosses' | 'banks'>('bosses');

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => setSubTab('bosses')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            subTab === 'bosses'
              ? 'bg-amber-600 text-white'
              : 'bg-white/5 text-gray-400 hover:bg-white/10'
          }`}
        >
          <Swords className="w-3 h-3 inline mr-1" /> Active Bosses ({quizBosses.length})
        </button>
        <button
          onClick={() => setSubTab('banks')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            subTab === 'banks'
              ? 'bg-purple-600 text-white'
              : 'bg-white/5 text-gray-400 hover:bg-white/10'
          }`}
        >
          <Database className="w-3 h-3 inline mr-1" /> Question Banks ({questionBanks.length})
        </button>
      </div>

      {/* Bosses Sub-tab */}
      {subTab === 'bosses' && (
        <>
          <p className="text-xs text-gray-500">
            Students deal damage by answering questions correctly. Deploy quiz bosses that require
            mastery of class material to defeat.
          </p>

          {quizBosses.length === 0 && (
            <div className="text-center py-14 text-gray-500">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-bold">No quiz bosses deployed.</p>
              <p className="text-sm mt-1">
                Deploy a quiz boss to challenge students with educational content.
              </p>
            </div>
          )}

          {quizBosses.map((quiz) => {
            const hpPercent =
              quiz.maxHp > 0
                ? Math.max(0, ((quiz.currentHp ?? quiz.maxHp) / quiz.maxHp) * 100)
                : 0;
            const isExpired = new Date(quiz.deadline) < new Date();
            const isDefeated = (quiz.currentHp ?? quiz.maxHp) <= 0 || !quiz.isActive;

            return (
              <div
                key={quiz.id}
                className={`p-5 rounded-2xl border flex flex-col md:flex-row md:items-center gap-4 transition-all mb-3 ${
                  quiz.isActive && !isExpired
                    ? 'bg-amber-600/10 border-amber-500/30'
                    : 'bg-black/20 border-white/10 opacity-60'
                }`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      quiz.isActive && !isExpired
                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40'
                        : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    <Brain className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-lg text-white truncate">{quiz.bossName}</h4>
                    <p className="text-sm text-gray-500 truncate">{quiz.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded border border-amber-500/20">
                        {quiz.questions.length} Questions
                      </span>
                      <span className="text-[10px] font-bold text-red-400 bg-red-900/30 px-2 py-0.5 rounded border border-red-500/20">
                        HP: {(quiz.currentHp ?? quiz.maxHp).toLocaleString()}/
                        {quiz.maxHp.toLocaleString()}
                      </span>
                      <span className="text-[10px] font-bold text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-500/20">
                        {quiz.damagePerCorrect} dmg/correct
                      </span>
                      <span className="text-[10px] font-bold text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-500/20">
                        {quiz.classType}
                      </span>
                      {quiz.modifiers?.length ? (
                        <span className="text-[10px] font-bold text-pink-400 bg-pink-900/30 px-2 py-0.5 rounded border border-pink-500/20">
                          {quiz.modifiers.length} Modifiers
                        </span>
                      ) : null}
                      {quiz.targetSections?.length ? (
                        <span className="text-[10px] font-bold text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-500/20">
                          {quiz.targetSections.join(', ')}
                        </span>
                      ) : null}
                      {isExpired && (
                        <span className="text-[10px] font-bold text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded border border-yellow-500/20">
                          EXPIRED
                        </span>
                      )}
                      {isDefeated && (
                        <span className="text-[10px] font-bold text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-500/20">
                          DEFEATED
                        </span>
                      )}
                    </div>
                    <div className="mt-2 w-full max-w-xs h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
                      <div
                        className={`h-full rounded-full transition-all ${
                          hpPercent > 50
                            ? 'bg-amber-500'
                            : hpPercent > 20
                              ? 'bg-orange-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${hpPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isDefeated && (
                    <button
                      onClick={() => onOpenEndgameView(quiz)}
                      className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wide"
                    >
                      <BarChart3 className="w-3 h-3 inline mr-1" />
                      Endgame
                    </button>
                  )}
                  <button
                    onClick={() => onEditQuizBoss(quiz)}
                    className="px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition border border-blue-500/20 text-[10px] font-bold uppercase tracking-wide"
                  >
                    <Pencil className="w-3 h-3 inline mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={() => onToggleQuizBoss(quiz)}
                    className={`w-12 h-6 rounded-full relative transition-colors duration-200 focus:outline-none ${
                      quiz.isActive ? 'bg-amber-600' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                        quiz.isActive ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => onDeleteQuizBoss(quiz)}
                    className="p-2 text-gray-600 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Question Banks Sub-tab */}
      {subTab === 'banks' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Reusable question banks that can be imported into any boss fight.
            </p>
            <button
              onClick={onCreateBank}
              className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition text-xs"
            >
              <Plus className="w-3 h-3" /> New Bank
            </button>
          </div>

          {questionBanks.length === 0 && (
            <div className="text-center py-14 text-gray-500">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-bold">No question banks yet.</p>
              <p className="text-sm mt-1">
                Create banks to reuse questions across multiple boss fights.
              </p>
            </div>
          )}

          {questionBanks.map((bank) => (
            <div
              key={bank.id}
              className="p-4 rounded-2xl border border-purple-500/20 bg-purple-600/5 flex items-center gap-4 mb-3"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center flex-shrink-0">
                <Database className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-white text-sm truncate">{bank.name}</h4>
                {bank.description && (
                  <p className="text-xs text-gray-500 truncate">{bank.description}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="text-[10px] font-bold text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-500/20">
                    {bank.questions.length} Questions
                  </span>
                  <span className="text-[10px] font-bold text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-500/20">
                    {bank.classType}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {new Date(bank.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => onEditBank(bank)}
                  className="px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition border border-blue-500/20 text-[10px] font-bold uppercase"
                >
                  <Pencil className="w-3 h-3 inline mr-1" />
                  Edit
                </button>
                <button
                  onClick={() => onDeleteBank(bank)}
                  className="p-2 text-gray-600 hover:text-red-400 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default BossOpsTab;
