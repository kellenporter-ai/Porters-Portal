
import React, { useState } from 'react';
import { Announcement, DefaultClassTypes } from '../types';
import { Megaphone, Plus, Trash2, AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import Modal from './Modal';
import SectionPicker from './SectionPicker';

interface AnnouncementManagerProps {
  announcements: Announcement[];
  studentIds: string[];
  availableSections?: string[];
}

const PRIORITY_STYLES = {
  INFO: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', icon: <Info className="w-4 h-4" /> },
  WARNING: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: <AlertTriangle className="w-4 h-4" /> },
  URGENT: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: <AlertOctagon className="w-4 h-4" /> },
};

const AnnouncementManager: React.FC<AnnouncementManagerProps> = ({ announcements, studentIds, availableSections = [] }) => {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'INFO' | 'WARNING' | 'URGENT'>('INFO');
  const [classType, setClassType] = useState<string>('GLOBAL');
  const [targetSections, setTargetSections] = useState<string[]>([]);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return;
    try {
      await dataService.createAnnouncement({
        title: title.trim(),
        content: content.trim(),
        classType,
        priority,
        createdAt: new Date().toISOString(),
        expiresAt: null,
        createdBy: 'ADMIN',
        ...(targetSections.length > 0 ? { targetSections } : {}),
      });
      // Notify students
      await dataService.notifyUsers(studentIds, 'ANNOUNCEMENT', title.trim(), content.trim());
      setTitle('');
      setContent('');
      setTargetSections([]);
      setIsModalOpen(false);
      toast.success('Announcement broadcast sent.');
    } catch (err) {
      toast.error('Could not create announcement. Try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ message: 'Delete this announcement?', confirmLabel: 'Delete' })) return;
    await dataService.deleteAnnouncement(id);
  };

  return (
    <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl p-6 backdrop-blur-md">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-orange-400" />
          Announcements
        </h3>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition"
        >
          <Plus className="w-3.5 h-3.5" /> Broadcast
        </button>
      </div>

      {announcements.length === 0 ? (
        <div className="text-center py-6 text-[var(--text-muted)] italic">
          <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-20" />
          No active announcements.
        </div>
      ) : (
        <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar pr-1">
          {announcements.map(a => {
            const style = PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.INFO;
            return (
              <div key={a.id} className={`p-3 ${style.bg} border ${style.border} rounded-xl flex justify-between items-start`}>
                <div className="flex gap-2 items-start">
                  <div className={`mt-0.5 ${style.text}`}>{style.icon}</div>
                  <div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">{a.title}</div>
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{a.content}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-1">
                      {a.classType === 'GLOBAL' ? 'All Classes' : a.classType}{a.targetSections?.length ? ` · ${a.targetSections.join(', ')}` : ''}{a.targetStudentIds?.length ? ` · ${a.targetStudentIds.length} student${a.targetStudentIds.length !== 1 ? 's' : ''}` : ''} · {new Date(a.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <button onClick={() => handleDelete(a.id)} className="p-1 text-[var(--text-muted)] hover:text-red-400 transition shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New Announcement" maxWidth="max-w-md">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Quiz moved to Friday..."
              className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-purple-500 transition"
              maxLength={80}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1">Message</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Details..."
              rows={3}
              className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-purple-500 transition resize-none"
              maxLength={300}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Announcement['priority'])} className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)]">
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1">Audience</label>
              <select value={classType} onChange={(e) => setClassType(e.target.value)} className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)]">
                <option value="GLOBAL">All Classes</option>
                {Object.values(DefaultClassTypes).filter(c => c !== 'Uncategorized').map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <SectionPicker availableSections={availableSections} selectedSections={targetSections} onChange={setTargetSections} />
          <button
            onClick={handleCreate}
            disabled={!title.trim() || !content.trim()}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-2xl font-bold transition"
          >
            Broadcast Announcement
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default AnnouncementManager;
