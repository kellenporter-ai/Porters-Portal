import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FileText, Mail, Phone, MapPin, Atom, Microscope, FlaskConical } from 'lucide-react';
import { CONTENT, type PublicLang } from './landingContent';

interface LandingPageProps {
  lang: PublicLang;
}

const LandingPage: React.FC<LandingPageProps> = ({ lang }) => {
  const c = CONTENT[lang];

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
              {c.hero.badge}
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-6xl">
              Porter&apos;s Portal
            </h1>
            <p className="mt-4 text-2xl font-semibold text-purple-600 dark:text-purple-400 sm:text-3xl">
              {c.hero.motto}
            </p>
            <p className="mt-6 text-lg text-[var(--text-secondary)]">{c.hero.subtitle}</p>
            <p className="mt-4 max-w-2xl text-[var(--text-secondary)] leading-relaxed">{c.hero.body}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/login"
                aria-label={c.hero.loginBtnAria}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent)] px-8 text-base font-bold text-[var(--text-inverted)] shadow-sm hover:bg-[var(--accent-hover)] transition-colors focus-visible:outline-offset-2 min-w-[44px]"
              >
                {c.hero.loginBtn}
              </Link>
              <a
                href="#courses"
                aria-label={c.hero.coursesBtnAria}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-glass)] px-6 text-base font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors focus-visible:outline-offset-2 min-w-[44px]"
              >
                {c.hero.coursesBtn}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Courses */}
      <section id="courses" className="py-16 sm:py-20 lg:py-24 bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">{c.courses.h2}</h2>
            <p className="mt-4 text-[var(--text-secondary)]">{c.courses.sub}</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* AP Physics 1 */}
            <article className="flex flex-col rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-500/20 dark:bg-blue-500/10 sm:p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                <Atom className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-blue-700 dark:text-blue-400">{c.courses.ap.title}</h3>
              <p className="mt-3 flex-1 text-[var(--text-secondary)] leading-relaxed">{c.courses.ap.body}</p>
              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{c.courses.ap.downloadHeading}</p>
                <ul className="space-y-2">
                  {c.courses.ap.pdfs.map((pdf) => (
                    <li key={pdf.href}>
                      <a
                        href={pdf.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={c.courses.ap.downloadAria(pdf.label)}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-500/20 transition-colors focus-visible:outline-offset-2 min-h-[44px]"
                      >
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        {pdf.label}
                        <span className="sr-only">{c.courses.newTab}</span>
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
              <h3 className="text-xl font-bold text-cyan-700 dark:text-cyan-400">{c.courses.honors.title}</h3>
              <p className="mt-3 flex-1 text-[var(--text-secondary)] leading-relaxed">{c.courses.honors.body}</p>
              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{c.courses.honors.downloadHeading}</p>
                <ul className="space-y-2">
                  <li>
                    <a
                      href="/assets/public-docs/physics-syllabus.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={c.courses.honors.downloadAria}
                      className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-semibold text-cyan-700 shadow-sm hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-900/20 dark:text-cyan-300 dark:hover:bg-cyan-500/20 transition-colors focus-visible:outline-offset-2 min-h-[44px]"
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      {c.courses.honors.pdfLabel}
                      <span className="sr-only">{c.courses.newTab}</span>
                    </a>
                  </li>
                </ul>
              </div>
            </article>

            {/* Forensic Science */}
            <article className="flex flex-col rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-500/20 dark:bg-amber-500/10 sm:p-8 md:col-span-2 lg:col-span-1">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                <Microscope className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-amber-700 dark:text-amber-400">{c.courses.forensic.title}</h3>
              <p className="mt-3 flex-1 text-[var(--text-secondary)] leading-relaxed">{c.courses.forensic.body}</p>
              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{c.courses.forensic.downloadHeading}</p>
                <ul className="space-y-2">
                  <li>
                    <a
                      href="/assets/public-docs/forensic-science-syllabus.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={c.courses.forensic.downloadAria}
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-700 shadow-sm hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-500/20 transition-colors focus-visible:outline-offset-2 min-h-[44px]"
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      {c.courses.forensic.pdfLabel}
                      <span className="sr-only">{c.courses.newTab}</span>
                    </a>
                  </li>
                </ul>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Class Procedures */}
      <section id="procedures" className="py-16 sm:py-20 lg:py-24 bg-[var(--surface-base)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">{c.procedures.h2}</h2>
            <p className="mt-4 text-[var(--text-secondary)]">{c.procedures.sub}</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">{c.procedures.cells.title}</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{c.procedures.cells.body}</p>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">{c.procedures.seating.title}</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{c.procedures.seating.body}</p>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">{c.procedures.learning.title}</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{c.procedures.learning.body}</p>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">{c.procedures.portal.title}</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{c.procedures.portal.body}</p>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8 md:col-span-2">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">{c.procedures.grading.title}</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{c.procedures.grading.intro}</p>
              <ul className="mt-4 space-y-2 text-[var(--text-secondary)] leading-relaxed">
                {c.procedures.grading.tiers.map((tier) => (
                  <li key={tier.name}>
                    <strong className="text-[var(--text-primary)]">{tier.name}</strong> {tier.desc}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8 md:col-span-2">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">{c.procedures.resubmit.title}</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{c.procedures.resubmit.p1}</p>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{c.procedures.resubmit.p2}</p>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{c.procedures.resubmit.p3}</p>
            </article>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-16 sm:py-20 lg:py-24 bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">{c.contact.h2}</h2>
              <p className="mt-4 text-lg text-[var(--text-secondary)]">{c.contact.sub}</p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-6 sm:p-8">
              <dl className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-text)]">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-muted)]">{c.contact.teacherLabel}</dt>
                    <dd className="text-lg font-semibold text-[var(--text-primary)]">{c.contact.teacherValue}</dd>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-text)]">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-muted)]">{c.contact.emailLabel}</dt>
                    <dd>
                      <a
                        href="mailto:kellporter2@paps.net"
                        aria-label={c.contact.emailAria}
                        className="text-lg font-semibold text-[var(--accent-text)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-offset-2 underline underline-offset-4"
                      >
                        {c.contact.emailValue}
                      </a>
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-text)]">
                    <MapPin className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-muted)]">{c.contact.schoolLabel}</dt>
                    <dd className="text-lg font-semibold text-[var(--text-primary)]">{c.contact.schoolValue}</dd>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-text)]">
                    <Phone className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-muted)]">{c.contact.mainOfficeLabel}</dt>
                    <dd>
                      <a
                        href="tel:+17323766230"
                        aria-label={c.contact.mainOfficeAria}
                        className="text-lg font-semibold text-[var(--accent-text)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-offset-2 underline underline-offset-4"
                      >
                        {c.contact.mainOfficeValue}
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
