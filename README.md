# pk-power-bills

Batch-downloads power (bill.pitc.com.pk) bills as PDFs, given a CSV of consumer numbers.

## Setup

```
npm install
npx playwright install chromium
```

This downloads Chromium into your user cache — no `sudo` needed.

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

PDFs are saved as `<output>/<name>-<YYYY-MM>.pdf`, using the month printed on
the bill. If that file already exists, it isn't rewritten.

## Run weekly on macOS

The job runs every **Friday at 18:00**, and also at login after a restart.
Bills are monthly, so running weekly makes up for any missed runs.

**Install** (also runs it once right away):

```
cp scripts/com.muzammil.pk-power-bills.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.muzammil.pk-power-bills.plist
```

**Check it worked:**

```
cat logs/weekly.log
launchctl print gui/$(id -u)/com.muzammil.pk-power-bills | grep -E "state|last exit code"
```

`last exit code = 0` means every bill was fetched. `1` means at least one
failed (see the log). `78` means launchd couldn't start it (bad path in the
plist).

**Run it now** without waiting for Friday:

```
launchctl kickstart -k gui/$(id -u)/com.muzammil.pk-power-bills
```

**After editing the plist**, reload it (changes to `main.js` need nothing):

```
launchctl bootout gui/$(id -u)/com.muzammil.pk-power-bills
cp scripts/com.muzammil.pk-power-bills.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.muzammil.pk-power-bills.plist
```

**Uninstall:**

```
launchctl bootout gui/$(id -u)/com.muzammil.pk-power-bills
rm ~/Library/LaunchAgents/com.muzammil.pk-power-bills.plist
```

### Reading the log

Each run starts with a `Run started <time>` line (UTC), then one line per
consumer:

- `OK` — a new bill was saved.
- `SKIP` — the bill is already on disk; nothing was written.
- `FAIL` — the bill couldn't be fetched.

The first `OK` for a month shows roughly when that bill became available.

### Good to know

- The plist uses full paths to node (`~/.nvm/.../v26.10.0`) and this repo.
  Update them if you move the repo, change machines, or remove that node
  version.
- It only runs while you're logged in. If the Mac is asleep at 18:00, it runs
  on next wake.

## Notes

Real customer data must never be committed — `consumers.example.csv` is
synthetic only; use a local, gitignored CSV for real runs.
