# Experiment 1 — Issue delay classification (EMSE2017)

**Primary Foretrace ML research track** (not synthetic / not rule-copied labels).

| Item | Value |
|------|--------|
| Dataset | Choetkiertikul et al. delayed-issues, **EMSE2017** feature matrices |
| Mirror | https://github.com/jai2shukla/JIRA-Estimation-Prediction (`delayed issues/EMSE2017`) |
| Label | `y = 1` if `delaydays > 0` else `0` |
| Output | `delayProbability ∈ [0,1]` |
| Models | Logistic Regression, Random Forest, XGBoost |
| Splits | Leave-one-project-out + chronological within-project holdout |
| TAWOS | **Not** used here (secondary / resolution-time only) |

Production Foretrace **rule risk remains authoritative** until this experiment is explicitly integrated.

## Setup

```bash
cd apps/api/ml-experiments/issue-delay
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python download_emse.py --times due
python train_compare.py --time due
```

Artifacts land in `artifacts/emse_due_compare.json`.

On macOS, XGBoost needs OpenMP: `brew install libomp`. If XGBoost still fails to load, the trainer falls back to sklearn `HistGradientBoostingClassifier`.

## Citation

```
Choetkiertikul, M., Dam, H. K., Tran, T., & Ghose, A. (2017).
Predicting the delay of issues with due dates in software projects.
Empirical Software Engineering, 22(3), 1223–1263.
```

## Foretrace integration

Evaluate prefers **`issue-delay-v1`** (`delay-ml-v1.weights.json`):

```
open tasks with deadlines
  → portable EMSE-trained logistic features
  → mean delayProbability
  → mlPrediction second opinion
  → rule engine still owns official level/score
  → Trace Analyst explains
```

Export weights after training:

```bash
python export_portable_delay_model.py
```

If a project has no open dated tasks, evaluate falls back to the legacy synthetic risk-ml snapshot model.
