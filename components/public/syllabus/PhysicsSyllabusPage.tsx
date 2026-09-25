import React from 'react';
import {
  Zap, Mountain, Car, Orbit, Waves, Star, Lightbulb, Clock, Sparkles,
  ClipboardCheck, GraduationCap, BookOpenCheck, Mail, Info,
} from 'lucide-react';
import { useT } from '../../../lib/i18n';
import SyllabusShell from './SyllabusShell';
import SyllabusMaterials from './SyllabusMaterials';

const UNITS = [
  { code: 'P.1', icon: Zap, tint: 'text-amber-600 dark:text-amber-400', ring: 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10' },
  { code: 'P.2', icon: Mountain, tint: 'text-orange-600 dark:text-orange-400', ring: 'border-orange-200 bg-orange-50 dark:border-orange-500/20 dark:bg-orange-500/10' },
  { code: 'P.3', icon: Car, tint: 'text-rose-600 dark:text-rose-400', ring: 'border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10' },
  { code: 'P.4', icon: Orbit, tint: 'text-violet-600 dark:text-violet-400', ring: 'border-violet-200 bg-violet-50 dark:border-violet-500/20 dark:bg-violet-500/10' },
  { code: 'P.5', icon: Waves, tint: 'text-sky-600 dark:text-sky-400', ring: 'border-sky-200 bg-sky-50 dark:border-sky-500/20 dark:bg-sky-500/10' },
  { code: 'P.6', icon: Star, tint: 'text-indigo-600 dark:text-indigo-400', ring: 'border-indigo-200 bg-indigo-50 dark:border-indigo-500/20 dark:bg-indigo-500/10' },
] as const;

const GRADING_CATS = [
  { icon: ClipboardCheck, key: 'cat1' },
  { icon: GraduationCap, key: 'cat2' },
  { icon: BookOpenCheck, key: 'cat3' },
] as const;


const PhysicsSyllabusPage: React.FC = () => {
  const t = useT();

  return (
    <SyllabusShell
      badgeKey="public.syllabus.physics.badge"
      titleKey="public.syllabus.physics.title"
      subtitleKey="public.syllabus.physics.subtitle"
      introKey="public.syllabus.physics.intro"
      heroSrc="/assets/syllabi/physics-hero.jpg"
      heroAltKey="public.syllabus.heroAlt.physics"
      badgeClass="border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300"
    >
      {/* Honors / CP note */}
      <section className="border-b border-[var(--border)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="pub-reveal flex items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-5 text-sm leading-relaxed text-cyan-900 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-100 sm:items-center sm:text-base">
            <Info className="h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-300" aria-hidden="true" />
            {t('public.syllabus.physics.honorsNote')}
          </p>
        </div>
      </section>

      {/* Unit journey */}
      <section className="bg-[var(--surface-base)] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="pub-reveal mb-14 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              {t('public.syllabus.physics.journeyHeading')}
            </h2>
            <p className="mt-4 text-[var(--text-secondary)] leading-relaxed">{t('public.syllabus.physics.journeySub')}</p>
          </div>

          {/* Timeline: spine on the left (mobile) / centered spine with alternating cards (lg+) */}
          <ol className="relative">
            <span
              aria-hidden="true"
              className="absolute top-2 bottom-2 left-[22px] w-0.5 bg-gradient-to-b from-cyan-400 via-purple-400 to-indigo-500 lg:left-1/2 lg:-translate-x-1/2"
            />
            {UNITS.map((unit, i) => (
              <li
                key={unit.code}
                className={`pub-reveal relative mb-10 pl-14 last:mb-0 lg:w-1/2 lg:pl-0 ${
                  i % 2 === 0 ? 'lg:pr-14' : 'lg:ml-auto lg:pl-14'
                }`}
              >
                {/* Node on the spine */}
                <span
                  aria-hidden="true"
                  className={`absolute top-6 left-0 flex h-11 w-11 items-center justify-center rounded-full border bg-[var(--surface-raised)] shadow-md lg:left-auto ${
                    i % 2 === 0 ? 'lg:-right-[22px]' : 'lg:-left-[22px]'
                  } ${unit.ring} ${unit.tint}`}
                >
                  <unit.icon className="h-5 w-5" />
                </span>

                <article className={`rounded-2xl border p-6 shadow-sm sm:p-7 ${unit.ring}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-extrabold tracking-wide ${unit.ring} ${unit.tint}`}>
                      {unit.code}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-glass)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {t(`public.syllabus.physics.unit${i + 1}.duration`)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-[var(--text-primary)]">
                    {t(`public.syllabus.physics.unit${i + 1}.title`)}
                  </h3>
                  <blockquote className="mt-3 border-l-4 border-[var(--accent)] pl-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      {t('public.syllabus.phenomenonLabel')}
                    </p>
                    <p className="mt-1 text-[15px] font-medium italic leading-relaxed text-[var(--text-secondary)]">
                      {t(`public.syllabus.physics.unit${i + 1}.anchor`)}
                    </p>
                  </blockquote>
                  <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-secondary)]">
                    {t(`public.syllabus.physics.unit${i + 1}.summary`)}
                  </p>
                  <p className="mt-4 flex items-start gap-2 rounded-xl bg-[var(--surface-glass)] border border-[var(--border)] p-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" aria-hidden="true" />
                    <span>
                      <strong className="font-semibold text-[var(--text-primary)]">{t('public.syllabus.highlightsLabel')}: </strong>
                      {t(`public.syllabus.physics.unit${i + 1}.highlight`)}
                    </span>
                  </p>
                </article>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* How the class works */}
      <section className="border-t border-[var(--border)] bg-[var(--surface-raised)] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="pub-reveal mb-10 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              {t('public.syllabus.overviewHeading')}
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <article className="pub-reveal rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-6 sm:p-8">
              <Lightbulb className="h-6 w-6 text-purple-600 dark:text-purple-400" aria-hidden="true" />
              <p className="mt-4 leading-relaxed text-[var(--text-secondary)]">{t('public.syllabus.physics.overview.p1')}</p>
            </article>
            <article className="pub-reveal rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-6 sm:p-8">
              <GraduationCap className="h-6 w-6 text-purple-600 dark:text-purple-400" aria-hidden="true" />
              <p className="mt-4 leading-relaxed text-[var(--text-secondary)]">{t('public.syllabus.physics.overview.p2')}</p>
            </article>
          </div>

          {/* Grading */}
          <div className="pub-reveal mt-14 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              {t('public.syllabus.gradingHeading')}
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--text-secondary)]">{t('public.syllabus.physics.gradingIntro')}</p>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {GRADING_CATS.map((cat) => (
              <article key={cat.key} className="pub-reveal rounded-2xl border border-cyan-200 bg-cyan-50 p-6 dark:border-cyan-500/20 dark:bg-cyan-500/10 sm:p-7">
                <cat.icon className="h-6 w-6 text-cyan-700 dark:text-cyan-300" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-cyan-900 dark:text-cyan-100">
                  {t(`public.syllabus.physics.grading.${cat.key}.name`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-cyan-900/80 dark:text-cyan-100/80">
                  {t(`public.syllabus.physics.grading.${cat.key}.desc`)}
                </p>
              </article>
            ))}
          </div>

          {/* Materials */}
          <div className="pub-reveal mt-14 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              {t('public.syllabus.materialsSectionHeading')}
            </h2>
          </div>
          <SyllabusMaterials dotClass="bg-cyan-500" />

          {/* Contact */}
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

export default PhysicsSyllabusPage;
