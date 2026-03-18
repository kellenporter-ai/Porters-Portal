
import React, { useState, useRef, useEffect } from 'react';
import { Music, X, Send, CheckCircle } from 'lucide-react';
import { User } from '../types';
import { dataService } from '../services/dataService';
import { useToast } from './ToastProvider';

interface SongRequesterProps {
  user: User;
}

const SongRequester: React.FC<SongRequesterProps> = ({ user }) => {
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [song, setSong] = useState('');
  const [artist, setArtist] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const handleSubmit = async () => {
    if (!song.trim() || !artist.trim() || cooldown) return;
    setIsSubmitting(true);
    try {
      await dataService.submitSongRequest({
        userId: user.id,
        userName: user.name,
        song: song.trim(),
        artist: artist.trim(),
        timestamp: new Date().toISOString(),
        status: 'pending',
      });
      setSubmitted(true);
      setCooldown(true);
      timersRef.current.push(setTimeout(() => setCooldown(false), 30000));
      timersRef.current.push(setTimeout(() => { setSubmitted(false); setIsOpen(false); setSong(''); setArtist(''); }, 2000));
    } catch {
      toast.error('Failed to send request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open via sidebar button event
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('porters:openSongRequest', handler);
    return () => window.removeEventListener('porters:openSongRequest', handler);
  }, []);

  return (
    <>
      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setIsOpen(false)}>
          <div className="absolute inset-0 bg-[var(--backdrop)] backdrop-blur-sm" />
          <div
            className="relative bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300"
            onClick={e => e.stopPropagation()}
          >
            {submitted ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Request sent! 🎵</h3>
                <p className="text-sm text-[var(--text-tertiary)] mt-1">Your song has been added to the queue.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
                  <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Music className="w-5 h-5 text-purple-400" /> Request a Song
                  </h3>
                  <button onClick={() => setIsOpen(false)} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition min-w-[44px] min-h-[44px] flex items-center justify-center">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <input
                    type="text"
                    value={song}
                    onChange={e => setSong(e.target.value)}
                    placeholder="Song title"
                    maxLength={100}
                    className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={artist}
                    onChange={e => setArtist(e.target.value)}
                    placeholder="Artist name"
                    maxLength={100}
                    className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition"
                    onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                  />

                  <button
                    onClick={handleSubmit}
                    disabled={!song.trim() || !artist.trim() || isSubmitting || cooldown}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl font-bold transition min-h-[44px]"
                  >
                    <Send className="w-4 h-4" />
                    {isSubmitting ? 'Sending...' : cooldown ? 'Please wait...' : 'Send Request'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default SongRequester;
