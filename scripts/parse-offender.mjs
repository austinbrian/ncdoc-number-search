/**
 * Shared HTML parsing logic for NC DOC offender pages.
 * Used by the GitHub Action batch fetcher.
 */

import { JSDOM } from 'jsdom';

export function parseOffenderPage(html, offenderId) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const body = doc.body;
  if (!body) return [{ offenderId, error: 'Empty response' }];

  const text = body.textContent || '';
  if (text.includes('No records found') || text.includes('Invalid Offender')) {
    return [{ offenderId, error: 'No records found' }];
  }

  const name = extractName(doc);
  const rows = extractOffenseRows(doc, offenderId, name);

  if (rows.length === 0) {
    return [{
      offenderId, name,
      sentenceNum: 'N/A', offense: 'N/A', county: 'N/A',
      convictionDate: 'N/A', punishmentType: 'N/A',
      sentenceBegin: 'N/A', actualRelease: 'N/A', projectedRelease: 'N/A',
    }];
  }

  return rows;
}

function extractName(doc) {
  const fonts = doc.querySelectorAll('font[size="+1"]');
  for (const f of fonts) {
    const text = f.textContent.trim();
    if (text && text.length > 1 && /[A-Z]/.test(text)) {
      return text;
    }
  }

  const allBolds = doc.querySelectorAll('b');
  for (let i = 0; i < allBolds.length; i++) {
    if (allBolds[i].textContent.includes('Offender Number')) {
      for (let j = Math.max(0, i - 5); j < i; j++) {
        const t = allBolds[j]?.textContent.trim();
        if (t && t.length > 2 && /^[A-Z\s]+$/.test(t)) {
          return t;
        }
      }
    }
  }

  return 'Unknown';
}

function extractOffenseRows(doc, offenderId, name) {
  const rows = [];
  const sentenceTables = doc.querySelectorAll('table.sentencedisplaytable');

  for (const st of sentenceTables) {
    const inner = st.querySelector('table.innerdisplaytable');
    if (!inner) continue;

    const meta = parseMetadataTable(inner);
    const sentenceNum = meta['Sentence Number'] || 'N/A';
    const county = meta['County Of Conviction'] || 'N/A';
    const convictionDate = meta['Conviction Date'] || 'N/A';
    const punishmentType = meta['Punishment Type'] || 'N/A';
    const sentenceBegin = meta['Sentence Begin Date'] || 'N/A';
    const actualRelease = meta['Actual Release Date'] || 'N/A';
    const projectedRelease = meta['Projected Release Date'] || 'N/A';

    const offenseTable = st.querySelector('table.datainput');
    const offenses = offenseTable ? parseOffenseTable(offenseTable) : [];

    if (offenses.length === 0) {
      rows.push({
        offenderId, name, sentenceNum,
        offense: 'N/A', county, convictionDate,
        punishmentType, sentenceBegin, actualRelease, projectedRelease,
      });
    } else {
      for (const off of offenses) {
        rows.push({
          offenderId, name, sentenceNum,
          offense: off.offense,
          county, convictionDate, punishmentType,
          sentenceBegin, actualRelease, projectedRelease,
        });
      }
    }
  }

  return rows;
}

function parseMetadataTable(table) {
  const data = {};
  const cells = table.querySelectorAll('td');
  for (let i = 0; i < cells.length; i++) {
    const bold = cells[i].querySelector('b');
    if (bold) {
      const label = bold.textContent.trim().replace(/:$/, '');
      const valTd = cells[i + 1];
      if (valTd && !valTd.querySelector('b')) {
        data[label] = valTd.textContent.trim();
      }
    }
  }
  return data;
}

function parseOffenseTable(table) {
  const offenses = [];
  const tableRows = table.querySelectorAll('tr.tableRowOdd, tr.tableRowEven');
  for (const row of tableRows) {
    const cells = row.querySelectorAll('td.tableCell');
    if (cells.length >= 3) {
      offenses.push({
        commitment: cells[0]?.textContent.trim() || '',
        docket: cells[1]?.textContent.trim() || '',
        offense: cells[2]?.textContent.trim() || '',
        offenseDate: cells[3]?.textContent.trim() || '',
        type: cells[4]?.textContent.trim() || '',
        penaltyClass: cells[5]?.textContent.trim() || '',
      });
    }
  }
  return offenses;
}
