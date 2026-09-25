import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, User } from 'lucide-react';
import { useT } from '../../../lib/i18n';
import { usePublicReveal } from '../usePublicReveal';

interface SyllabusShellProps {
  badgeKey: string;
  titleKey: string;
  subtitleKey: string;
  introKey: string;
  heroSrc: string;
  heroAltKey: string;
  /** Accent classes for the badge chip, e.g. 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:...' */
  badgeClass: string;
  children: React.ReactNode;
}

/**
 * Shared hero + chrome for the public syllabus pages. Every string comes from
 * the lib/i18n dictionaries via key — no hardcoded copy.
 */
const SyllabusShell: React.FC<SyllabusShellProps> = ({
  badgeKey,
  titleKey,
  subtitleKey,
  introKey,
  heroSrc,
  heroAltKey,
  badgeClass,
  children,
}) => {
  const t = useT();
  const rootRef = usePublicReveal<HTMLDivElement>();

  return (
    <div ref={rootRef}>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--surface-base)]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="absolute top-1/2 -left-24 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pt-10 pb-12 sm:px-6 lg:px-8 lg:pt-14">
          <Link
            to="/#courses"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors min-h-[44px] focus-visible:outline-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('public.syllabus.backToCourses')}
          </Link>

          <div className="mt-6 max-w-3xl">
            <p className={`mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold ${badgeClass}`}>
              {t(badgeKey)}
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl">
              {t(titleKey)}
            </h1>
            <p className="mt-4 text-2xl font-semibold text-purple-600 dark:text-purple-400 sm:text-3xl">
              {t(subtitleKey)}
            </p>
            <p className="mt-6 max-w-3xl text-lg text-[var(--text-secondary)] leading-relaxed">{t(introKey)}</p>
            <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
              <User className="h-4 w-4" aria-hidden="true" />
              {t('public.syllabus.teacherLine')}
            </p>
          </div>

          <figure className="pub-reveal mt-10 overflow-hidden rounded-3xl border border-[var(--border)] shadow-xl max-h-[440px]">
            <img
              src={heroSrc}
              alt={t(heroAltKey)}
              className="h-full w-full object-cover object-center"
              loading="eager"
              width={1376}
              height={768}
            />
          </figure>
        </div>
      </section>

      {children}
    </div>
  );
};

export default SyllabusShell;
