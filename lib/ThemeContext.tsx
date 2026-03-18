
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserSettings } from '../types';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'portal-theme';

function getInitialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage unavailable
  }
  return 'dark';
}

interface ThemeProviderProps {
  userSettings?: UserSettings;
  onUpdateSettings?: (settings: Partial<UserSettings>) => void;
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ userSettings, onUpdateSettings, children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);

  // Sync DOM classList whenever theme state changes
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable
    }
  }, [theme]);

  // When Firestore settings load/change, Firestore wins over localStorage
  useEffect(() => {
    if (userSettings?.themeMode && userSettings.themeMode !== theme) {
      setThemeState(userSettings.themeMode);
    }
    // Only react to Firestore changes, not local theme state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSettings?.themeMode]);

  // Explicit user action: update state + persist to Firestore
  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    if (onUpdateSettings) {
      onUpdateSettings({ themeMode: mode });
    }
  }, [onUpdateSettings]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
