/**
 * Studio overlay — the editing layer injected into every page.
 *
 * Core safety rule, mirrored from the server: we never convert rendered HTML
 * back into Markdown. Clicking a block swaps it for a textarea holding that
 * block's *literal source bytes*; saving splices those bytes back. If the
 * source blocks can't be proven to line up with the rendered blocks, we refuse
 * to map them and fall back to whole-file source editing.
 */
;(() => {
  if (window.__studioLoaded) return
  window.__studioLoaded = true

  const API = "/__studio/api"
  const $ = (sel, root = document) => root.querySelector(sel)
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag)
    for (const [k, v] of Object.entries(props)) {
      // Some DOM properties (list, form, ...) are getter-only and must be set
      // as attributes instead; blind Object.assign throws on those.
      try {
        if (k in n) n[k] = v
        else n.setAttribute(k, v)
      } catch {
        n.setAttribute(k, v)
      }
    }
    for (const k of kids.flat()) n.append(k?.nodeType ? k : document.createTextNode(String(k)))
    return n
  }

  /**
   * Wrap click handlers so a failure surfaces instead of vanishing.
   * Synchronous handlers stay synchronous — only async rejections are awaited.
   */
  const report = (err) => {
    console.error("[studio]", err)
    toast(err?.message || String(err), "error", 6000)
  }
  const guard = (fn) => (...args) => {
    try {
      const r = fn(...args)
      if (r && typeof r.catch === "function") r.catch(report)
      return r
    } catch (err) {
      report(err)
    }
  }

  const state = {
    editing: false,
    page: null, // { path, source, hash, blocks, frontmatter }
    mapping: null, // Block[] aligned to DOM elements, or null if unverifiable
    openEditor: null,
    dirtyCount: 0,
  }

  // ------------------------------------------------------------------ api

  async function api(pathname, opts = {}) {
    const res = await fetch(API + pathname, {
      ...opts,
      headers: { "content-type": "application/json", ...(opts.headers || {}) },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), data, { status: res.status })
    return data
  }

  const toast = (msg, kind = "info", ms = 3200) => {
    const t = el("div", { className: `studio-toast studio-toast--${kind}`, textContent: msg })
    $("#studio-toasts").append(t)
    requestAnimationFrame(() => t.classList.add("in"))
    setTimeout(() => {
      t.classList.remove("in")
      setTimeout(() => t.remove(), 250)
    }, ms)
  }

  // ---------------------------------------------------------- navigation

  /**
   * Go to a page once Quartz has actually built it.
   *
   * Two things make a plain `setTimeout(() => location.pathname = ...)` fail:
   * writing a file triggers a Quartz rebuild, whose live-reload socket reloads
   * the page and destroys the pending timer; and the new page may not be built
   * yet, so navigating early lands on a 404. So the intent is parked in
   * sessionStorage — which survives reloads — and retried until the target
   * responds, or we give up and stop pestering.
   */
  const GOTO_KEY = "studio:goto"

  /** @param urls one URL, or candidates tried in order (first one that exists wins) */
  function gotoWhenReady(urls) {
    const list = [].concat(urls)
    sessionStorage.setItem(GOTO_KEY, JSON.stringify({ urls: list, until: Date.now() + 20000 }))
    pumpGoto()
  }

  async function pumpGoto() {
    const raw = sessionStorage.getItem(GOTO_KEY)
    if (!raw) return
    let job
    try { job = JSON.parse(raw) } catch { return sessionStorage.removeItem(GOTO_KEY) }
    const done = () => sessionStorage.removeItem(GOTO_KEY)

    if (job.urls.some((u) => new URL(u, location.origin).pathname === location.pathname)) return done()
    if (Date.now() > job.until) {
      done()
      return toast("That page is taking a while to build — try refreshing.", "warn", 5000)
    }
    for (const u of job.urls) {
      const target = new URL(u, location.origin)
      try {
        const r = await fetch(target.href, { cache: "no-store" })
        if (r.ok) { done(); return location.assign(target.href) }
      } catch {}
    }
    setTimeout(pumpGoto, 400)
  }

  /** The nearest place that still exists after deleting the current page. */
  const parentUrl = () => {
    const up = location.pathname.replace(/\/+$/, "").split("/").slice(0, -1).join("/")
    return [up ? up + "/" : "/", "/"]
  }

  // ------------------------------------------------------- page identity

  const isStaticPage = () => location.pathname.startsWith("/static/")
  const articleBody = () => $("article .markdown-preview-view") || $("article")

  /**
   * Prove the source blocks line up with the rendered blocks.
   * Verified by count + structural type. Text is deliberately NOT compared:
   * wikilinks render as their alias and smart quotes rewrite punctuation, so
   * text differences are normal and would cause false alarms.
   */
  function verifyMapping(blocks, expectedTags, container) {
    if (!container) return null
    const els = [...container.children].filter((n) => n.nodeType === 1 && !n.classList.contains("studio-block-editor"))
    if (els.length !== blocks.length) return null
    for (let i = 0; i < blocks.length; i++) {
      const allowed = expectedTags[blocks[i].type]
      if (allowed === undefined) return null
      if (allowed === null) continue
      if (!allowed.includes(els[i].tagName.toLowerCase())) return null
    }
    return els
  }

  async function loadPage() {
    state.page = null
    state.mapping = null
    if (isStaticPage()) return
    try {
      state.page = await api(`/page?slug=${encodeURIComponent(location.pathname)}`)
      state.mapping = verifyMapping(state.page.blocks, state.page.expectedTags, articleBody())
    } catch {
      /* page has no backing markdown (tag listings, 404) — editing stays off */
    }
  }

  // ------------------------------------------------------------ toolbar

  function buildChrome() {
    if ($("#studio-bar")) return
    document.body.append(el("div", { id: "studio-toasts" }))

    const bar = el("div", { id: "studio-bar" })
    bar.innerHTML = `
      <button id="studio-edit" class="studio-btn studio-btn--primary" title="Toggle editing (E)">
        <span class="studio-ic">✎</span><span class="studio-label">Edit</span>
      </button>
      <button id="studio-page" class="studio-btn" title="Page settings">
        <span class="studio-ic">⚙</span><span class="studio-label">Page</span>
      </button>
      <button id="studio-new" class="studio-btn" title="New page">
        <span class="studio-ic">＋</span><span class="studio-label">New</span>
      </button>
      <button id="studio-browse" class="studio-btn" title="Go to any page (G)">
        <span class="studio-ic">☰</span><span class="studio-label">Go to</span>
      </button>
      <div class="studio-sep"></div>
      <button id="studio-publish" class="studio-btn studio-btn--publish" title="Publish to the live site">
        <span class="studio-ic">↑</span><span class="studio-label">Publish</span>
        <span id="studio-dirty" class="studio-badge" hidden></span>
      </button>`
    document.body.append(bar)

    $("#studio-edit").onclick = guard(() => setEditing(!state.editing))
    $("#studio-page").onclick = guard(openPagePanel)
    $("#studio-new").onclick = guard(openNewPage)
    $("#studio-browse").onclick = guard(openBrowse)
    $("#studio-publish").onclick = guard(openPublish)

    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea, [contenteditable]")) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "e") { e.preventDefault(); setEditing(!state.editing) }
      if (e.key === "g") { e.preventDefault(); guard(openBrowse)() }
    })
    refreshDirty()
    setInterval(refreshDirty, 15000)
  }

  function refreshBadge() {
    const b = $("#studio-dirty")
    if (!b) return
    b.hidden = state.dirtyCount === 0
    b.textContent = state.dirtyCount
  }

  async function refreshDirty() {
    try {
      const { dirty } = await api("/status")
      state.dirtyCount = dirty
      refreshBadge()
    } catch {}
  }

  // --------------------------------------------------------- edit mode

  function setEditing(on) {
    state.editing = on
    document.body.classList.toggle("studio-editing", on)
    $("#studio-edit").classList.toggle("is-on", on)
    $("#studio-edit .studio-label").textContent = on ? "Editing" : "Edit"
    closeEditor()
    if (on) enableBlocks()
    else disableBlocks()
  }

  function enableBlocks() {
    const container = articleBody()

    if (isStaticPage()) {
      showBanner("This is a standalone app page — Studio edits its HTML source directly.", [
        { label: "Edit HTML source", onClick: openStaticSource },
        { label: "Go to a page", onClick: openBrowse },
      ])
      return
    }
    if (!state.page) {
      showBanner("This page is generated by Quartz (a listing or tag page) — there's no file to edit.")
      return
    }
    if (!state.mapping) {
      showBanner(
        "Studio can't safely match this page's layout to its source, so block editing is off. You can still edit the whole file.",
        [{ label: "Edit page source", onClick: openPageSource }],
      )
      return
    }
    // A landing stub for one of the standalone apps. Live visitors get bounced
    // to the app; Studio holds them here so the page can be edited at all.
    state.mapping.forEach((node, i) => {
      node.classList.add("studio-block")
      node.dataset.studioBlock = String(i)
      node.addEventListener("click", onBlockClick)
    })

    const actions = [
      { label: "Edit page source", onClick: openPageSource },
      { label: "Page settings", onClick: openPagePanel },
    ]

    // A landing stub for one of the standalone apps. Live visitors get bounced
    // to the app; Studio holds them here so the page can be edited at all.
    const redirect = $("[data-studio-redirect]")
    if (redirect) {
      const target = redirect.getAttribute("data-studio-redirect")
      return showBanner(
        "Visitors are sent straight to the app from here — Studio kept you on the page so you can edit it.",
        [{ label: "Open the app", onClick: () => location.assign(target) }, ...actions],
      )
    }

    showBanner(`Click any block to edit it. ${state.mapping.length} editable blocks.`, actions)
  }

  function disableBlocks() {
    document.querySelectorAll(".studio-block").forEach((n) => {
      n.classList.remove("studio-block")
      delete n.dataset.studioBlock
      n.removeEventListener("click", onBlockClick)
    })
    hideBanner()
  }

  function onBlockClick(e) {
    // let real links and interactive controls still work
    if (e.target.closest("a, button, input, select, textarea, summary")) return
    e.preventDefault()
    e.stopPropagation()
    openBlockEditor(Number(e.currentTarget.dataset.studioBlock))
  }

  // ---------------------------------------------------- block editor

  function closeEditor() {
    if (!state.openEditor) return
    const { wrap, node } = state.openEditor
    wrap.replaceWith(node)
    state.openEditor = null
  }

  function openBlockEditor(index) {
    closeEditor()
    const node = state.mapping[index]
    const block = state.page.blocks[index]
    if (!node || !block) return

    // Reserve the block's current height so opening the editor doesn't shove
    // the rest of the page around (repo rule: clicking must not reflow).
    const height = Math.max(node.getBoundingClientRect().height, 44)

    const ta = el("textarea", { className: "studio-ta", value: block.text, spellcheck: true })
    ta.style.minHeight = `${height}px`

    const save = el("button", { className: "studio-btn studio-btn--primary studio-sm", textContent: "Save", title: "Save (⌘↩)" })
    const cancel = el("button", { className: "studio-btn studio-sm", textContent: "Cancel", title: "Cancel (esc)" })

    // Controls float over the textarea's top-right corner rather than stacking
    // above/below it — stacked chrome would push the rest of the page down.
    const wrap = el(
      "div",
      { className: "studio-block-editor", title: `${block.type} · ⌘↩ save · esc cancel` },
      ta,
      el("div", { className: "studio-editor-controls" }, save, cancel),
    )

    node.replaceWith(wrap)
    state.openEditor = { wrap, node, index }

    // The editor's own chrome (type chip, buttons, padding, border) is height
    // the original block didn't have. Subtract it so the whole editor occupies
    // the block's old footprint and nothing below moves.
    const chrome = wrap.offsetHeight - ta.offsetHeight
    // 34px ~= one line of source plus the textarea's own padding and border,
    // so a single-line block doesn't balloon when it becomes editable.
    const floor = Math.max(34, height - chrome)
    ta.style.minHeight = `${floor}px`

    const autosize = () => {
      ta.style.height = "auto"
      ta.style.height = `${Math.max(ta.scrollHeight, floor)}px`
    }
    ta.addEventListener("input", autosize)
    autosize()
    ta.focus()

    cancel.onclick = closeEditor
    save.onclick = () => saveBlock(index, ta.value, save)
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeEditor() }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveBlock(index, ta.value, save) }
    })
  }

  async function saveBlock(index, text, btn) {
    const block = state.page.blocks[index]
    if (text === block.text) { closeEditor(); return }
    btn.disabled = true
    btn.textContent = "Saving…"
    try {
      await api("/block", {
        method: "POST",
        body: JSON.stringify({ path: state.page.path, start: block.start, end: block.end, text, hash: state.page.hash }),
      })
      awaitRebuild("Saved")
    } catch (err) {
      btn.disabled = false
      btn.textContent = "Save"
      if (err.conflict) return showConflict(err, text)
      toast(err.message, "error", 6000)
    }
  }

  /** Quartz rebuilds and hot-reloads on file change; nudge if it doesn't. */
  function awaitRebuild(msg) {
    toast(`${msg} — rebuilding…`, "ok")
    refreshDirty()
    setTimeout(() => location.reload(), 1400)
  }

  function showConflict(err, attempted) {
    openModal(
      "This file changed outside Studio",
      el(
        "div",
        {},
        el("p", { textContent: "Someone (Obsidian, a git pull, another tab) changed this file while you were editing. Studio did not overwrite it." }),
        el("p", { className: "studio-muted", textContent: "Your unsaved text is below — copy anything you want to keep, then close and re-edit against the current version." }),
        el("textarea", { className: "studio-ta studio-ta--modal", value: attempted, readOnly: true }),
      ),
      [{ label: "Reload current version", primary: true, onClick: () => location.reload() }],
    )
  }

  // ---------------------------------------------------- source editors

  function openPageSource() {
    openSourceEditor(state.page.path, state.page.source, state.page.hash, "Page source")
  }

  async function openStaticSource() {
    const name = location.pathname.split("/").pop()
    try {
      const f = await api(`/static?name=${encodeURIComponent(name)}`)
      openSourceEditor(f.path, f.source, f.hash, name)
    } catch (err) {
      toast(err.message, "error")
    }
  }

  function openSourceEditor(filePath, source, hash, title) {
    const ta = el("textarea", { className: "studio-ta studio-ta--modal studio-ta--tall", value: source, spellcheck: false })
    openModal(
      title,
      el("div", {}, el("p", { className: "studio-muted", textContent: filePath }), ta),
      [
        {
          label: "Save",
          primary: true,
          keep: true,
          onClick: async (btn) => {
            btn.disabled = true
            btn.textContent = "Saving…"
            try {
              await api("/source", { method: "POST", body: JSON.stringify({ path: filePath, text: ta.value, hash }) })
              closeModal()
              awaitRebuild("Saved")
            } catch (err) {
              btn.disabled = false
              btn.textContent = "Save"
              toast(err.message, "error", 6000)
            }
          },
        },
        { label: "Cancel" },
      ],
    )
  }

  // ------------------------------------------------------ page settings

  async function openPagePanel() {
    if (!state.page) return toast("No editable file backs this page.", "warn")
    const { files, tags: knownTags } = await api("/tree")
    const fm = state.page.frontmatter || {}
    const currentTags = Array.isArray(fm.tags) ? [...fm.tags] : fm.tags ? [String(fm.tags)] : []
    const dirs = [...new Set(files.map((f) => f.dir))].sort()
    const myDir = state.page.path.replace(/^content\//, "").split("/").slice(0, -1).join("/")
    const myName = state.page.path.split("/").pop().replace(/\.md$/, "")

    // Empty title means "fall back to the file name" — show that as the
    // placeholder so a blank box doesn't look like missing data.
    const title = el("input", { className: "studio-input", value: fm.title ?? "", placeholder: myName })
    const order = el("input", { className: "studio-input", type: "number", value: fm.order ?? "" })
    const publish = el("input", { type: "checkbox", checked: fm.publish !== false })
    const name = el("input", { className: "studio-input", value: myName })
    const folder = el("select", { className: "studio-input" })
    for (const d of dirs) folder.append(el("option", { value: d, textContent: d === "" ? "(top level)" : d, selected: d === myDir }))

    // --- tag chips
    const tagWrap = el("div", { className: "studio-tags" })
    const renderTags = () => {
      tagWrap.textContent = ""
      currentTags.forEach((t, i) => {
        const x = el("button", { className: "studio-chip-x", textContent: "×", title: `Remove ${t}` })
        x.onclick = () => { currentTags.splice(i, 1); renderTags() }
        tagWrap.append(el("span", { className: "studio-chip" }, t, x))
      })
    }
    renderTags()
    const tagInput = el("input", { className: "studio-input", placeholder: "add tag + Enter", list: "studio-taglist" })
    const datalist = el("datalist", { id: "studio-taglist" })
    knownTags.forEach((t) => datalist.append(el("option", { value: t })))
    tagInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return
      e.preventDefault()
      const v = tagInput.value.trim()
      if (v && !currentTags.includes(v)) { currentTags.push(v); renderTags() }
      tagInput.value = ""
    })

    const row = (label, control) => el("label", { className: "studio-row" }, el("span", { className: "studio-row-label", textContent: label }), control)

    openModal(
      "Page settings",
      el(
        "div",
        {},
        row("Title", title),
        row("Tags", el("div", {}, tagWrap, tagInput, datalist)),
        row("Sidebar order", order),
        row("Published", publish),
        el("hr", { className: "studio-hr" }),
        row("File name", name),
        row("Folder", folder),
        el("p", { className: "studio-muted", textContent: state.page.path }),
      ),
      [
        {
          label: "Save",
          primary: true,
          keep: true,
          onClick: async (btn) => {
            btn.disabled = true
            btn.textContent = "Saving…"
            try {
              await api("/frontmatter", {
                method: "POST",
                body: JSON.stringify({
                  path: state.page.path,
                  hash: state.page.hash,
                  patch: {
                    title: title.value.trim() || null,
                    tags: currentTags.length ? currentTags : null,
                    order: order.value === "" ? null : Number(order.value),
                    publish: publish.checked ? true : false,
                  },
                }),
              })
              const wantPath = `content/${folder.value ? folder.value + "/" : ""}${name.value.trim()}.md`
              if (wantPath !== state.page.path) {
                const r = await api("/move", { method: "POST", body: JSON.stringify({ from: state.page.path, to: wantPath }) })
                closeModal()
                toast("Moved — opening it at its new address…", "ok")
                refreshDirty()
                return gotoWhenReady("/" + r.slug)
              }
              closeModal()
              awaitRebuild("Saved")
            } catch (err) {
              btn.disabled = false
              btn.textContent = "Save"
              toast(err.message, "error", 6000)
            }
          },
        },
        {
          label: "Delete page",
          danger: true,
          keep: true,
          onClick: async (btn) => {
            if (btn.dataset.armed !== "1") {
              btn.dataset.armed = "1"
              btn.textContent = "Click again to confirm"
              return
            }
            try {
              await api("/delete", { method: "POST", body: JSON.stringify({ path: state.page.path }) })
              closeModal()
              toast("Deleted — kept in the trash, nothing is gone for good.", "ok", 5000)
              refreshDirty()
              // Leave immediately: staying on a page that no longer exists is
              // what made deletes look like they hadn't worked.
              gotoWhenReady(parentUrl())
            } catch (err) {
              toast(err.message, "error", 6000)
            }
          },
        },
        { label: "Cancel" },
      ],
    )
  }

  async function openNewPage() {
    const { files } = await api("/tree")
    const dirs = [...new Set(files.map((f) => f.dir))].sort()
    const title = el("input", { className: "studio-input", placeholder: "Page title" })
    const folder = el("select", { className: "studio-input" })
    for (const d of dirs) folder.append(el("option", { value: d, textContent: d === "" ? "(top level)" : d }))

    openModal(
      "New page",
      el(
        "div",
        {},
        el("label", { className: "studio-row" }, el("span", { className: "studio-row-label", textContent: "Title" }), title),
        el("label", { className: "studio-row" }, el("span", { className: "studio-row-label", textContent: "Folder" }), folder),
      ),
      [
        {
          label: "Create",
          primary: true,
          keep: true,
          onClick: async (btn) => {
            btn.disabled = true
            btn.textContent = "Creating…"
            try {
              const r = await api("/create", { method: "POST", body: JSON.stringify({ title: title.value, dir: folder.value }) })
              closeModal()
              toast("Created — opening it now…", "ok")
              refreshDirty()
              gotoWhenReady("/" + r.slug)
            } catch (err) {
              btn.disabled = false
              btn.textContent = "Create"
              toast(err.message, "error", 6000)
            }
          },
        },
        { label: "Cancel" },
      ],
    )
    setTimeout(() => title.focus(), 50)
  }

  // ------------------------------------------------------------- browse

  /**
   * Jump to any page without using the site's own navigation.
   *
   * Needed because the standalone app/game pages are full-screen HTML with no
   * link back into the site — once you're on one, the only way out was the
   * browser's Back button.
   */
  async function openBrowse() {
    const { files } = await api("/tree")
    const search = el("input", { className: "studio-input", placeholder: "Search pages…", type: "search" })
    const list = el("div", { className: "studio-changes studio-browse" })

    const render = () => {
      const q = search.value.trim().toLowerCase()
      const hits = files.filter((f) => !q || f.title.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      list.textContent = ""
      if (!hits.length) return list.append(el("p", { className: "studio-empty", textContent: "No page matches that." }))
      for (const f of hits.slice(0, 300)) {
        const row = el("button", { className: "studio-browse-row" })
        row.append(
          el("strong", { textContent: f.title }),
          el("span", { className: "studio-muted", textContent: f.dir || "(top level)" }),
        )
        row.onclick = guard(() => { closeModal(); gotoWhenReady("/" + f.slug) })
        list.append(row)
      }
    }
    search.addEventListener("input", render)
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); $(".studio-browse-row", list)?.click() }
    })
    render()

    openModal("Go to a page", el("div", {}, search, list), [{ label: "Home", onClick: () => gotoWhenReady("/") }, { label: "Close" }])
    setTimeout(() => search.focus(), 50)
  }

  // ------------------------------------------------------------ publish

  const KIND_LABEL = { added: "New page", modified: "Edited", deleted: "Deleted", renamed: "Moved" }

  /**
   * The one place every unpublished action lives: see it, open it, undo it, or
   * leave it in the batch and publish. Replaces the old bare "N files changed"
   * counter, which told you something had happened but never what.
   */
  async function openPublish() {
    const { changes } = await api("/changes")
    state.dirtyCount = changes.length
    refreshBadge()

    const log = el("pre", { className: "studio-log", textContent: "", hidden: true })
    const list = el("div", { className: "studio-changes" })
    const status = el("p", { className: "studio-muted" })

    const renderList = () => {
      list.textContent = ""
      if (!changes.length) {
        list.append(
          el("p", { className: "studio-empty", textContent: "Nothing to publish — the live site already matches what's here." }),
          el("p", {
            className: "studio-muted",
            textContent:
              "If you added a page and then deleted it again, that cancels out: there's no net change to send.",
          }),
        )
        return
      }
      for (const c of changes) {
        const row = el("div", { className: "studio-change" })
        row.append(el("span", { className: `studio-kind studio-kind--${c.kind}`, textContent: KIND_LABEL[c.kind] }))
        row.append(
          el(
            "span",
            { className: "studio-change-name" },
            el("strong", { textContent: c.title }),
            el("span", { className: "studio-muted", textContent: c.oldPath ? `${c.oldPath} → ${c.path}` : c.path }),
          ),
        )

        const actions = el("span", { className: "studio-change-actions" })
        if (c.url) {
          const open = el("button", { className: "studio-btn studio-sm", textContent: "Open" })
          open.onclick = guard(() => { closeModal(); gotoWhenReady(c.url) })
          actions.append(open)
        }
        const undo = el("button", { className: "studio-btn studio-btn--danger studio-sm", textContent: "Undo" })
        undo.onclick = guard(async () => {
          if (undo.dataset.armed !== "1") {
            undo.dataset.armed = "1"
            undo.textContent = "Sure?"
            return
          }
          undo.disabled = true
          const r = await api("/revert", { method: "POST", body: JSON.stringify({ path: c.path }) })
          toast(r.message, "ok", 5000)
          changes.splice(changes.indexOf(c), 1)
          state.dirtyCount = changes.length
          refreshBadge()
          renderList()
          syncPublishButton()
        })
        actions.append(undo)
        row.append(actions)
        list.append(row)
      }
    }

    const syncPublishButton = () => {
      const btn = $("#studio-publish-now")
      if (!btn) return
      btn.disabled = changes.length === 0
      btn.title = changes.length ? "" : "There's nothing new to send to the live site."
      status.textContent = changes.length
        ? `${changes.length} change${changes.length === 1 ? "" : "s"} waiting to go to the live site.`
        : "Everything here is already published."
    }

    openModal(
      "Changes & publish",
      el(
        "div",
        {},
        status,
        list,
        el("hr", { className: "studio-hr" }),
        el(
          "p",
          { className: "studio-muted studio-folders" },
          "Safety nets: ",
          folderLink("View deleted pages", openTrash),
          " · ",
          folderLink("Open the backups folder", () => api("/reveal", { method: "POST", body: JSON.stringify({ what: "backups" }) })),
        ),
        log,
      ),
      [
        {
          label: "Publish now",
          primary: true,
          keep: true,
          id: "studio-publish-now",
          onClick: (btn) => {
            btn.disabled = true
            btn.textContent = "Publishing…"
            log.hidden = false
            log.textContent = ""
            fetch(`${API}/publish`, { method: "POST" }).then(async (res) => {
              const reader = res.body.getReader()
              const dec = new TextDecoder()
              let buf = ""
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += dec.decode(value, { stream: true })
                const parts = buf.split("\n\n")
                buf = parts.pop()
                for (const p of parts) {
                  const ev = /event: (\w+)/.exec(p)?.[1]
                  const data = /data: ([\s\S]*)$/m.exec(p)?.[1]
                  if (!ev || !data) continue
                  if (ev === "log") {
                    log.textContent += JSON.parse(data)
                    log.scrollTop = log.scrollHeight
                  } else if (ev === "done") {
                    const code = JSON.parse(data).code
                    btn.textContent = "Publish now"
                    if (code === 0) {
                      // Everything just went out, so there is nothing left to
                      // send: clear the list and keep the button disabled until
                      // a real new change shows up.
                      changes.length = 0
                      state.dirtyCount = 0
                      refreshBadge()
                      renderList()
                      syncPublishButton()
                      status.innerHTML =
                        'Published. The live site rebuilds in about 5 minutes — <a href="https://barkernotbob.github.io" target="_blank" rel="noopener">barkernotbob.github.io</a>'
                      toast("Published", "ok")
                    } else {
                      btn.disabled = false
                      status.textContent = "Publish failed — see the log above."
                      toast("Publish failed", "error", 6000)
                    }
                  }
                }
              }
            })
          },
        },
        { label: "Close" },
      ],
    )
    renderList()
    syncPublishButton()
  }

  // --------------------------------------------------------------- trash

  const folderLink = (label, onClick) => {
    const a = el("button", { className: "studio-link", textContent: label })
    a.onclick = guard(onClick)
    return a
  }

  /** Trash from before the manifest existed has no reliable timestamp. */
  const when = (iso) => {
    const d = new Date(iso)
    return iso && !isNaN(d) ? d.toLocaleString() : ""
  }

  async function openTrash() {
    const { items } = await api("/trash")
    const list = el("div", { className: "studio-changes" })

    const render = () => {
      list.textContent = ""
      if (!items.length) {
        list.append(el("p", { className: "studio-empty", textContent: "The trash is empty — you haven't deleted anything." }))
        return
      }
      for (const it of items) {
        const row = el("div", { className: "studio-change" })
        row.append(el("span", { className: "studio-kind studio-kind--deleted", textContent: "Deleted" }))
        row.append(
          el(
            "span",
            { className: "studio-change-name" },
            el("strong", { textContent: it.title }),
            el("span", { className: "studio-muted", textContent: [it.original, when(it.at)].filter(Boolean).join(" · ") }),
          ),
        )
        const put = el("button", { className: "studio-btn studio-sm", textContent: "Put it back" })
        put.onclick = guard(async () => {
          put.disabled = true
          const r = await api("/restore", { method: "POST", body: JSON.stringify({ name: it.name }) })
          items.splice(items.indexOf(it), 1)
          render()
          refreshDirty()
          toast(`Restored to ${r.original}`, "ok", 5000)
          if (r.url) { closeModal(); gotoWhenReady(r.url) }
        })
        row.append(el("span", { className: "studio-change-actions" }, put))
        list.append(row)
      }
    }
    render()

    openModal(
      "Deleted pages",
      el(
        "div",
        {},
        el("p", { className: "studio-muted", textContent: "Deleting a page moves it here. Nothing is ever erased, and you can put any of it back." }),
        list,
      ),
      [
        { label: "Open the folder in Finder", onClick: () => api("/reveal", { method: "POST", body: JSON.stringify({ what: "trash" }) }), keep: true },
        { label: "Close" },
      ],
    )
  }

  // ------------------------------------------------------- modal + banner

  function openModal(titleText, body, actions = []) {
    closeModal()
    const card = el("div", { className: "studio-modal-card" })
    card.append(el("div", { className: "studio-modal-head" }, el("h2", { textContent: titleText })))
    card.append(el("div", { className: "studio-modal-body" }, body))
    const foot = el("div", { className: "studio-modal-foot" })
    for (const a of actions) {
      const b = el("button", {
        className: `studio-btn ${a.primary ? "studio-btn--primary" : ""} ${a.danger ? "studio-btn--danger" : ""}`,
        textContent: a.label,
        ...(a.id ? { id: a.id } : {}),
      })
      b.onclick = a.onClick ? guard(() => a.onClick(b)) : () => closeModal()
      if (!a.onClick || !a.keep) b.addEventListener("click", () => !a.keep && closeModal())
      foot.append(b)
    }
    card.append(foot)
    const back = el("div", { className: "studio-modal", id: "studio-modal" }, card)
    back.addEventListener("click", (e) => e.target === back && closeModal())
    document.body.append(back)
    document.addEventListener("keydown", escClose)
  }
  const escClose = (e) => e.key === "Escape" && closeModal()
  function closeModal() {
    $("#studio-modal")?.remove()
    document.removeEventListener("keydown", escClose)
  }

  function showBanner(text, actions = []) {
    hideBanner()
    const b = el("div", { className: "studio-banner", id: "studio-banner" }, el("span", { textContent: text }))
    for (const a of actions) {
      const btn = el("button", { className: "studio-btn studio-sm", textContent: a.label })
      btn.onclick = guard(a.onClick)
      b.append(btn)
    }
    document.body.append(b)
  }
  const hideBanner = () => $("#studio-banner")?.remove()

  // ---------------------------------------------------------------- init

  async function init() {
    buildChrome()
    // A pending "open that page once it's built" survives Quartz's live-reload
    // by living in sessionStorage — pick it back up on every load.
    pumpGoto()
    // Editing can't be entered until we know which file backs this page,
    // otherwise a fast click lands before the source arrives and silently
    // reports the page as uneditable.
    const btn = $("#studio-edit")
    btn.disabled = true
    try {
      await loadPage()
    } finally {
      btn.disabled = false
    }
    if (state.editing) { disableBlocks(); enableBlocks() }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init)
  else init()
  // Quartz uses SPA navigation — re-bind after each route change.
  document.addEventListener("nav", init)
})()
