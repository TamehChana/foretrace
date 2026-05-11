# Software Requirements & Architecture Reference

**AI-Driven Software Project Monitoring Web Application**  
**(Master’s project — living reference document)**

---

## Document Control

| Field | Value |
|--------|--------|
| **Project name** | **Foretrace** (working product name — rename if you choose another) |
| Purpose | Single source of truth for scope, workflows, actors, stack, and build order |
| Audience | Developers, supervisors, reviewers, interview discussions |
| Version | 1.0 |
| Status | Reference — update as implementation evolves |

### Product naming (identity)

**Chosen working name:** **Foretrace** — “trace issues before they blow the schedule.” Fits early warning + fused signals without sounding like a generic task app.

**Typical identifiers:** repo folder `foretrace`, npm scope optional `@foretrace/web`, `@foretrace/api`, `@foretrace/cli`.

**Alternative names if you rebranding later:** DevBeacon (visibility), ProjectHelm (steering), SignalNexus (fusion of signals), VigilTrace (monitoring-heavy).

---

## 1. Introduction

### 1.1 Purpose

This system is an **intelligent project supervisor** for software development—not a generic task tracker. It **monitors fused signals** from:

- **Project and task management** (deadlines, priorities, assignments, progress)
- **GitHub activity** (commits, pull requests, issues, comments)
- **Local development terminal output** (build/test/runtime failures, warnings, repeated errors)

It **evaluates risk** at **task**, **developer**, and **project** levels, **explains why** risk exists, **recommends actions**, and **notifies project managers by email** (with in-app detail for audit and drill-down).

### 1.2 Product Vision

**Early warning:** detect delivery and technical-blocker patterns **before** deadlines are missed, so PMs can intervene (reassign, extend, unblock reviews, pair, prioritize fixes).

### 1.3 Strategic Positioning vs. Existing Tools

**There is no widely known product that matches this exact combination:** PM task semantics + GitHub collaboration signals + **local terminal friction** + **unified explainable delivery-risk scoring** + **email-first alerting** for PMs.

**Adjacent categories** (partial overlap only):

| Category | Examples | What they overlap | What they typically do *not* do |
|----------|----------|-------------------|----------------------------------|
| Project / issue tracking | Jira, Linear, Asana, Monday | Tasks, deadlines, assignments | Fused “will this slip?” from git + local dev logs; explainable cross-signal risk engine as core |
| Engineering analytics | Jellyfish, Pluralsight Flow, Swarmia, Sleuth | Git-based productivity, DORA/cycle-time style views | PM task-deadline fusion; local terminal blockers as first-class signals |
| Error / observability | Sentry, Datadog, GitHub Actions logs | Failures in CI/production pipelines | Continuous **local dev** terminal capture tied to **your** task model |
| GitHub native | Pulse, Insights, Dependabot, code scanning | Repo activity, security/dependency signals | Project-level “failure risk” with PM recommendations |

**Differentiation to state clearly (e.g. in thesis or interviews):** delivery-risk **fusion** with **structured explanations** and **proactive email alerts**, including **local development pain** as an early proxy for hidden blockers.

---

## 2. Definitions and Acronyms

| Term | Definition |
|------|------------|
| PM | Project manager |
| RBAC | Role-based access control |
| PR | Pull request |
| CLI | Command-line tool for terminal log capture |
| SRS | Software requirements specification (this document’s style) |
| SSE | Server-Sent Events |

---

## 3. Actors

### 3.1 Project Manager

**Goals:** Plan work, ensure delivery, reduce surprise failures.

**Responsibilities:**

- Create and configure projects
- Add team members and assign roles (within product rules)
- Create tasks: description, assignee, priority, deadline, expected progress
- Connect **GitHub repository** to the project
- Monitor dashboard: health, risk breakdown, trends
- Act on **email alerts** and in-app alert history
- Apply corrective actions (reassign, extend deadline, escalate)

### 3.2 Developer

**Goals:** Complete assigned work; surface blockers without manual reporting overhead.

**Responsibilities:**

- Work on assigned tasks
- Use GitHub (commits, PRs, issues, comments)
- Run **terminal monitoring CLI** during local development (authenticated, project/task context)
- Optionally update task status/progress in the app
- View alerts relevant to their work (optional product decision)

### 3.3 Administrator

**Goals:** Govern users, access, and system policy.

**Responsibilities:**

- User lifecycle and role assignment
- Organization/project access policy
- System settings: alert policies, retention, integration health
- Audit support: notification delivery, sensitive-data handling review

### 3.4 External Systems

| System | Role |
|--------|------|
| **GitHub** | Source of collaboration events via webhooks (and API fallback) |
| **Email provider** | Transactional delivery of alerts (e.g. Resend, SendGrid, Postmark, SES) |

### 3.5 Internal Logical Services

| Service | Responsibility |
|---------|----------------|
| Auth & RBAC | Sessions, roles, permissions |
| Project & Task | CRUD, assignments, deadlines, progress |
| GitHub Ingestion | Webhook receiver, normalization, deduplication |
| Terminal Ingestion | Authenticated ingest API + redaction + incident materialization (**v1:** synchronous; **later:** optional queue if volume requires) |
| Feature Aggregation | Roll windows (e.g. 24h / 7d), per entity metrics |
| Risk Engine | Fusion scoring, reasons, recommendations |
| Alerts & Notifications | Thresholds, dedupe/cooldown, email jobs |
| Dashboard & Reporting | Aggregates, timelines, drill-down |

---

## 4. End-to-End Workflow

### 4.1 High-Level Lifecycle

1. **Onboarding:** Admin/PM establishes org, users, project, tasks, GitHub link, CLI tokens.
2. **Continuous collection:** Task updates, GitHub webhooks, terminal batches.
3. **Feature computation:** Scheduled and event-driven aggregation.
4. **Risk evaluation:** Rule-based core (optional ML + optional LLM briefing).
5. **Alerting:** Persist alerts; email PM (and optionally dev); dedupe/cooldown.
6. **Decision loop:** PM acts; system re-evaluates; trends update.

### 4.2 Closed Loop (Detect → Explain → Notify → Act → Re-evaluate)

```text
Signals → Features → RiskEvaluation(reasons[]) → Alert? → Email + In-app record
                                                      ↓
                                              PM action → updated tasks/context
                                                      ↓
                                              next evaluation cycle
```

### 4.3 Phase A — Setup

1. Users exist with roles (PM, Developer, Administrator).
2. PM creates **Project** and **Tasks** (deadline, priority, assignee).
3. PM connects **GitHub repository** (OAuth / GitHub App / webhook configuration).
4. Developers obtain **CLI credentials** (project-scoped token) and bind **active task** context for uploads.

### 4.4 Phase B — Data Collection (Always On)

| Channel | Examples |
|---------|----------|
| Application | Task status, progress %, reassignment, overdue flags |
| GitHub | Commits, PR opened/updated/merged, issue open/close, comments |
| Terminal CLI | Build errors, test failures, runtime exceptions, dependency/db/API/Docker noise, repeated failures |

### 4.5 Phase C — Feature Engineering

Compute normalized metrics per **task**, **developer**, and **project**, for example:

- `days_to_deadline`
- `progress_vs_expected` (rule-based expectation model)
- `hours_since_last_commit` (mapped user/repo)
- `max_open_pr_age`, `stale_pr_count`
- `unresolved_issue_count`, `blocker_keyword_hits` (structured, not prose-only)
- `terminal_error_burst_24h`, `distinct_error_fingerprints_7d`
- `developer_inactivity_flag`

**Implementation note:** Features are **derived data**—recomputable and versionable (important for thesis and debugging).

### 4.6 Phase D — Risk Evaluation

**Inputs:** Latest features + task/GitHub/terminal incidents.  
**Outputs (persisted):**

- `risk_level`: Low | Medium | High | Critical
- `risk_score`: numeric (for ordering and charts)
- `reasons[]`: structured evidence objects (not only free text)
- `recommendations[]`: from a **closed set** (e.g. review PR, extend deadline, reassign, pair, prioritize fix)
- `evaluated_at`

**Approach (recommended):**

1. **Mandatory v1:** Deterministic **rule + weighted fusion** engine with **explainability**.
2. **Optional portfolio/thesis enhancement:** Small **tabular ML** model (delay probability) with feature importance / SHAP-lite; **rules clamp** extremes.
3. **Optional narrative layer:** **LLM** generates PM-facing summary **only** from **verified JSON facts**; never sole authority for severity.

### 4.7 Phase E — Alerts & Email Notifications

**Triggers:** Risk crosses threshold, or **material worsening** (configurable), or critical incident patterns.

**Policies:**

- **Email** is the **primary** channel for PMs for High/Critical (web app is not always open).
- **In-app** alert records provide permanent audit trail and deep links.
- **Dedupe and cooldown** to prevent alert fatigue (e.g. same task: at most one email per window unless escalation to Critical).

**Email content (minimum):**

- Entity: project / task / developer
- Severity and short title
- Bulleted **reasons** (from structured evidence)
- **Recommended actions**
- Link to dashboard detail view

### 4.8 Phase F — PM Decision Loop

PM opens alert → reviews evidence timeline → takes action → subsequent evaluations show **trend** (risk decay or persistence).

---

## 5. Use Cases (Summary)

| ID | Name | Primary actor |
|----|------|----------------|
| UC-01 | Create project and task plan | PM |
| UC-02 | Invite members / assign roles | PM / Admin |
| UC-03 | Connect GitHub repository | PM |
| UC-04 | Receive and process GitHub webhooks | System |
| UC-05 | Install and run terminal monitoring CLI | Developer |
| UC-06 | Ingest terminal log batches | System |
| UC-07 | Compute features and evaluate risk | System |
| UC-08 | Create alert and send email | System |
| UC-09 | View dashboard and drill-down | PM |
| UC-10 | Manage users and policies | Admin |

---

## 6. Functional Requirements

### 6.1 Project and Task Management

- **FR-PM-01:** PM can create, read, update, archive projects.
- **FR-PM-02:** PM can create tasks with title, description, assignee, priority, deadline, status, progress.
- **FR-PM-03:** System computes overdue state from deadlines and status.
- **FR-PM-04:** Task assignment changes are auditable (who/when).

### 6.2 GitHub Integration

- **FR-GH-01:** PM can connect a repository to a project (secure credential flow).
- **FR-GH-02:** System exposes a webhook endpoint that accepts signed/verified payloads.
- **FR-GH-03:** Processing is **idempotent** (GitHub delivery IDs or event dedupe).
- **FR-GH-04:** System stores normalized events and derived aggregates (e.g. last activity, PR ages).
- **FR-GH-05:** GitHub user identity can be linked to application user (manual or OAuth-assisted).

### 6.3 Terminal Log Monitoring

- **FR-TL-01:** Developer can authenticate CLI (project-scoped token).
- **FR-TL-02:** CLI sends **batched** uploads with explicit **project** and **task** context (v1: explicit binding; no mandatory inference).
- **FR-TL-03:** Server applies size limits, rate limits, and **redaction** of common secret patterns.
- **FR-TL-04:** System classifies incidents (e.g. build, test, runtime, dependency, db, api, docker) with coarse fingerprinting for repetition detection.
- **FR-TL-05:** Retention policy is configurable (Admin) with documented defaults.

### 6.4 Risk Engine

- **FR-RISK-01:** System evaluates risk for task, developer, and project scopes.
- **FR-RISK-02:** Output includes level, score, structured reasons, recommendations.
- **FR-RISK-03:** Evaluations are **append-only history** for trend visualization.
- **FR-RISK-04:** Rule engine version / config identifier stored with evaluation (reproducibility).

### 6.5 Notifications

- **FR-NOTIF-01:** On qualifying risk events, system creates **Alert** records.
- **FR-NOTIF-02:** System enqueues **email** jobs with retry and failure logging.
- **FR-NOTIF-03:** Users can configure minimum severity / mute project (scope as implementation allows).
- **FR-NOTIF-04:** Dedupe/cooldown rules are central and testable.

### 6.6 Dashboard and Reporting

- **FR-DASH-01:** PM sees project list with health summary.
- **FR-DASH-02:** PM sees counts: total tasks, completed, overdue, high/critical risk tasks, inactive developers (per defined rules).
- **FR-DASH-03:** PM sees recent GitHub activity summary and recent terminal incidents.
- **FR-DASH-04:** Task detail shows **why** risk is elevated with a **timeline** of correlated signals.

### 6.7 Security and Administration

- **FR-ADM-01:** RBAC enforces PM vs Developer vs Admin capabilities.
- **FR-ADM-02:** Admin can manage retention and integration settings.
- **FR-ADM-03:** Secrets must not be stored in plaintext in terminal payloads; transport over TLS.

---

## 7. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|--------------|
| NFR-01 | Security | TLS in transit; strong password hashing; httpOnly sessions |
| NFR-02 | Privacy | Redaction + documented data retention; opt-in framing for CLI |
| NFR-03 | Reliability | Idempotent webhooks; queued processing; retries for email |
| NFR-04 | Performance | Async ingestion; aggregate materialization for dashboard |
| NFR-05 | Maintainability | Shared API contracts (e.g. Zod); modular services |
| NFR-06 | Explainability | Every elevated risk has machine-readable reasons |
| NFR-07 | Observability | Structured logs for ingestion, risk runs, notification failures |

---

## 8. Recommended Technology Stack

| Layer | Choice |
|--------|--------|
| Frontend | React + TypeScript + Vite |
| UI | MUI **or** Radix UI + Tailwind |
| Data / forms | TanStack Query; React Hook Form + Zod |
| Charts | Recharts **or** Tremor |
| Backend | NestJS + TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Queue / cache | Redis + BullMQ |
| GitHub | Webhooks + REST fallback |
| CLI | Node + TypeScript (npm / `npx`) |
| Email | Resend / SendGrid / Postmark / AWS SES |
| Hosting | Static frontend + API/DB/Redis on managed platform or VPS |

**Monorepo (recommended):** Turborepo or Nx — `apps/web`, `apps/api`, `packages/cli`, `packages/shared`.

---

## 9. UI Source Strategy

The product UI is **custom-built in React**. Reuse **design systems and chart libraries** (MUI, Tremor, etc.); optionally reference **dashboard templates** for layout ideas. The value is in **workflows and risk explainability**, not in an off-the-shelf “monitoring product” skin.

---

## 10. Information Model (Conceptual)

**Core entities (illustrative):**

- `Organization`, `User`, `Membership`, `Role`
- `Project`, `ProjectMember`, `Task`
- `GitHubConnection`, `GitHubEvent`, `GitHubAggregate` (or materialized fields)
- `TerminalIncident`, `TerminalUpload` (optional raw reference)
- `FeatureSnapshot` (optional) or computed-on-read with cache
- `RiskEvaluation`, `Alert`, `NotificationDelivery`

**Relationships:** Tasks belong to Projects; incidents and GitHub events link to Project and optionally Task/Developer; RiskEvaluation references scope (task/dev/project).

---

## 11. Event-Driven Processing (Logical)

| Event | Typical reaction |
|-------|------------------|
| `TaskUpdated` | Recompute relevant features / risk |
| `GitHubWebhookReceived` | Normalize → store → aggregate → risk |
| `TerminalBatchIngested` | Aggregate incidents → risk |
| `RiskEvaluated` | Maybe `AlertCreated` |
| `AlertCreated` | Enqueue email; persist delivery status |

---

## 12. Risk Engine — Rule Fusion (Example Signal Families)

**Schedule / progress**

- Deadline proximity vs progress gap

**GitHub / collaboration**

- Commit recency; PR age; unresolved issues; review stall signals (as available)

**Terminal / technical friction**

- Error bursts; repeated fingerprints; category-specific escalations

**Human / activity**

- Developer inactivity vs assigned active work (careful calibration to reduce false positives)

**Output discipline**

- Reasons must map to **observable metrics** or **stored incidents**, not vague prose.

---

## 13. Implementation Roadmap (Recommended Order)

1. Monorepo, linting, shared types, environment configuration  
2. PostgreSQL + Prisma schema; migrations  
3. Auth + RBAC + baseline web layout  
4. Project/task CRUD (PM core)  
5. GitHub webhook ingestion + aggregates + user mapping  
6. CLI + ingest API + redaction + incidents — **v1 shipped:** `@foretrace/cli` + `POST …/terminal/batches` (Bearer project token), redaction + incident upserts; web **CLI ingest tokens** panel on project (mint/list/revoke); **`GET …/terminal/incidents`** + web **Terminal incidents** table on project. **Not yet:** async queue, richer incident drill-down (task timeline).  
7. Feature aggregation jobs — **v1 slice shipped:** persisted **`ProjectSignalSnapshot`** per project (24h rollup: GitHub webhook counts, terminal incidents/batches, task tallies, open PR/issue counts); **GET/POST** project signals API; web **Project signals** panel with manual refresh (**PM**/**ADMIN**); automatic refresh after webhook + terminal ingest (per-project cooldown). **Not yet:** background job scheduler.  
8. Risk engine + evaluation history — **v0 slice shipped:** **`ProjectRiskEvaluation`** per project (rule fusion on latest signal snapshot: **LOW**/**MEDIUM**/**HIGH**/**CRITICAL**, numeric score, machine-readable **reasons** array); **GET** + **POST …/risk/evaluate** (**PM**/**ADMIN**); web **Delivery risk** panel. **Not yet:** task/developer scoped evaluations, append-only history, threshold **Alert** records, email.  
9. Alerts + email queue + in-app alert center — **v0 slice shipped:** **`Alert`** rows from risk evaluate (Medium+ and worsening / first Medium+); **`GET`** org alerts + **`POST …/alerts/:id/read`**; web **`/alerts`** inbox. **Not yet:** email queue, alert digests, non-risk alert kinds.  
10. Dashboard + task/project drill-down + trends  
11. Hardening, evaluation scenarios, thesis evaluation chapter  

**Principle:** **Auth → tasks → GitHub → terminal → risk → email → dashboard polish.**

---

## 14. Thesis / Evaluation Hooks

- **Scenario replay:** Script known patterns; assert risk level and reasons.  
- **Alert quality:** Measure false positive rate / lead time to deadline slip in simulated data.  
- **Ablation:** Show value of **fusing** signals vs any single signal.  
- **Optional ML:** Report calibration / precision-recall on delay prediction if included.

---

## 15. Assumptions and Constraints

- v1 uses **explicit** task binding for terminal uploads.  
- GitHub API permissions depend on org policies; document limitations.  
- Email deliverability depends on provider configuration (SPF/DKIM as required).  
- LLM use is optional and must respect institutional data policies.

---

## 16. Future Work

- Richer GitHub signals (reviews, checks, CI conclusions) with permission scope  
- Smarter task–activity inference (with safeguards)  
- ML models trained on historically labeled delays  
- Deeper personalization of alert policies and escalation chains  
- Mobile-friendly alert views  

---

## 17. One-Line Summary (CV / Interview)

**Full-stack TypeScript platform fusing tasks, GitHub webhooks, and local terminal diagnostics into an explainable, email-alerted delivery-risk supervisor for software projects.**

---

## Document Maintenance

Update this file when:

- Scope or actors change  
- Risk or notification policies change materially  
- Stack choices are finalized or migrated  
- New integrations are added  

**Path:** `docs/PROJECT_SRS.md`
