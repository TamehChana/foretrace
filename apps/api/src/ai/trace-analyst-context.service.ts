import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { InsightFeedbackKind } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { ProjectSignalPayload } from '../projects/project-signals.service';

export type TraceAnalystReadiness = {
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

@Injectable()
export class TraceAnalystContextService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  mlRiskEnabled(): boolean {
    const raw =
      this.config.get<string>('FORETRACE_ML_RISK_ENABLED')?.trim() ??
      process.env.FORETRACE_ML_RISK_ENABLED?.trim();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  openAiConfigured(): boolean {
    const k =
      this.config.get<string>('OPENAI_API_KEY')?.trim() ??
      process.env.OPENAI_API_KEY?.trim();
    return Boolean(k && k.length > 0);
  }

  openAiRiskModel(): string {
    return (
      this.config.get<string>('OPENAI_RISK_MODEL')?.trim() ??
      process.env.OPENAI_RISK_MODEL?.trim() ??
      'gpt-4o-mini'
    );
  }

  openAiImpactModel(): string {
    return (
      this.config.get<string>('OPENAI_IMPACT_MODEL')?.trim() ??
      process.env.OPENAI_IMPACT_MODEL?.trim() ??
      this.openAiRiskModel()
    );
  }

  feedbackHintsEnabled(): boolean {
    const raw =
      this.config.get<string>('FORETRACE_AI_USE_FEEDBACK_HINTS')?.trim() ??
      process.env.FORETRACE_AI_USE_FEEDBACK_HINTS?.trim();
    if (raw === '0' || raw === 'false' || raw === 'no') {
      return false;
    }
    return true;
  }

  /** Recent PM thumbs/comments to steer OpenAI (no PII beyond stored comments). */
  async promptFeedbackHints(
    projectId: string,
    kind: InsightFeedbackKind,
    limit = 8,
  ): Promise<string[]> {
    if (!this.feedbackHintsEnabled()) {
      return [];
    }
    const rows = await this.prisma.insightFeedback.findMany({
      where: { projectId, kind },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 20),
      select: { helpful: true, comment: true, createdAt: true },
    });
    if (rows.length === 0) {
      return [];
    }
    const hints: string[] = [];
    const unhelpful = rows.filter((r) => !r.helpful);
    const helpful = rows.filter((r) => r.helpful);
    if (unhelpful.length > 0) {
      hints.push(
        `${unhelpful.length} recent "${kind}" narrative(s) were marked not helpful by PMs — avoid repeating vague GitHub-only summaries; lead with schedule and named task pressure when counts support it.`,
      );
      for (const r of unhelpful) {
        const c = r.comment?.trim();
        if (c) {
          hints.push(`PM critique (${r.createdAt.toISOString().slice(0, 10)}): ${c.slice(0, 280)}`);
        }
      }
    }
    if (helpful.length >= 2 && unhelpful.length === 0) {
      hints.push(
        `Recent "${kind}" feedback is positive — keep structured sections and concrete counts from JSON.`,
      );
    }
    return hints.slice(0, 6);
  }

  async getReadiness(
    projectId: string,
    organizationId: string,
  ): Promise<TraceAnalystReadiness> {
    const [snapshot, risk, github] = await Promise.all([
      this.prisma.projectSignalSnapshot.findUnique({
        where: { projectId },
        select: { payload: true, computedAt: true, windowHours: true },
      }),
      this.prisma.projectRiskEvaluation.findUnique({
        where: { projectId },
        select: { level: true, score: true, evaluatedAt: true },
      }),
      this.prisma.gitHubConnection.findUnique({
        where: { projectId },
        select: { id: true },
      }),
    ]);

    const payload = snapshot?.payload as ProjectSignalPayload | undefined;
    const schedule = payload?.tasks
      ? {
          activeCount: payload.tasks.activeCount,
          overdueCount: payload.tasks.overdueCount,
          dueWithin7DaysCount: payload.tasks.dueWithin7DaysCount,
          dueWithin3DaysCount: payload.tasks.dueWithin3DaysCount ?? 0,
          dueSoonLowProgressCount: payload.tasks.dueSoonLowProgressCount ?? 0,
        }
      : null;

    const riskStaleVsSnapshot =
      Boolean(
        risk &&
          snapshot &&
          risk.evaluatedAt.getTime() < snapshot.computedAt.getTime() - 1000,
      );

    const hints: string[] = [];
    let readinessScore = 0;

    if (this.openAiConfigured()) {
      readinessScore += 35;
    } else {
      hints.push('Set OPENAI_API_KEY on the API for LLM narratives (heuristic-only today).');
    }

    if (snapshot) {
      readinessScore += 25;
    } else {
      hints.push('No signal snapshot yet — run Evaluate or wait for webhook/ingest refresh.');
    }

    if (github) {
      readinessScore += 15;
    } else {
      hints.push('Link a GitHub repo on this project for collaboration signals.');
    }

    if (schedule && schedule.overdueCount > 0) {
      hints.push(
        `${schedule.overdueCount} active task(s) overdue — Trace Analyst should mention TASKS_OVERDUE after Evaluate.`,
      );
    }

    if (riskStaleVsSnapshot) {
      hints.push('Risk evaluation is older than the latest snapshot — click Evaluate to sync.');
    } else if (risk) {
      readinessScore += 15;
    }

    const termBatches = payload?.terminal?.batchesInWindow ?? null;
    if (typeof termBatches === 'number' && termBatches > 0) {
      readinessScore += 10;
    } else {
      hints.push('No terminal batches in the window — use foretrace CLI or VS Code extension.');
    }

    if (this.mlRiskEnabled()) {
      readinessScore += 5;
    }

    return {
      openAiConfigured: this.openAiConfigured(),
      openAiRiskModel: this.openAiRiskModel(),
      openAiImpactModel: this.openAiImpactModel(),
      mlRiskEnabled: this.mlRiskEnabled(),
      githubLinked: Boolean(github),
      snapshotComputedAt: snapshot?.computedAt.toISOString() ?? null,
      snapshotWindowHours: snapshot?.windowHours ?? null,
      schedule,
      riskEvaluatedAt: risk?.evaluatedAt.toISOString() ?? null,
      riskLevel: risk?.level ?? null,
      riskScore: risk?.score ?? null,
      riskStaleVsSnapshot,
      recentTerminalBatchesInWindow: termBatches,
      githubWebhookEventsInWindow:
        payload?.github?.webhookEventsInWindow ?? null,
      readinessScore: Math.min(100, readinessScore),
      readinessHints: hints,
    };
  }
}
