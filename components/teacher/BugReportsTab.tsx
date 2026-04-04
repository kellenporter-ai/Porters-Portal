import React, { useState, useMemo, useCallback } from 'react';
import { BugReport } from '../../types';
import {
  Bug, Check, CheckCircle, Clipboard, Pencil, Sparkles, Trash2, Wrench,
  X as XIcon,
} from 'lucide-react';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import { useConfirm } from '../ConfirmDialog';
import { FeatureErrorBoundary } from '../ErrorBoundary';

const CATEGORY_BADGES: Record<string, { label: string; color: string }> = {
  bug: { label: 'Bug', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  feature: { label: 'Feature', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  other: { label: 'Other', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

interface BugReportsTabProps {
  bugReports: BugReport[];
}

const BugReportsTabInner: React.FC<BugReportsTabProps> = ({ bugReports }) => {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [showResolved, setShowResolved] = useState(false);
  const [editingReport, setEditingReport] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [selectedBugs, setSelectedBugs] = useState<Set<string>>(new Set());
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiContext, setAiContext] = useState('');

  const visibleReports = useMemo(
    () => bugReports.filter(r => showResolved || !r.resolved),
    [bugReports, showResolved]
  );

  const unresolvedCount = useMemo(() => bugReports.filter(r => !r.resolved).length, [bugReports]);

  const toggleBugSelect = useCallback((id: string) => {
    setSelectedBugs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const startEdit = useCallback((report: BugReport) => {
    setEditingReport(report.id!);
    setEditText(report.description);
  }, []);

  const saveEdit = useCallback(async (reportId: string) => {
    await dataService.updateBugReport(reportId, { description: editText });
    setEditingReport(null);
    setEditText('');
    toast.success('Report updated.');
  }, [editText, toast]);

  const resolveReport = useCallback(async (id: string) => {
    await dataService.resolveBugReport(id);
    setSelectedBugs(prev => { const n = new Set(prev); n.delete(id); return n; });
    toast.success('Report resolved.');
  }, [toast]);

  const deleteReport = useCallback(async (id: string) => {
    if (await confirm({ message: 'Delete this report permanently?', confirmLabel: 'Delete' })) {
      await dataService.deleteBugReport(id);
      setSelectedBugs(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }, [confirm]);

  const generatePrompt = useCallback(() => {
    const selected = bugReports.filter(r => selectedBugs.has(r.id!));
    const ctx = aiContext.trim();

    const bugList = selected.length > 0
      ? selected.map((r, i) =>
          `${i + 1}. [${r.category.toUpperCase()}] ${r.description}${r.userName ? ` (reported by ${r.userName})` : ''}`
        ).join('\n')
      : '(No specific reports selected — analyze the codebase for common issues)';

    return `You are working on "Porter Portal", an educational platform built with React 19, TypeScript, Tailwind CSS, and Firebase Firestore.

The following bug reports and feature requests have been filed by users:

${bugList}
${ctx ? `\nAdditional context from the admin:\n${ctx}\n` : ''}
Please analyze these issues, identify the root causes in the codebase, and implement fixes. For each fix:
1. Explain what the issue is and where in the code it occurs
2. Make the minimal, targeted change needed
3. Ensure the fix doesn't introduce regressions
4. Build and verify the changes compile cleanly`;
  }, [selectedBugs, bugReports, aiContext]);

  const copyPrompt = useCallback(() => {
    navigator.clipboard.writeText(generatePrompt());
    toast.success('Prompt copied to clipboard!');
  }, [generatePrompt, toast]);

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--text-tertiary)]">
            <span className="font-bold text-[var(--text-primary)]">{unresolvedCount}</span> open
            {bugReports.length - unresolvedCount > 0 && (
              <span className="ml-2 text-[var(--text-muted)]">/ {bugReports.length - unresolvedCount} resolved</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {selectedBugs.size > 0 && (
            <button
              onClick={() => setShowAiPanel(prev => !prev)}
              className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent-text)] bg-[var(--accent-muted)] border border-purple-500/20 px-3 py-2 rounded-xl hover:bg-purple-500/20 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> AI Fix ({selectedBugs.size})
            </button>
          )}
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer select-none bg-[var(--surface-glass)] px-3 py-2 rounded-xl border border-[var(--border)]">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={e => setShowResolved(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-purple-500"
            />
            Show Resolved
          </label>
        </div>
      </div>

      {/* Bug list */}
      <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-3xl p-6">
        {visibleReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bug className="w-12 h-12 text-gray-700 mb-4" />
            <p className="text-[var(--text-muted)] text-sm font-medium">No reports yet</p>
            <p className="text-[var(--text-muted)] text-xs mt-1 max-w-sm">Bug reports and feature requests submitted by users will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
            {visibleReports.map(report => {
              const badge = CATEGORY_BADGES[report.category];
              const isSelected = selectedBugs.has(report.id!);
              const isEditing = editingReport === report.id;
              return (
                <div
                  key={report.id}
                  className={`bg-[var(--panel-bg)] border rounded-2xl p-4 transition ${
                    report.resolved ? 'border-green-500/10 opacity-50' :
                    isSelected ? 'border-purple-500/30 bg-purple-500/5' : 'border-[var(--border)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    {!report.resolved && (
                      <button
                        onClick={() => toggleBugSelect(report.id!)}
                        className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition cursor-pointer ${
                          isSelected ? 'bg-purple-600 border-purple-500' : 'border-[var(--border-strong)] hover:border-purple-500/50'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${badge.color}`}>{badge.label}</span>
                        <span className="text-xs text-[var(--text-muted)] truncate">{report.userName}</span>
                        {report.resolved && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                      </div>
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            rows={3}
                            className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition resize-none"
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <button onClick={() => saveEdit(report.id!)} className="flex items-center gap-1 text-xs font-bold text-green-300 bg-green-500/10 px-3 py-1.5 rounded-lg hover:bg-green-500/20 transition cursor-pointer">
                              <Check className="w-3 h-3" /> Save
                            </button>
                            <button onClick={() => setEditingReport(null)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-lg transition cursor-pointer">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{report.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      {new Date(report.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {!report.resolved && !isEditing && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEdit(report)} className="p-1.5 text-[var(--text-muted)] hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition cursor-pointer" title="Edit description">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => resolveReport(report.id!)} className="p-1.5 text-[var(--text-muted)] hover:text-green-400 hover:bg-green-500/10 rounded-lg transition cursor-pointer" title="Mark resolved">
                          <CheckCircle className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteReport(report.id!)} className="p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Fix Panel — inline, shown when selectedBugs > 0 or showAiPanel */}
      {(showAiPanel || selectedBugs.size > 0) && (
        <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest">AI Fix — Fix Bugs</span>
            </div>
            <button
              onClick={() => setShowAiPanel(false)}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              aria-label="Close AI panel"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {selectedBugs.size > 0 && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2">
              <span className="text-[10px] font-bold text-[var(--accent-text)] uppercase tracking-widest">{selectedBugs.size} report{selectedBugs.size !== 1 ? 's' : ''} selected</span>
              <div className="mt-2 space-y-1">
                {bugReports.filter(r => selectedBugs.has(r.id!)).map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] bg-[var(--panel-bg)] rounded-lg px-3 py-2">
                    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${CATEGORY_BADGES[r.category].color}`}>{r.category}</span>
                    <span className="truncate flex-1">{r.description.slice(0, 80)}{r.description.length > 80 ? '...' : ''}</span>
                    <button onClick={() => toggleBugSelect(r.id!)} className="shrink-0 p-0.5 text-[var(--text-muted)] hover:text-red-400 transition cursor-pointer">
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">
              Additional Context
            </label>
            <textarea
              value={aiContext}
              onChange={e => setAiContext(e.target.value)}
              rows={2}
              placeholder="Extra context about the bugs or how to reproduce them..."
              className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-4 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition resize-none"
            />
          </div>

          <div className="flex gap-2 items-start">
            <button
              onClick={copyPrompt}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-xs transition cursor-pointer shadow-sm shrink-0"
            >
              <Clipboard className="w-4 h-4" /> Copy Prompt to Clipboard
            </button>
            <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg p-2 max-h-24 overflow-y-auto custom-scrollbar flex-1">
              <pre className="text-xs text-[var(--text-tertiary)] whitespace-pre-wrap font-mono leading-relaxed">{generatePrompt()}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const BugReportsTab: React.FC<BugReportsTabProps> = (props) => (
  <FeatureErrorBoundary feature="Bug Reports">
    <BugReportsTabInner {...props} />
  </FeatureErrorBoundary>
);

export default BugReportsTab;
