# Automatic receipt processing (the "robot")

This folder holds the **robot** that reads each receipt photo for you automatically,
a minute or two after you snap it — no "process my receipts" command needed.

- **What it is:** a GitHub Action (`process-receipts.yml`) that lives in your
  **private data repo** (`grocery-data`). Every time the app uploads a photo to the
  `inbox/` folder, the robot wakes up, reads the photo with Claude (the **Haiku**
  model — fast and cheap), fills in `db/items.json` / `db/receipts.json`, moves the
  photo to `receipts/`, and saves everything back.
- **What runs it:** *your* Claude subscription, via a one-time "login pass." Nothing
  is hosted by anyone else; the robot runs inside your own GitHub account, and your
  receipts never leave your private repo.

## One-time install (about 5 minutes)

You only need to do two things — add the robot file, and add your login pass.

### 1. Add the robot to your data repo
1. Open your **`grocery-data`** repo on GitHub.
2. Click **Add file ▸ Create new file**.
3. In the filename box, type exactly: `.github/workflows/process-receipts.yml`
   (the slashes create the folders automatically — this exact path is required).
4. Copy the entire contents of **`process-receipts.yml`** (next to this file) and
   paste it in.
5. Click **Commit changes**.

### 2. Add your subscription "login pass" as a hidden secret
1. Generate the pass once. In a terminal with Claude Code installed, run:
   `claude setup-token`
   (If you don't have Claude Code: `npm install -g @anthropic-ai/claude-code`, then
   run the command.) It opens a browser, you approve, and it prints a long code
   starting with `sk-ant-oat01-…`. Copy it.
2. In your `grocery-data` repo: **Settings ▸ Secrets and variables ▸ Actions ▸
   New repository secret**.
3. **Name:** `CLAUDE_CODE_OAUTH_TOKEN`  •  **Secret:** paste the `sk-ant-oat01-…` code.
4. Click **Add secret**.

That's it. Snap a receipt in the app; within a minute or two the robot reads it and
your item shows up in Search / Reports / Table.

## Notes
- The login pass lasts about a year; when it expires, run `claude setup-token` again
  and update the secret.
- Anything the robot can't read clearly is saved with a "needs review" flag, which
  you confirm in the app's **Review** tab — it never guesses silently.
- Want a different model (more accuracy) or a nightly run instead of per-upload?
  Both are one-line changes in `process-receipts.yml` (`--model …` and the `on:`
  trigger).
