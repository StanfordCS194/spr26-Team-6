"""Data processing layer.

Reads raw scraper JSON files from `data_raw/`, normalizes/standardizes them,
adds derived fields (name, statement_of_work, deliverables, location_level,
tags), and writes one JSON per RFP to `processed_data/`.

A separate scaffolding module (`processor.ingest_supabase`) ingests the
processed files into the Supabase `rfps` table.
"""

from processor.pipeline import process_one, process_directory  # noqa: F401
