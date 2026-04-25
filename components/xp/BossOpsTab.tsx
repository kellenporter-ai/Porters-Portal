import React, { useState } from 'react';
import { BossEvent, BossQuestionBank, DIFFICULTY_TIER_DEFS } from '../../types';
import { Brain, Trash2, Pencil, Plus, Swords, Database, BarChart3, Copy } from 'lucide-react';

interface BossOpsTabProps {
  quizBosses: BossEvent[];
  questionBanks: BossQuestionBank[];
  onEditQuizBoss: (quiz: BossEvent) => void;
  onCloneQuizBoss: (quiz: BossEvent) => void;
  onToggleQuizBoss: (quiz: BossEvent) => void;
  onDeleteQuizBoss: (quiz: BossEvent) => void;
  onEditBank: (bank: BossQuestionBank) => void;
  onDeleteBank: (bank: BossQuestionBank) => void;
  onCreateBank: () => void;
  onOpenEndgameView: (quiz: BossEvent) => void;
}

const BossOpsTab: React.FC<BossOpsTabProps> = ({
  quizBosses,
  questionBanks,
  onEditQuizBoss,
  onCloneQuizBoss,
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
              ? 'bg-purple-600 text-white'
              : 'bg-[var(--surface-glass)] text-[var(--text-tertiary)] hover:bg-[var(--surface-glass-heavy)]'
          }`}
        >
          <Swords className="w-3 h-3 inline mr-1" /> Active Bosses ({quizBosses.length})
        </button>
        <button
          onClick={() => setSubTab('banks')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            subTab === 'banks'
              ? 'bg-purple-600 text-white'
              : 'bg-[var(--surface-glass)] text-[var(--text-tertiary)] hover:bg-[var(--surface-glass-heavy)]'
          }`}
        >
          <Database className="w-3 h-3 inline mr-1" /> Question Banks ({questionBanks.length})
        </button>
      </div>

      {/* Bosses Sub-tab */}
      {subTab === 'bosses' && (
        <>
          <p className="text-xs text-[var(--text-muted)]">
            Students deal damage by answering questions correctly. Deploy quiz bosses that require
            mastery of class material to defeat.
          </p>

          {quizBosses.length === 0 && (
            <div className="text-center py-14 text-[var(--text-muted)]">
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
                    : 'bg-[var(--panel-bg)] border-[var(--border)] opacity-60'
                }`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      quiz.isActive && !isExpired
                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40'
                        : 'bg-[var(--surface-raised)] text-[var(--text-tertiary)]'
                    }`}
                  >
                    <Brain className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-lg text-[var(--text-primary)] truncate">{quiz.bossName}</h4>
                    <p className="text-sm text-[var(--text-muted)] truncate">{quiz.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-[11.5px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-900/30 px-2 py-0.5 rounded border border-amber-500/20">
                        {(quiz.questions || []).length} Questions
                      </span>
                      <span className="text-[11.5px] font-bold text-red-700 dark:text-red-400 bg-red-500/10 dark:bg-red-900/30 px-2 py-0.5 rounded border border-red-500/20">
                        HP: {(quiz.currentHp ?? (quiz.scaledMaxHp ?? quiz.maxHp)).toLocaleString()}/{(quiz.scaledMaxHp ?? quiz.maxHp).toLocaleString()}{quiz.scaledMaxHp && quiz.scaledMaxHp !== quiz.maxHp ? ` (base: ${quiz.maxHp.toLocaleString()})` : ''}
                      </span>
                      <span className="text-[11.5px] font-bold text-green-700 dark:text-green-400 bg-green-500/10 dark:bg-green-900/30 px-2 py-0.5 rounded border border-green-500/20">
                        {quiz.damagePerCorrect} dmg/correct
                      </span>
                      <span className="text-[11.5px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-500/20">
                        {quiz.classType}
                      </span>
                      {quiz.modifiers?.length ? (
                        <span className="text-[11.5px] font-bold text-pink-600 dark:text-pink-400 bg-pink-900/30 px-2 py-0.5 rounded border border-pink-500/20">
                          {quiz.modifiers.length} Modifiers
                        </span>
                      ) : null}
                      {quiz.difficultyTier && quiz.difficultyTier !== 'NORMAL' && (
                        <span className={`text-[11.5px] font-bold px-2 py-0.5 rounded border ${
                          quiz.difficultyTier === 'HARD' ? 'text-amber-600 dark:text-amber-400 bg-amber-900/30 border-amber-500/20' :
                          quiz.difficultyTier === 'NIGHTMARE' ? 'text-red-600 dark:text-red-400 bg-red-900/30 border-red-500/20' :
                          'text-purple-600 dark:text-purple-400 bg-purple-900/30 border-purple-500/20'
                        }`}>
                          {DIFFICULTY_TIER_DEFS[quiz.difficultyTier].name}
                        </span>
                      )}
                      {quiz.autoScale?.enabled && (
                        <span className="text-[11.5px] font-bold text-orange-600 dark:text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded border border-orange-500/20">
                          Auto-Scale
                        </span>
                      )}
                      {quiz.phases && quiz.phases.length > 0 && (
                        <span className="text-[11.5px] font-bold text-orange-600 dark:text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded border border-orange-500/20">
                          {quiz.phases.length} Phases
                        </span>
                      )}
                      {quiz.bossAbilities && quiz.bossAbilities.length > 0 && (
                        <span className="text-[11.5px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-500/20">
                          {quiz.bossAbilities.length} Abilities
                        </span>
                      )}
                      {quiz.lootTable && quiz.lootTable.length > 0 && (
                        <span className="text-[11.5px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-500/20">
                          {quiz.lootTable.length} Loot Items
                        </span>
                      )}
                      {quiz.targetSections?.length ? (
                        <span className="text-[11.5px] font-bold text-purple-600 dark:text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-500/20">
                          {quiz.targetSections.join(', ')}
                        </span>
                      ) : null}
                      {isExpired && (
                        <span className="text-[11.5px] font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded border border-yellow-500/20">
                          EXPIRED
                        </span>
                      )}
                      {isDefeated && (
                        <span className="text-[11.5px] font-bold text-green-600 dark:text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-500/20">
                          DEFEATED
                        </span>
                      )}
                    </div>
                    <div className="mt-2 w-full max-w-xs h-2 bg-[var(--panel-bg)] rounded-full overflow-hidden border border-[var(--border)]">
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
                      className="px-3 py-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition border border-emerald-500/20 text-[11.5px] font-bold uppercase tracking-wide"
                    >
                      <BarChart3 className="w-3 h-3 inline mr-1" />
                      Endgame
                    </button>
                  )}
                  <button
                    onClick={() => onEditQuizBoss(quiz)}
                    className="px-3 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-500/20 transition border border-blue-500/20 text-[11.5px] font-bold uppercase tracking-wide"
                  >
                    <Pencil className="w-3 h-3 inline mr-1" />
                    Edit
                  </button>
                  <button
                    aria-label="Clone boss"
                    onClick={() => {
                      const deadline = new Date();
                      deadline.setDate(deadline.getDate() + 7);
                      const cloned: BossEvent = {
                        ...JSON.parse(JSON.stringify(quiz)),
                        id: '',
                        bossName: `Copy of ${quiz.bossName}`,
                        isActive: false,
                        currentHp: quiz.maxHp,
                        targetSections: [],
                        deadline: deadline.toISOString().slice(0, 16),
                        totalQuestionsAnswered: 0,
                        activeAbilities: [],
                        currentPhase: 0,
                        triggeredAbilityIds: [],
                        scaledMaxHp: undefined,
                      };
                      onCloneQuizBoss(cloned);
                    }}
                    className="px-3 py-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-500/20 transition border border-purple-500/20 text-[11.5px] font-bold uppercase tracking-wide"
                  >
                    <Copy className="w-3 h-3 inline mr-1" />
                    Clone
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
                    className="p-2 text-[var(--text-muted)] hover:text-red-400 transition"
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
            <p className="text-xs text-[var(--text-muted)]">
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
            <div className="text-center py-14 text-[var(--text-muted)]">
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
                <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-[var(--text-primary)] text-sm truncate">{bank.name}</h4>
                {bank.description && (
                  <p className="text-xs text-[var(--text-muted)] truncate">{bank.description}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="text-[11.5px] font-bold text-purple-600 dark:text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-500/20">
                    {bank.questions.length} Questions
                  </span>
                  <span className="text-[11.5px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-500/20">
                    {bank.classType}
                  </span>
                  <span className="text-[11.5px] text-[var(--text-muted)]">
                    {new Date(bank.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => onEditBank(bank)}
                  className="px-3 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-500/20 transition border border-blue-500/20 text-[11.5px] font-bold uppercase"
                >
                  <Pencil className="w-3 h-3 inline mr-1" />
                  Edit
                </button>
                <button
                  onClick={() => onDeleteBank(bank)}
                  className="p-2 text-[var(--text-muted)] hover:text-red-400 transition"
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
