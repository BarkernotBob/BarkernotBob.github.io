const { test, expect } = require('@playwright/test')
const { bootApp } = require('./support/boot')

// §13 assertion class 6 / C‑16 — WCAG AA contrast over every fg/bg token pair the
// app actually paints, in BOTH themes. Token values are read live from the shipped
// tokens.css (getComputedStyle on :root after toggling data-theme), so this is the
// authority the PRD calls for: if a token regresses below AA the build goes red.
//
// One provisional mockup value was adjusted to pass: dark --tomato-ink
// #D0603A → #D67453 (was 4.04:1 on --card; now 4.84:1). Hue preserved.

function luminance(hex) {
  const h = hex.replace('#', '')
  const chan = [0, 2, 4].map((i) => {
    let c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2]
}
function contrast(a, b) {
  const l1 = luminance(a),
    l2 = luminance(b)
  const hi = Math.max(l1, l2),
    lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

// [fg, bg, minRatio] — 4.5 normal text, 3.0 large text / UI glyph.
const PAIRS = [
  ['--ink', '--paper', 4.5],
  ['--ink', '--card', 4.5],
  ['--ink-2', '--card', 4.5],
  ['--ink-2', '--paper', 4.5],
  ['--on-pine', '--pine', 4.5],
  ['--leaf-ink', '--leaf-tint', 4.5],
  ['--leaf-ink', '--card', 4.5],
  ['--marigold-ink', '--card', 4.5],
  ['--tomato-ink', '--card', 4.5],
  ['--tomato-ink', '--paper', 4.5],
  ['--pine', '--card', 3.0], // active-nav / stamp glyph
  ['--teal', '--card', 4.5], // HSA stamp
]

async function readTokens(page, theme) {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  const names = [...new Set(PAIRS.flatMap(([a, b]) => [a, b]))]
  return page.evaluate((ns) => {
    const cs = getComputedStyle(document.documentElement)
    const out = {}
    ns.forEach((n) => (out[n] = cs.getPropertyValue(n).trim()))
    return out
  }, names)
}

for (const theme of ['light', 'dark']) {
  test(`token pairs meet WCAG AA in ${theme} theme`, async ({ page }) => {
    await bootApp(page)
    const tok = await readTokens(page, theme)
    const failures = []
    for (const [fg, bg, min] of PAIRS) {
      const ratio = contrast(tok[fg], tok[bg])
      if (ratio < min) failures.push(`${fg}(${tok[fg]}) on ${bg}(${tok[bg]}) = ${ratio.toFixed(2)} < ${min}`)
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
}
