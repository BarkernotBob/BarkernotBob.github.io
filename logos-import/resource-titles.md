# Resource titles

Some Logos notes are anchored to a book or commentary instead of a Bible
passage. Those get named and foldered by the resource, and every note records
its source resource in a `resources:` property so you can always trace it.
Logos only stores an opaque ID, so type a readable name after the equals sign
for each ID you care about, then re-run the importer — the matching notes move
into a folder with that name and the readable title is added to their
`resources:` property. Leave one blank and it just uses the raw code. New IDs
are added here automatically as you make more such notes.

This is the starter copy that ships with the toolkit. On first import a live
copy is created inside your vault at `Logos/resource-titles.md` — after that,
edit THAT one (you can open it right in Obsidian) and it becomes the source
of truth. The two example lines below are just to show the format; your own
resource IDs are filled in automatically the first time you import.

(Bible translations are detected automatically and left off this list — a note
anchored to an ESV or CSB verse is already covered by its passage, so it isn't
tagged with the translation.)

```
# Format:  <ResourceId> = <the name you want to see>
LLS:EXAMPLECOMMENTARY = Example Commentary Title
PBB:00000000000000000000000000000000 = My Personal Book Title
```
