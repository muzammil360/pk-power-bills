# pk-power-bills

Batch-downloads power (bill.pitc.com.pk) bills as PDFs, given a CSV of consumer numbers.

## Setup

```
npm install
npx playwright install chromium
```

Browser binary goes to Playwright's per-user cache (`~/.cache/ms-playwright`),
not this folder — no `sudo`, nothing system-wide.

## Usage

CSV needs `consumerid` and `name` columns, plus optional `disco` (distribution
company slug, e.g. `mepco`, `iesco`, `lesco` — defaults to `mepco` if omitted)
and `refno` columns. See `consumers.example.csv`:

```
consumerid,name,disco,refno
1234567890,John Doe,mepco,
9876543210,Jane Smith,iesco,
1112223,Sam Lee,lesco,12345678901234
```

If `refno` is filled in, the bill is searched for by that 14-digit reference
number instead of the customer ID. Some DISCOs (confirmed for LESCO) require
an 11-digit customer ID for ID-based search — a shorter consumer number won't
resolve there and you'll need the reference number from the bill instead.

```
node main.js --input consumers.csv --output ./bills
```

PDFs are written as `<output>/<name>-<YYYY-MM>.pdf`, where the year/month
come from the bill's own "Bill Month" field (not the run date).

## Notes

Real customer data must never be committed — `consumers.example.csv` is
synthetic only; use a local, gitignored CSV for real runs.
