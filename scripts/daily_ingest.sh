#!/usr/bin/env bash
# Daily Cal eProcure ingestion (scrape → process → Supabase).
# SAM.gov bulk is opt-in only (DAILY_INGEST_SAM=1) — metadata-only rows poison the catalog.
# Public Purchase is opt-in (DAILY_INGEST_PUBLIC_PURCHASE=1) — requires vendor credentials.
# Used locally and by .github/workflows/daily-ingest.yml.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PYTHONUNBUFFERED=1

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
}

if [[ "${DAILY_INGEST_SAM:-}" == "1" ]]; then
  SAM_EXTRA=()
  if [[ "${DAILY_INGEST_SAM_USE_DRIVE:-}" != "1" ]]; then
    SAM_EXTRA+=(--no-drive)
  fi
  log "Starting SAM.gov pipeline (opt-in DAILY_INGEST_SAM=1)"
  python run_pipeline.py sam "${SAM_EXTRA[@]}" "$@"
  SAM_RC=$?
  log "SAM.gov pipeline finished (exit $SAM_RC)"
  if [[ "$SAM_RC" -ne 0 ]]; then
    exit "$SAM_RC"
  fi
fi

if [[ "${DAILY_INGEST_PUBLIC_PURCHASE:-}" == "1" ]]; then
  log "Starting Public Purchase pipeline (opt-in DAILY_INGEST_PUBLIC_PURCHASE=1)"
  python run_pipeline.py publicPurchase "$@"
  PP_RC=$?
  log "Public Purchase pipeline finished (exit $PP_RC)"
  if [[ "$PP_RC" -ne 0 ]]; then
    exit "$PP_RC"
  fi
fi

log "Starting Cal eProcure pipeline"
python run_pipeline.py eProcure "$@"
EPROCURE_RC=$?
log "Cal eProcure pipeline finished (exit $EPROCURE_RC)"
exit "$EPROCURE_RC"
