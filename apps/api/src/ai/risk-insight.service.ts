import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RiskLevel } from '@prisma/client';

import {
  compactProjectSignalEvidenceForAi,
  type ProjectSignalPayload,
} from '../projects/project-signals.service';
import type { RiskReasonRow } from '../projects/risk-reason.types';

export type RiskMlSecondOpinion = {
  predictedLevel: string;
  deadlinePressureIndex: number;
  /** Top-class probability when available (0–1). */
  confidence?: number | null;
  modelVersion?: string;
};

export type RiskInsightContext = {
  projectName: string;
  level: RiskLevel;
  score: number;
  reasons: RiskReasonRow[];
  /** Structured snapshot slice for models (no secrets, no raw terminal lines). */
  signalEvidence?: Record<string, unknown>;
  /** PM thumbs/comments from InsightFeedback — steers OpenAI away from repeated mistakes. */
  promptFeedbackHints?: string[];
  /**
   * Optional ML second opinion. Never authoritative — Trace Analyst must not change
   * `level` / `score`; may briefly note agreement or disagreement for the PM.
   */
  mlSecondOpinion?: RiskMlSecondOpinion | null;
};

/**
 * Produces a short PM-facing narrative + delivery outlook line.
 * Extend with RAG over incidents, async workers, or fine-tuned models — see `docs/AI.md`.
 */
@Injectable()
export class RiskInsightService {
  private readonly log = new Logger(RiskInsightService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * When a full snapshot exists, pass it as `signalEvidence` (use
   * `compactProjectSignalEvidenceForAi`) so the model can fuse tasks, GitHub, and terminal.
   * Callers should pass the same payload used for risk scoring so Trace Analyst matches rules.
   */
  async summarize(context: RiskInsightContext): Promise<string> {
    const llm = await this.tryOpenAi(context);
    if (llm) {
      return llm;
    }
    return this.heuristic(context);
  }

  /** Build evidence from a snapshot payload (convenience for callers). */
  evidenceFromSnapshot(payload: ProjectSignalPayload): Record<string, unknown> {
    return compactProjectSignalEvidenceForAi(payload);
  }

  private heuristicVerdict(ctx: RiskInsightContext): string {
    if (ctx.level === 'CRITICAL' || ctx.level === 'HIGH') {
      return 'AT_RISK';
    }
    if (ctx.level === 'MEDIUM' || ctx.score >= 35) {
      return 'ELEVATED_FRICTION';
    }
    if (ctx.level === 'LOW' && ctx.score < 22) {
      return 'ON_TRACK';
    }
    return 'WATCH';
  }

  /** One plain-language line on calendar feasibility from snapshot task counts. */
  private scheduleFeasibilityLine(
    ctx: RiskInsightContext,
  ): string | null {
    const raw = ctx.signalEvidence?.tasks;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const t = raw as Record<string, unknown>;
    const num = (k: string): number =>
      typeof t[k] === 'number' && Number.isFinite(t[k] as number)
        ? Math.trunc(t[k] as number)
        : 0;
    const overdue = num('overdueCount');
    const d3 = num('dueWithin3DaysCount');
    const low = num('dueSoonLowProgressCount');
    const d7 = num('dueWithin7DaysCount');
    const d47 = num('dueBetween4And7DaysCount');
    if (overdue > 0) {
      return `Calendar feasibility: ${overdue} active task(s) are already overdue — hitting the current plan without date or scope change is unlikely.`;
    }
    if (low > 0) {
      return `Calendar feasibility: ${low} active task(s) due within 7 days remain under 35% progress${d7 > 0 ? ` (${d7} total due this week)` : ''} — delivery on time is doubtful unless velocity picks up.`;
    }
    if (d3 > 0) {
      return `Calendar feasibility: ${d3} active task(s) land within 3 days — confirm owners and scope are realistic.`;
    }
    if (d47 > 0 && d7 > 0) {
      return `Calendar feasibility: ${d7} task(s) due within a week (${d47} in the 4–7 day window); none flagged as critically behind on progress in this rollup.`;
    }
    if (d7 > 0) {
      return `Calendar feasibility: ${d7} task(s) due within a week; monitor burn-down against deadlines.`;
    }
    return null;
  }

  private heuristic(ctx: RiskInsightContext): string {
    const verdict = this.heuristicVerdict(ctx);
    const reasonPriority = (code: string): number => {
      if (code === 'TASKS_OVERDUE') {
        return 0;
      }
      if (code.startsWith('TASK')) {
        return 1;
      }
      if (code.startsWith('TERMINAL') || code === 'TASK_SCOPED_TERMINAL') {
        return 2;
      }
      if (code.startsWith('GITHUB')) {
        return 3;
      }
      return 4;
    };
    const top = ctx.reasons
      .filter((r) => r.code !== 'BASELINE')
      .sort(
        (a, b) =>
          reasonPriority(a.code) - reasonPriority(b.code) ||
          a.detail.localeCompare(b.detail),
      )
      .slice(0, 4);
    const bullets =
      top.length > 0
        ? top.map((r) => `• ${r.detail}`).join('\n')
        : ctx.reasons.map((r) => `• ${r.detail}`).join('\n');
    const schedule = this.scheduleFeasibilityLine(ctx);
    const hasEvidence =
      ctx.signalEvidence &&
      typeof ctx.signalEvidence === 'object' &&
      Object.keys(ctx.signalEvidence as object).length > 0;
    const confidence =
      !hasEvidence || (ctx.reasons.length === 1 && ctx.reasons[0]?.code === 'BASELINE')
        ? 'CONFIDENCE: MEDIUM (rule summary only; limited snapshot context)'
        : 'CONFIDENCE: HIGH (full signal rollup attached)';
    const mlLine = this.mlSecondOpinionLine(ctx);
    const lines = [
      `VERDICT: ${verdict}`,
      '',
      'EXECUTIVE READ',
      `For “${ctx.projectName}”, the rule-based delivery risk is ${ctx.level} (score ${ctx.score}/100). This narrative explains that score from the current signals — it does not set the score.`,
      '',
      'EVIDENCE',
      bullets,
    ];
    if (mlLine) {
      lines.push('', 'MODEL SECOND OPINION', mlLine);
    }
    if (schedule) {
      lines.push('', 'SCHEDULE', schedule);
    } else {
      lines.push('', 'SCHEDULE', 'No acute schedule pressure surfaced in snapshot counts for this rollup window.');
    }
    lines.push(
      '',
      'NEXT ACTIONS',
      '1. Review overdue and imminent (≤3d) tasks and owners.',
      '2. Inspect tasks with low progress against near deadlines and terminal friction by task.',
      '3. Align on GitHub activity and branch health if the repo is linked.',
      '',
      confidence,
    );
    return lines.join('\n').slice(0, 8000);
  }

  private mlSecondOpinionLine(ctx: RiskInsightContext): string | null {
    const ml = ctx.mlSecondOpinion;
    if (!ml?.predictedLevel) {
      return null;
    }
    const pressure = Number.isFinite(ml.deadlinePressureIndex)
      ? Math.round(Math.max(0, Math.min(1, ml.deadlinePressureIndex)) * 100)
      : null;
    const conf =
      typeof ml.confidence === 'number' && Number.isFinite(ml.confidence)
        ? Math.round(Math.max(0, Math.min(1, ml.confidence)) * 100)
        : null;
    const agree =
      ml.predictedLevel === ctx.level
        ? `agrees with the rule engine (${ctx.level})`
        : `differs from the rule engine (rules: ${ctx.level}; model: ${ml.predictedLevel}) — treat as a second opinion only`;
    const bits = [agree];
    if (conf !== null) {
      bits.push(`about ${conf}% confident in its own level`);
    }
    if (pressure !== null) {
      bits.push(`deadline pressure about ${pressure}%`);
    }
    return `The learned model ${bits.join('; ')}.`;
  }

  private buildScheduleSummary(
    evidence: Record<string, unknown> | undefined,
  ): Record<string, number | null> | null {
    const raw = evidence?.tasks;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const t = raw as Record<string, unknown>;
    const num = (k: string): number | null => {
      const v = t[k];
      return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
    };
    return {
      activeCount: num('activeCount'),
      overdueCount: num('overdueCount'),
      dueWithin7DaysCount: num('dueWithin7DaysCount'),
      dueWithin3DaysCount: num('dueWithin3DaysCount'),
      dueBetween4And7DaysCount: num('dueBetween4And7DaysCount'),
      dueSoonLowProgressCount: num('dueSoonLowProgressCount'),
    };
  }

  private openAiKey(): string | null {
    const k =
      this.config.get<string>('OPENAI_API_KEY')?.trim() ??
      process.env.OPENAI_API_KEY?.trim();
    return k && k.length > 0 ? k : null;
  }

  private openAiModel(): string {
    return (
      this.config.get<string>('OPENAI_RISK_MODEL')?.trim() ??
      process.env.OPENAI_RISK_MODEL?.trim() ??
      'gpt-4o-mini'
    );
  }

  private async tryOpenAi(ctx: RiskInsightContext): Promise<string | null> {
    const key = this.openAiKey();
    if (!key) {
      return null;
    }
    const model = this.openAiModel();
    const system = [
      "You are Trace Analyst, Foretrace's delivery copilot for busy project managers.",
      'Write in clear plain English. Avoid jargon, env-var names, and developer slang unless quoting a reason detail.',
      'You receive JSON: authoritative rule-based risk (level, score, reasons), optional `mlSecondOpinion` (non-authoritative), `scheduleSummary`, and `signalEvidence`.',
      'CRITICAL: Never change, restate as if deciding, or override `level` or `score`. Those come only from the rule engine. Your job is to explain why that score makes sense from the evidence.',
      'If `mlSecondOpinion` is present and its predictedLevel differs from `level`, briefly note the disagreement as a second opinion only — do not adopt the ML level as the official risk.',
      'Always explicitly address schedule / landing feasibility using `scheduleSummary` when any of overdueCount, dueWithin3DaysCount, dueSoonLowProgressCount, or dueWithin7DaysCount is greater than zero.',
      'When `promptFeedbackHints` is non-empty, adjust tone and emphasis per PM feedback without inventing facts.',
      'Do not invent facts not supported by the JSON. Do not mention secrets or tokens.',
      'Output plain text only (no markdown # headings). Use the exact section labels below so the UI stays scannable.',
      'Line 1 MUST be exactly one of: VERDICT: ON_TRACK | VERDICT: WATCH | VERDICT: ELEVATED_FRICTION | VERDICT: AT_RISK',
      'Then use these sections in order, each title on its own line followed by content:',
      'EXECUTIVE READ — 1–2 plain sentences for a PM: what delivery situation looks like and why, citing the given level/score.',
      'EVIDENCE — 2–4 short lines; merge `reasons` with concrete numbers from `scheduleSummary` and `signalEvidence` (GitHub / terminal) where relevant.',
      'MODEL SECOND OPINION — include only when `mlSecondOpinion` is non-null; one short paragraph on agreement/disagreement and deadline pressure; remind that rules remain official.',
      'SCHEDULE — one short paragraph on dates and feasibility (or say "No acute schedule pressure in counts" if counts are all zero).',
      'NEXT ACTIONS — numbered list 1.–3. of practical PM moves grounded in the JSON.',
      'CONFIDENCE — one line: CONFIDENCE: HIGH | CONFIDENCE: MEDIUM | CONFIDENCE: LOW based on how complete `signalEvidence` is (empty or sparse JSON → LOW or MEDIUM).',
    ].join(' ');
    const scheduleSummary = this.buildScheduleSummary(ctx.signalEvidence);
    const user = JSON.stringify({
      projectName: ctx.projectName,
      level: ctx.level,
      score: ctx.score,
      reasons: ctx.reasons,
      scheduleSummary,
      signalEvidence: ctx.signalEvidence ?? {},
      promptFeedbackHints: ctx.promptFeedbackHints ?? [],
      mlSecondOpinion: ctx.mlSecondOpinion ?? null,
      note: 'level and score are authoritative from the rule engine; explain them, do not replace them.',
    });
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 14_000);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          // Newer models (e.g. gpt-5.*) reject `max_tokens`; use max_completion_tokens.
          max_completion_tokens: 720,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errBody = (await res.text()).slice(0, 240);
        this.log.warn(`OpenAI risk narrative HTTP ${res.status}: ${errBody}`);
        return null;
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) {
        return null;
      }
      return text.slice(0, 8000);
    } catch (e: unknown) {
      this.log.warn(
        `OpenAI risk narrative failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    } finally {
      clearTimeout(t);
    }
  }
}
