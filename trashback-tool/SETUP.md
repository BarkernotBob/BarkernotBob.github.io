# Trashback web app — setup (one time, ~10 minutes)

The web app is already on your site at:

> **https://barkernotbob.github.io/static/Trashback.html**

This is a **hidden** page — it is not in any menu or sidebar. The only way to
reach it is to share that link directly.

Right now it can't talk to your data yet. These steps connect it to your
**Trashback 2025** Google Sheet so it can show the stats and let people add
games. You do this once.

Your game data stays in **your** Google Drive the whole time. Nobody else can
see or edit the sheet — they can only view stats and add games through the app.

---

## Step 1 — Open the script editor on your sheet

1. Open your **Trashback 2025** sheet:
   https://docs.google.com/spreadsheets/d/1jpKix662nMj59Xh7v7-j-goMNs3frUIBqALQzg1i6d4/edit
2. In the top menu click **Extensions → Apps Script**.
3. A new tab opens with a code editor. Delete whatever sample code is in there.
4. Open the file `google-apps-script/Code.gs` from this folder, copy **all** of
   it, and paste it into that editor.

## Step 2 — Set your passcode

Near the top of the pasted code, find the `CONFIG` block. Change this line:

```js
PASSCODE: 'changeme',
```

…to a passcode your group will use to add games, e.g. `PASSCODE: 'trash2025',`.
(Viewing the stats never needs the passcode — only adding a game does.)

The `SHEET_ID` is already filled in for your sheet, so leave it alone.

Click the **💾 Save** icon.

## Step 3 — Deploy it as a web app

1. Click the blue **Deploy** button (top right) → **New deployment**.
2. Click the gear ⚙️ next to "Select type" → choose **Web app**.
3. Fill in:
   - **Description**: `Trashback`
   - **Execute as**: **Me** (your email)
   - **Who has access**: **Anyone**
4. Click **Deploy**.
5. Google will ask you to **Authorize access** — click through, pick your
   Google account, and on the "Google hasn't verified this app" screen click
   **Advanced → Go to (your project) → Allow**. (This is just because it's your
   own private script.)
6. It shows a **Web app URL** ending in `/exec`. **Copy it.**

## Step 4 — Paste the URL into the app

1. Open `quartz/static/Trashback.html` in this repo.
2. Near the very top of the file, find this line:

   ```js
   const APPS_SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_URL_HERE";
   ```

3. Replace `PASTE_YOUR_APPS_SCRIPT_URL_HERE` with the URL you copied (keep the
   quotes).
4. Publish your site the usual way (run **Publish Changes.command**).

That's it. After the site rebuilds (~5 min), open
**https://barkernotbob.github.io/static/Trashback.html** — your historical
games will load, and anyone with the link can add new ones (they'll be asked
for the passcode the first time, then it's remembered on their device).

---

## Updating the passcode later

Repeat Step 2 with a new value, **Save**, then **Deploy → Manage deployments →
edit (pencil) → Version: New version → Deploy**. The URL stays the same.

## If you ever change anything in `Code.gs`

You must redeploy a **new version** (Deploy → Manage deployments → pencil →
New version → Deploy) for the change to take effect. The web app URL does not
change.

## Notes

- **CORS / "failed to fetch":** make sure "Who has access" is **Anyone** (not
  "Anyone with Google account").
- The app recomputes every stat (ratios, streaks, chemistry, etc.) in the
  browser from the raw game list, exactly like the Overview tab did — so the
  sheet only needs the raw `FInput` rows.
