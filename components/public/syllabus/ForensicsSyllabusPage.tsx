import React from 'react';
import {
  Eye, MapPin, Fingerprint, ScanSearch, Droplets, Dna, Leaf, Bug, Crosshair,
  Target, ClipboardCheck, BookOpenCheck, CheckCircle2, Mail,
} from 'lucide-react';
import { useT, useInterpolate } from '../../../lib/i18n';
import SyllabusShell from './SyllabusShell';
import SyllabusMaterials from './SyllabusMaterials';

const UNITS = [
  { icon: Eye, hasHighlight: false },
  { icon: MapPin, hasHighlight: false },
  { icon: Fingerprint, hasHighlight: false },
  { icon: ScanSearch, hasHighlight: false },
  { icon: Droplets, hasHighlight: true },
  { icon: Dna, hasHighlight: true },
  { icon: Leaf, hasHighlight: true },
  { icon: Bug, hasHighlight: true },
  { icon: Crosshair, hasHighlight: true },
] as const;

/** Units 1–3 run in the fall (with the midterm after unit 3); 4–9 in the spring. */
const FALL_UNIT_COUNT = 3;
const GOALS = [1, 2, 3, 4] as const;

const GRADING_CATS = [
  { icon: ClipboardCheck, key: 'cat1' },
  { icon: BookOpenCheck, key: 'cat2' },
] as const;

const ForensicsSyllabusPage: React.FC = () => {
  const t = useT();
  const interpolate = useInterpolate();

  const unitCard = (index: number) => {
    const unit = UNITS[index];
    return (
      <article
        key={index}
        className="pub-reveal relative rounded-2xl border border-amber-300/70 bg-amber-50 p-6 shadow-sm dark:border-amber-500/25 dark:bg-amber-500/10 sm:p-7"
      >
        {/* evidence-tag corner notch */}
        <span
          aria-hidden="true"
          className="absolute -top-px right-6 h-3 w-10 rounded-b-md bg-amber-300/80 dark:bg-amber-500/50"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/60 bg-white px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-800 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
            {interpolate('public.syllabus.unitNumber', { n: index + 1 })}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-amber-500/60 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
            {t(`public.syllabus.forensics.unit${index + 1}.duration`)}
          </span>
        </div>
        <h3 className="mt-4 flex items-center gap-2.5 text-xl font-bold text-[var(--text-primary)]">
          <unit.icon className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          {t(`public.syllabus.forensics.unit${index + 1}.title`)}
        </h3>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          {t(`public.syllabus.forensics.unit${index + 1}.summary`)}
        </p>
        {unit.hasHighlight && (
          <p className="mt-4 rounded-xl border border-dashed border-amber-500/50 bg-white/60 p-3 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <strong className="font-semibold">{t('public.syllabus.highlightsLabel')}: </strong>
            {t(`public.syllabus.forensics.unit${index + 1}.highlight`)}
          </p>
        )}
      </article>
    );
  };

  return (
    <SyllabusShell
      badgeKey="public.syllabus.forensics.badge"
      titleKey="public.syllabus.forensics.title"
      subtitleKey="public.syllabus.forensics.subtitle"
      introKey="public.syllabus.forensics.intro"
      heroSrc="/assets/syllabi/forensics-hero.jpg"
      heroAltKey="public.syllabus.heroAlt.forensics"
      badgeClass="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200"
    >
      {/* Goals */}
      <section className="border-b border-[var(--border)] bg-[var(--surface-raised)] py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="pub-reveal mb-8 max-w-2xl">
            <h2 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              <Target className="h-8 w-8 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              {t('public.syllabus.forensics.goalsHeading')}
            </h2>
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {GOALS.map((n) => (
              <li
                key={n}
                className="pub-reveal flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-5 leading-relaxed text-[var(--text-secondary)]"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                {t(`public.syllabus.forensics.goal${n}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Case file: units by semester */}
      <section className="bg-[var(--surface-base)] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="pub-reveal mb-12 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              {t('public.syllabus.unitsHeading')}
            </h2>
          </div>

          {/* Fall */}
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-full bg-amber-100 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
              {t('public.syllabus.semesterFall')}
            </span>
            <span aria-hidden="true" className="h-px flex-1 bg-amber-300/60 dark:bg-amber-500/20" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: FALL_UNIT_COUNT }, (_, i) => unitCard(i))}
          </div>

          {/* Spring */}
          <div className="mt-12 mb-4 flex items-center gap-3">
            <span className="rounded-full bg-emerald-100 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
              {t('public.syllabus.semesterSpring')}
            </span>
            <span aria-hidden="true" className="h-px flex-1 bg-emerald-300/60 dark:bg-emerald-500/20" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: UNITS.length - FALL_UNIT_COUNT }, (_, i) => unitCard(i + FALL_UNIT_COUNT))}
          </div>
        </div>
      </section>

      {/* Grading + materials + contact */}
      <section className="border-t border-[var(--border)] bg-[var(--surface-raised)] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="pub-reveal max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              {t('public.syllabus.gradingHeading')}
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--text-secondary)]">{t('public.syllabus.forensics.gradingIntro')}</p>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {GRADING_CATS.map((cat) => (
              <article key={cat.key} className="pub-reveal rounded-2xl border border-amber-300/70 bg-amber-50 p-6 dark:border-amber-500/25 dark:bg-amber-500/10 sm:p-7">
                <cat.icon className="h-6 w-6 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-amber-900 dark:text-amber-100">
                  {t(`public.syllabus.forensics.grading.${cat.key}.name`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                  {t(`public.syllabus.forensics.grading.${cat.key}.desc`)}
                </p>
              </article>
            ))}
          </div>
          <p className="pub-reveal mt-6 rounded-2xl border border-dashed border-amber-500/60 bg-amber-50/70 p-5 text-sm leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-100 sm:text-base">
            {t('public.syllabus.forensics.grading.floor')}
          </p>

          <div className="pub-reveal mt-14 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              {t('public.syllabus.materialsSectionHeading')}
            </h2>
          </div>
          <SyllabusMaterials dotClass="bg-amber-500" />

          <div className="pub-reveal mt-14 rounded-3xl border border-[var(--border)] bg-[var(--surface-glass)] p-8 text-center sm:p-12">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              {t('public.syllabus.contactHeading')}
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[var(--text-secondary)]">
              {t('public.syllabus.contactBody')}
            </p>
            <a
              href="mailto:kellporter2@paps.net"
              className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-8 text-base font-bold text-[var(--text-inverted)] shadow-sm hover:bg-[var(--accent-hover)] transition-colors min-w-[44px] focus-visible:outline-offset-2"
            >
              <Mail className="h-5 w-5" aria-hidden="true" />
              {t('public.contact.emailValue')}
            </a>
          </div>
        </div>
      </section>
    </SyllabusShell>
  );
};

export default ForensicsSyllabusPage;
