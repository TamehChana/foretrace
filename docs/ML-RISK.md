# Foretrace ML — risk level & deadline pressure (v1)

This document describes the **shipped machine-learning slice**: a **multinomial logistic regression** head over normalized signal features (risk **level**), plus a **binary logistic** head for a **deadline pressure index** (0–1). The **rule engine** in `risk-score.engine.ts` remains the **source of truth** for persisted `level` / `score`; ML is an **additional signal** stored in `mlPrediction` on each evaluation.

**Users never train the model.** A pretrained weights file ships with the API. Training/retraining is an admin/ops step (or future scheduled job).

## Product story

```text
Signals (tasks + GitHub + terminal)
        → Rules: official score + reasons + recommendations
        → ML: class probabilities + deadline pressure (pretrained)
        → Trace Analyst (OpenAI optional): explanation only
```

## What is trained?

- **Examples:** synthetic Foretrace-shaped signal snapshots (`randomRiskMlPayload`), optionally mixed with real `RiskEvaluationRun.signalPayload` rows.
- **Labels:**
  - **Level:** `computeRiskFromPayload` (same rules as production) for bootstrap.
  - **Deadline pressure (binary):** heuristic — positive if `overdueCount > 0` OR `dueSoonLowProgressCount > 0` OR `dueWithin3DaysCount ≥ 3`.
- **Features:** 16 bounded numerics from `extractRiskMlFeatures` (no PII). See `apps/api/src/ml/risk-feature-vector.ts`.

## Weights file

- Default path: `apps/api/src/ml/risk-ml-v1.weights.json`
- API `build` copies `src/ml/*.json` → `dist/ml/` (required on Render; plain `tsc` does not copy JSON).
- At runtime the service also searches `dist/ml` / `src/ml` fallbacks.
- Regenerate (admin):

```bash
npm run ml:train -w @foretrace/api
```

After many **Evaluate** runs (stores `signalPayload` on history):

```bash
npm run ml:train:history -w @foretrace/api
```

Holdout-style metrics print into the weights JSON (`metrics` field). For a thesis table dump:

```bash
npm run ml:metrics -w @foretrace/api
```

## Runtime

- **Default:** ML is **on** when weights load (unset `FORETRACE_ML_RISK_ENABLED`).
- **Force on:** `FORETRACE_ML_RISK_ENABLED=1`
- **Force off:** `FORETRACE_ML_RISK_ENABLED=0`
- Optional: `FORETRACE_ML_RISK_WEIGHTS_PATH` — custom weights JSON path.

Render Blueprint sets `FORETRACE_ML_RISK_ENABLED=1`. If an older service still returns `mlPrediction: null`, add that env var in the Render dashboard and redeploy.

## `mlPrediction` JSON shape

```json
{
  "modelVersion": "risk-ml-v1",
  "predictedLevel": "HIGH",
  "classProbabilities": { "LOW": 0.02, "MEDIUM": 0.21, "HIGH": 0.65, "CRITICAL": 0.12 },
  "deadlinePressureIndex": 0.73
}
```

`deadlinePressureIndex` is **not** a calendar ETA; it is an index from the binary head for “deadline risk” language alongside the rule-based score.

## Related systems (thesis positioning)

Commercial eng-intel tools (Allstacks, Jellyfish, LinearB) and academic delayed-issue predictors also use historical delivery signals. Foretrace’s thesis niche is **tasks + GitHub + terminal** fusion, **transparent rules + ML**, and a **PM closed loop** (explain → alert → re-evaluate)—not “first AI deadline tool ever.”

## Future work

- Prefer outcome labels (task/project slipped vs on_time) over rule-copied levels.
- Prefer `ml:train:history` once many real Evaluate runs exist.
- Calibration (Platt / isotonic) on held-out org data.
- Ablation tables: rules alone vs ML alone vs both.
