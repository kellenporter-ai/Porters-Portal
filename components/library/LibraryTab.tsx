import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, RefreshCw, ExternalLink, Plus, Pencil, Archive, ArchiveRestore,
  Loader2, FolderOpen, HardDrive, Link2, LayoutGrid, List, Tag, CheckCheck,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
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

type SortKey = 'title' | 'kind' | 'subject' | 'untagged';
type SortDir = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'kind', label: 'Kind' },
  { key: 'subject', label: 'Subject' },
  { key: 'untagged', label: 'Untagged' },
];

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
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkTag, setBulkTag] = useState('');

  // List view is the default while curating untagged items.
  const view: ViewMode = viewMode ?? (untaggedOnly ? 'list' : 'grid');

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

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'title':
          return a.title.localeCompare(b.title) * dir;
        case 'kind':
          return KIND_LABELS[a.contentKind].localeCompare(KIND_LABELS[b.contentKind]) * dir;
        case 'subject':
          return (a.subject || '').localeCompare(b.subject || '') * dir;
        case 'untagged':
          return (Number(b.untagged) - Number(a.untagged)) * dir;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Drop selections that fall out of the filtered set.
  useEffect(() => {
    setSelected(prev => {
      const visible = new Set(filtered.map(i => i.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach(id => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [filtered]);

  const selectedItems = useMemo(() => filtered.filter(i => selected.has(i.id)), [filtered, selected]);
  const allVisibleSelected = filtered.length > 0 && selectedItems.length === filtered.length;

  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = selectedItems.length > 0 && !allVisibleSelected;
    }
  }, [selectedItems.length, allVisibleSelected]);

  const toggleSelectAll = () => {
    setSelected(prev => {
      if (allVisibleSelected) return new Set<string>();
      const next = new Set(prev);
      filtered.forEach(i => next.add(i.id));
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const runBulkUpdate = async (label: string, mutate: (item: LibraryItem) => Record<string, unknown> | null) => {
    const targets = selectedItems;
    if (targets.length === 0 || bulkBusy) return;
    const updates = targets
      .map(item => ({ item, patch: mutate(item) }))
      .filter((u): u is { item: LibraryItem; patch: Record<string, unknown> } => u.patch !== null);
    if (updates.length === 0) {
      toast.info('Nothing to change for the selected items.');
      return;
    }
    setBulkBusy(true);
    let succeeded = 0;
    try {
      // Firestore batches are capped at 500 writes; chunk to stay under the limit.
      for (let i = 0; i < updates.length; i += 500) {
        const chunk = updates.slice(i, i + 500);
        const batch = writeBatch(db);
        chunk.forEach(({ item, patch }) => {
          batch.update(doc(db, 'library_items', item.id), { ...patch, updatedAt: serverTimestamp() });
        });
        await batch.commit();
        succeeded += chunk.length;
      }
      toast.success(`Updated ${updates.length} item${updates.length === 1 ? '' : 's'}`);
      setSelected(new Set());
      setBulkSubject('');
      setBulkTag('');
    } catch (err) {
      const failed = updates.length - succeeded;
      if (succeeded > 0) {
        // Earlier chunks committed; keep the selection so the user can retry the remainder.
        toast.error(`${label} partially completed: updated ${succeeded} of ${updates.length} item${updates.length === 1 ? '' : 's'}, ${failed} failed. Selection kept so you can retry to continue.`);
      } else {
        await withErrorToast(toast, async () => { throw err; }, `${label} failed. Please try again.`);
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkSetSubject = () => {
    const subject = bulkSubject.trim();
    if (!subject) return;
    void runBulkUpdate('Bulk subject update', item => (item.subject === subject ? null : { subject }));
  };

  const handleBulkAddTag = () => {
    const tag = bulkTag.trim();
    if (!tag) return;
    const lower = tag.toLowerCase();
    void runBulkUpdate('Bulk tag update', item => {
      const existing = item.tags || [];
      if (existing.some(t => t.toLowerCase() === lower)) return null;
      return { tags: [...existing, tag] };
    });
  };

  const handleBulkMarkCurated = () => {
    void runBulkUpdate('Bulk mark curated', item => (item.untagged ? { untagged: false } : null));
  };

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
          <div role="group" aria-label="Library view" className="flex items-center rounded-lg border border-[var(--border)] overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={view === 'grid'}
              aria-label="Grid view"
              className={`p-2 transition ${view === 'grid' ? 'bg-purple-600 text-white' : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-glass)]'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={view === 'list'}
              aria-label="List view"
              className={`p-2 transition ${view === 'list' ? 'bg-purple-600 text-white' : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-glass)]'}`}
            >
              <List className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
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

      {/* Bulk action bar */}
      {selectedItems.length > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-2 z-10 flex flex-wrap items-center gap-2 px-3 py-2 bg-[var(--surface-glass)] border border-purple-500/30 rounded-xl shadow-lg"
        >
          <span className="text-xs font-bold text-[var(--text-primary)]" aria-live="polite">
            {selectedItems.length} selected
          </span>
          <label className="sr-only" htmlFor="library-bulk-subject">Set subject for selected items</label>
          <select
            id="library-bulk-subject"
            value={bulkSubject}
            onChange={e => setBulkSubject(e.target.value)}
            disabled={bulkBusy}
            className="px-2 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-50"
          >
            <option value="">Set subject...</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            type="button"
            onClick={handleBulkSetSubject}
            disabled={bulkBusy || !bulkSubject.trim()}
            className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[11px] font-bold transition disabled:opacity-50"
          >
            Apply subject
          </button>
          <label className="sr-only" htmlFor="library-bulk-tag">Tag to add to selected items</label>
          <input
            id="library-bulk-tag"
            type="text"
            value={bulkTag}
            onChange={e => setBulkTag(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBulkAddTag(); } }}
            placeholder="Tag to add"
            disabled={bulkBusy}
            className="px-2 py-1.5 w-32 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleBulkAddTag}
            disabled={bulkBusy || !bulkTag.trim()}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[11px] font-bold transition disabled:opacity-50"
          >
            <Tag className="w-3 h-3" aria-hidden="true" /> Add tag
          </button>
          <button
            type="button"
            onClick={handleBulkMarkCurated}
            disabled={bulkBusy}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-glass)] hover:border-purple-500/30 transition disabled:opacity-50"
          >
            <CheckCheck className="w-3 h-3" aria-hidden="true" /> Mark curated
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={bulkBusy}
            className="ml-auto px-2.5 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-glass)] transition disabled:opacity-50"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Item views */}
      {loading ? (
        <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" aria-hidden="true" />
          <span className="ml-2 text-sm text-[var(--text-secondary)]">Loading library...</span>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] py-12 text-center">
          {items.length === 0 ? 'The library is empty. Run a scan to detect hosted content.' : 'No items match the current filters.'}
        </p>
      ) : view === 'list' ? (
        <LibraryListView
          items={sorted}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          allVisibleSelected={allVisibleSelected}
          headerCheckboxRef={headerCheckboxRef}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onAssign={setAssigning}
          onEdit={setEditing}
        />
      ) : (
        <LibraryGridView
          items={filtered}
          onAssign={setAssigning}
          onEdit={setEditing}
          onToggleArchive={handleToggleArchive}
        />
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

// ── List view (sortable table with bulk selection) ────────────────────

type ListViewSortKey = SortKey;

const LibraryListView: React.FC<{
  items: LibraryItem[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allVisibleSelected: boolean;
  headerCheckboxRef: React.RefObject<HTMLInputElement | null>;
  sortKey: ListViewSortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onAssign: (item: LibraryItem) => void;
  onEdit: (item: LibraryItem) => void;
}> = ({ items, selected, onToggleSelect, onToggleSelectAll, allVisibleSelected, headerCheckboxRef, sortKey, sortDir, onSort, onAssign, onEdit }) => {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm border-collapse">
        <caption className="sr-only">Content library items</caption>
        <thead>
          <tr className="bg-[var(--surface-raised)] text-left">
            <th scope="col" className="w-10 px-3 py-2">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                checked={allVisibleSelected}
                onChange={onToggleSelectAll}
                aria-label="Select all visible items"
                className="w-3.5 h-3.5 rounded accent-purple-600"
              />
            </th>
            {SORT_COLUMNS.map(col => {
              const active = sortKey === col.key;
              const SortIcon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    aria-label={`Sort by ${col.label}${active ? ` (${sortDir === 'asc' ? 'ascending' : 'descending'})` : ''}`}
                    className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide transition ${active ? 'text-purple-600 dark:text-purple-300' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                  >
                    {col.label}
                    <SortIcon className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
              );
            })}
            <th scope="col" className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Tags</th>
            <th scope="col" className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Hosting</th>
            <th scope="col" className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const HostingIcon = HOSTING_META[item.hostingType].Icon;
            const tags = item.tags || [];
            const isSelected = selected.has(item.id);
            return (
              <tr
                key={item.id}
                className={`border-t border-[var(--border)] transition ${isSelected ? 'bg-purple-500/10' : 'hover:bg-[var(--surface-raised)]'} ${item.status === 'archived' ? 'opacity-60' : ''}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(item.id)}
                    onClick={e => e.stopPropagation()}
                    aria-label={`Select ${item.title}`}
                    className="w-3.5 h-3.5 rounded accent-purple-600"
                  />
                </td>
                <td className="px-3 py-2 font-bold text-[var(--text-primary)] leading-snug">{item.title}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                    {KIND_LABELS[item.contentKind]}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{item.subject || 'None set'}</td>
                <td className="px-3 py-2">
                  {item.untagged ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      Untagged
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {tags.slice(0, 2).map(tag => (
                      <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                        {tag}
                      </span>
                    ))}
                    {tags.length > 2 && (
                      <span className="text-[10px] font-bold text-[var(--text-muted)]">+{tags.length - 2}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--text-muted)]" title={HOSTING_META[item.hostingType].label}>
                    <HostingIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="sr-only">{HOSTING_META[item.hostingType].label}</span>
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Preview ${item.title}`}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] border border-transparent hover:border-[var(--border)] transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                    <button
                      type="button"
                      onClick={() => onAssign(item)}
                      aria-label={`Assign ${item.title}`}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-purple-600 dark:hover:text-purple-300 hover:bg-[var(--surface-raised)] border border-transparent hover:border-[var(--border)] transition"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      aria-label={`Edit ${item.title}`}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] border border-transparent hover:border-[var(--border)] transition"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ── Grid view (card layout, unchanged behavior) ───────────────────────

const LibraryGridView: React.FC<{
  items: LibraryItem[];
  onAssign: (item: LibraryItem) => void;
  onEdit: (item: LibraryItem) => void;
  onToggleArchive: (item: LibraryItem) => void;
}> = ({ items, onAssign, onEdit, onToggleArchive }) => {
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" role="list">
      {items.map(item => {
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
                onClick={() => onAssign(item)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[11px] font-bold transition"
              >
                <Plus className="w-3 h-3" aria-hidden="true" /> Assign
              </button>
              <button
                onClick={() => onEdit(item)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-glass)] hover:border-purple-500/30 transition"
              >
                <Pencil className="w-3 h-3" aria-hidden="true" /> Edit
              </button>
              <button
                onClick={() => onToggleArchive(item)}
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
