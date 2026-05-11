import { Injectable } from '@nestjs/common';
import { RiskLevel, type Prisma } from '@prisma/client';

import { AlertsService } from '../alerts/alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ProjectSignalPayload } from './project-signals.service';
import { ProjectSignalsService } from './project-signals.service';
import { ProjectsService } from './projects.service';

export type RiskReasonRow = { code: string; detail: string };

@Injectable()
export class ProjectRiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly signals: ProjectSignalsService,
    private readonly alerts: AlertsService,
  ) {}

  async getEvaluation(projectId: string, organizationId: string) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    return this.prisma.projectRiskEvaluation.findUnique({
      where: { projectId },
    });
  }

  /**
   * Refreshes the signal snapshot, runs the v0 rule engine, and upserts the
   * persisted project risk row.
   */
  async evaluateAndPersist(projectId: string, organizationId: string) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    const snapshot = await this.signals.refreshSnapshot(projectId, organizationId);
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

    const row = await this.prisma.projectRiskEvaluation.upsert({
      where: { projectId },
      create: {
        organizationId,
        projectId,
        level,
        score,
        reasons: reasons as unknown as Prisma.InputJsonValue,
      },
      update: {
        level,
        score,
        reasons: reasons as unknown as Prisma.InputJsonValue,
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
      reasonCodes: reasons.map((r) => r.code),
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

    const gh = payload.github.webhookEventsInWindow;
    if (gh > 40) {
      score += 6;
      reasons.push({
        code: 'GITHUB_HIGH_CHURN',
        detail: `${gh} GitHub webhook events in the last ${hours}h.`,
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
