import { useCallback, useEffect, useState } from 'react';
import { ClipboardCopy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { formatApiErrorResponse } from '../../api-error-message';
import { apiFetch } from '../../api-fetch';
import { useToast } from '../../providers/ToastProvider';
import { Skeleton } from '../ui/Skeleton';

type OrgRole = 'ADMIN' | 'PM' | 'DEVELOPER';

type CliTokenRow = {
  id: string;
  name: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdById: string;
};

type MintResponse = {
  id: string;
  name: string | null;
  createdAt: string;
  token: string;
};

function formatWhen(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function ProjectCliTokensPanel(props: {
  organizationId: string;
  projectId: string;
  refreshKey: number;
  memberRoleStatus: 'idle' | 'loading' | 'ok' | 'error';
  memberRoleError?: string;
  role: OrgRole | null;
  currentUserId: string | null;
  onRefresh: () => void;
}) {
  const {
    organizationId,
    projectId,
    refreshKey,
    memberRoleStatus,
    memberRoleError,
    role,
    currentUserId,
    onRefresh,
  } = props;
  const showToast = useToast();
  const [state, setState] = useState<
    | { status: 'idle' | 'loading' }
    | { status: 'ok'; items: CliTokenRow[] }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const [mintName, setMintName] = useState('');
  const [mintSubmitting, setMintSubmitting] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<MintResponse | null>(
    null,
  );
  const [revokeBusyId, setRevokeBusyId] = useState<string | null>(null);

  const canMint =
    memberRoleStatus === 'ok' &&
    (role === 'ADMIN' || role === 'PM' || role === 'DEVELOPER');

  const canRevokeToken = useCallback(
    (row: CliTokenRow): boolean => {
      if (row.revokedAt) {
        return false;
      }
      if (!role) {
        return false;
      }
      if (role === 'ADMIN' || role === 'PM') {
        return true;
      }
      if (role === 'DEVELOPER' && currentUserId) {
        return row.createdById === currentUserId;
      }
      return false;
    },
    [role, currentUserId],
  );

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const res = await apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/cli-tokens`,
    );
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      setState({
        status: 'error',
        message: formatApiErrorResponse(raw, res.status),
      });
      return;
    }
    const body = raw as { data?: CliTokenRow[] };
    setState({ status: 'ok', items: body.data ?? [] });
  }, [organizationId, projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const copy = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast(`${label} copied`, 'success');
      } catch {
        showToast('Could not copy to clipboard', 'error');
      }
    },
    [showToast],
  );

  const mint = async () => {
    if (!canMint) {
      return;
    }
    setMintSubmitting(true);
    try {
      const trimmed = mintName.trim();
      const res = await apiFetch(
        `/organizations/${organizationId}/projects/${projectId}/cli-tokens`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            trimmed.length > 0 ? { name: trimmed.slice(0, 120) } : {},
          ),
        },
      );
      const raw: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(formatApiErrorResponse(raw, res.status), 'error');
        return;
      }
      const body = raw as { data?: MintResponse };
      if (!body.data?.token) {
        showToast('Unexpected mint response', 'error');
        return;
      }
      setRevealedSecret(body.data);
      setMintName('');
      showToast('Token created — copy it now; it will not be shown again.', 'success');
      onRefresh();
      await load();
    } finally {
      setMintSubmitting(false);
    }
  };

  const revoke = async (row: CliTokenRow) => {
    if (!canRevokeToken(row)) {
      return;
    }
    const label = row.name?.trim() || row.id.slice(0, 8);
    if (!window.confirm(`Revoke CLI token "${label}"? Ingest with this token will stop working.`)) {
      return;
    }
    setRevokeBusyId(row.id);
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/projects/${projectId}/cli-tokens/${row.id}`,
        { method: 'DELETE' },
      );
      const raw: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(formatApiErrorResponse(raw, res.status), 'error');
        return;
      }
      showToast('Token revoked', 'success');
      onRefresh();
      await load();
    } finally {
      setRevokeBusyId(null);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <KeyRound size={14} strokeWidth={2} aria-hidden />
            CLI ingest tokens
          </h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            Bearer tokens for{' '}
            <code className="rounded bg-zinc-100 px-0.5 dark:bg-zinc-800">
              @foretrace/cli
            </code>{' '}
            and{' '}
            <code className="rounded bg-zinc-100 px-0.5 dark:bg-zinc-800">
              POST …/terminal/batches
            </code>
            . Secrets are shown only once at creation.
          </p>
        </div>
      </div>

      {revealedSecret ? (
        <div
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          <p className="font-semibold">Save this token now</p>
          <p className="mt-1 opacity-90">
            It will not be displayed again. Use as{' '}
            <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/60">
              Authorization: Bearer …
            </code>
            .
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="max-w-full break-all rounded bg-white/80 px-2 py-1 text-[11px] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
              {revealedSecret.token}
            </code>
            <button
              type="button"
              onClick={() => {
                void copy(revealedSecret.token, 'Token');
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-50 dark:border-amber-700 dark:bg-zinc-900 dark:text-amber-50 dark:hover:bg-zinc-800"
            >
              <ClipboardCopy size={12} strokeWidth={2} aria-hidden />
              Copy
            </button>
            <button
              type="button"
              onClick={() => {
                setRevealedSecret(null);
              }}
              className="rounded-lg border border-transparent px-2 py-1 text-[11px] font-semibold text-amber-900 underline-offset-2 hover:underline dark:text-amber-100"
            >
              I’ve stored it
            </button>
          </div>
        </div>
      ) : null}

      {memberRoleStatus === 'loading' || memberRoleStatus === 'idle' ? (
        <Skeleton className="mt-3 h-10 w-full max-w-md" />
      ) : memberRoleStatus === 'error' ? (
        <p className="mt-3 text-[12px] text-rose-600 dark:text-rose-400">
          Could not load your role: {memberRoleError ?? 'Request failed'}
        </p>
      ) : canMint ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void mint();
          }}
        >
          <div className="min-w-[160px] flex-1">
            <label
              htmlFor={`cli-token-name-${projectId}`}
              className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500"
            >
              Label (optional)
            </label>
            <input
              id={`cli-token-name-${projectId}`}
              type="text"
              placeholder="e.g. CI laptop"
              value={mintName}
              maxLength={120}
              onChange={(e) => {
                setMintName(e.target.value);
              }}
              className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          <button
            type="submit"
            disabled={mintSubmitting}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            Mint token
          </button>
        </form>
      ) : (
        <p className="mt-3 text-[12px] text-zinc-500">
          You need organization membership to mint CLI tokens.
        </p>
      )}

      {state.status === 'loading' || state.status === 'idle' ? (
        <Skeleton className="mt-3 h-20 w-full" />
      ) : state.status === 'error' ? (
        <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">
          {state.message}
        </p>
      ) : state.items.length === 0 ? (
        <p className="mt-3 text-[13px] text-zinc-500">
          No tokens yet.
          {canMint ? ' Mint one to use the CLI with this project.' : null}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {state.items.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12px]"
            >
              <div className="min-w-0">
                <div className="font-medium text-zinc-800 dark:text-zinc-100">
                  {row.name?.trim() || (
                    <span className="text-zinc-500">Unnamed</span>
                  )}
                  {row.revokedAt ? (
                    <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                      Revoked
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  Created {formatWhen(row.createdAt)}
                  {' · '}
                  Last used {formatWhen(row.lastUsedAt)}
                </div>
              </div>
              {canRevokeToken(row) ? (
                <button
                  type="button"
                  title="Revoke token"
                  disabled={revokeBusyId === row.id}
                  onClick={() => {
                    void revoke(row);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                  <Trash2 size={12} strokeWidth={2} aria-hidden />
                  Revoke
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
