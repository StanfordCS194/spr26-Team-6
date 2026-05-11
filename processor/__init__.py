"""Data processing layer.

Reads raw scraper JSON files from `data_raw/`, normalizes/standardizes them,
adds derived fields (name, statement_of_work, deliverables, location_level,
location, tags), and writes one JSON per RFP to `data_processed/`.

Tags come from a trained multi-label classifier (`processor.classifier`)
that is retrained from the raw corpus whenever the persisted artifact is
missing or its version hash falls out of sync with the current rules.

A separate scaffolding module (`processor.ingest_supabase`) ingests the
processed files into the Supabase `rfps` table.
"""

from processor.pipeline import process_one, process_directory  # noqa: F401
