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

The worker handles two things: proxying NC DAC requests and creating GitHub issues for bug reports.

```bash
# Deploy the worker
npx wrangler deploy worker.js --name ncdoc-proxy --compatibility-date 2026-03-11

# Set the GitHub token for bug report creation
npx wrangler secret put GITHUB_TOKEN --name ncdoc-proxy
```

The GitHub token needs `Issues: Read and write` permission on this repo.

## Data

- `data/offender_ids.txt` — 4,234 offender IDs extracted from the source PDF
- `data/early_reentries.json` — early reentry dates mapped by offender ID, extracted from the PDF
- `data/dataset.json` — pre-fetched offender records (built by the GitHub Action)

## Dataset tab

The **Dataset** tab displays pre-fetched records from `data/dataset.json`, merged with early reentry dates. This lets users browse all records without triggering live lookups. The dataset includes an "Early Reentry Date" column not available through the standard DOC lookup.

### Building the dataset

A GitHub Action (`fetch-offenders.yml`) batch-fetches records from the NC DAC site via the Cloudflare Worker proxy:

- **Manual trigger**: Go to Actions > "Fetch Offender Records" > Run workflow. Set batch size (default 100) and request delay.
- **Scheduled**: Runs weekly on Mondays at 6am UTC.
- **Resume support**: Skips IDs already in `dataset.json`, so you can run it repeatedly to build up the full dataset.

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
