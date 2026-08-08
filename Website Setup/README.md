# Website Setup

One-time setup helpers. Nothing in this folder is published to the site.

## `YouTube Web Clipper Template.json`

An importable template for the **Obsidian Web Clipper** browser extension. It turns any
YouTube video page into a ready-to-publish note in your *Individual videos* section
(`content/youtube/recommended`) with the metadata already filled in — so you can't forget
a step.

**Install the clipper once:** https://obsidian.md/clipper (Chrome, Edge, Safari, Firefox).

**Import the template:** click the extension icon → ⚙️ **Settings** → **Templates** →
**Import** → pick this file.

**Point it at the right vault:** Settings → **General** → set **Vault** to **Website**
(the vault at `content/`), *not* KnoxLox. Everything in the Website vault publishes by
default, so a clipped note goes live on the next publish.

**Then, for every video:** open the video → click the clipper icon (the template
auto-selects itself from the trigger URLs) → optionally type your take after *"Why it's
worth a look:"* → **Save**. Then double-click **`Publish Changes.command`**.

Full walkthrough: *"Adding a video to Curated YouTube"* in [`../QUARTZ_GUIDE.md`](../QUARTZ_GUIDE.md).

### What's in the template

| Field | Value |
|---|---|
| Name | `YouTube → Individual videos` |
| Behavior | Create new note |
| Path | `youtube/recommended` |
| Note name | video title, with `" - YouTube"` stripped |
| Properties | `title` (text), `publish: true` (checkbox) |
| Body | `![](video-url)` + a `**Why it's worth a look:**` line |
| Triggers | `youtube.com/watch`, `youtu.be/`, `m.youtube.com/watch` |

If your Web Clipper version can't import the JSON, recreate it by hand from that table —
the `{{…}}` variables are visible in the file itself.

### Two things to check on first use

- **`publish: true` is belt-and-braces.** The Website vault publishes by default, so the
  property isn't required. It's harmless to keep. What you must never let in is
  `publish: false`.
- **Verify the embed renders.** The template writes the video as `![](url)`. The manual
  route documented in `QUARTZ_GUIDE.md` uses an explicit iframe
  (`<div class="video-embed"><iframe src="https://www.youtube.com/embed/ID" …>`). These are
  not the same thing and the markdown form has **not** been confirmed to render as a player
  on this site. Clip one video, preview it with `Preview Website.command`, and if it shows a
  broken image instead of a player, swap the body format to the iframe line.

_Ported 2026-08-08 from the abandoned branch `claude/quartz-video-publishing-g2zofr`
(original SHA `ee6739e`). The branch's accompanying guide text was **not** ported — it
described a Quartz Syncer / main-vault route that `QUARTZ_GUIDE.md` has since replaced with
the Website-vault + `Publish Changes.command` route._
