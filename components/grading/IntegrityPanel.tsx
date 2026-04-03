import React from 'react';
import { Fingerprint, CheckCircle, ChevronRight } from 'lucide-react';
import type { IntegrityReport } from '../../lib/integrityAnalysis';

interface IntegrityPanelProps {
  report: IntegrityReport;
  expandedPairIdx: number | null;
  onTogglePair: (i: number) => void;
}

const IntegrityPanel: React.FC<IntegrityPanelProps> = ({ report, expandedPairIdx, onTogglePair }) => (
  <div className="bg-amber-900/10 border border-amber-500/20 rounded-3xl p-6 backdrop-blur-md space-y-4">
    <div className="flex items-center justify-between">
      <h4 className="text-lg font-bold text-amber-400 flex items-center gap-2">
        <Fingerprint className="w-5 h-5" aria-hidden="true" />
        Integrity Analysis
      </h4>
      <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
        <span>{report.totalStudents} students</span>
        <span className="text-[var(--text-muted)]">&bull;</span>
        <span>{report.pairsAnalyzed} pairs compared</span>
        <span className="text-[var(--text-muted)]">&bull;</span>
        <span>{new Date(report.analyzedAt).toLocaleTimeString()}</span>
      </div>
    </div>

    {report.flaggedPairs.length === 0 ? (
      <div className="text-center py-6">
        <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400 opacity-40" aria-hidden="true" />
        <p className="text-sm text-green-400 font-bold">No suspicious similarity detected</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">All student responses appear to be independently written.</p>
      </div>
    ) : (
      <div className="space-y-2">
        <div className="text-xs text-amber-400/70 font-bold uppercase tracking-widest mb-2">
          {report.flaggedPairs.length} suspicious pair{report.flaggedPairs.length !== 1 ? 's' : ''} found
        </div>
        {report.flaggedPairs.map((pair, idx) => {
          const isHigh = pair.overallSimilarity >= 90;
          const isExpanded = expandedPairIdx === idx;
          return (
            <div key={idx} className={`border rounded-2xl overflow-hidden transition ${isHigh ? 'bg-red-900/10 border-red-500/20' : 'bg-amber-900/10 border-amber-500/15'}`}>
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[var(--surface-glass)] transition"
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => onTogglePair(idx)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTogglePair(idx); } }}
              >
                <div className={`px-2 py-1 rounded-lg text-xs font-bold ${isHigh ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {pair.overallSimilarity > 0 ? `${pair.overallSimilarity}%` : 'MC'}
                </div>
                <div className="flex-1 text-sm text-[var(--text-primary)]">
                  <span className="font-bold">{pair.studentA.userName}</span>
                  <span className="text-[var(--text-muted)] mx-2">&harr;</span>
                  <span className="font-bold">{pair.studentB.userName}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
                  {pair.flaggedBlocks.length > 0 && (
                    <span>{pair.flaggedBlocks.length} similar response{pair.flaggedBlocks.length !== 1 ? 's' : ''}</span>
                  )}
                  {pair.mcMatchCount > 0 && (
                    <span className="text-amber-400">{pair.mcMatchCount}/{pair.mcTotalWrong} shared wrong MC</span>
                  )}
                </div>
                <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} aria-hidden="true" />
              </div>

              {isExpanded && (
                <div className="border-t border-[var(--border)] p-4 space-y-3 bg-[var(--panel-bg)]">
                  {pair.flaggedBlocks.length > 0 ? pair.flaggedBlocks.map((block, bi) => (
                    <div key={bi} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${block.similarity >= 90 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          {block.similarity}%
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {block.question.length > 120 ? block.question.slice(0, 120) + '...' : block.question}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[var(--surface-glass)] rounded-lg p-3">
                          <div className="text-xs text-[var(--text-tertiary)] font-bold mb-1">{pair.studentA.userName}</div>
                          <div className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words">{block.textA}</div>
                        </div>
                        <div className="bg-[var(--surface-glass)] rounded-lg p-3">
                          <div className="text-xs text-[var(--text-tertiary)] font-bold mb-1">{pair.studentB.userName}</div>
                          <div className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words">{block.textB}</div>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="text-xs text-[var(--text-muted)] italic">
                      Flagged based on shared wrong MC answers only &mdash; no comparable text responses.
                    </div>
                  )}
                  {pair.mcMatchCount > 0 && (
                    <div className="mt-2 bg-amber-900/20 border border-amber-500/10 rounded-lg p-3 text-xs text-amber-400/80">
                      <span className="font-bold">MC Pattern:</span> {pair.mcMatchCount} of {pair.mcTotalWrong} incorrect MC answers are identical between these students.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default IntegrityPanel;
