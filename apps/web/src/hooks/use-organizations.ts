import { useEffect, useState } from 'react';
import { apiFetch } from '../api-fetch';
import { useAuthSession } from '../providers/AuthSessionProvider';

export type OrgListItem = {
  id: string;
  name: string;
  slug: string | null;
};

export type OrganizationsState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'ok'; items: OrgListItem[] }
  | { status: 'error'; message: string };

function parseEnvelope(data: unknown): OrgListItem[] {
  if (!data || typeof data !== 'object' || !('data' in data)) {
    throw new Error('Invalid response shape');
  }
  const envelope = data as { data: unknown };
  if (!Array.isArray(envelope.data)) {
    throw new Error('Invalid response shape');
  }
  return envelope.data.map((row) => {
    if (
      !row ||
      typeof row !== 'object' ||
      !('id' in row && 'name' in row && 'slug' in row)
    ) {
      throw new Error('Invalid organization row');
    }
    const o = row as OrgListItem;
    return {
      id: o.id,
      name: typeof o.name === 'string' ? o.name : String(o.name),
      slug:
        typeof o.slug === 'string'
          ? o.slug
          : o.slug === null
            ? null
            : (o.slug as string | null),
    };
  });
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
        return {
          unauthorized: false as const,
          items: parseEnvelope(json),
        };
      })
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.unauthorized) {
          setState({ status: 'signed_out' });
          return;
        }
        setState({ status: 'ok', items: result.items });
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
