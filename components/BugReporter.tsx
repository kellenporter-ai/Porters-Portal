
import React, { useState } from 'react';
import { Bug, X, Send, CheckCircle } from 'lucide-react';
import { User } from '../types';
import { dataService } from '../services/dataService';

interface BugReporterProps {
  user: User;
}

const BugReporter: React.FC<BugReporterProps> = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'bug' | 'feature' | 'other'>('bug');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setIsSubmitting(true);
    try {
      await dataService.submitBugReport({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        category,
        description: description.trim(),
        page: window.location.pathname,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });
      setSubmitted(true);
      setTimeout(() => { setSubmitted(false); setIsOpen(false); setDescription(''); }, 2000);
    } catch {
      // silent fail
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-40 p-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-full text-gray-400 hover:text-white transition-all shadow-lg backdrop-blur-md group"
        title="Report a bug"
      >
        <Bug className="w-4 h-4 group-hover:text-amber-400 transition" />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setIsOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-[#1a1b26] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300"
            onClick={e => e.stopPropagation()}
          >
            {submitted ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white">Report Submitted</h3>
                <p className="text-sm text-gray-400 mt-1">Thanks for helping improve Porter Portal!</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Bug className="w-5 h-5 text-amber-400" /> Report an Issue
                  </h3>
                  <button onClick={() => setIsOpen(false)} className="p-1 text-gray-400 hover:text-white transition">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="flex gap-2">
                    {(['bug', 'feature', 'other'] as const).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold transition border ${
                          category === cat
                            ? 'bg-purple-600/60 text-white border-purple-500/50'
                            : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {cat === 'bug' ? 'Bug' : cat === 'feature' ? 'Feature Request' : 'Other'}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe what happened or what you'd like to see..."
                    rows={4}
                    maxLength={1000}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition resize-none"
                    autoFocus
                  />
                  <p className="text-[10px] text-gray-600 text-right">{description.length}/1000</p>

                  <button
                    onClick={handleSubmit}
                    disabled={!description.trim() || isSubmitting}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl font-bold transition"
                  >
                    <Send className="w-4 h-4" />
                    {isSubmitting ? 'Submitting...' : 'Submit Report'}
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

export default BugReporter;
