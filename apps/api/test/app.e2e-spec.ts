import type { Server } from 'node:http';

import { INestApplication, Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { API_NAME } from '@foretrace/shared';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import type { OrgListItem } from './../src/organizations/organizations.service';
import { PrismaService } from './../src/prisma/prisma.service';

/** Minimal Prisma surface so e2e do not require PostgreSQL (see `GET /organizations` with stub data). */
@Injectable()
class E2ePrismaStub {
  organization = {
    findMany: (): Promise<OrgListItem[]> => Promise.resolve([]),
  };
  user = {
    findUnique: (): Promise<unknown> => Promise.resolve(null),
    create: (): Promise<never> => {
      throw new Error('User create not stubbed for e2e');
    },
  };
  async onModuleInit(): Promise<void> {}
  async onModuleDestroy(): Promise<void> {}
}

describe('AppController (e2e)', () => {
  let app: INestApplication;

  function httpServer(): Server {
    return app.getHttpServer() as Server;
  }

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useClass(E2ePrismaStub)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/ (GET)', () => {
    const expectedMessage = `${API_NAME} — Foretrace API online`;
    return request(httpServer()).get('/').expect(200).expect(expectedMessage);
  });

  it('GET /auth/me returns unauthenticated envelope', async () => {
    const res = await request(httpServer()).get('/auth/me').expect(200);
    expect(res.body).toEqual({ user: null });
  });

  it('GET /organizations without session returns 401', () => {
    return request(httpServer()).get('/organizations').expect(401);
  });

  it('GET /organizations/:organizationId without session returns 401', () => {
    const id = '00000000-0000-4000-8000-000000000000';
    return request(httpServer()).get(`/organizations/${id}`).expect(401);
  });

  it('GET /organizations/:organizationId rejects invalid UUID with 400', () => {
    return request(httpServer()).get('/organizations/not-a-uuid').expect(400);
  });

  it('POST /organizations without session returns 401', () => {
    return request(httpServer())
      .post('/organizations')
      .send({ name: 'Acme Engineering' })
      .expect(401);
  });

  const sampleOrgUuid = '00000000-0000-4000-8000-000000000000';

  it('GET /organizations/:organizationId/projects without session returns 401', () => {
    return request(httpServer())
      .get(`/organizations/${sampleOrgUuid}/projects`)
      .expect(401);
  });

  it('GET /organizations/:organizationId/projects/:projectId/tasks without session returns 401', () => {
    return request(httpServer())
      .get(`/organizations/${sampleOrgUuid}/projects/${sampleOrgUuid}/tasks`)
      .expect(401);
  });

  it('GET nested projects/tasks rejects invalid project UUID with 400', () => {
    return request(httpServer())
      .get(`/organizations/${sampleOrgUuid}/projects/not-uuid/tasks`)
      .expect(400);
  });

  it('POST /webhooks/github without delivery headers returns 400', () => {
    return request(httpServer())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .send('{}')
      .expect(400);
  });

  afterEach(async () => {
    await app.close();
  });
});
