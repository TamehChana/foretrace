import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { apiFetch } from '../api-fetch';
import { clearAccessToken } from '../auth-token';

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type SessionSnapshot =
  | { status: 'loading' }
  | { status: 'ready'; user: SessionUser | null };

type AuthSessionValue = {
  snapshot: SessionSnapshot;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  authModalOpen: boolean;
  /** Incremented after org create / invite accept (future) so list hooks refetch. */
  workspaceListBump: number;
  bumpWorkspaceList: () => void;
  openCreateOrganizationModal: () => void;
  closeCreateOrganizationModal: () => void;
  createOrgModalOpen: boolean;
};

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

function parseMe(json: unknown): SessionUser | null {
  if (!json || typeof json !== 'object' || !('user' in json)) {
    return null;
  }
  const { user } = json as { user: unknown };
  if (user === null) {
    return null;
  }
  if (
    !user ||
    typeof user !== 'object' ||
    !('id' in user && 'email' in user && 'displayName' in user)
  ) {
    return null;
  }
  const u = user as SessionUser & { displayName: string | null };
  return { id: u.id, email: u.email, displayName: u.displayName };
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>({ status: 'loading' });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [createOrgModalOpen, setCreateOrgModalOpen] = useState(false);
  const [workspaceListBump, setWorkspaceListBump] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/auth/me');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: unknown = await res.json();
      setSnapshot({ status: 'ready', user: parseMe(json) });
    } catch {
      setSnapshot({ status: 'ready', user: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // still refresh local state even if logout failed (e.g. offline)
    }
    clearAccessToken();
    await refresh();
  }, [refresh]);

  const openAuthModal = useCallback(() => setAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);

  const bumpWorkspaceList = useCallback(() => {
    setWorkspaceListBump((value) => value + 1);
  }, []);

  const openCreateOrganizationModal = useCallback(
    () => setCreateOrgModalOpen(true),
    [],
  );

  const closeCreateOrganizationModal = useCallback(
    () => setCreateOrgModalOpen(false),
    [],
  );

  const value = useMemo<AuthSessionValue>(
    () => ({
      snapshot,
      refresh,
      logout,
      openAuthModal,
      closeAuthModal,
      authModalOpen,
      workspaceListBump,
      bumpWorkspaceList,
      openCreateOrganizationModal,
      closeCreateOrganizationModal,
      createOrgModalOpen,
    }),
    [
      snapshot,
      refresh,
      logout,
      openAuthModal,
      closeAuthModal,
      authModalOpen,
      workspaceListBump,
      bumpWorkspaceList,
      openCreateOrganizationModal,
      closeCreateOrganizationModal,
      createOrgModalOpen,
    ],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionValue {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error('useAuthSession must be used within AuthSessionProvider');
  }
  return ctx;
}
