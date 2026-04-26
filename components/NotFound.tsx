import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Home, ArrowLeft } from 'lucide-react';

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-purple-500/20 blur-2xl rounded-full" aria-hidden="true" />
        <div className="relative bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-5 shadow-xl">
          <Radio className="w-10 h-10 text-purple-500" aria-hidden="true" />
        </div>
      </div>

      <h1 className="text-5xl font-black text-[var(--text-primary)] mb-2 tracking-tight">404</h1>
      <p className="text-lg font-bold text-[var(--text-secondary)] mb-1">Signal Lost</p>
      <p className="text-sm text-[var(--text-tertiary)] text-center max-w-sm mb-8">
        The transmission you requested could not be located. It may have been moved, declassified, or never existed.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] rounded-xl text-sm font-bold hover:bg-[var(--surface-glass)] transition"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Go Back
        </button>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold transition shadow-lg shadow-purple-500/20"
        >
          <Home className="w-4 h-4" aria-hidden="true" /> Return to Base
        </button>
      </div>

      <div className="mt-10 flex items-center gap-2 text-[11px] text-[var(--text-muted)] font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
        ERR_TRANSMISSION_NOT_FOUND
      </div>
    </div>
  );
};

export default NotFound;
