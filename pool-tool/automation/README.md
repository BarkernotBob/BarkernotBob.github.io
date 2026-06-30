# Pool Care — reminders (email) + RSS feed

The app shows what's due **when you open it**. This adds the **push**: a once-a-day
job that emails you what's due, and publishes an **RSS feed** you can follow in a
reader app. You chose **Option B** (a GitHub Action — fully automatic, runs on
GitHub's schedule, independent of Claude).

Both come from one small workflow file that lives in your private `pool-data`
repo. The actual logic is a script hosted on your live site
(`https://barkernotbob.github.io/static/pool/reminders.mjs`), so the workflow
file stays tiny and always runs the latest version.

> **Jargon, defined once:**
> - **GitHub Action / workflow** = a small task GitHub runs for you automatically on a schedule.
> - **Secret** = a private value (like a password) you paste into a repo's settings; the workflow can use it but nobody can read it back.
> - **Gmail App Password** = a 16-character code Google gives you so a program can send email as you, without using your real password.
> - **RSS feed** = a plain web file that lists updates; an "RSS reader" app checks it and shows you new items (and can notify you).

---

## Part 1 — Email reminders (do this first)

### Step 1. Make a Gmail App Password
1. Go to <https://myaccount.google.com/apppasswords> (sign in if asked).
   - If it says App Passwords aren't available, first turn on **2-Step
     Verification** at <https://myaccount.google.com/signinoptions/twosv>, then
     come back.
2. Under **App name** type `Pool Care` and click **Create**.
3. Google shows a **16-character code** (like `abcd efgh ijkl mnop`). Copy it.
   You'll paste it in Step 3. (You can't see it again later — if you lose it,
   just make a new one.)

### Step 2. Add the workflow file to your `pool-data` repo
1. Open <https://github.com/barkernotbob/pool-data> in your browser.
2. Click **Add file → Create new file**.
3. In the filename box, type exactly:
   ```
   .github/workflows/pool-reminders.yml
   ```
   (Typing the slashes creates the folders automatically.)
4. Open `pool-tool/automation/pool-reminders.yml` from your **website** repo,
   copy everything, and paste it into the big box.
5. Scroll down, click **Commit changes**.

### Step 3. Add your two email secrets
1. Still in the `pool-data` repo, click **Settings** (top tab) →
   **Secrets and variables** → **Actions**.
2. Click **New repository secret**. Add the first one:
   - **Name:** `MAIL_USERNAME`  •  **Secret:** your Gmail address
   - Click **Add secret**.
3. Click **New repository secret** again. Add the second:
   - **Name:** `MAIL_PASSWORD`  •  **Secret:** the 16-character App Password
     from Step 1 (spaces are fine)
   - Click **Add secret**.

### Step 4. Set your email in the app
Open the Pool Care app → **⚙︎ Settings** → put your email in the reminder field
→ save. (If you skip this, the reminder is sent to your `MAIL_USERNAME` address.)

### Step 5. Test it now
1. In `pool-data`, click the **Actions** tab.
2. Click **Pool reminders** on the left → **Run workflow** → **Run workflow**.
3. Wait ~30 seconds, refresh. A green check = it ran. If something was due, you'll
   get an email within a minute. (If nothing's due today, no email is sent — that's
   normal. To force a test email, open the app and set a task's "last done" date to
   a couple weeks ago so it's due.)

That's email done. It will now run **every morning** on its own.

---

## Part 2 — RSS feed (optional, do whenever)

This publishes a `pool.xml` feed to a **public** `feeds` repo so you (and only
you, really, since nobody knows the URL) can follow it in a reader. The feed
only ever says things like "chlorine is due" — no private data.

### Step 1. Create the public `feeds` repo
1. Go to <https://github.com/new>.
2. **Repository name:** `feeds`  •  **Visibility:** **Public**.
3. Check **Add a README file**, then **Create repository**.
4. (Optional landing page) Click **Add file → Create new file**, name it
   `index.html`, paste in `pool-tool/automation/feeds-repo-index.html` from your
   website repo, and **Commit**.

### Step 2. Turn on GitHub Pages for it
1. In the `feeds` repo: **Settings → Pages**.
2. Under **Build and deployment → Source**, pick **Deploy from a branch**.
3. Branch: **main**, folder: **/ (root)**. Click **Save**.
4. After a minute your feed will live at:
   **`https://barkernotbob.github.io/feeds/pool.xml`**

### Step 3. Make a token so the job can write the feed
1. Go to <https://github.com/settings/personal-access-tokens/new> (Fine-grained token).
2. **Token name:** `feeds-writer`  •  **Expiration:** 1 year (or "No expiration").
3. **Repository access:** *Only select repositories* → choose **feeds**.
4. **Permissions:** expand **Repository permissions**, find **Contents**, set it
   to **Read and write**. (Leave everything else as "No access".)
5. Click **Generate token** and copy the value (starts with `github_pat_…`).

### Step 4. Add the token secret to `pool-data`
1. `pool-data` repo → **Settings → Secrets and variables → Actions →
   New repository secret**.
2. **Name:** `FEEDS_TOKEN`  •  **Secret:** the token you just copied → **Add secret**.

### Step 5. Run it and subscribe
1. `pool-data` → **Actions → Pool reminders → Run workflow**.
2. Once it's green, open **`https://barkernotbob.github.io/feeds/pool.xml`** —
   you should see XML.
3. In an RSS reader app (e.g. **NetNewsWire**, free on iPhone), choose **Add feed**
   and paste that URL. Turn on notifications in the reader if you want a phone ping.

### Adding more apps later
Each future app drops its own `xyz.xml` in the same `feeds` repo and reuses the
same `FEEDS_TOKEN`. You subscribe to each one separately in your reader — exactly
the "one subscription per app, all in one place" setup you wanted.

---

## How "due" is decided (matches the app exactly)
- Routine tasks from `config.tasks[]`, each with a `cadence`
  (`weekly`/`biweekly`/`monthly`/`pump`) and a `last` date. Due when
  `today >= last + cadence`. `pump` = daily in peak summer, ~every 4 days otherwise.
- Tasks pause **off-season** (outside `config.season.open`..`close`).
- Opening/closing get a heads-up in the ~3 weeks before the season dates.
- The reminder never marks a task done — you still do that in the app.
- Email goes to `config.email` (set in Settings), falling back to `MAIL_USERNAME`.

## Weather (built into the report)
Every run fetches your local daily **rain, temperature, and humidity** from
**Open-Meteo** (free, no API key, no AI) using the latitude/longitude in
**Settings → Pool**. It:
- adds a **🌦️ Weather** line to the email (rain yesterday + last 7 days, today's
  high/low and humidity),
- raises a **heavy-rain alert** (email + feed item) when a day in the last two
  hits **≥ 0.5 in** — a nudge to test, since rain dilutes chlorine/CYA and washes
  in phosphates, and
- logs daily summaries to **`db/weather.json`** so history builds up for modeling.

The app's **🌦️ Weather** tab shows hourly temperature, humidity and rain; **📅
Today** and **📈 History** show summaries live.

## If you set this up before the rain update
The workflow file changed (feed now publishes *before* email, and rain is logged).
Re-copy `pool-tool/automation/pool-reminders.yml` over your existing
`pool-data/.github/workflows/pool-reminders.yml`: open that file on GitHub, click
the **pencil ✏️**, select-all, paste the new contents, **Commit changes**.

## Changing the time it runs
In `pool-reminders.yml`, the `cron: '0 11 * * *'` line is the time in **UTC**.
`11` = 7am Eastern in summer. Lower the number to make it earlier, raise it for later.

---

## Troubleshooting

### The job log shows `535-5.7.8 Username and Password not accepted ... BadCredentials`
Gmail is rejecting your login. This is **always** a credentials problem, not a bug in
the workflow — fix it by replacing the `MAIL_PASSWORD` secret. In order of likelihood:

1. **`MAIL_PASSWORD` is your normal Google password, not an App Password.** Gmail SMTP
   rejects your regular password. You must use a **16-character App Password**
   (Step 1 above). This is the #1 cause.
2. **2-Step Verification is off.** App Passwords only exist when 2-Step Verification is
   on. Turn it on at <https://myaccount.google.com/signinoptions/twosv>, then create
   the App Password at <https://myaccount.google.com/apppasswords>.
3. **The App Password was made under a different Google account** than the one in
   `MAIL_USERNAME`. Sign in as the *exact* address in `MAIL_USERNAME`, then create it.
4. **It was revoked.** Changing your Google password (or removing the App Password)
   invalidates it. Just make a fresh one and update the secret.
5. **Typo / `MAIL_USERNAME` isn't the full address.** `MAIL_USERNAME` must be the whole
   `you@gmail.com`. For `MAIL_PASSWORD`, the spaces in the 16-char code don't matter to
   Gmail, but pasting it **without spaces** avoids any stray-character mistakes.

**The fix, start to finish:**
1. Confirm 2-Step Verification is on (link above).
2. Make a fresh App Password at <https://myaccount.google.com/apppasswords> → copy the
   16 characters.
3. Go to <https://github.com/barkernotbob/pool-data/settings/secrets/actions>, click
   **MAIL_PASSWORD → Update**, paste the new code (no spaces), **Update secret**. While
   there, confirm **MAIL_USERNAME** is your full Gmail address.
4. **Actions** tab → **Pool reminders** → **Run workflow** to re-test.

> Same Gmail account is used by the Bank Bonus and Grocery robots too. They each keep
> their **own** secrets in their own data repo, so update `MAIL_PASSWORD` in each repo
> you use — the *same* App Password works for all of them.
