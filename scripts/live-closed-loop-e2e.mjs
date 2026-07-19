/**
 * Live closed-loop E2E against the hosted Foretrace API.
 *
 * Loop: login → signals → evaluate → Trace Analyst → alerts → PM task fix → re-evaluate
 *
 * Usage (from repo root, with FORETRACE_EMAIL / FORETRACE_PASSWORD in .env):
 *   node scripts/live-closed-loop-e2e.mjs
 *
 * Optional:
 *   FORETRACE_API_URL=https://foretrace-api-nwg8.onrender.com
 *   FORETRACE_PROJECT_ID=<uuid>
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const i = s.indexOf('=');
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const root = resolve(import.meta.dirname, '..');
// Prefer repo-root .env over apps/api/.env for E2E targeting (local API .env
// often still points at an old Render hostname).
const env = {
  ...loadEnvFile(resolve(root, 'apps/api/.env')),
  ...loadEnvFile(resolve(root, '.env')),
  ...process.env,
};

const DEFAULT_API = 'https://foretrace-api-nwg8.onrender.com';
const API = (env.FORETRACE_API_URL || DEFAULT_API).replace(/\/$/, '');
if (API.includes('foretrace-api.onrender.com') && !API.includes('nwg8')) {
  console.warn(
    'WARN  FORETRACE_API_URL looks like the old hostname; expected …-nwg8.onrender.com',
  );
}
const email = env.FORETRACE_EMAIL || env.SMOKE_EMAIL;
const password = env.FORETRACE_PASSWORD || env.SMOKE_PASSWORD;
const preferProjectId = env.FORETRACE_PROJECT_ID || '';

const results = [];
function pass(step, detail = '') {
  results.push({ step, ok: true, detail });
  console.log(`PASS  ${step}${detail ? ` — ${detail}` : ''}`);
}
function fail(step, detail = '') {
  results.push({ step, ok: false, detail });
  console.error(`FAIL  ${step}${detail ? ` — ${detail}` : ''}`);
}
function info(msg) {
  console.log(`INFO  ${msg}`);
}

async function req(method, path, { token, body, timeoutMs = 120_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 400) };
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

function dataOf(json) {
  if (json && typeof json === 'object' && 'data' in json) return json.data;
  return json;
}

async function main() {
  console.log(`\nForetrace live closed-loop E2E\nAPI: ${API}\n`);

  if (!email || !password) {
    fail('credentials', 'Set FORETRACE_EMAIL and FORETRACE_PASSWORD');
    process.exit(1);
  }

  // 0) Health
  {
    const { status, json } = await req('GET', '/health', { timeoutMs: 90_000 });
    if (status === 200) pass('health', JSON.stringify(json)?.slice(0, 80) || 'ok');
    else fail('health', `HTTP ${status}`);
  }

  // 1) Login
  let token;
  {
    const { status, json } = await req('POST', '/auth/login', {
      body: { email, password },
    });
    token = json?.accessToken || json?.data?.accessToken;
    if (status === 200 && token) pass('login', email);
    else {
      fail('login', `HTTP ${status}`);
      process.exit(1);
    }
  }

  // 2) Org + project
  let orgId;
  let projectId;
  let projectName;
  {
    const { status, json } = await req('GET', '/organizations', { token });
    const orgs = dataOf(json);
    if (status !== 200 || !Array.isArray(orgs) || orgs.length === 0) {
      fail('organizations', `HTTP ${status}`);
      process.exit(1);
    }
    orgId = orgs[0].id;
    pass('organizations', `${orgs[0].name} (${orgId})`);

    const pr = await req('GET', `/organizations/${orgId}/projects`, { token });
    const projects = dataOf(pr.json);
    if (pr.status !== 200 || !Array.isArray(projects) || projects.length === 0) {
      fail('projects', `HTTP ${pr.status}`);
      process.exit(1);
    }
    const preferred =
      preferProjectId && projects.find((p) => p.id === preferProjectId);
    const project = preferred || projects[0];
    projectId = project.id;
    projectName = project.name;
    pass('project', `${projectName} (${projectId})`);
  }

  const base = `/organizations/${orgId}/projects/${projectId}`;

  // 3) Signals refresh + get
  {
    const refresh = await req('POST', `${base}/signals/refresh`, { token });
    if (refresh.status >= 200 && refresh.status < 300) {
      const snap = dataOf(refresh.json);
      const tasks = snap?.payload?.tasks || snap?.tasks;
      pass(
        'signals.refresh',
        tasks
          ? `active=${tasks.activeCount} overdue=${tasks.overdueCount} due3d=${tasks.dueWithin3DaysCount}`
          : `HTTP ${refresh.status}`,
      );
    } else {
      fail('signals.refresh', `HTTP ${refresh.status}`);
    }

    const get = await req('GET', `${base}/signals`, { token });
    if (get.status === 200) pass('signals.get');
    else fail('signals.get', `HTTP ${get.status}`);
  }

  // 4) Evaluate #1
  let eval1;
  {
    const { status, json } = await req('POST', `${base}/risk/evaluate`, {
      token,
      timeoutMs: 180_000,
    });
    eval1 = dataOf(json);
    if (status === 200 && eval1?.level != null) {
      const ml = eval1.mlPrediction;
      pass(
        'risk.evaluate#1',
        `${eval1.level} score=${eval1.score}` +
          (ml?.modelVersion ? ` ml=${ml.modelVersion}` : ' ml=none'),
      );
      if (typeof eval1.aiSummary === 'string' && eval1.aiSummary.length > 40) {
        const note = eval1.aiSummary.includes('NOTE:');
        pass(
          'risk.narrative',
          note ? 'present (template NOTE)' : 'present',
        );
      } else {
        fail('risk.narrative', 'missing aiSummary');
      }
    } else {
      fail('risk.evaluate#1', `HTTP ${status}`);
    }
  }

  // 5) Trace Analyst
  {
    const { status, json } = await req('POST', `${base}/insights/analyze`, {
      token,
      timeoutMs: 180_000,
    });
    const d = dataOf(json);
    if (status === 200 && d?.analysis) {
      pass(
        'traceAnalyst.analyze',
        `usedOpenAi=${d.usedOpenAi}` +
          (d.openAiFallbackReason
            ? ` fallback=${String(d.openAiFallbackReason).slice(0, 80)}`
            : ''),
      );
      if (d.usedOpenAi !== true) {
        info(
          'Trace Analyst used template — check OpenAI quota/model if you expected OpenAI',
        );
      }
    } else {
      fail('traceAnalyst.analyze', `HTTP ${status}`);
    }

    const ready = await req('GET', `${base}/insights/readiness`, { token });
    const rd = dataOf(ready.json);
    if (ready.status === 200 && rd) {
      pass(
        'traceAnalyst.readiness',
        `openAiConfigured=${rd.openAiConfigured} model=${rd.openAiImpactModel}`,
      );
    } else {
      fail('traceAnalyst.readiness', `HTTP ${ready.status}`);
    }
  }

  // 6) Alerts
  let alertId;
  {
    const { status, json } = await req(
      'GET',
      `/organizations/${orgId}/alerts?limit=20`,
      { token },
    );
    const items = dataOf(json);
    if (status === 200 && Array.isArray(items)) {
      const forProject = items.filter((a) => a.projectId === projectId);
      const unread = forProject.filter((a) => !a.readAt);
      pass(
        'alerts.list',
        `org=${items.length} project=${forProject.length} unread=${unread.length}`,
      );
      alertId = (unread[0] || forProject[0])?.id;
      if (alertId) {
        const payload = (unread[0] || forProject[0])?.payload;
        const hasRecs =
          payload &&
          typeof payload === 'object' &&
          Array.isArray(payload.recommendations) &&
          payload.recommendations.length > 0;
        info(
          `sample alert has recommendations=${Boolean(hasRecs)} summary=${String((unread[0] || forProject[0])?.summary || '').slice(0, 90)}`,
        );
      } else {
        info(
          'No alerts for this project yet (need Medium+ worsening vs prior evaluate)',
        );
      }
    } else {
      fail('alerts.list', `HTTP ${status}`);
    }

    if (alertId) {
      const mr = await req(
        'POST',
        `/organizations/${orgId}/alerts/${alertId}/read`,
        { token },
      );
      if (mr.status === 200 || mr.status === 201) pass('alerts.markRead', alertId);
      else fail('alerts.markRead', `HTTP ${mr.status}`);
    }
  }

  // 7) PM action — raise progress on a dated active task
  let patchedTask;
  {
    const { status, json } = await req('GET', `${base}/tasks`, { token });
    const tasks = dataOf(json);
    if (status !== 200 || !Array.isArray(tasks)) {
      fail('tasks.list', `HTTP ${status}`);
    } else {
      const candidates = tasks.filter(
        (t) =>
          t.status !== 'DONE' &&
          t.status !== 'CANCELLED' &&
          t.deadline &&
          (t.progress ?? 0) < 90,
      );
      const task = candidates[0] || tasks.find((t) => t.status !== 'CANCELLED');
      if (!task) {
        fail('tasks.pmAction', 'no editable task');
      } else {
        const nextProgress = Math.min(100, Math.max((task.progress ?? 0) + 40, 50));
        const later = new Date();
        later.setUTCDate(later.getUTCDate() + 21);
        const deadline = later.toISOString().slice(0, 10);
        const patch = await req('PATCH', `${base}/tasks/${task.id}`, {
          token,
          body: { progress: nextProgress, deadline },
        });
        if (patch.status === 200) {
          patchedTask = dataOf(patch.json);
          pass(
            'tasks.pmAction',
            `"${task.title}" progress ${task.progress ?? 0}→${nextProgress}, deadline→${deadline}`,
          );
        } else {
          fail(
            'tasks.pmAction',
            `HTTP ${patch.status} ${JSON.stringify(patch.json).slice(0, 160)}`,
          );
        }
      }
    }
  }

  // 8) Re-evaluate
  let eval2;
  {
    const { status, json } = await req('POST', `${base}/risk/evaluate`, {
      token,
      timeoutMs: 180_000,
    });
    eval2 = dataOf(json);
    if (status === 200 && eval2?.level != null) {
      const delta =
        eval1 && typeof eval1.score === 'number'
          ? eval2.score - eval1.score
          : null;
      pass(
        'risk.evaluate#2',
        `${eval2.level} score=${eval2.score}` +
          (delta != null ? ` (Δscore ${delta >= 0 ? '+' : ''}${delta})` : ''),
      );
      if (
        eval1 &&
        eval1.score === eval2.score &&
        eval1.level === eval2.level &&
        patchedTask
      ) {
        info(
          'Score unchanged after PM action — may be fine if rules already MEDIUM and other signals dominate',
        );
      }
    } else {
      fail('risk.evaluate#2', `HTTP ${status}`);
    }
  }

  // 9) History
  {
    const { status, json } = await req('GET', `${base}/risk/history?limit=5`, {
      token,
    });
    const rows = dataOf(json);
    if (status === 200 && Array.isArray(rows) && rows.length >= 1) {
      pass('risk.history', `${rows.length} recent run(s)`);
    } else {
      fail('risk.history', `HTTP ${status}`);
    }
  }

  // Summary
  const failed = results.filter((r) => !r.ok);
  console.log('\n—— Summary ——');
  console.log(
    `Passed ${results.filter((r) => r.ok).length}/${results.length}` +
      (failed.length ? `; failed: ${failed.map((f) => f.step).join(', ')}` : ''),
  );
  console.log(`Project: ${projectName} (${projectId})`);
  console.log(
    `UI walk: https://foretrace-api.vercel.app/projects?org=${orgId}&project=${projectId}&focus=risk`,
  );
  console.log(
    `Alerts:  https://foretrace-api.vercel.app/alerts?org=${orgId}\n`,
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('UNCAUGHT', e);
  process.exit(1);
});
