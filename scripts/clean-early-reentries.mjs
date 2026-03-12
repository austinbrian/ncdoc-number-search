#!/usr/bin/env node

/**
 * Post-processing cleanup for early reentry dates in the dataset.
 *
 * Merges early reentry dates into dataset.json, then nulls out the date
 * on any row where actual release came before the early reentry date.
 * Think: SET early_reentry_date = NULL WHERE early_reentry_date > actual_release_date
 */

import { readFileSync, writeFileSync } from 'fs';

const DATASET_FILE = 'data/dataset.json';
const REENTRIES_FILE = 'data/early_reentries.json';

function parseDate(str) {
  if (!str || str === 'N/A' || str === '*') return null;
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[1] - 1, +m[2]);
}

function main() {
  const dataset = JSON.parse(readFileSync(DATASET_FILE, 'utf-8'));
  const earlyReentries = JSON.parse(readFileSync(REENTRIES_FILE, 'utf-8'));

  let totalRows = 0;
  let assigned = 0;
  let nulled = 0;

  for (const [id, rows] of Object.entries(dataset)) {
    const reentryStr = earlyReentries[id] || null;

    for (const row of rows) {
      if (row.error) continue;
      totalRows++;

      if (!reentryStr) {
        row.earlyReentryDate = null;
        continue;
      }

      const reentryDate = parseDate(reentryStr);
      const actualRelease = parseDate(row.actualRelease);

      if (actualRelease && reentryDate && actualRelease < reentryDate) {
        row.earlyReentryDate = null;
        nulled++;
      } else {
        row.earlyReentryDate = reentryStr;
        assigned++;
      }
    }
  }

  writeFileSync(DATASET_FILE, JSON.stringify(dataset, null, 2));

  console.log(`Processed ${totalRows} rows`);
  console.log(`Assigned early reentry date: ${assigned}`);
  console.log(`Nulled (actual release before early reentry): ${nulled}`);
}

main();
