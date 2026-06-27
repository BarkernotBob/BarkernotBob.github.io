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
let patched = 0
let skipped = 0

function patchFile(path, transform) {
  if (!existsSync(path)) {
    console.warn(`  ⚠ not found (skipped): ${path}`)
    return
  }
  const src = readFileSync(path, "utf8")
  if (src.includes(MARKER)) {
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

console.log(`order-frontmatter patch: ${patched} file(s) patched, ${skipped} already current.`)
