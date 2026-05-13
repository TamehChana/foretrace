import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';

import { TasksService } from './tasks.service';

describe('TasksService', () => {
  describe('createTask', () => {
    it('rejects assigneeId for developers', async () => {
      const prisma = {
        membership: {
          findUnique: jest.fn().mockResolvedValue({ role: Role.DEVELOPER }),
        },
        task: { create: jest.fn() },
      };
      const projectsService = {
        getProjectInOrg: jest.fn().mockResolvedValue({ id: 'proj' }),
      };
      const service = new TasksService(
        prisma as never,
        projectsService as never,
      );

      await expect(
        service.createTask(
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
          '11111111-1111-1111-1111-111111111111',
          {
            title: 'Hello',
            assigneeId: '44444444-4444-4444-4444-444444444444',
          } as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.task.create).not.toHaveBeenCalled();
    });
  });
});
