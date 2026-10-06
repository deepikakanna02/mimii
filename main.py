from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from common.scoring import AnomalyScorer
from pathlib import Path
import csv
import os
import tempfile
import time

BASE_DIR = Path(__file__).resolve().parent
ARTIFACT_DIR = BASE_DIR / "artifacts"
FRONTEND_DIR = BASE_DIR / "frontend"

class PredictionResponse(BaseModel):
    machine_type: str
    prediction: str
    anomaly_score: float
    threshold: float
    inference_ms: float

app = FastAPI(title="MIMII Pump Anomaly Detection")

# Frontend may also be run from a separate dev server (e.g. VS Code Live Server).
# Override with CORS_ORIGINS="http://host:port,http://other:port" if needed.
_default_origins = [
    "http://127.0.0.1:5500", "http://localhost:5500",
    "http://127.0.0.1:5173", "http://localhost:5173",
    "http://127.0.0.1:8000", "http://localhost:8000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", ",".join(_default_origins)).split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_CONTENT_TYPES = {"audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"}
scorer = AnomalyScorer(str(ARTIFACT_DIR))

@app.get("/health")
def health():
    return {"status": "ok", "machines": scorer.available_machines(), "device": str(scorer.device)}


@app.get("/model-info")
def model_info():
    """Read-only model card for the dashboard: held-out metrics from the manifest
    plus the cross-validated comparison of every architecture that was trained."""
    entry = scorer.manifest["machines"]["pump"]
    m = entry.get("metrics_at_threshold", {})

    comparison = []
    cv_path = ARTIFACT_DIR / "cv_metrics_summary.csv"
    if cv_path.exists():
        with open(cv_path, newline="") as f:
            for row in csv.DictReader(f):
                if row["machine_id"] != "pump":
                    continue
                comparison.append({
                    "architecture": row["architecture"],
                    "auc_mean": float(row["auc_mean"]),
                    "auc_std": float(row["auc_std"]),
                    "precision": float(row["precision_mean"]),
                    "recall": float(row["recall_mean"]),
                    "f1": float(row["f1_mean"]),
                    "is_winner": row["is_winner"].strip().lower() == "true",
                })

    return {
        "machine_type": "pump",
        "architecture": entry["architecture"],
        "components": entry.get("component_architectures", []),
        "combiner": entry.get("combiner_algorithm"),
        "threshold": entry["threshold"],
        "auc_roc": entry.get("auc_roc"),
        "precision": m.get("precision"),
        "recall": m.get("recall"),
        "f1": m.get("f1"),
        "confusion_matrix": m.get("confusion_matrix"),
        "cv_mean_auc": entry.get("cv_mean_auc"),
        "cv_std_auc": entry.get("cv_std_auc"),
        "preprocessing": entry["preprocessing_config"],
        "comparison": comparison,
    }

@app.post("/predict", response_model=PredictionResponse)
async def predict(audio: UploadFile = File(...)):

    if audio.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only WAV audio files are supported."
        )

    if not audio.filename or Path(audio.filename).suffix.lower() != ".wav":
        raise HTTPException(
            status_code=400,
            detail="Only .wav audio files are supported."
        )

    file_path = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=".wav",
            delete=False
        ) as temp_file:

            file_path = temp_file.name
            total_size = 0 

            while chunk := await audio.read(1024 * 1024):
                total_size += len(chunk)

                if total_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="Audio file is too large. Maximum size is 20 MB."
                    )

                temp_file.write(chunk)

            file_path = temp_file.name

        try:
            started = time.perf_counter()
            result = scorer.score(file_path, "pump")
            elapsed_ms = (time.perf_counter() - started) * 1000
        except Exception as exc:
            print(f"Inference error: {exc}")
            raise HTTPException(
                status_code=500,
                detail="An error occurred while processing the audio."
            )

        return {
            "machine_type": result["machine_id"],
            "prediction": "anomalous" if result["is_anomaly"] else "normal",
            "anomaly_score": result["anomaly_score"],
            "threshold": result["threshold"],
            "inference_ms": round(elapsed_ms, 1),
        }

    finally:
        if file_path:
            Path(file_path).unlink(missing_ok=True)
        await audio.close()


# Dashboard served from the same origin: open http://127.0.0.1:8000/
# Mounted last so /health, /predict, /model-info and /docs take priority.
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend") 