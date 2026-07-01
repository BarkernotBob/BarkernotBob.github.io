# Logos → Obsidian notes import

Tools to pull your **Logos Bible Software** notes into your Obsidian vault as
Markdown, with clickable Bible references, organized by passage.

Only text notes are imported — plain highlights are skipped. Re-running is safe:
each note carries a hidden `logos_id`, so re-syncing **updates** notes in place
instead of creating duplicates, and never touches notes you wrote directly in
Obsidian.

## Files here

| File | What it is |
|------|-----------|
| `logos_to_md.py` | The converter (Python 3, no extra libraries needed). |
| `Import Logos Notes.command` | Double-click launcher for macOS — finds your database and runs the converter. |
| `Notes by Passage.base` | An Obsidian **Bases** view that lists every imported note sorted in Bible order. Copy it into your vault. |

---

## One-time bulk import (two ways)

### Option A — drag in the pre-made notes (no Terminal)
1. Unzip `LogosNotes-Obsidian.zip` (sent to you separately).
2. Drag the `Logos` folder it contains into your Obsidian vault.
   - In these notes, the ~10 that contain images link to Logos's servers, so
     images show only when you're online. To save them permanently, run Option B
     once (it downloads them into the vault).

### Option B — run the converter yourself (also downloads images)
1. Make sure **Logos is quit** (⌘Q) so the database isn't mid-write.
2. Double-click **`Import Logos Notes.command`**.
   - First time only: if macOS blocks it, open
     <https://support.apple.com/guide/mac-help/mh40616/mac> — System Settings →
     Privacy & Security → "Open Anyway".
3. When it asks for your vault path, press **Return** to accept `~/KnoxLox`, or
   paste the folder that holds your Obsidian notes.
4. It writes everything into `<your vault>/Logos`, organized by book.

---

## Long-term re-sync (Logos is the source of truth)

Whenever you add or edit notes **in Logos** and want them in Obsidian:

1. Quit Logos (⌘Q).
2. Double-click **`Import Logos Notes.command`**.

That's it. Changed notes update in place; new notes appear; your Obsidian-only
notes are left alone.

---

## Seeing your notes organized by passage

The notes are already grouped into folders by book (`Logos/Genesis`, etc.), and
every note has:

- `passages:` — the Bible passage(s) it's anchored to, written as wikilinks to
  your local Bible chapter note with a heading anchor to the exact verse, e.g.
  `[[Joel 2#12|Joel 2:12]]`. Verse ranges link to the first verse of the range.
- `passage_sort:` — a number (`book·chapter·verse`) that sorts in true Bible
  order (needed because a passage list sorts alphabetically otherwise).

To get one sortable table of everything:

1. Copy **`Notes by Passage.base`** into your vault (anywhere).
2. Open it in Obsidian. You'll get three views: **Notes by Passage**,
   **Grouped by Book**, and **Recently Updated**.
   - Requires Obsidian 1.8+ (Bases is built in). No plugin needed.

Prefer Dataview instead? Paste this into any note:

````markdown
```dataview
TABLE passages AS "Passages", notebook AS "Notebook", updated AS "Updated"
FROM "Logos"
WHERE source = "logos"
SORT passage_sort ASC
```
````

---

## The occasional Obsidian → Logos note (manual)

Logos has no way to import notes from a file, so the automated direction is only
Logos → Obsidian. For the rare note you write in Obsidian first and want in
Logos, use the copy/paste round-trip:

**Logos → Obsidian (get the note's ID):** in Logos, `⌘ + ^ + C` copies the note
location; keep only the part before `&` to get the note id.

**Obsidian → Logos (push a note back):**
1. In Obsidian: `⌘A`, `⌘C` (select all, copy).
2. Open Logos, click into the note, `⌘V`.
3. `⌘ + ⇧ + V` twice (paste as plain / advanced), then `⌘A`, `⌘C`.
4. Back in Obsidian: `⌘V` to reconcile formatting.

---

## How references are converted

An inline Logos reference like
`<Reference Reference="bible+esv.83.2.15-83.2.17">1 John 2:15-17</Reference>`
becomes:

```markdown
[1 John 2:15-17](https://ref.ly/1Jn2.15-17)
```

Links are translation-agnostic (they open the passage, not a specific
translation). Commentary/resource links that already carry a `ref.ly` URL are
preserved as-is.
