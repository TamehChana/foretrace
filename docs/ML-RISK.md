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

### Experiment 1 (primary — real delay labels)

- **Data:** EMSE2017 delayed-issues CSVs (Choetkiertikul et al.)
- **Label:** objective delay (`delaydays > 0`), not LOW–CRITICAL bands
- **Code:** `apps/api/ml-experiments/issue-delay/`

### Bootstrap logistic (`risk-ml-v1`, current runtime second opinion)

- **Examples:** synthetic Foretrace-shaped signal snapshots (`randomRiskMlPayload`), optionally mixed with real `RiskEvaluationRun.signalPayload` rows.
- **Labels:** largely rule-engine mirrors for bootstrap only — **not** the thesis claim for delay prediction.
- **Features:** 16 bounded numerics from `extractRiskMlFeatures` (no PII). See `apps/api/src/ml/risk-feature-vector.ts`.

## Experiment 1 — Issue delay classification (real labels)

**Do not treat the synthetic `risk-ml-v1` bootstrap as the thesis training story.**
The primary academic model is delayed-issue classification on the public
Choetkiertikul EMSE 2017 matrices:

| Item | Value |
|------|--------|
| Path | `apps/api/ml-experiments/issue-delay/` |
| Data | EMSE2017 `*_due.csv` (~62k issues, 8 projects) |
| Label | `delaydays > 0` → delayed |
| Models | Logistic Regression, Random Forest, XGBoost |
| Run | `npm run ml:delay:emse -w @foretrace/api` |
| Portable runtime weights | `src/ml/delay-ml-v1.weights.json` (logistic on portable features) |
| Export | `python export_portable_delay_model.py` in the experiment folder |

**Runtime:** Evaluate prefers `IssueDelayMlService` (`issue-delay-v1`): scores open tasks with deadlines → mean `delayProbability` → stored in `mlPrediction`. Falls back to legacy `risk-ml-v1` only if no dated open tasks / weights missing.

See that folder’s `README.md` / `RESULTS.md`. TAWOS is **secondary** (resolution-time / feature engineering only; no `Due_Date` on `Issue`).

Rule engine remains the official project `level` / `score`.

---

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
