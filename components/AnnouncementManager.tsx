
import React, { useState } from 'react';
import { Announcement, DefaultClassTypes } from '../types';
import { Megaphone, Plus, Trash2, AlertTriangle, Info, AlertOctagon, ChevronUp } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
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
  const [isComposerOpen, setIsComposerOpen] = useState(false);
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
      setIsComposerOpen(false);
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
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-orange-400" />
          Announcements
        </h3>
        <button
          onClick={() => setIsComposerOpen(prev => !prev)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition"
        >
          {isComposerOpen
            ? <><ChevronUp className="w-3.5 h-3.5" /> Close</>
            : <><Plus className="w-3.5 h-3.5" /> Broadcast</>
          }
        </button>
      </div>

      {/* Composer — shown at top when open */}
      {isComposerOpen && (
        <div role="region" aria-label="Broadcast announcement composer" className="mb-4 p-4 bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl space-y-3 transition-all duration-200 animate-in fade-in slide-in-from-top-2">
          {/* Row 1: Title + Priority + Audience */}
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <label className="text-[11.5px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Quiz moved to Friday..."
                className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-purple-500 transition"
                maxLength={80}
              />
            </div>
            <div className="w-32 shrink-0">
              <label className="text-[11.5px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Announcement['priority'])} className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)]">
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div className="w-36 shrink-0">
              <label className="text-[11.5px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1">Audience</label>
              <select value={classType} onChange={(e) => setClassType(e.target.value)} className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)]">
                <option value="GLOBAL">All Classes</option>
                {Object.values(DefaultClassTypes).filter(c => c !== 'Uncategorized').map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          {/* Row 2: Message */}
          <div>
            <label className="text-[11.5px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1">Message</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Details..."
              rows={3}
              className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-purple-500 transition resize-none"
              maxLength={300}
            />
          </div>
          {/* Row 3: SectionPicker + Submit */}
          <div className="flex items-end justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SectionPicker availableSections={availableSections} selectedSections={targetSections} onChange={setTargetSections} />
            </div>
            <button
              onClick={handleCreate}
              disabled={!title.trim() || !content.trim()}
              className="shrink-0 px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-sm font-bold transition"
            >
              Broadcast
            </button>
          </div>
        </div>
      )}

      {/* Announcement grid */}
      {announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
          <Megaphone className="w-10 h-10 mb-3 opacity-20" />
          <p className="text-sm italic">No active announcements.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {announcements.map(a => {
            const style = PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.INFO;
            const audience = a.classType === 'GLOBAL' ? 'All Classes' : a.classType;
            const audienceSuffix = a.targetSections?.length
              ? ` · ${a.targetSections.join(', ')}`
              : a.targetStudentIds?.length
              ? ` · ${a.targetStudentIds.length} student${a.targetStudentIds.length !== 1 ? 's' : ''}`
              : '';
            const relTime = new Date(a.createdAt).toLocaleDateString();
            return (
              <div key={a.id} className={`relative p-3 ${style.bg} border ${style.border} rounded-xl flex flex-col gap-1.5 min-w-0`}>
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`shrink-0 ${style.text}`}>{style.icon}</span>
                    <span className="text-sm font-bold text-[var(--text-primary)] truncate">{a.title}</span>
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="p-1 text-[var(--text-muted)] hover:text-red-400 transition shrink-0"
                    aria-label={`Delete announcement: ${a.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Meta row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[11.5px] font-bold uppercase ${style.bg} ${style.text} border ${style.border}`}>
                    {a.priority}
                  </span>
                  <span className="text-[11.5px] text-[var(--text-muted)] truncate">{audience}{audienceSuffix}</span>
                  <span className="text-[11.5px] text-[var(--text-muted)] ml-auto shrink-0">{relTime}</span>
                </div>
                {/* Message preview */}
                <p className="text-xs text-[var(--text-tertiary)] line-clamp-2">{a.content}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AnnouncementManager;
