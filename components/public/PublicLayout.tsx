import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import PortalLogo from '../PortalLogo';
import { CONTENT, type PublicLang } from './landingContent';

interface PublicLayoutProps {
  children: React.ReactNode;
  lang: PublicLang;
}

const PublicLayout: React.FC<PublicLayoutProps> = ({ children, lang }) => {
  const c = CONTENT[lang];
  const isEs = lang === 'es';
  const toggleHref = isEs ? '/' : '/es';
  const toggleLabel = isEs ? 'English' : 'Español';

  const navItems = [
    { label: c.nav.welcome, href: '#welcome' },
    { label: c.nav.courses, href: '#courses' },
    { label: c.nav.procedures, href: '#procedures' },
    { label: c.nav.contact, href: '#contact' },
  ];

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

  return (
    <div className="min-h-screen flex flex-col bg-surface-base text-[var(--text-primary)] font-sans">
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border)] bg-[var(--surface-glass)]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link to={isEs ? '/es' : '/'} className="flex items-center gap-3 focus-visible:outline-offset-4">
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
                aria-label={c.nav.login}
                className="hidden md:inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--text-inverted)] hover:bg-[var(--accent-hover)] transition-colors min-h-[44px] focus-visible:outline-offset-2"
              >
                {c.nav.login}
              </Link>

              <Link
                to={toggleHref}
                aria-label={c.nav.toggleAria}
                lang={isEs ? 'en' : 'es'}
                className="hidden md:inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors min-h-[44px] focus-visible:outline-offset-2"
              >
                {toggleLabel}
              </Link>

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
                {c.nav.login}
              </Link>
              <Link
                to={toggleHref}
                onClick={() => setMobileOpen(false)}
                aria-label={c.nav.toggleAria}
                lang={isEs ? 'en' : 'es'}
                className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-transparent px-4 py-3 text-base font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors min-h-[44px] focus-visible:outline-offset-2"
              >
                {toggleLabel}
              </Link>
            </nav>
          </div>
        )}
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--surface-sunken)] py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[var(--text-secondary)]">
          <p>{c.footer.schoolAndRoom}</p>
          <a href={c.footer.privacyHref} className="hover:text-[var(--text-primary)] transition-colors focus-visible:outline-offset-2 underline underline-offset-4">
            {c.footer.privacy}
          </a>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
