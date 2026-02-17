import React, { useState } from 'react';
import { User } from '../../types';
import Modal from '../Modal';

interface AdjustXPModalProps {
    user: User | null;
    onClose: () => void;
    onAdjust: (user: User, amount: number) => void;
}

const QUICK_AMOUNTS = [+10, +50, +100, -10, -50, -100];

const AdjustXPModal: React.FC<AdjustXPModalProps> = ({ user, onClose, onAdjust }) => {
    const [adjustAmount, setAdjustAmount] = useState(50);

    if (!user) return null;

    const handleApply = () => {
        onAdjust(user, adjustAmount);
        setAdjustAmount(50);
    };

    return (
        <Modal isOpen={!!user} onClose={onClose} title="Manual XP Adjustment">
            <div className="space-y-6">
                <div className="flex items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/5">
                    <img src={user.avatarUrl} className="w-14 h-14 rounded-2xl border border-white/10" alt={user.name} />
                    <div>
                        <h3 className="font-bold text-white text-lg">{user.name}</h3>
                        <p className="text-xs text-gray-500">{user.email}</p>
                        <div className="text-[10px] font-black text-purple-400 mt-1 uppercase tracking-tighter">Current: {user.gamification?.xp || 0} XP</div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    {QUICK_AMOUNTS.map(val => (
                        <button 
                            key={val} 
                            onClick={() => setAdjustAmount(val)}
                            className={`py-3 rounded-xl font-black transition-all border ${
                                adjustAmount === val 
                                ? (val > 0 ? 'bg-green-600 border-green-500 text-white' : 'bg-red-600 border-red-500 text-white')
                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                            }`}
                        >
                            {val > 0 ? `+${val}` : val}
                        </button>
                    ))}
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">Precise Adjustment</label>
                    <input 
                        type="number" 
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-4 text-center text-2xl font-black text-white focus:outline-none focus:border-purple-500/50"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(parseInt(e.target.value) || 0)}
                    />
                </div>

                <div className="flex gap-3">
                    <button 
                        onClick={onClose}
                        className="flex-1 py-4 bg-white/5 border border-white/10 text-gray-400 font-bold rounded-2xl hover:bg-white/10 transition"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleApply}
                        className="flex-1 py-4 bg-purple-600 text-white font-bold rounded-2xl hover:bg-purple-500 transition shadow-xl shadow-purple-900/20"
                    >
                        Apply Protocol
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default AdjustXPModal;
