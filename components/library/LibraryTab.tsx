import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, RefreshCw, ExternalLink, Plus, Pencil, Archive, ArchiveRestore,
  Loader2, FolderOpen, HardDrive, Link2,
} from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { withErrorToast } from '../../lib/errorReporting';
import { useToast } from '../ToastProvider';
import Modal from '../Modal';
import type { LibraryItem, ResourceCategory } from '../../types';
import { AssignmentStatus } from '../../types';

const CATEGORIES: ResourceCategory[] = ['Lesson', 'Lab', 'Simulation', 'Practice', 'Supplemental'];

const KIND_LABELS: Record<LibraryItem['contentKind'], string> = {
  activity: 'Activity',
  tool: 'Tool',
  textbook: 'Textbook',
  deck: 'Deck',
  document: 'Document',
  utility: 'Utility',
};

const HOSTING_META: Record<LibraryItem['hostingType'], { label: string; Icon: typeof FolderOpen }> = {
  bundled: { label: 'Bundled with app', Icon: FolderOpen },
  storage: { label: 'Storage upload', Icon: HardDrive },
  external: { label: 'External link', Icon: Link2 },
};

const LibraryTab: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState<'all' | LibraryItem['contentKind']>('all');
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [assigning, setAssigning] = useState<LibraryItem | null>(null);
  const [classConfigs, setClassConfigs] = useState<{ className?: string; unitOrder?: string[] }[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'library_items'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<LibraryItem, 'id'>) })));
      setLoading(false);
    }, (err) => {
      setLoading(false);
      if ((err as { code?: string }).code === 'permission-denied') {
        toast.error('Access to the content library was lost. Refresh the page to reconnect.');
      } else {
        toast.error('Failed to load the content library. Please try again.');
      }
    });
    const unsubConfigs = onSnapshot(collection(db, 'class_configs'), (snap) => {
      setClassConfigs(snap.docs.map(d => d.data() as { className?: string; unitOrder?: string[] }));
    });
    return () => { unsub(); unsubConfigs(); };
  }, []);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => { if (i.subject) set.add(i.subject); });
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i => {
      if (!showArchived && i.status === 'archived') return false;
      if (untaggedOnly && !i.untagged) return false;
      if (subjectFilter !== 'all' && i.subject !== subjectFilter) return false;
      if (kindFilter !== 'all' && i.contentKind !== kindFilter) return false;
      if (q && ![i.title, i.description, ...(i.tags || [])].some(v => (v || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, search, subjectFilter, kindFilter, untaggedOnly, showArchived]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const fn = httpsCallable<unknown, { added: number; alreadyKnown: number }>(functions, 'scanLibraryItems');
      const res = await fn();
      toast.success(`Added ${res.data.added} new item${res.data.added === 1 ? '' : 's'} (${res.data.alreadyKnown} already known)`);
    } catch (err) {
      await withErrorToast(toast, async () => { throw err; }, 'Scan failed. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleToggleArchive = async (item: LibraryItem) => {
    const next = item.status === 'archived' ? 'active' : 'archived';
    await withErrorToast(toast, () =>
      updateDoc(doc(db, 'library_items', item.id), { status: next, updatedAt: serverTimestamp() }),
    next === 'archived' ? 'Failed to archive item.' : 'Failed to restore item.');
  };

  return (
    <div className="space-y-4">
      {/* Header + filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
            <label htmlFor="library-search" className="sr-only">Search the content library</label>
            <input
              id="library-search"
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search title, description, or tags"
              className="pl-9 pr-3 py-2 w-64 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            />
          </div>
          <label className="sr-only" htmlFor="library-subject-filter">Filter by subject</label>
          <select
            id="library-subject-filter"
            value={subjectFilter}
            onChange={e => setSubjectFilter(e.target.value)}
            className="px-3 py-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <option value="all">All subjects</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="sr-only" htmlFor="library-kind-filter">Filter by kind</label>
          <select
            id="library-kind-filter"
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value as typeof kindFilter)}
            className="px-3 py-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <option value="all">All kinds</option>
            {Object.entries(KIND_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={untaggedOnly}
              onChange={e => setUntaggedOnly(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-purple-600"
            />
            Untagged only
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-purple-600"
            />
            Show archived
          </label>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/20 transition disabled:opacity-50"
        >
          {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
          {scanning ? 'Scanning...' : 'Scan for new content'}
        </button>
      </div>

      {/* Card grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" aria-hidden="true" />
          <span className="ml-2 text-sm text-[var(--text-secondary)]">Loading library...</span>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] py-12 text-center">
          {items.length === 0 ? 'The library is empty. Run a scan to detect hosted content.' : 'No items match the current filters.'}
        </p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" role="list">
          {filtered.map(item => {
            const HostingIcon = HOSTING_META[item.hostingType].Icon;
            return (
              <li key={item.id} className={`bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl p-4 flex flex-col gap-3 ${item.status === 'archived' ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] leading-snug">{item.title}</h3>
                  <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                    {KIND_LABELS[item.contentKind]}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                  {item.description || 'No description yet.'}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.untagged && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      Untagged
                    </span>
                  )}
                  {item.subject && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border)]">
                      {item.subject}
                    </span>
                  )}
                  {(item.tags || []).map(tag => (
                    <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)]">
                  <HostingIcon className="w-3 h-3" aria-hidden="true" /> {HOSTING_META[item.hostingType].label}
                </p>
                <div className="flex items-center gap-2 mt-auto pt-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-glass)] hover:border-purple-500/30 transition"
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" /> Preview
                  </a>
                  <button
                    onClick={() => setAssigning(item)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[11px] font-bold transition"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" /> Assign
                  </button>
                  <button
                    onClick={() => setEditing(item)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-glass)] hover:border-purple-500/30 transition"
                  >
                    <Pencil className="w-3 h-3" aria-hidden="true" /> Edit
                  </button>
                  <button
                    onClick={() => handleToggleArchive(item)}
                    className="p-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-purple-500/30 transition"
                    aria-label={item.status === 'archived' ? `Restore ${item.title}` : `Archive ${item.title}`}
                  >
                    {item.status === 'archived' ? <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" /> : <Archive className="w-3.5 h-3.5" aria-hidden="true" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <EditMetadataModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
      {assigning && (
        <AssignModal
          item={assigning}
          classConfigs={classConfigs}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
};

// ── Edit metadata modal ───────────────────────────────────────────────

const EditMetadataModal: React.FC<{ item: LibraryItem; onClose: () => void; onSaved: () => void }> = ({ item, onClose, onSaved }) => {
  const toast = useToast();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [subject, setSubject] = useState(item.subject || '');
  const [tagsInput, setTagsInput] = useState((item.tags || []).join(', '));
  const [category, setCategory] = useState<ResourceCategory>(item.suggestedCategory);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'library_items', item.id), {
        title: title.trim() || item.title,
        description: description.trim(),
        subject: subject.trim() || null,
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
        suggestedCategory: category,
        untagged: false,
        updatedAt: serverTimestamp(),
      });
      toast.success('Library item updated.');
      onSaved();
    } catch (err) {
      await withErrorToast(toast, async () => { throw err; }, 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Edit metadata" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div>
          <label htmlFor="lib-edit-title" className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Title</label>
          <input id="lib-edit-title" type="text" value={title} onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500" />
        </div>
        <div>
          <label htmlFor="lib-edit-description" className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Description</label>
          <textarea id="lib-edit-description" value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className="w-full px-3 py-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="lib-edit-subject" className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Subject</label>
            <input id="lib-edit-subject" type="text" value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="e.g. AP Physics 1"
              className="w-full px-3 py-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500" />
          </div>
          <div>
            <label htmlFor="lib-edit-category" className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Suggested category</label>
            <select id="lib-edit-category" value={category} onChange={e => setCategory(e.target.value as ResourceCategory)}
              className="w-full px-3 py-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="lib-edit-tags" className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Tags (comma separated)</label>
          <input id="lib-edit-tags" type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)}
            placeholder="kinematics, graphing"
            className="w-full px-3 py-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500" />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Save changes
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-glass)] transition">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ── Assign modal ──────────────────────────────────────────────────────

const AssignModal: React.FC<{
  item: LibraryItem;
  classConfigs: { className?: string; unitOrder?: string[] }[];
  onClose: () => void;
}> = ({ item, classConfigs, onClose }) => {
  const toast = useToast();
  const [classType, setClassType] = useState('');
  const [unit, setUnit] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const classNames = useMemo(() => classConfigs.map(c => c.className).filter((n): n is string => Boolean(n)), [classConfigs]);
  const units = useMemo(() => classConfigs.find(c => c.className === classType)?.unitOrder || [], [classConfigs, classType]);

  const handleCreate = async () => {
    if (!classType) return;
    setSaving(true);
    try {
      const res = await withErrorToast(toast, async () => {
        const { dataService } = await import('../../services/dataService');
        return dataService.addAssignment({
          id: '',
          title: item.title,
          description: item.description,
          classType,
          unit: unit || 'Unassigned Unit',
          category: item.suggestedCategory,
          contentUrl: item.url,
          status: AssignmentStatus.DRAFT,
          resources: [],
          publicComments: [],
        });
      }, 'Failed to create the draft assignment.');
      if (res) {
        setCreatedId(res);
        toast.success('Draft assignment created.');
      }
    } finally {
      setSaving(false);
    }
  };

  const openInEditor = () => {
    window.location.href = `/editor?assignment=${createdId}`;
  };

  return (
    <Modal isOpen onClose={onClose} title={createdId ? 'Draft created' : `Assign: ${item.title}`} maxWidth="max-w-md">
      {!createdId ? (
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-tertiary)]">This creates a draft assignment prefilled from this library item. Nothing is visible to students until you deploy it.</p>
          <div>
            <label htmlFor="lib-assign-class" className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Class</label>
            <select id="lib-assign-class" value={classType} onChange={e => { setClassType(e.target.value); setUnit(''); }}
              className="w-full px-3 py-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">
              <option value="">Select a class</option>
              {classNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="lib-assign-unit" className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Unit</label>
            <select id="lib-assign-unit" value={unit} onChange={e => setUnit(e.target.value)} disabled={!classType}
              className="w-full px-3 py-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-50">
              <option value="">Unassigned Unit</option>
              {units.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleCreate} disabled={!classType || saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Create draft
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-glass)] transition">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-secondary)]">The draft assignment is ready. Open it in the lesson editor to review and deploy, or close this dialog.</p>
          <div className="flex items-center gap-2">
            <button onClick={openInEditor}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition">
              Open in editor
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-glass)] transition">
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default LibraryTab;
