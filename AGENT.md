# Agent notes for this project

Context for AI models doing further work here. See README.md for user-facing
usage.

## What this is

Single-file Node.js script (`main.js`) that batch-downloads electricity
bills from PITC-hosted DISCO portals (bill.pitc.com.pk/{disco}bill) as
PDFs, given a CSV of consumer numbers. Only dependency: `playwright`
(headless Chromium). Originally MEPCO-only; the CSV's optional `disco`
column (default `mepco`) selects the path segment, e.g. `iesco` →
`/iescobill`.

**IESCO status**: confirmed the `/iescobill` search form has identical
field names/values to `/mepcobill` (`rbSearchByList` refno/appno,
`searchTextBox`, `btnSearch`) via a live but unauthenticated form
inspection. The rendered bill page's labels (`GRAND TOTAL`, `BILL MONTH`)
have **not** been confirmed against a real IESCO bill — no real IESCO
consumer ID was available to test end-to-end. If adding another DISCO or
debugging an IESCO failure, verify this first.

**LESCO status**: confirmed end-to-end with a real bill. Field names match
mepco/iesco, but two things differ:
- **The `appno` (Customer ID) mode expects an 11-digit ID** (the form's
  placeholder text says so live), not ~10 like mepco/iesco. A real LESCO
  bill can have a *7-digit* consumer number (confirmed: the bill's own
  "CONSUMER ID" field showed a 7-digit value) — that number will never
  work in `appno` search on LESCO's site. Use `refno` (14-digit reference
  number, printed on the bill) instead for these; that's what the optional
  `refno` CSV column and `loadBillViaSearchForm`'s `searchMode` param are
  for.
- The LESCO form has an **extra field, `ruCodeTextBox`**, a `U`/`R`
  (urban/rural?) select not present on mepco/iesco. Left at its default
  (`U`, empty value) for the confirmed working refno search — untested
  whether it matters for other consumers/modes.

## Site behavior — things that aren't obvious from the site itself

- **Direct GET to `/{disco}bill/general?appno={id}` does not work.** It
  redirects back to the search form. You must drive the actual search form
  (`loadBillViaSearchForm`) — this was confirmed empirically after an
  earlier assumption (that `appno` alone was enough) turned out wrong.
- **The search form has two radio modes**: `rbSearchByList` value `refno`
  (default-selected, expects a 14-digit reference number) and `appno`
  (expects the ~10-digit customer ID). This script always uses `appno`.
  Selecting the wrong mode doesn't error — it just won't find the bill.
- **Bill-page validation must check for `GRAND TOTAL`**, not `REFERENCE NO`.
  The search form itself has a "Reference No" radio label, which
  case-insensitively false-matches `REFERENCE NO` — an earlier version of
  this check silently "succeeded" while actually saving a screenshot of the
  empty search form. Caught only by a human opening the output PDF. If you
  change this check, verify against a real PDF, not just exit code/logs.
- **Barcode and QR code are drawn client-side** (canvas, via `JsBarcode` /
  `qrcodejs`) from the bill data. This is why `page.pdf()` (real browser
  rendering) is used instead of a static HTML-to-PDF converter — a
  fetch-and-convert approach would produce a bill missing the barcode/QR.
- **Output filename uses the bill's own "Bill Month" field**
  (`getBillYearMonth`), not the execution date — the bill month can lag (or
  occasionally lead) the current calendar month.

## Constraints to preserve

- **No system-wide installs.** Don't add `--with-deps` to the Playwright
  install instructions or run anything requiring `sudo`. Server/cron use
  goes through the official Playwright Docker image (see README), not
  host-level `apt-get`.
- **No CSV parsing library.** `parseCsv` in main.js is a deliberate manual
  `split(',')` — this was a conscious choice to keep dependencies to just
  `playwright`. Don't add `csv-parse` or similar without discussing it.
- **Never commit real consumer data.** `consumers.csv`, `bills/`, and `*.pdf`
  are gitignored. `consumers.example.csv` must stay synthetic. `EXPERIENCE.md`
  in this folder is a local personal file and is also gitignored — leave it
  alone.

## Testing

There's no automated test suite. Verifying a change means running against a
**real** consumer ID (synthetic ones won't resolve to an actual bill) — ask
the user for one rather than fabricating a test ID, and confirm success by
actually opening the resulting PDF (screenshot or otherwise), not just by
checking the script's exit code.

## Explicitly out of scope

`usersnap.pitc.com.pk`'s `SnapsForDuplicateBill/ToDuplicate` endpoint
(returns meter-reading photos as base64 JSON) was documented during initial
reverse-engineering but intentionally not implemented — not needed for the
bill PDF itself.
