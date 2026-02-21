
import React, { useState, useEffect } from 'react';
import { EnrollmentCode, DefaultClassTypes } from '../types';
import { KeyRound, Plus, Copy, X, Check, Ban } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';

interface EnrollmentCodesProps {
  availableSections: string[];
}

const EnrollmentCodes: React.FC<EnrollmentCodesProps> = ({ availableSections }) => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [codes, setCodes] = useState<EnrollmentCode[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newClass, setNewClass] = useState(DefaultClassTypes.AP_PHYSICS);
  const [newSection, setNewSection] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = dataService.subscribeToEnrollmentCodes(setCodes);
    return () => unsub();
  }, []);

  const handleCreate = async () => {
    const code = await dataService.createEnrollmentCode(newClass, newSection || undefined, newMaxUses ? parseInt(newMaxUses) : undefined);
    toast.success(`Code created: ${code}`);
    setShowCreate(false);
    setNewSection('');
    setNewMaxUses('');
  };

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeactivate = async (codeId: string) => {
    if (!await confirm({ message: 'Deactivate this enrollment code?', confirmLabel: 'Deactivate' })) return;
    await dataService.deactivateEnrollmentCode(codeId);
  };

  const classOptions = Object.values(DefaultClassTypes).filter(c => c !== 'Uncategorized');
  const activeCodes = codes.filter(c => c.isActive);
  const inactiveCodes = codes.filter(c => !c.isActive);

  return (
    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-emerald-400" />
          Enrollment Codes
        </h3>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition">
          <Plus className="w-3.5 h-3.5" /> Generate Code
        </button>
      </div>

      {showCreate && (
        <div className="mb-5 p-4 bg-black/20 border border-white/10 rounded-xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex gap-3">
            <select value={newClass} onChange={e => setNewClass(e.target.value)} className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
              {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={newSection} onChange={e => setNewSection(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">No Section</option>
              {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-3 items-center">
            <input type="number" min="1" placeholder="Max uses (unlimited if empty)" value={newMaxUses} onChange={e => setNewMaxUses(e.target.value)} className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50" />
            <button onClick={handleCreate} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition">Create</button>
            <button onClick={() => setShowCreate(false)} className="p-2 text-gray-400 hover:text-white transition"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {activeCodes.length === 0 && !showCreate ? (
        <div className="text-center py-6 text-gray-500 italic">
          <KeyRound className="w-10 h-10 mx-auto mb-2 opacity-20" />
          No active enrollment codes. Generate one to let students self-enroll.
        </div>
      ) : (
        <div className="space-y-2">
          {activeCodes.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 bg-black/20 border border-white/10 rounded-xl group hover:border-emerald-500/20 transition">
              <div className="flex items-center gap-4">
                <code className="text-lg font-mono font-bold text-emerald-400 tracking-widest">{c.code}</code>
                <span className="text-xs text-gray-500">{c.classType}</span>
                {c.section && <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">{c.section}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-gray-500">
                  {c.usedCount} used{c.maxUses ? ` / ${c.maxUses}` : ''}
                </span>
                <button onClick={() => handleCopy(c.code, c.id)} className="p-1.5 text-gray-500 hover:text-white transition" title="Copy code">
                  {copiedId === c.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => handleDeactivate(c.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition" title="Deactivate">
                  <Ban className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {inactiveCodes.length > 0 && (
        <details className="mt-4">
          <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-300 uppercase tracking-widest font-bold">
            {inactiveCodes.length} expired code{inactiveCodes.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-1">
            {inactiveCodes.map(c => (
              <div key={c.id} className="flex items-center justify-between p-2 bg-black/10 border border-white/5 rounded-lg opacity-50">
                <code className="text-sm font-mono text-gray-500">{c.code}</code>
                <span className="text-[10px] text-gray-600">{c.classType} | {c.usedCount} used</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default EnrollmentCodes;
