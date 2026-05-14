import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RiskLevel } from '@prisma/client';

import {
  compactProjectSignalEvidenceForAi,
  type ProjectSignalPayload,
} from '../projects/project-signals.service';
import type { RiskReasonRow } from '../projects/risk-reason.types';

export type RiskInsightContext = {
  projectName: string;
  level: RiskLevel;
  score: number;
  reasons: RiskReasonRow[];
  /** Structured snapshot slice for models (no secrets, no raw terminal lines). */
  signalEvidence?: Record<string, unknown>;
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
    const top = ctx.reasons
      .filter((r) => r.code !== 'BASELINE')
      .slice(0, 4);
    const bullets =
      top.length > 0
        ? top.map((r) => `• ${r.detail}`).join('\n')
        : ctx.reasons.map((r) => `• ${r.detail}`).join('\n');
    const schedule = this.scheduleFeasibilityLine(ctx);
    const lines = [
      `VERDICT: ${verdict}`,
      '',
      `Trace Analyst — delivery risk is ${ctx.level} (score ${ctx.score}/100) for “${ctx.projectName}”.`,
      '',
      'Signals considered:',
      bullets,
    ];
    if (schedule) {
      lines.push('', schedule);
    }
    lines.push(
      '',
      'Next: review overdue and imminent (≤3d) tasks, tasks due soon with low progress, check terminal friction by task and by CLI token owner, and align on GitHub activity if the repo is linked.',
    );
    return lines.join('\n').slice(0, 8000);
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
      "You are Trace Analyst, Foretrace's delivery copilot.",
      'You receive JSON: rule-based risk (level, score, reasons), `scheduleSummary` (deadline-focused task counts from the latest snapshot), and full `signalEvidence` (tasks, GitHub rollup, terminal aggregates, task-linked terminal rows, per-user CLI token mint activity).',
      'Always explicitly address schedule / landing feasibility using `scheduleSummary` when any of overdueCount, dueWithin3DaysCount, dueSoonLowProgressCount, or dueWithin7DaysCount is greater than zero (say whether on-time delivery looks realistic and what would change that).',
      'Do not invent facts not supported by the JSON. Do not mention secrets or tokens.',
      'Output plain text (no markdown headings).',
      'First line MUST be exactly one of: VERDICT: ON_TRACK | VERDICT: WATCH | VERDICT: ELEVATED_FRICTION | VERDICT: AT_RISK',
      'Then 2–5 short sentences: merge rule reasons with scheduleSummary numbers; cite concrete counts.',
    ].join(' ');
    const scheduleSummary = this.buildScheduleSummary(ctx.signalEvidence);
    const user = JSON.stringify({
      projectName: ctx.projectName,
      level: ctx.level,
      score: ctx.score,
      reasons: ctx.reasons,
      scheduleSummary,
      signalEvidence: ctx.signalEvidence ?? {},
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
          max_tokens: 500,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.log.warn(`OpenAI risk narrative HTTP ${res.status}`);
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
