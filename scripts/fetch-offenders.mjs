#!/usr/bin/env node

/**
 * Batch fetch offender records from NC DOC via the Cloudflare Worker proxy.
 * Reads offender IDs from data/offender_ids.txt, fetches each, writes to data/dataset.json.
 * Skips IDs already present in the dataset (resume support).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parseOffenderPage } from './parse-offender.mjs';

const WORKER_URL = process.env.WORKER_URL || 'https://ncdoc-proxy.austin-brian.workers.dev';
const BASE_URL = 'https://webapps.doc.state.nc.us/opi';
const DELAY_MS = parseInt(process.env.DELAY_MS || '1000', 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '0', 10); // 0 = all

const IDS_FILE = 'data/offender_ids.txt';
const DATASET_FILE = 'data/dataset.json';

async function fetchOffender(offenderId) {
  const targetUrl = `${BASE_URL}/viewoffender.do?method=view&offenderID=${offenderId}&searchOffenderId=${offenderId}`;
  const proxyUrl = `${WORKER_URL}?url=${encodeURIComponent(targetUrl)}`;

  const resp = await fetch(proxyUrl, {
    signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': 'NCDOC-BatchFetch/1.0' },
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }

  return await resp.text();
}

async function main() {
  const ids = readFileSync(IDS_FILE, 'utf-8')
    .split('\n')
    .map(s => s.trim())
    .filter(s => /^\d{7}$/.test(s));

  console.log(`Loaded ${ids.length} offender IDs`);

  let dataset = {};
  if (existsSync(DATASET_FILE)) {
    dataset = JSON.parse(readFileSync(DATASET_FILE, 'utf-8'));
    console.log(`Existing dataset has ${Object.keys(dataset).length} entries`);
  }

  const toFetch = ids.filter(id => !dataset[id]);
  const total = BATCH_SIZE > 0 ? Math.min(BATCH_SIZE, toFetch.length) : toFetch.length;
  console.log(`Fetching ${total} of ${toFetch.length} remaining IDs`);

  let fetched = 0;
  let errors = 0;

  for (let i = 0; i < total; i++) {
    const id = toFetch[i];
    try {
      const html = await fetchOffender(id);
      const rows = parseOffenderPage(html, id);
      dataset[id] = rows.filter(r => !r.error);
      if (dataset[id].length === 0) {
        dataset[id] = rows; // keep error rows if no valid data
      }
      fetched++;
      if ((fetched % 50) === 0) {
        console.log(`  Progress: ${fetched}/${total} fetched, ${errors} errors`);
        // Periodic save
        writeFileSync(DATASET_FILE, JSON.stringify(dataset, null, 2));
      }
    } catch (e) {
      errors++;
      console.error(`  Error fetching ${id}: ${e.message}`);
      dataset[id] = [{ offenderId: id, error: e.message }];
    }

    // Rate limit delay
    if (i < total - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  writeFileSync(DATASET_FILE, JSON.stringify(dataset, null, 2));
  console.log(`Done. Fetched ${fetched}, errors ${errors}. Dataset has ${Object.keys(dataset).length} total entries.`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
