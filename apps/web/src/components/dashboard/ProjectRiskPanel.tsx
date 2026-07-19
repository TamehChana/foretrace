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
  recommendations?: unknown;
  aiSummary?: string | null;
  mlPrediction?: unknown;
  evaluatedAt: string;
};

type RiskHistoryRow = {
  id: string;
  level: RiskLevel;
  score: number;
  reasons: unknown;
  recommendations?: unknown;
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
  /** Top-class probability 0–1 when available. */
  confidence: number | null;
};

const RISK_LEVEL_PLAIN: Record<RiskLevel, string> = {
  LOW: 'low risk',
  MEDIUM: 'medium risk',
  HIGH: 'high risk',
  CRITICAL: 'critical risk',
};

const LEVEL_RANK: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function pressurePlainEnglish(index: number): string {
  if (index >= 0.75) {
    return 'The model sees strong deadline / slip pressure — delivery may be running late against the schedule.';
  }
  if (index >= 0.45) {
    return 'The model sees moderate deadline pressure — worth watching near-term due dates.';
  }
  if (index >= 0.2) {
    return 'The model sees light deadline pressure — schedule looks mostly manageable.';
  }
  return 'The model sees little deadline pressure from the current signals.';
}

function mlAgreementPlainEnglish(
  ruleLevel: RiskLevel,
  mlLevel: RiskLevel,
): string {
  if (ruleLevel === mlLevel) {
    return `It agrees with the rule engine (${RISK_LEVEL_PLAIN[ruleLevel]}).`;
  }
  if (LEVEL_RANK[mlLevel] > LEVEL_RANK[ruleLevel]) {
    return `It is more concerned than the rule engine (rules: ${RISK_LEVEL_PLAIN[ruleLevel]}; model: ${RISK_LEVEL_PLAIN[mlLevel]}). Use this as a second opinion, not the official score.`;
  }
  return `It is less concerned than the rule engine (rules: ${RISK_LEVEL_PLAIN[ruleLevel]}; model: ${RISK_LEVEL_PLAIN[mlLevel]}). The rule engine still drives alerts.`;
}

function describeMlForPm(
  ml: MlRiskPrediction,
  ruleLevel: RiskLevel,
): { headline: string; body: string } {
  const conf =
    ml.confidence !== null
      ? ` (about ${Math.round(ml.confidence * 100)}% confident)`
      : '';
  const headline = `Second opinion: ${RISK_LEVEL_PLAIN[ml.predictedLevel]}${conf}`;
  const body = [
    mlAgreementPlainEnglish(ruleLevel, ml.predictedLevel),
    pressurePlainEnglish(ml.deadlinePressureIndex),
  ].join(' ');
  return { headline, body };
}

type TraceAnalystReadiness = {
  openAiConfigured: boolean;
  openAiRiskModel: string;
  openAiImpactModel: string;
  mlRiskEnabled: boolean;
  githubLinked: boolean;
  snapshotComputedAt: string | null;
  snapshotWindowHours: number | null;
  schedule: {
    activeCount: number;
    overdueCount: number;
    dueWithin7DaysCount: number;
    dueWithin3DaysCount: number;
    dueSoonLowProgressCount: number;
  } | null;
  riskEvaluatedAt: string | null;
  riskLevel: string | null;
  riskScore: number | null;
  riskStaleVsSnapshot: boolean;
  recentTerminalBatchesInWindow: number | null;
  githubWebhookEventsInWindow: number | null;
  readinessScore: number;
  readinessHints: string[];
};

type ImpactHistoryRow = {
  id: string;
  analysis: string;
  usedOpenAi: boolean;
  snapshotComputedAt: string;
  createdAt: string;
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
  let confidence: number | null = null;
  const probs = o.classProbabilities;
  if (probs && typeof probs === 'object') {
    const p = (probs as Record<string, unknown>)[predictedLevel];
    if (typeof p === 'number' && Number.isFinite(p)) {
      confidence = Math.max(0, Math.min(1, p));
    }
  }
  return {
    modelVersion,
    predictedLevel,
    deadlinePressureIndex: Math.max(0, Math.min(1, idx)),
    confidence,
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

/** Soften machine-oriented Trace Analyst section labels for PM reading. Storage format unchanged. */
function formatTraceAnalystForDisplay(raw: string): string {
  return raw
    .replace(/^VERDICT:\s*ON_TRACK\b/im, 'Outlook: On track')
    .replace(/^VERDICT:\s*WATCH\b/im, 'Outlook: Watch closely')
    .replace(
      /^VERDICT:\s*ELEVATED_FRICTION\b/im,
      'Outlook: Elevated delivery friction',
    )
    .replace(/^VERDICT:\s*AT_RISK\b/im, 'Outlook: At risk of slipping delivery')
    .replace(/^EXECUTIVE READ\s*$/gim, 'In plain terms')
    .replace(/^EVIDENCE\s*$/gim, 'What the signals show')
    .replace(/^MODEL SECOND OPINION\s*$/gim, 'Model second opinion')
    .replace(/^SCHEDULE\s*$/gim, 'Schedule')
    .replace(/^SCHEDULE AND DEADLINES\s*$/gim, 'Schedule and deadlines')
    .replace(/^SCHEDULE ROLLUP\s*$/gim, 'Schedule snapshot')
    .replace(/^COLLABORATION AND GITHUB\s*$/gim, 'Collaboration and GitHub')
    .replace(
      /^TERMINAL AND ENGINEERING FRICTION\s*$/gim,
      'Engineering friction (terminal)',
    )
    .replace(/^RISK CROSS-CHECK\s*$/gim, 'Risk cross-check')
    .replace(/^LATEST SAVED RISK\s*$/gim, 'Latest saved risk')
    .replace(/^NEXT ACTIONS\s*$/gim, 'Suggested next steps')
    .replace(/^FEASIBILITY READ\s*$/gim, 'Feasibility')
    .replace(/^CONFIDENCE:\s*/gim, 'Evidence completeness: ');
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
                        <span
                          title={
                            describeMlForPm(ml, h.level).body
                          }
                        >
                          {ml.predictedLevel}
                          {ml.confidence !== null ? (
                            <span className="tabular-nums text-zinc-500">
                              {' '}
                              ({Math.round(ml.confidence * 100)}%)
                            </span>
                          ) : null}
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
  const [readinessState, setReadinessState] = useState<
    | { status: 'idle' | 'loading' }
    | { status: 'ok'; data: TraceAnalystReadiness }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [impactHistoryState, setImpactHistoryState] = useState<
    | { status: 'idle' | 'loading' }
    | { status: 'ok'; rows: ImpactHistoryRow[] }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const loadReadiness = useCallback(async () => {
    setReadinessState({ status: 'loading' });
    const res = await apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/insights/readiness`,
    );
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      setReadinessState({
        status: 'error',
        message: formatApiErrorResponse(raw, res.status),
      });
      return;
    }
    const body = raw as { data?: TraceAnalystReadiness };
    if (!body.data || typeof body.data.readinessScore !== 'number') {
      setReadinessState({ status: 'error', message: 'Invalid readiness response' });
      return;
    }
    setReadinessState({ status: 'ok', data: body.data });
  }, [organizationId, projectId]);

  const loadImpactHistory = useCallback(async () => {
    setImpactHistoryState({ status: 'loading' });
    const res = await apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/insights/history?limit=5`,
    );
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      setImpactHistoryState({
        status: 'error',
        message: formatApiErrorResponse(raw, res.status),
      });
      return;
    }
    const body = raw as { data?: unknown };
    const arr = Array.isArray(body.data) ? body.data : [];
    const rows: ImpactHistoryRow[] = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const o = item as Record<string, unknown>;
      if (
        typeof o.id === 'string' &&
        typeof o.analysis === 'string' &&
        typeof o.usedOpenAi === 'boolean' &&
        typeof o.snapshotComputedAt === 'string' &&
        typeof o.createdAt === 'string'
      ) {
        rows.push({
          id: o.id,
          analysis: o.analysis,
          usedOpenAi: o.usedOpenAi,
          snapshotComputedAt: o.snapshotComputedAt,
          createdAt: o.createdAt,
        });
      }
    }
    setImpactHistoryState({ status: 'ok', rows });
  }, [organizationId, projectId]);

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
        recommendations: o.recommendations,
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
    void loadReadiness();
    void loadImpactHistory();
  }, [load, loadHistory, loadReadiness, loadImpactHistory, refreshKey]);

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
    void loadReadiness();
  }, [organizationId, projectId, load, loadHistory, loadReadiness, showToast, onEvaluated]);

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
    void loadReadiness();
    void loadImpactHistory();
  }, [organizationId, projectId, showToast, onEvaluated, loadReadiness, loadImpactHistory]);

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
            row. Task status, progress, and deadline changes auto-refresh the score
            within ~30s. <span className="font-semibold">Trace Analyst</span> runs a
            deeper read (tasks, GitHub activity, terminal) and saves history.
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

      {readinessState.status === 'ok' ? (
        <div className="mt-3 rounded-lg border border-sky-200/80 bg-sky-50/50 px-3 py-2 dark:border-sky-900/50 dark:bg-sky-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-200">
              Trace Analyst readiness
            </h4>
            <span className="text-[10px] font-semibold tabular-nums text-sky-800 dark:text-sky-200">
              {readinessState.data.readinessScore}/100
            </span>
          </div>
          <ul className="mt-1.5 space-y-0.5 text-[11px] text-sky-950/90 dark:text-sky-100/90">
            <li>
              OpenAI:{' '}
              {readinessState.data.openAiConfigured
                ? `on (${readinessState.data.openAiImpactModel})`
                : 'off — heuristic only'}
            </li>
            <li>
              ML risk: {readinessState.data.mlRiskEnabled ? 'on' : 'off'} · GitHub:{' '}
              {readinessState.data.githubLinked ? 'linked' : 'not linked'}
            </li>
            {readinessState.data.schedule ? (
              <li>
                Schedule: {readinessState.data.schedule.overdueCount} overdue ·{' '}
                {readinessState.data.schedule.dueWithin7DaysCount} due ≤7d
              </li>
            ) : null}
            {readinessState.data.snapshotComputedAt ? (
              <li>
                Snapshot: {formatWhen(readinessState.data.snapshotComputedAt)}
                {readinessState.data.riskStaleVsSnapshot
                  ? ' · risk evaluation stale — click Evaluate'
                  : null}
              </li>
            ) : null}
            {readinessState.data.readinessHints.map((h) => (
              <li key={h} className="text-amber-900 dark:text-amber-200">
                → {h}
              </li>
            ))}
          </ul>
        </div>
      ) : readinessState.status === 'loading' ? (
        <Skeleton className="mt-3 h-16 w-full" />
      ) : null}

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
          <p className="mt-1 text-[10px] leading-snug text-violet-900/80 dark:text-violet-200/75">
            Explains delivery signals for this project — does not set the official risk
            score.
          </p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-violet-950 dark:text-violet-100">
            {formatTraceAnalystForDisplay(impactState.analysis)}
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

      {impactHistoryState.status === 'ok' && impactHistoryState.rows.length > 0 ? (
        <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            Saved Trace Analyst reads ({impactHistoryState.rows.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {impactHistoryState.rows.map((row) => (
              <li
                key={row.id}
                className="rounded border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <p className="text-[10px] text-zinc-500">
                  {row.usedOpenAi ? 'OpenAI' : 'Heuristic'} · {formatWhen(row.createdAt)}
                </p>
                <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-zinc-800 dark:text-zinc-200">
                  {formatTraceAnalystForDisplay(row.analysis).slice(0, 400)}
                  {row.analysis.length > 400 ? '…' : ''}
                </p>
              </li>
            ))}
          </ul>
        </details>
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
            const copy = describeMlForPm(ml, state.row.level);
            return (
              <div className="rounded-lg border border-indigo-200/80 bg-indigo-50/50 px-3 py-2 dark:border-indigo-900/50 dark:bg-indigo-950/30">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-200">
                  Model second opinion
                </h4>
                <p className="mt-1 text-[13px] font-medium text-indigo-950 dark:text-indigo-100">
                  {copy.headline}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-indigo-950/95 dark:text-indigo-100/95">
                  {copy.body}
                </p>
                <p className="mt-1.5 text-[10px] leading-snug text-indigo-900/75 dark:text-indigo-200/70">
                  Official score and alerts still come from the rule engine. Model:{' '}
                  {ml.modelVersion} · deadline pressure{' '}
                  {Math.round(ml.deadlinePressureIndex * 100)}%.
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

          {parseReasons(state.row.recommendations).length > 0 ? (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Recommendations
              </h4>
              <ul className="mt-2 space-y-2 text-[12px] text-zinc-700 dark:text-zinc-300">
                {parseReasons(state.row.recommendations).map((r) => (
                  <li
                    key={r.code}
                    className="rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-2 py-1.5 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                  >
                    <span className="font-mono text-[10px] font-semibold uppercase text-emerald-800/80 dark:text-emerald-200/80">
                      {r.code}
                    </span>
                    <p className="mt-0.5 leading-snug">{r.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {typeof state.row.aiSummary === 'string' &&
          state.row.aiSummary.trim().length > 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/70">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Why this risk (Trace Analyst)
              </h4>
              <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                Explains the rule-based score from current signals — Trace Analyst does
                not change the score.
              </p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-zinc-800 dark:text-zinc-200">
                {formatTraceAnalystForDisplay(state.row.aiSummary.trim())}
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
