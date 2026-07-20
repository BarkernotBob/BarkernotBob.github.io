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
      <div class="studio-sep"></div>
      <button id="studio-publish" class="studio-btn studio-btn--publish" title="Publish to the live site">
        <span class="studio-ic">↑</span><span class="studio-label">Publish</span>
        <span id="studio-dirty" class="studio-badge" hidden></span>
      </button>`
    document.body.append(bar)

    $("#studio-edit").onclick = guard(() => setEditing(!state.editing))
    $("#studio-page").onclick = guard(openPagePanel)
    $("#studio-new").onclick = guard(openNewPage)
    $("#studio-publish").onclick = guard(openPublish)

    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea, [contenteditable]")) return
      if (e.key === "e" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setEditing(!state.editing)
      }
    })
    refreshDirty()
    setInterval(refreshDirty, 15000)
  }

  async function refreshDirty() {
    try {
      const { dirty } = await api("/status")
      state.dirtyCount = dirty
      const b = $("#studio-dirty")
      b.hidden = dirty === 0
      b.textContent = dirty
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
    state.mapping.forEach((node, i) => {
      node.classList.add("studio-block")
      node.dataset.studioBlock = String(i)
      node.addEventListener("click", onBlockClick)
    })
    showBanner(`Click any block to edit it. ${state.mapping.length} editable blocks.`, [
      { label: "Edit page source", onClick: openPageSource },
      { label: "Page settings", onClick: openPagePanel },
    ])
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
                toast("Moved — rebuilding…", "ok")
                return setTimeout(() => (location.pathname = "/" + r.slug), 1600)
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
              toast("Moved to .studio-trash — nothing permanently deleted.", "ok", 5000)
              setTimeout(() => (location.pathname = "/"), 1400)
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
              toast("Created — opening…", "ok")
              setTimeout(() => (location.pathname = "/" + r.slug), 1600)
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

  // ------------------------------------------------------------ publish

  function openPublish() {
    const log = el("pre", { className: "studio-log", textContent: "" })
    const status = el("p", { className: "studio-muted", textContent: `${state.dirtyCount} file(s) changed since your last publish.` })

    openModal(
      "Publish to the live site",
      el("div", {}, status, log),
      [
        {
          label: "Publish now",
          primary: true,
          keep: true,
          onClick: (btn) => {
            btn.disabled = true
            btn.textContent = "Publishing…"
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
                    btn.disabled = false
                    btn.textContent = "Publish now"
                    if (code === 0) {
                      status.innerHTML =
                        'Published. The live site rebuilds in about 5 minutes — <a href="https://barkernotbob.github.io" target="_blank" rel="noopener">barkernotbob.github.io</a>'
                      toast("Published", "ok")
                      refreshDirty()
                    } else {
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
