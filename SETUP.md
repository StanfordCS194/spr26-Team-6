# Environment Setup

Instructions for getting the pipeline running from a fresh clone.

## Prerequisites

- [Miniconda or Anaconda](https://docs.conda.io/en/latest/miniconda.html) installed
- Python 3.11 (managed by conda below)
- Git access to this repo

## 1. Create the conda environment

From the repo root:

```bash
conda create -n cs194 python=3.11 -y
conda activate cs194
```

## 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

## 3. Install Playwright browser binaries

The `playwright` Python package is installed by pip, but the actual Chromium
browser it drives is a separate one-time download:

```bash
python -m playwright install chromium
```

## 4. Configure credentials

Create a `.env` file at the repo root (loaded automatically by `run_pipeline.py`):

| Variable | Required for | Notes |
| -------- | ------------ | ----- |
| `SUPABASE_URL` | Ingest | Project URL from Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Ingest | Service role key — server/CI only, never in the browser |
| `SAM_GOV_API_KEY` | SAM.gov scrape | [SAM.gov API key](https://sam.gov/content/api) |
| `SAM_GOV_REQUEST_DELAY_SEC` | SAM.gov scrape | Optional seconds between API calls (default `1.0`) |
| `SAM_GOV_MAX_RETRY_WAIT_SEC` | SAM.gov scrape | Max seconds to wait on 429 before failing (default `120`; daily quota resets use `Retry-After`) |
| `GOOGLE_DRIVE_CREDENTIALS_PATH` | SAM.gov + Drive | Optional; omit when using `--no-drive` |
| `GOOGLE_DRIVE_TOKEN_PATH` | SAM.gov + Drive | Optional OAuth token path |
| `OPENAI_API_KEY` | Process | LLM key for description + SOW generation; if missing, pipeline falls back to deterministic heuristic summaries |

### GitHub Actions (scheduled daily ingest)

Workflow: [`.github/workflows/daily-ingest.yml`](.github/workflows/daily-ingest.yml)

Add these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
| ------ | ------- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Upsert into `public.rfps` |
| `SAM_GOV_API_KEY` | SAM.gov Get Opportunities API |

The workflow runs `scripts/daily_ingest.sh`, which uses `--no-drive` for SAM.gov (no Google OAuth in CI). Trigger manually via **Actions → Daily RFP ingest → Run workflow**.

## 5. Run the pipeline

One source at a time (scrape → normalize/tag → Supabase upsert):

```bash
python run_pipeline.py sam        # SAM.gov
python run_pipeline.py eProcure   # Cal eProcure
```

Both sources (same as the daily job):

```bash
bash scripts/daily_ingest.sh
```

Per-source flags:

```bash
python run_pipeline.py sam --skip-scrape      # re-process + ingest existing raw JSON
python run_pipeline.py sam --skip-process
python run_pipeline.py sam --skip-ingest
python run_pipeline.py sam --rescrape         # force re-scrape
python run_pipeline.py sam --no-drive       # SAM only: skip Google Drive upload
python run_pipeline.py eProcure --rescrape
```

## Troubleshooting

**`ImportError: cannot import name 'create_client' from 'supabase'`**
The `supabase` package isn't installed. Re-run `pip install -r requirements.txt`.

**`Playwright is required for Steps 3 and 4`**
You ran `pip install` but not the browser download step. Run:
```bash
python -m playwright install chromium
```

**`InconsistentVersionWarning: Trying to unpickle estimator ... from version 1.5.0 when using version 1.8.0`**
Your scikit-learn is newer than the one that produced the pickled models.
`requirements.txt` pins `scikit-learn==1.5.0` to avoid this — make sure you
installed from that file rather than running `pip install scikit-learn`
manually.

**`ERROR: Failed to build 'sklearn'`**
The PyPI `sklearn` package is deprecated. Use `scikit-learn` instead (already
in `requirements.txt`).

**Conda env got corrupted / want a clean start**
```bash
conda deactivate
conda env remove -n cs194
# then repeat from step 1
```