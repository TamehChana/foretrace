# Foretrace ML — risk level & deadline pressure (v1)

This document describes the **first shipped machine-learning slice**: a **multinomial logistic regression** head over normalized signal features (risk **level**), plus a **binary logistic** head for a **deadline pressure index** (0–1). The **rule engine** in `risk-score.engine.ts` remains the **source of truth** for persisted `level` / `score`; ML is an **additional signal** stored in `mlPrediction` on each evaluation.

## What is trained?

- **Labels (synthetic, offline):**  
  - **Level:** `computeRiskFromPayload` (same rules as production `ProjectRiskService`).  
  - **Deadline pressure (binary):** heuristic oracle — positive if `overdueCount > 0` OR `dueSoonLowProgressCount > 0` OR `dueWithin3DaysCount ≥ 3`.

- **Features:** bounded numeric vector from `extractRiskMlFeatures` (16 dimensions, no PII). See `apps/api/src/ml/risk-feature-vector.ts`.

## Weights file

- Default path: `apps/api/src/ml/risk-ml-v1.weights.json` (copied to `dist/ml/` on `nest build` via `nest-cli.json` assets).
- Regenerate after changing the rule engine or feature schema:

```bash
npm run ml:train -w @foretrace/api
```

After you have run **Evaluate** on real projects (stores `signalPayload` on history rows):

```bash
npm run ml:train:history -w @foretrace/api
```

## Runtime

- Set **`FORETRACE_ML_RISK_ENABLED=1`** (or `true` / `yes`) on the API to attach `mlPrediction` when a project is evaluated.
- Optional: **`FORETRACE_ML_RISK_WEIGHTS_PATH`** — absolute or relative path to a custom weights JSON.

## `mlPrediction` JSON shape

```json
{
  "modelVersion": "risk-ml-v1",
  "predictedLevel": "HIGH",
  "classProbabilities": { "LOW": 0.02, "MEDIUM": 0.21, "HIGH": 0.65, "CRITICAL": 0.12 },
  "deadlinePressureIndex": 0.73
}
```

`deadlinePressureIndex` is **not** a calendar ETA; it is a calibrated index from the binary head for thesis-friendly “deadline risk” language alongside the rule-based score.

## Future work

- Replace synthetic labels with **historical runs + snapshot features** stored at evaluation time.
- Calibration (Platt / isotonic) on held-out org data.
- Separate models per industry or team size.
