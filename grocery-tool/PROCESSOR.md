# PROCESSOR — the receipt-processing playbook for Claude

> **What this is:** the exact, repeatable instructions Claude follows to turn
> receipt photos into structured data, schedule reminders, and send emails. A
> human triggers it ("process my receipts") or a weekly scheduled session runs
> it automatically. Follow these steps in order, every run. Be conservative and
> never invent data — when unsure, flag for review.

## 0. Inputs you need each run
- **Data repo:** the private repository named in setup (e.g. `BarkernotBob/grocery-data`).
  Everything below lives there. Read/write it with the GitHub tools.
- **Reference files (in THIS public repo, `grocery-tool/`):**
  - `reference/perishables.md` — shelf-life table for use-by dates
  - `reference/hsa-eligible.md` — HSA eligibility rules
  - `schema/README.md` — exact field definitions
- **"Today":** use the real current date. If running headless and unsure, read
  it from the environment; never hardcode.

## 1. Find work
1. Read `db/receipts.json`. Collect every receipt with `status: "unprocessed"`.
2. Also list image files under `inbox/` in case any photo lacks a receipt stub
   (the app normally creates the stub, but be resilient). For an orphan photo,
   create a receipt stub first (`status: "unprocessed"`, `photo: "inbox/<file>"`,
   `capturedAt` = file commit time, `capturedBy: "unknown"`).
3. If there is no unprocessed receipt **and** no use-by reminder due today
   (see step 7), there is nothing to do — say so and stop.

## 2. Read each receipt photo
For each unprocessed receipt, open its `photo` (download the image from the data
repo) and read it carefully with vision. Extract:
- **Store name** → clean it (e.g. "COSTCO WHSE #1021" → "Costco"). Match against
  `db/stores.json` aliases; if new, add a store entry (lowercase slug id).
- **Purchase date** (`YYYY-MM-DD`). If only a time/no year is visible, infer the
  year from `capturedAt`.
- **Each line item:** raw printed name, quantity, unit if shown, unit price, and
  line total. Ignore non-item lines (subtotal, tax, tender, change, savings,
  membership) — but DO capture `subtotal`, `tax`, and `total` onto the receipt.

### When something is unreadable
NEVER guess a price/quantity to "fill the gap." If a field is smudged, cut off,
or ambiguous:
- Still create the item with your best partial data.
- Put the uncertain field's best guess in the item (if any) and add the field
  name to the item's `flags` (e.g. `"price_unclear"`).
- Add a `needs_attention.json` entry (`kind: "unreadable_field"`) describing
  exactly what to check, with `suggested` = your best guess and `photo` = the
  receipt image path. This drives the in-app review list and the review email.

## 3. Normalize names & GROUP similar items (requirement #8)
Goal: "GV WHL MLK", "whole milk", and "Organic Whole Milk" all roll up to one
group so search and reports treat them as the same thing.

For each item:
1. Lowercase the raw name, strip store/brand prefixes and size codes to get a
   core phrase (e.g. "gv org whl mlk" → "whole milk").
2. Look in `db/item_groups.json` for a group whose `canonical` or `aliases`
   matches (case-insensitive, allow minor spelling/abbreviation differences).
3. **Match found:** set the item's `groupId`, `name` = group's `canonical`,
   `category`, `perishable`, `hsaEligible` defaults from the group (you may still
   override `hsaEligible`/`perishable` for this specific item if the receipt
   clearly differs). If this raw spelling is new, append it to the group's
   `aliases` so it's remembered next time.
4. **No match:** create a new group. Pick a stable `groupId` slug, a clean
   `canonical` name, `category`, `perishable`, `defaultShelfLifeDays` (from the
   perishables reference), and `hsaEligible`. Seed `aliases` with the raw + clean
   names.
5. If two candidate groups are plausibly the same (e.g. "Greek Yogurt" vs
   "Yogurt"), keep them separate but DON'T merge aggressively; if genuinely
   torn, add a `confirm_group` entry to needs_attention rather than mis-grouping.

## 4. Perishable + use-by (requirement #4)
- Decide `perishable` using `reference/perishables.md`.
- If perishable, `useByDate` = `purchasedAt` + shelf-life days (round down when
  between rows). If the receipt prints a best-by/use-by date, prefer it.
- If non-perishable (incl. frozen), `perishable: false`, `useByDate: null`.

## 5. HSA flag (requirement #5)
- Set `hsaEligible` using `reference/hsa-eligible.md`.
- Gray areas (supplements, "is it medicated?", ambiguous): set `false` AND add a
  `confirm_hsa` needs_attention entry.

## 6. Write the data (append, never clobber)
Always read the current file, modify in memory, write the whole file back.
Preserve existing entries. For each processed receipt:
- Create item objects in `db/items.json` with ids `i_<unixseconds>_<4char>`.
- Update the receipt: set `status` (`processed`, or `needs_review` if it has any
  open needs_attention), fill `store/storeId/purchasedAt/subtotal/tax/total`,
  set `itemIds`, and **move the photo** from `inbox/` to `receipts/` (commit the
  file at the new path, delete the old, update `photo`).
- Update `db/item_groups.json` and `db/stores.json` with any new groups/stores
  and newly learned aliases.
- For each perishable item, add a `db/reminders.json` entry (`type: "use_by"`,
  `status: "pending"`, `dueDate` = useByDate, `notifiedAt: null`).
- Add any review flags to `db/needs_attention.json`.
Commit with a clear message, e.g. `Process 2 receipts (14 items, 3 flags)`.

## 7. Reminder sweep + emails (requirements #3 and #4 pings)
Do this every run, even if no new receipts:
1. **Use-by reminders due:** in `db/reminders.json`, find entries with
   `status: "pending"`, `notifiedAt: null`, and `dueDate <= today` (respect
   `config.reminders.useByLeadDays`). If the item's `status` is already
   `consumed`/`thrown_away`, mark the reminder `done` and skip. Otherwise email
   the household (see below) and set `notifiedAt` = now.
2. **Review flags:** if there are any **new** `open` needs_attention entries from
   this run, include them in a single review email.
3. Respect `config.json`: only email members with `notify: true`, and only if
   `sendUseByEmails` / `sendReviewEmails` are true. Always update the data files
   even if emails are disabled (the in-app lists still work).

### Email format (via Gmail tools)
- **To:** all notify-enabled member emails. **From:** the connected Gmail.
- **Freshness reminder subject:** `🥦 Grocery check: <item> — use by today`
  Body: friendly, lists the item(s), purchase date, store, and a link to the app
  (`https://barkernotbob.github.io/static/grocery/#review`). Tell them to
  check freshness and, in the app, mark it kept / consumed / thrown away.
- **Review subject:** `📋 Grocery review needed: <n> item(s)` Body: list each
  flag's plain-language `message` and a link to the app's Needs Attention tab.
- Keep emails short and skimmable. One combined email per run per type is fine.

## 8. Report back
Finish by telling the user (in chat, if interactive): how many receipts you
processed, total items, how many new groups, how many review flags raised, and
how many reminders were emailed. If anything was unreadable, name it.

## Guardrails
- Never fabricate prices, dates, or items. Partial + flagged beats wrong.
- Never delete history. Only append or update status fields.
- Keep ids stable; never renumber existing items.
- If the data repo is missing a `db/*.json` file, create it as `[]` (or `{}` for
  `item_groups.json`/`stores.json`/`config.json`) before writing.
- Money: store numbers, not strings; 2 decimals; assume `config.currency`.
