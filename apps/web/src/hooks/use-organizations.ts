import { useEffect, useState } from 'react';
import { apiFetch } from '../api-fetch';
import { useAuthSession } from '../providers/AuthSessionProvider';

export type OrganizationsState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'ok'; count: number }
  | { status: 'error'; message: string };

function parseEnvelope(data: unknown): number {
  if (!data || typeof data !== 'object' || !('data' in data)) {
    throw new Error('Invalid response shape');
  }
  const envelope = data as { data: unknown };
  if (!Array.isArray(envelope.data)) {
    throw new Error('Invalid response shape');
  }
  return envelope.data.length;
}

export function useOrganizations(): OrganizationsState {
  const { snapshot, workspaceListBump } = useAuthSession();
  const [state, setState] = useState<OrganizationsState>({ status: 'loading' });
  const signedInUserId =
    snapshot.status === 'ready' ? (snapshot.user?.id ?? null) : null;

  useEffect(() => {
    if (snapshot.status === 'loading') {
      setState({ status: 'loading' });
      return;
    }

    if (!snapshot.user) {
      setState({ status: 'signed_out' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    apiFetch('/organizations')
      .then(async (res) => {
        if (res.status === 401) {
          return { unauthorized: true as const };
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json: unknown = await res.json();
        return { unauthorized: false as const, count: parseEnvelope(json) };
      })
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.unauthorized) {
          setState({ status: 'signed_out' });
          return;
        }
        setState({ status: 'ok', count: result.count });
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
  }, [snapshot.status, signedInUserId, workspaceListBump]);

  return state;
}
