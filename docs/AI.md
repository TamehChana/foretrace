# Foretrace AI / narratives (risk and beyond)

## Current behavior

**Trace Analyst** is the product name for Foretrace's on-demand narratives: delivery-risk summaries and the wider project read from the analyze endpoint.

- Each risk evaluation can store an **`aiSummary`** (plain text) on the latest row and on each **history run**.
- **`RiskInsightService`** builds that text in this order:
  1. If **`OPENAI_API_KEY`** is set, call OpenAI Chat Completions (`OPENAI_RISK_MODEL`, default `gpt-4o-mini`) with structured context (project name, level, score, reason rows, **`signalEvidence`** from the same snapshot used for scoring).
  2. Otherwise (or if the API fails), use a **deterministic heuristic** from the same inputs so PMs always see something readable.
- Trace Analyst outputs use **fixed section headings** (e.g. VERDICT, EXECUTIVE READ, EVIDENCE, SCHEDULE, NEXT ACTIONS, CONFIDENCE on risk; parallel sections on the on-demand read) so the UI stays scannable.

- **Risk ML (v1):** optional **multinomial + binary logistic** heads over normalized snapshot features; see [`docs/ML-RISK.md`](./ML-RISK.md).
- **`POST …/projects/:projectId/insights/analyze`** (Delivery risk panel → **Trace Analyst** button) calls **`ProjectImpactAnalyzerService`**: it refreshes the signal snapshot, attaches recent tasks, task-linked GitHub activity, redacted terminal incidents, PM `promptFeedbackHints`, and `scheduleSummary`, then either calls OpenAI or returns a **longer heuristic** text. Results are **persisted** in `ProjectImpactAnalysisRun` (see `GET …/insights/history`).
- **`GET …/projects/:projectId/insights/readiness`** returns Trace Analyst readiness (OpenAI on/off, snapshot age, overdue counts, hints). Shown in the Delivery risk panel.

- **`POST …/projects/:projectId/insight-feedback`** stores **thumbs** (`RISK_SUMMARY` vs `PROJECT_IMPACT_ANALYSIS`, optional `comment`, `helpful` boolean) for future evaluation of narratives — not used for live scoring yet.

- **`GET …/organizations/:organizationId/insight-feedback?limit=`** (PM or **ADMIN** only) returns recent feedback rows with project name and submitter — for internal QA and tuning dashboards (Settings in the web app).

- **`POST /internal/cron/refresh-project-snapshots`** (header **`X-Foretrace-Cron-Secret`** = env **`FORETRACE_CRON_SECRET`**) recomputes **persisted signal snapshots** for up to `?limit=` non-archived projects. See `.github/workflows/foretrace-snapshots-cron.example.yml`.

This is intentionally small and synchronous so “Evaluate” stays predictable; heavy pipelines belong in a worker later.

## Where to train or extend

1. **Swap the provider**  
   Add a new class (e.g. `VertexRiskNarrator`, `AzureOpenAiRiskNarrator`) and branch on env in `RiskInsightService`, or inject a `RiskNarrator` interface with multiple implementations.

2. **Fine-tuning**  
   Export historical `(reasons[], level, score) → approved_summary` pairs from your DB (with PII scrubbed), fine-tune a small chat model, then point `OPENAI_RISK_MODEL` at that model id.

3. **RAG**  
   Retrieve top terminal incidents / task titles for the project, append to the prompt as extra JSON, and keep token limits tight.

4. **Async + caching**  
   Move LLM calls to a queue, store `aiSummary` when done, and show “Generating…” in the UI first — better for large orgs.

5. **Safety**  
   Keep org/project boundaries in the app layer; never pass raw secrets or PATs into the model. Log only request ids, not prompts, in production if policy requires.

## Environment

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Optional; enables LLM narrative path. |
| `OPENAI_RISK_MODEL` | Optional; defaults to `gpt-4o-mini`. |
| `OPENAI_IMPACT_MODEL` | Optional; model for impact analysis; defaults to `OPENAI_RISK_MODEL` then `gpt-4o-mini`. |
| `FORETRACE_CRON_SECRET` | Optional; enables `POST /internal/cron/refresh-project-snapshots` when sent as `X-Foretrace-Cron-Secret`. |
| `FORETRACE_AI_USE_FEEDBACK_HINTS` | Optional; when not `0`/`false`, recent PM insight feedback is included in OpenAI prompts. |

See also [`.env.example`](../.env.example) for mail and app secrets.
