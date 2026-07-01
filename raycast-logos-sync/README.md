# Logos → Obsidian Sync (Raycast)

A small [Raycast](https://raycast.com) extension that runs the Logos → Obsidian
importer for you — on demand from Raycast, and automatically once an hour in the
background. It's a front door to `logos_to_md.py` from the `logos-import/`
toolkit; all the conversion logic lives there.

- **Reads the Logos database read-only** and never quits Logos, so the hourly
  background sync is safe to run while you're studying. (Worst case: a note you
  *just* typed and haven't saved is picked up on the next run.)
- Shows a toast with the result when you run it by hand
  (e.g. *"wrote 3 new/changed, skipped 540 unchanged"*), and keeps the last
  status under the command in Raycast.

## One-time setup

You need [Raycast](https://raycast.com) and [Node.js](https://nodejs.org) (LTS)
installed.

1. Unzip the importer toolkit somewhere permanent (it contains `logos_to_md.py`).
2. In Terminal, from this folder:
   ```
   npm install
   npm run dev
   ```
   `npm run dev` loads the extension into Raycast (leave it running the first
   time; once imported, the command stays in Raycast even after you stop it).
3. Open Raycast, search **Sync Logos Notes**, press **⌘ ,** (or open its
   preferences) and fill in:
   - **Obsidian Vault** — the folder that holds your notes, e.g. `~/ObsidianVault`.
   - **Toolkit Folder** — the folder that contains `logos_to_md.py`.
   - **Images** — leave on to download note images into the vault.

## Using it

- **Manually:** open Raycast, run **Sync Logos Notes**. You'll get a toast when
  it finishes.
- **Automatically:** it runs every hour in the background (the `interval` in
  `package.json`). Change or remove that value to adjust the cadence.

## Notes

- Requires `python3` (preinstalled on most Macs; the extension looks for it in
  the usual Homebrew and system locations).
- This extension reuses `logos-import/logos_to_md.py`. Point **Toolkit Folder**
  at wherever you unzipped it so there's a single copy to maintain.
- To publish to the public Raycast Store later, this needs store metadata
  (screenshots, categories) and passes their review — ask and it can be prepared.
