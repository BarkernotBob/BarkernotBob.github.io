# Studio — v1 scope

Local edit-in-place layer over the real site, plus a Publish button.

## Red-team (required gate)

**Closest existing tools, and why they're not enough:**

| Tool | Does | Doesn't |
|---|---|---|
| **Obsidian** (already installed, vault = this repo) | Edit text, move/rename pages, create pages, edit tags, file tree | Shows Obsidian's rendering, not the site's. No publish. Can't edit `quartz/static/*.html` apps meaningfully. |
| **GitHub web editor** | Edit + commit from anywhere | Raw text only, no site rendering, slow round-trip |
| **Decap / TinaCMS** | Real in-site CMS | Built for their own scaffolds; heavy retrofit onto Quartz v5 + plugin loader; auth/backend assumptions we don't want locally |
| **`quartz build --serve`** (have it) | Live-rebuilds the real site on file change | Read-only. No editing, no publish. |

**The one reason this wins:** the gap isn't *editing files* — Obsidian already does that well. The gap is **seeing the actual published site while you change it, and shipping without leaving the page.** Everything in v1 targets that gap and nothing else.

**Where Obsidian stays better:** long-form writing, backlinks, search across notes. Studio is not trying to replace it. Studio is for "look at the site, fix what's wrong, publish."

## v1 — smallest version that delivers value

A stranger opens one file and gets: the site, editable, with a Publish button.

1. **`Edit Website.command`** — double-click. Starts Quartz's normal serve (8080) + Studio proxy (8081), opens `localhost:8081`.
2. **Site renders exactly as live.** Studio is a reverse proxy that injects one overlay script. Zero changes to how pages are built.
3. **Click any block → edit it in place.** The block is replaced by an editor holding *that block's literal markdown source*, sized to match. Save splices those exact bytes back into the file. Quartz rebuilds, block re-renders.
4. **Frontmatter panel** — title, tags, publish flag, order. Structured fields, not raw YAML.
5. **Page operations** — new page, rename, move (drag in the existing site explorer), delete (to trash, not permanent).
6. **Static HTML apps** (`quartz/static/*.html`) — full-file source editor, live reload. No block splicing (not markdown).
7. **Publish button** — runs the existing `Publish Changes.command` logic, streams progress, links the Actions run and the live URL.
8. **Regression suite** — Playwright, runs on deploy, per repo rules.

## Explicitly v2 (do not build now)

- Rich-text WYSIWYG (bold buttons, HTML→Markdown conversion)
- Image upload / drag-drop media
- Multi-machine or remote editing
- Editing site config or theme from the UI
- Undo history beyond single-file backups

## Bulletproofing rules (non-negotiable)

- **Never convert HTML back to Markdown.** Every write is literal source text the user typed or that was read off disk. This is the single rule that makes it safe.
- **Atomic writes** — temp file + rename, never a partial file on disk.
- **Backup before every write** to `.studio-backups/` (gitignored), keep last N.
- **Stale-write guard** — editor holds the file's mtime+hash; if disk changed underneath (Obsidian, git pull), refuse and show a diff instead of clobbering.
- **Path jail** — every path resolved and asserted to live under `content/` or `quartz/static/`. No traversal.
- **Bind to 127.0.0.1 only.** Never expose the write API on the network.
- **Studio never runs in CI.** The overlay is injected by the proxy, so a normal build/deploy is byte-identical to today.

## Acceptance criteria

- [ ] Double-clicking `Edit Website.command` opens an editable site with no terminal interaction
- [ ] Editing a paragraph in `notes/Chiasm.md` changes only those bytes on disk (`git diff` shows a one-block change)
- [ ] Editing the raw-HTML splash in `index.md` round-trips with zero character changes outside the edit
- [ ] Adding a tag updates frontmatter and the tag page rebuilds
- [ ] Moving a page updates its location and the sidebar reflects it
- [ ] A file changed in Obsidian mid-edit triggers the stale-write guard, not a clobber
- [ ] Publish pushes and the live site reflects the change
- [ ] `npx quartz build` output with Studio absent is unchanged from today

## Manual test (for Isaiah)

Do these in order. Each step says what you should see. If any step doesn't match, stop and say which number failed.

**Starting up**

1. In Finder, open your website folder and double-click **`Edit Website.command`**. A black Terminal window opens and prints some setup lines.
2. Wait for it to print `✅ Your website editor is open at http://localhost:8081`. Your browser opens by itself to your site. *(First run can take up to a minute. If the page says "starting up", leave it — it refreshes itself.)*
3. The site should look **exactly** like the real one, plus a small dark toolbar in the bottom-right corner with **Edit / Page / New / Go to / Publish**.

**Editing a paragraph**

4. Click into any note (for example, use the file list on the left).
5. Click **Edit** in the toolbar. It turns blue and says "Editing", and paragraphs get a faint dashed outline when you hover them.
6. Click one paragraph. It turns into a text box showing that paragraph's raw text. **The rest of the page should not jump around.**
7. Change a word. Click **Save**. A green message appears and the page re-renders with your change.
8. Click that same paragraph again and confirm your new word is really there. This proves it was saved to the file, not just to the screen.
9. Click the paragraph again, change something, then click **Cancel**. Nothing should change.
10. Click **Edit** again to turn editing off. The dashed outlines disappear.

**Tags, title, and moving a page**

11. With a note open, click **Page**. A window opens showing Title, Tags, and Folder.
12. Type a tag into the tag box and press Return — it appears as a chip. Click the little **×** on it to remove it. Add one back.
13. Change the Title, click **Save**. The page reloads with the new title.
14. Open **Page** again, change **Folder** to a different existing folder name, click **Save**. The browser goes to the page's new address and the left-hand file list shows it in the new folder.
15. Move it back the same way.

**Adding a page**

16. Click **New**. Type a title, pick a folder, click **Create**.
17. You land on the brand-new empty page. Click **Edit**, click the body, type a sentence, **Save**.

**Deleting a page, and getting it back**

18. On that new page, click **Page** → **Delete page**. Confirm. Studio **moves you off the page by itself** (to the folder it was in, or home) — you should never be left sitting on a page that no longer exists.
19. Try to visit the deleted page's address directly. You should get a "not found" page, not the old copy.
20. Click **Publish** → **View deleted pages**. Your page is listed there with the date. Click **Put it back** — the page is restored and Studio opens it.
21. Delete it again (you'll create and remove things in the next section anyway).

**Undoing things before they go live**

22. Click **Publish**. Every unpublished action is listed: **New page / Edited / Moved / Deleted**, with the page name.
23. Pick one and click **Open** — it takes you to that page. Come back with **Publish**.
24. Pick one and click **Undo**, then **Sure?** to confirm. It disappears from the list and the change is reversed. *(A copy of the file before the undo is kept in the backups folder, so an undo can itself be undone.)*
25. Undo everything in the list. The panel should say "Nothing to publish", and **Publish now** should be greyed out and unclickable.

**Games and their landing pages**

26. Click **Go to** (or press `G`), type part of a game's name, and pick it. You land on that game's **landing page** — the short note that normally forwards visitors to the game. A message explains Studio kept you there on purpose, with an **Open the app** button.
27. Click **Edit** and change a word on that landing page to prove it's editable. Undo it afterwards via **Publish → Undo**.
28. Click **Open the app** to go into the game itself. From inside the game, click **Go to** again — that's your way back out. *(Games are full-screen and have no link back to the site, so this is the only exit besides the browser's Back button.)*
29. While inside a game, click **Edit**. You get a message that this page edits its **HTML source** directly. You're **not** expected to do this day-to-day — the step just confirms Studio tells you the truth instead of silently doing nothing.

**The backups net**

30. Click **Publish → Open the backups folder**. Finder opens `.studio-backups`, holding dated copies of every file you changed today. Nothing you did above is unrecoverable.

**Publishing**

31. Make one small real edit you actually want to keep, then click **Publish**. Check that the change list describes exactly that edit and nothing else.
32. Click **Publish now**. The live progress log appears — the same text the old Publish script showed.
33. When it finishes, the list empties and **Publish now** goes grey. It should **not** be clickable again until you make a new change.
34. After about 5–6 minutes, open **https://barkernotbob.github.io** in a normal browser tab and confirm your edit is live.

**Shutting down**

35. Go back to the Terminal window and close it (or press `Control + C`). The editor stops. Your real site is unaffected — it only changes when you press Publish.

**What must never happen** (if you see any of these, it's a bug, report it):

- The site looking different in the editor than it does live.
- A click making the page shift, resize, or jump.
- Text you didn't touch changing after a save.
- A save appearing to work but the change being gone after a refresh.
- Being left sitting on a page you just deleted, or not landing on a page you just created.
- A deleted page still loading at its old address.
- The publish count saying something changed without the list saying *what*.
