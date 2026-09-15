"""
Model architectures — must match training exactly, or load_state_dict() will fail
(or worse, silently load into a mismatched graph).

Person B: build_model(arch_name, cfg) then model.load_state_dict(torch.load(weights_path)).
"""

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


class ConvAutoencoderV1(nn.Module):
    """Compact baseline: 3-layer conv encoder/decoder."""

    def __init__(self):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Conv2d(1, 16, 3, stride=2, padding=1), nn.BatchNorm2d(16), nn.ReLU(),
            nn.Conv2d(16, 32, 3, stride=2, padding=1), nn.BatchNorm2d(32), nn.ReLU(),
            nn.Conv2d(32, 64, 3, stride=2, padding=1), nn.BatchNorm2d(64), nn.ReLU(),
        )
        self.decoder = nn.Sequential(
            nn.ConvTranspose2d(64, 32, 3, stride=2, padding=1, output_padding=1), nn.BatchNorm2d(32), nn.ReLU(),
            nn.ConvTranspose2d(32, 16, 3, stride=2, padding=1, output_padding=1), nn.BatchNorm2d(16), nn.ReLU(),
            nn.ConvTranspose2d(16, 1, 3, stride=2, padding=1, output_padding=1),
        )

    def forward(self, x):
        z = self.encoder(x)
        out = self.decoder(z)
        out = F.interpolate(out, size=x.shape[-2:], mode="bilinear", align_corners=False)
        return out


class ConvAutoencoderV2(nn.Module):
    """Deeper autoencoder with an FC bottleneck."""

    def __init__(self, n_mels=128, fixed_frames=313, latent_dim=64):
        super().__init__()
        self.enc_conv = nn.Sequential(
            nn.Conv2d(1, 16, 3, stride=2, padding=1), nn.BatchNorm2d(16), nn.ReLU(),
            nn.Conv2d(16, 32, 3, stride=2, padding=1), nn.BatchNorm2d(32), nn.ReLU(),
            nn.Conv2d(32, 64, 3, stride=2, padding=1), nn.BatchNorm2d(64), nn.ReLU(),
            nn.Conv2d(64, 128, 3, stride=2, padding=1), nn.BatchNorm2d(128), nn.ReLU(),
            nn.Dropout(0.2),
        )
        with torch.no_grad():
            dummy = torch.zeros(1, 1, n_mels, fixed_frames)
            enc_out = self.enc_conv(dummy)
            self._enc_shape = enc_out.shape[1:]
            flat_dim = int(np.prod(self._enc_shape))

        self.fc_enc = nn.Linear(flat_dim, latent_dim)
        self.fc_dec = nn.Linear(latent_dim, flat_dim)

        self.dec_conv = nn.Sequential(
            nn.ConvTranspose2d(128, 64, 3, stride=2, padding=1, output_padding=1), nn.BatchNorm2d(64), nn.ReLU(),
            nn.ConvTranspose2d(64, 32, 3, stride=2, padding=1, output_padding=1), nn.BatchNorm2d(32), nn.ReLU(),
            nn.ConvTranspose2d(32, 16, 3, stride=2, padding=1, output_padding=1), nn.BatchNorm2d(16), nn.ReLU(),
            nn.ConvTranspose2d(16, 1, 3, stride=2, padding=1, output_padding=1),
        )

    def forward(self, x):
        z = self.enc_conv(x)
        b = z.shape[0]
        latent = self.fc_enc(z.reshape(b, -1))
        z_rec = self.fc_dec(latent).reshape(b, *self._enc_shape)
        out = self.dec_conv(z_rec)
        out = F.interpolate(out, size=x.shape[-2:], mode="bilinear", align_corners=False)
        return out


def build_model(arch_name, cfg):
    """Instantiate an (untrained) model matching `arch_name` from manifest.json."""
    if arch_name == "conv_ae_v1":
        return ConvAutoencoderV1()
    if arch_name == "conv_ae_v2":
        return ConvAutoencoderV2(n_mels=cfg["n_mels"], fixed_frames=cfg["fixed_frames"])
    raise ValueError(f"Unknown architecture: {arch_name}")
