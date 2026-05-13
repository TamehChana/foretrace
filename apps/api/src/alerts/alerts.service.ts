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

/** First-line `VERDICT: TOKEN` from heuristic or OpenAI risk summaries. */
export function parseRiskVerdictFromAiSummary(
  text: string | null | undefined,
): string | null {
  if (!text || typeof text !== 'string') {
    return null;
  }
  const first = text.trim().split(/\r?\n/)[0] ?? '';
  const m = /^VERDICT:\s*([A-Z_]+)/i.exec(first);
  return m ? m[1].toUpperCase() : null;
}

function aiSummaryBodyPreview(
  text: string | null | undefined,
  max = 420,
): string | null {
  if (!text || typeof text !== 'string') {
    return null;
  }
  const lines = text.trim().split(/\r?\n/);
  const rest = lines.length > 1 ? lines.slice(1).join('\n').trim() : text.trim();
  if (!rest) {
    return null;
  }
  const s = rest.slice(0, max);
  return rest.length > max ? `${s}…` : s;
}

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
    /** Full risk narrative (includes `VERDICT:` line when present). */
    aiSummary?: string | null;
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

    const verdict = parseRiskVerdictFromAiSummary(input.aiSummary);
    const preview = aiSummaryBodyPreview(input.aiSummary);
    const verdictPhrase = verdict ? ` AI verdict: ${verdict}.` : '';

    const summary = `Delivery risk for “${input.projectName}” is ${input.nextLevel} (score ${input.score}).${verdictPhrase}`;

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
      ...(verdict ? { verdict } : {}),
      ...(preview ? { aiSummaryPreview: preview } : {}),
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

    void this.sendRiskAlertEmail(input, summary, verdict, preview).catch(
      (err: unknown) => {
        this.log.warn(
          `Risk alert email: ${err instanceof Error ? err.message : String(err)}`,
        );
      },
    );
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
    verdict: string | null,
    preview: string | null,
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
    const lines: string[] = [
      summary,
      '',
      `Project: ${input.projectName}`,
      `Level: ${input.nextLevel}   Score: ${input.score}`,
    ];
    if (verdict) {
      lines.push(`Verdict: ${verdict}`);
    }
    lines.push(`Reason codes: ${input.reasonCodes.join(', ') || '—'}`);
    if (preview) {
      lines.push('', 'Summary:', preview);
    }
    lines.push(
      '',
      'Open Foretrace → Alerts to read the full in-app notification.',
    );
    const text = lines.join('\n');
    await this.email.sendMail({
      to,
      subject: `[Foretrace] ${summary.slice(0, 120)}`,
      text,
    });
  }
}
