jest.mock('./github-webhook-verify', () => ({
  ...jest.requireActual<typeof import('./github-webhook-verify')>(
    './github-webhook-verify',
  ),
  verifyGitHubSignature256: jest.fn(() => true),
}));

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';

import { GithubWebhookService } from './github-webhook.service';

const verifyModule = jest.requireMock('./github-webhook-verify') as {
  verifyGitHubSignature256: jest.Mock;
};

beforeEach(() => {
  verifyModule.verifyGitHubSignature256.mockImplementation(() => true);
});

describe('GithubWebhookService', () => {
  const projectId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const connectionId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const orgId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const linkedUserId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  function makeService(prisma: {
    gitHubConnection: { findUnique: jest.Mock };
    gitHubUserLink: { findUnique: jest.Mock };
    task: {
      updateMany: jest.Mock;
      findMany: jest.Mock;
      update?: jest.Mock;
    };
    taskGitHubActivity: { createMany: jest.Mock };
    $transaction: jest.Mock;
  }) {
    const projectSignals = {
      scheduleRefreshSnapshot: jest.fn(),
    };
    return new GithubWebhookService(prisma as never, projectSignals as never);
  }

  it('sets lastGithubLinkedUserId when a GitHub user link exists', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }]);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const txGitHubWebhookEvent = { create: jest.fn() };
    const txGitHubConnection = { update: jest.fn() };
    const prisma = {
      gitHubConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: connectionId,
          projectId,
          webhookSecret: 's3cr3t',
          project: { organizationId: orgId },
        }),
      },
      gitHubUserLink: {
        findUnique: jest.fn().mockResolvedValue({ userId: linkedUserId }),
      },
      task: { updateMany, findMany, update: jest.fn() },
      taskGitHubActivity: { createMany },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<void>) => {
        await cb({
          gitHubWebhookEvent: txGitHubWebhookEvent,
          gitHubConnection: txGitHubConnection,
        });
      }),
    };
    const service = makeService(prisma);

    const rawBody = Buffer.from(
      JSON.stringify({
        repository: { full_name: 'acme/widget' },
        sender: { login: 'DevPerson' },
        commits: [{ message: 'fix #99\n' }],
      }),
      'utf8',
    );

    await service.ingest({
      deliveryId: 'del-1',
      eventType: 'push',
      signature256: 'sha256=fake',
      rawBody,
    });

    expect(prisma.gitHubUserLink.findUnique).toHaveBeenCalledWith({
      where: {
        connectionId_githubLogin: {
          connectionId,
          githubLogin: 'devperson',
        },
      },
      select: { userId: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { projectId, githubIssueNumber: { in: [99] } },
      data: expect.objectContaining({
        lastGithubLinkedUserId: linkedUserId,
        lastGithubActorLogin: 'devperson',
      }),
    });
    expect(findMany).toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            taskId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
            githubDeliveryId: 'del-1',
          }),
        ]),
        skipDuplicates: true,
      }),
    );
  });

  it('sets lastGithubLinkedUserId null when no user link exists', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const findMany = jest.fn().mockResolvedValue([]);
    const createMany = jest.fn();
    const prisma = {
      gitHubConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: connectionId,
          projectId,
          webhookSecret: 's3cr3t',
          project: { organizationId: orgId },
        }),
      },
      gitHubUserLink: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      task: { updateMany, findMany, update: jest.fn() },
      taskGitHubActivity: { createMany },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<void>) => {
        await cb({
          gitHubWebhookEvent: { create: jest.fn() },
          gitHubConnection: { update: jest.fn() },
        });
      }),
    };
    const service = makeService(prisma);

    const rawBody = Buffer.from(
      JSON.stringify({
        repository: { full_name: 'acme/widget' },
        sender: { login: 'Unknown' },
        commits: [{ message: 'see #1' }],
      }),
      'utf8',
    );

    await service.ingest({
      deliveryId: 'del-2',
      eventType: 'push',
      signature256: 'sha256=fake',
      rawBody,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { projectId, githubIssueNumber: { in: [1] } },
      data: expect.objectContaining({
        lastGithubLinkedUserId: null,
        lastGithubActorLogin: 'unknown',
      }),
    });
    expect(findMany).toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('throws when signature is invalid', async () => {
    const verify = jest.requireMock('./github-webhook-verify') as {
      verifyGitHubSignature256: jest.Mock;
    };
    verify.verifyGitHubSignature256.mockReturnValueOnce(false);

    const prisma = {
      gitHubConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: connectionId,
          projectId,
          webhookSecret: 's3cr3t',
          project: { organizationId: orgId },
        }),
      },
      gitHubUserLink: { findUnique: jest.fn() },
      task: {
        updateMany: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      taskGitHubActivity: { createMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = makeService(prisma);

    const rawBody = Buffer.from(
      JSON.stringify({
        repository: { full_name: 'acme/widget' },
        commits: [{ message: 'x #2' }],
      }),
      'utf8',
    );

    await expect(
      service.ingest({
        deliveryId: 'del-3',
        eventType: 'push',
        signature256: 'sha256=bad',
        rawBody,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('throws on invalid JSON', async () => {
    const service = makeService({
      gitHubConnection: { findUnique: jest.fn() },
      gitHubUserLink: { findUnique: jest.fn() },
      task: {
        updateMany: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      taskGitHubActivity: { createMany: jest.fn() },
      $transaction: jest.fn(),
    });

    await expect(
      service.ingest({
        deliveryId: 'del-4',
        eventType: 'push',
        signature256: undefined,
        rawBody: Buffer.from('{', 'utf8'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets task progress and status when GitHub issue is closed', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }]);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      gitHubConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: connectionId,
          projectId,
          webhookSecret: 's3cr3t',
          project: { organizationId: orgId },
        }),
      },
      gitHubUserLink: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      task: { updateMany, findMany, update: jest.fn() },
      taskGitHubActivity: { createMany },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<void>) => {
        await cb({
          gitHubWebhookEvent: { create: jest.fn() },
          gitHubConnection: { update: jest.fn() },
        });
      }),
    };
    const service = makeService(prisma);

    const rawBody = Buffer.from(
      JSON.stringify({
        repository: { full_name: 'acme/widget' },
        action: 'closed',
        sender: { login: 'RepoOwner' },
        issue: { number: 12, title: 'Bug', body: 'desc' },
      }),
      'utf8',
    );

    await service.ingest({
      deliveryId: 'del-issue-close',
      eventType: 'issues',
      signature256: 'sha256=fake',
      rawBody,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { projectId, githubIssueNumber: { in: [12] } },
      data: expect.objectContaining({
        progress: 100,
        status: TaskStatus.DONE,
        lastGithubActorLogin: 'repoowner',
      }),
    });
  });
});
