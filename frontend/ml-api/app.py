from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ml_model import service


app = FastAPI(
    title="iDrive CDO Vehicle Maintenance ML API",
    description=(
        "Random Forest predictive maintenance API. "
        "Primary target: failure_imminent (combined engine/brake/battery risk)."
    ),
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictionRequest(BaseModel):
    attributes: dict[str, Any] = Field(
        ...,
        description="Telemetry attributes. Must include the required features for the selected target.",
    )


@app.get("/")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "targets": service.available_targets(),
    }


@app.get("/features")
def features() -> dict[str, list[str]]:
    return service.required_features()  # type: ignore[return-value]


@app.get("/features/{target}")
def features_for_target(target: str) -> list[str]:
    try:
        return service.required_features(target)  # type: ignore[return-value]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/predict/{target}")
def predict(target: str, request: PredictionRequest) -> dict[str, Any]:
    try:
        return service.predict(target, request.attributes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/predict")
def predict_all(request: PredictionRequest) -> dict[str, Any]:
    try:
        return service.predict_all(request.attributes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
