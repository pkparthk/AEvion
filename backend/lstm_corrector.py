"""
lstm_corrector.py  â€”  TensorFlow/Keras implementation
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Bidirectional LSTM + MLP head that learns the residual between the EVPM
physics-model energy estimate and real-world measured consumption.

Architecture
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Input  : (batch, seq_len, 4)   features per road edge
           [evpm_energy_wh, distance_m, speed_kmph, slope]
Body   : N Ã— Bidirectional LSTM  â†’  MLP (Dense â†’ LayerNorm â†’ Swish â†’ Dropout)
Output : (batch, seq_len)        correction delta in Wh per edge

The final Dense layer is zero-initialised so an untrained model is an
identity map (delta â‰ˆ 0, corrected â‰ˆ EVPM baseline).

Persistence
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  weights  â†’  <model_path>.weights.h5
  metadata â†’  <model_path>.meta.json   (norm stats + loss history)

Toggle
â”€â”€â”€â”€â”€â”€
  corrector.set_enabled(False)  â†’  bypass; pipeline uses raw EVPM values
  corrector.set_enabled(True)   â†’  LSTM correction applied
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")   # suppress TF C++ info
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

logger = logging.getLogger(__name__)

INPUT_FEATURES = 4


# â”€â”€â”€ Model factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _build_model(
    hidden_size: int = 64,
    num_layers:  int = 2,
    dropout:     float = 0.2,
) -> keras.Model:
    """
    Keras functional-API model.

    Stack of Bidirectional-LSTM layers followed by a dense correction head.
    Each LSTM returns full sequences so every edge gets its own correction.
    """
    inp = keras.Input(shape=(None, INPUT_FEATURES), name="edge_features")
    x = inp

    for i in range(num_layers):
        x = layers.Bidirectional(
            layers.LSTM(
                hidden_size,
                return_sequences=True,
                dropout=dropout,
                recurrent_dropout=0.0,
            ),
            name=f"bi_lstm_{i}",
        )(x)

    # MLP correction head
    x = layers.Dense(hidden_size, name="mlp_dense1")(x)
    x = layers.LayerNormalization(name="mlp_ln1")(x)
    x = layers.Activation("swish", name="mlp_act1")(x)
    x = layers.Dropout(dropout, name="mlp_drop")(x)
    x = layers.Dense(hidden_size // 2, name="mlp_dense2")(x)
    x = layers.LayerNormalization(name="mlp_ln2")(x)
    x = layers.Activation("swish", name="mlp_act2")(x)
    x = layers.Dense(
        1,
        kernel_initializer=keras.initializers.RandomUniform(-0.01, 0.01),
        bias_initializer="zeros",
        name="output",
    )(x)

    # Squeeze last dim: (batch, seq_len, 1) â†’ (batch, seq_len)
    out = layers.Lambda(lambda t: tf.squeeze(t, axis=-1), name="squeeze")(x)

    return keras.Model(inputs=inp, outputs=out, name="ev_lstm_corrector")


# â”€â”€â”€ Masked MSE loss â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _masked_mse(y_true: tf.Tensor, y_pred: tf.Tensor, mask: tf.Tensor) -> tf.Tensor:
    """MSE computed only over non-padded positions."""
    sq = tf.square(y_pred - y_true)
    return tf.reduce_sum(sq * mask) / (tf.reduce_sum(mask) + 1e-8)


# â”€â”€â”€ Public corrector class â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class AdvancedLSTMCorrector:
    """
    Wraps the Keras model with feature extraction, normalisation, inference,
    online training, and persistence helpers.

    Parameters
    ----------
    enabled       : bool   â€” whether to apply LSTM correction (toggle switch)
    hidden_size   : int    â€” LSTM hidden units per direction
    num_layers    : int    â€” number of stacked Bidirectional LSTM layers
    learning_rate : float  â€” AdamW learning rate
    weight_decay  : float  â€” AdamW L2 penalty
    model_path    : str    â€” base path; weights saved to <path>.weights.h5
                            and metadata to <path>.meta.json
    """

    def __init__(
        self,
        enabled:       bool  = True,
        hidden_size:   int   = 64,
        num_layers:    int   = 2,
        learning_rate: float = 1e-3,
        weight_decay:  float = 1e-5,
        model_path:    str   = "lstm_weights.pt",
    ) -> None:
        self.enabled    = enabled
        self.model_path = model_path

        self._weights_path = model_path + ".weights.h5"
        self._meta_path    = model_path + ".meta.json"

        self.model = _build_model(hidden_size, num_layers)

        # AdamW (TF >= 2.11); fall back to Adam for older installs
        try:
            self.optimizer = keras.optimizers.AdamW(
                learning_rate=learning_rate,
                weight_decay=weight_decay,
            )
        except AttributeError:
            self.optimizer = keras.optimizers.Adam(learning_rate=learning_rate)

        # ReduceLROnPlateau state
        self._lr_patience = 5
        self._lr_factor   = 0.5
        self._lr_min      = 1e-6
        self._no_improve  = 0
        self._best_loss   = float("inf")

        # Running normalisation stats (updated from training data)
        self._norm_mean = np.array([100.0, 200.0, 45.0, 0.02], dtype=np.float32)
        self._norm_std  = np.array([ 80.0, 150.0, 15.0, 0.05], dtype=np.float32)

        self._training_history: List[float] = []

        if os.path.exists(self._weights_path):
            self.load()

    # â”€â”€â”€ Toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def set_enabled(self, state: bool) -> None:
        self.enabled = state
        logger.info("AdvancedLSTMCorrector %s", "ENABLED" if state else "DISABLED")

    def is_enabled(self) -> bool:
        return self.enabled

    # â”€â”€â”€ Feature extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def extract_features(self, G, route: List[str], evpm) -> np.ndarray:
        seq = []
        for i in range(len(route) - 1):
            u, v = route[i], route[i + 1]
            edge   = G[u][v]
            dist_m = float(edge.get("distance", 0.0))
            speed  = float(edge.get("speed", 40.0))
            slope  = float(edge.get("slope", 0.0))
            evpm_wh = evpm.energy_for_edge(dist_m, speed)
            seq.append([evpm_wh, dist_m, speed, slope])
        return np.array(seq, dtype=np.float32)   # (seq_len, 4)

    def _normalize(self, features: np.ndarray) -> np.ndarray:
        return (features - self._norm_mean) / (self._norm_std + 1e-8)

    def _update_norm_stats(self, all_features: List[np.ndarray]) -> None:
        stacked = np.vstack(all_features)
        self._norm_mean = stacked.mean(axis=0).astype(np.float32)
        self._norm_std  = (stacked.std(axis=0) + 1e-8).astype(np.float32)
        logger.debug("Norm stats updated  mean=%s  std=%s",
                     self._norm_mean, self._norm_std)

    # â”€â”€â”€ Inference â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def correct_route(self, G, route: List[str], evpm) -> List[float]:
        """
        Return corrected energy (kWh) per edge for *route*.

        When disabled â†’ EVPM baseline converted to kWh, no correction.
        When enabled  â†’ adds LSTM-predicted correction delta, clamped >= 0.
        """
        if len(route) < 2:
            return []

        baseline_wh: List[float] = []
        for i in range(len(route) - 1):
            u, v = route[i], route[i + 1]
            dist  = float(G[u][v].get("distance", 0.0))
            speed = float(G[u][v].get("speed", 40.0))
            baseline_wh.append(evpm.energy_for_edge(dist, speed))

        if not self.enabled:
            return [e / 1000.0 for e in baseline_wh]

        raw  = self.extract_features(G, route, evpm)   # (seq_len, 4)
        norm = self._normalize(raw)                     # (seq_len, 4)
        x    = norm[np.newaxis, ...]                    # (1, seq_len, 4)

        delta_wh = self.model(x, training=False).numpy().squeeze(0)  # (seq_len,)

        corrected_wh = np.array(baseline_wh) + delta_wh
        corrected_wh = np.maximum(corrected_wh, 0.0)

        return (corrected_wh / 1000.0).tolist()

    # â”€â”€â”€ Training â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @tf.function(reduce_retracing=True)
    def _train_step(
        self,
        x:    tf.Tensor,
        y:    tf.Tensor,
        mask: tf.Tensor,
    ) -> tf.Tensor:
        with tf.GradientTape() as tape:
            pred = self.model(x, training=True)
            loss = _masked_mse(y, pred, mask)
        grads = tape.gradient(loss, self.model.trainable_variables)
        grads, _ = tf.clip_by_global_norm(grads, 1.0)
        self.optimizer.apply_gradients(
            zip(grads, self.model.trainable_variables)
        )
        return loss

    def train_on_data(
        self,
        route_features:   List[np.ndarray],
        real_energies_wh: List[np.ndarray],
        epochs:     int  = 30,
        batch_size: int  = 16,
        verbose:    bool = False,
    ) -> Dict[str, Any]:
        """
        Train the model on a batch of real-world measurement data.

        The model learns residuals: delta = real_wh - evpm_wh.
        Feature column 0 of *route_features* must be evpm_wh per edge.

        Parameters
        ----------
        route_features   : raw (unnormalised) feature arrays, one per route
        real_energies_wh : measured real energy (Wh) per edge, per route
        epochs           : training epochs
        batch_size       : mini-batch size
        verbose          : print per-epoch loss to stdout

        Returns
        -------
        {"loss_history": [...], "epochs_trained": int}
        """
        assert len(route_features) == len(real_energies_wh)

        self._update_norm_stats(route_features)
        norm_features = [self._normalize(f) for f in route_features]
        delta_targets = [
            real_wh - feat[:, 0]
            for feat, real_wh in zip(route_features, real_energies_wh)
        ]

        loss_history: List[float] = []
        n = len(norm_features)

        for epoch in range(1, epochs + 1):
            indices    = np.random.permutation(n)
            epoch_loss = 0.0
            num_batches = 0

            for start in range(0, n, batch_size):
                batch_idx   = indices[start: start + batch_size]
                batch_feats = [norm_features[i] for i in batch_idx]
                batch_delts = [delta_targets[i]  for i in batch_idx]

                max_len  = max(f.shape[0] for f in batch_feats)
                padded_x = np.zeros((len(batch_feats), max_len, INPUT_FEATURES),
                                    dtype=np.float32)
                padded_y = np.zeros((len(batch_feats), max_len), dtype=np.float32)
                mask     = np.zeros((len(batch_feats), max_len), dtype=np.float32)

                for j, (f, d) in enumerate(zip(batch_feats, batch_delts)):
                    seq_len = f.shape[0]
                    padded_x[j, :seq_len] = f
                    padded_y[j, :seq_len] = d
                    mask[j, :seq_len]     = 1.0

                loss = self._train_step(
                    tf.constant(padded_x),
                    tf.constant(padded_y),
                    tf.constant(mask),
                ).numpy()

                epoch_loss  += float(loss)
                num_batches += 1

            avg = epoch_loss / max(num_batches, 1)
            loss_history.append(round(avg, 6))
            self._training_history.append(avg)

            # ReduceLROnPlateau logic
            if avg < self._best_loss - 1e-7:
                self._best_loss  = avg
                self._no_improve = 0
            else:
                self._no_improve += 1
                if self._no_improve >= self._lr_patience:
                    old_lr = float(self.optimizer.learning_rate)
                    new_lr = max(old_lr * self._lr_factor, self._lr_min)
                    self.optimizer.learning_rate.assign(new_lr)
                    self._no_improve = 0
                    logger.debug("LR reduced  %.2e â†’ %.2e", old_lr, new_lr)

            if verbose:
                logger.debug("Epoch %d/%d  loss=%.6f", epoch, epochs, avg)

        self.save()
        return {"loss_history": loss_history, "epochs_trained": epochs}

    # â”€â”€â”€ Persistence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def save(self, path: Optional[str] = None) -> None:
        """Save model weights and metadata (norm stats, history) to disk."""
        w_path = (path or self.model_path) + ".weights.h5"
        m_path = (path or self.model_path) + ".meta.json"

        self.model.save_weights(w_path)

        meta = {
            "norm_mean": self._norm_mean.tolist(),
            "norm_std":  self._norm_std.tolist(),
            "history":   self._training_history,
        }
        with open(m_path, "w") as f:
            json.dump(meta, f)

        logger.info("AdvancedLSTMCorrector saved to %s", w_path)

    def load(self, path: Optional[str] = None) -> bool:
        """Load model weights and metadata from disk. Returns True on success."""
        w_path = (path or self.model_path) + ".weights.h5"
        m_path = (path or self.model_path) + ".meta.json"

        if not os.path.exists(w_path):
            return False

        try:
            # Initialise graph with a dummy pass before loading weights
            dummy = np.zeros((1, 1, INPUT_FEATURES), dtype=np.float32)
            self.model(dummy, training=False)
            self.model.load_weights(w_path)

            if os.path.exists(m_path):
                with open(m_path) as f:
                    meta = json.load(f)
                self._norm_mean        = np.array(meta["norm_mean"], dtype=np.float32)
                self._norm_std         = np.array(meta["norm_std"],  dtype=np.float32)
                self._training_history = meta.get("history", [])

            logger.info("AdvancedLSTMCorrector loaded from %s", w_path)
            return True
        except Exception as exc:
            logger.warning("AdvancedLSTMCorrector: failed to load â€” %s", exc)
            return False

    # â”€â”€â”€ Status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def status(self) -> Dict[str, Any]:
        """Return a JSON-serialisable status dict for /lstm/status."""
        return {
            "enabled":        self.enabled,
            "model_path":     self.model_path,
            "weights_saved":  os.path.exists(self._weights_path),
            "training_steps": len(self._training_history),
            "last_loss":      round(self._training_history[-1], 6)
                              if self._training_history else None,
            "backend":        "tensorflow",
            "tf_version":     tf.__version__,
            "norm_mean":      self._norm_mean.tolist(),
            "norm_std":       self._norm_std.tolist(),
        }


# Alias so main.py and train_lstm.py can import either name
LSTMCorrector = AdvancedLSTMCorrector

