"""
Scoring — turns an audio file into (anomaly_score, is_anomaly) using the exported artifact.

Person B: this is the whole inference path. Wrap it in FastAPI; don't rewrite it.

    from common.scoring import AnomalyScorer
    scorer = AnomalyScorer("artifacts")          # loads manifest + all models once at startup
    result = scorer.score("clip.wav", "pump")    # {"anomaly_score":..., "is_anomaly":..., "threshold":...}

Handles all three possible winning architectures recorded by Person A:
  - a single autoencoder ("conv_ae_v1" / "conv_ae_v2")  -> score = mean reconstruction MSE
  - "ensemble"           -> z-scored average of both autoencoders' errors
  - "supervised_combo"   -> AUC-weighted vote of classifiers over reconstruction-error features
"""

import json
import os
import pickle

import numpy as np
import torch

from .models import build_model
from .preprocessing import wav_to_logmel


def _frame_features(model, x, device):
    """4 features per clip: mean / max / std / p90 of per-frame reconstruction error."""
    with torch.no_grad():
        recon = model(x)
        err = (recon - x) ** 2                    # (B, 1, n_mels, T)
        frame_err = err.mean(dim=2).squeeze(1)      # (B, T)
        feats = torch.stack([
            frame_err.mean(dim=1),
            frame_err.max(dim=1).values,
            frame_err.std(dim=1),
            torch.quantile(frame_err, 0.90, dim=1),
        ], dim=1)
    return feats.cpu().numpy(), frame_err.mean(dim=1).cpu().numpy()


class AnomalyScorer:
    def __init__(self, artifact_dir="artifacts", device=None):
        self.artifact_dir = artifact_dir
        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
        with open(os.path.join(artifact_dir, "manifest.json")) as f:
            self.manifest = json.load(f)

        self.models = {}     # machine_id -> {component_arch: model}
        self.combiners = {}  # machine_id -> {"classifiers", "scaler", "weights"}

        for mid, entry in self.manifest["machines"].items():
            cfg = entry["preprocessing_config"]
            comps = {}
            weights_files = entry.get("weights_files") or {entry["architecture"]: entry["weights_file"]}
            for arch_name, fname in weights_files.items():
                m = build_model(arch_name, cfg)
                m.load_state_dict(torch.load(os.path.join(artifact_dir, fname), map_location=self.device))
                m.to(self.device).eval()
                comps[arch_name] = m
            self.models[mid] = comps

            if entry["architecture"] == "supervised_combo":
                with open(os.path.join(artifact_dir, entry["combiner_file"]), "rb") as f:
                    self.combiners[mid] = pickle.load(f)

    def available_machines(self):
        return list(self.manifest["machines"].keys())

    def score(self, audio_path, machine_id):
        if machine_id not in self.manifest["machines"]:
            raise KeyError(
                f"Unknown machine_id {machine_id!r}. Available: {self.available_machines()}"
            )

        entry = self.manifest["machines"][machine_id]
        cfg = entry["preprocessing_config"]
        arch = entry["architecture"]
        threshold = entry["threshold"]

        logmel = wav_to_logmel(audio_path, cfg)
        x = torch.from_numpy(logmel).unsqueeze(0).unsqueeze(0).to(self.device)  # (1,1,n_mels,T)

        comps = self.models[machine_id]

        if arch in ("conv_ae_v1", "conv_ae_v2"):
            _, mean_err = _frame_features(comps[arch], x, self.device)
            score = float(mean_err[0])

        elif arch == "ensemble":
            names = entry["component_architectures"]
            stats = entry["ensemble_norm_stats"]
            zs = []
            for n in names:
                _, mean_err = _frame_features(comps[n], x, self.device)
                mu, sd = stats[n]
                zs.append((float(mean_err[0]) - mu) / (sd + 1e-8))
            score = float(np.mean(zs))

        elif arch == "supervised_combo":
            names = entry["component_architectures"]
            feats = [_frame_features(comps[n], x, self.device)[0] for n in names]
            X = np.concatenate(feats, axis=1)
            c = self.combiners[machine_id]
            Xs = c["scaler"].transform(X)
            score = float(sum(
                c["weights"][name] * clf.predict_proba(Xs)[:, 1][0]
                for name, clf in c["classifiers"].items()
            ))

        else:
            raise ValueError(f"Unknown architecture in manifest: {arch}")

        return {
            "machine_id": machine_id,
            "architecture": arch,
            "anomaly_score": score,
            "threshold": threshold,
            "is_anomaly": bool(score >= threshold),
        }
