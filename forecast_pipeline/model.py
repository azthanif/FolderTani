"""Memuat LSTM final (.keras + metadata JSON) dan menghasilkan prakiraan Δ(t+1..t+7)."""
from __future__ import annotations

import json
import os
from functools import lru_cache

import numpy as np

from .config import ARTIFACTS


class LSTMModel:
    def __init__(self, kab: str):
        os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
        from tensorflow import keras

        k = kab.lower()
        self.meta = json.loads((ARTIFACTS / f"lstm_{k}.json").read_text())
        self.model = keras.models.load_model(ARTIFACTS / f"lstm_{k}.keras", compile=False)
        self.lookback = int(self.meta["lookback"])
        self.horizon = int(self.meta["horizon"])
        self.version = self.meta["model_version"]
        self._xm = np.asarray(self.meta["x_scaler_mean"], dtype=np.float64)
        self._xs = np.asarray(self.meta["x_scaler_std"], dtype=np.float64)
        self._ym = np.asarray(self.meta["y_mean"], dtype=np.float64)
        self._ys = np.asarray(self.meta["y_std"], dtype=np.float64)

    def predict_delta(self, X: np.ndarray) -> np.ndarray:
        """X: (1, lookback, F) mentah -> Δ harga (horizon,) dalam Rp/kg."""
        Xs = ((X - self._xm) / self._xs).astype(np.float32)
        p = self.model.predict(Xs, verbose=0)[0]
        return p * self._ys + self._ym


@lru_cache(maxsize=4)
def load(kab: str) -> LSTMModel:
    return LSTMModel(kab)
