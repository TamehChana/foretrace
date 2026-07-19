# Foretrace Master Checklist

Living checklist for the Foretrace Master’s thesis system. Status markers are **evidence-based only** (confirmed from repository files, not runtime guesses).

**Legend**

| Marker | Meaning |
|--------|---------|
| `[x]` | Done — implemented and present in codebase |
| `[/]` | Partially done — slice shipped; known gaps remain |
| `[ ]` | Not started — no implementation found in codebase |

**Guiding rule:** [`.cursor/rules/Foretrace-Senior-Engineering-Rule.mdc`](.cursor/rules/Foretrace-Senior-Engineering-Rule.mdc) — thesis value over generic PM tooling; closed loop: Signals → Snapshot → Risk → Explanation → Alert → PM action → Re-evaluation.

---

## Current Project State

> Filled from static codebase audit (`package.json`, `schema.prisma`, routes, controllers, docs). Runtime health (DB reachability, deployed URLs) is environment-dependent and **not** asserted here.

| Field | State |
|-------|--------|
| **Frontend** | React 19 + Vite 8 + React Router 7 + Tailwind CSS v4 (`apps/web`). Routes: `/`, `/docs`, `/projects`, `/alerts`, `/settings`. |
| **Backend** | NestJS 11 + Prisma 6 + PostgreSQL (`apps/api`). Session auth + Bearer `accessToken`. Modular domains: auth, orgs, projects, GitHub, terminal, signals, risk, alerts, AI, audit. |
| **Database** | PostgreSQL via Prisma — **19 models** in `apps/api/prisma/schema.prisma`. Migrations under `apps/api/prisma/migrations/`. **No seed/demo script** found. |
| **Deployment** | Render blueprint (`render.yaml`: Postgres 16 + API, migrate on deploy, `/health/ready`). Vercel web (`vercel.json`, `scripts/vercel-deploy-web.mjs`). |
| **Local run command** | `npm install` → copy `.env.example` to `.env` + `apps/api/.env` → `npm run db:migrate:deploy -w @foretrace/api` → `npm run dev` (Turbo: `@foretrace/shared`, `@foretrace/web`, `@foretrace/api` when `dev` script present). |
| **Main working feature** | Project-level **closed-loop delivery monitoring**: tasks + GitHub webhooks + terminal ingest → **signal snapshot** → **rule-based risk evaluate** → **in-app alerts** (+ optional email / Trace Analyst). |
| **Biggest broken feature** | **Not confirmed from codebase alone** (depends on `DATABASE_URL`, CORS, SMTP, `OPENAI_API_KEY`). Stale UI copy: `RoadmapCard` still lists shipped milestones as future work. |
| **Most important missing feature** | **What-if simulator** (referenced in Senior Engineering Rule; **zero app code**). Also: **demo/seed data** for LOW/MEDIUM/HIGH/CRITICAL defense scenarios (no seed script). |

---

## 1. Project setup

- [x] npm workspaces monorepo (`apps/*`, `packages/*`, `extensions/*`) — `package.json`
- [x] Turborepo `dev` / `build` / `lint` — `turbo.json`
- [x] Shared contracts package `@foretrace/shared` — `packages/shared/`
- [x] CLI package `@foretrace/cli` — `packages/cli/`
- [x] VS Code extension `foretrace-vscode` — `extensions/foretrace-vscode/`
- [x] Root env template — `.env.example`
- [x] Web env template — `apps/web/.env.example`
- [x] Docker Compose Postgres 16 (optional local DB) — `docker-compose.yml`
- [x] Root scripts: `smoke:terminal-ingest`, `terminal:ingest`, `extension:package`, Vercel deploy helpers — `package.json`, `scripts/`
- [x] API `dev` script for Turbo (`nest start --watch`) — `apps/api/package.json`
- [/] Dedicated `apps/api/.env.example` (root `.env.example` is canonical; copy to `apps/api/.env` per README)
- [/] `packages/cli` has `build`/`lint` only (no `dev` watch script)
- [x] Defense demo seed script — `npm run seed:defense -w @foretrace/api`, `docs/DEFENSE-DEMO.md`

---

## 2. Core product

- [x] App shell (sidebar, top bar, theme toggle) — `apps/web/src/components/layout/AppShell.tsx`
- [x] Overview dashboard with org rollup — `OverviewPage.tsx`
- [x] Projects hub (expandable project panels) — `ProjectsPage.tsx`
- [x] Alerts inbox — `AlertsPage.tsx`
- [x] Settings (audit log, insight feedback export) — `SettingsPage.tsx`
- [x] In-app setup documentation — `DocumentationPage.tsx` (`/docs`)
- [x] API health panel on overview — `ApiHealthPanel.tsx`
- [x] VSIX download for extension — `DocumentationPage.tsx`, `scripts/sync-vsix-to-web-public.mjs`
- [/] `RoadmapCard` copy outdated vs shipped features — `RoadmapCard.tsx`
- [ ] Dedicated task-level or developer-level dashboard views (project panels only today)

---

## 3. Authentication and RBAC

- [x] Register / login / logout / `GET /auth/me` — `apps/api/src/auth/auth.controller.ts`
- [x] Password hashing (bcrypt) — `auth.service.ts`
- [x] Session cookies (httpOnly) + SPA Bearer `accessToken` — `auth.service.ts`, `access-token.ts`
- [x] `AuthenticatedGuard` + `RolesGuard` + `@Roles()` — `apps/api/src/auth/guards/`
- [x] Prisma `Role` enum: `ADMIN`, `PM`, `DEVELOPER` — `schema.prisma`
- [x] Role enforcement on projects, tasks, signals, risk, GitHub, terminal, alerts, audit — controllers under `apps/api/src/`
- [x] Auth UI modal + session provider — `AuthModal.tsx`, `AuthSessionProvider.tsx`
- [x] Auth route throttling — `auth.controller.ts`
- [/] `GET …/delivery-policy` placeholder route — `organizations.controller.ts`
- [ ] Dedicated admin RBAC management UI beyond inline role checks

---

## 4. Organizations and members

- [x] `POST /organizations` (creator becomes `ADMIN`) — `organizations.controller.ts`
- [x] `GET /organizations`, `GET /organizations/:id` — `organizations.controller.ts`
- [x] `GET …/members`, `GET …/members/me` — `organization-members.controller.ts`
- [x] Invite member by email (`POST …/members`, `ADMIN`/`PM`) — `memberships.service.ts`
- [x] Web: create organization modal — `CreateOrganizationModal.tsx`
- [x] Web: org picker + org ID copy on overview/projects/settings
- [/] Invite requires user to **already exist** (no email invite / magic link) — `memberships.service.ts`
- [/] Audit log for sensitive actions (partial coverage) — `audit.service.ts` + `SettingsPage.tsx`
- [ ] `PATCH` / `DELETE` organization
- [ ] Remove member / change member role endpoints

---

## 5. Projects and tasks

- [x] Project list / create / get / patch — `projects.controller.ts`, `projects.service.ts`
- [x] Soft archive via `archivedAt` — `update-project.dto.ts`, `projects.service.ts`
- [x] Task list / create / get / patch / delete — `tasks.controller.ts`
- [x] Assignee, priority, status, deadline, progress % — `Task` model, DTOs
- [x] GitHub issue number on task (`githubIssueNumber`) — schema, `update-task.dto.ts`
- [x] Task GitHub activity endpoints (activity, check-status, reconcile) — `tasks.controller.ts`
- [x] Full tasks UI in expanded project — `ProjectsPage.tsx`
- [/] Task **create** restricted to `ADMIN` only (PM edits existing) — `tasks.controller.ts`, `ProjectsPage.tsx`
- [ ] Hard delete project
- [ ] Task/developer scoped risk (project scope only today)

---

## 6. GitHub signals

- [x] Link repo to project (`POST …/github`, `owner/repo`) — `github-integration.controller.ts`
- [x] Webhook receiver `POST /webhooks/github` + signature verify — `github-webhook.controller.ts`, `github-webhook-verify.ts`
- [x] Store normalized webhook events + delivery dedupe — `GitHubWebhookEvent` model, `github-webhook.service.ts`
- [x] GitHub user links (`POST/GET/DELETE …/user-links`) — `github-integration.controller.ts`
- [x] Optional encrypted PAT (`PATCH/DELETE …/github/pat`, `FORETRACE_APP_SECRET`) — `github-integration.controller.ts`, `app-secret-crypto.ts`
- [x] Auto task updates from webhooks (progress/status, `TaskGitHubActivity`) — `github-webhook.service.ts`
- [x] Issue ref matching (`#42` in commits/PRs) — `github-webhook-issue-refs.ts`
- [x] Web GitHub panel + self-link card — `ProjectGitHubPanel.tsx`, `ProjectGithubSelfLinkCard.tsx`
- [x] REST enricher for PR status (when PAT present) — `github-signal-rest-enricher.ts`
- [ ] GitHub App install flow (README: per-repo webhooks only)

---

## 7. Terminal signals

- [x] CLI `foretrace ingest` — `packages/cli/src/cli.ts`
- [x] CLI `foretrace run -- <cmd>` + shell hook snippets — `packages/cli/src/cli.ts`
- [x] `POST …/terminal/batches` (Bearer `ft_ck_…`) — `terminal-batches.controller.ts`
- [x] CLI token mint / list / revoke — `cli-tokens.controller.ts`
- [x] Secret redaction — `terminal-redact.ts`
- [x] Line classification (`BUILD`, `TEST`, `RUNTIME`, etc.) — `terminal-classify.ts`
- [x] Incident fingerprint upserts — `TerminalIncident` model, `terminal-ingest.service.ts`
- [x] `GET …/terminal/incidents` — `terminal-incidents.controller.ts`
- [x] VS Code / Cursor extension — `extensions/foretrace-vscode/`
- [x] Web CLI tokens + terminal incidents panels — `ProjectCliTokensPanel.tsx`, `ProjectTerminalIncidentsPanel.tsx`
- [x] Smoke script — `scripts/terminal-ingest-smoke.mjs`
- [/] CI ingest example workflow only (not default active) — `.github/workflows/foretrace-ci-ingest.example.yml`
- [ ] Async ingest queue / worker
- [ ] Rich incident drill-down (batch link, task timeline)

---

## 8. Signal snapshots

- [x] Persisted `ProjectSignalSnapshot` (24h rollup JSON) — `schema.prisma`
- [x] `GET …/signals` + `POST …/signals/refresh` (`ADMIN`/`PM`) — `project-signals.controller.ts`
- [x] Rollup: GitHub counts, terminal incidents, task tallies — `project-signals.service.ts`
- [x] Auto refresh after terminal ingest (cooldown) — `terminal-ingest.service.ts`, `project-signals.service.ts`
- [x] Auto refresh path after GitHub webhook (via risk/snapshot refresh) — `github-webhook.service.ts`
- [x] HTTP cron `POST /internal/cron/refresh-project-snapshots` — `internal-cron.controller.ts`
- [x] GitHub Actions cron workflow — `.github/workflows/foretrace-snapshots-cron.yml`
- [x] Web signals panel — `ProjectSignalsPanel.tsx`
- [ ] In-process Nest scheduler (external HTTP cron only today)

---

## 9. Rule-based risk engine

- [x] Pure rule engine `computeRiskFromPayload` — `risk-score.engine.ts`
- [x] Levels `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` + numeric score — `RiskLevel` enum, engine
- [x] Structured `reasons[]` (`code` + `detail`) — `risk-reason.types.ts`, `ProjectRiskEvaluation.reasons`
- [x] Latest evaluation `ProjectRiskEvaluation` — schema
- [x] Append-only history `RiskEvaluationRun` — schema, `project-risk.service.ts`
- [x] `GET /risk`, `GET /risk/history`, `POST /risk/evaluate` — `project-risk.controller.ts`
- [x] Debounced background rules refresh (no history row) — `project-risk.service.ts`
- [x] Web delivery risk panel — `ProjectRiskPanel.tsx`
- [/] **Project-level scope only** (SRS also describes task/developer risk)
- [x] Structured `recommendations[]` in API/schema (rule-derived `ACT_*` codes; persisted on latest + history)
- [ ] Rule engine version id stored on every evaluation (SRS FR-RISK-04)

---

## 10. Machine learning model

- [x] ML module (`risk-ml.service.ts`, `risk-feature-vector.ts`, `risk-ml-logit.ts`) — `apps/api/src/ml/`
- [x] Default weights `risk-ml-v1.weights.json` (copied to `dist/ml/` on build) — `nest-cli.json` assets
- [x] `mlPrediction` JSON on risk rows — `ProjectRiskEvaluation.mlPrediction`
- [x] Opt-in via `FORETRACE_ML_RISK_ENABLED` — `risk-ml.service.ts`, `.env.example`
- [x] Offline training: `npm run ml:train`, `npm run ml:train:history` — `apps/api/package.json`
- [x] Documentation — `docs/ML-RISK.md`
- [/] ML disabled by default; labels partly synthetic / history-dependent per `docs/ML-RISK.md`
- [ ] Automated CI model training / deployment pipeline
- [ ] Calibration metrics surfaced in UI

---

## 11. Trace Analyst AI narrative

- [x] Risk evaluation `aiSummary` (OpenAI or heuristic) — `risk-insight.service.ts`
- [x] On-demand analyze `POST …/insights/analyze` — `project-insights.controller.ts`
- [x] Persisted `ProjectImpactAnalysisRun` + history — `project-impact-analyzer.service.ts`, schema
- [x] Readiness endpoint `GET …/insights/readiness` — `project-insights.controller.ts`
- [x] PM feedback thumbs `POST …/insight-feedback` — `insight-feedback.controller.ts`
- [x] Org feedback list `GET …/insight-feedback` (`ADMIN`/`PM`) — `organization-insight-feedback.controller.ts`
- [x] Web Trace Analyst UI + feedback in risk panel — `ProjectRiskPanel.tsx`
- [x] Documentation — `docs/AI.md`
- [/] Feedback hints optional in prompts (`FORETRACE_AI_USE_FEEDBACK_HINTS`); not used for live scoring
- [/] Controller JSDoc on `analyze` says “does not persist” but service **does** persist — comment mismatch
- [ ] Dedicated Trace Analyst route/page (embedded in project panel today)

---

## 12. Alerts

- [x] `Alert` model (`AlertKind.RISK_EVALUATION`) — `schema.prisma`
- [x] Emit on Medium+ when risk worsens or first hits tier — `shouldEmitRiskEvaluationAlert`, `alerts.service.ts`
- [x] `GET …/organizations/:id/alerts` + `POST …/alerts/:id/read` — `alerts.controller.ts`
- [x] Unread filter — `alerts.controller.ts`
- [x] Email to org `ADMIN` + `PM` when `MAIL_ENABLED` + SMTP — `email.service.ts`, `alerts.service.ts`
- [x] Web `/alerts` inbox — `AlertsPage.tsx`
- [x] Deep-link alert → project delivery risk (`&focus=risk`) — inbox + email (`FORETRACE_APP_URL` / `CORS_ORIGINS`)
- [x] Recommendations in alert payload + inbox UI
- [x] ~15 min same-level create cooldown (escalation / new overdue still emit) — `ALERT_COOLDOWN_MS`
- [x] Terminal ingest schedules rules risk refresh (can emit Medium+ alerts) — `terminal-ingest.service.ts`
- [/] Email opt-in (not on by default) — `.env.example`
- [ ] Alert digests
- [ ] Non-risk alert kinds
- [ ] Per-user alert mute / severity preferences (SRS FR-NOTIF-03)

---

## 13. What-if simulator

- [ ] UI route or component for what-if simulation — **not found** (repo search: only `.cursor/rules/Foretrace-Senior-Engineering-Rule.mdc`)
- [ ] API endpoint to simulate risk under hypothetical task/schedule changes — **not found**
- [ ] Persist or compare simulated vs actual evaluations — **not found**

---

## 14. Testing

- [x] API unit tests (`*.spec.ts` under `apps/api/src/`) — e.g. `alerts.service.spec.ts`, `github-webhook.service.spec.ts`, `tasks.service.spec.ts`
- [x] API e2e (Prisma stub) — `apps/api/test/app.e2e-spec.ts`
- [x] CI workflow (install, prisma generate, lint, test) — `.github/workflows/ci.yml`
- [x] Terminal ingest smoke script — `scripts/terminal-ingest-smoke.mjs`
- [/] E2E coverage minimal (health/auth/orgs stub paths)
- [ ] Web app tests (no vitest/playwright in `apps/web/package.json`)
- [ ] CLI package automated tests
- [ ] Scenario replay / evaluation assertion scripts (SRS §14 hooks documented only)

---

## 15. Deployment

- [x] Render blueprint: Postgres + API, migrate on deploy — `render.yaml`
- [x] API health `/health` and readiness `/health/ready` — `app.controller.ts`
- [x] Vercel web deploy config — `vercel.json`, `apps/web/vercel.json`
- [x] Vercel deploy script — `scripts/vercel-deploy-web.mjs`
- [x] CORS + session production notes — `configure-app.ts`, README
- [x] Snapshots cron GitHub Action — `.github/workflows/foretrace-snapshots-cron.yml`
- [x] Example workflows (cron, CI ingest) — `.github/workflows/*.example.yml`
- [/] `render.yaml` documents `SESSION_SECRET` / `CORS_ORIGINS` only (MAIL, OpenAI, ML manual)
- [ ] Staging environment / multi-env IaC beyond Render + Vercel

---

## 16. Defense readiness

- [x] SRS-style architecture reference — `docs/PROJECT_SRS.md`
- [x] AI narrative docs — `docs/AI.md`
- [x] ML docs — `docs/ML-RISK.md`
- [x] In-app step-by-step demo guide — `DocumentationPage.tsx` (`/docs`)
- [x] Risk levels enum matches thesis vocabulary — `RiskLevel` in schema
- [x] Closed-loop workflow documented in SRS §4 — `docs/PROJECT_SRS.md`
- [/] SRS §13 roadmap partially outdated (e.g. lists risk history/email as “not yet”; code has `RiskEvaluationRun` + email path)
- [/] Senior Engineering Rule asks for demo data at all risk levels — seed script shipped (`npm run seed:defense`, `docs/DEFENSE-DEMO.md`)
- [ ] Evaluation scenario replay scripts (SRS §14)
- [ ] Ablation / false-positive measurement tooling
- [ ] What-if simulator for live defense demos
- [ ] Dedicated thesis chapter / evaluation artifacts in repo

---

## Closed-loop trace (thesis demo path)

Use this sequence to verify the core thesis story end-to-end:

1. **Setup** — org → project → tasks → GitHub link → CLI token  
2. **Signals** — developer pushes/commits + terminal ingest → snapshot refreshes  
3. **Evaluate** — PM runs **Delivery risk** → level + reasons (+ optional ML + Trace Analyst)  
4. **Alert** — Medium+ worsening → `/alerts` (+ email if SMTP on)  
5. **Act** — PM changes tasks (reassign, deadline, status)  
6. **Re-evaluate** — risk history shows trend  

**Blockers for a full demo today (from codebase gaps):** no seed data; no what-if; task/developer risk not scoped.

---

## Maintenance

- Update this file when shipping a slice — mark `[x]` only with file evidence.
- Keep in sync with `docs/PROJECT_SRS.md` §13 roadmap (several items are stale vs code).
- Do not mark runtime/deploy health here; use `/health`, `/health/ready`, and Overview API panel instead.

*Last audited from repository files. Re-run codebase grep before major defense milestones.*
