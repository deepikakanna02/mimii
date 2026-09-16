from fastapi import FastAPI, File, UploadFile, HTTPException
from pydantic import BaseModel
from common.scoring import AnomalyScorer
from pathlib import Path
import tempfile

class PredictionResponse(BaseModel):
    machine_type: str
    prediction: str
    anomaly_score: float
    threshold: float

app = FastAPI()
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
scorer = AnomalyScorer("artifacts")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict", response_model=PredictionResponse)
async def predict(audio: UploadFile = File(...)):

    if audio.content_type not in {"audio/wav", "audio/x-wav"}:
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
            result = scorer.score(file_path, "pump")
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
            "threshold": result["threshold"]
        }

    finally:
        if file_path:
            Path(file_path).unlink(missing_ok=True)
        await audio.close() 