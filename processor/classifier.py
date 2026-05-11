"""Multi-label tag classifier.

Trained on auto-labels produced by ``processor.labeling`` over the raw
scraper corpus (``data_raw/*.json``). Pipeline:

    TfidfVectorizer  →  OneVsRestClassifier(LogisticRegression)

At inference, ``Classifier.predict_tags(record)`` returns 2 to 4 category
tags chosen via top-K probability with a confidence floor. The location
tag is appended later by ``processor.enrich.generate_tags`` — the
classifier itself does not know about location.

Selection algorithm:
1. Take all tags with ``p >= HIGH_THRESHOLD`` (default 0.5), capped at 4.
2. If fewer than 2 hit the threshold, backfill with next-highest-probability
   tags until we have 2.
3. Cap result at 4 to leave room for the location tag.

The classifier is persisted as a single joblib payload that bundles the
vectorizer, the model, the tag vocabulary, and a version hash. The loader
rejects payloads whose version doesn't match the current rule set so a
stale model file is never silently used.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from processor.labeling import feature_text, label_record
from processor.normalize import normalize_record
from processor.tag_vocab import TAG_VOCAB, version_hash

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_DIR = Path(__file__).resolve().parent / "models"
DEFAULT_MODEL_PATH = DEFAULT_MODEL_DIR / "tag_classifier.joblib"

HIGH_THRESHOLD = 0.5
MIN_CATEGORY_TAGS = 2
MAX_CATEGORY_TAGS = 4


@dataclass
class TrainStats:
    n_train_docs: int
    tag_distribution: dict[str, int]
    untagged_docs: int


# ---------------------------------------------------------------------------
# Classifier wrapper
# ---------------------------------------------------------------------------

class Classifier:
    """Wraps a fitted sklearn pipeline plus its training metadata."""

    def __init__(
        self,
        vectorizer,
        model,
        tag_vocab: tuple[str, ...],
        version: str,
        trained_at: str,
        n_train_docs: int,
    ) -> None:
        self.vectorizer = vectorizer
        self.model = model
        self.tag_vocab = tag_vocab
        self.version = version
        self.trained_at = trained_at
        self.n_train_docs = n_train_docs

    # -- prediction ---------------------------------------------------------

    def predict_tags(self, rfp: dict[str, Any]) -> list[str]:
        """Return 2–4 category tags for *rfp* (no location)."""
        text = feature_text(rfp)
        if not text.strip():
            return list(self.tag_vocab[:MIN_CATEGORY_TAGS])

        x = self.vectorizer.transform([text])
        probs = self.model.predict_proba(x)[0]
        ranked = sorted(
            zip(self.tag_vocab, probs),
            key=lambda pair: pair[1],
            reverse=True,
        )

        # 1. confident picks above the threshold
        chosen: list[str] = [tag for tag, p in ranked if p >= HIGH_THRESHOLD]
        chosen = chosen[:MAX_CATEGORY_TAGS]

        # 2. backfill if we're below the floor
        if len(chosen) < MIN_CATEGORY_TAGS:
            for tag, _ in ranked:
                if tag not in chosen:
                    chosen.append(tag)
                if len(chosen) >= MIN_CATEGORY_TAGS:
                    break

        return chosen[:MAX_CATEGORY_TAGS]

    # -- persistence --------------------------------------------------------

    def save(self, path: os.PathLike[str] | str) -> None:
        import joblib  # type: ignore[import-not-found]

        out = Path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "vectorizer": self.vectorizer,
                "model": self.model,
                "tag_vocab": list(self.tag_vocab),
                "version": self.version,
                "trained_at": self.trained_at,
                "n_train_docs": self.n_train_docs,
            },
            out,
        )


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def _read_raw_records(input_dir: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for src in sorted(input_dir.glob("*.json")):
        with src.open("r", encoding="utf-8") as fh:
            records.append(json.load(fh))
    return records


def train_from_directory(
    input_dir: os.PathLike[str] | str,
    output_path: os.PathLike[str] | str = DEFAULT_MODEL_PATH,
) -> tuple[Classifier, TrainStats]:
    """Train the classifier from raw JSON in *input_dir* and persist it."""
    from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore[import-not-found]
    from sklearn.linear_model import LogisticRegression  # type: ignore[import-not-found]
    from sklearn.multiclass import OneVsRestClassifier  # type: ignore[import-not-found]

    in_path = Path(input_dir)
    if not in_path.is_dir():
        raise FileNotFoundError(f"Input directory does not exist: {in_path}")

    raws = _read_raw_records(in_path)
    if not raws:
        raise RuntimeError(
            f"No raw JSON files found in {in_path} — cannot train a classifier."
        )

    # Normalize before featurizing so the model trains on the same text shape
    # it'll see at inference (clean description, canonical dept name, etc.).
    normalized = [normalize_record(r) for r in raws]
    texts = [feature_text(r) for r in normalized]

    # Multi-label target: one binary column per tag in TAG_VOCAB.
    label_sets = [label_record(r) for r in normalized]
    untagged = sum(1 for s in label_sets if not s)
    y = [
        [1 if tag in labels else 0 for tag in TAG_VOCAB]
        for labels in label_sets
    ]

    # Tag distribution for diagnostics.
    distribution: dict[str, int] = {tag: 0 for tag in TAG_VOCAB}
    for labels in label_sets:
        for tag in labels:
            distribution[tag] += 1

    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=1,
        max_df=0.95,
        lowercase=True,
        stop_words="english",
        sublinear_tf=True,
    )
    x = vectorizer.fit_transform(texts)

    base = LogisticRegression(
        solver="liblinear",
        class_weight="balanced",
        max_iter=1000,
    )
    model = OneVsRestClassifier(base)
    model.fit(x, y)

    classifier = Classifier(
        vectorizer=vectorizer,
        model=model,
        tag_vocab=TAG_VOCAB,
        version=version_hash(),
        trained_at=_dt.datetime.utcnow().isoformat() + "Z",
        n_train_docs=len(raws),
    )
    classifier.save(output_path)

    stats = TrainStats(
        n_train_docs=len(raws),
        tag_distribution=distribution,
        untagged_docs=untagged,
    )
    return classifier, stats


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

class StaleModelError(RuntimeError):
    """The persisted model's version hash no longer matches the current rules."""


def load_classifier(
    path: os.PathLike[str] | str = DEFAULT_MODEL_PATH,
) -> Classifier:
    """Load a persisted classifier; raises ``StaleModelError`` on version mismatch."""
    import joblib  # type: ignore[import-not-found]

    payload = joblib.load(Path(path))
    persisted_version = payload.get("version")
    if persisted_version != version_hash():
        raise StaleModelError(
            f"Persisted classifier version {persisted_version!r} does not match "
            f"current rule set {version_hash()!r}; retrain required."
        )
    persisted_vocab = tuple(payload.get("tag_vocab") or ())
    if persisted_vocab != TAG_VOCAB:
        raise StaleModelError(
            "Persisted classifier tag_vocab differs from current TAG_VOCAB; "
            "retrain required."
        )
    return Classifier(
        vectorizer=payload["vectorizer"],
        model=payload["model"],
        tag_vocab=persisted_vocab,
        version=persisted_version,
        trained_at=payload.get("trained_at", ""),
        n_train_docs=int(payload.get("n_train_docs", 0)),
    )


def load_or_train(
    raw_dir: os.PathLike[str] | str,
    model_path: os.PathLike[str] | str = DEFAULT_MODEL_PATH,
) -> Classifier:
    """Load the persisted classifier, or train+persist a fresh one if the
    artifact is missing or stale."""
    p = Path(model_path)
    if p.is_file():
        try:
            return load_classifier(p)
        except StaleModelError:
            pass  # fall through to retrain
    classifier, _stats = train_from_directory(raw_dir, p)
    return classifier
