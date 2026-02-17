
import React, { useState } from 'react';
import { Announcement, DefaultClassTypes } from '../types';
import { Megaphone, Plus, Trash2, AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import Modal from './Modal';

interface AnnouncementManagerProps {
  announcements: Announcement[];
  studentIds: string[];
}

const PRIORITY_STYLES = {
  INFO: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', icon: <Info className="w-4 h-4" /> },
  WARNING: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: <AlertTriangle className="w-4 h-4" /> },
  URGENT: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: <AlertOctagon className="w-4 h-4" /> },
};

const AnnouncementManager: React.FC<AnnouncementManagerProps> = ({ announcements, studentIds }) => {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'INFO' | 'WARNING' | 'URGENT'>('INFO');
  const [classType, setClassType] = useState<string>('GLOBAL');

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
        createdBy: 'ADMIN'
      });
      // Notify students
      await dataService.notifyUsers(studentIds, 'ANNOUNCEMENT', title.trim(), content.trim().slice(0, 100));
      setTitle('');
      setContent('');
      setIsModalOpen(false);
      toast.success('Announcement broadcast sent.');
    } catch (err) {
      toast.error('Failed to create announcement.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ message: 'Delete this announcement?', confirmLabel: 'Delete' })) return;
    await dataService.deleteAnnouncement(id);
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
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
        <div className="text-center py-6 text-gray-500 italic">
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
                    <div className="text-sm font-bold text-white">{a.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{a.content}</div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {a.classType === 'GLOBAL' ? 'All Classes' : a.classType} · {new Date(a.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <button onClick={() => handleDelete(a.id)} className="p-1 text-gray-500 hover:text-red-400 transition shrink-0">
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
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Quiz moved to Friday..."
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition"
              maxLength={80}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Message</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Details..."
              rows={3}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition resize-none"
              maxLength={300}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as any)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white">
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Audience</label>
              <select value={classType} onChange={(e) => setClassType(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white">
                <option value="GLOBAL">All Classes</option>
                {Object.values(DefaultClassTypes).filter(c => c !== 'Uncategorized').map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
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
