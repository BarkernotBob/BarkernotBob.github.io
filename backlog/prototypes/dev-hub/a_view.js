// PROTOTYPE — Dev Hub variant A ("App"). Loaded by dv.view(); renders hub / project / item
// pages from data.json so every page shares one custom look. Throwaway.
const root = input.root ?? "Dev Hub prototype/A - App";
const data = JSON.parse(await app.vault.adapter.read(`${root}/_view/data.json`));
const { kind, key } = input;
const here = dv.currentFilePath;

const wrap = dv.container.createDiv({ cls: "dha" });
const go = (path) => app.workspace.openLinkText(path, here);
const itemPath = (i) => `${root}/Items/${i.file}`;
const projPath = (p) => `${root}/Projects/${p}`;
const md = async (el, text) => {            // render markdown into el, verbatim
  const keep = dv.container; dv.container = el; await dv.paragraph(text); dv.container = keep;
};
const pill = (el, b, extra = "") => el.createSpan({ cls: `dha-pill dha-${b} ${extra}`, text: `${data.icons[b]} ${data.labels[b]}` });
const toast = (msg) => new Notice(msg, 2500);

function header(title, sub, back) {
  const h = wrap.createDiv({ cls: "dha-head" });
  if (back) h.createEl("a", { cls: "dha-back", text: `‹ ${back.label}` }).onclick = () => go(back.path);
  const row = h.createDiv({ cls: "dha-titlerow" });
  row.createEl("h1", { text: title });
  if (sub) h.createDiv({ cls: "dha-sub", text: sub });
  return row;
}

function itemRow(parent, i, showProj) {
  const r = parent.createDiv({ cls: `dha-row dha-b-${i.bucket}` });
  r.onclick = () => go(itemPath(i));
  const main = r.createDiv({ cls: "dha-row-main" });
  main.createDiv({ cls: "dha-row-title", text: i.title });
  const meta = main.createDiv({ cls: "dha-row-meta" });
  if (i.urgent) meta.createSpan({ cls: "dha-urgent", text: "URGENT" });
  meta.createSpan({ text: `${data.icons[i.bucket]} ${data.labels[i.bucket]}` });
  if (showProj) meta.createSpan({ text: i.proj });
  meta.createSpan({ text: `#${i.num} · ${i.age}` });
  r.createDiv({ cls: "dha-chev", text: "›" });
}

// ---------------------------------------------------------------- hub
if (kind === "hub") {
  const row = header("Dev Hub", `Updated ${data.stamp}`);
  const btn = row.createEl("button", { cls: "dha-refresh", text: "↻ Refresh" });
  btn.onclick = () => toast("Prototype: refresh isn't wired up. The real one re-reads GitHub.");
  wrap.createDiv({ cls: "dha-note", text: data.note });

  const ny = wrap.createDiv({ cls: "dha-stats" });
  for (const b of data.needsYou) {
    const its = data.items.filter((i) => i.bucket === b);
    const t = ny.createDiv({ cls: `dha-stat dha-${b}` });
    t.createDiv({ cls: "dha-stat-n", text: String(its.length) });
    t.createDiv({ cls: "dha-stat-l", text: `${data.icons[b]} ${data.labels[b]}` });
    const top = t.createDiv({ cls: "dha-stat-top" });
    for (const i of its.slice(0, 3)) {
      const a = top.createDiv({ cls: "dha-stat-item", text: `${i.proj} · ${i.title}` });
      a.onclick = (e) => { e.stopPropagation(); go(itemPath(i)); };
    }
  }

  wrap.createEl("h2", { cls: "dha-h2", text: "Projects" });
  const grid = wrap.createDiv({ cls: "dha-grid" });
  for (const p of data.projects) {
    const c = grid.createDiv({ cls: "dha-card" });
    c.onclick = () => go(projPath(p.name));
    const top = c.createDiv({ cls: "dha-card-top" });
    top.createDiv({ cls: "dha-card-name", text: p.name });
    if (p.urgent) top.createSpan({ cls: "dha-urgent", text: "URGENT" });
    const bar = c.createDiv({ cls: "dha-bar" });
    const total = data.buckets.reduce((s, b) => s + p.counts[b], 0);
    for (const b of data.buckets) if (p.counts[b]) bar.createDiv({ cls: `dha-seg dha-${b}`, attr: { style: `flex:${p.counts[b] / total}` } });
    const chips = c.createDiv({ cls: "dha-chips" });
    for (const b of data.buckets) if (p.counts[b]) chips.createSpan({ cls: `dha-chip dha-${b}`, text: `${data.icons[b]} ${p.counts[b]}` });
    c.createDiv({ cls: "dha-card-foot", text: (p.needs ? `${p.needs} need you` : "Nothing needs you") + (p.week ? ` · ✅ ${p.week} shipped this week` : "") });
  }
}

// ---------------------------------------------------------------- project
if (kind === "project") {
  const p = data.projects.find((x) => x.name === key);
  const its = data.items.filter((i) => i.proj === key);
  header(key, `${its.length} open · ${p.needs} need you`, { label: "Dev Hub", path: `${root}/Dev Hub` });

  const sorts = [["bucket", "Needs you first"], ["old", "Oldest"], ["new", "Newest"]];
  const seg = wrap.createDiv({ cls: "dha-seg-ctl" });
  const list = wrap.createDiv();
  const draw = (mode) => {
    seg.querySelectorAll("button").forEach((b) => b.toggleClass("is-on", b.dataset.k === mode));
    list.empty();
    if (mode === "bucket") {
      const urgent = its.filter((i) => i.urgent);
      if (urgent.length) { list.createDiv({ cls: "dha-sec", text: "🚨 Urgent" }); urgent.forEach((i) => itemRow(list, i)); }
      for (const b of data.buckets) {
        const g = its.filter((i) => i.bucket === b && !i.urgent);
        if (!g.length) continue;
        list.createDiv({ cls: "dha-sec", text: `${data.icons[b]} ${data.labels[b]} · ${g.length}` });
        g.forEach((i) => itemRow(list, i));
      }
    } else {
      [...its].sort((a, b) => (mode === "old" ? 1 : -1) * a.created.localeCompare(b.created)).forEach((i) => itemRow(list, i));
    }
  };
  for (const [k, l] of sorts) { const b = seg.createEl("button", { text: l }); b.dataset.k = k; b.onclick = () => draw(k); }
  draw("bucket");

  const done = data.done.filter((d) => d.proj === key);
  const week = done.filter((d) => d.week);
  for (const [label, list2, open] of [[`✅ Shipped this week · ${week.length}`, week], [`Completed · ${done.length}`, done]]) {
    if (!list2.length) continue;
    const det = wrap.createEl("details", { cls: "dha-done" });
    det.createEl("summary", { text: label });
    for (const d of list2) {
      const r = det.createDiv({ cls: "dha-done-row" });
      r.createEl("a", { text: d.title, href: d.url });
      r.createDiv({ cls: "dha-row-meta", text: `${d.closed}${d.what.length ? " · " + d.what[0] : ""}` });
    }
  }
}

// ---------------------------------------------------------------- item
if (kind === "item") {
  const i = data.items.find((x) => `${x.proj}#${x.num}` === key);
  header(i.title, null, { label: i.proj, path: projPath(i.proj) });
  const pills = wrap.createDiv({ cls: "dha-pills" });
  if (i.urgent) pills.createSpan({ cls: "dha-pill dha-urgent-pill", text: "🚨 Urgent" });
  pill(pills, i.bucket);
  pills.createSpan({ cls: "dha-row-meta", text: `${i.proj} #${i.num} · opened ${i.age} ago` });
  if (i.pretend) wrap.createDiv({ cls: "dha-note", text: `Prototype: pretend "${i.pretend}" label.` });

  const acts = wrap.createDiv({ cls: "dha-actions" });
  for (const a of i.actions) {
    const b = acts.createEl("a", { cls: `dha-btn dha-btn-${a.label.toLowerCase()}`, text: a.label, href: a.url });
    b.setAttr("title", a.copy);
  }
  if (i.actions.length) {
    const c = acts.createEl("button", { cls: "dha-btn dha-btn-copy", text: "Copy command" });
    c.onclick = async () => { await navigator.clipboard.writeText(i.actions[0].copy); toast(`Copied: ${i.actions[0].copy}`); };
  }
  acts.createEl("a", { cls: "dha-gh", text: "GitHub ↗", href: i.url });

  const what = wrap.createDiv({ cls: "dha-box" });
  what.createDiv({ cls: "dha-box-h", text: "What it is" });
  await md(what.createDiv(), i.para || "_No description._");
  if (i.comment) {
    const q = wrap.createDiv({ cls: `dha-box dha-box-${i.bucket}` });
    q.createDiv({ cls: "dha-box-h", text: i.commentHeading });
    await md(q.createDiv(), i.comment);
  }
}
