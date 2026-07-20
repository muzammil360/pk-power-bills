# MEPCO Bill Downloader

Batch-downloads MEPCO (bill.pitc.com.pk) electricity bills as PDFs, given a CSV of consumer numbers.

## Setup

```
npm install
npx playwright install chromium
```

Browser binary goes to Playwright's per-user cache (`~/.cache/ms-playwright`),
not this folder — no `sudo`, nothing system-wide.

## Usage

CSV needs `consumerid` and `name` columns, plus an optional `disco` column
(distribution company slug, e.g. `mepco`, `iesco` — defaults to `mepco` if
omitted). See `consumers.example.csv`:

```
consumerid,name,disco
1234567890,John Doe,mepco
9876543210,Jane Smith,iesco
```

```
node main.js --input consumers.csv --output ./bills
```

PDFs are written as `<output>/<YYYY-MM>-<name>.pdf`, where the year/month
come from the bill's own "Bill Month" field (not the run date).

## Running on a server (cron)

Don't run `--with-deps` on a bare host — it `apt-get`-installs OS libraries
system-wide. Run inside the official Playwright Docker image instead:

```
docker run --rm -v "$PWD":/app -w /app mcr.microsoft.com/playwright:v1.48.0-jammy \
  sh -c "npm install && node main.js --input consumers.csv --output ./bills"
```

## Notes

Real customer data must never be committed — `consumers.example.csv` is
synthetic only; use a local, gitignored CSV for real runs.
