# Foretrace

**Early signals. Explainable risk. Better delivery.**

Foretrace is an AI-assisted **software project monitoring** web application: it combines **project/task data**, **GitHub activity**, and **local developer terminal signals** to score **task / developer / project risk**, explain **why**, recommend **actions**, and **email project managers** when intervention may be needed.

> Working name: **Foretrace**. Change at any time; keep `docs/PROJECT_SRS.md` in sync.

## Documentation

- **[Software requirements & architecture reference](docs/PROJECT_SRS.md)** — actors, workflows, stack, roadmap (SRS-style).

## Monorepo layout

| Path | Package | Role |
|------|---------|------|
| `packages/shared` | `@foretrace/shared` | Zod contracts and shared TypeScript APIs |
| `apps/web` | `@foretrace/web` | React + Vite SPA (Tailwind CSS v4, Lucide) |
| `apps/api` | `@foretrace/api` | NestJS HTTP API |

## Commands (repository root)

- `npm install` — install and link workspaces (requires sufficient disk space for Prisma/OpenSSL toolchain)
- `npm run dev` — Turbo starts shared `tsc --watch`, Nest `start:dev`, and Vite (`^build` runs once first)
- `npm run build` — production builds for all packages
- `npm run lint` — typecheck/lint pipelines per package

**Ports:** API `http://localhost:3000`, web `http://localhost:5173` (Vite dev server proxies `GET /health`, auth routes under `/auth`, and `GET /organizations` to the API with cookies).

The API **starts without `DATABASE_URL`** so you can iterate on the UI; Prisma connects on first query once you copy [`.env.example`](.env.example) and run Postgres.

Current JSON endpoints include **`GET /health`**, session-based **`/auth/*`** (register, login, logout, `me`), and **`GET /organizations`** (requires a signed-in user; returns orgs the user belongs to via `Membership`).

Set **`SESSION_SECRET`** (32+ random characters) for production; see [`.env.example`](.env.example). In production, session cookies use **`SameSite=None`** and **`Secure`** so the Vercel-hosted SPA can call the Render API with `credentials: 'include'`.

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

Prerequisite: **PostgreSQL 16** at the connection string you put in **`DATABASE_URL`**. The app and Prisma do not depend on Docker.

1. Copy [`.env.example`](.env.example) to `.env` at the **repository root** (or `apps/api/.env`; `ConfigModule` loads `.env` and `../../.env`). Edit **`DATABASE_URL`** if your user, password, host, port, or database name differ from the example.

2. Run Postgres — **without Docker** (typical path if you skipped Docker Desktop):

   - Install PostgreSQL from the official [Windows download](https://www.postgresql.org/download/windows/) or your package manager, **version 16** if possible so it matches the compose image and team defaults.
   - Create a matching role and database (same values as [`.env.example`](.env.example)), from **`psql`** connected as a superuser (e.g. the `postgres` role):

     ```sql
     CREATE USER foretrace WITH PASSWORD 'foretrace';
     CREATE DATABASE foretrace OWNER foretrace;
     ```

   - Use the default port **`5432`** on **`localhost`**, or change **`DATABASE_URL`** to match your install.

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

Quick check: `psql "postgresql://foretrace:foretrace@localhost:5432/foretrace" -c "SELECT 1"` should succeed once the server and DB exist.

Models live in [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma) (orgs, memberships with `Role`, projects, tasks with priorities/status).

## Deployment (Render API + Vercel frontend)

Intended split: **Nest + PostgreSQL on [Render](https://render.com/)**, **Vite static app on [Vercel](https://vercel.com/)** (monorepo root stays the Git project for both).

### Render (backend)

1. Push this repo to GitHub (or connect your host). In Render, use **Blueprint** / **Infrastructure as Code** and point at [`render.yaml`](render.yaml), or create resources manually to match it.
2. The blueprint provisions **PostgreSQL 16** and a **Node web service** that runs `turbo build` for `@foretrace/api`, runs **`prisma migrate deploy`** on each deploy, and starts `node dist/main` with Render’s **`PORT`**.
3. In the web service **Environment** tab, set **`SESSION_SECRET`** (long random string; never commit) and **`CORS_ORIGINS`** to your Vercel site origin(s), comma-separated, for example:
   - `https://your-project.vercel.app`
   - Add preview URLs if you need them (each preview has its own origin unless you use a single custom domain).
4. Note the public API URL (e.g. `https://foretrace-api.onrender.com`). The web app will call this via **`VITE_API_URL`**.

If Prisma cannot connect, confirm the Render **`DATABASE_URL`** matches what Prisma expects (Render’s string usually includes SSL; Prisma 6 + PostgreSQL is fine with the default connection string).

### Vercel (frontend)

1. **New Project** → import the same Git repository.
2. Leave the project **root** at the **repository root** (not `apps/web` alone) so workspace installs resolve **`@foretrace/shared`**. The repo includes [`vercel.json`](vercel.json): install `npm ci`, build `npx turbo build --filter=@foretrace/web`, output **`apps/web/dist`**.
3. Under **Environment Variables** (Production and Preview as needed), set:
   - **`VITE_API_URL`** = your Render API origin **without** a trailing slash (e.g. `https://foretrace-api.onrender.com`).

Local dev stays unchanged: omit **`VITE_API_URL`** and the Vite dev server proxies **`/health`** to `localhost:3000`. See [`apps/web/.env.example`](apps/web/.env.example).

## Next implementation steps

Session **authentication** with email/password is in place; extend **organization-scoped RBAC** guards (beyond “signed in”) and add REST handlers for projects and tasks aligned with SRS §13 and §6.

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
