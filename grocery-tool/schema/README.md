# Data schema (the shape of everything stored)

All of these files live in your **private data repository** (the locked filing
cabinet), inside a folder called `db/`. The app and Claude both read and write
them. They are plain **JSON** files — JSON is just a simple, structured text
format for storing data that both humans and programs can read.

You normally never edit these by hand. The app and Claude keep them up to date.
This folder (`grocery-tool/schema/`) just contains **example copies** so you and
I can see exactly what each field means.

## The files

| File in `db/` | What it holds |
|---|---|
| `receipts.json` | One entry per receipt photo you snap. Holds store, date, totals, and which photo it came from. |
| `items.json` | One entry per **line item** on a receipt (e.g. "Organic Whole Milk, $4.99"). The heart of the database. |
| `item_groups.json` | The "grouping" memory: maps messy receipt names to one clean canonical name (so "GV WHL MILK" and "whole milk" count as the same thing). |
| `stores.json` | The list of stores seen, with clean names. |
| `waste.json` | One entry per item you mark as thrown away. |
| `reminders.json` | Use-by / freshness reminders Claude schedules. |
| `needs_attention.json` | Anything Claude couldn't read or wants you to confirm. Powers the in-app "Needs attention" list and the review emails. |
| `config.json` | Household settings: who you are, emails to notify, currency, timezone. |

## Field reference

### `items.json` — each item
- `id` — unique id, e.g. `i_1719240000_ab12`
- `receiptId` — which receipt it came from
- `rawName` — exactly as printed on the receipt (e.g. `GV ORG WHL MLK`)
- `name` — cleaned-up human name (e.g. `Organic Whole Milk`)
- `groupId` — the canonical group it belongs to (see `item_groups.json`)
- `category` — broad category (`dairy`, `produce`, `meat`, `pantry`, `household`, `pharmacy`, …)
- `qty` — quantity (number)
- `unit` — unit if shown (`ea`, `lb`, `gal`, `oz`, …)
- `unitPrice` — price per unit if shown
- `price` — total price paid for this line
- `store` / `storeId` — where bought
- `purchasedAt` — date on the receipt (`YYYY-MM-DD`)
- `perishable` — `true`/`false`
- `useByDate` — estimated use-by (`YYYY-MM-DD`) if perishable, else `null`
- `hsaEligible` — `true`/`false` (eligible for HSA reimbursement)
- `status` — `active`, `consumed`, or `thrown_away`
- `flags` — list of uncertainty tags, e.g. `["price_unclear"]`; empty when confident

### `receipts.json` — each receipt
- `id`, `photo` (path in repo), `capturedAt`, `capturedBy`
- `status` — `unprocessed` (just snapped), `processed`, or `needs_review`
- `store`, `storeId`, `purchasedAt`, `subtotal`, `tax`, `total`, `currency`
- `itemIds` — list of item ids extracted from it
- `notes`

### `item_groups.json` — the grouping memory
A map keyed by `groupId`:
- `canonical` — the one clean display name
- `aliases` — every spelling/abbreviation that should map here
- `category`, `perishable`, `defaultShelfLifeDays`, `hsaEligible`

### `reminders.json` — each reminder
- `id`, `type` (`use_by`), `itemId`, `groupId`, `name`
- `dueDate` (`YYYY-MM-DD`), `status` (`pending`/`done`/`dismissed`)
- `note`, `createdAt`, `notifiedAt`

### `needs_attention.json` — each review flag
- `id`, `receiptId`, `itemId` (if about one item)
- `kind` — `unreadable_field`, `unknown_store`, `confirm_group`, `confirm_hsa`, …
- `field` — which field is uncertain (`price`, `qty`, `name`, `store`, `date`)
- `message` — plain-language description of what to check
- `photo` — path to the receipt image so you can look
- `suggested` — Claude's best guess (you can accept or correct)
- `status` — `open` or `resolved`
- `createdAt`

### `waste.json` — each thrown-away item
- `id`, `itemId`, `groupId`, `name`, `qty`
- `thrownAt` (`YYYY-MM-DD`), `reason` (`spoiled`, `expired`, `leftover`, …)
- `estCost` (estimated money wasted), `by`

---

## v2 additions — structured (photo-less) orders

Version 2 adds online-order support (browser extension + email) alongside photo
receipts. **All new fields are additive** — old records without them are still
valid; readers tolerate their absence. `config.schemaVersion` is `2`.

> The **canonical** field definitions and the machine-readable staging schema
> live in the data repo: `grocery-data/schema/README.md` and
> `grocery-data/schema/staging-order.schema.json`. This page is the human-facing
> mirror; when they differ, the data-repo copy wins.

**`items.json` gains:** `upc` (GTIN or `null`) · `source`
(`photo`/`extension`/`email`; existing rows are `photo`) · `regularUnitPrice`
(shelf price) · `discount` · `promoDescription` (e.g. `"BOGO"`) ·
`retailerCategory` (the retailer's own category, kept as a hint).
**Price semantics (fixed in v2):** `price` = net line total; `unitPrice` = net
effective = `round(price/qty, 2)`; `regularUnitPrice` = shelf price. (Promos used
to hide the shelf price in `unitPrice`; that ambiguity is gone.)

**`receipts.json` gains:** `retailer`, `orderId`, `orderKey` (`retailer:orderId`),
`channel` (`in_store`/`pickup`/`delivery`/`online`; photo receipts default
`in_store`), `source`, `storeNumber`, `orderedAt`, `fulfilledAt`, `fees`,
`rawPayload` (path to the archived payload), `photos[]`. **`photo` and
`capturedBy` are now nullable** (online orders have no photo).

**New db files:** `db/order_index.json` (`{orderKey: receiptId}`, processor-owned,
the dedup index) · `db/processor_state.json` (last-run summary) ·
`sync/<retailer>.json` (extension-owned sync status).

**Staging order** — the handoff file the extension/email writes to
`inbox/orders/<retailer>_<orderIdSafe>.json` (raw payload archived beside it as
`.raw.json`). One order, its lines, totals, channel, and store. `source ∈
{extension, email}`; `channel ∈ {in_store, pickup, delivery, online}`; `qty` may
be decimal (weight lines) or negative (refunds). Validated by
`dbtool validate-order`; see `PROCESSOR.md` §6b for how it's processed.
