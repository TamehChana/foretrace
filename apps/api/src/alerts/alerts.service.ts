import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertKind, RiskLevel, Role, type Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RiskReasonRow } from '../projects/risk-reason.types';

const RANK: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

const MEDIUM_RANK = RANK[RiskLevel.MEDIUM];

const SCORE_JUMP_AT_SAME_LEVEL = 12;

export type RiskEvaluationAlertInput = {
  previousLevel: RiskLevel | null;
  previousScore: number | null;
  previousReasonCodes: string[];
  nextLevel: RiskLevel;
  score: number;
  reasonCodes: string[];
  reasons: RiskReasonRow[];
  recommendations?: RiskReasonRow[];
  schedule?: {
    overdueCount: number;
    dueWithin3DaysCount: number;
    dueSoonLowProgressCount: number;
  };
};

/** Skip duplicate same-level alerts within this window unless level escalates / overdue appears / score jumps. */
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

/** When to create an in-app (and email) risk alert. */
export function shouldEmitRiskEvaluationAlert(
  input: RiskEvaluationAlertInput,
): boolean {
  const nextR = RANK[input.nextLevel];
  if (nextR < MEDIUM_RANK) {
    return false;
  }
  const prevR =
    input.previousLevel !== null ? RANK[input.previousLevel] : null;
  if (prevR === null) {
    return true;
  }
  if (nextR > prevR) {
    return true;
  }
  if (
    input.previousScore !== null &&
    input.score >= input.previousScore + SCORE_JUMP_AT_SAME_LEVEL
  ) {
    return true;
  }
  const nowOverdue = input.reasonCodes.includes('TASKS_OVERDUE');
  const wasOverdue = input.previousReasonCodes.includes('TASKS_OVERDUE');
  if (nowOverdue && !wasOverdue) {
    return true;
  }
  return false;
}

function schedulePhrase(
  schedule: RiskEvaluationAlertInput['schedule'],
): string {
  if (!schedule) {
    return '';
  }
  const parts: string[] = [];
  if (schedule.overdueCount > 0) {
    parts.push(
      `${schedule.overdueCount} overdue task${schedule.overdueCount === 1 ? '' : 's'}`,
    );
  }
  if (schedule.dueSoonLowProgressCount > 0) {
    parts.push(
      `${schedule.dueSoonLowProgressCount} due soon with low progress`,
    );
  } else if (schedule.dueWithin3DaysCount > 0) {
    parts.push(
      `${schedule.dueWithin3DaysCount} due within 3 day${schedule.dueWithin3DaysCount === 1 ? '' : 's'}`,
    );
  }
  if (parts.length === 0) {
    return '';
  }
  return ` Schedule: ${parts.join('; ')}.`;
}

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
    private readonly config: ConfigService,
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
   * Also applies a short same-project cooldown to avoid inbox spam.
   */
  async maybeEmitRiskEvaluationAlert(input: {
    organizationId: string;
    projectId: string;
    projectName: string;
    evaluationId: string;
    evaluationRunId?: string;
    /** Full risk narrative (includes `VERDICT:` line when present). */
    aiSummary?: string | null;
  } & RiskEvaluationAlertInput): Promise<void> {
    if (
      !shouldEmitRiskEvaluationAlert({
        previousLevel: input.previousLevel,
        previousScore: input.previousScore,
        previousReasonCodes: input.previousReasonCodes,
        nextLevel: input.nextLevel,
        score: input.score,
        reasonCodes: input.reasonCodes,
        reasons: input.reasons,
        schedule: input.schedule,
      })
    ) {
      return;
    }

    // Cooldown: skip if we just alerted this project at the same level (unless escalating).
    const prevR =
      input.previousLevel !== null ? RANK[input.previousLevel] : null;
    const nextR = RANK[input.nextLevel];
    const isEscalation = prevR === null || nextR > prevR;
    const overdueAppeared =
      input.reasonCodes.includes('TASKS_OVERDUE') &&
      !input.previousReasonCodes.includes('TASKS_OVERDUE');
    if (!isEscalation && !overdueAppeared) {
      const recent = await this.prisma.alert.findFirst({
        where: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          kind: AlertKind.RISK_EVALUATION,
          createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) },
        },
        select: { payload: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      if (recent?.payload && typeof recent.payload === 'object') {
        const level = (recent.payload as { level?: unknown }).level;
        if (level === input.nextLevel) {
          this.log.debug(
            `Risk alert cooldown: skip ${input.projectId} ${input.nextLevel}`,
          );
          return;
        }
      }
    }

    const verdict = parseRiskVerdictFromAiSummary(input.aiSummary);
    const preview = aiSummaryBodyPreview(input.aiSummary);
    const verdictPhrase = verdict ? ` AI verdict: ${verdict}.` : '';
    const scheduleText = schedulePhrase(input.schedule);
    const recs = (input.recommendations ?? []).slice(0, 5);

    const summary = `Delivery risk for “${input.projectName}” is ${input.nextLevel} (score ${input.score}).${scheduleText}${verdictPhrase}`;

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
      reasons: input.reasons.slice(0, 8),
      ...(recs.length > 0 ? { recommendations: recs } : {}),
      ...(input.schedule ? { schedule: input.schedule } : {}),
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

    void this.sendRiskAlertEmail(input, summary, verdict, preview, recs).catch(
      (err: unknown) => {
        this.log.warn(
          `Risk alert email: ${err instanceof Error ? err.message : String(err)}`,
        );
      },
    );
  }

  private appBaseUrl(): string | null {
    const dedicated =
      this.config.get<string>('FORETRACE_APP_URL')?.trim() ??
      process.env.FORETRACE_APP_URL?.trim();
    if (dedicated) {
      return dedicated.replace(/\/$/, '');
    }
    const cors =
      (
        this.config.get<string>('CORS_ORIGINS') ?? process.env.CORS_ORIGINS
      )
        ?.split(',')
        .map((s) => s.trim())
        .find((s) => s.startsWith('http')) ?? null;
    return cors ? cors.replace(/\/$/, '') : null;
  }

  private async sendRiskAlertEmail(
    input: {
      organizationId: string;
      projectId: string;
      projectName: string;
      nextLevel: RiskLevel;
      score: number;
      reasonCodes: string[];
      reasons: RiskReasonRow[];
    },
    summary: string,
    verdict: string | null,
    preview: string | null,
    recommendations: RiskReasonRow[],
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
    const app = this.appBaseUrl();
    const projectUrl = app
      ? `${app}/projects?org=${encodeURIComponent(input.organizationId)}&project=${encodeURIComponent(input.projectId)}&focus=risk`
      : null;
    const alertsUrl = app
      ? `${app}/alerts?org=${encodeURIComponent(input.organizationId)}`
      : null;
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
    for (const r of input.reasons.slice(0, 6)) {
      lines.push(`• ${r.code}: ${r.detail}`);
    }
    if (recommendations.length > 0) {
      lines.push('', 'Recommended PM actions:');
      for (const r of recommendations.slice(0, 5)) {
        lines.push(`• ${r.detail}`);
      }
    }
    if (preview) {
      lines.push('', 'Summary:', preview);
    }
    lines.push('');
    if (projectUrl) {
      lines.push(`Open delivery risk: ${projectUrl}`);
    }
    if (alertsUrl) {
      lines.push(`Alerts inbox: ${alertsUrl}`);
    }
    if (!projectUrl && !alertsUrl) {
      lines.push(
        'Open Foretrace → Alerts to read the full in-app notification.',
      );
    }
    const text = lines.join('\n');
    await this.email.sendMail({
      to,
      subject: `[Foretrace] ${summary.slice(0, 120)}`,
      text,
    });
  }
}
