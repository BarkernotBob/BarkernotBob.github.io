# Your Website Guide

This folder runs your personal website, **https://barkernotbob.github.io**, using
a tool called **Quartz**. Quartz turns plain text notes into web pages automatically.

You don't need to know any code to use it. This guide explains everything in plain words.

---

## The 3 things you'll actually do

### 1. Write or edit a note
- Your notes live in the **`content`** folder (inside this folder).
- Each note is a `.md` file (a "Markdown" file — just a text file you can type into).
  You can edit them in **Obsidian**, or any text editor.
- **Important:** A note only appears on your public website if it has this line at the
  very top:

  ```
  ---
  publish: true
  ---
  ```

  This is a safety switch so nothing goes public by accident. Only `publish: true` puts a
  note on the site. `publish: false`, or no `publish` line at all, keeps it private. (To
  take a page *back down* after it's been live, see **"Removing or hiding a page"** below.)

  > ⚠️ **Don't confuse `publish:` with `published:`.** Some notes (especially saved web
  > clippings) have a `published:` line — that's just a *date* the original was posted, and
  > it does **nothing** to your site. The on/off switch is `publish:` (with no "ed"), set to
  > `true` or `false`. It's often near the **bottom** of the note's settings block, so scroll
  > the whole block, not just the top.

### 2. Preview it on your own computer (private)
- **Double-click `Preview Website.command`** in this folder.
- A black window (Terminal) opens, builds your site, and your browser opens to a private
  preview at `http://localhost:8080`. Only you can see this.
- When you're done looking, close that black window (or press **Control + C** in it).

> First time only: macOS may say the file is "from an unidentified developer." Right-click
> the file → **Open** → **Open**. After that, double-clicking works normally.

### 3. Publish it to the internet (public)
- **Double-click `Publish Changes.command`** in this folder.
- It saves your changes and sends them to GitHub. Your live site updates by itself in
  about **1–2 minutes**.
- That's it — no other steps.

---

## How publishing works (the short version)

- [ ] When you double-click **Publish Changes**, your notes are sent to **GitHub** and GitHub then automatically rebuilds your site and puts the new version live. You don't manage any of that — it just happens.

You can watch a publish happen here (optional):
**https://github.com/BarkernotBob/barkernotbob.github.io/actions** — a green
check ✅ means it published successfully.

---

## Removing or hiding a page (unpublish)

You do **not** have to delete a note to take it off the website. To hide a page but keep
the note in your folder:

1. Open the note in the **`content`** folder (the real note — see the warnings below).
2. Change its switch to **`publish: false`** (or delete the `publish: true` line entirely).
3. **Double-click `Publish Changes.command`.**
4. Wait **1–2 minutes**, then refresh the page. It's gone from the site; the note is still
   safe in your folder.

To delete it for good (off the site *and* out of your folder), just delete the `.md` file
from the `content` folder and Publish.

### Three traps that make "it won't come down!" happen

These are exactly the things that can make a removed page keep showing:

1. **Edit the note in `content`, never in `public`.** The `public` folder is a throwaway
   copy the site rebuilds from scratch every time. Deleting something from `public` does
   nothing — it comes right back. The real note lives in `content`.
2. **`publish:` not `published:`.** `published:` is a date and is ignored. The switch is
   `publish: true` / `publish: false`. It's often the **last line** of the settings block.
3. **It's not instant.** After you Publish, the site takes ~1–2 minutes to rebuild, and your
   browser may show the old copy for a few more minutes. Force a fresh load with
   **Command + Shift + R**, or open the page in a private/incognito window.

### One exception: the game pages

The **BlockChain**, **HexChain**, and **Tax-Modeler** menu pages are special — they're
**rebuilt automatically** every time you Preview or Publish, so setting `publish: false` on
them won't stick. To remove one of those, delete its `.html` file from the `quartz/static`
folder **and** delete its line from the `GAMES` list inside both `Preview Website.command`
and `Publish Changes.command`. (Ask Claude if you want one pulled — it's a 30-second change.)

---

## Changing how the site looks or behaves

All settings — the site title, colors, fonts, menus, features — live in **one file**:

**`quartz.config.default.yaml`**

Open it in a text editor to change things like:
- `pageTitle: Quartz 5` → change `Quartz 5` to whatever you want your site called.
- Colors, fonts, and which features are on/off are all in there too.

After editing it: **Preview** to check it looks right, then **Publish**.

> Note: some Quartz help text online mentions a file called `quartz.config.yaml`. For
> *your* site, the file to edit is the one ending in `.default.yaml` shown above. That's
> the one your live site actually uses.

---

## Editing the wording on your site (in Obsidian)

All your words are plain text you edit in **Obsidian**. Open your vault (the `content`
folder) in Obsidian, then:

**The homepage words** (headline, intro, the card text):
1. Open the note named **`index`** (top level of `content`).
2. Switch to **source/edit mode** if it looks like a finished webpage (on desktop/iPad
   Obsidian, use the `⋯` menu → "Edit", or the `<>` toggle). You'll see the words mixed
   with some `<tags>`.
3. Type over the words you want to change — **leave the `<...>` bits alone**. For example:
   the headline `Play, build,` … `and think out loud.`, the intro starting
   `My corner of the internet —`, or a card line like `BlockChain & HexChain — …`.
4. Save, then double-click **Publish Changes.command**.

**A section's heading or intro** (Games / Tools / Notes / YouTube): open the **`index`**
note *inside* that folder (e.g. `content/games/index`) and edit the text there.

**Rename what shows at the top of a page:** change the `title:` line in the note's
settings block (between the `---` lines at the very top).

> If a homepage card ever looks broken after an edit, you probably changed a `<tag>` by
> accident. Ask Claude — it's a quick fix.

---

## Adding a video to Curated YouTube (in Obsidian)

1. In Obsidian, open the **`youtube`** folder (inside `content`). The example note
   **"The first-ever YouTube video"** shows the exact pattern.
2. **Make a new note there** — easiest: right-click the example → **Make a copy**, then
   rename it. (Copying means the embed code is already in place.)
3. Change the **`title:`** line at the top.
4. **Get the video's ID:** on YouTube, open the video → **Share** → copy the link. The ID
   is the code after `watch?v=` (or after `youtu.be/`). In
   `youtube.com/watch?v=abc123XYZ`, the ID is `abc123XYZ`.
5. In the note, replace the old ID in the embed line with yours (keep the rest):
   `<div class="video-embed"><iframe src="https://www.youtube.com/embed/PASTE_ID_HERE" title="My note" allowfullscreen></iframe></div>`
6. Write your thoughts underneath in normal text. Make sure the top has `publish: true`.
7. Double-click **Publish Changes.command**.

The video plays right on the page, with your note beneath it, and it auto-appears in the
list at `/youtube`. (Prefer a plain link instead of an inline player? Skip the embed line
and just paste a normal link to the video.)

---

## Adding a new card to the homepage

The homepage has four cards (Games, Tools, Notes, Curated YouTube). To add another:

1. Open the **`index`** note (top level of `content`) in Obsidian, in source/edit mode.
2. Find one of the existing card blocks — it looks like this:
   ```
   <a class="splash-card games" href="/games"><span class="splash-bar"></span>
     <div class="splash-ic">🎮</div>
     <div class="splash-h">Games</div>
     <p>BlockChain &amp; HexChain — 3D multiplayer strategy in your browser.</p>
     <span class="splash-go">Enter the arcade →</span>
   </a>
   ```
3. **Copy the whole block** (from `<a` to `</a>`) and paste it just before the closing
   `</div>` of the card grid. Then change four things in your new copy:
   - the **emoji** between `splash-ic` tags,
   - the **title** between `splash-h` tags,
   - the **description** in the `<p>`,
   - the **link** in `href="…"` and the **button text** in `splash-go`.
4. Point the `href` at wherever the card should go (an existing page, a new folder, or a
   full web link like `href="https://…"`).
5. Save and **Publish**.

> The four colored accents come from the word after `splash-card` (`games`, `tools`,
> `notes`, `yt`). For a brand-new color, ask Claude to add one — it's a tiny style tweak.
> Also: keep card titles as `<div class="splash-h">`, **not** a heading like `##` or
> `<h3>` — headings break the card layout.

---

## If something goes wrong

- **A publish shows a ⚠️ warning about "conflicts" or "couldn't combine changes":**
  This usually means the same note got edited in two places. Nothing is lost. Ask Claude
  to help untangle it.
- **The preview window shows red error text:** Copy the message and ask Claude.
- **You don't see your note on the live site:** Check it has `publish: true` at the top
  (see step 1), and that you ran **Publish Changes**.

---

## Adding apps or games (like BlockChain 3D)

A self-contained app/game is a single `.html` file. To put one on your site:

1. **Drop the `.html` file into the `quartz/static` folder.** (Your BlockChain game also
   copies itself in automatically from your vault every time you Preview or Publish.)
2. **Preview or Publish.** That's it.

When you do, two things happen automatically:
- The file is served untouched at `https://barkernotbob.github.io/static/<FileName>.html`.
- A **menu entry** appears for it. Clicking that entry takes you **straight into the
  app full-screen** — no in-between page.

So any future game you add to `quartz/static` behaves exactly like BlockChain 3D, with
zero extra setup. (If you ever *don't* want a menu entry for one, delete the matching
`.md` file that got created in the `content` folder.)

> Why a file and not a normal note: these apps run their own special start-up code that
> only works when the page loads fresh. A regular Quartz note wraps pages in the site's
> layout and uses fast in-place swapping, which stops that code from running. Serving the
> file raw (and jumping straight to it) avoids that — which is why the menu now routes you
> directly to the game.

---

## Behind-the-scenes notes (you can ignore these)

- The actual website pages are generated into a `public` folder. You never edit that —
  Quartz rewrites it every time. It's not published from your computer; GitHub builds its
  own copy.
- "Git" / "GitHub" = the system that stores your files online and triggers the rebuild.
  The two `.command` files handle all the Git steps for you.
- Your computer runs Node version 24 (the engine Quartz needs). It's already installed.
- The engine files live in a folder named **`node_modules.nosync`**. The `.nosync`
  ending tells iCloud to leave it completely alone — iCloud had been deleting parts of
  it to "save space," which is what broke your preview. The `node_modules` you see is
  just a shortcut pointing to that protected folder. If the shortcut ever breaks,
  **Preview Website.command** rebuilds it automatically — you don't need to do anything.
