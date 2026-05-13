import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

import { GithubConnectionService } from './github-connection.service';

describe('GithubConnectionService', () => {
  const projectId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const organizationId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const actorId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const otherUserId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const connectionId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  it('addUserLink forbids developers from linking another user', async () => {
    const prisma = {
      membership: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ role: Role.DEVELOPER })
          .mockResolvedValueOnce({ id: 'm1' }),
      },
      gitHubUserLink: { create: jest.fn() },
    };
    const projectsService = {
      getProjectInOrg: jest.fn().mockResolvedValue({}),
    };
    const config = { get: jest.fn() };
    const audit = { log: jest.fn() };

    const service = new GithubConnectionService(
      prisma as never,
      projectsService as never,
      config as never,
      audit as never,
    );

    jest.spyOn(service, 'getForProject').mockResolvedValue({
      id: connectionId,
      repositoryFullName: 'o/r',
      hasGithubRestPat: false,
      lastEventAt: null,
      lastPushAt: null,
      openPullRequestCount: 0,
      openIssueCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    await expect(
      service.addUserLink(
        projectId,
        organizationId,
        'octocat',
        otherUserId,
        actorId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.gitHubUserLink.create).not.toHaveBeenCalled();
  });

  it('listUserLinks returns only the viewer rows for developers', async () => {
    const rows = [{ id: 'link-1', githubLogin: 'dev', userId: actorId }];
    const prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({ role: Role.DEVELOPER }),
      },
      gitHubUserLink: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const projectsService = {
      getProjectInOrg: jest.fn().mockResolvedValue({}),
    };
    const config = { get: jest.fn() };
    const audit = { log: jest.fn() };

    const service = new GithubConnectionService(
      prisma as never,
      projectsService as never,
      config as never,
      audit as never,
    );

    jest.spyOn(service, 'getForProject').mockResolvedValue({
      id: connectionId,
    } as never);

    const out = await service.listUserLinks(
      projectId,
      organizationId,
      actorId,
    );

    expect(out).toEqual(rows);
    expect(prisma.gitHubUserLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { connectionId, userId: actorId },
      }),
    );
  });
});
