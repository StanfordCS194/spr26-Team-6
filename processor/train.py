"""CLI entry point: ``python -m processor.train``.

Trains the tag classifier on every JSON file in ``data_raw/`` and writes
the artifact to ``processor/models/tag_classifier.joblib``.

Examples:
    python -m processor.train
    python -m processor.train --input data_raw --output processor/models/tag_classifier.joblib
"""

from __future__ import annotations

import argparse
from pathlib import Path

from processor.classifier import (
    DEFAULT_MODEL_PATH,
    train_from_directory,
)
from processor.pipeline import DEFAULT_INPUT_DIR


def main() -> int:
    parser = argparse.ArgumentParser(prog="processor.train")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_MODEL_PATH)
    args = parser.parse_args()

    classifier, stats = train_from_directory(args.input, args.output)

    print(f"Trained on {stats.n_train_docs} document(s).")
    print(f"Model written to {args.output}")
    print(f"Version hash: {classifier.version}")
    if stats.untagged_docs:
        print(f"Warning: {stats.untagged_docs} doc(s) had no labels at training time.")

    print("Tag distribution (label_record):")
    nonzero = sorted(
        ((tag, n) for tag, n in stats.tag_distribution.items() if n > 0),
        key=lambda pair: (-pair[1], pair[0]),
    )
    for tag, n in nonzero:
        print(f"  {tag:24s} {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
