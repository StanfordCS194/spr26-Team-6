#!/usr/bin/env bash
# Daily SAM.gov + Cal eProcure ingestion (scrape → process → Supabase).
# Used locally and by .github/workflows/daily-ingest.yml.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PYTHONUNBUFFERED=1

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
}

# SAM: skip Drive upload in CI/unattended runs (use --with-drive to enable).
SAM_EXTRA=()
if [[ "${DAILY_INGEST_SAM_USE_DRIVE:-}" != "1" ]]; then
  SAM_EXTRA+=(--no-drive)
fi

log "Starting SAM.gov pipeline"
python run_pipeline.py sam "${SAM_EXTRA[@]}" "$@"
SAM_RC=$?
log "SAM.gov pipeline finished (exit $SAM_RC)"
if [[ "$SAM_RC" -ne 0 ]]; then
  exit "$SAM_RC"
fi

log "Starting Cal eProcure pipeline"
python run_pipeline.py eProcure "$@"
EPROCURE_RC=$?
log "Cal eProcure pipeline finished (exit $EPROCURE_RC)"
exit "$EPROCURE_RC"
