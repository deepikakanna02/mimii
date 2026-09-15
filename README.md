# mimii
# Machine Failure Detection via Audio Anomaly Detection

An end-to-end **Machine Failure Detection System** using audio anomaly detection and the **MIMII (Malfunctioning Industrial Machine Investigation and Inspection)** dataset.

The system learns the characteristics of **normal machine sounds** using CNN-based Autoencoders. During inference, abnormal sounds are identified using the **reconstruction error** produced by the Autoencoder.

The final system consists of:

* **ML Model:** Audio preprocessing + Mel-spectrogram generation + CNN Autoencoder
* **Backend:** FastAPI inference service
* **Dashboard:** Streamlit/React interface
* **Evaluation:** Precision, Recall, F1-score, ROC-AUC and confusion matrices
* **Deployment:** Docker

---

## 1. Project Overview

Industrial machines often produce characteristic sounds during normal operation. Mechanical faults can change these sound patterns before a complete failure occurs.

This project uses **audio anomaly detection** to identify such abnormal operating conditions.

### Basic Pipeline

```text
Raw Audio
    ↓
Audio Preprocessing
    ↓
Mel-Spectrogram
    ↓
CNN Autoencoder
    ↓
Reconstruction Error
    ↓
Threshold Comparison
    ↓
Normal / Anomalous
    ↓
FastAPI
    ↓
Dashboard
```

The Autoencoder is trained primarily on **normal machine sounds**. It learns to reconstruct normal sounds well. When an abnormal sound is passed through the model, its reconstruction error is expected to be higher.

---

# 2. Dataset

### MIMII Dataset

The project uses the **MIMII dataset**, which contains real industrial machine recordings in normal and abnormal conditions.

Target machine types:

* Pump
* Fan
* Valve
* Slider

### Current Dataset Status

The current development notebook contains a **pump-only MIMII dataset**.

Current dataset detected:

```text
Total WAV files: 519
Normal:          381
Abnormal:        138
Machine type:    Pump
```

The current notebook automatically discovers the dataset and parses `normal` / `abnormal` labels from the file paths.

> Important: Do not assume that fan, valve and slider models are already available. The current implementation is currently validated on the pump dataset.

---

# 3. System Architecture

```text
                    ┌─────────────────────┐
                    │     Audio Input     │
                    │      (.wav etc.)     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   FastAPI Backend   │
                    │                     │
                    │ Audio preprocessing │
                    │ Model selection     │
                    │ Inference            │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   CNN Autoencoder   │
                    │                     │
                    │ Reconstruction      │
                    │ Error Calculation   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Threshold Comparison│
                    └──────────┬──────────┘
                               │
                  ┌────────────┴────────────┐
                  ▼                         ▼
              NORMAL                    ANOMALOUS
                  │                         │
                  └────────────┬────────────┘
                               ▼
                    ┌─────────────────────┐
                    │     Dashboard       │
                    │                     │
                    │ Waveform            │
                    │ Spectrogram          │
                    │ Anomaly Score        │
                    │ Prediction           │
                    │ Metrics              │
                    └─────────────────────┘
```

---

# 4. Team Responsibilities

The project is split between three people.

## Person A — Signal Processing & Machine Learning

### Main Responsibility

Build the complete audio preprocessing and anomaly detection model.

### Tasks

1. Load and inspect the MIMII dataset.
2. Identify:

   * Machine type
   * Machine ID
   * Normal / abnormal label
3. Convert raw WAV audio into Mel-spectrograms.
4. Establish and freeze the preprocessing configuration.
5. Train CNN-based Autoencoder(s) using normal training samples.
6. Calculate reconstruction errors.
7. Determine anomaly thresholds.
8. Evaluate the model.
9. Save the trained model and all required preprocessing information.

### Current Preprocessing Contract

The current notebook uses:

```text
Sample rate:       16000 Hz
FFT size:          2048
Hop length:        512
Mel bins:          128
Minimum frequency: 0 Hz
Maximum frequency: 8000 Hz
Power:             2.0
Top dB:            80
Clip duration:     10 seconds
Fixed frames:      313
Mono audio:        Yes
Trim silence:      Yes
```

The resulting Mel-spectrogram shape is:

```text
(128, 313)
```

The notebook currently uses `librosa` for audio loading and Mel-spectrogram generation and PyTorch for the model.

### Person A MUST provide

```text
models/
    pump_autoencoder.pt

config/
    preprocessing.json
    thresholds.json

metadata/
    model_metadata.json
```

The exact filenames can be changed, but the information must be available to Person B.

### Model Artifact Contract

Person A must provide:

```json
{
    "machine_type": "pump",
    "sample_rate": 16000,
    "n_fft": 2048,
    "hop_length": 512,
    "n_mels": 128,
    "fmin": 0,
    "fmax": 8000,
    "power": 2.0,
    "top_db": 80,
    "fixed_frames": 313,
    "clip_duration_sec": 10,
    "trim_silence": true,
    "normalization": {
        "mean": "...",
        "std": "..."
    },
    "threshold": "..."
}
```

The actual normalization statistics and threshold must be filled in after training.

---

# 5. Threshold Decision

**Person A owns the threshold decision.**

The reconstruction error is continuous, so a threshold is required to convert it into:

```text
Normal
```

or

```text
Anomalous
```

### Recommended approach

Calculate reconstruction errors on the **normal validation set** and initially use:

```text
Threshold = 95th percentile of normal validation reconstruction errors
```

Then:

```text
if reconstruction_error > threshold:
    prediction = anomalous
else:
    prediction = normal
```

Person A must save the final threshold and pass it to Person B.

### Important

Person B must **not independently choose another threshold**.

Person C may experiment with different thresholds during evaluation, but the production threshold remains the threshold supplied by Person A.

---

# 6. Model Strategy

The preferred architecture is:

```text
Machine Type
     ↓
Corresponding Autoencoder
     ↓
Reconstruction Error
     ↓
Machine-specific Threshold
```

For example:

```text
pump  → pump_autoencoder.pt  → pump_threshold
fan   → fan_autoencoder.pt   → fan_threshold
valve → valve_autoencoder.pt → valve_threshold
slider → slider_autoencoder.pt → slider_threshold
```

This avoids forcing one model to learn very different acoustic characteristics from different machine types.

### Current implementation

The current notebook is **pump-only**, so initially:

```text
pump → pump_autoencoder.pt
```

When additional MIMII machine types are added, the same interface should be extended rather than redesigning the entire backend.

---

# 7. Person B — Backend & Serving

## Main Responsibility

Build the inference API using **FastAPI** and Dockerize it.

### Person B Tasks

1. Create FastAPI application.
2. Create an audio upload endpoint.
3. Accept:

   * Audio file
   * Machine type
4. Run exactly the same preprocessing as Person A.
5. Load the corresponding Autoencoder.
6. Calculate reconstruction error.
7. Load the corresponding threshold.
8. Return:

   * Machine type
   * Anomaly score
   * Threshold
   * Prediction
9. Add error handling.
10. Add API documentation.
11. Dockerize the backend.

### Suggested Endpoint

```http
POST /predict
```

Request:

```text
multipart/form-data

file = audio.wav
machine_type = pump
```

Response:

```json
{
    "machine_type": "pump",
    "anomaly_score": 0.0245,
    "threshold": 0.0182,
    "prediction": "anomalous"
}
```

### Health Endpoint

```http
GET /health
```

Response:

```json
{
    "status": "healthy"
}
```

### Person B Development Strategy

Do NOT wait for Person A's final model.

Initially create:

```text
Audio
 ↓
Mock preprocessing
 ↓
Dummy model
 ↓
Mock anomaly score
 ↓
API response
```

Once Person A provides the model artifact:

```text
Audio
 ↓
Real preprocessing
 ↓
Real Autoencoder
 ↓
Real reconstruction error
 ↓
Real threshold
 ↓
API response
```

### Docker

Person B must provide:

```text
Dockerfile
requirements.txt
docker-compose.yml
```

The backend should be runnable with:

```bash
docker compose up --build
```

---

# 8. Person C — Dashboard & Evaluation

## Main Responsibility

Build the user interface and evaluate model performance.

### Dashboard Features

The dashboard should allow a user to:

1. Select machine type.
2. Upload an audio file.
3. Play the uploaded audio.
4. Display waveform.
5. Display Mel-spectrogram.
6. Send the audio to the FastAPI backend.
7. Display anomaly score.
8. Display threshold.
9. Display prediction.
10. Display evaluation metrics.

### Example Dashboard

```text
┌─────────────────────────────────────────┐
│       MACHINE FAILURE DETECTION         │
├─────────────────────────────────────────┤
│ Machine Type: [ Pump ▼ ]                │
│                                         │
│ Upload Audio: [ choose .wav ]           │
│                                         │
│ Waveform                                │
│ ─────────────────────────────────────── │
│                                         │
│ Mel-Spectrogram                         │
│ ─────────────────────────────────────── │
│                                         │
│ Anomaly Score: 0.0245                   │
│ Threshold:     0.0182                   │
│                                         │
│ Prediction: ⚠ ANOMALOUS                 │
└─────────────────────────────────────────┘
```

### Evaluation Metrics

Person C should calculate:

* Precision
* Recall
* F1-score
* ROC-AUC
* Confusion Matrix

Metrics should be reported:

```text
Overall
```

and, where data is available:

```text
Per machine type
```

Example:

```text
             Precision  Recall  F1   ROC-AUC
Pump            ...
Fan             ...
Valve           ...
Slider          ...
--------------------------------------------
Overall         ...
```

### Threshold Evaluation

Although Person A provides the production threshold, Person C can evaluate multiple thresholds to understand the precision/recall tradeoff.

ROC-AUC should be reported because it is threshold-independent.

---

# 9. Person C Development Strategy

Person C should NOT wait for Person B.

Start with a mock API response:

```json
{
    "machine_type": "pump",
    "anomaly_score": 0.0245,
    "threshold": 0.0182,
    "prediction": "anomalous"
}
```

Build the complete dashboard around this response.

Later replace:

```text
Mock API
```

with:

```text
Real FastAPI backend
```

This allows A, B and C to work simultaneously.

---

# 10. Critical A → B → C Interface

This is the most important integration contract in the project.

Person A must freeze the preprocessing configuration.

Person B must reproduce it exactly.

Person C must use the same definitions when displaying/evaluating results.

### The following MUST NOT change silently

```text
Sample rate
FFT size
Hop length
Number of Mel bins
Frequency range
Power
Top dB
Clip duration
Fixed spectrogram dimensions
Silence trimming
Normalization
Model architecture
Threshold
```

For the current implementation:

```text
Input audio
    ↓
16 kHz
    ↓
10 seconds
    ↓
128 Mel bins × 313 frames
    ↓
Normalization
    ↓
Autoencoder
```

If Person B uses different preprocessing from Person A, the reconstruction error will no longer be comparable to the training reconstruction error.

**Therefore, preprocessing configuration must be treated as part of the model artifact.**

---

# 11. Repository Structure

Recommended project structure:

```text
machine-failure-detection/
│
├── README.md
├── requirements.txt
├── .gitignore
├── docker-compose.yml
│
├── ml/
│   ├── preprocessing.py
│   ├── dataset.py
│   ├── model.py
│   ├── train.py
│   ├── evaluate.py
│   └── inference.py
│
├── models/
│   ├── pump_autoencoder.pt
│   ├── fan_autoencoder.pt
│   ├── valve_autoencoder.pt
│   └── slider_autoencoder.pt
│
├── config/
│   ├── preprocessing.json
│   └── thresholds.json
│
├── backend/
│   ├── main.py
│   ├── routes/
│   ├── services/
│   ├── schemas/
│   ├── Dockerfile
│   └── requirements.txt
│
├── dashboard/
│   ├── app.py
│   ├── components/
│   └── requirements.txt
│
├── evaluation/
│   ├── metrics.py
│   ├── confusion_matrix.py
│   └── results/
│
└── notebooks/
    └── model_development.ipynb
```

---

# 12. Parallel Development Plan

The project should NOT be developed completely sequentially.

## Week 1

### Person A

```text
Dataset
 ↓
Preprocessing
 ↓
Mel-spectrogram
 ↓
Autoencoder
 ↓
Initial experiments
```

### Person B

```text
FastAPI setup
 ↓
/health
 ↓
/predict
 ↓
Dummy model
 ↓
Docker
```

### Person C

```text
Dashboard UI
 ↓
Audio upload
 ↓
Waveform
 ↓
Spectrogram
 ↓
Mock API response
 ↓
Metrics page
```

---

## Week 2

### Person A

Finalize:

```text
Model
Threshold
Preprocessing config
Model artifact
```

### Person B

Replace:

```text
Dummy model
```

with:

```text
Person A's real model
```

Verify preprocessing.

### Person C

Connect:

```text
Dashboard → FastAPI
```

---

## Week 3

### Everyone

Integration testing:

```text
Audio
 ↓
Dashboard
 ↓
FastAPI
 ↓
Preprocessing
 ↓
Model
 ↓
Reconstruction Error
 ↓
Threshold
 ↓
Prediction
 ↓
Dashboard
```

Then run the complete test set.

---

# 13. Integration Checklist

## Person A

* [ ] Dataset loading works
* [ ] Normal/abnormal labels verified
* [ ] Mel-spectrogram generation works
* [ ] Input dimensions frozen
* [ ] Normalization finalized
* [ ] CNN Autoencoder trained
* [ ] Reconstruction error calculated
* [ ] Threshold selected
* [ ] Model saved
* [ ] Preprocessing config saved
* [ ] Threshold saved
* [ ] Model metadata documented

## Person B

* [ ] FastAPI created
* [ ] `/health` endpoint
* [ ] `/predict` endpoint
* [ ] File upload works
* [ ] Machine type accepted
* [ ] Dummy model works
* [ ] Real model integrated
* [ ] Same preprocessing as Person A
* [ ] Threshold loaded from artifact
* [ ] Error handling implemented
* [ ] Dockerfile created
* [ ] Docker Compose works

## Person C

* [ ] Dashboard created
* [ ] Audio upload works
* [ ] Audio playback works
* [ ] Waveform visualization
* [ ] Mel-spectrogram visualization
* [ ] Mock API integrated
* [ ] Real API integrated
* [ ] Anomaly score displayed
* [ ] Threshold displayed
* [ ] Prediction displayed
* [ ] Precision calculated
* [ ] Recall calculated
* [ ] F1-score calculated
* [ ] ROC-AUC calculated
* [ ] Confusion matrix generated
* [ ] Machine-specific results displayed

---

# 14. Testing

The final system should be tested at three levels.

### Unit Testing

Test:

```text
Audio loading
Spectrogram generation
Normalization
Model inference
Threshold calculation
API response
```

### Integration Testing

Verify:

```text
Dashboard → API → Model
```

and ensure the same audio produces consistent results.

### End-to-End Testing

Upload an audio file through the dashboard and verify:

```text
Upload
 ↓
Preprocessing
 ↓
Inference
 ↓
Score
 ↓
Threshold
 ↓
Prediction
 ↓
Visualization
```

---

# 15. Important Design Decisions

### Decision 1 — Threshold

**Owner: Person A**

Production threshold is selected using the normal validation reconstruction-error distribution, initially targeting the 95th percentile.

Person C can perform threshold sweeps for analysis.

---

### Decision 2 — Model Architecture

Use **separate Autoencoders per machine type** when multiple machine types are available.

Current implementation:

```text
Pump → Pump Autoencoder
```

Future:

```text
Pump  → Pump Autoencoder
Fan   → Fan Autoencoder
Valve → Valve Autoencoder
Slider → Slider Autoencoder
```

---

### Decision 3 — Preprocessing

Preprocessing parameters are part of the model artifact.

They must be identical during:

```text
Training
Validation
Testing
API inference
Dashboard visualization
```

---

### Decision 4 — Parallel Development

Person B and C should use dummy/mock components initially.

```text
Person A → Real ML
Person B → Mock Model/API
Person C → Mock API
```

Then integrate:

```text
Real ML → Real API → Real Dashboard
```

---

# 16. Expected Final Output

The final project should provide a system where a user can upload an industrial machine recording and receive:

```text
Machine Type
Audio Waveform
Mel-Spectrogram
Anomaly Score
Threshold
Normal / Anomalous Prediction
```

The system should also provide:

```text
Precision
Recall
F1-score
ROC-AUC
Confusion Matrix
Machine-specific performance
```

---

# 17. Technologies

### Machine Learning

* Python
* PyTorch
* Librosa
* NumPy
* Pandas
* Scikit-learn

### Backend

* FastAPI
* Uvicorn
* Python
* Docker

### Dashboard

Either:

* Streamlit

or:

* React

### Deployment

* Docker
* Docker Compose

---

# 18. Project Goal

The goal is to build a complete, deployable **audio-based industrial machine failure detection system** rather than only a machine learning notebook.

The final architecture should demonstrate:

```text
Machine Learning
       +
Signal Processing
       +
Backend Engineering
       +
Frontend/Dashboard
       +
Model Evaluation
       +
Docker Deployment
```

This makes the project suitable as an end-to-end ML/software engineering project for a portfolio or resume.
