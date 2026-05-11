# Foretrace

**Early signals. Explainable risk. Better delivery.**

Foretrace is an AI-assisted **software project monitoring** web application: it combines **project/task data**, **GitHub activity**, and **local developer terminal signals** to score **task / developer / project risk**, explain **why**, recommend **actions**, and **email project managers** when intervention may be needed.

> Working name: **Foretrace**. Change at any time; keep `docs/PROJECT_SRS.md` in sync.

## Documentation

- **[Software requirements & architecture reference](docs/PROJECT_SRS.md)** — actors, workflows, stack, roadmap (SRS-style).
- **[AI / risk narratives](docs/AI.md)** — how `aiSummary` is produced (heuristic + optional OpenAI), and how to extend or train later.
- **[`.env.example`](.env.example)** — required variables for API, optional CLI/smoke; keep in sync with **`apps/api/.env`** and (for `VITE_*` only) **`apps/web/.env.example`**.

## Monorepo layout

| Path | Package | Role |
|------|---------|------|
| `packages/shared` | `@foretrace/shared` | Zod contracts and shared TypeScript APIs |
| `packages/cli` | `@foretrace/cli` | Terminal log ingest CLI (`foretrace ingest`) |
| `apps/web` | `@foretrace/web` | React + Vite SPA (Tailwind CSS v4, Lucide) |
| `apps/api` | `@foretrace/api` | NestJS HTTP API |

## Commands (repository root)

- `npm install` — install and link workspaces (requires sufficient disk space for Prisma/OpenSSL toolchain)
- `npm run dev` — Turbo starts shared `tsc --watch`, Nest `start:dev`, and Vite (`^build` runs once first)
- `npm run build` — production builds for all packages
- `npm run lint` — typecheck/lint pipelines per package
- `npm run smoke:terminal-ingest` — end-to-end script: login → mint CLI token → sample `POST …/terminal/batches` (requires `FORETRACE_*` in `.env`; see [`.env.example`](.env.example))
- `npm run terminal:ingest` — pipe stdin to the API via built `@foretrace/cli` (build CLI first: `npm run build -w @foretrace/cli`)

**Ports:** API `http://localhost:3000`, web `http://localhost:5173` (Vite dev server proxies `GET /health`, auth routes under `/auth`, and `GET /organizations` to the API with cookies).

The API **starts without `DATABASE_URL`** so you can iterate on the UI; Prisma connects on first query once you copy [`.env.example`](.env.example) and run Postgres.

Current JSON endpoints include **`GET /health`**, **`GET /health/ready`** (DB probe), session-based **`/auth/*`** (register, login, logout, `me`), **`GET /organizations`**, nested **projects/tasks**, **GitHub** link + webhooks + optional **`PATCH/DELETE …/github/pat`** (stores an encrypted PAT for REST enrichment when **`FORETRACE_APP_SECRET`** is set — see [`.env.example`](.env.example)), **CLI ingest tokens** (`…/cli-tokens` mint/list/revoke, session auth), **project signals** (`…/signals`, `…/signals/refresh`), **project risk v0** (`…/risk`, `…/risk/history`, `…/risk/evaluate`), **organization alerts** (`GET …/organizations/:id/alerts`, `POST …/alerts/:alertId/read`), **`GET …/organizations/:id/audit-logs`**, **terminal incidents** (`GET …/terminal/incidents?limit=`, session auth), and **terminal batches** (`POST …/terminal/batches`, Bearer `ft_ck_…` only — see [Terminal ingest](#terminal-ingest-foretracecli--api)).

Set **`SESSION_SECRET`** (32+ random characters) and, if you use stored GitHub PATs, **`FORETRACE_APP_SECRET`** (16+ characters) for production; see [`.env.example`](.env.example). In production, session cookies use **`SameSite=None`** and **`Secure`** so the Vercel-hosted SPA can call the Render API with `credentials: 'include'`.

## Windows troubleshooting

**`ENOSPC` during `npm install`:** npm and many tools unpack to `%TEMP%` on **C:**. If **C:** is almost full (even when the repo is on **E:**), free space there or redirect temp for the session:

```powershell
New-Item -ItemType Directory -Force -Path E:\foretrace\.tmp-temp | Out-Null
$env:TEMP = 'E:\foretrace\.tmp-temp'; $env:TMP = $env:TEMP
npm install
```

This repo ships a root [`.npmrc`](.npmrc) so **`npm`** uses **`E:\foretrace\.npm-cache`** for cache (ignored by git).

**`docker` is not recognized:** You do **not** need Docker. Install **PostgreSQL 16** locally (or point **`DATABASE_URL`** at any reachable server)—see **[Database](#database-postgresql--prisma)**. Docker is optional if you prefer **`docker compose up -d`**; see also [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

---

## Database (PostgreSQL + Prisma)

Prerequisite: a **`DATABASE_URL`** that Prisma can reach. Nest loads **`.env`** at the repo root and **`apps/api/.env`**; keep both in sync for local commands.

### Option A — Render PostgreSQL (no local server)

This repo’s [`render.yaml`](render.yaml) provisions Postgres on **Render**. You can point **local development** at that same database:

1. In the [Render Dashboard](https://dashboard.render.com), open your **PostgreSQL** instance → **Connections**.
2. Copy the **External Database URL** (needed when connecting from your PC, not from another Render service).
3. Put it in **`.env`** and **`apps/api/.env`** as **`DATABASE_URL=`** on **one line** (quote the value if it contains `&`). Render’s URL usually includes SSL; use it as-is.

Then run migrations from your machine: **`npm run db:migrate:deploy -w @foretrace/api`**.

Treat that URL like a password: **never commit it**. Prefer a **separate** Render Postgres for development if you want isolation from production data.

The deployed **web service** on Render already receives **`DATABASE_URL`** from the database via the blueprint (`fromDatabase` in [`render.yaml`](render.yaml)); you only need to paste the external URL locally if you want your laptop to use Render’s DB.

### Option B — PostgreSQL on your machine (pgAdmin / local install)

1. Copy [`.env.example`](.env.example) to **`.env`** and **`apps/api/.env`**. Set **`DATABASE_URL`** to your local user, password, host, port, and database name.

2. If you use **local** Postgres, create the user and database (no Docker):

   - Install PostgreSQL from the official [Windows download](https://www.postgresql.org/download/windows/) or your package manager, **version 16** if possible so it matches the compose image and team defaults.
   - **pgAdmin 4:** You use it to manage **PostgreSQL** (pgAdmin alone is not the server—PostgreSQL must be installed and reachable, usually `localhost:5432`). Connect to your server → **Login/Group Roles** → **Create** → **Login/Group Role…** (e.g. name `foretrace`, set a password) → **Databases** → **Create** → **Database…** (name `foretrace`, owner **foretrace**). Put that user/password/db/host/port into **`DATABASE_URL`**.

   - **Or SQL** (`psql` as superuser, e.g. `postgres`):

     ```sql
     CREATE USER foretrace WITH PASSWORD 'foretrace';
     CREATE DATABASE foretrace OWNER foretrace;
     ```

   - Use port **`5432`** on **`localhost`** unless your install differs; then mirror that in **`DATABASE_URL`**.

   **Optional — Docker:** if you use Docker Desktop and want the bundled database only:

   ```bash
   docker compose up -d
   ```

   That brings up Postgres with user **`foretrace`**, password **`foretrace`**, database **`foretrace`**, port **`5432`** (see [`docker-compose.yml`](docker-compose.yml)).

3. Apply migrations (from repo root):

   ```bash
   npm run db:migrate:deploy -w @foretrace/api
   ```

   For local iteration that creates migration files:

   ```bash
   npm run db:migrate -w @foretrace/api
   ```

4. Optional: browse data with Prisma Studio: `npm run db:studio -w @foretrace/api`

Quick check (local DB): `psql "<your-DATABASE_URL>" -c "SELECT 1"`. For Render, use the same **External** URL as in `.env`.

Models live in [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma) (orgs, memberships with `Role`, projects, tasks with priorities/status).

**Windows:** If `prisma generate` or `npm run build -w @foretrace/api` fails with `EPERM` while renaming `query_engine-windows.dll.node`, something is locking that file (a running **`node`** process such as `npm run dev`, the editor indexing `node_modules`, or real-time antivirus). Stop the dev server and other API shells, add a Defender exclusion for this repo’s **`node_modules\.prisma`**, or run the command from **WSL**. Linux and CI are unaffected.

## Deployment (Render API + Vercel frontend)

Intended split: **Nest + PostgreSQL on [Render](https://render.com/)**, **Vite static app on [Vercel](https://vercel.com/)** (monorepo root stays the Git project for both). The browser **never** needs `VITE_API_URL` to point at the same host as the SPA: set **`VITE_API_URL`** on the Vercel **frontend** project to your **`https://…onrender.com`** API URL, and set **`CORS_ORIGINS`** on **Render** to your **`https://…vercel.app`** SPA origin.

### Render (backend)

1. Push this repo to GitHub (or connect your host). In Render, use **Blueprint** / **Infrastructure as Code** and point at [`render.yaml`](render.yaml), or create resources manually to match it.
2. The blueprint provisions **PostgreSQL 16** and a **Node web service** that runs `turbo build` for `@foretrace/api`, runs **`prisma migrate deploy`** on each deploy, and starts `node dist/main` with Render’s **`PORT`**.
3. In the web service **Environment** tab, set **`SESSION_SECRET`** (long random string; never commit) and **`CORS_ORIGINS`** to your Vercel **production** browser origin exactly (HTTPS, **no trailing slash**), comma-separated if you use several domains, for example **`https://foretrace-xxxx.vercel.app`** or your custom domain.

   **Vercel preview deploys** each get a different `https://…vercel.app` URL. Until you add each URL to **`CORS_ORIGINS`**, the browser blocks `/health`, `/auth/*`, etc. (**“No Access-Control-Allow-Origin” / preflight failures**).

   Faster for preview-heavy workflows: set **`CORS_ALLOW_VERCEL_PREVIEW=1`** on Render to allow any **`https://*.vercel.app`** origin (wide; avoid for strict production hardening). After changing env vars, redeploy the API service.
4. Note the public API URL (e.g. `https://foretrace-api.onrender.com`). The web app will call this via **`VITE_API_URL`**.

If Prisma cannot connect, confirm the Render **`DATABASE_URL`** matches what Prisma expects (Render’s string usually includes SSL; Prisma 6 + PostgreSQL is fine with the default connection string).

**`API_PUBLIC_URL`** on Render should match the public **`https://…onrender.com`** service URL (no trailing slash) so GitHub connection responses show the correct **`POST /webhooks/github`** URL. It must **not** be the Vercel SPA URL unless the API is actually served from there.

### GitHub webhooks (API)

Requires DB migrations applied (`GitHubConnection`, `GitHubWebhookEvent`, `GitHubUserLink` tables).

1. **Link a repo (ADMIN / PM)** — `POST /organizations/:organizationId/projects/:projectId/github` with `{ "repositoryFullName": "owner/repo" }`. Save the **`webhookSecret`** from the JSON response (**shown once**). The response **`webhookUrl`** is `API_PUBLIC_URL` or `http://localhost:3000`, plus **`/webhooks/github`** (same endpoint for every repository).
2. **GitHub** → repository **Settings → Webhooks → Add webhook**: paste **`webhookUrl`**, Content type **`application/json`**, secret = **`webhookSecret`**; GitHub ships **`sha256`** signatures which the API verifies. Under **Which events?**, you can start with **Let me select individual events** and enable **Pushes**, **Pull requests**, and **Issues** only — that matches what Foretrace aggregates today and avoids noisy Actions-only traffic. If you send **workflow runs / deployments / status** and something fails, open **Recent Deliveries** in GitHub: a **failed** (red) row means Foretrace returned an error (wrong secret, **repository name in the payload does not match** the linked repo — common for **fork PR** workflows where the payload names the fork, not upstream).
3. **`GET`** the same **`.../projects/:projectId/github`** path returns connection metadata and recent stored events (**no secret**). **`DELETE`** removes the connection and history.
4. **Map collaborators (optional)** — `POST …/github/user-links` body `{ "githubLogin": "octocat", "userId": "<uuid>" }` (user must belong to that organization). Listed with **`GET …/github/user-links`**.
5. **Web:** expand a project on **Projects** (`/projects`): the **GitHub** panel links a repo (PM/ADMIN), shows one-time webhook URL/secret with copy buttons, recent deliveries, disconnect, and user mapping (PM/ADMIN edit; all members can read).

### Terminal ingest (`@foretrace/cli` + API)

Requires DB migrations applied (`CliIngestToken`, `TerminalIngestBatch`, `TerminalIncident` tables).

1. **Mint CLI token (session auth required):**
   - `POST /organizations/:organizationId/projects/:projectId/cli-tokens`
   - Store the returned plaintext token securely; DB stores only SHA-256 digest.
2. **Set CLI env vars** (see [`.env.example`](.env.example)): `FORETRACE_API_URL`, `FORETRACE_TOKEN`, `FORETRACE_ORGANIZATION_ID`, `FORETRACE_PROJECT_ID`, optional `FORETRACE_TASK_ID`.
3. **Build CLI once** (after changes): `npm run build -w @foretrace/cli`
4. **Pipe command output to CLI:**

   ```bash
   npm run build 2>&1 | npm run terminal:ingest
   ```

5. CLI posts to `POST /organizations/:organizationId/projects/:projectId/terminal/batches` with `Authorization: Bearer ft_ck_...`.
6. API redacts obvious secret patterns, stores batch metadata, classifies likely signal lines, and upserts project-scoped incident fingerprints.

**Automatic-ish local capture (no pipe every time):**

- **`foretrace run -- <command>`** — runs the command, **streams** stdout/stderr to your terminal, then **POSTs** captured lines (default: only when the command exits **non-zero**; set **`FORETRACE_INGEST_ON=always`** to always send when there is output). Same `FORETRACE_*` env vars as `ingest`.
- **One-time shell snippet** — `foretrace hook print-zsh` or `foretrace hook print-bash` prints a small **`ftx`** wrapper you paste into `~/.zshrc` / `~/.bashrc`; then use **`ftx npm run build`** instead of typing the full pipe. (Optional global `alias npm=…` is **not** recommended; use `ftx` or `package.json` scripts.)
- **Fully automatic CI logs** — workflow [`.github/workflows/foretrace-ci-ingest.example.yml`](.github/workflows/foretrace-ci-ingest.example.yml) runs on **main/master** pushes: **`npm ci`**, **`npm run build -w @foretrace/web`** (log via **`tee`**), then optional **`POST …/terminal/batches`**. If the four **`FORETRACE_*`** repository secrets are **not** set, the upload step is **skipped** (green CI); when they are set, a failed ingest fails the job so you notice misconfiguration.

**Smoke script (login → mint token → ingest one batch):** set `FORETRACE_API_URL`, `FORETRACE_EMAIL`, `FORETRACE_PASSWORD`, `FORETRACE_ORGANIZATION_ID`, `FORETRACE_PROJECT_ID` in `.env` (repo root), then:

```bash
npm run smoke:terminal-ingest
```

The script loads `.env` from the repo root if variables are not already exported. If `Set-Cookie` is not returned to your client (unusual when calling the API host directly), copy the `foretrace.sid` cookie from the browser after sign-in and set **`FORETRACE_COOKIE`** instead of email/password.

### Vercel (frontend)

1. In [vercel.com](https://vercel.com) → **Add New…** → **Project** → **Import** the **same GitHub repo** as Render (`TamehChana/foretrace` or yours).
2. **Root Directory** → **repository root** (**`.`**). The root [`vercel.json`](vercel.json) runs **`npm ci --include=dev`**, pins Vite on **`@foretrace/web`**, then uses a small deploy script (**[`scripts/vercel-deploy-web.mjs`](scripts/vercel-deploy-web.mjs)**) so **build paths do not depend on the shell cwd**. Static output is synced to **`dist/`** at the repo root (**`outputDirectory`: `dist`**). Prefer leaving **Output Directory** in the dashboard **empty** so settings match `vercel.json`.
   - Alternate layout: **Root Directory → `apps/web`** with [`apps/web/vercel.json`](apps/web/vercel.json) (builds via **`cd ../..`**; output **`dist`** under the web app). If Root was mistakenly **`apps/api`**, [`apps/api/vercel.json`](apps/api/vercel.json) targets **`../../dist`** so the synced bundle is still found.
3. Leave **Framework Preset** to auto-detect **Vite** (or **Other** if you prefer; the important values are the install/build commands in `vercel.json`).
4. **Environment Variables** (redeploy after adding or changing):
   - **`VITE_API_URL`** = your Render API URL **with no trailing slash**, e.g. `https://foretrace-api.onrender.com`.
5. **Deploy**. Open the `.vercel.app` URL → register/sign-in should reach the Render API via `apiUrl()`.
6. **Render:** **`CORS_ORIGINS`** must list every frontend origin that uses **`credentials`** (sessions). Example: **`https://foretrace-abc.vercel.app,https://foretrace-def.vercel.app`** for two previews plus production — **no spaces after commas.** Or **`CORS_ALLOW_VERCEL_PREVIEW=1`** to admit all **`https://*.vercel.app`**. Then redeploy the API service.

Local dev stays unchanged: use **`apps/web/.env`** with **`VITE_API_URL`** pointing at your **Render** API when you want prod-style cross-origin behavior, or omit it and use the Vite proxy to **`localhost:3000`**. See [`apps/web/.env.example`](apps/web/.env.example).

### CORS quick reference (Render API + Vercel SPA)

| Symptom | Check |
|--------|--------|
| `No 'Access-Control-Allow-Origin'` from **`…vercel.app`** to **`…onrender.com`** | **`CORS_ORIGINS`** on **Render** must list the **exact** SPA origin (HTTPS, no trailing slash). |
| **`401 Unauthorized`** on **`…/github`**, **`…/tasks`**, etc., while the UI looks signed in | Usually the **`foretrace.sid`** cookie is not sent to another host (Vercel → Render). **Sign out and sign in again** after upgrading the API: login/register responses include an **`accessToken`** the SPA stores in **`sessionStorage`** and sends as **`Authorization: Bearer`**, so API calls work without third-party cookies. Still set **`CORS_ORIGINS`** on Render to your SPA origin. If **`SESSION_SECRET`** changed, old cookies and tokens are invalid. |
| Requests still hit the wrong host | **`VITE_API_URL`** on the **Vercel** frontend project must be the **Render** API URL; **redeploy** after changing (value is baked in at build time). |

## Next implementation steps

**Done in API:** sessions, organizations, projects/tasks CRUD, **GitHub webhook ingestion + per-repo connection + user mapping** (SRS §13 item **5**), **terminal ingest v1** (SRS §13 item **6**): Prisma models, **`POST …/terminal/batches`** (Bearer CLI token), redaction + coarse classification + **`TerminalIncident`** fingerprints, **`GET …/terminal/incidents`** (session) + web **Terminal incidents** table, **`@foretrace/cli`** + [`scripts/terminal-ingest-smoke.mjs`](scripts/terminal-ingest-smoke.mjs), and **per-project signal snapshots** (SRS §13 item **7** slice): persisted **`ProjectSignalSnapshot`** (24h window JSON), **`GET/POST …/projects/:projectId/signals`** (refresh: **ADMIN**/**PM**), dashboard **Project signals** panel, plus **automatic snapshot refresh** after each successful GitHub webhook delivery and terminal batch ingest (per-project **60s** cooldown to limit load). **CLI ingest tokens:** mint/list/revoke in the **Projects** dashboard (expanded project) as well as **`…/cli-tokens`** HTTP API. **Project risk v0** (SRS §13 item **8** slice): persisted **`ProjectRiskEvaluation`** (level, score, structured reasons JSON), **`GET/POST …/projects/:projectId/risk/evaluate`** (**ADMIN**/**PM**), dashboard **Delivery risk** panel (evaluate refreshes signals then scores). **Alerts v0** (SRS §13 item **9** slice): Prisma **`Alert`** (risk evaluation kind), created when evaluate yields **Medium+** and risk **worsened** or first hit at that tier; **`GET/POST …/organizations/:id/alerts`** list + mark read; web **`/alerts`** inbox and header bell link.

**Next product slices:** risk **history** (append-only evaluations), **email** + alert digests, terminal incident **drill-down** (task timeline / batch link), async queue for terminal batches (if needed at scale), scheduled jobs, and dashboard depth per [`docs/PROJECT_SRS.md`](docs/PROJECT_SRS.md).

## RBAC (organization scope)

Nest **`RolesGuard`** resolves the active organization from:

1. **`organizationId`** in the route (`GET /organizations/:organizationId`), or
2. The **`X-Organization-Id`** header when the handler has no `:organizationId` param.

Combine with **`@Roles(...)`** (see Prisma **`Role`** enum: **ADMIN**, **PM**, **DEVELOPER**) to require membership **and** one of those roles. Use **`@Roles()`** with no arguments to require membership only.

Bootstrap your first tenant with **`POST /organizations`** (authenticated JSON body: **`name`**, optional **`slug`**): creates the row and a **`Membership`** with role **`ADMIN`** for the calling user.

Example routes: **`GET /organizations/:organizationId`** (any member) and **`GET /organizations/:organizationId/delivery-policy`** (**ADMIN** or **PM** only). An **`OrganizationUuidParamGuard`** validates the path segment **before** authentication so invalid UUIDs return **400** instead of **401**.

## Creating a first account (development)

With Postgres migrated and **`DATABASE_URL`** set, start the stack (`npm run dev`), open the web UI, choose **Register**, then sign in. On the overview, use **Create organization** (or call **`POST /organizations`**) to add a workspace and become its **ADMIN** via the auto-created **Membership** row.

## License

To be determined by the author.
