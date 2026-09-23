from pathlib import Path
from typing import Any

import joblib
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"

MODEL_FILES = {
    "failure_imminent": "failure_imminent_rf.joblib",
}


class MaintenanceModelService:
    def __init__(self, model_dir: Path = MODEL_DIR) -> None:
        self.model_dir = model_dir
        self.models: dict[str, Any] = {}
        self.features: dict[str, list[str]] = {}
        self.brand_classes: dict[str, list[str]] = {}
        self._load_models()

    def _load_models(self) -> None:
        missing: list[str] = []
        for target, filename in MODEL_FILES.items():
            model_path = self.model_dir / filename
            if not model_path.exists():
                missing.append(str(model_path))
                continue

            artifact = joblib.load(model_path)
            self.models[target] = artifact["model"]
            self.features[target] = list(artifact["features"])
            self.brand_classes[target] = list(artifact.get("brand_classes", []))

        if missing:
            raise FileNotFoundError("Missing model artifact(s): " + ", ".join(missing))

    def available_targets(self) -> list[str]:
        return list(self.models.keys())

    def required_features(self, target: str | None = None) -> dict[str, list[str]] | list[str]:
        if target is None:
            return self.features
        self._assert_target(target)
        return self.features[target]

    def predict(self, target: str, attributes: dict[str, Any]) -> dict[str, Any]:
        self._assert_target(target)
        row = self._row_for_target(target, attributes)
        model = self.models[target]
        prediction = int(model.predict(row)[0])

        probability = None
        if hasattr(model, "predict_proba"):
            probability = float(model.predict_proba(row)[0][1])

        return {
            "target": target,
            "prediction": prediction,
            "needs_maintenance": bool(prediction),
            "probability": probability,
            "features_used": self.features[target],
        }

    def predict_all(self, attributes: dict[str, Any]) -> dict[str, Any]:
        return {
            target: self.predict(target, attributes)
            for target in self.available_targets()
        }

    def _prepare_attributes(self, target: str, attributes: dict[str, Any]) -> dict[str, Any]:
        prepared = dict(attributes)

        if "timestamp" in prepared and (
            "hour" not in prepared or "day_of_week" not in prepared
        ):
            ts = pd.to_datetime(prepared["timestamp"])
            prepared.setdefault("hour", int(ts.hour))
            prepared.setdefault("day_of_week", int(ts.dayofweek))

        if "brand_encoded" not in prepared and "brand" in prepared:
            brand = str(prepared["brand"])
            classes = self.brand_classes.get(target, [])
            if brand not in classes:
                raise ValueError(
                    "Unknown brand '"
                    + brand
                    + "'. Known brands: "
                    + ", ".join(classes)
                )
            prepared["brand_encoded"] = classes.index(brand)

        return prepared

    def _row_for_target(self, target: str, attributes: dict[str, Any]) -> pd.DataFrame:
        prepared = self._prepare_attributes(target, attributes)
        required = self.features[target]
        missing = [name for name in required if name not in prepared]
        if missing:
            raise ValueError(
                "Missing required attribute(s) for "
                + target
                + ": "
                + ", ".join(missing)
            )

        row: dict[str, float] = {}
        for name in required:
            try:
                row[name] = float(prepared[name])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Attribute '{name}' must be numeric.") from exc

        return pd.DataFrame([row], columns=required)

    def _assert_target(self, target: str) -> None:
        if target not in self.models:
            raise ValueError(
                "Unknown target '"
                + target
                + "'. Use one of: "
                + ", ".join(self.available_targets())
            )


service = MaintenanceModelService()
