import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

type ResolvedTheme = 'light' | 'dark';

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (value: ThemePreference) => void;
};

const STORAGE_KEY = 'foretrace-theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw;
    }
    return 'system';
  } catch {
    return 'system';
  }
}

function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') {
    return systemTheme();
  }
  return preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readPreference());
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    typeof window !== 'undefined' ? resolve(readPreference()) : 'light',
  );

  useEffect(() => {
    const next = resolve(preference);
    setResolved(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }, [preference]);

  useEffect(() => {
    if (preference !== 'system') {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = systemTheme();
      setResolved(next);
      document.documentElement.classList.toggle('dark', next === 'dark');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* private mode / blocked storage — theme still applies for the session */
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
