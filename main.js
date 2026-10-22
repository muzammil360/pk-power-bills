const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ORIGIN = 'https://bill.pitc.com.pk';
const DEFAULT_DISCO = 'mepco';
const DELAY_BETWEEN_CONSUMERS_MS = 2000;
const MAX_ATTEMPTS_PER_CONSUMER = 2;

const MONTH_ABBR_TO_NUM = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--output') args.output = argv[++i];
  }
  if (!args.input || !args.output) {
    console.error('Usage: node main.js --input consumers.csv --output ./bills');
    process.exit(1);
  }
  return args;
}

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));
  if (lines.length < 2) {
    throw new Error('CSV must have a header row plus at least one data row');
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const customerIdIdx = header.indexOf('consumerid');
  const nameIdx = header.indexOf('name');
  const discoIdx = header.indexOf('disco');
  const refnoIdx = header.indexOf('refno');
  if (customerIdIdx === -1 || nameIdx === -1) {
    throw new Error('CSV header must include "consumerid" and "name" columns');
  }

  return lines.slice(1).map((line, i) => {
    const cols = line.split(',').map((c) => c.trim());
    const customerId = cols[customerIdIdx];
    const name = cols[nameIdx];
    if (!customerId || !name) {
      throw new Error(`Row ${i + 2}: both consumerid and name are required`);
    }
    const disco = (discoIdx !== -1 && cols[discoIdx] ? cols[discoIdx] : DEFAULT_DISCO).toLowerCase();
    if (!/^[a-z]+$/.test(disco)) {
      throw new Error(`Row ${i + 2}: invalid disco "${disco}" (letters only, e.g. "mepco", "iesco")`);
    }
    const refno = (refnoIdx !== -1 && cols[refnoIdx]) || null;
    return { customerId, name, disco, refno };
  });
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isValidBillPage(page) {
  // "GRAND TOTAL" only appears on the rendered bill, not on the search form
  // (whose "Reference No" radio label would otherwise false-match "REFERENCE NO").
  const text = await page.locator('body').innerText().catch(() => '');
  return /GRAND TOTAL/i.test(text);
}

// Bill page renders "BILL MONTH" / <urdu label> / "JUN 26" as consecutive lines.
// Read the year/month from there rather than the execution date, since the
// bill month can lag behind (or occasionally lead) the current calendar month.
async function getBillYearMonth(page) {
  const text = await page.locator('body').innerText();
  const lines = text.split('\n').map((l) => l.trim());
  const labelIdx = lines.findIndex((l) => /^BILL MONTH$/i.test(l));
  if (labelIdx === -1) return null;

  for (let i = labelIdx + 1; i < Math.min(labelIdx + 4, lines.length); i++) {
    const match = lines[i].match(/^([A-Z]{3})\s?(\d{2})$/i);
    if (match) {
      const month = MONTH_ABBR_TO_NUM[match[1].toUpperCase()];
      if (month) return { year: `20${match[2]}`, month };
    }
  }
  return null;
}

async function loadBillViaSearchForm(page, customerId, disco, refno) {
  const searchMode = refno ? 'refno' : 'appno';
  const searchValue = refno || customerId;

  await page.goto(`${ORIGIN}/${disco}bill`, { waitUntil: 'networkidle' });
  await page.locator(`input[name="rbSearchByList"][value="${searchMode}"]`).check();
  await page.locator('input[name="searchTextBox"]').fill(searchValue);
  await Promise.all([
    page.waitForURL(`**/${disco}bill/general?${searchMode}=*`),
    page.locator('input[name="btnSearch"]').click(),
  ]);
  await page.waitForLoadState('networkidle');
  return isValidBillPage(page);
}

async function downloadBillPdf(browser, { customerId, name, disco, refno }, outputDir) {
  const page = await browser.newPage();
  try {
    const ok = await loadBillViaSearchForm(page, customerId, disco, refno);
    if (!ok) {
      throw new Error('Bill page did not load valid bill content');
    }

    const billYearMonth = await getBillYearMonth(page);
    if (!billYearMonth) {
      throw new Error('Could not read "Bill Month" from the bill page');
    }

    const fileName = `${sanitizeFilename(name)}-${billYearMonth.year}-${billYearMonth.month}.pdf`;
    const outPath = path.join(outputDir, fileName);
    if (fs.existsSync(outPath)) {
      return { customerId, name, disco, ok: true, skipped: true, outPath };
    }
    await page.pdf({ path: outPath, format: 'A4', printBackground: true });
    return { customerId, name, disco, ok: true, skipped: false, outPath };
  } finally {
    await page.close();
  }
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const consumers = parseCsv(input);
  fs.mkdirSync(output, { recursive: true });
  console.log(`Run started ${new Date().toISOString()}`);

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const consumer of consumers) {
      let lastError;
      let success = false;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CONSUMER && !success; attempt++) {
        try {
          const result = await downloadBillPdf(browser, consumer, output);
          results.push(result);
          const tag = result.skipped ? 'SKIP' : 'OK  ';
          console.log(`${tag} ${consumer.customerId} (${consumer.name}, ${consumer.disco}) -> ${result.outPath}`);
          success = true;
        } catch (err) {
          lastError = err;
          if (attempt < MAX_ATTEMPTS_PER_CONSUMER) {
            console.warn(`Retry ${consumer.customerId} (${consumer.name}, ${consumer.disco}): ${err.message}`);
          }
        }
      }

      if (!success) {
        results.push({ ...consumer, ok: false, error: lastError && lastError.message });
        console.error(`FAIL ${consumer.customerId} (${consumer.name}, ${consumer.disco}): ${lastError && lastError.message}`);
      }

      await sleep(DELAY_BETWEEN_CONSUMERS_MS);
    }
  } finally {
    await browser.close();
  }

  const succeeded = results.filter((r) => r.ok && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => !r.ok);

  console.log('\nSummary:');
  console.log(`  Succeeded: ${succeeded.length}`);
  console.log(`  Skipped:   ${skipped.length} (already on disk)`);
  console.log(`  Failed:    ${failed.length}`);
  if (failed.length > 0) {
    console.log('  Failed consumer IDs:', failed.map((r) => r.customerId).join(', '));
  }

  process.exitCode = failed.length > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
