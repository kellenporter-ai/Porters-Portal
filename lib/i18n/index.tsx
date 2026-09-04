import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserSettings } from '../../types';
import { en } from './en';
import { es } from './es';

export type Locale = 'en' | 'es';

/** Flat dictionary of UI string keys → text. */
export type Dictionary = Record<string, string>;

/** Template params for interpolate(): values must be string/number/boolean. */
export type TemplateParams = Record<string, string | number | boolean>;

export const LOCALES: Locale[] = ['en', 'es'];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};

const DICTIONARIES: Record<Locale, Dictionary> = { en, es };

const STORAGE_KEY = 'portal-locale';

/** localStorage may be unavailable (private mode, happy-dom test env, embedded webviews). */
function storageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // storage unavailable — locale still works in-memory
  }
}

function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'es';
}

function getInitialLocale(): Locale {
  const stored = storageGet(STORAGE_KEY);
  if (isLocale(stored)) return stored;
  return 'en';
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  /** t() + `{placeholder}` substitution, e.g. interpolate('app.footer.level', { level: 3 }). */
  interpolate: (key: string, params: TemplateParams) => string;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

interface LocaleProviderProps {
  userSettings?: UserSettings;
  onUpdateSettings?: (settings: Partial<UserSettings>) => void;
  children: ReactNode;
}

export const LocaleProvider: React.FC<LocaleProviderProps> = ({ userSettings, onUpdateSettings, children }) => {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  // Sync <html lang> + localStorage whenever locale changes (ProctorTTS reads
  // document.documentElement.lang for TTS utterance language).
  useEffect(() => {
    document.documentElement.lang = locale;
    storageSet(STORAGE_KEY, locale);
  }, [locale]);

  // When Firestore settings load/change, Firestore wins over localStorage
  // (same pattern as ThemeProvider).
  useEffect(() => {
    if (userSettings?.preferredLocale && userSettings.preferredLocale !== locale) {
      setLocaleState(userSettings.preferredLocale);
    }
    // Only react to Firestore changes, not local locale state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSettings?.preferredLocale]);

  // Explicit user action: update state + persist to Firestore
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (onUpdateSettings) {
      onUpdateSettings({ preferredLocale: next });
    }
  }, [onUpdateSettings]);

  const t = useCallback((key: string): string => {
    const dict = DICTIONARIES[locale];
    const value = dict[key] ?? DICTIONARIES.en[key];
    // Never render a raw key: fall back to the EN value, then to the key's
    // trailing segment so the UI degrades gracefully during Phase 4b migration.
    if (value !== undefined) return value;
    const segment = key.slice(key.lastIndexOf('.') + 1);
    return segment.replace(/([A-Z])/g, ' $1').trim();
  }, [locale]);

  const interpolate = useCallback((key: string, params: TemplateParams): string => {
    let value = t(key);
    for (const [name, paramValue] of Object.entries(params)) {
      value = value.split(`{${name}}`).join(String(paramValue));
    }
    return value;
  }, [t]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, interpolate }}>
      {children}
    </LocaleContext.Provider>
  );
};

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return ctx;
}

/** Convenience hook: returns the bound t() lookup for the active locale. */
export function useT(): (key: string) => string {
  return useLocale().t;
}

/** Convenience hook: returns the bound interpolate() for the active locale. */
export function useInterpolate(): (key: string, params: TemplateParams) => string {
  return useLocale().interpolate;
}
