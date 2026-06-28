# Website Setup

One-time setup helpers for publishing to the site.

## `YouTube Web Clipper Template.json`

An importable template for the **Obsidian Web Clipper** browser extension. It turns any
YouTube video page into a ready-to-publish note in your *Individual videos* section
(`content/youtube/recommended`) with the right metadata already filled in:

- `title` — the video's title
- `publish: true` — so it actually goes live
- an inline player embed (`![](video-url)`)

**How to use it:** see the section *"Adding a video — the one-click way (Obsidian Web
Clipper)"* in [`../QUARTZ_GUIDE.md`](../QUARTZ_GUIDE.md). In short: install the clipper,
point it at your `content` vault, then Templates → Import → pick this file.

> If your version of the Web Clipper can't import the file, the guide also lists every
> field by hand so you can recreate it in a minute.
