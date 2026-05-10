import { useEffect, useState } from 'react';
import { apiFetch } from '../api-fetch';
import { useAuthSession } from '../providers/AuthSessionProvider';

export type OrgRoleState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; role: string }
  | { status: 'error'; message: string };

function parseMe(json: unknown): string | null {
  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new Error('Invalid response shape');
  }
  const data = (json as { data: unknown }).data;
  if (!data || typeof data !== 'object' || !('role' in data)) {
    throw new Error('Invalid response shape');
  }
  const role = (data as { role: unknown }).role;
  return typeof role === 'string' ? role : null;
}

/** Current user’s **`Role`** inside an organization (`GET …/members/me`). */
export function useOrgMemberRole(organizationId: string | null): OrgRoleState {
  const { snapshot } = useAuthSession();
  const signedIn =
    snapshot.status === 'ready' && snapshot.user !== null;

  const [state, setState] = useState<OrgRoleState>({ status: 'idle' });

  useEffect(() => {
    if (!organizationId || !signedIn) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    apiFetch(`/organizations/${organizationId}/members/me`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json: unknown = await res.json();
        const role = parseMe(json);
        if (!role) {
          throw new Error('Missing role');
        }
        return role;
      })
      .then((role) => {
        if (!cancelled) {
          setState({ status: 'ok', role });
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
  }, [organizationId, signedIn]);

  return state;
}
