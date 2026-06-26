# Data schema (the shape of everything stored)

All of these files live in your **private data repository** (the locked filing cabinet), inside a folder called `db/`. The app and the daily email workflow both read them. They are plain **JSON** files — JSON is just a simple, structured text format for storing data that both humans and programs can read.

You normally never edit these by hand. The app keeps them up to date. This folder (`bank-bonus-tool/schema/`) just contains **example copies** so you and anyone setting this up can see exactly what each field means.

## The files

| File in `db/` | What it holds |
|---|---|
| `config.json` | Your settings: paycheck info, email addresses, timezone, people's names. |
| `accounts.json` | One entry per **active or recently-closed account** you're tracking (Open, Planned, or Closed status). The heart of the tracker. |
| `offers.json` | The **offer backlog** — researched banks you haven't opened yet, parked until you promote one to Planned or Open. |

## Field reference

### `config.json` — global settings

- `owner` — your name (e.g., `Isaiah`)
- `people` — list of valid person names for labeling accounts (e.g., `["Isaiah", "Grace", "Business"]`)
- `paycheck.amount` — your paycheck total in dollars
- `paycheck.firstDate` — the first paycheck date (ISO format: `YYYY-MM-DD`)
- `paycheck.intervalDays` — days between paychecks (e.g., `14` for biweekly)
- `paycheck.ddClearDays` — how many days for a direct deposit to clear (e.g., `21`)
- `taxRate` — your marginal tax rate (federal + state) as a decimal (e.g., `0.1675` for 16.75%)
- `hysaDailyRate` — HYSA interest as a daily rate (expressed as a decimal, e.g., `0.000091`)
- `laborHours.open` — hours spent opening one account
- `laborHours.adjustDD` — hours to adjust direct deposit amount
- `laborHours.requirements` — hours to complete additional requirements per account
- `laborHours.close` — hours to close one account
- `notify[]` — list of email recipients for the daily email
  - `email` — email address
  - `enabled` — `true` or `false` (turn on/off without deleting)
- `timezone` — your timezone (e.g., `America/New_York`)

### `accounts.json` — each account entry

- `id` — unique id, e.g., `a_1719240000_zz01`
- `offerId` — if this account was promoted from `offers.json`, the offer's `id`; otherwise `null`
- `institution` — bank name (e.g., `Flagstar`, `Key Bank`)
- `person` — who opened it (must be one of `config.json` `people`)
- `status` — one of:
  - `planned` — researched, ready to open; not yet opened
  - `open` — account is active, requirements being completed
  - `closed` — account closed (kept for history and reopen tracking)
- `bonus` — sign-up bonus amount in dollars
- `referralValue` — bonus from a referral link (if applicable)
- `directDepositTotal` — total direct deposit required across all payroll dates
- `requiresMultipleDeposits` — `true`/`false` — must the DD be split across multiple paydays?
- `nbDeposits` — if multiple deposits required, how many?
- `minBalance` — minimum balance requirement (if any)
- `minBalDays` — how many days the minimum balance must be held
- `additionalRequirements` — free text of other requirements (e.g., debit card transactions, etc.)
- `daysToCompleteReq` — how many days to complete all requirements
- `bonusTiming` — when the bonus posts (e.g., `91-104 days after opening`, `45 days`)
- `avoidFees` — free text of gotchas (e.g., monthly maintenance fees, early-close penalties)
- `churnable` — `true`/`false` — can you re-open for bonus again, or is it one-time-only?
- `monthsTillReopen` — if churnable, how many months after closing before you can reopen
- `notes` — any other info (research notes, observations, gotchas)
- `dates.opened` — date you opened the account (ISO format `YYYY-MM-DD`), or `null`
- `dates.firstDD` — date of the first direct deposit (ISO), or `null`
- `dates.bonusPaidOut` — when the bonus posted (ISO), or `null`
- `dates.closed` — date you closed it (ISO), or `null`
- `dates.reopenAfter` — earliest date you can reopen (ISO), or `null`
- `tasks.estatements` — checkmark: enrolled in e-statements?
- `tasks.alerts` — checkmark: turned on account alerts?
- `tasks.ddSetup` — checkmark: set up direct deposit?
- `tasks.documented` — checkmark: documented all notes/fees?
- `tasks.reminders` — checkmark: set up all reminders?
- `tasks.referrals` — checkmark: sent out referral links?
- `reminders[]` — list of reminders for this account (unlimited)
  - `id` — unique reminder id, e.g., `r_1719240000_aa01`
  - `date` — reminder date (ISO format `YYYY-MM-DD`)
  - `note` — what to do (e.g., `Transfer down to $600`)
  - `done` — `true`/`false` — checked off?
- `ddPlan[]` — the direct deposit plan (can be overridden by hand)
  - `payrollDate` — which payroll date (ISO `YYYY-MM-DD`)
  - `amount` — how much to direct-deposit that day

### `offers.json` — each offer in the backlog

- `id` — unique id, e.g., `o_1719240000_ab12`
- `institution` — bank name
- `person` — (reserved) who will open it; usually `null` until promoted
- `bonus` — sign-up bonus amount
- `referralValue` — referral bonus (if known)
- `directDepositTotal` — total DD required
- `requiresMultipleDeposits` — `true`/`false`
- `nbDeposits` — number of deposits (if multiple)
- `minBalance` — minimum balance (if any)
- `minBalDays` — days to hold it
- `additionalRequirements` — other requirements
- `daysToCompleteReq` — days to complete requirements
- `bonusTiming` — when bonus posts
- `avoidFees` — gotchas
- `churnable` — can you open again later?
- `monthsTillReopen` — months before you can reopen (if churnable)
- `notes` — research notes
- `status` — one of:
  - `backlog` — parked, not promoted yet
  - `archived` — researched but decided not to open
  - *(when promoted to active, it becomes an entry in `accounts.json`)*
