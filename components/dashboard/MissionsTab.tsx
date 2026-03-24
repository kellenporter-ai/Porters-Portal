
import React from 'react';
import { Quest } from '../../types';
import { Target, AlertTriangle, Crosshair, Users, Radio, Zap } from 'lucide-react';
import { useReducedMotion } from '../../lib/useReducedMotion';

interface ActiveQuestEntry {
  questId: string;
  status: 'ACCEPTED' | 'DEPLOYED' | 'COMPLETED' | 'FAILED';
  deploymentRoll?: number;
}

interface MissionsTabProps {
  newQuests: Quest[];
  myAcceptedQuests: Quest[];
  activeQuests: ActiveQuestEntry[];
  onAcceptQuest: (quest: Quest) => void;
  onDeployQuest: (quest: Quest) => void;
  questActionLoading?: string | null;
}

const MissionsTab: React.FC<MissionsTabProps> = ({ newQuests, myAcceptedQuests, activeQuests, onAcceptQuest, onDeployQuest, questActionLoading }) => {
  const reducedMotion = useReducedMotion();
  return (
    <div key="missions" className="space-y-6" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2">Available Contracts</h3>
      <div className="grid grid-cols-1 gap-4">
        {newQuests.length === 0 && (
          <div className="text-center py-12 px-6 bg-black/10 rounded-xl border border-dashed border-white/5">
            <Crosshair className="w-10 h-10 mx-auto mb-3 text-gray-600 opacity-30" />
            <p className="text-sm text-gray-500 mb-1">No contracts on the wire</p>
            <p className="text-xs text-gray-600">New missions deploy when your handler activates them.</p>
          </div>
        )}
        {newQuests.map(quest => (
          <div key={quest.id} className="bg-black/20 border border-indigo-500/30 p-5 rounded-2xl relative overflow-hidden group hover:border-indigo-500/60 transition">
            <div className="flex justify-between items-start mb-2">
              <h4 className="text-lg font-bold text-[var(--text-primary)]">{quest.title}</h4>
              <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">{quest.type.replace('_', ' ')}</span>
            </div>
            <p className="text-sm text-gray-400 mb-4 pr-16">{quest.description}</p>
            <div className="flex items-center gap-4 text-xs font-mono text-gray-500 mb-4">
              {quest.statRequirements && (
                <div className="flex gap-2">
                  {Object.entries(quest.statRequirements).map(([stat, val]) => (
                    <span key={stat} className="bg-white/5 px-2 py-1 rounded border border-white/10 uppercase">{val} {stat}</span>
                  ))}
                </div>
              )}
              {quest.expiresAt && (
                <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Expires: {new Date(quest.expiresAt).toLocaleDateString()}</span>
              )}
            </div>
            <button
              onClick={() => onAcceptQuest(quest)}
              disabled={questActionLoading === quest.id}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-900/20 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Crosshair className="w-4 h-4" /> {questActionLoading === quest.id ? 'Accepting...' : 'Accept Contract'}
            </button>
          </div>
        ))}
      </div>

      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2 pt-4 border-t border-white/10">Active Operations</h3>
      <div className="grid grid-cols-1 gap-4">
        {myAcceptedQuests.length === 0 && (
          <div className="text-center py-12 px-6 bg-black/10 rounded-xl border border-dashed border-white/5">
            <Radio className="w-10 h-10 mx-auto mb-3 text-gray-600 opacity-30" />
            <p className="text-sm text-gray-500 mb-1">No active ops</p>
            <p className="text-xs text-gray-600">Accept a contract above to begin your mission.</p>
          </div>
        )}
        {myAcceptedQuests.map(quest => {
          const status = activeQuests.find(q => q.questId === quest.id)?.status || 'ACCEPTED';
          const myRoll = activeQuests.find(q => q.questId === quest.id)?.deploymentRoll;
          const isManual = quest.type === 'CUSTOM';

          return (
            <div key={quest.id} className="bg-[var(--panel-bg)] border border-purple-500/30 p-6 rounded-3xl relative group hover:border-purple-500/60 transition-all shadow-[0_0_30px_rgba(168,85,247,0.1)]">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center border border-purple-500/20 shadow-inner">
                    <Target className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-[var(--text-primary)] font-bold text-lg leading-tight">{quest.title}</h4>
                    <div className="text-[10px] text-gray-500 uppercase font-black tracking-[0.1em]">{quest.type} MISSION</div>
                  </div>
                </div>
                <span className={`text-[10px] font-black tracking-widest px-3 py-1 rounded-full border ${
                  status === 'COMPLETED' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                  status === 'FAILED' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                  status === 'DEPLOYED' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-white/5 text-gray-400 border-white/10'
                }`}>
                  {status}
                </span>
              </div>

              {status === 'ACCEPTED' ? (
                <>
                  <p className="text-sm text-gray-400 mb-6 leading-relaxed bg-black/20 p-4 rounded-2xl border border-white/5">{quest.description}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => onDeployQuest(quest)}
                      disabled={questActionLoading === quest.id}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-3 group/btn disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Radio className="w-5 h-5 group-hover/btn:animate-pulse" />
                      {questActionLoading === quest.id ? "Deploying..." : isManual ? "Broadcast Submission to HQ" : "Deploy for Skill Check"}
                    </button>
                    {quest.isGroupQuest && (
                      <button className="bg-white/5 hover:bg-white/10 text-white px-6 py-4 rounded-2xl text-sm font-black transition border border-white/10">
                        <Users className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </>
              ) : status === 'DEPLOYED' ? (
                <div className="bg-black/40 p-6 rounded-3xl border border-purple-500/20 flex flex-col gap-4 animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className={`w-3 h-3 bg-green-500 rounded-full ${reducedMotion ? '' : 'animate-ping'} absolute -top-1 -right-1`}></div>
                        <div className="w-3 h-3 bg-green-500 rounded-full absolute -top-1 -right-1 shadow-[0_0_10px_#22c55e]"></div>
                        <Zap className="w-6 h-6 text-purple-400" />
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Uplink Status</div>
                        <div className="text-sm font-black text-white font-mono uppercase tracking-tighter">
                          {isManual ? "AWAITING_HQ_SIG_VERIFICATION" : (myRoll === 100 ? "SUCCESS_VERIFIED" : "FAILURE_DETECTED")}
                        </div>
                      </div>
                    </div>
                    <div className="h-10 w-px bg-black/10 dark:bg-white/5"></div>
                    <div className="text-right">
                      <div className="text-[9px] text-gray-500 uppercase font-bold">Node</div>
                      <div className="text-xs font-bold text-purple-700 dark:text-purple-300">HQ_CENTRAL</div>
                    </div>
                  </div>

                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full bg-indigo-500 ${reducedMotion ? '' : 'animate-pulse'} w-3/4`}></div>
                  </div>

                  <p className="text-[11px] text-gray-500 italic text-center font-mono">
                    {isManual
                      ? "Encrypted transmission confirmed. HQ is currently reviewing your evidence data. Rewards will be issued upon manual signal confirmation."
                      : "Autonomous verification complete. Skill check results logged below."}
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MissionsTab;
