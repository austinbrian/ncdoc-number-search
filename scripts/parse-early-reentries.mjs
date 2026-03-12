#!/usr/bin/env node

/**
 * Parse the NCDPS early reentries PDF to extract all early reentry dates
 * per offender. Offenders can appear multiple times with different dates
 * representing different release periods.
 *
 * Uses `pdftotext -raw` (poppler) to extract text, then matches primary
 * data lines (7-digit ID followed by a race keyword). The rightmost
 * MM/DD/YYYY date on each primary line is the early reentry date.
 *
 * Output: { "0405341": ["02/25/2021", "04/20/2021", "04/27/2021"], ... }
 */

import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

const PDF_FILE = 'data/DACList WSOC WATERMARK.pdf';
const OUTPUT_FILE = 'data/early_reentries.json';

const RACE_KEYWORDS = new Set([
  'White', 'Black', 'Black/African', 'Other', 'Asian', 'Asian/Asian',
  'American', 'Unknown',
]);

const DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g;

function main() {
  const text = execSync(`pdftotext -raw "${PDF_FILE}" -`, { encoding: 'utf-8' });
  const lines = text.split('\n');

  const result = {};
  let primaryCount = 0;

  for (const line of lines) {
    const match = line.match(/^(\d{7})\s+(\S+)/);
    if (!match) continue;

    const [, id, secondField] = match;
    if (!RACE_KEYWORDS.has(secondField)) continue;

    // Primary line — extract the rightmost date as the early reentry date
    const dates = [...line.matchAll(DATE_RE)].map(m => m[1]);
    if (dates.length === 0) continue;

    const earlyReentryDate = dates[dates.length - 1];

    if (!result[id]) {
      result[id] = [];
    }
    // Avoid duplicate dates for the same offender
    if (!result[id].includes(earlyReentryDate)) {
      result[id].push(earlyReentryDate);
    }
    primaryCount++;
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));

  const offenderCount = Object.keys(result).length;
  const multiDateCount = Object.values(result).filter(d => d.length > 1).length;
  console.log(`Parsed ${primaryCount} primary lines`);
  console.log(`${offenderCount} unique offenders`);
  console.log(`${multiDateCount} offenders with multiple dates`);
}

main();
