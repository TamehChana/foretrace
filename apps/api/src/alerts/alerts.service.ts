import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AlertKind, RiskLevel, Role, type Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';

const RANK: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

const MEDIUM_RANK = RANK[RiskLevel.MEDIUM];

@Injectable()
export class AlertsService {
  private readonly log = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  async listForOrganization(
    organizationId: string,
    options: { limit?: number; unreadOnly?: boolean },
  ) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const where: Prisma.AlertWhereInput = { organizationId };
    if (options.unreadOnly) {
      where.readAt = null;
    }
    return this.prisma.alert.findMany({
      where,
      select: {
        id: true,
        projectId: true,
        kind: true,
        summary: true,
        payload: true,
        readAt: true,
        createdAt: true,
        project: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markRead(
    organizationId: string,
    alertId: string,
    actorUserId: string,
  ) {
    const row = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId },
      select: { id: true, readAt: true, projectId: true },
    });
    if (!row) {
      throw new NotFoundException('Alert not found');
    }
    if (row.readAt !== null) {
      return { ok: true as const };
    }
    await this.prisma.alert.update({
      where: { id: row.id },
      data: { readAt: new Date() },
    });
    await this.audit.log({
      organizationId,
      actorUserId,
      action: 'ALERT_MARKED_READ',
      resourceType: 'alert',
      resourceId: alertId,
      metadata: { projectId: row.projectId },
    });
    return { ok: true as const };
  }

  /**
   * Creates an in-app alert when risk is at least MEDIUM and strictly worse than
   * the previous persisted evaluation (or there was no prior row).
   */
  async maybeEmitRiskEvaluationAlert(input: {
    organizationId: string;
    projectId: string;
    projectName: string;
    previousLevel: RiskLevel | null;
    nextLevel: RiskLevel;
    score: number;
    evaluationId: string;
    evaluationRunId?: string;
    reasonCodes: string[];
  }): Promise<void> {
    const nextR = RANK[input.nextLevel];
    if (nextR < MEDIUM_RANK) {
      return;
    }
    const prevR =
      input.previousLevel !== null ? RANK[input.previousLevel] : null;
    if (prevR !== null && nextR <= prevR) {
      return;
    }

    const summary = `Delivery risk for “${input.projectName}” is ${input.nextLevel} (score ${input.score}).`;

    const payload: Prisma.InputJsonValue = {
      kind: 'RISK_EVALUATION',
      projectId: input.projectId,
      evaluationId: input.evaluationId,
      ...(input.evaluationRunId
        ? { evaluationRunId: input.evaluationRunId }
        : {}),
      level: input.nextLevel,
      score: input.score,
      reasonCodes: input.reasonCodes,
    };

    await this.prisma.alert.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        kind: AlertKind.RISK_EVALUATION,
        summary: summary.slice(0, 500),
        payload,
      },
    });

    void this.sendRiskAlertEmail(input, summary).catch((err: unknown) => {
      this.log.warn(
        `Risk alert email: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  private async sendRiskAlertEmail(
    input: {
      organizationId: string;
      projectName: string;
      nextLevel: RiskLevel;
      score: number;
      reasonCodes: string[];
    },
    summary: string,
  ): Promise<void> {
    if (!this.email.isConfigured()) {
      return;
    }
    const rows = await this.prisma.membership.findMany({
      where: {
        organizationId: input.organizationId,
        role: { in: [Role.ADMIN, Role.PM] },
      },
      select: { user: { select: { email: true } } },
    });
    const to = [...new Set(rows.map((r) => r.user.email))];
    if (to.length === 0) {
      return;
    }
    const text = [
      summary,
      '',
      `Project: ${input.projectName}`,
      `Level: ${input.nextLevel}   Score: ${input.score}`,
      `Reason codes: ${input.reasonCodes.join(', ') || '—'}`,
      '',
      'Open Foretrace → Alerts to read the full in-app notification.',
    ].join('\n');
    await this.email.sendMail({
      to,
      subject: `[Foretrace] ${summary.slice(0, 120)}`,
      text,
    });
  }
}
