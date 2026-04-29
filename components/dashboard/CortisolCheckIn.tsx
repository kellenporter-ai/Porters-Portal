import React, { useState, useCallback } from 'react';
import { Heart, RotateCcw } from 'lucide-react';
import { useToast } from '../ToastProvider';

interface MoodLevel {
  key: 'very-low' | 'low' | 'normal' | 'elevated' | 'high';
  label: string;
  shortLabel: string;
  description: string;
  colorClass: string;
  ringClass: string;
  bgClass: string;
  imageUrl?: string;
}

const DEFAULT_IMAGE_URLS: Record<MoodLevel['key'], string> = {
  'very-low': '/assets/cortisol-faces/very-low.jpg',
  'low': '/assets/cortisol-faces/low.jpg',
  'normal': '/assets/cortisol-faces/normal.jpg',
  'elevated': '/assets/cortisol-faces/elevated.jpg',
  'high': '/assets/cortisol-faces/high.jpg',
};

const MOODS: MoodLevel[] = [
  {
    key: 'very-low',
    label: 'Very Low',
    shortLabel: 'Exhausted',
    description: 'Feeling fatigued or drained today',
    colorClass: 'text-blue-600 dark:text-blue-400',
    ringClass: 'ring-blue-500/50 dark:ring-blue-400/50',
    bgClass: 'bg-blue-500/10 dark:bg-blue-500/15',
  },
  {
    key: 'low',
    label: 'Low',
    shortLabel: 'Calm',
    description: 'Relaxed but a bit low on energy',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    ringClass: 'ring-emerald-500/50 dark:ring-emerald-400/50',
    bgClass: 'bg-emerald-500/10 dark:bg-emerald-500/15',
  },
  {
    key: 'normal',
    label: 'Normal',
    shortLabel: 'Balanced',
    description: 'Feeling steady and ready to learn',
    colorClass: 'text-purple-600 dark:text-purple-400',
    ringClass: 'ring-purple-500/50 dark:ring-purple-400/50',
    bgClass: 'bg-purple-500/10 dark:bg-purple-500/15',
  },
  {
    key: 'elevated',
    label: 'Elevated',
    shortLabel: 'Anxious',
    description: 'A bit on edge or worried today',
    colorClass: 'text-amber-600 dark:text-amber-400',
    ringClass: 'ring-amber-500/50 dark:ring-amber-400/50',
    bgClass: 'bg-amber-500/10 dark:bg-amber-500/15',
  },
  {
    key: 'high',
    label: 'High',
    shortLabel: 'Stressed',
    description: 'Feeling overwhelmed or panicked',
    colorClass: 'text-red-600 dark:text-red-400',
    ringClass: 'ring-red-500/50 dark:ring-red-400/50',
    bgClass: 'bg-red-500/10 dark:bg-red-500/15',
  },
];

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

interface CortisolCheckInProps {
  onSubmit?: (level: MoodLevel['key']) => void | Promise<void>;
  defaultImageUrls?: Partial<Record<MoodLevel['key'], string>>;
  lastSubmitted?: string | null;
  lastSubmittedAt?: string | null;
  onClear?: () => void | Promise<void>;
}

const CortisolCheckIn: React.FC<CortisolCheckInProps> = ({
  onSubmit,
  defaultImageUrls = {},
  lastSubmitted,
  lastSubmittedAt,
  onClear,
}) => {
  const [selected, setSelected] = useState<MoodLevel['key'] | null>(
    (lastSubmitted as MoodLevel['key']) ?? null
  );
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const toast = useToast();

  const handleSelect = useCallback(
    async (mood: MoodLevel) => {
      if (submitting) return;
      setSelected(mood.key);
      setSubmitting(true);
      try {
        await onSubmit?.(mood.key);
        setJustSubmitted(true);
        setTimeout(() => setJustSubmitted(false), 2000);
      } catch (err) {
        console.error('Wellness check-in failed:', err);
        toast.error('Could not save your check-in. Please try again.');
        setSelected((lastSubmitted as MoodLevel['key']) ?? null);
      } finally {
        setSubmitting(false);
      }
    },
    [onSubmit, submitting, lastSubmitted, toast]
  );

  const handleClear = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onClear?.();
      setSelected(null);
    } catch {
      /* surfaced upstream */
    } finally {
      setSubmitting(false);
    }
  }, [onClear, submitting]);

  const activeMood = MOODS.find(m => m.key === selected);
  const timeStr = formatTime(lastSubmittedAt);

  return (
    <section
      className="relative rounded-[24px] p-5 sm:p-6 bg-[var(--surface-glass)] border border-[var(--border)]"
      aria-label="Private wellness check-in"
    >
      <div className="flex items-center gap-3 mb-4">
        <Heart className="w-4 h-4 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
        <span className="text-[10px] font-black tracking-[0.32em] uppercase text-[var(--text-tertiary)]">
          Status Check
        </span>
        <span className="flex-1 h-px bg-[var(--border)]" />
        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
          Private
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 sm:gap-3">
        {MOODS.map((mood) => {
          const isActive = selected === mood.key;
          const imageUrl = defaultImageUrls[mood.key] ?? DEFAULT_IMAGE_URLS[mood.key];
          return (
            <button
              key={mood.key}
              type="button"
              onClick={() => handleSelect(mood)}
              disabled={submitting}
              aria-pressed={isActive}
              aria-label={`${mood.label}: ${mood.description}`}
              className={`
                group relative flex flex-col items-center gap-2
                transition-all duration-200
                focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded-2xl
                ${submitting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div
                className={`
                  relative w-12 h-12 sm:w-14 sm:h-14 rounded-full
                  flex items-center justify-center
                  transition-all duration-200
                  ${isActive
                    ? `ring-2 ${mood.ringClass} ${mood.bgClass} scale-110`
                    : 'bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] ring-1 ring-[var(--border)]'
                  }
                `}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={mood.label}
                    className="w-full h-full rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span
                    className={`text-lg sm:text-xl font-black ${isActive ? mood.colorClass : 'text-[var(--text-muted)]'}`}
                    aria-hidden="true"
                  >
                    {mood.key === 'very-low' && '😴'}
                    {mood.key === 'low' && '😌'}
                    {mood.key === 'normal' && '🙂'}
                    {mood.key === 'elevated' && '😰'}
                    {mood.key === 'high' && '😵'}
                  </span>
                )}
                {isActive && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface-glass)]" />
                )}
              </div>
              <span
                className={`
                  text-[10px] font-bold uppercase tracking-wider
                  transition-colors duration-200
                  ${isActive ? mood.colorClass : 'text-[var(--text-muted)]'}
                `}
              >
                {mood.shortLabel}
              </span>
            </button>
          );
        })}
      </div>

      {activeMood && (
        <div
          className={`
            mt-4 flex items-center justify-center gap-2
            text-xs font-medium
            transition-all duration-300
            ${activeMood.colorClass}
          `}
          role="status"
          aria-live="polite"
        >
          {justSubmitted ? (
            <span className="flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Updated{timeStr ? ` at ${timeStr}` : ''}
            </span>
          ) : (
            <>
              <span>{activeMood.description}</span>
              {timeStr && (
                <span className="text-[10px] text-[var(--text-muted)]">
                  · {timeStr}
                </span>
              )}
            </>
          )}
          {onClear && (
            <button
              type="button"
              onClick={handleClear}
              disabled={submitting}
              aria-label="Clear status"
              className="ml-1 p-1 rounded-md hover:bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {!activeMood && (
        <p className="mt-4 text-center text-[11px] text-[var(--text-muted)]">
          Tap an icon to let Mr. Porter know how you&apos;re doing today. Only your teacher sees this.
        </p>
      )}
    </section>
  );
};

export default CortisolCheckIn;
