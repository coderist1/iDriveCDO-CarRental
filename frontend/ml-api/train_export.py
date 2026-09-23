"""Train Random Forest from RandomForest_Trained.ipynb recipe and export joblib."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CSV = Path.home() / "Downloads" / "synthetic_telemetry_data.csv"
MODEL_DIR = BASE_DIR / "models"


def train_and_export(csv_path: Path, model_dir: Path = MODEL_DIR) -> dict:
    model_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(csv_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"])

    df["failure_imminent"] = (
        (df["engine_failure_imminent"] == 1)
        | (df["brake_issue_imminent"] == 1)
        | (df["battery_issue_imminent"] == 1)
    ).astype(int)

    df = df.sort_values(["vehicle_id", "timestamp"]).reset_index(drop=True)
    df["hour"] = df["timestamp"].dt.hour
    df["day_of_week"] = df["timestamp"].dt.dayofweek

    le_brand = LabelEncoder()
    df["brand_encoded"] = le_brand.fit_transform(df["brand"])

    drop_cols = [
        "vehicle_id",
        "brand",
        "timestamp",
        "gps_latitude",
        "gps_longitude",
        "failure_date",
        "failure_type",
        "engine_failure_imminent",
        "brake_issue_imminent",
        "battery_issue_imminent",
        "failure_imminent",
    ]
    feature_cols = [c for c in df.columns if c not in drop_cols]
    X = df[feature_cols]
    y = df["failure_imminent"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    rf_model = RandomForestClassifier(
        n_estimators=300,
        max_depth=None,
        min_samples_split=2,
        min_samples_leaf=1,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    rf_model.fit(X_train, y_train)

    y_pred = rf_model.predict(X_test)
    y_proba = rf_model.predict_proba(X_test)[:, 1]
    report = classification_report(
        y_test,
        y_pred,
        target_names=["No Failure", "Failure Imminent"],
        output_dict=True,
        zero_division=0,
    )
    auc = (
        float(roc_auc_score(y_test, y_proba))
        if len(np.unique(y_test)) > 1
        else None
    )

    artifact = {
        "model": rf_model,
        "features": feature_cols,
        "target": "failure_imminent",
        "brand_classes": list(le_brand.classes_),
        "label_encoder": le_brand,
    }
    out_path = model_dir / "failure_imminent_rf.joblib"
    joblib.dump(artifact, out_path)

    summary = {
        "failure_imminent": {
            "features": feature_cols,
            "brand_classes": list(le_brand.classes_),
            "positive_cases": int(y.sum()),
            "train_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "accuracy": float(report["accuracy"]),
            "positive_precision": float(report["Failure Imminent"]["precision"]),
            "positive_recall": float(report["Failure Imminent"]["recall"]),
            "positive_f1": float(report["Failure Imminent"]["f1-score"]),
            "roc_auc": auc,
            "source_notebook": "RandomForest_Trained.ipynb",
            "source_csv": str(csv_path),
        }
    }
    (model_dir / "training_summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )

    print(f"Saved {out_path}")
    print(f"Features: {len(feature_cols)}")
    print(f"Accuracy: {report['accuracy']:.4f}")
    print(f"ROC-AUC: {auc}")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV,
        help="Path to synthetic_telemetry_data.csv",
    )
    args = parser.parse_args()
    if not args.csv.exists():
        raise SystemExit(f"CSV not found: {args.csv}")
    train_and_export(args.csv)


if __name__ == "__main__":
    main()
