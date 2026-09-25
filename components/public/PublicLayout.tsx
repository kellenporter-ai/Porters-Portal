import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, Languages } from 'lucide-react';
import PortalLogo from '../PortalLogo';
import { useT, useLocale, LOCALE_LABELS, type Locale } from '../../lib/i18n';

interface PublicLayoutProps {
  children: React.ReactNode;
  /** When false (sub-pages), hides the landing-page section anchor nav. */
  sectionNav?: boolean;
}

const OTHER_LOCALE: Record<Locale, Locale> = { en: 'es', es: 'en' };

const PublicLayout: React.FC<PublicLayoutProps> = ({ children, sectionNav = true }) => {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const otherLocale = OTHER_LOCALE[locale];

  const navItems = sectionNav
    ? [
        { label: t('public.nav.welcome'), href: '#welcome' },
        { label: t('public.nav.courses'), href: '#courses' },
        { label: t('public.nav.procedures'), href: '#procedures' },
        { label: t('public.nav.contact'), href: '#contact' },
      ]
    : [];

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setMobileOpen(false);
  };

  const languageToggle = (
    <button
      type="button"
      onClick={() => setLocale(otherLocale)}
      aria-label={t('public.nav.toggleAria')}
      lang={otherLocale}
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors min-h-[44px] focus-visible:outline-offset-2"
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      {LOCALE_LABELS[otherLocale]}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col bg-surface-base text-[var(--text-primary)] font-sans">
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border)] bg-[var(--surface-glass)]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-3 focus-visible:outline-offset-4">
              <PortalLogo size={36} />
              <span className="text-lg font-bold tracking-tight text-[var(--text-primary)]">Porter&apos;s Portal</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item.href)}
                  className="px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition-colors focus-visible:outline-offset-2 min-h-[44px] flex items-center"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <Link
                to="/login"
                aria-label={t('public.nav.login')}
                className="hidden md:inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--text-inverted)] hover:bg-[var(--accent-hover)] transition-colors min-h-[44px] focus-visible:outline-offset-2"
              >
                {t('public.nav.login')}
              </Link>

              <div className="hidden md:block">{languageToggle}</div>

              <button
                type="button"
                onClick={() => setMobileOpen((prev) => !prev)}
                aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav"
                className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors focus-visible:outline-offset-2"
              >
                {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>

        {mobileOpen && (
          <div id="mobile-nav" className="md:hidden border-t border-[var(--border)] bg-[var(--surface-glass)]">
            <nav aria-label="Mobile" className="mx-auto max-w-6xl px-4 py-3 space-y-1">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item.href)}
                  className="block px-3 py-3 text-base font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] rounded-lg transition-colors min-h-[44px] flex items-center"
                >
                  {item.label}
                </a>
              ))}
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="mt-2 flex items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-3 text-base font-bold text-[var(--text-inverted)] hover:bg-[var(--accent-hover)] transition-colors min-h-[44px] focus-visible:outline-offset-2"
              >
                {t('public.nav.login')}
              </Link>
              <div onClick={() => setMobileOpen(false)}>{languageToggle}</div>
            </nav>
          </div>
        )}
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--surface-sunken)] py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[var(--text-secondary)]">
          <p>{t('public.footer.schoolAndRoom')}</p>
          <a href="/privacy" className="hover:text-[var(--text-primary)] transition-colors focus-visible:outline-offset-2 underline underline-offset-4">
            {t('public.footer.privacy')}
          </a>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
