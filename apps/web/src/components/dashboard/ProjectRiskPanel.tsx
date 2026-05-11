import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { formatApiErrorResponse } from '../../api-error-message';
import { apiFetch } from '../../api-fetch';
import { useToast } from '../../providers/ToastProvider';
import { Skeleton } from '../ui/Skeleton';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type RiskReason = { code: string; detail: string };

type RiskRow = {
  id: string;
  organizationId: string;
  projectId: string;
  level: RiskLevel;
  score: number;
  reasons: unknown;
  aiSummary?: string | null;
  evaluatedAt: string;
};

type RiskHistoryRow = {
  id: string;
  level: RiskLevel;
  score: number;
  reasons: unknown;
  aiSummary?: string | null;
  evaluatedAt: string;
};

function isRiskLevel(v: unknown): v is RiskLevel {
  return (
    v === 'LOW' ||
    v === 'MEDIUM' ||
    v === 'HIGH' ||
    v === 'CRITICAL'
  );
}

function parseReasons(raw: unknown): RiskReason[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: RiskReason[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const code = (item as { code?: unknown }).code;
    const detail = (item as { detail?: unknown }).detail;
    if (typeof code === 'string' && typeof detail === 'string') {
      out.push({ code, detail });
    }
  }
  return out;
}

function levelBadgeClass(level: RiskLevel): string {
  switch (level) {
    case 'LOW':
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200';
    case 'MEDIUM':
      return 'bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100';
    case 'HIGH':
      return 'bg-orange-200 text-orange-950 dark:bg-orange-950/60 dark:text-orange-100';
    case 'CRITICAL':
      return 'bg-rose-200 text-rose-950 dark:bg-rose-950/70 dark:text-rose-50';
    default:
      return 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100';
  }
}

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

type HistoryPanelState =
  | { status: 'idle' | 'loading' }
  | { status: 'ok'; rows: RiskHistoryRow[] }
  | { status: 'error'; message: string };

function EvaluationHistorySection(props: {
  historyState: HistoryPanelState;
}) {
  const { historyState } = props;
  return (
    <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Evaluation history
      </h4>
      {historyState.status === 'loading' || historyState.status === 'idle' ? (
        <Skeleton className="mt-2 h-16 w-full" />
      ) : historyState.status === 'error' ? (
        <p className="mt-2 text-[12px] text-rose-600 dark:text-rose-400">
          {historyState.message}
        </p>
      ) : historyState.status === 'ok' && historyState.rows.length === 0 ? (
        <p className="mt-2 text-[12px] text-zinc-500">No runs recorded yet.</p>
      ) : historyState.status === 'ok' ? (
        <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-zinc-100 dark:border-zinc-800">
          <table className="w-full min-w-[320px] text-left text-[11px]">
            <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900/95">
              <tr className="text-zinc-500">
                <th className="px-2 py-1 font-medium">When</th>
                <th className="px-2 py-1 font-medium">Level</th>
                <th className="px-2 py-1 font-medium">Score</th>
                <th className="px-2 py-1 font-medium">Top reason</th>
                <th className="px-2 py-1 font-medium">Insight</th>
              </tr>
            </thead>
            <tbody>
              {historyState.rows.map((h: RiskHistoryRow) => {
                const first = parseReasons(h.reasons)[0];
                const insight =
                  typeof h.aiSummary === 'string' && h.aiSummary.trim().length > 0
                    ? h.aiSummary.trim()
                    : null;
                return (
                  <tr
                    key={h.id}
                    className="border-t border-zinc-100 odd:bg-white/60 dark:border-zinc-800 odd:dark:bg-zinc-950/40"
                  >
                    <td className="whitespace-nowrap px-2 py-1 text-zinc-600 dark:text-zinc-400">
                      {formatWhen(h.evaluatedAt)}
                    </td>
                    <td className="px-2 py-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${levelBadgeClass(h.level)}`}
                      >
                        {h.level}
                      </span>
                    </td>
                    <td className="tabular-nums px-2 py-1 text-zinc-800 dark:text-zinc-200">
                      {h.score}
                    </td>
                    <td className="max-w-[180px] truncate px-2 py-1 text-zinc-600 dark:text-zinc-400">
                      {first ? (
                        <span title={first.detail}>{first.code}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td
                      className="max-w-[140px] truncate px-2 py-1 text-zinc-500 dark:text-zinc-500"
                      title={insight ?? undefined}
                    >
                      {insight
                        ? insight.length > 48
                          ? `${insight.slice(0, 48)}…`
                          : insight
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function ProjectRiskPanel(props: {
  organizationId: string;
  projectId: string;
  canManage: boolean;
  refreshKey: number;
  /** Called after a successful evaluate so sibling panels (e.g. signals) can reload. */
  onEvaluated?: () => void;
}) {
  const { organizationId, projectId, canManage, refreshKey, onEvaluated } =
    props;
  const showToast = useToast();
  const [state, setState] = useState<
    | { status: 'idle' | 'loading' }
    | { status: 'ok'; row: RiskRow | null }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [historyState, setHistoryState] = useState<HistoryPanelState>({
    status: 'idle',
  });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const res = await apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/risk`,
    );
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      setState({
        status: 'error',
        message: formatApiErrorResponse(raw, res.status),
      });
      return;
    }
    const body = raw as { data?: RiskRow | null };
    const row = body.data ?? null;
    if (row && !isRiskLevel(row.level)) {
      setState({ status: 'error', message: 'Invalid risk response' });
      return;
    }
    setState({ status: 'ok', row });
  }, [organizationId, projectId]);

  const loadHistory = useCallback(async () => {
    setHistoryState({ status: 'loading' });
    const res = await apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/risk/history?limit=30`,
    );
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      setHistoryState({
        status: 'error',
        message: formatApiErrorResponse(raw, res.status),
      });
      return;
    }
    const body = raw as { data?: unknown };
    const arr = Array.isArray(body.data) ? body.data : [];
    const rows: RiskHistoryRow[] = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const o = item as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id : null;
      const level = o.level;
      const score = o.score;
      const evaluatedAt =
        typeof o.evaluatedAt === 'string' ? o.evaluatedAt : null;
      if (!id || !isRiskLevel(level) || typeof score !== 'number' || !evaluatedAt) {
        continue;
      }
      const aiSummary =
        typeof o.aiSummary === 'string' || o.aiSummary === null
          ? (o.aiSummary as string | null)
          : undefined;
      rows.push({
        id,
        level,
        score,
        reasons: o.reasons,
        aiSummary: aiSummary ?? undefined,
        evaluatedAt,
      });
    }
    setHistoryState({ status: 'ok', rows });
  }, [organizationId, projectId]);

  useEffect(() => {
    void load();
    void loadHistory();
  }, [load, loadHistory, refreshKey]);

  const evaluate = useCallback(async () => {
    const res = await apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/risk/evaluate`,
      { method: 'POST' },
    );
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      showToast(formatApiErrorResponse(raw, res.status), 'error');
      return;
    }
    showToast('Risk re-evaluated', 'success');
    onEvaluated?.();
    await load();
    await loadHistory();
  }, [organizationId, projectId, load, loadHistory, showToast, onEvaluated]);

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <ShieldAlert size={14} strokeWidth={2} aria-hidden />
            Delivery risk (v0)
          </h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            Rule-based score from the 24h signal rollup (tasks, terminal, GitHub
            churn), plus an optional narrative (heuristic or OpenAI when
            configured). Evaluating refreshes signals first, then persists this
            row.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            title="Recompute risk from latest signals"
            onClick={() => {
              void evaluate();
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <RefreshCw size={12} strokeWidth={2} aria-hidden />
            Evaluate
          </button>
        ) : null}
      </div>

      {state.status === 'loading' || state.status === 'idle' ? (
        <Skeleton className="mt-3 h-20 w-full" />
      ) : state.status === 'error' ? (
        <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">
          {state.message}
        </p>
      ) : state.status === 'ok' && state.row === null ? (
        <div className="mt-3 space-y-3">
          <p className="text-[13px] text-zinc-500">
            No evaluation yet.
            {canManage
              ? ' Click Evaluate to refresh signals and compute the first score.'
              : ' Ask a PM or admin to run an evaluation.'}
          </p>
          <EvaluationHistorySection historyState={historyState} />
        </div>
      ) : state.status === 'ok' && state.row !== null ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${levelBadgeClass(state.row.level)}`}
            >
              {state.row.level}
            </span>
            <span className="text-[12px] text-zinc-600 dark:text-zinc-400">
              Score{' '}
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {state.row.score}
              </span>
              <span className="text-zinc-400"> / 100</span>
            </span>
            <span className="text-[11px] text-zinc-500">
              {formatWhen(state.row.evaluatedAt)}
            </span>
          </div>
          <ul className="space-y-2 text-[12px] text-zinc-700 dark:text-zinc-300">
            {parseReasons(state.row.reasons).map((r) => (
              <li key={r.code} className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/80">
                <span className="font-mono text-[10px] font-semibold uppercase text-zinc-500">
                  {r.code}
                </span>
                <p className="mt-0.5 leading-snug">{r.detail}</p>
              </li>
            ))}
          </ul>

          {typeof state.row.aiSummary === 'string' &&
          state.row.aiSummary.trim().length > 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/70">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                PM insight
              </h4>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-zinc-800 dark:text-zinc-200">
                {state.row.aiSummary.trim()}
              </pre>
            </div>
          ) : null}

          <EvaluationHistorySection historyState={historyState} />
        </div>
      ) : null}
    </div>
  );
}
