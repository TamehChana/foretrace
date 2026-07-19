#!/usr/bin/env python3
"""Download Choetkiertikul EMSE2017 delayed-issues CSVs (feature matrices)."""

from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path

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
PREDICTION_TIMES = ("due", "creation", "discussion")
BASE_URL = (
    "https://raw.githubusercontent.com/jai2shukla/JIRA-Estimation-Prediction/"
    "master/delayed%20issues/EMSE2017/datasets"
)

CITATION = """
Cite when using this data:

Choetkiertikul, M., Dam, H. K., Tran, T., & Ghose, A. (2017).
Predicting the delay of issues with due dates in software projects.
Empirical Software Engineering, 22(3), 1223–1263.
https://doi.org/10.1007/s10664-016-9496-7

Source mirror: https://github.com/jai2shukla/JIRA-Estimation-Prediction
(delayed issues/EMSE2017)
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent / "data" / "emse2017",
        help="Directory to store CSVs",
    )
    parser.add_argument(
        "--times",
        nargs="+",
        choices=PREDICTION_TIMES,
        default=["due"],
        help="Which prediction-time matrices to download (default: due)",
    )
    args = parser.parse_args()
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    (out / "CITATION.txt").write_text(CITATION.strip() + "\n", encoding="utf-8")

    for project in PROJECTS:
        for t in args.times:
            name = f"{project}_{t}.csv"
            dest = out / name
            if dest.exists() and dest.stat().st_size > 0:
                print(f"skip (exists) {dest.name}")
                continue
            url = f"{BASE_URL}/{name}"
            print(f"download {name} …")
            urllib.request.urlretrieve(url, dest)
            print(f"  -> {dest} ({dest.stat().st_size} bytes)")

    print("done.")


if __name__ == "__main__":
    main()
