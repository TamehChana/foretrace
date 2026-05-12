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

  private heuristic(ctx: RiskInsightContext): string {
    const verdict = this.heuristicVerdict(ctx);
    const top = ctx.reasons
      .filter((r) => r.code !== 'BASELINE')
      .slice(0, 4);
    const bullets =
      top.length > 0
        ? top.map((r) => `• ${r.detail}`).join('\n')
        : ctx.reasons.map((r) => `• ${r.detail}`).join('\n');
    return [
      `VERDICT: ${verdict}`,
      '',
      `Delivery risk is ${ctx.level} (score ${ctx.score}/100) for “${ctx.projectName}”.`,
      '',
      'Signals considered:',
      bullets,
      '',
      'Next: review overdue and due-soon tasks, check terminal friction by task and by CLI token owner, and align on GitHub activity if the repo is linked.',
    ]
      .join('\n')
      .slice(0, 8000);
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
      'You are a senior software delivery lead.',
      'You receive JSON: rule-based risk (level, score, reasons) plus `signalEvidence` (tasks counts, GitHub rollup, terminal aggregates, task-linked terminal rows, per-user CLI token mint activity).',
      'Do not invent facts not supported by the JSON. Do not mention secrets or tokens.',
      'Output plain text (no markdown headings).',
      'First line MUST be exactly one of: VERDICT: ON_TRACK | VERDICT: WATCH | VERDICT: ELEVATED_FRICTION | VERDICT: AT_RISK',
      'Then 2–5 short sentences explaining why, citing concrete numbers from signalEvidence where possible.',
    ].join(' ');
    const user = JSON.stringify({
      projectName: ctx.projectName,
      level: ctx.level,
      score: ctx.score,
      reasons: ctx.reasons,
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
