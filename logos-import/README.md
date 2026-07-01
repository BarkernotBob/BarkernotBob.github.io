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
| `resource-titles.md` | Starter list of names for notes anchored to a book/commentary. A live copy is made in your vault on first import — edit that one (see below). |

---

## One-time bulk import (two ways)

### Option A — drag in the pre-made notes (no Terminal)
1. Unzip `LogosNotes-Obsidian.zip` (sent to you separately).
2. Drag the `Logos` folder it contains into your Obsidian vault.
   - In these notes, the ~10 that contain images link to Logos's servers, so
     images show only when you're online. To save them permanently, run Option B
     once (it downloads them into the vault).

### Option B — run the converter yourself (also downloads images)
1. Double-click **`Import Logos Notes.command`**. (It quits Logos for you first,
   so the database is a complete snapshot — you don't need to quit it manually.)
   - First time only: if macOS blocks it, open
     <https://support.apple.com/guide/mac-help/mh40616/mac> — System Settings →
     Privacy & Security → "Open Anyway".
2. When it asks for your vault path, press **Return** to accept `~/KnoxLox`, or
   paste the folder that holds your Obsidian notes.
3. It writes everything into `<your vault>/Logos`, organized by book.

---

## Long-term re-sync (Logos is the source of truth)

Whenever you add or edit notes **in Logos** and want them in Obsidian, just
double-click **`Import Logos Notes.command`**. It quits Logos, then syncs.

The sync is **incremental**: notes whose content hasn't changed are left
untouched (not rewritten), already-downloaded images are not re-fetched, and
only new or edited notes are written. New notes appear, edited notes update in
place (matched by `logos_id`), and notes you created directly in Obsidian are
never touched.

---

## Seeing your notes organized by passage

The notes are already grouped into folders by book (`Logos/Genesis`, etc.), and
every note has:

- `passages:` — the Bible passage(s) it's anchored to, written as wikilinks to
  your local Bible chapter note with a heading anchor to the exact verse, e.g.
  `[[Joel 2#12|Joel 2:12]]`. Verse ranges link to the first verse of the range.
- `passage_sort:` — a number (`book·chapter·verse`) that sorts in true Bible
  order (needed because a passage list sorts alphabetically otherwise).
- `logos_link:` — a clickable link straight back to the same note in Logos, for
  jumping between the two systems (see below).

## Jumping back to the original note in Logos

Every note has a clickable **↗ Open in Logos** link at the top of its body, plus
a matching `logos_link:` property. Both use Logos's native `logos4:` URL scheme,
e.g. `logos4:NotesTool?EditNoteId=7e83d783ba304433992a7a4287ea67cf`, which hands
off straight to the **Logos desktop app** (not the browser). It's the round-trip
companion to the `passages:` links, which go the other way (into your Obsidian
Bible).

- Click the **↗ Open in Logos** link in the note body to jump to that exact note
  in the app. (The first time, Obsidian may ask permission to open an external
  app — allow it.)
- The `logos_link:` property holds the same URL; because Obsidian only makes
  `http/https` values clickable in the Properties panel, a `logos4:` value there
  shows as plain text — that's why the clickable copy lives in the body.

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

## Notes anchored to a book/commentary (not the Bible)

Most notes are filed under their Bible passage. A note anchored in Logos to a
*non-Bible* resource (a commentary, a book like Owen's *Works*) instead gets
filed and named by that resource's title.

Logos's database stores only opaque resource IDs (e.g. `LLS:WORKSOWEN06`), not
titles. So there's a small editable list mapping each ID to a readable name.

**Where to edit it:** after your first import, open the note
**`Logos/resource-titles.md`** right inside Obsidian. Put a readable name after
the equals sign for each ID, e.g.

```
LLS:WORKSOWEN06 = The Works of John Owen, Vol. 6
```

Re-run the launcher and those notes automatically move into a folder with that
name (and any old, now-empty folder is cleaned up). Any ID you leave blank falls
back to the raw code as the folder name.

**You never have to hunt for the IDs.** Each import automatically adds any new
resource IDs it finds to that list (blank), so the next time you open it the new
ones are already waiting for you to name. The copy of `resource-titles.md` next
to the launcher is just a starter seed used to create the in-vault one; once the
vault copy exists, that's the only one you edit.

**Every note records where it came from.** Any note anchored to a resource gets
a `resources:` property listing that resource — as the raw Logos ID (e.g.
`LLS:TOTC19PSBUS`) until you name it, then as `Title (ID)`. So you can always
open a note and see its source, and you can find every note from a given
resource by searching its ID. This works even when the note is *also* filed
under a Bible passage: e.g. a note on a Kidner-*Psalms* comment about Psalm 127
is filed under **Psalms** but still carries `resources: ["LLS:TOTC19PSBUS"]`.

Bible translations are deliberately left off (they'd otherwise tag hundreds of
notes with "ESV"): a note anchored to a Bible verse is already described by its
`passages`, so only *non-Bible* resources are recorded. They're told apart
automatically — no configuration.

*(Why did Owen's come pre-named but not the others? Its ID, `WORKSOWEN06`, is
readable enough to guess — "Works of Owen, vol. 6". The rest are cryptic codes
or random hashes with no reliable way to recover the title from the ID alone,
so those are left for you to fill in.)*

---

## Searching & filtering by book / chapter / verse

Each note carries three plain, filterable lists (separate from the pretty
`passages` links):

- `books:` — e.g. `Romans`
- `chapters:` — e.g. `Romans 8`
- `verses:` — e.g. `Romans 8:6` (verse ranges are expanded, so a note on
  `Romans 8:5–9` matches a search for `Romans 8:7`)

These exist because Bases's **contains** operator matches whole list items, not
substrings — so filtering `passages` for "Romans 8" only finds the exact chapter,
never `Romans 8:6`. Filter these fields instead:

| To see… | In the Bases **Filters** panel, add |
|---|---|
| Everything in a book | `books` **contains** `Romans` |
| Everything in a chapter | `chapters` **contains** `Romans 8` |
| A specific verse | `verses` **contains** `Romans 8:6` |

The `Notes by Passage.base` file ships with three worked example views
(`Example — book/chapter/verse`) you can duplicate and edit.

**Zero-setup alternative — backlinks.** Because passages are wikilinks to your
Bible, open any Bible chapter note (e.g. `Romans 8`) and its **Backlinks** pane
lists every Logos note that references that chapter.

Dataview equivalents:

````markdown
```dataview
LIST FROM "Logos" WHERE contains(books, "Romans")
```
```dataview
LIST FROM "Logos" WHERE contains(chapters, "Romans 8")
```
```dataview
LIST FROM "Logos" WHERE contains(verses, "Romans 8:6")
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
