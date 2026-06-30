# Reader features: Ko-fi · RSS · Comments

Three reader-facing features were added to the site. **RSS** already works. **Ko-fi** and
**comments** each need a couple of values from you before they switch on. None of this
requires code knowledge — each step is "open this file, change this line."

After any change here: double-click **Preview Website.command** to check it, then
**Publish Changes.command** to put it live.

---

## 1. Ko-fi "Support me" button

A small floating **Support me** button sits in the bottom-right corner of every page and
opens your Ko-fi page in a new tab.

**To turn it on — one value:**

1. Find your Ko-fi page name — the part after `ko-fi.com/` in your profile link. If your
   page is `https://ko-fi.com/isaiahbarker`, your name is `isaiahbarker`.
2. Open **`quartz/components/Body.tsx`**. Near the top, change this line:

   ```js
   const KOFI_NAME = ""
   ```

   to your name in the quotes:

   ```js
   const KOFI_NAME = "isaiahbarker"
   ```
3. Preview, then Publish.

While `KOFI_NAME` is left empty (`""`), the button simply doesn't show — so nothing breaks
if you forget. You only need your Ko-fi page *name*, not your login.

---

## 2. RSS feed (already on)

Your whole site publishes an RSS feed at:

**`https://barkernotbob.github.io/index.xml`**

Anyone can paste that link into a feed reader (Feedly, NetNewsWire, Reeder, etc.) to follow
new posts automatically. The homepage shows a **Subscribe via RSS** link, and feed readers
can also auto-detect the feed from any page.

- **New content** appears in the feed automatically.
- **Changed content** re-surfaces for readers whose app tracks updates (most do).
- **Per-section feeds** (e.g. *just* your YouTube picks) aren't built yet — we chose
  site-wide only for now. Ask Claude to add section feeds later if you want them.

> **Verify once, after the first build:** confirm the file exists at `/index.xml` on the
> live site. If a future Quartz version ever emits it under a different name, update the two
> links that point at it: one in `quartz/components/Head.tsx` (the auto-discovery `<link>`)
> and one in `content/index.md` (the homepage "Subscribe via RSS" link).

---

## 3. Page comments (and getting notified)

Visitors can leave comments at the bottom of **content pages** (notes, videos). Comments
are intentionally **off** on the homepage and on section/tag index pages.

Comments are powered by **giscus**, which stores each comment in this repo's **GitHub
Discussions**. The payoff: **GitHub emails you on every new comment** — that's your
notification, with no extra service to run.

### One-time setup — about 5 minutes

1. **Turn on Discussions.** Open
   `https://github.com/barkernotbob/barkernotbob.github.io/settings`, scroll to
   **Features**, and tick **Discussions**.
2. **Install the giscus app.** Open `https://github.com/apps/giscus` → **Install** →
   **Only select repositories** → pick `barkernotbob.github.io`.
3. **Get your two IDs.** Open `https://giscus.app`. In the **Repository** box type
   `barkernotbob/barkernotbob.github.io`. Under **Discussion Category** pick a category
   (the default **Announcements** is fine). Scroll to the **Enable giscus** code box and
   copy these two values it shows you:
   - `data-repo-id="..."`
   - `data-category-id="..."`
4. **Paste them in.** Open **`quartz.config.default.yaml`**, find the **comments** block,
   and fill the two empty quotes:

   ```yaml
   repoId: "PASTE-data-repo-id-HERE"
   categoryId: "PASTE-data-category-id-HERE"
   ```

   If you picked a category other than **Announcements**, also change the `category:` line
   to match.
5. **Preview, then Publish.**

### Make sure the emails reach you

Open the repo, click **Watch** (top-right) → **Custom** → tick **Discussions** (or choose
**All Activity**). GitHub then emails the address on your account whenever anyone comments.

> Until the two IDs are filled in, the comment box shows a giscus *setup* message instead of
> real comments. That's expected — finish steps 1–4 and it becomes a working comment box.

---

## Quick reference — what each feature touched

| Feature  | Files involved                                                              | Needs from you                          |
| -------- | -------------------------------------------------------------------------- | --------------------------------------- |
| Ko-fi    | `quartz/components/Body.tsx`, `quartz/styles/custom.scss`                   | Your Ko-fi page name                    |
| RSS      | `quartz/components/Head.tsx`, `content/index.md` (feed already auto-built)  | Nothing (verify `/index.xml` once)      |
| Comments | `quartz.config.default.yaml`, `quartz/styles/custom.scss`                   | Enable Discussions + 2 giscus IDs       |
