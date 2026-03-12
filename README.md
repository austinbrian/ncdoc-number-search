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

## Data sources

- **Offender records**: Fetched from the [NC DAC Offender Public Information](https://webapps.doc.state.nc.us/opi/offendersearch.do?method=view) site, which provides sentence history, offenses, and release dates for offenders in North Carolina's correctional system.
- **Early reentry dates**: Extracted from the *NCDPS Adult Correction Report of Reentries*, a PDF report listing offenders participating in North Carolina's early release program (reporting period Feb–Aug 2021). The report contains 4,234 offender IDs with their early reentry dates.

### Data files

- `data/offender_ids.txt` — 4,234 offender IDs extracted from the reentries report
- `data/early_reentries.json` — early reentry dates mapped by offender ID
- `data/dataset.json` — pre-fetched offender records with early reentry dates baked in

## Dataset tab

The **Dataset** tab displays pre-fetched records from `data/dataset.json`. This lets users browse all records without triggering live lookups. The dataset includes an "Early Reentry Date" column sourced from the NCDPS reentries report — this date is not available through the standard DOC lookup. Early reentry dates are nulled on rows where the actual release date predates the early reentry date (which occurs when an offender has multiple convictions).

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
