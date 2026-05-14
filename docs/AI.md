# Foretrace AI / narratives (risk and beyond)

## Current behavior

- Each risk evaluation can store an **`aiSummary`** (plain text) on the latest row and on each **history run**.
- **`RiskInsightService`** builds that text in this order:
  1. If **`OPENAI_API_KEY`** is set, call OpenAI Chat Completions (`OPENAI_RISK_MODEL`, default `gpt-4o-mini`) with structured context (project name, level, score, reason rows).
  2. Otherwise (or if the API fails), use a **deterministic heuristic** from the same reason rows so PMs always see something readable.

- **`POST …/projects/:projectId/insights/analyze`** (Delivery risk panel → **Impact analysis**) calls **`ProjectImpactAnalyzerService`**: it refreshes the signal snapshot, attaches recent tasks and redacted terminal incident excerpts plus `scheduleSummary`, then either calls OpenAI (same `OPENAI_API_KEY`; model from `OPENAI_IMPACT_MODEL` or `OPENAI_RISK_MODEL`) or returns a **longer heuristic** text. The result is **not persisted** (on-demand inference only).

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

See also [`.env.example`](../.env.example) for mail and app secrets.
