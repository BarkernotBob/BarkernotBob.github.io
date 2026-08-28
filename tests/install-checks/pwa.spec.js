const { test, expect } = require('@playwright/test')

// GAP-W6. CLAUDE.md promises every app is installable to the phone home screen,
// with double-tap zoom off and no zoom when tapping into a field. tests/grocery/
// enforced that for grocery alone; this rig holds all four to the same bar, so a
// dropped manifest, a re-added maximum-scale or a <16px input fails on any app.
//
// Deliberately narrow: install/PWA compliance only. Per-app behaviour suites for
// pool, vehicle and bank-bonus are GAP-W2's job, not this file's.

const APPS = [
  {
    name: 'grocery',
    url: '/static/grocery/index.html',
    manifestHref: 'manifest.webmanifest',
    appleTouchIcon: 'icons/apple-touch-icon.png',
    // Seeded before any app script runs, so the app boots past its setup screen
    // and renders the real UI the input sweep needs.
    seed: {
      gt_repo: 'testuser/grocery-data',
      gt_token: 'ghp_test_token',
      gt_me: 'Me',
      gt_device: 'Test Phone',
      gt_method: 'token',
    },
  },
  {
    name: 'pool',
    url: '/static/pool/index.html',
    manifestHref: 'manifest.webmanifest',
    appleTouchIcon: 'icon-180.png',
    seed: {
      pl_repo: 'testuser/pool-data',
      pl_token: 'ghp_test_token',
      pl_login: 'testuser',
      pl_device: 'Test Phone',
      pl_method: 'token',
    },
  },
  {
    name: 'vehicle',
    url: '/static/vehicle/index.html',
    manifestHref: 'manifest.webmanifest',
    appleTouchIcon: 'icons/apple-touch-icon.png',
    // Vehicle stores everything in localStorage — nothing to seed.
    seed: {},
  },
  {
    name: 'bank-bonus',
    // bank-bonus links its manifest and scopes its SW absolutely, so it only
    // works under the /static/ layout this rig serves.
    url: '/static/bank-bonus/index.html',
    manifestHref: '/static/bank-bonus/manifest.webmanifest',
    appleTouchIcon: '/static/bank-bonus/apple-touch-icon.png',
    seed: {
      bb_repo: 'testuser/bank-bonus-data',
      bb_token: 'ghp_test_token',
      bb_login: 'testuser',
      bb_me: 'Me',
      bb_method: 'token',
    },
  },
]

// Boot an app with its session seeded and every GitHub call stubbed, so these
// checks never depend on the network or on any real account.
async function boot(page, app) {
  await page.addInitScript((seed) => {
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
  }, app.seed)
  await page.route('**://api.github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  )
  await page.goto(app.url)
  await page.waitForLoadState('domcontentloaded')
}

for (const app of APPS) {
  test.describe(app.name, () => {
    test('manifest is linked, valid, and its icons resolve', async ({ page }) => {
      await boot(page, app)

      const href = await page.getAttribute('link[rel="manifest"]', 'href')
      expect(href, 'manifest must be linked').toBe(app.manifestHref)
      // Every app uses the .webmanifest extension — bank-bonus used to be the
      // odd one out with manifest.json.
      expect(href).toMatch(/\.webmanifest$/)

      const man = await page.evaluate(async (h) => {
        const r = await fetch(h)
        return r.ok ? r.json() : null
      }, href)
      expect(man, 'manifest must fetch and parse').toBeTruthy()
      expect(man.name).toBeTruthy()
      expect(man.display).toBe('standalone')
      expect(man.start_url).toBeTruthy()

      const sizes = man.icons.map((i) => i.sizes)
      expect(sizes).toContain('192x192')
      expect(sizes).toContain('512x512')
      expect(
        man.icons.some((i) => (i.purpose || '').includes('maskable')),
        'needs at least one maskable icon'
      ).toBe(true)

      // Every declared icon, plus the apple-touch icon, actually exists.
      const paths = [...man.icons.map((i) => i.src), app.appleTouchIcon]
      const statuses = await page.evaluate(async (ps) => {
        const out = {}
        for (const p of ps) out[p] = (await fetch(p)).status
        return out
      }, paths)
      for (const p of paths) expect(statuses[p], `${p} must resolve`).toBe(200)
    })

    test('apple-touch-icon + both web-app-capable metas are present', async ({ page }) => {
      await boot(page, app)
      expect(await page.getAttribute('link[rel="apple-touch-icon"]', 'href')).toBe(app.appleTouchIcon)
      expect(await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content')).toBe('yes')
      expect(await page.getAttribute('meta[name="mobile-web-app-capable"]', 'content')).toBe('yes')
      expect(await page.getAttribute('meta[name="theme-color"]', 'content')).toBeTruthy()
    })

    test('viewport allows pinch-zoom but double-tap zoom is off', async ({ page }) => {
      await boot(page, app)
      const vp = await page.getAttribute('meta[name="viewport"]', 'content')
      expect(vp).toContain('viewport-fit=cover')
      // Locking the viewport takes zoom away from anyone who needs it. Double-tap
      // zoom is killed with touch-action instead.
      expect(vp, 'maximum-scale blocks pinch-zoom').not.toMatch(/maximum-scale/i)
      expect(vp, 'user-scalable=no blocks pinch-zoom').not.toMatch(/user-scalable/i)
      const ta = await page.evaluate(() => getComputedStyle(document.body).touchAction)
      expect(ta).toBe('manipulation')
    })

    test('service worker registers and activates', async ({ page }) => {
      await boot(page, app)
      const active = await page.evaluate(() =>
        Promise.race([
          navigator.serviceWorker.ready.then((r) => !!(r && r.active)),
          new Promise((res) => setTimeout(() => res(false), 8000)),
        ])
      )
      expect(active).toBe(true)
    })

    // Anything under 16px makes iOS zoom in when you tap the field, and on the
    // apps whose viewport no longer pins the scale there is no way to zoom back
    // out one-handed. Checked three ways, because sweeping the live DOM alone
    // proves almost nothing here: these apps build each screen with innerHTML
    // on navigation, so at load most controls do not exist yet.
    test('no CSS rule styles a text control below 16px', async ({ page }) => {
      await boot(page, app)
      const offenders = await page.evaluate(() => {
        // Selectors targeting a control that shows no text of its own — iOS
        // never zooms into those, so their font-size is irrelevant.
        const TEXTLESS =
          /\[\s*type\s*[~|^$*]?=\s*["']?(range|checkbox|radio|color|file|submit|button|image|reset|hidden)["']?\s*\]/i
        // The tag has to stand on its own: `.dt-row input` and `input.date-quick`
        // count, `.input-note` does not.
        const TARGETS = /(^|[\s,>+~])(input|select|textarea)\b/i
        const out = []
        const walk = (rules) => {
          for (const r of rules) {
            // Since CSS nesting shipped, every CSSStyleRule carries a cssRules
            // list of its own — usually empty, but always truthy. So recurse on
            // length, and never skip the rule's own declarations because of it.
            if (r.cssRules && r.cssRules.length) {
              try {
                walk(r.cssRules)
              } catch {
                /* opaque nested sheet */
              }
            }
            if (!r.selectorText || !r.style) continue
            const fs = r.style.getPropertyValue('font-size')
            if (!fs.endsWith('px') || !(parseFloat(fs) < 16)) continue
            for (const sel of r.selectorText.split(',')) {
              const s = sel.trim()
              if (TARGETS.test(s) && !TEXTLESS.test(s)) out.push({ selector: s, fontSize: fs })
            }
          }
        }
        for (const sheet of document.styleSheets) {
          try {
            walk(sheet.cssRules)
          } catch {
            /* cross-origin sheet (the font CDN) — not ours to police */
          }
        }
        return out
      })
      expect(offenders, `${app.name}: ${JSON.stringify(offenders)}`).toEqual([])
    })

    test('no inline style sets a text control below 16px', async ({ page }) => {
      await boot(page, app)
      // Scan the served source rather than the DOM, so controls that only exist
      // inside a template literal for a screen you have not opened yet still get
      // checked. Covers index.html plus every same-origin script it loads.
      const sources = await page.evaluate(() => {
        const urls = new Set([location.href])
        for (const s of document.querySelectorAll('script[src]')) {
          const u = new URL(s.src, location.href)
          if (u.origin === location.origin) urls.add(u.href)
        }
        return [...urls]
      })
      const offenders = await page.evaluate(async (urls) => {
        const TEXTLESS = /type\s*=\s*["']?(range|checkbox|radio|color|file|submit|button|image|reset|hidden)["']?/i
        const out = []
        for (const u of urls) {
          const src = await (await fetch(u)).text()
          const tag = /<(input|select|textarea)\b[^>]*?style\s*=\s*(["'])([^"']*)\2[^>]*>/gi
          let m
          while ((m = tag.exec(src)) !== null) {
            const size = /font-size:\s*([\d.]+)px/i.exec(m[3])
            if (!size || parseFloat(size[1]) >= 16) continue
            if (TEXTLESS.test(m[0])) continue
            out.push({ source: u.split('/').pop(), fontSize: size[1] + 'px', tag: m[0].slice(0, 120) })
          }
        }
        return out
      }, sources)
      expect(offenders, `${app.name}: ${JSON.stringify(offenders)}`).toEqual([])
    })

    test('no control currently in the document renders below 16px', async ({ page }) => {
      await boot(page, app)
      const tooSmall = await page.$$eval('input, select, textarea', (els) => {
        const TEXTLESS = new Set([
          'hidden',
          'range',
          'checkbox',
          'radio',
          'color',
          'file',
          'submit',
          'button',
          'image',
          'reset',
        ])
        return els
          .filter((e) => !(e.tagName === 'INPUT' && TEXTLESS.has(e.type)))
          .map((e) => ({
            what: e.id || e.className || e.type || e.tagName.toLowerCase(),
            fs: parseFloat(getComputedStyle(e).fontSize),
          }))
          .filter((x) => x.fs < 16)
      })
      expect(tooSmall, `${app.name}: ${JSON.stringify(tooSmall)}`).toEqual([])
    })
  })
}
