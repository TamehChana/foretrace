import { useCallback, useEffect, useState } from 'react';
import { Terminal } from 'lucide-react';
import { formatApiErrorResponse } from '../../api-error-message';
import { apiFetch } from '../../api-fetch';
import { Skeleton } from '../ui/Skeleton';

type IncidentRow = {
  id: string;
  category: string;
  excerpt: string;
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  taskId: string | null;
  batchId: string | null;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function shortFingerprint(fp: string): string {
  if (fp.length <= 16) {
    return fp;
  }
  return `${fp.slice(0, 8)}…${fp.slice(-6)}`;
}

export function ProjectTerminalIncidentsPanel(props: {
  organizationId: string;
  projectId: string;
  refreshKey: number;
}) {
  const { organizationId, projectId, refreshKey } = props;
  const [state, setState] = useState<
    | { status: 'idle' | 'loading' }
    | { status: 'ok'; items: IncidentRow[] }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const res = await apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/terminal/incidents?limit=80`,
    );
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      setState({
        status: 'error',
        message: formatApiErrorResponse(raw, res.status),
      });
      return;
    }
    const body = raw as { data?: IncidentRow[] };
    setState({ status: 'ok', items: body.data ?? [] });
  }, [organizationId, projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
      <div>
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Terminal size={14} strokeWidth={2} aria-hidden />
          Terminal incidents
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          Each CLI ingest stores the <strong className="font-medium text-zinc-700 dark:text-zinc-300">full batch</strong> of
          lines (redacted) on the server. This table only shows{' '}
          <strong className="font-medium text-zinc-700 dark:text-zinc-300">incidents</strong>: lines that look like
          build/test/runtime problems (e.g. “error”, “failed”, “exception”) so PMs see friction without re-reading entire
          logs. <code className="rounded bg-zinc-100 px-0.5 dark:bg-zinc-800">foretrace run</code> defaults to sending
          only when the wrapped command exits non-zero — set{' '}
          <code className="rounded bg-zinc-100 px-0.5 dark:bg-zinc-800">FORETRACE_INGEST_ON=always</code> to send all
          captured output.
        </p>
      </div>

      {state.status === 'loading' || state.status === 'idle' ? (
        <Skeleton className="mt-3 h-28 w-full" />
      ) : state.status === 'error' ? (
        <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">
          {state.message}
        </p>
      ) : state.status === 'ok' && state.items.length === 0 ? (
        <p className="mt-3 text-[13px] text-zinc-500">
          No incidents yet. Ingest terminal output with the CLI to populate this
          list.
        </p>
      ) : state.status === 'ok' ? (
        <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-zinc-100 dark:border-zinc-800">
          <table className="w-full min-w-[520px] text-left text-[11px]">
            <thead className="sticky top-0 bg-zinc-100/95 dark:bg-zinc-900/95">
              <tr className="text-zinc-500">
                <th className="px-2 py-1.5 font-medium">Last seen</th>
                <th className="px-2 py-1.5 font-medium">Category</th>
                <th className="px-2 py-1.5 font-medium">#</th>
                <th className="px-2 py-1.5 font-medium">Excerpt</th>
                <th className="px-2 py-1.5 font-medium">Fingerprint</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((row: IncidentRow) => (
                <tr
                  key={row.id}
                  className="border-t border-zinc-100 odd:bg-white/70 dark:border-zinc-800 odd:dark:bg-zinc-950/40"
                >
                  <td className="whitespace-nowrap px-2 py-1.5 text-zinc-600 dark:text-zinc-400">
                    {formatWhen(row.lastSeenAt)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium text-zinc-800 dark:text-zinc-200">
                    {row.category}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                    {row.occurrenceCount}
                  </td>
                  <td className="max-w-[280px] px-2 py-1.5 text-zinc-700 dark:text-zinc-300">
                    <span className="line-clamp-3 break-words" title={row.excerpt}>
                      {row.excerpt}
                    </span>
                  </td>
                  <td
                    className="max-w-[120px] truncate px-2 py-1.5 font-mono text-[10px] text-zinc-500"
                    title={row.fingerprint}
                  >
                    {shortFingerprint(row.fingerprint)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
