# Your Website Guide

This folder runs your personal website, **https://isaiahmail97-oss.github.io**, using
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

When you double-click **Publish Changes**, your notes are sent to **GitHub** (a website
that stores your files online). GitHub then automatically rebuilds your site and puts the
new version live. You don't manage any of that — it just happens.

You can watch a publish happen here (optional):
**https://github.com/isaiahmail97-oss/isaiahmail97-oss.github.io/actions** — a green
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
- The file is served untouched at `https://isaiahmail97-oss.github.io/static/<FileName>.html`.
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
