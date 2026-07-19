#!/usr/bin/env node
// patch-plugins.mjs — teaches two freshly-installed Quartz community plugins to honor a
// numeric `order:` frontmatter field, so you can hand-sort any folder's list page AND the
// left sidebar (see QUARTZ_GUIDE.md → "Changing the order pages appear in").
//
// WHY THIS EXISTS: the live build (and a fresh local setup) runs `npx quartz plugin install`,
// which re-downloads these plugins and wipes any hand edits to their compiled `dist/` files.
// So the order support can't live as a committed source edit — it has to be re-applied after
// every install. This script is the single source of truth for that, and is invoked from:
//   - .github/workflows/deploy.yml  (live GitHub Pages build)
//   - Publish Changes.command       (local publish)
//   - Preview Website.command       (local preview)
// right after the existing `sed` plugin patches. It is idempotent: a guard marker makes
// re-runs a no-op, and it prints what it did (or why it skipped).
//
// The two pieces:
//   1. folder-page  — sorts the items shown ON a folder's index page (e.g. /games).
//   2. content-index — adds `order` to contentIndex.json, the data the SIDEBAR reads. The
//      sidebar's own sort is the `sortFn` in quartz.config.default.yaml (committed), which
//      reads `a.data.order`; without this it'd always be undefined.

import { readFileSync, writeFileSync, existsSync } from "node:fs"

const MARKER = "/* order-frontmatter patch */"
const PUBLISH_MARKER = "/* publish-by-default patch */"
const RSS_MARKER = "/* rss-exclude-tags patch */"
let patched = 0
let skipped = 0

function patchFile(path, transform, marker = MARKER) {
  if (!existsSync(path)) {
    console.warn(`  ⚠ not found (skipped): ${path}`)
    return
  }
  const src = readFileSync(path, "utf8")
  if (src.includes(marker)) {
    skipped++
    return
  }
  const out = transform(src)
  if (out === null) {
    console.warn(`  ⚠ anchor not found, left unchanged: ${path}`)
    return
  }
  writeFileSync(path, out, "utf8")
  patched++
  console.log(`  ✓ patched ${path}`)
}

// --- 1. folder-page: order-aware comparator in byDateAndAlphabeticalFolderFirst ---
// Insert the order check right after the folder-first guard and before the date sort.
// Param names are captured by regex so this survives a bundler renaming them.
const folderPageFiles = [
  ".quartz/plugins/folder-page/dist/index.js",
  ".quartz/plugins/folder-page/dist/components/index.js",
]
const folderAnchor =
  /if \(!\w+IsFolder && \w+IsFolder\) return 1;\n([ \t]*)if \((\w+)\.dates && (\w+)\.dates\) \{/
for (const f of folderPageFiles) {
  patchFile(f, (src) => {
    const m = src.match(folderAnchor)
    if (!m) return null
    const [, indent, a, b] = m
    const block =
      `${indent}${MARKER}\n` +
      `${indent}const __ao = ${a}.frontmatter?.order;\n` +
      `${indent}const __bo = ${b}.frontmatter?.order;\n` +
      `${indent}if (typeof __ao === "number" && typeof __bo === "number") return __ao - __bo;\n` +
      `${indent}if (typeof __ao === "number") return -1;\n` +
      `${indent}if (typeof __bo === "number") return 1;\n`
    return src.replace(
      folderAnchor,
      (full) => full.replace(`${indent}if (${a}.dates`, `${block}${indent}if (${a}.dates`),
    )
  })
}

// --- 2. content-index: include `order` in each entry of contentIndex.json ---
// The frontmatter var name is captured so a rename won't silently break the patch.
const contentIndexFile = ".quartz/plugins/content-index/dist/index.js"
patchFile(contentIndexFile, (src) => {
  const fmMatch = src.match(/const (\w+) = data\.frontmatter \?\? \{\};/)
  const anchor = /description: data\.description \?\? ""\n([ \t]*)\}\);/
  if (!fmMatch || !anchor.test(src)) return null
  const fm = fmMatch[1]
  return src.replace(
    anchor,
    (_full, indent) =>
      `description: data.description ?? "", ${MARKER} order: typeof ${fm}.order === "number" ? ${fm}.order : void 0\n${indent}});`,
  )
})

// --- 3. explicit-publish: honor publishByDefault option ---
// The plugin as shipped ignores the publishByDefault option entirely — it only publishes
// notes with an explicit publish:true. This patch makes it:
//   - hide anything with publish:false or draft:true
//   - publish everything else when publishByDefault is true (set in quartz.config.default.yaml)
//   - fall back to requiring publish:true when publishByDefault is false/absent
const explicitPublishFile = ".quartz/plugins/explicit-publish/dist/index.js"
patchFile(explicitPublishFile, (src) => {
  // Accept opts so the outer function receives the plugin options from quartz config
  const withOpts = src.replace("() => ({", "(opts) => ({")
  if (withOpts === src) return null
  // Replace the shouldPublish body
  const oldReturn = "return frontmatter?.publish === true || frontmatter?.publish === \"true\";"
  const newReturn =
    `${PUBLISH_MARKER}\n` +
    `    if (frontmatter?.publish === false || frontmatter?.publish === "false") return false;\n` +
    `    if (frontmatter?.draft === true || frontmatter?.draft === "true") return false;\n` +
    `    if (opts?.publishByDefault) return true;\n` +
    `    return frontmatter?.publish === true || frontmatter?.publish === "true";`
  if (!withOpts.includes(oldReturn)) return null
  return withOpts.replace(oldReturn, newReturn)
}, PUBLISH_MARKER)

// --- 4. content-index: clean up the RSS feed ---
// The RSS emitter iterates the WHOLE content index, so auto-generated list pages pollute the
// feed and redirect-stub pages dump their raw "Loading… click here" HTML into the entry body.
// We make two changes to the feed ONLY (sitemap + search index are untouched):
//   A. FILTER OUT non-articles: tag list pages (slug under tags/) and home/folder landing
//      pages (slug "index" or ending /index, e.g. the "Theology" folder page).
//   B. CLEAN UP static-file launchers: the games/tools/essay stubs whose whole job is to
//      redirect to a /static/*.html app. Instead of their ugly raw HTML, emit a tidy
//      "Open <title> →" link (pointing at the same /static file). Detected by the
//      data-static-redirect marker. Relies on rssFullHtml:true (quartz.config.default.yaml)
//      so the launcher's HTML lands in richContent where we can see + parse that marker.
// Two anchors, both inside generateRSSFeed: the `const items = Array.from(idx).sort(` list
// builder, and the `${content.richContent ?? content.description}` description expression.
patchFile(contentIndexFile, (src) => {
  const itemsAnchor = "const items = Array.from(idx).sort("
  const descAnchor = "${content.richContent ?? content.description}"
  if (!src.includes(itemsAnchor) || !src.includes(descAnchor)) return null
  const helper =
    `function __rssBody(content, base) { ${RSS_MARKER} ` +
    `var rc = content.richContent; ` +
    `if (rc && rc.indexOf("data-static-redirect") !== -1) { ` +
    `var m = rc.match(/data-static-redirect=(?:"|&quot;)([^"&]+)/); ` +
    `if (m) return '<p><a href="https://' + base + m[1] + '">Open ' + escapeHTML(content.title || "page") + ' →</a></p>'; ` +
    `return content.description || ""; } ` +
    `return rc != null ? rc : content.description; }\n  `
  const filter =
    `.filter(([__slug]) => { ` +
    `if (__slug === "index" || __slug.endsWith("/index")) return false; ` +
    `if (__slug === "tags" || __slug.startsWith("tags/")) return false; ` +
    `return true; })`
  return src
    .replace(itemsAnchor, helper + `const items = Array.from(idx)${filter}.sort(`)
    .replace(descAnchor, "${__rssBody(content, base)}")
}, RSS_MARKER)

console.log(`order-frontmatter patch: ${patched} file(s) patched, ${skipped} already current.`)
