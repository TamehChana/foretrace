import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ProjectSignalsService } from '../projects/project-signals.service';
import {
  collectIssueReferencesFromGithubWebhook,
  extractPullRequestNumber,
  extractWorkflowRunConclusion,
  isPullRequestMergedClose,
  summarizeGithubWebhookTouch,
} from './github-webhook-issue-refs';
import {
  extractAction,
  extractActorLogin,
  repositoryFullNameFromPayload,
  verifyGitHubSignature256,
} from './github-webhook-verify';

export type GithubIngestInput = {
  deliveryId: string;
  eventType: string;
  signature256: string | undefined;
  rawBody: Buffer;
};

function taskProgressAndStatusFromGithubEvent(
  eventType: string,
  action: string | undefined,
  payload: unknown,
): { progress?: number; status?: TaskStatus } {
  if (eventType === 'issues' && action === 'closed') {
    return { progress: 100, status: TaskStatus.DONE };
  }
  if (eventType === 'issues' && action === 'reopened') {
    return { progress: 0, status: TaskStatus.IN_PROGRESS };
  }
  if (isPullRequestMergedClose(payload, eventType, action)) {
    return { progress: 100, status: TaskStatus.DONE };
  }
  return {};
}

@Injectable()
export class GithubWebhookService {
  private readonly log = new Logger(GithubWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectSignals: ProjectSignalsService,
  ) {}

  async ingest(input: GithubIngestInput): Promise<void> {
    const { deliveryId, eventType, signature256, rawBody } = input;

    let payloadJson: unknown;
    try {
      payloadJson = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Webhook body must be JSON');
    }

    const repo = repositoryFullNameFromPayload(payloadJson, eventType);
    if (!repo) {
      this.log.warn(
        `GitHub webhook ${deliveryId}: event=${eventType} could not resolve repository (missing full_name / owner+name in payload)`,
      );
      throw new BadRequestException(
        `Could not resolve repository from webhook (event: ${eventType}). ` +
          'If this is a fork PR workflow, the payload may name the fork repo — link that repo or send fewer event types.',
      );
    }

    const connection = await this.prisma.gitHubConnection.findUnique({
      where: { repositoryFullName: repo },
      include: { project: { select: { organizationId: true } } },
    });
    if (!connection) {
      this.log.warn(
        `GitHub webhook ${deliveryId}: no Foretrace connection for ${repo}`,
      );
      throw new BadRequestException('Repository is not linked to Foretrace');
    }

    if (
      !verifyGitHubSignature256(rawBody, signature256, connection.webhookSecret)
    ) {
      this.log.warn(`GitHub webhook ${deliveryId}: invalid signature`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const action = extractAction(payloadJson);
    const actorLogin = extractActorLogin(payloadJson, eventType);
    const now = new Date();
    const aggregatePatch = this.aggregateUpdates(eventType, action);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.gitHubWebhookEvent.create({
          data: {
            connectionId: connection.id,
            githubDeliveryId: deliveryId,
            eventType,
            action: action ?? null,
            actorLogin: actorLogin ?? null,
            payload: payloadJson as Prisma.InputJsonValue,
          },
        });

        await tx.gitHubConnection.update({
          where: { id: connection.id },
          data: { lastEventAt: now, ...aggregatePatch },
        });
      });

      const issueNums = collectIssueReferencesFromGithubWebhook(
        payloadJson,
        eventType,
      );
      if (issueNums.length > 0) {
        let linkedUserId: string | null = null;
        if (actorLogin) {
          const normalizedLogin = actorLogin.trim().toLowerCase();
          const link = await this.prisma.gitHubUserLink.findUnique({
            where: {
              connectionId_githubLogin: {
                connectionId: connection.id,
                githubLogin: normalizedLogin,
              },
            },
            select: { userId: true },
          });
          if (link) {
            linkedUserId = link.userId;
          }
        }

        const prNum = extractPullRequestNumber(payloadJson, eventType);
        const progressPatch = taskProgressAndStatusFromGithubEvent(
          eventType,
          action,
          payloadJson,
        );
        const updateData = {
          lastGithubActivityAt: now,
          lastGithubActorLogin: actorLogin,
          lastGithubLinkedUserId: linkedUserId,
          ...(prNum != null ? { lastGithubPullRequestNumber: prNum } : {}),
          ...progressPatch,
        };

        const touch = await this.prisma.task.updateMany({
          where: {
            projectId: connection.projectId,
            githubIssueNumber: { in: issueNums },
          },
          data: updateData,
        });
        if (issueNums.length > 0 && touch.count === 0) {
          this.log.warn(
            `GitHub webhook ${deliveryId}: ${eventType} referenced issue number(s) [${issueNums.join(', ')}] but no task in project ${connection.projectId} has githubIssueNumber in that set`,
          );
        }

        if (
          eventType === 'workflow_run' &&
          action === 'completed' &&
          issueNums.length > 0 &&
          extractWorkflowRunConclusion(payloadJson, eventType) === 'success'
        ) {
          const tasksForBump = await this.prisma.task.findMany({
            where: {
              projectId: connection.projectId,
              githubIssueNumber: { in: issueNums },
            },
            select: { id: true, progress: true },
          });
          for (const t of tasksForBump) {
            const next = Math.min(100, t.progress + 10);
            if (next !== t.progress) {
              await this.prisma.task.update({
                where: { id: t.id },
                data: { progress: next },
              });
            }
          }
        }

        const summary = summarizeGithubWebhookTouch(
          eventType,
          action ?? undefined,
          issueNums,
          prNum,
        );
        const affectedTasks = await this.prisma.task.findMany({
          where: {
            projectId: connection.projectId,
            githubIssueNumber: { in: issueNums },
          },
          select: { id: true },
        });
        if (affectedTasks.length > 0) {
          await this.prisma.taskGitHubActivity.createMany({
            data: affectedTasks.map((t) => ({
              taskId: t.id,
              githubDeliveryId: deliveryId,
              eventType,
              action: action ?? null,
              actorLogin: actorLogin ?? null,
              linkedUserId,
              pullRequestNumber: prNum,
              summary,
            })),
            skipDuplicates: true,
          });
        }
      }

      this.projectSignals.scheduleRefreshSnapshot(
        connection.projectId,
        connection.project.organizationId,
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.log.debug(
          `GitHub webhook duplicate delivery ignored: ${deliveryId}`,
        );
        return;
      }
      throw e;
    }
  }

  private aggregateUpdates(
    eventType: string,
    action: string | undefined,
  ): Pick<
    Prisma.GitHubConnectionUpdateInput,
    'lastPushAt' | 'openPullRequestCount' | 'openIssueCount'
  > {
    const now = new Date();
    const empty: Pick<
      Prisma.GitHubConnectionUpdateInput,
      'lastPushAt' | 'openPullRequestCount' | 'openIssueCount'
    > = {};

    if (eventType === 'push') {
      empty.lastPushAt = now;
    }

    if (eventType === 'pull_request' && action) {
      if (action === 'opened' || action === 'reopened') {
        empty.openPullRequestCount = { increment: 1 };
      } else if (action === 'closed') {
        empty.openPullRequestCount = { decrement: 1 };
      }
    }

    if (eventType === 'issues' && action) {
      if (action === 'opened' || action === 'reopened') {
        empty.openIssueCount = { increment: 1 };
      } else if (action === 'closed' || action === 'deleted') {
        empty.openIssueCount = { decrement: 1 };
      }
    }

    return empty;
  }
}
