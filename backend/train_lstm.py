"""
train_lstm.py
──────────────────────────────────────────────────────────────────────────────
Standalone CLI script for training the LSTMCorrector model offline, using a
labelled dataset of real-world edge energy measurements.

No FastAPI, no graph, no EVPM object needed — just a dataset file and this
script.

Supported dataset formats
─────────────────────────
1. CSV  (default)
   One row per road edge.  Required columns:

       route_id        – string/int that groups consecutive edges into a route
       evpm_energy_wh  – EVPM physics estimate for this edge (Wh)
       distance_m      – edge length (m)
       speed_kmph      – speed limit (km/h)
       slope           – road grade fraction (e.g. 0.05 = 5 %)
       real_energy_wh  – measured real-world energy consumed (Wh)

   Rows that share the same route_id form one training sequence.
   Rows must be ordered correctly within each route.

2. JSON
   Matches the /lstm/train API body exactly:

       {
         "routes": [
           {
             "edges": [
               {"evpm_energy_wh": 48.2, "distance_m": 120.0,
                "speed_kmph": 50, "slope": 0.01}
             ],
             "real_energies_wh": [52.5]
           }
         ]
       }

Usage examples
──────────────
# Basic — CSV dataset, defaults
python train_lstm.py --data training_data.csv

# JSON dataset, custom hyperparams
python train_lstm.py --data training_data.json --format json \\
    --epochs 50 --batch-size 16 --hidden-size 64 --num-layers 3

# Resume training on an existing checkpoint
python train_lstm.py --data training_data.csv --model-path lstm_weights.pt

# Save to a different path
python train_lstm.py --data training_data.csv --model-path models/v2.pt

# Dry-run: inspect dataset without training
python train_lstm.py --data training_data.csv --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import List, Tuple

import numpy as np

# ─── Make sure the backend directory is on sys.path ───────────────────────────
sys.path.insert(0, str(Path(__file__).parent))

from lstm_corrector import LSTMCorrector

import tensorflow as tf

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("train_lstm")


# ─── Dataset loaders ──────────────────────────────────────────────────────────

def load_csv(path: str) -> Tuple[List[np.ndarray], List[np.ndarray]]:
    """
    Load a CSV file and return (route_features, real_energies_wh).

    Required columns: route_id, evpm_energy_wh, distance_m, speed_kmph,
                      slope, real_energy_wh
    """
    try:
        import csv
    except ImportError:
        raise RuntimeError("csv module not available")

    REQUIRED = {"route_id", "evpm_energy_wh", "distance_m", "speed_kmph",
                "slope", "real_energy_wh"}

    rows_by_route: dict = {}

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise ValueError(f"CSV file '{path}' appears to be empty")

        missing = REQUIRED - set(reader.fieldnames)
        if missing:
            raise ValueError(
                f"CSV is missing required columns: {sorted(missing)}\n"
                f"  Found: {reader.fieldnames}"
            )

        for line_num, row in enumerate(reader, start=2):
            rid = row["route_id"].strip()
            try:
                feat = [
                    float(row["evpm_energy_wh"]),
                    float(row["distance_m"]),
                    float(row["speed_kmph"]),
                    float(row["slope"]),
                ]
                real = float(row["real_energy_wh"])
            except (ValueError, KeyError) as exc:
                raise ValueError(f"CSV line {line_num}: {exc}") from exc

            if rid not in rows_by_route:
                rows_by_route[rid] = {"feats": [], "reals": []}
            rows_by_route[rid]["feats"].append(feat)
            rows_by_route[rid]["reals"].append(real)

    if not rows_by_route:
        raise ValueError("CSV file loaded 0 rows")

    route_features: List[np.ndarray] = []
    real_energies:  List[np.ndarray] = []

    for rid, data in rows_by_route.items():
        route_features.append(np.array(data["feats"], dtype=np.float32))
        real_energies.append(np.array(data["reals"], dtype=np.float32))

    return route_features, real_energies


def load_json(path: str) -> Tuple[List[np.ndarray], List[np.ndarray]]:
    """
    Load a JSON file in /lstm/train API body format and return
    (route_features, real_energies_wh).
    """
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    if "routes" not in data:
        raise ValueError("JSON must have a top-level 'routes' key")

    route_features: List[np.ndarray] = []
    real_energies:  List[np.ndarray] = []

    EDGE_KEYS = {"evpm_energy_wh", "distance_m", "speed_kmph", "slope"}

    for idx, entry in enumerate(data["routes"]):
        if "edges" not in entry or "real_energies_wh" not in entry:
            raise ValueError(
                f"Route {idx}: must have 'edges' and 'real_energies_wh'"
            )
        edges = entry["edges"]
        reals = entry["real_energies_wh"]

        if len(edges) != len(reals):
            raise ValueError(
                f"Route {idx}: edges length ({len(edges)}) != "
                f"real_energies_wh length ({len(reals)})"
            )

        missing_keys = EDGE_KEYS - set(edges[0].keys()) if edges else set()
        if missing_keys:
            raise ValueError(
                f"Route {idx}, edge 0 is missing keys: {sorted(missing_keys)}"
            )

        feat = np.array(
            [[e["evpm_energy_wh"], e["distance_m"], e["speed_kmph"], e["slope"]]
             for e in edges],
            dtype=np.float32,
        )
        real = np.array(reals, dtype=np.float32)
        route_features.append(feat)
        real_energies.append(real)

    return route_features, real_energies


# ─── Dataset summary ──────────────────────────────────────────────────────────

def print_dataset_summary(
    route_features: List[np.ndarray],
    real_energies:  List[np.ndarray],
) -> None:
    total_edges = sum(f.shape[0] for f in route_features)
    all_feat    = np.vstack(route_features)
    all_real    = np.concatenate(real_energies)
    all_evpm    = all_feat[:, 0]
    delta       = all_real - all_evpm

    print("\n" + "─" * 60)
    print("  Dataset summary")
    print("─" * 60)
    print(f"  Routes (sequences)  : {len(route_features)}")
    print(f"  Total edges         : {total_edges}")
    edge_lens = [f.shape[0] for f in route_features]
    print(f"  Edges per route     : min={min(edge_lens)}  max={max(edge_lens)}  "
          f"avg={sum(edge_lens)/len(edge_lens):.1f}")
    print()
    print("  Feature stats (raw, before normalisation):")
    labels = ["evpm_energy_wh", "distance_m    ", "speed_kmph    ", "slope         "]
    for i, lbl in enumerate(labels):
        col = all_feat[:, i]
        print(f"    {lbl}  mean={col.mean():9.3f}  std={col.std():8.3f}  "
              f"min={col.min():9.3f}  max={col.max():9.3f}")
    print()
    print(f"  Real energy (Wh)    : mean={all_real.mean():.3f}  "
          f"std={all_real.std():.3f}")
    print(f"  EVPM energy (Wh)    : mean={all_evpm.mean():.3f}  "
          f"std={all_evpm.std():.3f}")
    print(f"  Delta=real−evpm (Wh): mean={delta.mean():+.3f}  "
          f"std={delta.std():.3f}  "
          f"min={delta.min():+.3f}  max={delta.max():+.3f}")
    print("─" * 60 + "\n")


# ─── Training loop with progress printing ─────────────────────────────────────

class _VerboseCorrector(LSTMCorrector):
    """Thin subclass that prints a live progress bar to stdout each epoch."""

    def train_on_data(self, route_features, real_energies_wh,
                      epochs=20, batch_size=8):

        self._update_norm_stats(route_features)
        norm_features = [self._normalize(f) for f in route_features]
        delta_targets = [
            real_wh - feat[:, 0]
            for feat, real_wh in zip(route_features, real_energies_wh)
        ]

        INPUT_FEATURES = 4
        loss_history = []
        n = len(norm_features)

        start_time = time.time()
        print(f"\n  Training  epochs={epochs}  batch_size={batch_size}  "
              f"routes={n}")
        print("  " + "─" * 56)

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

            # ReduceLROnPlateau
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

            bar_len = 30
            filled  = int(bar_len * epoch / epochs)
            bar     = "█" * filled + "░" * (bar_len - filled)
            elapsed = time.time() - start_time
            print(f"  Epoch {epoch:>4}/{epochs}  [{bar}]  "
                  f"loss={avg:.6f}  elapsed={elapsed:.1f}s",
                  end="\r" if epoch < epochs else "\n")

        self.save()
        return {"loss_history": loss_history, "epochs_trained": epochs}


# ─── CLI ──────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="train_lstm",
        description="Train the EVPM LSTM error-correction model offline.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Usage examples")[1] if "Usage examples" in __doc__ else "",
    )

    # I/O
    p.add_argument("--data",       required=True,
                   help="Path to training dataset (CSV or JSON)")
    p.add_argument("--format",     choices=["csv", "json"], default=None,
                   help="Dataset format. Auto-detected from extension if omitted.")
    p.add_argument("--model-path", default="lstm_weights.pt",
                   help="Path to save/load model weights  (default: lstm_weights.pt)")

    # Hyperparameters
    p.add_argument("--epochs",      type=int,   default=30,
                   help="Training epochs  (default: 30)")
    p.add_argument("--batch-size",  type=int,   default=8,
                   help="Mini-batch size  (default: 8)")
    p.add_argument("--hidden-size", type=int,   default=32,
                   help="LSTM hidden units  (default: 32)")
    p.add_argument("--num-layers",  type=int,   default=2,
                   help="Stacked LSTM layers  (default: 2)")
    p.add_argument("--lr",          type=float, default=1e-3,
                   help="Adam learning rate  (default: 0.001)")

    # Flags
    p.add_argument("--dry-run", action="store_true",
                   help="Load and inspect the dataset, then exit without training")
    p.add_argument("--no-resume", action="store_true",
                   help="Ignore existing weights; always start from scratch")
    p.add_argument("--verbose", "-v", action="store_true",
                   help="Verbose logging")

    return p


def main() -> None:
    args = build_parser().parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # ── Dataset format auto-detection ────────────────────────────────────────
    fmt = args.format
    if fmt is None:
        ext = Path(args.data).suffix.lower()
        if ext == ".csv":
            fmt = "csv"
        elif ext in (".json", ".jsonl"):
            fmt = "json"
        else:
            log.error(
                "Cannot auto-detect format from extension '%s'. "
                "Use --format csv or --format json.", ext
            )
            sys.exit(1)

    # ── Load ─────────────────────────────────────────────────────────────────
    log.info("Loading dataset: %s  (format=%s)", args.data, fmt)
    if not os.path.exists(args.data):
        log.error("Dataset file not found: %s", args.data)
        sys.exit(1)

    try:
        if fmt == "csv":
            route_features, real_energies = load_csv(args.data)
        else:
            route_features, real_energies = load_json(args.data)
    except Exception as exc:
        log.error("Failed to load dataset: %s", exc)
        sys.exit(1)

    log.info("Loaded %d routes", len(route_features))

    # ── Summary ──────────────────────────────────────────────────────────────
    print_dataset_summary(route_features, real_energies)

    if args.dry_run:
        print("  [dry-run] Exiting without training.")
        return

    # ── Build corrector ───────────────────────────────────────────────────────
    model_path = args.model_path
    resume     = os.path.exists(model_path) and not args.no_resume

    corrector = _VerboseCorrector(
        enabled     = True,
        hidden_size = args.hidden_size,
        num_layers  = args.num_layers,
        learning_rate = args.lr,
        model_path  = model_path,
    )

    if resume:
        log.info("Resuming from existing checkpoint: %s", model_path)
    else:
        if args.no_resume:
            log.info("--no-resume set; starting from scratch")
        else:
            log.info("No existing checkpoint found; starting from scratch")

    # ── Training ─────────────────────────────────────────────────────────────
    print(f"  Model       : hidden_size={args.hidden_size}  "
          f"num_layers={args.num_layers}  lr={args.lr}")
    print(f"  Weights     : {model_path}  (resume={resume})")

    result = corrector.train_on_data(
        route_features,
        real_energies,
        epochs     = args.epochs,
        batch_size = args.batch_size,
    )

    # ── Results ───────────────────────────────────────────────────────────────
    history = result["loss_history"]
    first   = history[0]  if history else float("nan")
    last    = history[-1] if history else float("nan")
    best    = min(history) if history else float("nan")

    print()
    print("─" * 60)
    print("  Training complete")
    print("─" * 60)
    print(f"  Epochs trained   : {result['epochs_trained']}")
    print(f"  Loss  first      : {first:.6f}")
    print(f"  Loss  final      : {last:.6f}")
    print(f"  Loss  best       : {best:.6f}")
    print(f"  Improvement      : {(first - last):+.6f}")
    print(f"  Weights saved to : {model_path}")
    print("─" * 60)


if __name__ == "__main__":
    main()
