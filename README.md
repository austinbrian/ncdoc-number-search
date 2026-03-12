# NC DOC Offender Lookup

A static web tool for batch-searching offender records from the North Carolina Department of Adult Correction (DAC) public database.

## What it does

Paste a list of NC DOC offender numbers and get a searchable, sortable table of their sentence history — offenses, counties, conviction dates, incarceration periods, and release dates. Each offender ID links directly to their full record on the NC DAC site.

## How it works

- **Frontend**: Single-page static site hosted on GitHub Pages
- **CORS proxy**: Cloudflare Worker (`worker.js`) proxies requests to the NC DAC site, which doesn't support cross-origin browser requests
- **Caching**: Results are cached in-memory during a session. An `offenders.json` file can be used as a persistent cache — the site loads it on startup and skips lookups for any IDs already present
- **Bug reports**: A built-in form submits issues to this repo via the Cloudflare Worker, so reporters don't need GitHub accounts

## Setup

### GitHub Pages

The site deploys automatically via GitHub Actions on push to `main`.

### Cloudflare Worker

The worker handles three things: proxying NC DAC requests, creating GitHub issues for bug reports, and serving dataset files from R2.

```bash
# Deploy the worker
npx wrangler deploy

# Set secrets
npx wrangler secret put GITHUB_TOKEN   # needs Issues: Read and write on this repo
npx wrangler secret put UPLOAD_TOKEN    # shared with GitHub Action for dataset uploads
```

### Cloudflare R2 (dataset storage)

The pre-fetched dataset (`dataset.json`) is stored in Cloudflare R2 instead of git to keep the repo lean.

```bash
# One-time setup
npx wrangler r2 bucket create ncdoc-data
npx wrangler secret put UPLOAD_TOKEN

# Upload early_reentries.json (one-time)
curl -X PUT \
  -H "Authorization: Bearer <your-upload-token>" \
  -H "Content-Type: application/json" \
  --data-binary @data/early_reentries.json \
  https://ncdoc-proxy.austin-brian.workers.dev/data/early_reentries.json

# Upload existing dataset.json
curl -X PUT \
  -H "Authorization: Bearer <your-upload-token>" \
  -H "Content-Type: application/json" \
  --data-binary @data/dataset.json \
  https://ncdoc-proxy.austin-brian.workers.dev/data/dataset.json
```

Also add `UPLOAD_TOKEN` as a GitHub repo secret and set `WORKER_URL` as a repo variable (`https://ncdoc-proxy.austin-brian.workers.dev`).

## Data sources

- **Offender records**: Fetched from the [NC DAC Offender Public Information](https://webapps.doc.state.nc.us/opi/offendersearch.do?method=view) site, which provides sentence history, offenses, and release dates for offenders in North Carolina's correctional system.
- **Early reentry dates**: Extracted from the *NCDPS Adult Correction Report of Reentries*, a PDF report listing offenders participating in North Carolina's early release program (reporting period Feb–Aug 2021). Extraction uses `pdftotext -raw` (poppler) via `scripts/parse-early-reentries.mjs`, which identifies primary data lines (7-digit ID followed by a race keyword) and takes the rightmost date as the early reentry date. Offenders who appear multiple times get an array of all distinct dates. The cleanup script (`scripts/clean-early-reentries.mjs`) matches each date to the offense row where `sentenceBegin <= earlyReentryDate <= actualRelease`.

### Data files

- `data/offender_ids.txt` — 4,234 offender IDs extracted from the reentries report
- `data/early_reentries.json` — arrays of early reentry dates per offender ID (e.g., `{"0405341": ["02/25/2021", "04/20/2021"]}`)
- `data/dataset.json` — pre-fetched offender records with early reentry dates baked in (stored in Cloudflare R2, not committed to git)

## Dataset tab

The **Dataset** tab displays pre-fetched records from `data/dataset.json`. This lets users browse all records without triggering live lookups. The dataset includes an "Early Reentry Date" column sourced from the NCDPS reentries report — this date is not available through the standard DOC lookup. Each early reentry date is matched to the offense row where `sentenceBegin <= earlyReentryDate <= actualRelease`; unmatched rows get null.

### Building the dataset

A GitHub Action (`fetch-offenders.yml`) batch-fetches records from the NC DAC site via the Cloudflare Worker proxy:

- **Manual trigger**: Go to Actions > "Fetch Offender Records" > Run workflow. Set batch size (default 100) and request delay.
- **Scheduled**: Runs weekly on Mondays at 6am UTC.
- **Resume support**: Downloads the current dataset from R2 at the start, skips IDs already fetched, and uploads the updated dataset back to R2 when done.

To run locally:

```bash
npm install jsdom
node scripts/fetch-offenders.mjs
```

Set `BATCH_SIZE` and `DELAY_MS` environment variables to control pacing.

## Usage

1. Go to https://austinbrian.github.io/ncdoc-number-search/
2. **Lookup tab**: Paste offender numbers, click **Look Up**, filter/sort/copy results
3. **Dataset tab**: Browse pre-fetched records with early reentry dates
