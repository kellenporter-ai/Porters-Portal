import { useEffect, useState, useRef } from 'react';
import { X, Plus, Search } from 'lucide-react';
import { dataService } from '../../services/dataService';

interface Snippet {
  id: string;
  label: string;
  text: string;
}

interface SnippetsPopoverProps {
  teacherUid: string;
  isOpen: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
}

export function SnippetsPopover({ teacherUid, isOpen, onClose, onInsert }: SnippetsPopoverProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');

  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch snippets when isOpen becomes true
  useEffect(() => {
    if (isOpen) {
      dataService.getTeacherSnippets(teacherUid).then((result) => {
        if (Array.isArray(result)) {
          setSnippets(result);
        }
      }).catch((err) => {
        console.error('Failed to fetch snippets:', err);
      });
    }
  }, [isOpen, teacherUid]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  // Handle insert
  const handleInsert = (text: string) => {
    onInsert(text);
  };

  // Handle delete
  const handleDelete = (id: string) => {
    dataService.deleteTeacherSnippet(teacherUid, id)
      .then(() => {
        setSnippets((prev) => prev.filter((s) => s.id !== id));
      })
      .catch((err) => {
        console.error('Failed to delete snippet:', err);
      });
  };

  // Handle save new snippet
  const handleSaveSnippet = async () => {
    if (!newLabel.trim() || !newText.trim()) {
      setSaveError('Please fill in both label and text.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await dataService.saveTeacherSnippet(teacherUid, { text: newText.trim(), label: newLabel.trim() });
      setNewLabel('');
      setNewText('');
      setSnippets((prev) => [...prev, { id: Date.now().toString(), label: newLabel.trim(), text: newText.trim() }]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save snippet');
    } finally {
      setIsSaving(false);
    }
  };

  // Filter snippets based on search query
  const filteredSnippets = snippets.filter((snippet) =>
    snippet.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    snippet.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-1 w-72 z-50 bg-[var(--panel-bg)] border border-[var(--border-subtle)] rounded-xl shadow-xl max-h-[400px] overflow-y-auto"
    >
      {/* Search input - only show if >5 snippets */}
      {snippets.length > 5 && (
        <div className="p-3 border-b border-[var(--border-subtle)]">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]"
            />
            <input
              type="text"
              placeholder="Search snippets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
        </div>
      )}

      {/* Snippets list */}
      <div className="max-h-[300px] overflow-y-auto">
        {filteredSnippets.length === 0 ? (
          <div className="p-6 text-center text-[var(--text-muted)]">
            <p className="text-sm">No snippets available yet.</p>
            <p className="text-xs mt-1">Create one below to get started.</p>
          </div>
        ) : (
          <>
            {filteredSnippets.map((snippet) => (
              <div
                key={snippet.id}
                className="p-3 hover:bg-[var(--surface-hover)] transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[var(--text-primary)]">
                      {snippet.label}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] line-clamp-2 mt-1">
                      {snippet.text}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(snippet.id)}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] rounded transition-colors"
                    aria-label={`Delete snippet "${snippet.label}"`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <button
                    onClick={() => handleInsert(snippet.text)}
                    className="px-3 py-1.5 text-xs font-medium bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)] transition-colors"
                  >
                    Insert
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Save new snippet form */}
      <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--surface-base)]">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="text-xs font-medium text-[var(--text-muted)]">Save new snippet</span>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="snippet-label" className="block text-xs text-[var(--text-muted)] mb-1">
              Label
            </label>
            <input
              id="snippet-label"
              type="text"
              placeholder="e.g., Good analysis"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          <div>
            <label htmlFor="snippet-text" className="block text-xs text-[var(--text-muted)] mb-1">
              Text
            </label>
            <textarea
              id="snippet-text"
              placeholder="Enter your feedback snippet..."
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
            />
          </div>

          <div className="flex items-center justify-between">
            {saveError ? (
              <p className="text-xs text-[var(--danger)]">{saveError}</p>
            ) : null}
            <button
              onClick={handleSaveSnippet}
              disabled={isSaving || !newLabel.trim() || !newText.trim()}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SnippetsPopover;
