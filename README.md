MIMII Machine Failure Detection Backend

Audio-based industrial machine failure detection using the MIMII
dataset, CNN autoencoders, a trained ensemble/combiner, and a FastAPI
inference service.

Current Scope

The current implementation supports pump only.

The backend accepts a .wav recording, runs the trained pump
anomaly-detection pipeline, and returns an anomaly score and prediction.

Current request flow:

Audio (.wav) ↓ FastAPI ↓ Temporary file ↓ Shared preprocessing
(common/preprocessing.py) ↓ ConvAutoencoder V1 + ConvAutoencoder V2 ↓
Trained combiner (pump_combiner.pkl) ↓ Anomaly score + threshold ↓
Normal / Anomalous ↓ JSON response

The backend does not currently require the frontend to send a machine
type. The machine is fixed to pump in the current implementation.

------------------------------------------------------------------------

Project Structure

Current repository structure:

    mimii/
    ├── artifacts/
    │   ├── cv_metrics_summary.csv
    │   ├── manifest.json
    │   ├── pump_combiner.pkl
    │   ├── pump_conv_ae_v1.pt
    │   └── pump_conv_ae_v2.pt
    │
    ├── common/
    │   ├── __init__.py
    │   ├── models.py
    │   ├── preprocessing.py
    │   └── scoring.py
    │
    ├── main.py
    ├── requirements.txt
    ├── README.md
    └── notebookc71a97b3e7.ipynb

Important files

main.py - FastAPI application. - Defines /health and /predict. - Loads
AnomalyScorer once when the application starts. - Handles upload
validation, temporary-file management, inference, and API response
formatting.

common/preprocessing.py - Single source of truth for audio
preprocessing. - Do not reimplement the preprocessing in the backend.

common/models.py - Contains the CNN autoencoder architectures. -
Provides build_model() used by the scoring pipeline.

common/scoring.py - Complete inference pipeline. - Loads the model
artifacts from artifacts/. - Runs preprocessing, model inference,
feature extraction, and the trained combiner. - The backend calls this
code instead of duplicating ML logic.

artifacts/manifest.json - Defines the pump model configuration,
preprocessing parameters, model architecture, weights, threshold, and
combiner information.

------------------------------------------------------------------------

ML Inference Pipeline

The current production inference architecture is:

    Input WAV
       ↓
    Preprocessing
       ↓
    ConvAE V1 ──┐
                ├── reconstruction-error features
    ConvAE V2 ──┘
       ↓
    pump_combiner.pkl
       ↓
    anomaly_score
       ↓
    threshold comparison
       ↓
    normal / anomalous

The architecture recorded in the current manifest is:

    supervised_combo

with:

    conv_ae_v1
    conv_ae_v2

as component models.

The backend must use common.scoring.AnomalyScorer for inference. Do not
create a separate preprocessing or scoring implementation in main.py.

------------------------------------------------------------------------

Preprocessing Contract

The current pump preprocessing configuration is stored in
artifacts/manifest.json.

Current values:

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
    Mono:              Yes
    Trim silence:      Yes

The resulting log-Mel spectrogram has shape:

    (128, 313)

Normalization uses the statistics stored in the manifest.

Important

Preprocessing is part of the model inference contract.

If the preprocessing parameters change, the model’s reconstruction
errors are no longer directly comparable with the values used when the
model was trained.

Always use:

    common.preprocessing.wav_to_logmel()

through the existing scoring pipeline.

------------------------------------------------------------------------

Model Artifacts

The current pump artifacts are:

    artifacts/
    ├── manifest.json
    ├── pump_conv_ae_v1.pt
    ├── pump_conv_ae_v2.pt
    └── pump_combiner.pkl

The manifest currently defines:

    Machine: pump
    Architecture: supervised_combo
    Threshold: 0.4832223649199257

The threshold is already part of the trained artifact contract. The
backend does not independently choose a threshold.

------------------------------------------------------------------------

Backend Setup

1. Create a virtual environment

Windows PowerShell:

    python -m venv .venv

Activate it:

    .\.venv\Scripts\Activate.ps1

If PowerShell execution policy prevents activation on your machine,
configure the policy for your current Windows user:

    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

Then activate the environment again.

2. Install dependencies

    pip install -r requirements.txt

The important ML versions used for the current working environment are:

    numpy==2.0.2
    scikit-learn==1.6.1
    torch==2.14.0

The current development machine uses:

    Python 3.11.9
    PyTorch 2.14.0+cu130
    CUDA runtime 13.0
    NVIDIA GeForce RTX 4060 Laptop GPU

3. NVIDIA GPU setup

For an NVIDIA GPU, install the CUDA-enabled PyTorch 2.14.0 build:

    pip uninstall torch -y
    pip install torch==2.14.0 --index-url https://download.pytorch.org/whl/cu130

Verify:

    python -c "import torch; print('PyTorch:', torch.__version__); print('CUDA available:', torch.cuda.is_available()); print('CUDA runtime:', torch.version.cuda); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None')"

Expected on a compatible NVIDIA setup:

    PyTorch: 2.14.0+cu130
    CUDA available: True
    CUDA runtime: 13.0
    GPU: NVIDIA GeForce RTX 4060 Laptop GPU

The scoring code automatically selects CUDA when available and falls
back to CPU otherwise.

------------------------------------------------------------------------

Running the Backend

From the project root:

    uvicorn main:app --reload

The backend runs at:

    http://127.0.0.1:8000

Interactive API documentation:

    http://127.0.0.1:8000/docs

Swagger UI can be used to test the API without a frontend.

------------------------------------------------------------------------

API Documentation

GET /health

Checks whether the backend is running.

Response:

    {
      "status": "ok"
    }

------------------------------------------------------------------------

POST /predict

Runs anomaly detection on an uploaded pump recording.

Request

Method:

    POST

Content type:

    multipart/form-data

Form field:

    audio

The frontend should send the WAV file using the field name audio.

Example:

    POST /predict
    multipart/form-data
    audio = pump.wav

Input requirements

-   .wav extension
-   WAV content type
-   Maximum upload size: 20 MB

The backend temporarily stores the upload while inference is running and
deletes the temporary file afterward.

The uploaded audio is not permanently stored by the backend.

Response

HTTP 200:

    {
      "machine_type": "pump",
      "prediction": "anomalous",
      "anomaly_score": 0.9884138239521334,
      "threshold": 0.4832223649199257
    }

prediction is either:

    normal

or:

    anomalous

anomaly_score is the score produced by the trained inference pipeline.

threshold is the threshold stored in the model artifact.

Important frontend integration detail

The frontend should NOT send:

    machine_type

The backend currently assumes:

    machine_type = pump

Only the audio file needs to be sent to /predict.

------------------------------------------------------------------------

Example Frontend Request

Conceptually, the frontend needs to send:

    POST http://127.0.0.1:8000/predict

    multipart/form-data:
        audio: <selected .wav file>

The frontend should then read the JSON response:

    {
      "machine_type": "pump",
      "prediction": "normal",
      "anomaly_score": 0.1234,
      "threshold": 0.4832
    }

and display the relevant information to the user.

CORS has not been configured yet because frontend integration is being
handled separately. It can be added when the frontend is connected.

------------------------------------------------------------------------

Error Responses

Unsupported file type

HTTP 400:

    {
      "detail": "Only WAV audio files are supported."
    }

Invalid file extension

HTTP 400:

    {
      "detail": "Only .wav audio files are supported."
    }

File too large

HTTP 413:

    {
      "detail": "Audio file is too large. Maximum size is 20 MB."
    }

Inference failure

HTTP 500:

    {
      "detail": "An error occurred while processing the audio."
    }

Technical inference errors are printed in the backend terminal for
debugging but are not exposed directly to the frontend.

------------------------------------------------------------------------

Testing the ML Pipeline Directly

Before debugging the API, the model can be tested independently:

    python -c "from common.scoring import AnomalyScorer; scorer = AnomalyScorer('artifacts'); result = scorer.score(r'PATH_TO_WAV_FILE', 'pump'); print(result)"

Expected structure:

    {
      'machine_id': 'pump',
      'architecture': 'supervised_combo',
      'anomaly_score': ...,
      'threshold': 0.4832223649199257,
      'is_anomaly': ...
    }

The FastAPI endpoint transforms this internal ML result into the
frontend response format.

------------------------------------------------------------------------

Current Verified Environment

The backend has been tested successfully with:

    Python:        3.11.9
    NumPy:         2.0.2
    scikit-learn:  1.6.1
    PyTorch:       2.14.0+cu130
    CUDA runtime:  13.0
    GPU:           NVIDIA GeForce RTX 4060 Laptop GPU

The following have been verified:

-   FastAPI starts successfully.
-   /health works.
-   /predict accepts a WAV upload.
-   WAV validation works.
-   20 MB upload limit works.
-   Uploads are processed in chunks.
-   Uploaded files are stored temporarily.
-   Temporary files are cleaned up after requests.
-   UploadFile is closed after processing.
-   The trained pump artifacts load successfully.
-   ConvAutoencoder V1 and V2 run on CUDA when available.
-   The trained combiner loads successfully.
-   A real WAV has successfully passed through the complete inference
    pipeline.
-   FastAPI returns the expected prediction JSON.

A verified test produced:

    anomaly_score: 0.9884138239521334
    threshold:     0.4832223649199257
    prediction:    anomalous

------------------------------------------------------------------------

Development Notes for Frontend Integration

The frontend teammate only needs to know:

    Backend URL:
    http://127.0.0.1:8000

    Prediction endpoint:
    POST /predict

    File field:
    audio

    Input:
    .wav, maximum 20 MB

    Response:
    machine_type
    prediction
    anomaly_score
    threshold

No model files or ML preprocessing code need to be handled by the
frontend.

The frontend should not reproduce the anomaly-detection logic. It should
send the audio to the API and display the returned result.

For local development, if the frontend runs on another port/origin, CORS
configuration may need to be added to FastAPI during integration.

------------------------------------------------------------------------

Current Limitations

-   Only pump is supported.
-   Only WAV input is accepted.
-   The backend is currently intended for local demonstration.
-   CORS configuration is not yet added.
-   Concurrency/deployment optimization is not currently a priority.
-   Dockerization is not currently part of the working local demo flow.

Future machine types can be added by extending the artifact/manifest
structure and backend interface, but the current API should remain
pump-only until those models are actually available.

------------------------------------------------------------------------

Team Integration Boundary

ML layer

Owned by the ML implementation:

    common/preprocessing.py
    common/models.py
    common/scoring.py
    artifacts/

Backend layer

Owned by the FastAPI implementation:

    main.py

Responsibilities:

    receive audio
    validate upload
    temporarily store audio
    call AnomalyScorer
    transform ML result
    return JSON
    clean up temporary resources

Frontend layer

The frontend should:

    select/upload WAV
    POST audio to /predict
    receive JSON
    display prediction
    display anomaly score
    display threshold

The frontend does not need to know the internal model architecture.

------------------------------------------------------------------------

Quick Start

    # Activate environment
    .\.venv\Scripts\Activate.ps1

    # Install dependencies
    pip install -r requirements.txt

    # For NVIDIA GPU
    pip uninstall torch -y
    pip install torch==2.14.0 --index-url https://download.pytorch.org/whl/cu130

    # Run API
    uvicorn main:app --reload

    # Open Swagger
    http://127.0.0.1:8000/docs

Upload a pump .wav through POST /predict to test the complete system.
