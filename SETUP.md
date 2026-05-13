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

- Add more info 

## 5. Run the pipeline

Full run (all 4 stages):

```bash
python run_pipeline.py
```

Useful flags:

```bash
python run_pipeline.py --skip-samgov          # skip Stage 1
python run_pipeline.py --skip-caleprocure     # skip Stage 2
python run_pipeline.py --skip-process         # skip Stage 3
python run_pipeline.py --skip-ingest          # skip Stage 4
python run_pipeline.py --rescrape             # force re-scrape, ignore cache
python run_pipeline.py --no-drive             # skip Google Drive upload
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