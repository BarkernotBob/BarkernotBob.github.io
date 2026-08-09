import assert from "node:assert"
import fs from "node:fs"
import path from "node:path"
import test, { describe } from "node:test"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const pagePath = path.join(here, "..", "quartz", "static", "Backlog.html")
const page = fs.readFileSync(pagePath, "utf8")

// The page is one self-contained file with no build step, so the URL builder is
// lifted straight out of it and exercised directly. A browser isn't needed to
// catch the failure that actually matters: a title that breaks the query string.
const buildIssueUrl = (() => {
  const match = page.match(/function buildIssueUrl[\s\S]*?\n {2}}/)
  assert.ok(match, "buildIssueUrl not found in Backlog.html")
  return new Function(`${match[0]}; return buildIssueUrl`)() as (
    repo: string,
    title: string,
    vague: boolean,
  ) => string
})()

describe("capture page", () => {
  test("carries no credentials", () => {
    // It lives on a public site. A token here would be readable by anyone.
    assert.ok(!/ghp_|github_pat_|Authorization|Bearer /i.test(page))
  })

  test("names no repositories", () => {
    // Listing private repo names on a public page discloses that they exist;
    // the list is pasted in by hand and kept in localStorage instead.
    const withoutPlaceholders = page.replace(/placeholder="[^"]*"/g, "")
    assert.ok(!/BarkernotBob\/[\w.-]+/.test(withoutPlaceholders))
  })

  test("stays out of search results", () => {
    assert.match(page, /name="robots" content="noindex, nofollow"/)
  })

  test("fields are 17px so iOS doesn't zoom the page on focus", () => {
    assert.match(page, /font-size:\s*17px/)
  })

  test("builds a prefilled GitHub issue URL", () => {
    const url = buildIssueUrl("owner/repo", "Show one decimal place", false)
    assert.ok(url.startsWith("https://github.com/owner/repo/issues/new?"))
    assert.match(url, /title=Show%20one%20decimal%20place/)
    assert.match(url, /body=/)
  })

  test("escapes characters that would otherwise split the query string", () => {
    const url = buildIssueUrl("owner/repo", "Fix A&B — 100% wrong? #2", false)
    assert.match(url, /title=Fix%20A%26B%20%E2%80%94%20100%25%20wrong%3F%20%232/)
    // One `?`, and every later separator is an `&` — otherwise GitHub drops the
    // remaining fields and the issue arrives half empty.
    assert.strictEqual(url.split("?").length, 2)
  })

  test("applies no label by default, so filing never depends on one", () => {
    assert.ok(!buildIssueUrl("owner/repo", "Anything", false).includes("labels="))
  })

  test("marks an unclear item for a conversation when asked", () => {
    assert.match(buildIssueUrl("owner/repo", "Anything", true), /labels=needs-grilling/)
  })
})

// Same lift-it-out-of-the-file trick as above: the setup screen is the one
// place a wrong paste can dead-end the whole page.
const parseProjects = (() => {
  const match = page.match(/function parseProjects[\s\S]*?\n {2}}/)
  assert.ok(match, "parseProjects not found in Backlog.html")
  return new Function(`${match[0]}; return parseProjects`)() as (text: string) => string[]
})()

describe("capture page project list", () => {
  test("accepts plain owner/repo", () => {
    assert.deepStrictEqual(parseProjects("me/pool\nme/grocery"), ["me/pool", "me/grocery"])
  })

  test("accepts a GitHub URL pasted from the address bar", () => {
    assert.deepStrictEqual(
      parseProjects("https://github.com/me/pool\nhttps://github.com/me/site/issues"),
      ["me/pool", "me/site"],
    )
  })

  test("drops lines that aren't projects rather than saving junk", () => {
    assert.deepStrictEqual(parseProjects("me/pool\nsome notes\n\n"), ["me/pool"])
  })

  test("the setup screen says so when nothing parsed", () => {
    assert.match(page, /id="setupError"/)
    // visibility, not display — an error appearing must not move the button.
    assert.match(page, /setupError[\s\S]{0,200}visibility:hidden/)
  })

  test("a blocked pop-up does not get marked as filed", () => {
    assert.match(page, /var opened = window\.open\(/)
    assert.match(page, /if \(opened\) li\.className = "filed"/)
  })
})
