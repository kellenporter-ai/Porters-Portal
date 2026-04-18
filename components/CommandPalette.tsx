import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavItem } from '../constants';
import { Search } from 'lucide-react';

export interface CommandPaletteItem extends NavItem {
  /** Optional override for what handleNavigate should be called with (e.g. "Parent:Child" for nested children). */
  navTarget?: string;
  /** Optional human-readable display name override (e.g. "Gear" instead of "Agent Loadout"). */
  displayName?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (tabName: string) => void;
  items: CommandPaletteItem[];
}

const fuzzyMatch = (query: string, target: string): boolean => {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  // Simple subsequence match
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
};

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, onSelect, items }) => {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Respect prefers-reduced-motion
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Filter results
  const results = useMemo(() => {
    if (!query.trim()) return items;
    return items.filter(item => {
      const name = item.displayName || item.name;
      return fuzzyMatch(query, name) || (item.flavor ? fuzzyMatch(query, item.flavor) : false);
    });
  }, [items, query]);

  // Reset when opened/closed
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setQuery('');
      setActiveIdx(0);
      // Focus input after mount
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      // Return focus
      previousFocusRef.current?.focus?.();
    }
  }, [open]);

  // Clamp activeIdx when results shrink
  useEffect(() => {
    if (activeIdx >= results.length) setActiveIdx(0);
  }, [results.length, activeIdx]);

  // Scroll active item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => (results.length === 0 ? 0 : (i + 1) % results.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const choice = results[activeIdx];
      if (choice) {
        onSelect(choice.navTarget || choice.name);
        onClose();
      }
    }
  };

  const handleSelect = (item: CommandPaletteItem) => {
    onSelect(item.navTarget || item.name);
    onClose();
  };

  const animClass = prefersReducedMotion ? '' : 'animate-in fade-in zoom-in-95 duration-150';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[15vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette — search navigation"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${prefersReducedMotion ? '' : 'animate-in fade-in duration-150'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`relative w-full max-w-[480px] bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden ${animClass}`}
        style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--text-secondary,var(--text-primary))] opacity-60 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            placeholder="Search tabs…"
            aria-label="Search navigation tabs"
            className="flex-1 bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-secondary,var(--text-primary))] placeholder:opacity-50 text-sm"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/20 dark:bg-white/10 text-[var(--text-primary)] opacity-60">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1.5" role="listbox">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--text-primary)] opacity-50">
              No matching tabs.
            </div>
          ) : (
            results.map((item, idx) => {
              const isActive = idx === activeIdx;
              const label = item.displayName || item.name;
              return (
                <button
                  key={`${item.name}-${idx}`}
                  data-cmd-idx={idx}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'bg-[var(--accent-muted,rgba(139,92,246,0.18))] text-[var(--text-primary)]'
                      : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <span className={`w-1 h-6 rounded-full transition-colors ${isActive ? 'bg-[var(--accent)]' : 'bg-transparent'}`} aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-sm truncate">{label}</span>
                    {item.flavor && (
                      <span className="block text-[11px] font-mono opacity-60 truncate">{item.flavor}</span>
                    )}
                  </span>
                  {item.children && (
                    <span className="text-[10px] uppercase tracking-wider opacity-50">group</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Hint footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-[var(--border)] text-[10.5px] text-[var(--text-primary)] opacity-60">
          <span className="flex items-center gap-2">
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-black/15 dark:bg-white/10">↑↓</kbd>
            <span>navigate</span>
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-black/15 dark:bg-white/10">↵</kbd>
            <span>select</span>
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-black/15 dark:bg-white/10">Esc</kbd>
            <span>close</span>
          </span>
          <span className="font-mono opacity-70">{results.length} result{results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
