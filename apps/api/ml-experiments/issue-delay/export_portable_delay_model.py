#!/usr/bin/env python3
"""
Export a portable logistic-regression delay model for Foretrace Nest runtime.

Trains on EMSE2017 *_due.csv using a feature subset that Foretrace tasks can
approximate (no topic models / free-text). Offline XGBoost remains the thesis
benchmark in RESULTS.md; this export is the shippable inference artifact.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

PROJECTS = (
    "apache",
    "duraspace",
    "javanet",
    "jboss",
    "jira",
    "moodle",
    "mulesoft",
    "wso2",
)

# Numeric/process features Foretrace can approximate at prediction time.
PORTABLE_FEATURES = [
    "discussion",
    "repetition",
    "perofdelay",
    "workload",
    "no_comment",
    "no_priority_change",
    "no_fixversion",
    "no_fixversion_change",
    "no_issuelink",
    "no_blocking",
    "no_blockedby",
    "no_affectversion",
    "reporterrep",
    "no_des_change",
    "ProgressTime",
    "RemainingDay",
    "priority_ord",
]


def priority_ord(series: pd.Series) -> pd.Series:
    mapping = {
        "blocker": 5,
        "critical": 4,
        "major": 3,
        "minor": 2,
        "trivial": 1,
    }
    return series.astype(str).str.lower().map(mapping).fillna(3).astype(float)


def load_due(data_dir: Path) -> pd.DataFrame:
    frames = []
    for project in PROJECTS:
        path = data_dir / f"{project}_due.csv"
        if not path.exists():
            raise SystemExit(f"Missing {path}; run download_emse.py first")
        df = pd.read_csv(path)
        df["project"] = project
        frames.append(df)
    out = pd.concat(frames, ignore_index=True)
    out["priority_ord"] = priority_ord(out["priority"])
    out["y"] = (out["delaydays"].astype(float) > 0).astype(int)
    for col in PORTABLE_FEATURES:
        if col == "priority_ord":
            continue
        out[col] = pd.to_numeric(out[col], errors="coerce")
    out[PORTABLE_FEATURES] = (
        out[PORTABLE_FEATURES].replace([np.inf, -np.inf], np.nan).fillna(0.0)
    )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).resolve().parent / "data" / "emse2017",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[2]
        / "src"
        / "ml"
        / "delay-ml-v1.weights.json",
    )
    args = parser.parse_args()

    df = load_due(args.data)
    x = df[PORTABLE_FEATURES].to_numpy(dtype=float)
    y = df["y"].to_numpy()

    scaler = StandardScaler()
    x_scaled = scaler.fit_transform(x)
    clf = LogisticRegression(
        max_iter=2000,
        class_weight="balanced",
        random_state=42,
    )
    clf.fit(x_scaled, y)

    payload = {
        "version": "1",
        "modelKind": "issue-delay-logistic",
        "modelVersion": "issue-delay-v1",
        "source": "EMSE2017 Choetkiertikul et al. delayed-issues (*_due.csv)",
        "label": "y = 1 if delaydays > 0 else 0",
        "nTrain": int(len(df)),
        "posRate": float(y.mean()),
        "featureNames": PORTABLE_FEATURES,
        "scalerMean": scaler.mean_.tolist(),
        "scalerScale": scaler.scale_.tolist(),
        "coef": clf.coef_[0].tolist(),
        "intercept": float(clf.intercept_[0]),
        "notes": [
            "Runtime uses only features Foretrace can approximate from open tasks.",
            "Offline XGBoost on full EMSE matrices is the Experiment 1 benchmark (see RESULTS.md).",
            "Rule engine remains the official project risk score.",
        ],
        "citation": (
            "Choetkiertikul et al., EMSE 2017, Predicting the delay of issues "
            "with due dates in software projects"
        ),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.out} (n={len(df)}, pos_rate={y.mean():.3f})")


if __name__ == "__main__":
    main()
