import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FileText, Mail, Phone, MapPin, Atom, Microscope, FlaskConical, ArrowRight } from 'lucide-react';
import { useT, useInterpolate } from '../../lib/i18n';

const AP_PDFS = [
  { href: '/assets/public-docs/ap-physics-1-course-overview.pdf', labelKey: 'public.courses.ap.pdf1.label' },
  { href: '/assets/public-docs/ap-physics-1-course-at-a-glance.pdf', labelKey: 'public.courses.ap.pdf2.label' },
  { href: '/assets/public-docs/ap-physics-1-course-and-exam-description.pdf', labelKey: 'public.courses.ap.pdf3.label' },
];

const GRADING_TIERS = [1, 2, 3, 4, 5] as const;

const LandingPage: React.FC = () => {
  const t = useT();
  const interpolate = useInterpolate();

  return (
    <>
      {/* Hero */}
      <section
        id="welcome"
        className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--surface-base)]"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="absolute top-1/2 -left-24 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-glass)] px-4 py-1.5 text-sm font-medium text-[var(--text-secondary)]">
              <Atom className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden="true" />
              {t('public.hero.badge')}
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-6xl">
              Porter&apos;s Portal
            </h1>
            <p className="mt-4 text-2xl font-semibold text-purple-600 dark:text-purple-400 sm:text-3xl">
              {t('public.hero.motto')}
            </p>
            <p className="mt-6 text-lg text-[var(--text-secondary)]">{t('public.hero.subtitle')}</p>
            <p className="mt-4 max-w-2xl text-[var(--text-secondary)] leading-relaxed">{t('public.hero.body')}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/login"
                aria-label={t('public.hero.loginBtnAria')}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent)] px-8 text-base font-bold text-[var(--text-inverted)] shadow-sm hover:bg-[var(--accent-hover)] transition-colors focus-visible:outline-offset-2 min-w-[44px]"
              >
                {t('public.hero.loginBtn')}
              </Link>
              <a
                href="#courses"
                aria-label={t('public.hero.coursesBtnAria')}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-glass)] px-6 text-base font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors focus-visible:outline-offset-2 min-w-[44px]"
              >
                {t('public.hero.coursesBtn')}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Courses */}
      <section id="courses" className="py-16 sm:py-20 lg:py-24 bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">{t('public.courses.h2')}</h2>
            <p className="mt-4 text-[var(--text-secondary)]">{t('public.courses.sub')}</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* AP Physics 1 */}
            <article className="flex flex-col rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-500/20 dark:bg-blue-500/10 sm:p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                <Atom className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-blue-700 dark:text-blue-400">{t('public.courses.ap.title')}</h3>
              <p className="mt-3 flex-1 text-[var(--text-secondary)] leading-relaxed">{t('public.courses.ap.body')}</p>
              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{t('public.courses.ap.downloadHeading')}</p>
                <ul className="space-y-2">
                  {AP_PDFS.map((pdf) => (
                    <li key={pdf.href}>
                      <a
                        href={pdf.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={interpolate('public.courses.ap.downloadAria', { label: t(pdf.labelKey) })}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-500/20 transition-colors focus-visible:outline-offset-2 min-h-[44px]"
                      >
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        {t(pdf.labelKey)}
                        <span className="sr-only">{t('public.courses.newTab')}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </article>

            {/* Honors Physics */}
            <article className="flex flex-col rounded-2xl border border-cyan-200 bg-cyan-50 p-6 dark:border-cyan-500/20 dark:bg-cyan-500/10 sm:p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400">
                <FlaskConical className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-cyan-700 dark:text-cyan-400">{t('public.courses.honors.title')}</h3>
              <p className="mt-3 flex-1 text-[var(--text-secondary)] leading-relaxed">{t('public.courses.honors.body')}</p>
              <div className="mt-6">
                <Link
                  to="/syllabus/physics"
                  className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-white px-4 py-2.5 text-sm font-bold text-cyan-700 shadow-sm hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-900/20 dark:text-cyan-300 dark:hover:bg-cyan-500/20 transition-colors focus-visible:outline-offset-2 min-h-[44px]"
                >
                  {t('public.courses.honors.syllabusLink')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </article>

            {/* Forensic Science */}
            <article className="flex flex-col rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-500/20 dark:bg-amber-500/10 sm:p-8 md:col-span-2 lg:col-span-1">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                <Microscope className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-amber-700 dark:text-amber-400">{t('public.courses.forensic.title')}</h3>
              <p className="mt-3 flex-1 text-[var(--text-secondary)] leading-relaxed">{t('public.courses.forensic.body')}</p>
              <div className="mt-6">
                <Link
                  to="/syllabus/forensics"
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-4 py-2.5 text-sm font-bold text-amber-700 shadow-sm hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-500/20 transition-colors focus-visible:outline-offset-2 min-h-[44px]"
                >
                  {t('public.courses.forensic.syllabusLink')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Class Procedures */}
      <section id="procedures" className="py-16 sm:py-20 lg:py-24 bg-[var(--surface-base)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">{t('public.procedures.h2')}</h2>
            <p className="mt-4 text-[var(--text-secondary)]">{t('public.procedures.sub')}</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">{t('public.procedures.cells.title')}</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{t('public.procedures.cells.body')}</p>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">{t('public.procedures.seating.title')}</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{t('public.procedures.seating.body')}</p>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">{t('public.procedures.learning.title')}</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{t('public.procedures.learning.body')}</p>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">{t('public.procedures.portal.title')}</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{t('public.procedures.portal.body')}</p>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8 md:col-span-2">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">{t('public.procedures.grading.title')}</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{t('public.procedures.grading.intro')}</p>
              <ul className="mt-4 space-y-2 text-[var(--text-secondary)] leading-relaxed">
                {GRADING_TIERS.map((tier) => (
                  <li key={tier}>
                    <strong className="text-[var(--text-primary)]">{t(`public.procedures.grading.tier${tier}.name`)}</strong>{' '}
                    {t(`public.procedures.grading.tier${tier}.desc`)}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8 md:col-span-2">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">{t('public.procedures.resubmit.title')}</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{t('public.procedures.resubmit.p1')}</p>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{t('public.procedures.resubmit.p2')}</p>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{t('public.procedures.resubmit.p3')}</p>
            </article>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-16 sm:py-20 lg:py-24 bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">{t('public.contact.h2')}</h2>
              <p className="mt-4 text-lg text-[var(--text-secondary)]">{t('public.contact.sub')}</p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-6 sm:p-8">
              <dl className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-text)]">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-muted)]">{t('public.contact.teacherLabel')}</dt>
                    <dd className="text-lg font-semibold text-[var(--text-primary)]">{t('public.contact.teacherValue')}</dd>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-text)]">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-muted)]">{t('public.contact.emailLabel')}</dt>
                    <dd>
                      <a
                        href="mailto:kellporter2@paps.net"
                        aria-label={t('public.contact.emailAria')}
                        className="text-lg font-semibold text-[var(--accent-text)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-offset-2 underline underline-offset-4"
                      >
                        {t('public.contact.emailValue')}
                      </a>
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-text)]">
                    <MapPin className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-muted)]">{t('public.contact.schoolLabel')}</dt>
                    <dd className="text-lg font-semibold text-[var(--text-primary)]">{t('public.contact.schoolValue')}</dd>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-text)]">
                    <Phone className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-muted)]">{t('public.contact.mainOfficeLabel')}</dt>
                    <dd>
                      <a
                        href="tel:+17323766230"
                        aria-label={t('public.contact.mainOfficeAria')}
                        className="text-lg font-semibold text-[var(--accent-text)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-offset-2 underline underline-offset-4"
                      >
                        {t('public.contact.mainOfficeValue')}
                      </a>
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default LandingPage;
