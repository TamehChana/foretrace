#!/usr/bin/env python3
"""
Experiment 1 — primary Foretrace delay model (offline).

Binary classification: y = 1 if delaydays > 0 else 0
Models: Logistic Regression, Random Forest, XGBoost
Splits: leave-one-project-out (LOPO) + chronological within-project holdout

Does not modify production Foretrace risk weights.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    HistGradientBoostingClassifier,
    RandomForestClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

try:
    from xgboost import XGBClassifier

    HAS_XGBOOST = True
except Exception as exc:  # noqa: BLE001 — optional native dep (libomp on macOS)
    XGBClassifier = None  # type: ignore[misc, assignment]
    HAS_XGBOOST = False
    _XGBOOST_IMPORT_ERROR = exc
else:
    _XGBOOST_IMPORT_ERROR = None

LABEL_COL = "delaydays"
ID_COL = "issuekey"
TIME_COL = "openeddate"
PROJECT_COL = "project"

# Not used as model inputs (identifiers / leaky outcome)
EXCLUDE_COLS = {LABEL_COL, ID_COL, TIME_COL, PROJECT_COL}

CATEGORICAL = ("type", "priority")


@dataclass
class Metrics:
    model: str
    split: str
    n_train: int
    n_test: int
    pos_test: int
    precision: float
    recall: float
    f1: float
    roc_auc: float
    pr_auc: float
    tn: int
    fp: int
    fn: int
    tp: int


def load_emse(data_dir: Path, prediction_time: str) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for path in sorted(data_dir.glob(f"*_{prediction_time}.csv")):
        project = path.name[: -len(f"_{prediction_time}.csv")]
        df = pd.read_csv(path)
        df[PROJECT_COL] = project
        frames.append(df)
    if not frames:
        raise SystemExit(
            f"No *_{prediction_time}.csv under {data_dir}. Run download_emse.py first."
        )
    out = pd.concat(frames, ignore_index=True)
    out[TIME_COL] = pd.to_datetime(out[TIME_COL], errors="coerce")
    out["y"] = (out[LABEL_COL].astype(float) > 0).astype(int)
    # Harden numerics for linear models (topic / count features can contain non-finite values).
    num_cols = out.select_dtypes(include=["number"]).columns
    out[num_cols] = out[num_cols].replace([np.inf, -np.inf], np.nan).fillna(0)
    return out


def feature_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in EXCLUDE_COLS and c != "y"]


def make_preprocessor(feature_cols: list[str]) -> ColumnTransformer:
    cat = [c for c in CATEGORICAL if c in feature_cols]
    num = [c for c in feature_cols if c not in cat]
    return ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat),
            ("num", StandardScaler(), num),
        ]
    )


def build_models(seed: int) -> dict[str, Any]:
    models: dict[str, Any] = {
        "logistic_regression": Pipeline(
            steps=[
                ("pre", None),  # filled per fold
                (
                    "clf",
                    LogisticRegression(
                        max_iter=2000,
                        class_weight="balanced",
                        random_state=seed,
                    ),
                ),
            ]
        ),
        "random_forest": Pipeline(
            steps=[
                ("pre", None),
                (
                    "clf",
                    RandomForestClassifier(
                        n_estimators=200,
                        max_depth=12,
                        min_samples_leaf=5,
                        class_weight="balanced_subsample",
                        n_jobs=-1,
                        random_state=seed,
                    ),
                ),
            ]
        ),
    }
    if HAS_XGBOOST:
        models["xgboost"] = Pipeline(
            steps=[
                ("pre", None),
                (
                    "clf",
                    XGBClassifier(
                        n_estimators=300,
                        max_depth=6,
                        learning_rate=0.08,
                        subsample=0.9,
                        colsample_bytree=0.9,
                        objective="binary:logistic",
                        eval_metric="logloss",
                        n_jobs=-1,
                        random_state=seed,
                    ),
                ),
            ]
        )
    else:
        # Strong tree booster when native XGBoost/OpenMP is unavailable.
        models["hist_gradient_boosting"] = Pipeline(
            steps=[
                ("pre", None),
                (
                    "clf",
                    HistGradientBoostingClassifier(
                        max_depth=6,
                        learning_rate=0.08,
                        max_iter=300,
                        class_weight="balanced",
                        random_state=seed,
                    ),
                ),
            ]
        )
    return models


def evaluate(y_true: np.ndarray, y_prob: np.ndarray, threshold: float = 0.5) -> dict[str, Any]:
    y_pred = (y_prob >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    # Guard degenerate AUC cases
    if len(np.unique(y_true)) < 2:
        roc = float("nan")
        pr = float("nan")
    else:
        roc = float(roc_auc_score(y_true, y_prob))
        pr = float(average_precision_score(y_true, y_prob))
    return {
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc": roc,
        "pr_auc": pr,
        "tn": int(tn),
        "fp": int(fp),
        "fn": int(fn),
        "tp": int(tp),
    }


def fit_predict(
    model_name: str,
    feature_cols: list[str],
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_test: pd.DataFrame,
    seed: int,
) -> np.ndarray:
    pre = make_preprocessor(feature_cols)
    models = build_models(seed)
    pipe: Pipeline = models[model_name]
    pipe.steps[0] = ("pre", pre)

    if model_name == "xgboost":
        pos = max(int(y_train.sum()), 1)
        neg = max(int(len(y_train) - y_train.sum()), 1)
        pipe.named_steps["clf"].set_params(scale_pos_weight=neg / pos)

    pipe.fit(x_train[feature_cols], y_train)
    return pipe.predict_proba(x_test[feature_cols])[:, 1]


def lopo_splits(df: pd.DataFrame) -> list[tuple[str, pd.DataFrame, pd.DataFrame]]:
    out: list[tuple[str, pd.DataFrame, pd.DataFrame]] = []
    for project in sorted(df[PROJECT_COL].unique()):
        test = df[df[PROJECT_COL] == project]
        train = df[df[PROJECT_COL] != project]
        if len(test) == 0 or len(train) == 0:
            continue
        out.append((f"lopo:{project}", train, test))
    return out


def chrono_splits(
    df: pd.DataFrame, test_frac: float = 0.2
) -> list[tuple[str, pd.DataFrame, pd.DataFrame]]:
    """Within each project: earliest (1-test_frac) train, latest test_frac test; concat."""
    train_parts: list[pd.DataFrame] = []
    test_parts: list[pd.DataFrame] = []
    for project, g in df.groupby(PROJECT_COL):
        g = g.sort_values(TIME_COL)
        n = len(g)
        if n < 20:
            continue
        cut = int(n * (1.0 - test_frac))
        train_parts.append(g.iloc[:cut])
        test_parts.append(g.iloc[cut:])
    if not train_parts:
        return []
    train = pd.concat(train_parts, ignore_index=True)
    test = pd.concat(test_parts, ignore_index=True)
    return [("chrono:within_project_20pct", train, test)]


def run_suite(
    df: pd.DataFrame,
    feature_cols: list[str],
    model_names: list[str],
    seed: int,
) -> list[Metrics]:
    results: list[Metrics] = []
    splits = lopo_splits(df) + chrono_splits(df)
    for split_name, train, test in splits:
        y_train = train["y"].to_numpy()
        y_test = test["y"].to_numpy()
        for model_name in model_names:
            print(f"  {model_name} @ {split_name} (train={len(train)} test={len(test)})")
            y_prob = fit_predict(
                model_name, feature_cols, train, y_train, test, seed
            )
            m = evaluate(y_test, y_prob)
            results.append(
                Metrics(
                    model=model_name,
                    split=split_name,
                    n_train=len(train),
                    n_test=len(test),
                    pos_test=int(y_test.sum()),
                    **m,
                )
            )
    return results


def summarize_lopo(results: list[Metrics]) -> dict[str, Any]:
    """Mean metrics across leave-one-project-out folds per model."""
    summary: dict[str, Any] = {}
    by_model: dict[str, list[Metrics]] = {}
    for r in results:
        if not r.split.startswith("lopo:"):
            continue
        by_model.setdefault(r.model, []).append(r)
    for model, rows in by_model.items():
        def avg(key: str) -> float:
            vals = [getattr(r, key) for r in rows if np.isfinite(getattr(r, key))]
            return float(np.mean(vals)) if vals else float("nan")

        summary[model] = {
            "folds": len(rows),
            "mean_precision": avg("precision"),
            "mean_recall": avg("recall"),
            "mean_f1": avg("f1"),
            "mean_roc_auc": avg("roc_auc"),
            "mean_pr_auc": avg("pr_auc"),
        }
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).resolve().parent / "data" / "emse2017",
    )
    parser.add_argument(
        "--time",
        choices=("due", "creation", "discussion"),
        default="due",
        help="Which EMSE prediction-time matrix to use",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent / "artifacts",
    )
    args = parser.parse_args()

    df = load_emse(args.data, args.time)
    feature_cols = feature_columns(df)
    print(
        f"loaded {len(df)} rows, {df[PROJECT_COL].nunique()} projects, "
        f"pos_rate={df['y'].mean():.3f}, features={len(feature_cols)}"
    )
    print("features:", ", ".join(feature_cols))

    model_names = list(build_models(args.seed).keys())
    if not HAS_XGBOOST:
        print(
            "NOTE: xgboost unavailable "
            f"({_XGBOOST_IMPORT_ERROR}); using hist_gradient_boosting instead. "
            "On macOS: brew install libomp && reinstall xgboost."
        )
    results = run_suite(df, feature_cols, model_names, args.seed)
    lopo_summary = summarize_lopo(results)

    args.out.mkdir(parents=True, exist_ok=True)
    report = {
        "dataset": "EMSE2017 delayed-issues (Choetkiertikul et al.)",
        "prediction_time": args.time,
        "label": "y = 1 if delaydays > 0 else 0",
        "n_rows": int(len(df)),
        "projects": sorted(df[PROJECT_COL].unique().tolist()),
        "class_balance": {
            "delayed": int(df["y"].sum()),
            "on_time": int((df["y"] == 0).sum()),
            "delayed_rate": float(df["y"].mean()),
        },
        "features": feature_cols,
        "excluded_from_X": sorted(EXCLUDE_COLS),
        "lopo_mean_metrics": lopo_summary,
        "runs": [asdict(r) for r in results],
        "citation": (
            "Choetkiertikul et al., EMSE 2017, "
            "Predicting the delay of issues with due dates in software projects"
        ),
        "integration_note": (
            "Offline Experiment 1 only. Production Foretrace still uses rule risk "
            "+ optional logistic risk-ml-v1 until this model is wired as issue "
            "delayProbability."
        ),
    }
    out_json = args.out / f"emse_{args.time}_compare.json"
    out_json.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nWrote {out_json}")
    print("\n=== Leave-one-project-out mean metrics ===")
    for model, m in lopo_summary.items():
        print(
            f"{model:22s}  F1={m['mean_f1']:.3f}  "
            f"ROC-AUC={m['mean_roc_auc']:.3f}  PR-AUC={m['mean_pr_auc']:.3f}  "
            f"P={m['mean_precision']:.3f}  R={m['mean_recall']:.3f}"
        )


if __name__ == "__main__":
    main()
