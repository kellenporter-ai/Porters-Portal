import React from 'react';
import { Quest } from '../../types';
import { Target, X, Check, Dice5 } from 'lucide-react';

interface Deployment {
    user: { id: string; name: string; avatarUrl: string; classType?: string };
    quest: Quest;
    status: string;
    roll: number;
    acceptedAt?: string;
}

interface MissionControlTabProps {
    deployments: Deployment[];
    onResolveQuest: (userId: string, quest: Quest, success: boolean, classType?: string) => void;
    onRollForSalvation: (deployment: Deployment) => void;
}

const MissionControlTab: React.FC<MissionControlTabProps> = ({ deployments, onResolveQuest, onRollForSalvation }) => {
    return (
        <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 px-2">Active Field Deployments</h3>
            {deployments.length === 0 && (
                <div className="text-gray-500 italic text-center py-20 bg-black/20 rounded-3xl border border-white/5">
                    No active agents in the field.
                </div>
            )}
            {deployments.map((deployment, i) => {
                const isManual = deployment.quest.type === 'CUSTOM';
                
                return (
                    <div key={i} className="bg-black/30 border border-white/10 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-center gap-6 group hover:border-purple-500/30 transition-all">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className="relative">
                                <img src={deployment.user.avatarUrl} className="w-12 h-12 rounded-xl border border-white/10 shadow-lg" alt={deployment.user.name} />
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-black rounded-full shadow-lg"></div>
                            </div>
                            <div className="min-w-0">
                                <div className="font-bold text-white text-base truncate">{deployment.user.name}</div>
                                <div className="text-[10px] text-purple-400 font-black uppercase tracking-tighter flex items-center gap-1.5">
                                    <Target className="w-3 h-3" />
                                    {deployment.quest.title}
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap items-center justify-center md:justify-end gap-6 w-full md:w-auto">
                            <div className="text-center md:text-right">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Status</div>
                                <div className={`text-xs font-black px-2 py-0.5 rounded border ${
                                    deployment.status === 'DEPLOYED' 
                                        ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' 
                                        : 'text-gray-300 bg-white/5 border-white/10'
                                }`}>
                                    {deployment.status}
                                </div>
                            </div>
                            
                            {deployment.status === 'DEPLOYED' && (
                                <>
                                    <div className="text-center px-4 border-l border-white/5">
                                        <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                                            {isManual ? "Manual Review" : "Auto-Check"}
                                        </div>
                                        <div className={`font-black text-sm tracking-tighter ${deployment.roll === 100 ? 'text-green-400' : 'text-orange-400'}`}>
                                            {isManual ? "PENDING_HQ_SIG" : (deployment.roll === 100 ? 'SUCCESS_VERIFIED' : 'FAILURE_DETECTED')}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {!isManual && deployment.roll === 0 && (
                                            <button 
                                                onClick={() => onRollForSalvation(deployment)}
                                                className="p-2.5 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-xl hover:bg-purple-600 hover:text-white transition shadow-lg shadow-purple-900/20 group/btn"
                                                title="Initiate Salvation Protocol (Die Roll)"
                                            >
                                                <Dice5 className="w-5 h-5 group-hover/btn:rotate-12 transition-transform" />
                                            </button>
                                        )}

                                        <div className="h-8 w-px bg-white/5 mx-2"></div>

                                        <button 
                                            onClick={() => onResolveQuest(deployment.user.id, deployment.quest, true, deployment.user.classType)} 
                                            className="p-2.5 bg-green-600/20 text-green-400 border border-green-500/30 rounded-xl hover:bg-green-600 hover:text-white transition shadow-lg shadow-green-900/20"
                                            title="Approve Submission"
                                        >
                                            <Check className="w-5 h-5" />
                                        </button>
                                        <button 
                                            onClick={() => onResolveQuest(deployment.user.id, deployment.quest, false, deployment.user.classType)} 
                                            className="p-2.5 bg-red-600/20 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-600 hover:text-white transition shadow-lg shadow-red-900/20"
                                            title="Reject Submission"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default MissionControlTab;
