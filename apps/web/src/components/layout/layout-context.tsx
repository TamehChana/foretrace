import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export const MOBILE_NAV_OPEN_BUTTON_ID = 'mobile-nav-open-button';

type LayoutCtx = {
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  closeMobileNav: () => void;
};

const LayoutContext = createContext<LayoutCtx | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
    requestAnimationFrame(() => {
      document.getElementById(MOBILE_NAV_OPEN_BUTTON_ID)?.focus();
    });
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMobileNav();
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen, closeMobileNav]);

  const value = useMemo(
    () => ({ mobileNavOpen, setMobileNavOpen, closeMobileNav }),
    [mobileNavOpen, closeMobileNav],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayoutShell(): LayoutCtx {
  const ctx = useContext(LayoutContext);
  if (!ctx) {
    throw new Error('useLayoutShell must be used within LayoutProvider');
  }
  return ctx;
}
