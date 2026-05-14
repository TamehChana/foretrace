import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AlertsService } from '../alerts/alerts.service';
import { RiskInsightService } from '../ai/risk-insight.service';
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

@Injectable()
export class ProjectRiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly signals: ProjectSignalsService,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
    private readonly riskInsight: RiskInsightService,
    private readonly riskMl: RiskMlService,
  ) {}

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
      select: { level: true },
    });

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { name: true },
    });

    const aiSummary = await this.riskInsight.summarize({
      projectName: project?.name ?? 'Project',
      level,
      score,
      reasons,
      signalEvidence: compactProjectSignalEvidenceForAi(payload),
    });

    const run = await this.prisma.riskEvaluationRun.create({
      data: {
        organizationId,
        projectId,
        level,
        score,
        reasons,
        aiSummary,
        mlPrediction: mlPrisma,
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
      nextLevel: row.level,
      score: row.score,
      evaluationId: row.id,
      evaluationRunId: run.id,
      reasonCodes: reasons.map((r) => r.code),
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
