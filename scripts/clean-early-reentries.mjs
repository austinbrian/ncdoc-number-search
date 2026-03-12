#!/usr/bin/env node

/**
 * Post-processing cleanup for early reentry dates in the dataset.
 *
 * Reads early_reentries.json (arrays of dates per offender) and matches
 * each date to the offense row where sentenceBegin <= earlyReentryDate <= actualRelease.
 * If multiple dates match a row, the latest is used. Unmatched rows get null.
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
    const dateStrings = earlyReentries[id] || null;

    for (const row of rows) {
      if (row.error) continue;
      totalRows++;

      if (!dateStrings) {
        row.earlyReentryDate = null;
        continue;
      }

      const sentenceBegin = parseDate(row.sentenceBegin);
      const actualRelease = parseDate(row.actualRelease);

      // Find dates where sentenceBegin <= earlyReentryDate <= actualRelease
      let bestDate = null;
      let bestParsed = null;

      for (const ds of dateStrings) {
        const d = parseDate(ds);
        if (!d) continue;

        const afterBegin = !sentenceBegin || d >= sentenceBegin;
        const beforeRelease = !actualRelease || d <= actualRelease;

        if (afterBegin && beforeRelease) {
          if (!bestParsed || d > bestParsed) {
            bestDate = ds;
            bestParsed = d;
          }
        }
      }

      if (bestDate) {
        row.earlyReentryDate = bestDate;
        assigned++;
      } else {
        row.earlyReentryDate = null;
        nulled++;
      }
    }
  }

  writeFileSync(DATASET_FILE, JSON.stringify(dataset, null, 2));

  console.log(`Processed ${totalRows} rows`);
  console.log(`Assigned early reentry date: ${assigned}`);
  console.log(`Nulled (no matching date in range): ${nulled}`);
}

main();
