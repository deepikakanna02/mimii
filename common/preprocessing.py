"""
Preprocessing — SINGLE SOURCE OF TRUTH for the A -> B -> C artifact contract.

Person B: do NOT reimplement this. Import wav_to_logmel() and call it with the
`preprocessing_config` block read from artifacts/manifest.json for the requested machine.
Any drift between training-time and inference-time preprocessing makes reconstruction
error meaningless (silently — no error will be raised).
"""

import numpy as np
import librosa


def wav_to_logmel(path_or_array, cfg, sr_if_array=None):
    """Convert an audio file (or raw waveform) to a normalized log-mel spectrogram.

    Args:
        path_or_array: path to a .wav file, or a 1-D numpy waveform.
        cfg: the `preprocessing_config` dict from manifest.json. Must contain
             sample_rate, n_fft, hop_length, n_mels, fmin, fmax, power, top_db,
             fixed_frames, clip_duration_sec, trim_silence, norm_mean, norm_std.
        sr_if_array: sample rate of the array, if passing a waveform directly.

    Returns:
        np.float32 array of shape (n_mels, fixed_frames), normalized.
    """
    if isinstance(path_or_array, (str, bytes)) or hasattr(path_or_array, "__fspath__"):
        y, _ = librosa.load(path_or_array, sr=cfg["sample_rate"], mono=True)
    else:
        y = np.asarray(path_or_array, dtype=np.float32)
        if sr_if_array is not None and sr_if_array != cfg["sample_rate"]:
            y = librosa.resample(y, orig_sr=sr_if_array, target_sr=cfg["sample_rate"])

    if cfg.get("trim_silence", False):
        y, _ = librosa.effects.trim(y, top_db=30)

    target_len = int(cfg["clip_duration_sec"] * cfg["sample_rate"])
    if len(y) < target_len:
        y = np.pad(y, (0, target_len - len(y)))
    else:
        y = y[:target_len]

    mel = librosa.feature.melspectrogram(
        y=y, sr=cfg["sample_rate"], n_fft=cfg["n_fft"], hop_length=cfg["hop_length"],
        n_mels=cfg["n_mels"], fmin=cfg["fmin"], fmax=cfg["fmax"], power=cfg["power"],
    )
    logmel = librosa.power_to_db(mel, top_db=cfg["top_db"])

    T = cfg["fixed_frames"]
    if logmel.shape[1] < T:
        logmel = np.pad(logmel, ((0, 0), (0, T - logmel.shape[1])), mode="edge")
    else:
        logmel = logmel[:, :T]

    logmel = logmel.astype(np.float32)

    if cfg.get("norm_mean") is not None and cfg.get("norm_std") is not None:
        logmel = (logmel - cfg["norm_mean"]) / (cfg["norm_std"] + 1e-8)

    return logmel
