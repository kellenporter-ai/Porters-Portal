
import React, { useState, useEffect, useMemo } from 'react';
import { User, StudentGroup, DefaultClassTypes } from '../types';
import { Users, Plus, Trash2, X, UserPlus, UserMinus } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';

interface GroupManagerProps {
  students: User[];
  availableSections: string[];
}

const GroupManager: React.FC<GroupManagerProps> = ({ students, availableSections }) => {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>(DefaultClassTypes.AP_PHYSICS);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState('');

  useEffect(() => {
    const unsub = dataService.subscribeToStudentGroups(selectedClass, setGroups);
    return () => unsub();
  }, [selectedClass]);

  const classStudents = useMemo(() => {
    return students
      .filter(s => s.role === 'STUDENT' && s.enrolledClasses?.includes(selectedClass))
      .filter(s => !sectionFilter || s.section === sectionFilter);
  }, [students, selectedClass, sectionFilter]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await dataService.createStudentGroup(newName.trim(), selectedClass, []);
      setNewName('');
      setShowCreate(false);
      toast.success('Group created.');
    } catch { toast.error('Failed to create group.'); }
  };

  const handleDelete = async (groupId: string) => {
    if (!await confirm({ message: 'Delete this group? Members will lose access to the group chat.', confirmLabel: 'Delete', variant: 'danger' })) return;
    await dataService.deleteStudentGroup(groupId);
  };

  const handleAddMember = async (group: StudentGroup, student: User) => {
    if (group.members.some(m => m.userId === student.id)) return;
    const updated = [...group.members, { userId: student.id, userName: student.name }];
    await dataService.updateStudentGroup(group.id, { members: updated });
  };

  const handleRemoveMember = async (group: StudentGroup, userId: string) => {
    const updated = group.members.filter(m => m.userId !== userId);
    await dataService.updateStudentGroup(group.id, { members: updated });
  };

  const classOptions = Object.values(DefaultClassTypes).filter(c => c !== 'Uncategorized');

  return (
    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-cyan-400" />
          Student Groups
        </h3>
        <div className="flex items-center gap-2">
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
            {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition">
            <Plus className="w-3.5 h-3.5" /> New Group
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-black/20 border border-white/10 rounded-xl">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Group name..." maxLength={40} className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          <button onClick={handleCreate} disabled={!newName.trim()} className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition">Create</button>
          <button onClick={() => setShowCreate(false)} className="p-2 text-gray-400 hover:text-white transition"><X className="w-4 h-4" /></button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-6 text-gray-500 italic">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
          No groups for {selectedClass}.
        </div>
      ) : (
        <div className="space-y-4 max-h-80 overflow-y-auto custom-scrollbar pr-1">
          {groups.map(group => (
            <div key={group.id} className="p-4 bg-black/20 border border-white/10 rounded-xl">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <span className="font-bold text-white text-sm">{group.name}</span>
                  <span className="text-[10px] text-gray-500 ml-2">{group.members.length} member{group.members.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditingGroup(editingGroup === group.id ? null : group.id)} className={`px-2 py-1 text-[10px] font-bold rounded-lg transition ${editingGroup === group.id ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(group.id)} className="p-1 text-gray-500 hover:text-red-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {/* Member list */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {group.members.map(m => (
                  <span key={m.userId} className="inline-flex items-center gap-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-[11px] text-gray-300">
                    {m.userName}
                    <button onClick={() => handleRemoveMember(group, m.userId)} className="text-gray-500 hover:text-red-400 transition"><UserMinus className="w-3 h-3" /></button>
                  </span>
                ))}
                {group.members.length === 0 && <span className="text-[10px] text-gray-600 italic">No members yet — click the add button to assign students.</span>}
              </div>

              {/* Add member picker */}
              {editingGroup === group.id && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Add Students</span>
                    {availableSections.length > 0 && (
                      <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)} className="bg-black/30 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white">
                        <option value="">All Sections</option>
                        {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                    {classStudents
                      .filter(s => !group.members.some(m => m.userId === s.id))
                      .map(s => (
                        <button key={s.id} onClick={() => handleAddMember(group, s)} className="px-2 py-1 bg-cyan-600/10 border border-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-[11px] text-cyan-300 font-medium transition">
                          + {s.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GroupManager;
