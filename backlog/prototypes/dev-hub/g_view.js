// PROTOTYPE — Dev Hub variant G ("Bright", round 3). Throwaway.
// A's layout with E's polish, always light. Clarity rules: every title shown in full, nothing
// scrolls sideways, every button says what it does, every count says what it counts.
const root = input.root;
const data = JSON.parse(await app.vault.adapter.read(`${root}/_view/data.json`));
const { kind, key } = input;
const here = dv.currentFilePath;
const wrap = dv.container.createDiv({ cls: "dhg" });
const go = (path) => app.workspace.openLinkText(path, here);
const itemPath = (i) => `${root}/Items/${i.file}`;
const projPath = (p) => `${root}/Projects/${p}`;
const md = async (el, text) => { const k = dv.container; dv.container = el; await dv.paragraph(text); dv.container = k; };
const toast = (msg) => new Notice(msg, 2500);
const ASK = { grill: "Needs your answers", test: "Needs you to test it", blocked: "Stuck: needs a decision",
  "in-progress": "Claude is building it", ready: "Waiting for Claude", parked: "Parked" };
const BTN = { Grill: "Grill it", Pass: "It works", Fail: "It's broken" };

function buttons(parent, i, cls = "") {
  const row = parent.createDiv({ cls: `dhg-acts ${cls}` });
  for (const a of i.actions) {
    const b = row.createEl("a", { cls: `dhg-btn dhg-btn-${a.label.toLowerCase()}`, text: BTN[a.label], href: a.url });
    b.onclick = (e) => e.stopPropagation();
  }
  if (i.actions.length) {
    const c = row.createEl("button", { cls: "dhg-btn dhg-btn-ghost", text: "Copy command" });
    c.onclick = async (e) => { e.stopPropagation(); await navigator.clipboard.writeText(i.actions[0].copy); toast(`Copied: ${i.actions[0].copy}`); };
  } else {
    const g = row.createEl("a", { cls: "dhg-btn dhg-btn-ghost", text: "Open on GitHub ↗", href: i.url });
    g.onclick = (e) => e.stopPropagation();
  }
  return row;
}
function meta(parent, i, showProj) {
  const m = parent.createDiv({ cls: "dhg-meta" });
  if (i.urgent) m.createSpan({ cls: "dhg-tag dhg-c-urgent", text: "Urgent" });
  m.createSpan({ cls: `dhg-tag dhg-c-${i.bucket}`, text: `${data.icons[i.bucket]} ${data.labels[i.bucket]}` });
  m.createSpan({ text: `${showProj ? i.proj + " · " : ""}#${i.num} · opened ${i.age === "today" ? "today" : i.age + " ago"}` });
}
function row(parent, i, showProj) {
  const r = parent.createDiv({ cls: `dhg-row dhg-c-${i.bucket}` });
  r.onclick = () => go(itemPath(i));
  const main = r.createDiv({ cls: "dhg-row-main" });
  main.createDiv({ cls: "dhg-row-title", text: i.title });
  meta(main, i, showProj);
  buttons(r, i, "dhg-row-acts");
}
function back(label, path) {
  wrap.createEl("a", { cls: "dhg-back", text: `‹ ${label}` }).onclick = () => go(path);
}

// ---------------------------------------------------------------- hub
if (kind === "hub") {
  const head = wrap.createDiv({ cls: "dhg-head" });
  const t = head.createDiv();
  t.createDiv({ cls: "dhg-h1", text: "Dev Hub" });
  t.createDiv({ cls: "dhg-sub", text: `Updated ${data.stamp}` });
  head.createEl("button", { cls: "dhg-btn dhg-btn-ghost dhg-refresh", text: "↻ Refresh" }).onclick =
    () => toast("Prototype: refresh isn't wired up. The real one re-reads GitHub.");

  // Three tiles double as the filter for the list below. Fixed size, so picking one moves nothing.
  const queue = data.items.filter((i) => data.needsYou.includes(i.bucket));
  let filter = "all";
  const tiles = wrap.createDiv({ cls: "dhg-tiles" });
  const listHead = wrap.createDiv({ cls: "dhg-listhead" });
  const list = wrap.createDiv({ cls: "dhg-list" });
  const draw = () => {
    tiles.querySelectorAll(".dhg-tile").forEach((x) => x.toggleClass("is-on", x.dataset.k === filter));
    const its = queue.filter((i) => filter === "all" || i.bucket === filter);
    listHead.empty();
    listHead.createSpan({ cls: "dhg-h2", text: filter === "all" ? `Everything that needs you · ${its.length}` : `${data.labels[filter]} · ${its.length}` });
    const all = listHead.createEl("a", { cls: "dhg-link", text: "Show all 3 kinds" });
    all.style.visibility = filter === "all" ? "hidden" : "visible";
    all.onclick = () => { filter = "all"; draw(); };
    list.empty();
    if (!its.length) list.createDiv({ cls: "dhg-empty", text: "Nothing here right now." });
    its.forEach((i) => row(list, i, true));
  };
  for (const b of data.needsYou) {
    const n = queue.filter((i) => i.bucket === b).length;
    const tile = tiles.createDiv({ cls: `dhg-tile dhg-c-${b}` });
    tile.dataset.k = b;
    tile.createDiv({ cls: "dhg-tile-n", text: String(n) });
    tile.createDiv({ cls: "dhg-tile-l", text: `${data.icons[b]} ${data.labels[b]}` });
    tile.createDiv({ cls: "dhg-tile-s", text: ASK[b] });
    tile.onclick = () => { filter = filter === b ? "all" : b; draw(); };
  }
  draw();

  wrap.createDiv({ cls: "dhg-h2 dhg-h2-pad", text: `Projects · ${data.projects.length}` });
  const grid = wrap.createDiv({ cls: "dhg-grid" });
  for (const p of data.projects) {
    const c = grid.createDiv({ cls: "dhg-card" });
    c.onclick = () => go(projPath(p.name));
    const top = c.createDiv({ cls: "dhg-card-top" });
    top.createDiv({ cls: "dhg-card-name", text: p.name });
    if (p.urgent) top.createSpan({ cls: "dhg-tag dhg-c-urgent", text: "Urgent" });
    const counts = c.createDiv({ cls: "dhg-counts" });
    for (const b of data.buckets) if (p.counts[b]) {
      const s = counts.createDiv({ cls: `dhg-count dhg-c-${b}` });
      s.createSpan({ cls: "dhg-count-n", text: String(p.counts[b]) });
      s.createSpan({ text: data.labels[b] });
    }
    c.createDiv({ cls: "dhg-card-foot", text: `${p.needs} need you · ${p.total} open` + (p.week ? ` · ${p.week} shipped this week` : "") });
  }
  const q = data.items.filter((i) => ["in-progress", "ready"].includes(i.bucket)).length;
  wrap.createDiv({ cls: "dhg-foot", text: `Claude's queue: ${q}. Parked: ${data.items.filter((i) => i.bucket === "parked").length}. ` +
    `Shipped this week: ${data.done.filter((d) => d.week).length}. ${data.note}` });
}

// ---------------------------------------------------------------- project
if (kind === "project") {
  const p = data.projects.find((x) => x.name === key);
  const its = data.items.filter((i) => i.proj === key);
  back("Dev Hub", `${root}/Dev Hub`);
  wrap.createDiv({ cls: "dhg-h1", text: key });
  const stats = wrap.createDiv({ cls: "dhg-stats" });
  for (const [n, l] of [[p.needs, "need you"], [its.length, "open"], [p.week, "shipped this week"]]) {
    const s = stats.createDiv(); s.createSpan({ cls: "dhg-stat-n", text: String(n) }); s.createSpan({ text: ` ${l}` });
  }
  const groups = [["urgent", "Urgent", its.filter((i) => i.urgent)],
    ...data.buckets.map((b) => [b, data.labels[b], its.filter((i) => i.bucket === b && !i.urgent)])];
  for (const [k, label, g] of groups) {
    if (!g.length) continue;
    const sec = wrap.createDiv({ cls: `dhg-sec dhg-c-${k}` });
    sec.createSpan({ cls: "dhg-sec-l", text: `${data.icons[k] ?? "🚨"} ${label}` });
    sec.createSpan({ cls: "dhg-sec-s", text: `${g.length} · ${ASK[k] ?? "Do these first"}` });
    const list = wrap.createDiv({ cls: "dhg-list" });
    g.forEach((i) => row(list, i, false));
  }
  const done = data.done.filter((d) => d.proj === key);
  if (done.length) {
    const det = wrap.createEl("details", { cls: "dhg-done" });
    det.createEl("summary", { text: `✅ Shipped · ${done.length} (${p.week} this week)` });
    for (const d of done) {
      const r = det.createEl("a", { cls: "dhg-done-row", href: d.url });
      r.createSpan({ cls: "dhg-done-date", text: d.closed });
      r.createSpan({ text: d.title });
    }
  }
}

// ---------------------------------------------------------------- item
if (kind === "item") {
  const i = data.items.find((x) => `${x.proj}#${x.num}` === key);
  back(i.proj, projPath(i.proj));
  const head = wrap.createDiv({ cls: `dhg-ihead dhg-c-${i.bucket}` });
  head.createDiv({ cls: "dhg-ask", text: (i.urgent ? "Urgent · " : "") + ASK[i.bucket] });
  head.createDiv({ cls: "dhg-h1", text: i.title });
  meta(head, i, true);
  if (i.pretend) head.createDiv({ cls: "dhg-sub", text: `Prototype: pretend "${i.pretend}" label.` });
  buttons(head, i, "dhg-acts-big");
  if (i.actions.length) head.createEl("a", { cls: "dhg-gh", text: "Open on GitHub ↗", href: i.url });

  const box = wrap.createDiv({ cls: "dhg-box" });
  box.createDiv({ cls: "dhg-box-h", text: "What it is" });
  await md(box.createDiv({ cls: "dhg-prose" }), i.para || "_No description._");
  if (i.comment) {
    const q = wrap.createDiv({ cls: `dhg-box dhg-box-q dhg-c-${i.bucket}` });
    q.createDiv({ cls: "dhg-box-h", text: i.commentHeading });
    await md(q.createDiv({ cls: "dhg-prose" }), i.comment);
  }
}
