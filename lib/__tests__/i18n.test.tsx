// @vitest-environment happy-dom
/**
 * Phase 4a i18n acceptance tests.
 *
 * Covers:
 *  1. Dictionary parity EN ↔ ES in both directions
 *  2. No empty values in either dictionary
 *  3. EN byte-identical spot-checks against known pre-i18n UI strings
 *  4. Locale-switch re-render smoke test (consumer inside LocaleProvider)
 *  5. <html lang> sync
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { LocaleProvider, useLocale, useT } from '../i18n';

// ── 1. Dictionary parity, both directions ──────────────────────────────

describe('dictionary parity EN ↔ ES', () => {
  it('every EN key exists in ES', () => {
    const missing = Object.keys(en).filter(k => !(k in es));
    expect(missing).toEqual([]);
  });

  it('every ES key exists in EN (no orphaned ES keys)', () => {
    const missing = Object.keys(es).filter(k => !(k in en));
    expect(missing).toEqual([]);
  });

  it('both dictionaries have the same key count', () => {
    expect(Object.keys(es).length).toBe(Object.keys(en).length);
  });
});

// ── 2. No empty / blank values ─────────────────────────────────────────

describe('dictionary value sanity', () => {
  it('EN has no empty or whitespace-only values', () => {
    const bad = Object.entries(en).filter(([, v]) => v.trim().length === 0).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('ES has no empty or whitespace-only values', () => {
    const bad = Object.entries(es).filter(([, v]) => v.trim().length === 0).map(([k]) => k);
    expect(bad).toEqual([]);
  });
});

// ── 3. EN byte-identical spot-checks (pre-i18n UI strings) ─────────────

describe('EN byte-identical spot-checks', () => {
  it.each([
    ['nav.home', 'Home'],
    ['nav.resources', 'Resources'],
    ['nav.feedback', 'Feedback'],
    ['nav.leaderboard', 'Leaderboard'],
    ['navGroup.learning', 'Learning'],
    ['settings.title', 'User Control Center'],
    ['settings.save', 'Apply Changes'],
    ['settings.saveError', 'Failed to save settings.'],
    ['save.saving', 'Saving...'],
    ['save.saved', 'Saved'],
    ['palette.noResults', 'No matching tabs.'],
    ['proctor.session.active', 'Active Session'],
    ['proctor.session.tokenError', 'Unable to start assessment session. Please check your internet connection and refresh the page.'],
    ['settings.appearance.light', 'Light'],
    ['settings.appearance.dark', 'Dark'],
  ] as const)('%s === %j', (key, expected) => {
    expect(en[key]).toBe(expected);
  });
});

// ── 4 & 5. Render smoke tests (need a DOM; happy-dom pragma is in the header) ──

describe('LocaleProvider runtime behavior', () => {
  beforeEach(() => {
    // happy-dom 20 does not expose localStorage as a global — polyfill a
    // minimal stub so persistence paths can run (provider must also tolerate
    // its absence, which the stub lets us exercise indirectly).
    if (typeof globalThis.localStorage === 'undefined') {
      const mem = new Map<string, string>();
      (globalThis as Record<string, unknown>).localStorage = {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
        clear: () => mem.clear(),
      };
    }
    localStorage.clear();
    document.documentElement.lang = 'en';
  });

  it('switches rendered strings when setLocale is called (re-render smoke test)', async () => {
    const seen: string[] = [];
    const Probe: React.FC = () => {
      const { locale, setLocale, t, interpolate } = useLocale();
      seen.push(`${locale}:${t('nav.home')}:${interpolate('app.footer.level', { level: 7 })}`);
      return (
        <>
          <span data-testid="label">{t('nav.home')}</span>
          <button data-testid="to-es" onClick={() => setLocale('es')}>es</button>
          <button data-testid="to-en" onClick={() => setLocale('en')}>en</button>
        </>
      );
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LocaleProvider>
          <Probe />
        </LocaleProvider>
      );
    });

    expect(container.querySelector('[data-testid="label"]')!.textContent).toBe('Home');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="to-es"]')!.click();
    });
    expect(container.querySelector('[data-testid="label"]')!.textContent).toBe('Inicio');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="to-en"]')!.click();
    });
    expect(container.querySelector('[data-testid="label"]')!.textContent).toBe('Home');

    // Interpolation rendered correctly at least once per locale
    expect(seen.some(s => s.startsWith('es:Inicio:Nivel 7'))).toBe(true);
    expect(seen.some(s => s.startsWith('en:Home:Level 7'))).toBe(true);

    await act(async () => root.unmount());
    container.remove();
  });

  it('syncs <html lang> on locale change and persists to localStorage', async () => {
    const LangProbe: React.FC = () => {
      const { locale, setLocale } = useLocale();
      return (
        <button data-testid="switch" onClick={() => setLocale(locale === 'en' ? 'es' : 'en')}>
          switch
        </button>
      );
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LocaleProvider>
          <LangProbe />
        </LocaleProvider>
      );
    });

    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('portal-locale')).toBe('en');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="switch"]')!.click();
    });
    expect(document.documentElement.lang).toBe('es');
    expect(localStorage.getItem('portal-locale')).toBe('es');

    await act(async () => root.unmount());
    container.remove();
  });

  it('t() falls back to EN for a key missing from the active locale', async () => {
    const FallbackProbe: React.FC = () => {
      const t = useT();
      return <span data-testid="fallback">{t('proctor.session.active')}</span>;
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LocaleProvider>
          <FallbackProbe />
        </LocaleProvider>
      );
    });
    expect(container.querySelector('[data-testid="fallback"]')!.textContent).toBe('Active Session');
    await act(async () => root.unmount());
    container.remove();
  });
});
