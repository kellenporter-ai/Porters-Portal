import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FileText, Mail, Phone, MapPin, Atom, Microscope, FlaskConical } from 'lucide-react';

const AP_PDFS = [
  { href: '/assets/public-docs/ap-physics-1-course-overview.pdf', label: 'Course Overview' },
  { href: '/assets/public-docs/ap-physics-1-course-at-a-glance.pdf', label: 'Course at a Glance' },
  { href: '/assets/public-docs/ap-physics-1-course-and-exam-description.pdf', label: 'Course & Exam Description' },
];

const LandingPage: React.FC = () => {
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
              Physics & Forensic Science
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-6xl">
              Porter&apos;s Portal
            </h1>
            <p className="mt-4 text-2xl font-semibold text-purple-600 dark:text-purple-400 sm:text-3xl">
              Knowledge, empowers.
            </p>
            <p className="mt-6 text-lg text-[var(--text-secondary)]">
              Mr. Porter&apos;s Physics & Forensics · Room B139, Perth Amboy High School
            </p>
            <p className="mt-4 max-w-2xl text-[var(--text-secondary)] leading-relaxed">
              Welcome! I built this Portal as the one-stop home for my classes. Students: log in with your school Google account to access class resources, assignments, and assessments. Parents and guardians: everything below is for you: course information, class procedures, and how to reach me.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent)] px-8 text-base font-bold text-[var(--text-inverted)] shadow-sm hover:bg-[var(--accent-hover)] transition-colors focus-visible:outline-offset-2 min-w-[44px]"
              >
                Student Login
              </Link>
              <a
                href="#courses"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-glass)] px-6 text-base font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors focus-visible:outline-offset-2 min-w-[44px]"
              >
                Explore Courses
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Courses */}
      <section id="courses" className="py-16 sm:py-20 lg:py-24 bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">Courses</h2>
            <p className="mt-4 text-[var(--text-secondary)]">What my students are learning this year, at a glance.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* AP Physics 1 */}
            <article className="flex flex-col rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-500/20 dark:bg-blue-500/10 sm:p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                <Atom className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-blue-700 dark:text-blue-400">AP Physics 1</h3>
              <p className="mt-3 flex-1 text-[var(--text-secondary)] leading-relaxed">
                College-level, algebra-based physics following the College Board framework: motion, forces, energy, momentum, rotation, and circuits. Students learn by doing real science: observing, building models, and testing predictions.
              </p>
              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Download resources:</p>
                <ul className="space-y-2">
                  {AP_PDFS.map((pdf) => (
                    <li key={pdf.href}>
                      <a
                        href={pdf.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${pdf.label} for AP Physics 1 (opens in new tab)`}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-500/20 transition-colors focus-visible:outline-offset-2 min-h-[44px]"
                      >
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        {pdf.label}
                        <span className="sr-only">(opens in new tab)</span>
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
              <h3 className="text-xl font-bold text-cyan-700 dark:text-cyan-400">Honors Physics</h3>
              <p className="mt-3 flex-1 text-[var(--text-secondary)] leading-relaxed">
                A deeper, faster-paced study of the core physics toolkit: motion, forces, energy, momentum, and waves. Strong emphasis on mathematical modeling and lab investigation.
              </p>
              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Download resources:</p>
                <ul className="space-y-2">
                  <li>
                    <a
                      href="/assets/public-docs/physics-syllabus.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Physics Syllabus for Honors Physics (opens in new tab)"
                      className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-semibold text-cyan-700 shadow-sm hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-900/20 dark:text-cyan-300 dark:hover:bg-cyan-500/20 transition-colors focus-visible:outline-offset-2 min-h-[44px]"
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      Physics Syllabus
                      <span className="sr-only">(opens in new tab)</span>
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
              <h3 className="text-xl font-bold text-amber-700 dark:text-amber-400">Forensic Science</h3>
              <p className="mt-3 flex-1 text-[var(--text-secondary)] leading-relaxed">
                The science behind solving crimes: fingerprints, toxicology, entomology, ballistics, and evidence analysis. Students work cases hands-on, from crime scene to conclusion.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Class Procedures */}
      <section id="procedures" className="py-16 sm:py-20 lg:py-24 bg-[var(--surface-base)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">Class Procedures</h2>
            <p className="mt-4 text-[var(--text-secondary)]">What to expect, every day.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">Cell phones (NJ law)</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">
                Cell phones must be off and away for the entire school day. This is now New Jersey state law. In my classroom, your phone goes OFF and into your assigned numbered pouch at the door, or stays OFF in your bag or backpack. A phone found in your possession during class is a violation of state law and may result in disciplinary action.
              </p>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">Seating & table groups</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">
                Students sit in assigned table groups named after famous scientists: Curie, Einstein, Newton, Lovelace, Faraday, and Hopper. Group assignments are posted on day one and stay in effect all marking period.
              </p>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">How my class learns</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">
                My class is collaborative. Students investigate, discuss, whiteboard, and present with their table group. Multiple attempts are always allowed. Mistakes are data, not disasters.
              </p>
            </article>

            <article className="rounded-2xl border border-purple-200 bg-purple-50 p-6 dark:border-purple-500/20 dark:bg-purple-500/10 sm:p-8">
              <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400">The Portal</h3>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">
                I post assignments, class resources, grades, and feedback here on the Portal. Students should check in daily.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-16 sm:py-20 lg:py-24 bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">Contact</h2>
              <p className="mt-4 text-lg text-[var(--text-secondary)]">
                Questions about class? Reach out any time.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-6 sm:p-8">
              <dl className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-text)]">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-muted)]">Teacher</dt>
                    <dd className="text-lg font-semibold text-[var(--text-primary)]">Mr. Kellen Porter, Physics & Forensic Science Teacher</dd>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-text)]">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-muted)]">Email</dt>
                    <dd>
                      <a
                        href="mailto:kellporter2@paps.net"
                        aria-label="Email Mr. Kellen Porter at kellporter2 at paps dot net"
                        className="text-lg font-semibold text-[var(--accent-text)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-offset-2 underline underline-offset-4"
                      >
                        kellporter2@paps.net
                      </a>
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-text)]">
                    <MapPin className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-muted)]">School</dt>
                    <dd className="text-lg font-semibold text-[var(--text-primary)]">Perth Amboy High School, 931 Convery Blvd, Perth Amboy, NJ 08861</dd>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-text)]">
                    <Phone className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-muted)]">Main office</dt>
                    <dd>
                      <a
                        href="tel:+17323766230"
                        aria-label="Call the main office at 7 3 2 3 7 6 6 2 3 0"
                        className="text-lg font-semibold text-[var(--accent-text)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-offset-2 underline underline-offset-4"
                      >
                        (732) 376-6230
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
