import { useEffect, useState } from 'react';

import { apiFetch } from '../api-fetch';
import { useAuthSession } from '../providers/AuthSessionProvider';

export type OrgMemberRow = {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
};

export type OrgMembersState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; members: OrgMemberRow[] }
  | { status: 'error'; message: string };

function parseList(json: unknown): OrgMemberRow[] {
  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new Error('Invalid response shape');
  }
  const raw = (json as { data: unknown }).data;
  if (!Array.isArray(raw)) {
    throw new Error('Invalid response shape');
  }
  return raw.map((row) => {
    if (!row || typeof row !== 'object' || !('userId' in row && 'email' in row)) {
      throw new Error('Invalid member row');
    }
    const m = row as OrgMemberRow;
    return {
      userId: String(m.userId),
      email: String(m.email),
      displayName:
        typeof m.displayName === 'string'
          ? m.displayName
          : m.displayName === null
            ? null
            : null,
      role: String(m.role),
    };
  });
}

export function useOrgMembers(
  organizationId: string | null,
  refreshKey: number = 0,
): OrgMembersState {
  const { snapshot } = useAuthSession();
  const signedIn =
    snapshot.status === 'ready' && snapshot.user !== null;

  const [state, setState] = useState<OrgMembersState>({ status: 'idle' });

  useEffect(() => {
    if (!organizationId || !signedIn) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    apiFetch(`/organizations/${organizationId}/members`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return parseList(await res.json());
      })
      .then((members) => {
        if (!cancelled) {
          setState({ status: 'ok', members });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Request failed',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, signedIn, refreshKey]);

  return state;
}

export function memberLabel(m: OrgMemberRow): string {
  const name = m.displayName?.trim();
  if (name) {
    return `${name} (${m.email})`;
  }
  return m.email;
}
