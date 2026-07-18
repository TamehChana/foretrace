# Foretrace defense demo seed

Repeatable **thesis defense** dataset for the closed loop:

**Signals → Snapshot → Risk Evaluation → Trace Analyst → Alert → PM action → Re-evaluation**

## Prerequisites

1. PostgreSQL reachable via `DATABASE_URL` in **`.env`** and **`apps/api/.env`**.
2. Migrations applied:

   ```bash
   npm run db:migrate:deploy -w @foretrace/api
   ```

3. Dependencies installed at repo root (`npm ci` or `npm install`).

## Run the seed

From the repository root:

```bash
npm run seed:defense -w @foretrace/api
```

The script is **idempotent**: re-running clears and rebuilds demo derived data (tasks, GitHub events, terminal incidents, snapshots, evaluations, alerts) without duplicating users or the organization.

## Demo accounts

All accounts share the password **`DefenseDemo2026!`** (local/demo only — do not use in production).

| Email | Role | Display name |
|-------|------|----------------|
| `admin@foretrace.local` | ADMIN | Demo Admin |
| `pm@foretrace.local` | PM | Demo PM |
| `dev1@foretrace.local` | DEVELOPER | Alice Developer |
| `dev2@foretrace.local` | DEVELOPER | Bob Developer |

**Organization:** Foretrace Defense Lab (`slug`: `foretrace-defense-lab`)

Sign in at the web app → select **Foretrace Defense Lab** in the org picker → open **Projects**.

## Demo projects (what each shows)

| Project | Intended risk | What it demonstrates |
|---------|---------------|----------------------|
| **Demo — Greenfield Docs (LOW)** | LOW | Healthy progress, no overdue active tasks, light GitHub activity, no terminal friction |
| **Demo — Checkout Revamp (MEDIUM)** | MEDIUM | Due-soon tasks with low progress, mild terminal BUILD noise |
| **Demo — Payments API (HIGH)** | HIGH | Several overdue tasks + multi-category terminal incidents |
| **Demo — Mobile Release (CRITICAL)** | CRITICAL | ≥6 overdue active tasks (rule clamp) + repeated BUILD/TEST/RUNTIME/DOCKER failures |
| **Demo — Platform Stabilization (RECOVERING)** | MEDIUM (improving) | Prior **CRITICAL** history row + current healthier tasks; Trace Analyst narrative |

Each project includes:

- Linked **GitHub** repo (`foretrace-demo/…`) with webhook events and dev user links
- **Tasks** with varied status, priority, deadlines, progress, assignees, and issue numbers
- **Terminal incidents** (where applicable) with realistic fingerprints
- Refreshed **signal snapshot** (via `ProjectSignalsService.refreshSnapshot`)
- **Risk evaluation** + history run (via `ProjectRiskService.evaluateAndPersist`)
- **In-app alerts** for Medium+ projects when evaluation rules fire (`AlertsService`)
- **Trace Analyst** persisted runs on HIGH, CRITICAL, and RECOVERING (`ProjectImpactAnalyzerService.analyze`)

## Closed-loop demo script (15–20 min)

### 1. Orient (PM)

1. Sign in as **`pm@foretrace.local`**.
2. Open **Overview** — confirm API health and org rollup.
3. Go to **Projects** → expand each demo project briefly.

### 2. Signals (detect)

1. Open **Demo — Mobile Release (CRITICAL)** → **Signals** panel.
2. Point out overdue task counts, terminal incident totals, and GitHub activity.
3. Repeat on **Greenfield Docs (LOW)** to contrast a calm rollup.

### 3. Risk + Trace Analyst (explain)

1. On **CRITICAL** project → **Delivery risk** → show level, score, structured **reasons**, and **recommendations**.
2. Point at **ML cross-check** (predicted level + deadline pressure) — pretrained model; PMs do not train.
3. Open **Evaluation history** (multiple runs after re-seed).
4. Click **Trace Analyst** (or review persisted analysis) for the narrative (`VERDICT`, evidence, schedule) — explanation only; does not replace the rule score.

### 4. Alerts (notify)

1. Open **Alerts** (`/alerts`).
2. Show unread risk alerts for Medium+ projects created during seed evaluate.
3. **Mark read** one alert after discussing recommended PM actions.

### 5. PM action + re-evaluation (act)

1. On **RECOVERING** project, note trend: history shows prior escalation; current evaluation is lower.
2. On **HIGH** or **MEDIUM** project, edit a task (extend deadline or raise progress) as PM/admin.
3. Click **Evaluate** again → show score/level change and alert behavior.

### 6. Developer signals (optional)

1. Sign in as **`dev1@foretrace.local`**.
2. Show **Terminal incidents** on Payments API project.
3. Mention CLI / VS Code extension path (`/docs`) for live ingest during Q&A.

## Implementation notes

- Seed entrypoint: `apps/api/src/seed/run-defense-demo-seed.ts`
- Fixtures: `apps/api/src/seed/defense-demo.constants.ts`
- Uses Nest DI (`DefenseDemoSeedModule`) and production services:
  - `ProjectSignalsService.refreshSnapshot`
  - `ProjectRiskService.evaluateAndPersist`
  - `ProjectImpactAnalyzerService.analyze`
  - `AlertsService.maybeEmitRiskEvaluationAlert` (via evaluate)
- OpenAI is **optional**; Trace Analyst falls back to heuristic text when `OPENAI_API_KEY` is unset.
- Email alerts only send when `MAIL_ENABLED=1` and SMTP is configured.

## Troubleshooting

| Issue | Check |
|-------|--------|
| `P1001` / DB connection errors | `DATABASE_URL`, Render Postgres awake, SSL in connection string |
| Seed fails on unique constraint | Re-run — script purges per-project derived data first |
| All projects show LOW | Confirm seed completed; click **Refresh** on Signals then **Evaluate** |
| No alerts | Alerts require Medium+ on evaluate; re-run seed or evaluate after worsening signals |
| Login fails | Password exactly `DefenseDemo2026!`; user emails lowercase |

## Related docs

- [`FORETRACE_MASTER_CHECKLIST.md`](../FORETRACE_MASTER_CHECKLIST.md) — implementation status
- [`docs/PROJECT_SRS.md`](./PROJECT_SRS.md) — thesis architecture
- [`docs/AI.md`](./AI.md) — Trace Analyst behavior
- In-app guide: **Documentation** (`/docs`)
