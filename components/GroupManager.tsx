
import React, { useState, useEffect, useMemo } from 'react';
import { User, StudentGroup, DefaultClassTypes } from '../types';
import { Users, Plus, Trash2, X, UserPlus, UserMinus, Search } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';

interface GroupManagerProps {
  students: User[];
  availableSections: string[];
  fullPage?: boolean;
}

const GroupManager: React.FC<GroupManagerProps> = ({ students, availableSections, fullPage }) => {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [groupsByClass, setGroupsByClass] = useState<Record<string, StudentGroup[]>>({});
  const [selectedClass, setSelectedClass] = useState<string>(DefaultClassTypes.AP_PHYSICS);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  const classOptions = useMemo(() => Object.values(DefaultClassTypes).filter(c => c !== 'Uncategorized'), []);

  // Subscribe to groups for selected class
  useEffect(() => {
    const unsub = dataService.subscribeToStudentGroups(selectedClass, (groups) => {
      setGroupsByClass(prev => ({ ...prev, [selectedClass]: groups }));
    });
    return () => unsub();
  }, [selectedClass]);

  const groups = groupsByClass[selectedClass] || [];

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

  // Group counts per class (summary)
  const classCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cls of classOptions) {
      counts[cls] = groupsByClass[cls]?.length || 0;
    }
    return counts;
  }, [classOptions, groupsByClass]);

  if (!fullPage) {
    // Compact embedded version (kept for backward compat but currently unused)
    return (
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
        <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-cyan-400" /> Student Groups
        </h3>
        <p className="text-gray-500 text-sm">Groups have moved to the sidebar for a better experience.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Student Groups</h1>
          <p className="text-gray-400">Create and manage student groups across all classes.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-cyan-900/20"
        >
          <Plus className="w-4 h-4" /> New Group
        </button>
      </div>

      {/* Class Tabs */}
      <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
        {classOptions.map(cls => (
          <button
            key={cls}
            onClick={() => setSelectedClass(cls)}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all border ${
              selectedClass === cls
                ? 'bg-purple-600/80 text-white border-purple-500/50 shadow-lg'
                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
            }`}
          >
            {cls}
            {classCounts[cls] > 0 && (
              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${selectedClass === cls ? 'bg-white/20' : 'bg-white/10'}`}>
                {classCounts[cls]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Create Group Form */}
      {showCreate && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <h3 className="text-sm font-bold text-white mb-3">Create Group for {selectedClass}</h3>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Group name..."
              maxLength={40}
              className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-5 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition"
            >
              Create
            </button>
            <button onClick={() => { setShowCreate(false); setNewName(''); }} className="p-3 text-gray-400 hover:text-white transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Groups Grid */}
      {groups.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-12 backdrop-blur-md text-center">
          <Users className="w-14 h-14 mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-bold text-gray-400 mb-2">No groups for {selectedClass}</h3>
          <p className="text-sm text-gray-500">Create a group to get started with collaborative assignments and group chat.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {groups.map(group => (
            <div key={group.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md hover:border-white/20 transition-all">
              {/* Group Header */}
              <div className="p-5 border-b border-white/5">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-white text-lg">{group.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {group.members.length} member{group.members.length !== 1 ? 's' : ''}
                      <span className="mx-2 text-gray-700">|</span>
                      {selectedClass}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingGroup(editingGroup === group.id ? null : group.id)}
                      className={`p-2 rounded-lg transition ${editingGroup === group.id ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                      title="Add members"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(group.id)}
                      className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                      title="Delete group"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Members */}
              <div className="p-5">
                <div className="flex flex-wrap gap-2">
                  {group.members.map(m => (
                    <span key={m.userId} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-300 hover:bg-white/10 transition group/member">
                      <span className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[9px] font-bold text-purple-400">
                        {m.userName.charAt(0)}
                      </span>
                      {m.userName}
                      <button onClick={() => handleRemoveMember(group, m.userId)} className="text-gray-600 hover:text-red-400 transition opacity-0 group-hover/member:opacity-100">
                        <UserMinus className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {group.members.length === 0 && (
                    <p className="text-xs text-gray-600 italic py-2">
                      No members yet — click the <UserPlus className="w-3 h-3 inline" /> button to assign students.
                    </p>
                  )}
                </div>

                {/* Add Member Panel */}
                {editingGroup === group.id && (
                  <div className="mt-4 pt-4 border-t border-white/10 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                        <input
                          type="text"
                          placeholder="Search students..."
                          value={memberSearch}
                          onChange={e => setMemberSearch(e.target.value)}
                          className="w-full bg-black/30 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
                        />
                      </div>
                      {availableSections.length > 0 && (
                        <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white">
                          <option value="">All Sections</option>
                          {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                      {classStudents
                        .filter(s => !group.members.some(m => m.userId === s.id))
                        .filter(s => !memberSearch || s.name.toLowerCase().includes(memberSearch.toLowerCase()))
                        .map(s => (
                          <button key={s.id} onClick={() => handleAddMember(group, s)} className="px-3 py-1.5 bg-cyan-600/10 border border-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-xs text-cyan-300 font-medium transition">
                            + {s.name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GroupManager;
