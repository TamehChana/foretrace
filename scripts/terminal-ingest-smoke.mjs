#!/usr/bin/env node
/**
 * End-to-end smoke: session login → mint CLI token → POST terminal batch (Bearer).
 *
 * Loads optional `.env` from cwd, then parent directory (repo root when run via `npm run`).
 *
 * Required env:
 *   FORETRACE_API_URL          e.g. https://your-api.onrender.com (no trailing slash)
 *   FORETRACE_EMAIL            user email
 *   FORETRACE_PASSWORD         user password
 *   FORETRACE_ORGANIZATION_ID  org UUID
 *   FORETRACE_PROJECT_ID       project UUID
 *
 * Optional:
 *   FORETRACE_TASK_ID          task UUID (must belong to project)
 *   FORETRACE_COOKIE            If set, skip login and use this raw Cookie header (e.g. foretrace.sid=...)
 *
 * Run:
 *   npm run smoke:terminal-ingest
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function stripTrailingSlashes(url) {
  return url.replace(/\/+$/, '');
}

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

/** Build `Cookie` value for the next request from fetch `Set-Cookie` headers. */
function cookieHeaderFromResponse(res) {
  const h = res.headers;
  if (typeof h.getSetCookie === 'function') {
    const list = h.getSetCookie();
    return list.map((line) => line.split(';')[0].trim()).filter(Boolean).join('; ');
  }
  const single = h.get('set-cookie');
  if (!single) {
    return '';
  }
  return single
    .split(/,(?=[^;]+?=)/)
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function readJson(res) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text };
  }
  return { data, text };
}

async function main() {
  const base = stripTrailingSlashes(requireEnv('FORETRACE_API_URL'));
  const orgId = requireEnv('FORETRACE_ORGANIZATION_ID');
  const projectId = requireEnv('FORETRACE_PROJECT_ID');
  const taskId = process.env.FORETRACE_TASK_ID?.trim() || undefined;

  let cookie = process.env.FORETRACE_COOKIE?.trim() || '';

  if (!cookie) {
    const email = requireEnv('FORETRACE_EMAIL');
    const password = requireEnv('FORETRACE_PASSWORD');

    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    cookie = cookieHeaderFromResponse(loginRes);
    if (!loginRes.ok) {
      const { text } = await readJson(loginRes);
      console.error(`Login failed (${loginRes.status}): ${text}`);
      process.exit(1);
    }
    if (!cookie) {
      console.error(
        'Login succeeded but no Set-Cookie received. For cross-origin APIs, set FORETRACE_COOKIE manually.',
      );
      process.exit(1);
    }
  }

  const mintRes = await fetch(
    `${base}/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/cli-tokens`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ name: 'smoke-script' }),
    },
  );
  const mintBody = await readJson(mintRes);
  if (!mintRes.ok) {
    console.error(`Mint CLI token failed (${mintRes.status}): ${mintBody.text}`);
    process.exit(1);
  }
  const token = mintBody.data?.data?.token;
  if (typeof token !== 'string' || !token.startsWith('ft_ck_')) {
    console.error('Unexpected mint response:', mintBody.data);
    process.exit(1);
  }

  const lines = [
    'smoke: intentional error line for Foretrace terminal ingest',
    'npm ERR! smoke test dependency failure',
  ];
  const payload = {
    ...(taskId ? { taskId } : {}),
    lines,
    client: { host: 'terminal-ingest-smoke', cwd: process.cwd() },
  };

  const batchRes = await fetch(
    `${base}/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/terminal/batches`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
  );
  const batchBody = await readJson(batchRes);
  if (!batchRes.ok) {
    console.error(`Terminal batch failed (${batchRes.status}): ${batchBody.text}`);
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, mint: mintBody.data, ingest: batchBody.data }, null, 2));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
