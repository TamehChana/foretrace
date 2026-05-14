import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
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
  mlPrediction?: unknown;
  evaluatedAt: string;
};

type RiskHistoryRow = {
  id: string;
  level: RiskLevel;
  score: number;
  reasons: unknown;
  aiSummary?: string | null;
  mlPrediction?: unknown;
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

type MlRiskPrediction = {
  modelVersion: string;
  predictedLevel: RiskLevel;
  deadlinePressureIndex: number;
};

function parseMlRiskPrediction(raw: unknown): MlRiskPrediction | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const modelVersion =
    typeof o.modelVersion === 'string' ? o.modelVersion : null;
  const predictedLevel = o.predictedLevel;
  const idx = o.deadlinePressureIndex;
  if (!modelVersion || !isRiskLevel(predictedLevel) || typeof idx !== 'number' || !Number.isFinite(idx)) {
    return null;
  }
  return {
    modelVersion,
    predictedLevel,
    deadlinePressureIndex: Math.max(0, Math.min(1, idx)),
  };
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
                <th className="px-2 py-1 font-medium">ML</th>
              </tr>
            </thead>
            <tbody>
              {historyState.rows.map((h: RiskHistoryRow) => {
                const first = parseReasons(h.reasons)[0];
                const insight =
                  typeof h.aiSummary === 'string' && h.aiSummary.trim().length > 0
                    ? h.aiSummary.trim()
                    : null;
                const ml = parseMlRiskPrediction(h.mlPrediction);
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
                    <td className="whitespace-nowrap px-2 py-1 text-zinc-600 dark:text-zinc-400">
                      {ml ? (
                        <span title={`${ml.modelVersion} · slip index`}>
                          {ml.predictedLevel}{' '}
                          <span className="tabular-nums text-zinc-500">
                            ({Math.round(ml.deadlinePressureIndex * 100)}%)
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
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
  const [impactState, setImpactState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | {
        status: 'ok';
        analysis: string;
        usedOpenAi: boolean;
        snapshotComputedAt: string;
      }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<
    'RISK_SUMMARY' | 'PROJECT_IMPACT_ANALYSIS' | null
  >(null);

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
        mlPrediction: o.mlPrediction,
        evaluatedAt,
      });
    }
    setHistoryState({ status: 'ok', rows });
  }, [organizationId, projectId]);

  useEffect(() => {
    void load();
    void loadHistory();
  }, [load, loadHistory, refreshKey]);

  useEffect(() => {
    setImpactState({ status: 'idle' });
  }, [organizationId, projectId, refreshKey]);

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

  const analyzeImpact = useCallback(async () => {
    setImpactState({ status: 'loading' });
    const res = await apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/insights/analyze`,
      { method: 'POST' },
    );
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = formatApiErrorResponse(raw, res.status);
      setImpactState({ status: 'error', message: msg });
      showToast(msg, 'error');
      return;
    }
    const body = raw as {
      data?: {
        analysis?: unknown;
        usedOpenAi?: unknown;
        snapshotComputedAt?: unknown;
      };
    };
    const d = body.data;
    const analysis =
      typeof d?.analysis === 'string' && d.analysis.trim().length > 0
        ? d.analysis.trim()
        : null;
    const usedOpenAi = d?.usedOpenAi === true;
    const snapshotComputedAt =
      typeof d?.snapshotComputedAt === 'string' ? d.snapshotComputedAt : '';
    if (!analysis) {
      const msg = 'Unexpected response from Trace Analyst';
      setImpactState({ status: 'error', message: msg });
      showToast(msg, 'error');
      return;
    }
    setImpactState({
      status: 'ok',
      analysis,
      usedOpenAi,
      snapshotComputedAt,
    });
    showToast(
      usedOpenAi ? 'Trace Analyst ready (OpenAI)' : 'Trace Analyst ready',
      'success',
    );
    onEvaluated?.();
  }, [organizationId, projectId, showToast, onEvaluated]);

  const submitInsightFeedback = useCallback(
    async (
      kind: 'RISK_SUMMARY' | 'PROJECT_IMPACT_ANALYSIS',
      helpful: boolean,
    ) => {
      setFeedbackSubmitting(kind);
      try {
        const res = await apiFetch(
          `/organizations/${organizationId}/projects/${projectId}/insight-feedback`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind, helpful }),
          },
        );
        const raw: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          showToast(formatApiErrorResponse(raw, res.status), 'error');
          return;
        }
        showToast('Thanks — feedback saved', 'success');
      } catch (err: unknown) {
        showToast(
          err instanceof Error ? err.message : 'Failed to save feedback',
          'error',
        );
      } finally {
        setFeedbackSubmitting(null);
      }
    },
    [organizationId, projectId, showToast],
  );

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
            row. Use <span className="font-semibold">Trace Analyst</span> for a
            separate narrative read (tasks + incidents + rollup); it refreshes the
            snapshot but does not persist — inference only, not model training.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
          <button
            type="button"
            title="Refresh signals and run Trace Analyst (OpenAI if configured)"
            disabled={impactState.status === 'loading'}
            onClick={() => {
              void analyzeImpact();
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-950 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100 dark:hover:bg-violet-900/70"
          >
            <Sparkles size={12} strokeWidth={2} aria-hidden />
            {impactState.status === 'loading' ? 'Analyzing…' : 'Trace Analyst'}
          </button>
          {canManage ? (
            <button
              type="button"
              title="Recompute risk from latest signals"
              onClick={() => {
                void evaluate();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <RefreshCw size={12} strokeWidth={2} aria-hidden />
              Evaluate
            </button>
          ) : null}
        </div>
      </div>

      {impactState.status === 'ok' ? (
        <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 dark:border-violet-900/60 dark:bg-violet-950/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
              Trace Analyst read
            </h4>
            <span className="text-[10px] text-violet-700/90 dark:text-violet-300/90">
              {impactState.usedOpenAi ? 'OpenAI' : 'Heuristic'} · snapshot{' '}
              {formatWhen(impactState.snapshotComputedAt)}
            </span>
          </div>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-violet-950 dark:text-violet-100">
            {impactState.analysis}
          </pre>
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-violet-200/80 pt-2 dark:border-violet-800/60">
            <span className="text-[10px] text-violet-800 dark:text-violet-200">
              Was this Trace Analyst read helpful?
            </span>
            <button
              type="button"
              disabled={feedbackSubmitting === 'PROJECT_IMPACT_ANALYSIS'}
              onClick={() => {
                void submitInsightFeedback('PROJECT_IMPACT_ANALYSIS', true);
              }}
              className="inline-flex items-center gap-0.5 rounded border border-violet-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100 dark:hover:bg-violet-900"
            >
              <ThumbsUp size={11} aria-hidden />
              Yes
            </button>
            <button
              type="button"
              disabled={feedbackSubmitting === 'PROJECT_IMPACT_ANALYSIS'}
              onClick={() => {
                void submitInsightFeedback('PROJECT_IMPACT_ANALYSIS', false);
              }}
              className="inline-flex items-center gap-0.5 rounded border border-violet-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100 dark:hover:bg-violet-900"
            >
              <ThumbsDown size={11} aria-hidden />
              No
            </button>
          </div>
        </div>
      ) : impactState.status === 'error' ? (
        <p className="mt-3 text-[12px] text-rose-600 dark:text-rose-400">
          {impactState.message}
        </p>
      ) : null}

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
          {(() => {
            const ml = parseMlRiskPrediction(state.row.mlPrediction);
            if (!ml) {
              return null;
            }
            return (
              <div className="rounded-lg border border-indigo-200/80 bg-indigo-50/50 px-3 py-2 dark:border-indigo-900/50 dark:bg-indigo-950/30">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-200">
                  ML cross-check
                </h4>
                <p className="mt-1 text-[12px] text-indigo-950 dark:text-indigo-100">
                  Predicted level{' '}
                  <span className="font-semibold">{ml.predictedLevel}</span>
                  {' · '}
                  Deadline pressure index{' '}
                  <span className="font-semibold tabular-nums">
                    {(ml.deadlinePressureIndex * 100).toFixed(0)}%
                  </span>
                  <span className="text-[10px] font-normal text-indigo-800/80 dark:text-indigo-200/80">
                    {' '}
                    ({ml.modelVersion})
                  </span>
                </p>
                <p className="mt-1 text-[10px] leading-snug text-indigo-900/85 dark:text-indigo-200/80">
                  Rule-based score and level remain authoritative for alerts; ML is an additional signal (see
                  docs/ML-RISK.md). Enable with FORETRACE_ML_RISK_ENABLED=1 on the API.
                </p>
              </div>
            );
          })()}
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
                Trace Analyst — risk
              </h4>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-zinc-800 dark:text-zinc-200">
                {state.row.aiSummary.trim()}
              </pre>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50/50 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <span className="text-[10px] text-zinc-600 dark:text-zinc-400">
              Was this risk evaluation helpful?
            </span>
            <button
              type="button"
              disabled={feedbackSubmitting === 'RISK_SUMMARY'}
              onClick={() => {
                void submitInsightFeedback('RISK_SUMMARY', true);
              }}
              className="inline-flex items-center gap-0.5 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <ThumbsUp size={11} aria-hidden />
              Yes
            </button>
            <button
              type="button"
              disabled={feedbackSubmitting === 'RISK_SUMMARY'}
              onClick={() => {
                void submitInsightFeedback('RISK_SUMMARY', false);
              }}
              className="inline-flex items-center gap-0.5 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <ThumbsDown size={11} aria-hidden />
              No
            </button>
          </div>

          <EvaluationHistorySection historyState={historyState} />
        </div>
      ) : null}
    </div>
  );
}
