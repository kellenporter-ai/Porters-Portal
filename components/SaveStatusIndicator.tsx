import React, { useEffect, useState } from 'react';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import type { WriteStatus } from '../lib/persistentWrite';

interface SaveStatusIndicatorProps {
  status: WriteStatus;
  isOnline?: boolean;
  isAssessment?: boolean;
}

const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({
  status,
  isOnline = true,
  isAssessment = false,
}) => {
  const [visible, setVisible] = useState(false);
  const [fadeTimer, setFadeTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fadeTimer) clearTimeout(fadeTimer);

    if (status === 'idle') {
      setVisible(false);
      return;
    }

    setVisible(true);

    // Auto-fade "saved" after 3 seconds
    if (status === 'saved') {
      const timer = setTimeout(() => setVisible(false), 3000);
      setFadeTimer(timer);
      return () => clearTimeout(timer);
    }

    return () => {
      if (fadeTimer) clearTimeout(fadeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!visible && status !== 'error' && status !== 'retrying') return null;

  const config = {
    saving: {
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      text: 'Saving...',
      className: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
    },
    saved: {
      icon: <Check className="w-3 h-3" />,
      text: 'Saved',
      className: 'text-green-300 bg-green-500/10 border-green-500/20',
    },
    retrying: {
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      text: 'Retrying save...',
      className: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    },
    error: {
      icon: <AlertTriangle className="w-3 h-3" />,
      text: 'Save failed \u2014 work backed up locally',
      className: 'text-red-300 bg-red-500/10 border-red-500/20',
    },
    idle: { icon: null, text: '', className: '' },
  }[status];

  const isError = status === 'error' || status === 'retrying';

  return (
    <>
      <div
        role="status"
        aria-live={isError ? 'assertive' : 'polite'}
        className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest transition-opacity duration-300 ${config.className} ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        {config.icon}
        {config.text}
      </div>
      {!isOnline && isAssessment && (
        <div
          role="alert"
          className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 uppercase tracking-widest"
        >
          <AlertTriangle className="w-3 h-3" />
          Offline — work saved locally
        </div>
      )}
    </>
  );
};

export default SaveStatusIndicator;
