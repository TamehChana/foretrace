import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RiskLevel } from '@prisma/client';

import type { RiskReasonRow } from '../projects/risk-reason.types';

export type RiskInsightContext = {
  projectName: string;
  level: RiskLevel;
  score: number;
  reasons: RiskReasonRow[];
};

/**
 * Produces a short PM-facing narrative. Replace or extend with fine-tuned models,
 * RAG over incidents, or a dedicated inference service — see `docs/AI.md`.
 */
@Injectable()
export class RiskInsightService {
  private readonly log = new Logger(RiskInsightService.name);

  constructor(private readonly config: ConfigService) {}

  async summarize(context: RiskInsightContext): Promise<string> {
    const llm = await this.tryOpenAi(context);
    if (llm) {
      return llm;
    }
    return this.heuristic(context);
  }

  private heuristic(ctx: RiskInsightContext): string {
    const top = ctx.reasons
      .filter((r) => r.code !== 'BASELINE')
      .slice(0, 4);
    const bullets =
      top.length > 0
        ? top.map((r) => `• ${r.detail}`).join('\n')
        : ctx.reasons.map((r) => `• ${r.detail}`).join('\n');
    return [
      `Delivery risk is ${ctx.level} (score ${ctx.score}/100) for “${ctx.projectName}”.`,
      '',
      'Signals considered:',
      bullets,
      '',
      'Next: review overdue and due-soon tasks, check recent terminal friction, and align on GitHub activity if the repo is linked.',
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
    const system =
      'You are a senior delivery lead. Write 2–4 short sentences: plain English, no hype, cite concrete signals from the JSON. No markdown headings.';
    const user = JSON.stringify({
      projectName: ctx.projectName,
      level: ctx.level,
      score: ctx.score,
      reasons: ctx.reasons,
    });
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.25,
          max_tokens: 400,
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
