#!/usr/bin/env node
/**
 * Backfill Task.lastGithubLinkedUserId from GitHubUserLink using lastGithubActorLogin.
 *
 * Matches: same project → GitHubConnection → link where githubLogin =
 * lower(trim(task.lastGithubActorLogin)). Only updates rows where
 * lastGithubLinkedUserId IS NULL (idempotent for re-runs).
 *
 * Env: DATABASE_URL (same as API; loads .env from cwd, repo root, apps/api).
 *
 * Usage:
 *   node scripts/backfill-task-last-github-linked-user.mjs           # dry-run: counts only
 *   node scripts/backfill-task-last-github-linked-user.mjs --apply  # perform UPDATE
 *
 * Optional:
 *   FORETRACE_BACKFILL_PROJECT_ID=<uuid>  limit to one project
 *
 * npm:
 *   npm run backfill:task-github-linked-user
 *   npm run backfill:task-github-linked-user -- --apply
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function applyEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function loadDotEnvIfPresent() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), '.env'),
    join(here, '..', '.env'),
    join(here, '..', 'apps', 'api', '.env'),
  ];
  for (const path of candidates) {
    applyEnvFile(path);
  }
}

loadDotEnvIfPresent();

function requireDatabaseUrl() {
  const v = process.env.DATABASE_URL?.trim();
  if (!v) {
    console.error('Missing DATABASE_URL (set in environment or .env).');
    process.exit(1);
  }
  return v;
}

function parseProjectFilter() {
  const raw = process.env.FORETRACE_BACKFILL_PROJECT_ID?.trim();
  if (!raw) {
    return null;
  }
  if (!UUID_RE.test(raw)) {
    console.error(
      'FORETRACE_BACKFILL_PROJECT_ID must be a UUID v4 (got invalid value).',
    );
    process.exit(1);
  }
  return raw;
}

async function countCandidates(prisma, projectId) {
  const rows = projectId
    ? await prisma.$queryRaw`
        SELECT COUNT(*)::int AS c
        FROM "Task" t2
        INNER JOIN "GitHubConnection" c ON c."projectId" = t2."projectId"
        INNER JOIN "GitHubUserLink" l ON l."connectionId" = c."id"
          AND l."githubLogin" = LOWER(TRIM(t2."lastGithubActorLogin"))
        WHERE t2."lastGithubActorLogin" IS NOT NULL
          AND TRIM(t2."lastGithubActorLogin") <> ''
          AND t2."lastGithubLinkedUserId" IS NULL
          AND t2."projectId" = ${projectId}::uuid
      `
    : await prisma.$queryRaw`
        SELECT COUNT(*)::int AS c
        FROM "Task" t2
        INNER JOIN "GitHubConnection" c ON c."projectId" = t2."projectId"
        INNER JOIN "GitHubUserLink" l ON l."connectionId" = c."id"
          AND l."githubLogin" = LOWER(TRIM(t2."lastGithubActorLogin"))
        WHERE t2."lastGithubActorLogin" IS NOT NULL
          AND TRIM(t2."lastGithubActorLogin") <> ''
          AND t2."lastGithubLinkedUserId" IS NULL
      `;
  const row = Array.isArray(rows) ? rows[0] : null;
  return row && typeof row.c === 'number' ? row.c : 0;
}

async function runUpdate(prisma, projectId) {
  if (projectId) {
    return prisma.$executeRaw`
      UPDATE "Task" AS t
      SET
        "lastGithubLinkedUserId" = m."userId",
        "updatedAt" = NOW()
      FROM (
        SELECT t2."id" AS tid, l."userId" AS "userId"
        FROM "Task" t2
        INNER JOIN "GitHubConnection" c ON c."projectId" = t2."projectId"
        INNER JOIN "GitHubUserLink" l ON l."connectionId" = c."id"
          AND l."githubLogin" = LOWER(TRIM(t2."lastGithubActorLogin"))
        WHERE t2."lastGithubActorLogin" IS NOT NULL
          AND TRIM(t2."lastGithubActorLogin") <> ''
          AND t2."lastGithubLinkedUserId" IS NULL
          AND t2."projectId" = ${projectId}::uuid
      ) AS m
      WHERE t."id" = m.tid
    `;
  }
  return prisma.$executeRaw`
    UPDATE "Task" AS t
    SET
      "lastGithubLinkedUserId" = m."userId",
      "updatedAt" = NOW()
    FROM (
      SELECT t2."id" AS tid, l."userId" AS "userId"
      FROM "Task" t2
      INNER JOIN "GitHubConnection" c ON c."projectId" = t2."projectId"
      INNER JOIN "GitHubUserLink" l ON l."connectionId" = c."id"
        AND l."githubLogin" = LOWER(TRIM(t2."lastGithubActorLogin"))
      WHERE t2."lastGithubActorLogin" IS NOT NULL
        AND TRIM(t2."lastGithubActorLogin") <> ''
        AND t2."lastGithubLinkedUserId" IS NULL
    ) AS m
    WHERE t."id" = m.tid
  `;
}

async function main() {
  requireDatabaseUrl();
  const apply = process.argv.includes('--apply');
  const projectId = parseProjectFilter();

  const prisma = new PrismaClient();

  try {
    const before = await countCandidates(prisma, projectId);
    const scope = projectId
      ? `project ${projectId}`
      : 'all projects with a GitHub connection';

    console.log(
      `[backfill] Candidates (${scope}): ${before} task(s) with actor login + matching link, linked user still null.`,
    );

    if (!apply) {
      console.log(
        '[backfill] Dry run only. Re-run with --apply to update the database.',
      );
      return;
    }

    if (before === 0) {
      console.log('[backfill] Nothing to update.');
      return;
    }

    const affected = await runUpdate(prisma, projectId);
    const n =
      typeof affected === 'bigint'
        ? Number(affected)
        : typeof affected === 'number'
          ? affected
          : 0;

    const after = await countCandidates(prisma, projectId);
    console.log(`[backfill] Updated rows (reported): ${n}. Remaining candidates: ${after}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
