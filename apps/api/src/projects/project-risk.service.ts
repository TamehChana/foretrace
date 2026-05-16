import { Injectable, Logger } from '@nestjs/common';
import { InsightFeedbackKind, Prisma } from '@prisma/client';

import { AlertsService } from '../alerts/alerts.service';
import { RiskInsightService } from '../ai/risk-insight.service';
import { TraceAnalystContextService } from '../ai/trace-analyst-context.service';
import { AuditService } from '../audit/audit.service';
import { RiskMlService } from '../ml/risk-ml.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  compactProjectSignalEvidenceForAi,
  ProjectSignalsService,
  type ProjectSignalPayload,
} from './project-signals.service';
import { ProjectsService } from './projects.service';
import { computeRiskFromPayload } from './risk-score.engine';

export type { RiskReasonRow } from './risk-reason.types';

/** Debounced rules-only risk refresh after task/signal changes (no evaluation history row). */
const RULES_REFRESH_COOLDOWN_MS = 30_000;

@Injectable()
export class ProjectRiskService {
  private readonly log = new Logger(ProjectRiskService.name);
  private readonly lastRulesRefreshAtMs = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly signals: ProjectSignalsService,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
    private readonly riskInsight: RiskInsightService,
    private readonly riskMl: RiskMlService,
    private readonly traceAnalyst: TraceAnalystContextService,
  ) {}

  /**
   * Refreshes the signal snapshot and upserts rule-based risk + heuristic narrative.
   * Skips evaluation history and alerts — use `evaluateAndPersist` for a full PM run.
   */
  scheduleRulesRefresh(projectId: string, organizationId: string): void {
    const now = Date.now();
    const last = this.lastRulesRefreshAtMs.get(projectId) ?? 0;
    if (now - last < RULES_REFRESH_COOLDOWN_MS) {
      return;
    }
    this.lastRulesRefreshAtMs.set(projectId, now);
    void this.refreshRulesFromSignals(projectId, organizationId).catch(
      (err: unknown) => {
        this.log.warn(
          `Background risk rules refresh failed for project ${projectId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      },
    );
  }

  private reasonCodesFromJson(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const codes: string[] = [];
    for (const item of raw) {
      if (item && typeof item === 'object' && typeof (item as { code?: unknown }).code === 'string') {
        codes.push((item as { code: string }).code);
      }
    }
    return codes;
  }

  private scheduleFromPayload(payload: ProjectSignalPayload) {
    return {
      overdueCount: payload.tasks.overdueCount,
      dueWithin3DaysCount: payload.tasks.dueWithin3DaysCount ?? 0,
      dueSoonLowProgressCount: payload.tasks.dueSoonLowProgressCount ?? 0,
    };
  }

  private async refreshRulesFromSignals(
    projectId: string,
    organizationId: string,
  ) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);

    const previous = await this.prisma.projectRiskEvaluation.findUnique({
      where: { projectId },
      select: { id: true, level: true, score: true, reasons: true },
    });
    const previousReasonCodes = this.reasonCodesFromJson(previous?.reasons);

    const snapshot = await this.signals.refreshSnapshot(
      projectId,
      organizationId,
    );
    const payload = snapshot.payload as unknown as ProjectSignalPayload;
    const { level, score, reasons } = computeRiskFromPayload(payload);
    const mlPrediction = this.riskMl.predict(payload);
    const mlPrisma: Prisma.InputJsonValue | typeof Prisma.DbNull =
      mlPrediction === null || mlPrediction === undefined
        ? Prisma.DbNull
        : (mlPrediction as Prisma.InputJsonValue);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { name: true },
    });

    const promptFeedbackHints = await this.traceAnalyst.promptFeedbackHints(
      projectId,
      InsightFeedbackKind.RISK_SUMMARY,
    );

    const aiSummary = await this.riskInsight.summarize({
      projectName: project?.name ?? 'Project',
      level,
      score,
      reasons,
      signalEvidence: compactProjectSignalEvidenceForAi(payload),
      promptFeedbackHints,
    });

    const row = await this.prisma.projectRiskEvaluation.upsert({
      where: { projectId },
      create: {
        organizationId,
        projectId,
        level,
        score,
        reasons,
        aiSummary,
        mlPrediction: mlPrisma,
      },
      update: {
        level,
        score,
        reasons,
        aiSummary,
        mlPrediction: mlPrisma,
        evaluatedAt: new Date(),
      },
    });

    await this.alerts.maybeEmitRiskEvaluationAlert({
      organizationId,
      projectId,
      projectName: project?.name ?? 'Project',
      previousLevel: previous?.level ?? null,
      previousScore: previous?.score ?? null,
      previousReasonCodes,
      nextLevel: row.level,
      score: row.score,
      reasonCodes: reasons.map((r) => r.code),
      reasons,
      schedule: this.scheduleFromPayload(payload),
      evaluationId: row.id,
      aiSummary,
    });
  }

  async getEvaluation(projectId: string, organizationId: string) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    return this.prisma.projectRiskEvaluation.findUnique({
      where: { projectId },
    });
  }

  async listEvaluationHistory(
    projectId: string,
    organizationId: string,
    limit = 50,
  ) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    const take = Math.min(Math.max(limit, 1), 200);
    return this.prisma.riskEvaluationRun.findMany({
      where: { projectId, organizationId },
      select: {
        id: true,
        level: true,
        score: true,
        reasons: true,
        aiSummary: true,
        mlPrediction: true,
        evaluatedAt: true,
      },
      orderBy: { evaluatedAt: 'desc' },
      take,
    });
  }

  /**
   * Refreshes the signal snapshot, runs the v0 rule engine, appends history,
   * and upserts the persisted latest project risk row.
   */
  async evaluateAndPersist(
    projectId: string,
    organizationId: string,
    actorUserId: string,
  ) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    const snapshot = await this.signals.refreshSnapshot(
      projectId,
      organizationId,
    );
    const payload = snapshot.payload as unknown as ProjectSignalPayload;
    const { level, score, reasons } = computeRiskFromPayload(payload);
    const mlPrediction = this.riskMl.predict(payload);
    const mlPrisma: Prisma.InputJsonValue | typeof Prisma.DbNull =
      mlPrediction === null || mlPrediction === undefined
        ? Prisma.DbNull
        : (mlPrediction as Prisma.InputJsonValue);

    const previous = await this.prisma.projectRiskEvaluation.findUnique({
      where: { projectId },
      select: { id: true, level: true, score: true, reasons: true },
    });
    const previousReasonCodes = this.reasonCodesFromJson(previous?.reasons);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { name: true },
    });

    const promptFeedbackHints = await this.traceAnalyst.promptFeedbackHints(
      projectId,
      InsightFeedbackKind.RISK_SUMMARY,
    );

    const aiSummary = await this.riskInsight.summarize({
      projectName: project?.name ?? 'Project',
      level,
      score,
      reasons,
      signalEvidence: compactProjectSignalEvidenceForAi(payload),
      promptFeedbackHints,
    });

    const signalPayloadJson: Prisma.InputJsonValue =
      payload as unknown as Prisma.InputJsonValue;

    const run = await this.prisma.riskEvaluationRun.create({
      data: {
        organizationId,
        projectId,
        level,
        score,
        reasons,
        aiSummary,
        mlPrediction: mlPrisma,
        signalPayload: signalPayloadJson,
      },
      select: {
        id: true,
        level: true,
        score: true,
        reasons: true,
        aiSummary: true,
        mlPrediction: true,
        evaluatedAt: true,
      },
    });

    const row = await this.prisma.projectRiskEvaluation.upsert({
      where: { projectId },
      create: {
        organizationId,
        projectId,
        level,
        score,
        reasons,
        aiSummary,
        mlPrediction: mlPrisma,
      },
      update: {
        level,
        score,
        reasons,
        aiSummary,
        mlPrediction: mlPrisma,
        evaluatedAt: new Date(),
      },
    });

    await this.alerts.maybeEmitRiskEvaluationAlert({
      organizationId,
      projectId,
      projectName: project?.name ?? 'Project',
      previousLevel: previous?.level ?? null,
      previousScore: previous?.score ?? null,
      previousReasonCodes,
      nextLevel: row.level,
      score: row.score,
      evaluationId: row.id,
      evaluationRunId: run.id,
      reasonCodes: reasons.map((r) => r.code),
      reasons,
      schedule: this.scheduleFromPayload(payload),
      aiSummary,
    });

    await this.audit.log({
      organizationId,
      actorUserId,
      action: 'RISK_EVALUATED',
      resourceType: 'project',
      resourceId: projectId,
      metadata: {
        level: row.level,
        score: row.score,
        riskEvaluationRunId: run.id,
        projectRiskEvaluationId: row.id,
        mlModelVersion:
          mlPrediction && typeof mlPrediction === 'object'
            ? (mlPrediction as { modelVersion?: string }).modelVersion
            : undefined,
      },
    });

    return row;
  }
}
