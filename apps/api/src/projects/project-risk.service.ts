import { Injectable } from '@nestjs/common';
import { RiskLevel } from '@prisma/client';

import { AlertsService } from '../alerts/alerts.service';
import { RiskInsightService } from '../ai/risk-insight.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  compactProjectSignalEvidenceForAi,
  ProjectSignalsService,
  type GithubRestEnrichment,
  type ProjectSignalPayload,
} from './project-signals.service';
import { ProjectsService } from './projects.service';
import type { RiskReasonRow } from './risk-reason.types';

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
    const { level, score, reasons } = this.computeRisk(payload);

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
      },
      select: {
        id: true,
        level: true,
        score: true,
        reasons: true,
        aiSummary: true,
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
      },
      update: {
        level,
        score,
        reasons,
        aiSummary,
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
      },
    });

    return row;
  }

  private computeRisk(payload: ProjectSignalPayload): {
    level: RiskLevel;
    score: number;
    reasons: RiskReasonRow[];
  } {
    const reasons: RiskReasonRow[] = [];
    let score = 0;
    const hours = payload.windowHours;

    const overdue = payload.tasks.overdueCount;
    if (overdue > 0) {
      score += Math.min(overdue * 14, 42);
      reasons.push({
        code: 'TASKS_OVERDUE',
        detail: `${overdue} active task(s) are past their deadline.`,
      });
    }

    const dueSoon = payload.tasks.dueWithin7DaysCount;
    if (dueSoon > 0) {
      score += Math.min(dueSoon * 4, 20);
      reasons.push({
        code: 'TASKS_DUE_SOON',
        detail: `${dueSoon} active task(s) have a deadline within 7 days.`,
      });
    }

    const t = payload.terminal;
    if (
      t.incidentsTouchedInWindow > 0 ||
      t.newFingerprintsInWindow > 0 ||
      t.batchesInWindow > 25
    ) {
      const pts =
        Math.min(t.incidentsTouchedInWindow * 3, 12) +
        Math.min(t.newFingerprintsInWindow * 5, 20) +
        (t.batchesInWindow > 25 ? 10 : 0);
      score += Math.min(pts, 36);
      reasons.push({
        code: 'TERMINAL_FRICTION',
        detail: `Terminal ingest in the last ${hours}h: ${t.incidentsTouchedInWindow} incident(s) touched, ${t.newFingerprintsInWindow} new fingerprint(s), ${t.batchesInWindow} batch(es).`,
      });
    }

    const taskTerminal = payload.tasksWithTerminalFriction ?? [];
    const taskTouchSum = taskTerminal.reduce(
      (s, r) => s + r.incidentTouchesInWindow,
      0,
    );
    if (taskTouchSum > 0) {
      score += Math.min(taskTouchSum * 2, 12);
      const lines = taskTerminal
        .filter((r) => r.incidentTouchesInWindow > 0)
        .slice(0, 4)
        .map((r) => {
          const who =
            r.assigneeDisplayName?.trim() ||
            r.assigneeEmail ||
            (r.assigneeId ? `user ${r.assigneeId.slice(0, 8)}…` : 'unassigned');
          return `"${r.title}" (${who}): ${r.incidentTouchesInWindow} incident touch(es)`;
        });
      const more =
        taskTerminal.filter((r) => r.incidentTouchesInWindow > 0).length > 4
          ? ` (+${
              taskTerminal.filter((r) => r.incidentTouchesInWindow > 0)
                .length - 4
            } more)`
          : '';
      reasons.push({
        code: 'TASK_SCOPED_TERMINAL',
        detail: `Terminal friction tied to tasks (CLI used task id) in the last ${hours}h: ${lines.join('; ')}${more}.`,
      });
    }

    const gh = payload.github.webhookEventsInWindow;
    if (gh > 40) {
      score += 6;
      reasons.push({
        code: 'GITHUB_HIGH_CHURN',
        detail: `${gh} GitHub webhook events in the last ${hours}h.`,
      });
    }

    const rest = payload.github.rest as GithubRestEnrichment | null | undefined;
    if (rest?.combinedStatus === 'failure') {
      score += 12;
      reasons.push({
        code: 'GITHUB_COMMIT_STATUS_FAILURE',
        detail:
          'GitHub combined status for the default branch is failure (from REST API).',
      });
    }

    score = Math.min(100, Math.round(score));

    if (reasons.length === 0) {
      reasons.push({
        code: 'BASELINE',
        detail: `No elevated delivery-risk signals in the ${hours}h rollup.`,
      });
    }

    let level: RiskLevel;
    if (score <= 14) {
      level = RiskLevel.LOW;
    } else if (score <= 36) {
      level = RiskLevel.MEDIUM;
    } else if (score <= 58) {
      level = RiskLevel.HIGH;
    } else {
      level = RiskLevel.CRITICAL;
    }

    if (overdue >= 6) {
      level = RiskLevel.CRITICAL;
    } else if (overdue >= 3) {
      if (level === RiskLevel.LOW) {
        level = RiskLevel.MEDIUM;
      } else if (level === RiskLevel.MEDIUM) {
        level = RiskLevel.HIGH;
      }
    }

    return { level, score, reasons };
  }
}
