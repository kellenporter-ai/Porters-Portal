import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import type { WriteStatus } from '../lib/persistentWrite';

// Augment Window for custom portal events
declare global {
  interface WindowEventMap {
    'portal-storage-unavailable': CustomEvent<{ message: string }>;
    'portal-connectivity-degraded': CustomEvent;
  }
}

interface SaveStatusIndicatorProps {
  status: WriteStatus;
  isOnline?: boolean;
  isAssessment?: boolean;
  errorSince?: number | null;
  sessionInvalid?: boolean;
}

const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({
  status,
  isOnline = true,
  isAssessment = false,
  errorSince = null,
  sessionInvalid = false,
}) => {
  const [visible, setVisible] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [errorDurationMs, setErrorDurationMs] = useState(0);
  const [assessmentSessionInvalid, setAssessmentSessionInvalid] = useState(false);

  useEffect(() => {
    const handler = () => setStorageUnavailable(true);
    window.addEventListener('portal-storage-unavailable', handler);
    return () => window.removeEventListener('portal-storage-unavailable', handler);
  }, []);

  // Force visibility on connectivity degradation (from metrics snapshot failures)
  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener('portal-connectivity-degraded', handler);
    return () => window.removeEventListener('portal-connectivity-degraded', handler);
  }, []);

  // Listen for assessment session invalidation (missing/expired token)
  useEffect(() => {
    const handler = () => setAssessmentSessionInvalid(true);
    window.addEventListener('portal-assessment-session-invalid', handler);
    return () => window.removeEventListener('portal-assessment-session-invalid', handler);
  }, []);

  // Track how long we've been in error state
  useEffect(() => {
    if (status !== 'error' || !errorSince) {
      setErrorDurationMs(0);
      return;
    }
    setErrorDurationMs(Date.now() - errorSince);
    const interval = setInterval(() => {
      setErrorDurationMs(Date.now() - errorSince);
    }, 5000);
    return () => clearInterval(interval);
  }, [status, errorSince]);

  useEffect(() => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

    if (status === 'idle') {
      setVisible(false);
      return;
    }

    setVisible(true);

    // Auto-fade "saved" after 3 seconds (skip during assessments — keep visible for reassurance)
    if (status === 'saved' && !isAssessment) {
      const timer = setTimeout(() => setVisible(false), 3000);
      fadeTimerRef.current = timer;
      return () => clearTimeout(timer);
    }
    // If assessment + saved, stay visible indefinitely (next status change will update it)

    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isAssessment]);

  if (!visible && status !== 'error' && status !== 'retrying') return null;

  const prolongedError = errorDurationMs > 120_000;

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
      icon: <AlertTriangle className={`w-3 h-3 ${prolongedError ? 'animate-pulse' : ''}`} />,
      text: assessmentSessionInvalid || sessionInvalid
        ? 'Session expired — refresh to restore your work'
        : prolongedError
          ? 'Can\'t save to server — DO NOT refresh or close this tab! Work is only in this tab.'
          : 'Save failed — work is safe in this tab only',
      className: prolongedError || assessmentSessionInvalid || sessionInvalid
        ? 'text-red-600 dark:text-red-400 bg-red-500/20 border-red-500/40 animate-pulse'
        : 'text-red-300 bg-red-500/10 border-red-500/20',
    },
    idle: { icon: null, text: '', className: '' },
  }[status];

  const isError = status === 'error' || status === 'retrying';

  return (
    <>
      <div
        role="status"
        aria-live={isError ? 'assertive' : 'polite'}
        className={`flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest transition-opacity duration-300 ${config.className} ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        {config.icon}
        {config.text}
      </div>
      {!isOnline && isAssessment && (
        <div
          role="alert"
          className="flex items-center gap-1.5 text-[11.5px] font-bold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 uppercase tracking-widest"
        >
          <AlertTriangle className="w-3 h-3" />
          Offline — work saved locally
        </div>
      )}
      {storageUnavailable && isAssessment && (
        <div
          role="alert"
          className="flex items-center gap-1.5 text-[11.5px] font-bold text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20 uppercase tracking-widest"
        >
          <Loader2 className="w-3 h-3" />
          Saving to server only
        </div>
      )}
      {(assessmentSessionInvalid || sessionInvalid) && isAssessment && (
        <div
          role="alert"
          className="flex items-center gap-1.5 text-[11.5px] font-bold text-red-600 dark:text-red-400 bg-red-500/20 px-2.5 py-1 rounded-full border border-red-500/40 uppercase tracking-widest animate-pulse"
        >
          <AlertTriangle className="w-3 h-3" />
          Session expired — refresh to restore work
        </div>
      )}
    </>
  );
};

export default SaveStatusIndicator;
