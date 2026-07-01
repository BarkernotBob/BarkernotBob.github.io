# Logos → Obsidian (Raycast)

A small [Raycast](https://raycast.com) extension for your Logos Bible notes. Two
commands, both a thin front door to the Python in the `logos-import/` toolkit
(all the conversion logic lives there — one source of truth):

- **Sync Logos Notes** — imports/refreshes your notes into an Obsidian vault, on
  demand and automatically once an hour.
- **Search Notes** — full-text search across every note (body, notebook, tags,
  and anchored Bible reference), with an in-Raycast preview and one-keystroke
  "Open in Logos."

Both **read the Logos database read-only** and never quit Logos, so they're safe
to run while you're studying. (Worst case: a note you *just* typed and haven't
saved shows up on the next run.)

## Search Notes

Type to filter across everything at once — note text, notebook name, tags, and
the note's Bible reference (e.g. searching `Romans 8` finds notes anchored there
even if the body doesn't say it). Actions:

- **Enter** — preview the note (converted text + metadata) inside Raycast.
- **⌘↵** — open that exact note in the Logos desktop app.
- **⌘⇧↵** — open the note's anchored Bible reference (when it has one).
- **⌘C** — copy the note's text.
- **⌘R** — reload from the database (after editing in Logos).

## Sync Logos Notes

Shows a toast with the result when you run it by hand
(e.g. *"wrote 3 new/changed, skipped 540 unchanged"*), and keeps the last status
under the command in Raycast. Runs every hour in the background (the `interval`
in `package.json` — change or remove it to adjust the cadence).

## One-time setup

You need [Raycast](https://raycast.com) and [Node.js](https://nodejs.org) (LTS)
installed.

1. Unzip the importer toolkit somewhere permanent (it contains `logos_to_md.py`
   and `logos_notes_json.py`).
2. In Terminal, from this folder:
   ```
   npm install
   npm run dev
   ```
   `npm run dev` loads the extension into Raycast (leave it running the first
   time; once imported, the commands stay in Raycast even after you stop it).
3. Open Raycast, open either command's preferences (**⌘ ,**) and fill in:
   - **Obsidian Vault** — the folder that holds your notes, e.g. `~/ObsidianVault`
     (used by *Sync Logos Notes*).
   - **Toolkit Folder** — the folder that contains the toolkit scripts.
   - **Images** — leave on to download note images into the vault (sync only).
   - **Logos Data Directory** — optional; only set this if *Search Notes* can't
     auto-find your notes database.

## Notes

- Requires `python3` (preinstalled on most Macs; the extension looks for it in
  the usual Homebrew and system locations).
- Both commands reuse the `logos-import/` scripts. Point **Toolkit Folder** at
  wherever you unzipped them so there's a single copy to maintain.
- **Search Notes** shells out to `logos_notes_json.py`, which uses the same
  converter as the importer — so search text and references match your synced
  notes exactly, with no separate rich-text parser to keep in sync.
- To publish to the public Raycast Store later, this needs store metadata
  (screenshots, categories) and passes their review — ask and it can be prepared.
