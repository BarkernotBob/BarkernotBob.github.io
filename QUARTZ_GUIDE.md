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

  This is a safety switch so nothing goes public by accident. No `publish: true` = it
  stays private and won't show on the site. (Right now, "Why Anecdotes Trump Data" is
  *not* published because it's missing this line.)

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
