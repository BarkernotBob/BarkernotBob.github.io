// PROTOTYPE — Dev Hub variant D ("Calm", round 2 ultra-safe riff on A). Throwaway.
// Settings-app grouped lists, one accent colour, the hub lists the actual items that need you.
const root = input.root;
const data = JSON.parse(await app.vault.adapter.read(`${root}/_view/data.json`));
const { kind, key } = input;
const here = dv.currentFilePath;
const wrap = dv.container.createDiv({ cls: "dhd" });
const go = (path) => app.workspace.openLinkText(path, here);
const itemPath = (i) => `${root}/Items/${i.file}`;
const projPath = (p) => `${root}/Projects/${p}`;
const md = async (el, text) => { const k = dv.container; dv.container = el; await dv.paragraph(text); dv.container = k; };
const toast = (msg) => new Notice(msg, 2500);
const VERB = { grill: "Needs grilling", test: "Ready to test", blocked: "Blocked", "in-progress": "Claude is on it", ready: "Queued for Claude", parked: "Parked" };

function group(parent, title, extra) {
  const g = parent.createDiv({ cls: "dhd-group" });
  if (title) { const h = g.createDiv({ cls: "dhd-group-h" }); h.createSpan({ text: title }); if (extra) h.createSpan({ cls: "dhd-group-x", text: extra }); }
  return g.createDiv({ cls: "dhd-list" });
}
function row(list, { title, sub, right, dot, onclick, href, cls = "" }) {
  const r = list.createEl(href ? "a" : "div", { cls: `dhd-row ${cls}`, href });
  if (onclick) r.onclick = onclick;
  if (dot) r.createSpan({ cls: `dhd-dot dhd-${dot}` });
  const m = r.createDiv({ cls: "dhd-row-main" });
  m.createDiv({ cls: "dhd-row-title", text: title });
  if (sub) m.createDiv({ cls: "dhd-row-sub", text: sub });
  if (right != null) r.createSpan({ cls: "dhd-row-right", text: String(right) });
  r.createSpan({ cls: "dhd-chev", text: href ? "↗" : "›" });
  return r;
}
function itemRow(list, i, showProj) {
  return row(list, {
    title: i.title, dot: i.urgent ? "urgent" : i.bucket,
    sub: [i.urgent ? "Urgent" : null, showProj ? i.proj : VERB[i.bucket], `#${i.num}`, i.age].filter(Boolean).join(" · "),
    onclick: () => go(itemPath(i)),
  });
}
// Long groups show 5 rows and a "Show all" row that expands in place.
function capped(list, its, render, n = 5) {
  its.slice(0, n).forEach(render);
  if (its.length <= n) return;
  const more = list.createDiv({ cls: "dhd-row dhd-more", text: `Show all ${its.length}` });
  more.onclick = () => { more.remove(); its.slice(n).forEach(render); };
}
function title(t, sub, back) {
  const h = wrap.createDiv({ cls: "dhd-head" });
  if (back) h.createEl("a", { cls: "dhd-back", text: `‹ ${back.label}` }).onclick = () => go(back.path);
  h.createEl("h1", { text: t });
  if (sub) h.createDiv({ cls: "dhd-sub", text: sub });
  return h;
}

// ---------------------------------------------------------------- hub
if (kind === "hub") {
  const needs = data.items.filter((i) => data.needsYou.includes(i.bucket));
  const h = title("Dev Hub");
  const s = h.createDiv({ cls: "dhd-sub" });
  s.createSpan({ text: `Updated ${data.stamp} · ` });
  s.createEl("a", { cls: "dhd-link", text: "Refresh" }).onclick = () => toast("Prototype: refresh isn't wired up.");
  wrap.createDiv({ cls: "dhd-summary", text: `${needs.length} things need you across ${new Set(needs.map((i) => i.proj)).size} projects.` });

  const cols = wrap.createDiv({ cls: "dhd-cols" });
  const left = cols.createDiv(), right = cols.createDiv();
  const urgent = needs.filter((i) => i.urgent);
  if (urgent.length) { const l = group(left, "Urgent"); urgent.forEach((i) => itemRow(l, i, true)); }
  for (const b of data.needsYou) {
    const its = needs.filter((i) => i.bucket === b && !i.urgent);
    const l = group(left, data.labels[b], String(its.length));
    if (!its.length) { l.createDiv({ cls: "dhd-row dhd-empty", text: "Nothing here" }); continue; }
    capped(l, its, (i) => itemRow(l, i, true));
  }

  const pl = group(right, "Projects", "need you");
  for (const p of data.projects)
    row(pl, { title: p.name, sub: `${p.total} open${p.week ? ` · ${p.week} shipped this week` : ""}`,
              right: p.needs || "", dot: p.urgent ? "urgent" : null, onclick: () => go(projPath(p.name)) });
  const q = data.items.filter((i) => ["in-progress", "ready"].includes(i.bucket)).length;
  const parked = data.items.filter((i) => i.bucket === "parked").length;
  const week = data.done.filter((d) => d.week).length;
  const ol = group(right, "Everything else");
  for (const [t, n] of [["Claude's queue", q], ["Parked", parked], ["Shipped this week", week]])
    ol.createDiv({ cls: "dhd-row dhd-static" }).append(createSpan({ cls: "dhd-row-main", text: t }), createSpan({ cls: "dhd-row-right", text: String(n) }));
  wrap.createDiv({ cls: "dhd-foot", text: data.note });
}

// ---------------------------------------------------------------- project
if (kind === "project") {
  const p = data.projects.find((x) => x.name === key);
  const its = data.items.filter((i) => i.proj === key);
  title(key, `${its.length} open · ${p.needs} need you`, { label: "Dev Hub", path: `${root}/Dev Hub` });
  const cols = wrap.createDiv({ cls: "dhd-cols" });
  const left = cols.createDiv(), right = cols.createDiv();
  const urgent = its.filter((i) => i.urgent);
  if (urgent.length) { const l = group(left, "Urgent"); urgent.forEach((i) => itemRow(l, i)); }
  for (const b of data.buckets) {
    const g = its.filter((i) => i.bucket === b && !i.urgent);
    if (!g.length) continue;
    const l = group(left, data.labels[b], String(g.length));
    capped(l, g, (i) => itemRow(l, i), b === "parked" ? 3 : 8);
  }
  const done = data.done.filter((d) => d.proj === key);
  const week = done.filter((d) => d.week);
  const wl = group(right, "Shipped this week", String(week.length));
  if (!week.length) wl.createDiv({ cls: "dhd-row dhd-empty", text: "Nothing yet this week" });
  week.forEach((d) => row(wl, { title: d.title, sub: d.closed, href: d.url }));
  if (done.length) {
    const det = right.createEl("details", { cls: "dhd-group dhd-det" });
    det.createEl("summary", { cls: "dhd-group-h", text: `All completed · ${done.length}` });
    const l = det.createDiv({ cls: "dhd-list" });
    done.forEach((d) => row(l, { title: d.title, sub: d.closed + (d.what.length ? ` · ${d.what[0]}` : ""), href: d.url }));
  }
}

// ---------------------------------------------------------------- item
if (kind === "item") {
  const i = data.items.find((x) => `${x.proj}#${x.num}` === key);
  title(i.title, null, { label: i.proj, path: projPath(i.proj) });
  const cols = wrap.createDiv({ cls: "dhd-cols dhd-item" });
  const body = cols.createDiv({ cls: "dhd-body" }), side = cols.createDiv({ cls: "dhd-side" });

  // Side panel (desktop right; phone on top): status, then the one big action.
  const st = side.createDiv({ cls: "dhd-card" });
  const status = st.createDiv({ cls: "dhd-status" });
  status.createSpan({ cls: `dhd-dot dhd-${i.urgent ? "urgent" : i.bucket}` });
  status.createSpan({ text: (i.urgent ? "Urgent · " : "") + VERB[i.bucket] });
  st.createDiv({ cls: "dhd-facts", text: `${i.proj} #${i.num} · opened ${i.age} ago` });
  if (i.actions.length) {
    const acts = st.createDiv({ cls: "dhd-actions" });
    for (const a of i.actions)
      acts.createEl("a", { cls: `dhd-btn ${a.label === "Fail" ? "dhd-btn-2" : ""}`, text: a.label === "Grill" ? "Grill this" : a.label === "Pass" ? "It works" : "It's broken", href: a.url });
    const c = st.createEl("a", { cls: "dhd-link dhd-copy", text: "Copy command instead" });
    c.onclick = async () => { await navigator.clipboard.writeText(i.actions[0].copy); toast(`Copied: ${i.actions[0].copy}`); };
  } else st.createDiv({ cls: "dhd-facts", text: "Nothing for you to do. Claude picks this up on its own." });
  st.createEl("a", { cls: "dhd-link dhd-gh", text: "View on GitHub ↗", href: i.url });

  if (i.pretend) body.createDiv({ cls: "dhd-foot", text: `Prototype: pretend "${i.pretend}" label.` });
  body.createEl("h3", { cls: "dhd-h3", text: "What it is" });
  await md(body.createDiv({ cls: "dhd-prose" }), i.para || "_No description._");
  if (i.comment) {
    body.createEl("h3", { cls: "dhd-h3", text: i.commentHeading });
    await md(body.createDiv({ cls: "dhd-prose" }), i.comment);
  }
}
