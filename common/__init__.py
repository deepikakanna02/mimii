"""
Shared modules for the MIMII machine-failure-detection project.

Owned by Person A. Imported by Person B (FastAPI backend) and Person C (dashboard).
Do NOT fork or copy-paste these into backend/ or dashboard/ — training-time and
inference-time preprocessing must stay byte-identical, or reconstruction error
silently becomes meaningless.

Typical use (Person B):

    from common import AnomalyScorer

    scorer = AnomalyScorer("artifacts")        # load once at startup
    result = scorer.score("clip.wav", "pump")
"""

from .preprocessing import wav_to_logmel
from .models import ConvAutoencoderV1, ConvAutoencoderV2, build_model
from .scoring import AnomalyScorer

__all__ = [
    "wav_to_logmel",
    "ConvAutoencoderV1",
    "ConvAutoencoderV2",
    "build_model",
    "AnomalyScorer",
]

__version__ = "1.0.0"
