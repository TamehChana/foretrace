import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  RiskLevel,
  type Task,
  type User,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { ProjectImpactAnalyzerService } from '../ai/project-impact-analyzer.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectRiskService } from '../projects/project-risk.service';
import { ProjectSignalsService } from '../projects/project-signals.service';
import type { ProjectSignalPayload } from '../projects/project-signals.service';
import {
  classifyTerminalLine,
  normalizeForFingerprint,
} from '../terminal/terminal-classify';
import { sha256Utf8Hex } from '../terminal/terminal-digest';
import {
  DEFENSE_DEMO_ORG_ID,
  DEFENSE_DEMO_ORG_NAME,
  DEFENSE_DEMO_ORG_SLUG,
  DEFENSE_DEMO_PASSWORD,
  DEFENSE_DEMO_PROJECT_ORDER,
  DEFENSE_DEMO_PROJECTS,
  DEFENSE_DEMO_USERS,
  type DefenseDemoProjectKey,
  type DefenseDemoProjectSpec,
  type DefenseDemoTaskSpec,
} from './defense-demo.constants';

const BCRYPT_COST = 12;

function utcDeadlineFromOffset(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

function daysAgoDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function terminalFingerprint(
  category: string,
  line: string,
  taskKey: string,
): string {
  const normalized = normalizeForFingerprint(line);
  return sha256Utf8Hex(`${taskKey}|${category}|${normalized}`).slice(0, 128);
}

@Injectable()
export class DefenseDemoSeedService {
  private readonly log = new Logger(DefenseDemoSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signals: ProjectSignalsService,
    private readonly risk: ProjectRiskService,
    private readonly impactAnalyzer: ProjectImpactAnalyzerService,
  ) {}

  async run(): Promise<void> {
    const passwordHash = await bcrypt.hash(DEFENSE_DEMO_PASSWORD, BCRYPT_COST);
    const users = await this.upsertUsers(passwordHash);
    const orgId = await this.upsertOrganization(users.admin.id);
    await this.upsertMemberships(orgId, users);

    const projectIds = new Map<DefenseDemoProjectKey, string>();

    for (const key of DEFENSE_DEMO_PROJECT_ORDER) {
      const spec = DEFENSE_DEMO_PROJECTS[key];
      const projectId = await this.upsertProject(orgId, spec);
      projectIds.set(key, projectId);
      await this.purgeProjectDerived(projectId);
      await this.seedProject(orgId, projectId, spec, users);
    }

    await this.purgeOrgAlertsAndEvaluations(orgId);

    for (const key of DEFENSE_DEMO_PROJECT_ORDER) {
      const projectId = projectIds.get(key)!;
      const spec = DEFENSE_DEMO_PROJECTS[key];

      if (spec.priorEvaluation) {
        await this.seedPriorEvaluationTrend(orgId, projectId, spec);
      }

      const evaluation = await this.risk.evaluateAndPersist(
        projectId,
        orgId,
        users.pm.id,
      );
      this.log.log(
        `${spec.name}: ${evaluation.level} (score ${evaluation.score})`,
      );
    }

    for (const key of ['HIGH', 'CRITICAL', 'RECOVERING'] as const) {
      const projectId = projectIds.get(key)!;
      const result = await this.impactAnalyzer.analyze(projectId, orgId);
      this.log.log(
        `Trace Analyst persisted for ${DEFENSE_DEMO_PROJECTS[key].name} (OpenAI=${result.usedOpenAi})`,
      );
    }

    const alertCount = await this.prisma.alert.count({
      where: { organizationId: orgId },
    });
    this.log.log(
      `Defense demo seed complete — org ${DEFENSE_DEMO_ORG_SLUG}, alerts=${alertCount}`,
    );
  }

  private async upsertUsers(
    passwordHash: string,
  ): Promise<Record<keyof typeof DEFENSE_DEMO_USERS, User>> {
    const out = {} as Record<keyof typeof DEFENSE_DEMO_USERS, User>;
    for (const [key, spec] of Object.entries(DEFENSE_DEMO_USERS) as [
      keyof typeof DEFENSE_DEMO_USERS,
      (typeof DEFENSE_DEMO_USERS)[keyof typeof DEFENSE_DEMO_USERS],
    ][]) {
      out[key] = await this.prisma.user.upsert({
        where: { email: spec.email },
        create: {
          id: spec.id,
          email: spec.email,
          displayName: spec.displayName,
          passwordHash,
        },
        update: {
          displayName: spec.displayName,
          passwordHash,
        },
      });
    }
    return out;
  }

  private async upsertOrganization(adminUserId: string): Promise<string> {
    const org = await this.prisma.organization.upsert({
      where: { slug: DEFENSE_DEMO_ORG_SLUG },
      create: {
        id: DEFENSE_DEMO_ORG_ID,
        name: DEFENSE_DEMO_ORG_NAME,
        slug: DEFENSE_DEMO_ORG_SLUG,
      },
      update: { name: DEFENSE_DEMO_ORG_NAME },
    });

    await this.prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: adminUserId,
          organizationId: org.id,
        },
      },
      create: {
        userId: adminUserId,
        organizationId: org.id,
        role: DEFENSE_DEMO_USERS.admin.role,
      },
      update: { role: DEFENSE_DEMO_USERS.admin.role },
    });

    return org.id;
  }

  private async upsertMemberships(
    organizationId: string,
    users: Record<keyof typeof DEFENSE_DEMO_USERS, User>,
  ): Promise<void> {
    for (const key of ['pm', 'dev1', 'dev2'] as const) {
      const spec = DEFENSE_DEMO_USERS[key];
      await this.prisma.membership.upsert({
        where: {
          userId_organizationId: {
            userId: users[key].id,
            organizationId,
          },
        },
        create: {
          userId: users[key].id,
          organizationId,
          role: spec.role,
        },
        update: { role: spec.role },
      });
    }
  }

  private async upsertProject(
    organizationId: string,
    spec: DefenseDemoProjectSpec,
  ): Promise<string> {
    const row = await this.prisma.project.upsert({
      where: { id: spec.id },
      create: {
        id: spec.id,
        organizationId,
        name: spec.name,
        description: spec.description,
      },
      update: {
        organizationId,
        name: spec.name,
        description: spec.description,
        archivedAt: null,
      },
    });
    return row.id;
  }

  private async purgeProjectDerived(projectId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.alert.deleteMany({ where: { projectId } }),
      this.prisma.insightFeedback.deleteMany({ where: { projectId } }),
      this.prisma.projectImpactAnalysisRun.deleteMany({ where: { projectId } }),
      this.prisma.riskEvaluationRun.deleteMany({ where: { projectId } }),
      this.prisma.projectRiskEvaluation.deleteMany({ where: { projectId } }),
      this.prisma.projectSignalSnapshot.deleteMany({ where: { projectId } }),
      this.prisma.terminalIncident.deleteMany({ where: { projectId } }),
      this.prisma.terminalIngestBatch.deleteMany({ where: { projectId } }),
      this.prisma.cliIngestToken.deleteMany({ where: { projectId } }),
      this.prisma.taskGitHubActivity.deleteMany({
        where: { task: { projectId } },
      }),
      this.prisma.task.deleteMany({ where: { projectId } }),
      this.prisma.gitHubWebhookEvent.deleteMany({
        where: { connection: { projectId } },
      }),
      this.prisma.gitHubUserLink.deleteMany({
        where: { connection: { projectId } },
      }),
      this.prisma.gitHubConnection.deleteMany({ where: { projectId } }),
    ]);
  }

  private async purgeOrgAlertsAndEvaluations(
    organizationId: string,
  ): Promise<void> {
    await this.prisma.alert.deleteMany({ where: { organizationId } });
  }

  private async seedProject(
    organizationId: string,
    projectId: string,
    spec: DefenseDemoProjectSpec,
    users: Record<keyof typeof DEFENSE_DEMO_USERS, User>,
  ): Promise<void> {
    const tasks = await this.seedTasks(projectId, spec.tasks, users);
    const connectionId = await this.seedGitHubConnection(
      projectId,
      spec,
      users,
    );
    await this.seedGitHubEvents(connectionId, spec);
    await this.seedTerminalData(
      organizationId,
      projectId,
      spec,
      tasks,
      users.dev1.id,
    );
  }

  private async seedTasks(
    projectId: string,
    specs: DefenseDemoTaskSpec[],
    users: Record<keyof typeof DEFENSE_DEMO_USERS, User>,
  ): Promise<Task[]> {
    const rows: Task[] = [];
    for (const t of specs) {
      const assignee = users[t.assignee];
      const row = await this.prisma.task.create({
        data: {
          id: t.id,
          projectId,
          title: t.title,
          description: t.description ?? null,
          status: t.status,
          priority: t.priority,
          progress: t.progress,
          deadline:
            t.deadlineDays === null ? null : utcDeadlineFromOffset(t.deadlineDays),
          assigneeId: assignee.id,
          createdById: users.admin.id,
          githubIssueNumber: t.githubIssueNumber ?? null,
        },
      });
      rows.push(row);
    }
    return rows;
  }

  private async seedGitHubConnection(
    projectId: string,
    spec: DefenseDemoProjectSpec,
    users: Record<keyof typeof DEFENSE_DEMO_USERS, User>,
  ): Promise<string> {
    const now = new Date();
    const connection = await this.prisma.gitHubConnection.upsert({
      where: { projectId },
      create: {
        projectId,
        repositoryFullName: spec.repositoryFullName,
        webhookSecret: sha256Utf8Hex(`defense-demo-webhook-${spec.key}`),
        openPullRequestCount: spec.openPullRequestCount,
        openIssueCount: spec.openIssueCount,
        lastEventAt: now,
        lastPushAt: now,
      },
      update: {
        repositoryFullName: spec.repositoryFullName,
        openPullRequestCount: spec.openPullRequestCount,
        openIssueCount: spec.openIssueCount,
        lastEventAt: now,
        lastPushAt: now,
      },
    });

    const links: { login: string; userId: string }[] = [
      { login: DEFENSE_DEMO_USERS.dev1.githubLogin, userId: users.dev1.id },
      { login: DEFENSE_DEMO_USERS.dev2.githubLogin, userId: users.dev2.id },
    ];
    for (const link of links) {
      await this.prisma.gitHubUserLink.upsert({
        where: {
          connectionId_githubLogin: {
            connectionId: connection.id,
            githubLogin: link.login,
          },
        },
        create: {
          connectionId: connection.id,
          githubLogin: link.login,
          userId: link.userId,
        },
        update: { userId: link.userId },
      });
    }

    return connection.id;
  }

  private async seedGitHubEvents(
    connectionId: string,
    spec: DefenseDemoProjectSpec,
  ): Promise<void> {
    const now = new Date();
    for (const event of spec.githubEvents) {
      await this.prisma.gitHubWebhookEvent.upsert({
        where: { githubDeliveryId: event.deliveryId },
        create: {
          connectionId,
          githubDeliveryId: event.deliveryId,
          eventType: event.eventType,
          action: event.action ?? null,
          actorLogin: event.actorLogin,
          payload: event.payload as Prisma.InputJsonValue,
          createdAt: now,
        },
        update: {
          connectionId,
          eventType: event.eventType,
          action: event.action ?? null,
          actorLogin: event.actorLogin,
          payload: event.payload as Prisma.InputJsonValue,
          createdAt: now,
        },
      });
    }
  }

  private async seedTerminalData(
    organizationId: string,
    projectId: string,
    spec: DefenseDemoProjectSpec,
    tasks: Task[],
    mintedByUserId: string,
  ): Promise<void> {
    if (spec.terminal.length === 0) {
      return;
    }

    const digest = sha256Utf8Hex(`defense-demo-cli-token-${spec.key}`);
    const token = await this.prisma.cliIngestToken.upsert({
      where: { secretDigest: digest },
      create: {
        organizationId,
        projectId,
        secretDigest: digest,
        name: `Defense demo token (${spec.key})`,
        createdById: mintedByUserId,
      },
      update: {
        organizationId,
        projectId,
        revokedAt: null,
      },
    });

    const batch = await this.prisma.terminalIngestBatch.create({
      data: {
        organizationId,
        projectId,
        cliTokenId: token.id,
        lineCount: spec.terminal.length,
        metadata: {
          mintedByUserId,
          source: 'defense-demo-seed',
        },
      },
    });

    const now = new Date();
    for (const item of spec.terminal) {
      const task =
        item.taskIndex !== undefined ? tasks[item.taskIndex] : undefined;
      const taskKey = task?.id ?? 'global';
      const category =
        item.category ?? classifyTerminalLine(item.line);
      const fingerprint = terminalFingerprint(category, item.line, taskKey);

      await this.prisma.terminalIncident.upsert({
        where: {
          projectId_fingerprint: { projectId, fingerprint },
        },
        create: {
          organizationId,
          projectId,
          taskId: task?.id ?? null,
          batchId: batch.id,
          category,
          fingerprint,
          excerpt: normalizeForFingerprint(item.line).slice(0, 520),
          occurrenceCount: item.occurrenceCount ?? 1,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        update: {
          taskId: task?.id ?? null,
          batchId: batch.id,
          category,
          excerpt: normalizeForFingerprint(item.line).slice(0, 520),
          occurrenceCount: item.occurrenceCount ?? 1,
          lastSeenAt: now,
        },
      });
    }
  }

  private async seedPriorEvaluationTrend(
    organizationId: string,
    projectId: string,
    spec: DefenseDemoProjectSpec,
  ): Promise<void> {
    const prior = spec.priorEvaluation;
    if (!prior) {
      return;
    }

    const evaluatedAt = daysAgoDate(prior.evaluatedDaysAgo);
    const snapshot = await this.signals.refreshSnapshot(
      projectId,
      organizationId,
    );
    const payload = snapshot.payload as unknown as ProjectSignalPayload;

    const reasons: Prisma.InputJsonValue = [
      {
        code: 'TASKS_OVERDUE',
        detail: 'Prior escalation during incident response (demo history).',
      },
      {
        code: 'TERMINAL_FRICTION',
        detail: 'Repeated build/test failures during outage (demo history).',
      },
    ];
    const recommendations: Prisma.InputJsonValue = [
      {
        code: 'ACT_CLEAR_OVERDUE',
        detail:
          'Triage overdue tasks today: confirm owners, cut or renegotiate scope, and unblock anything past deadline.',
      },
      {
        code: 'ACT_TERMINAL_FRICTION',
        detail:
          'Review recent terminal incidents/fingerprints; fix recurring env/build failures before they compound schedule risk.',
      },
      {
        code: 'ACT_ESCALATE_PM',
        detail:
          'Escalate to the PM/sponsor now: freeze non-critical work, publish a recovery plan, and re-evaluate after intervention.',
      },
    ];

    await this.prisma.riskEvaluationRun.create({
      data: {
        organizationId,
        projectId,
        level: prior.level,
        score: prior.score,
        reasons,
        recommendations,
        aiSummary:
          'VERDICT: AT_RISK\nEXECUTIVE READ: Demo history — delivery was critically at risk before stabilization work began.',
        evaluatedAt,
        signalPayload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.projectRiskEvaluation.upsert({
      where: { projectId },
      create: {
        organizationId,
        projectId,
        level: RiskLevel.HIGH,
        score: 48,
        reasons,
        recommendations,
        aiSummary:
          'VERDICT: ELEVATED_FRICTION\nEXECUTIVE READ: Risk is easing but not yet cleared (demo prior state).',
        evaluatedAt: daysAgoDate(1),
      },
      update: {
        level: RiskLevel.HIGH,
        score: 48,
        reasons,
        recommendations,
        evaluatedAt: daysAgoDate(1),
      },
    });
  }
}
