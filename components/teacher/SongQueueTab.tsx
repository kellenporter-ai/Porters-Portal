import React, { useState, useMemo } from 'react';
import { SongRequest } from '../../types';
import {
  Music, Check, Clipboard, X as XIcon,
} from 'lucide-react';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import { FeatureErrorBoundary } from '../ErrorBoundary';

interface SongQueueTabProps {
  songRequests: SongRequest[];
}

const SongQueueTabInner: React.FC<SongQueueTabProps> = ({ songRequests }) => {
  const toast = useToast();
  const [showAllSongs, setShowAllSongs] = useState(false);

  const pendingSongCount = useMemo(() => songRequests.filter(r => r.status === 'pending').length, [songRequests]);

  return (
    <div className="space-y-4">
      {/* Header and filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--text-tertiary)]">
            <span className="font-bold text-[var(--text-primary)]">{pendingSongCount}</span> pending
            {songRequests.length - pendingSongCount > 0 && (
              <span className="ml-2 text-[var(--text-muted)]">/ {songRequests.length - pendingSongCount} played or skipped</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAllSongs(false)}
            className={`text-xs font-bold px-3 py-2 rounded-xl border transition ${!showAllSongs ? 'bg-purple-600/50 text-white border-purple-500/30' : 'bg-[var(--surface-glass)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--border-strong)]'}`}
          >
            Pending
          </button>
          <button
            onClick={() => setShowAllSongs(true)}
            className={`text-xs font-bold px-3 py-2 rounded-xl border transition ${showAllSongs ? 'bg-purple-600/50 text-white border-purple-500/30' : 'bg-[var(--surface-glass)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--border-strong)]'}`}
          >
            All
          </button>
        </div>
      </div>

      {/* Song request list */}
      <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-3xl p-6">
        <p className="text-[11.5px] text-[var(--text-muted)] mb-4">Playing via Amazon Music. Mark requests as played to keep the queue current.</p>
        {(() => {
          const visible = showAllSongs ? songRequests : songRequests.filter(r => r.status === 'pending');
          if (visible.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Music className="w-12 h-12 text-gray-700 mb-4" />
                <p className="text-[var(--text-muted)] text-sm font-medium">No song requests yet.</p>
                <p className="text-[var(--text-muted)] text-xs mt-1 max-w-sm">Student song requests will appear here.</p>
              </div>
            );
          }
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
              {visible.map(req => {
                const relTime = (() => {
                  const diff = Date.now() - new Date(req.timestamp).getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 1) return 'just now';
                  if (mins < 60) return `${mins}m ago`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `${hrs}h ago`;
                  return `${Math.floor(hrs / 24)}d ago`;
                })();
                const statusBadge = req.status === 'pending'
                  ? 'bg-amber-500/20 text-amber-600 border-amber-500/30'
                  : req.status === 'played'
                    ? 'bg-green-500/20 text-green-600 border-green-500/30'
                    : 'bg-gray-500/20 text-gray-600 border-gray-500/30';
                return (
                  <div
                    key={req.id}
                    className={`bg-[var(--panel-bg)] border rounded-2xl p-4 transition ${
                      req.status !== 'pending' ? 'border-[var(--border)] opacity-60' : 'border-[var(--border)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-[var(--text-primary)] truncate">{req.song}</p>
                        <p className="text-xs text-[var(--text-tertiary)] truncate">{req.artist}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => navigator.clipboard.writeText(`${req.song} ${req.artist}`).then(() => toast.success('Copied!'))}
                          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass)] rounded-lg transition"
                          title="Copy to clipboard"
                        >
                          <Clipboard className="w-3.5 h-3.5" />
                        </button>
                        <span className={`text-[11.5px] font-bold uppercase px-2 py-0.5 rounded border ${statusBadge}`}>
                          {req.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                      <span className="text-[11.5px] text-[var(--text-muted)]">
                        {req.userName} · {relTime}
                      </span>
                      {req.status === 'pending' && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={async () => {
                              try {
                                await dataService.updateSongRequest(req.id!, { status: 'played' });
                                toast.success('Marked as played.');
                              } catch {
                                toast.error('Failed to update request.');
                              }
                            }}
                            className="flex items-center gap-1 text-[11.5px] font-bold text-green-600 bg-green-500/10 hover:bg-green-500/20 px-2.5 py-1.5 rounded-lg transition min-h-[44px]"
                            title="Mark as played"
                          >
                            <Check className="w-3 h-3" /> Played
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await dataService.updateSongRequest(req.id!, { status: 'dismissed' });
                                toast.success('Request dismissed.');
                              } catch {
                                toast.error('Failed to update request.');
                              }
                            }}
                            className="flex items-center gap-1 text-[11.5px] font-bold text-[var(--text-muted)] bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] px-2.5 py-1.5 rounded-lg transition min-h-[44px]"
                            title="Skip / dismiss"
                          >
                            <XIcon className="w-3 h-3" /> Skip
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

const SongQueueTab: React.FC<SongQueueTabProps> = (props) => (
  <FeatureErrorBoundary feature="Song Queue">
    <SongQueueTabInner {...props} />
  </FeatureErrorBoundary>
);

export default SongQueueTab;
