// PROTOTYPE — Dev Hub variant I ("Briefing", round 3). Throwaway.
// Reads like a morning paper: a plain-English summary up top, then one story per project with the
// things that need you, numbered, each with its button. Organised by project, not by status.
const root = input.root;
const data = JSON.parse(await app.vault.adapter.read(`${root}/_view/data.json`));
const { kind, key } = input;
const here = dv.currentFilePath;
const wrap = dv.container.createDiv({ cls: "dhi" });
const go = (path) => app.workspace.openLinkText(path, here);
const itemPath = (i) => `${root}/Items/${i.file}`;
const projPath = (p) => `${root}/Projects/${p}`;
const md = async (el, text) => { const k = dv.container; dv.container = el; await dv.paragraph(text); dv.container = k; };
const toast = (msg) => new Notice(msg, 2500);
const needs = (i) => data.needsYou.includes(i.bucket);
const KICK = { grill: "Needs your answers", test: "Needs you to test it", blocked: "Stuck: needs a decision",
  "in-progress": "Claude is building it", ready: "Waiting for Claude", parked: "Parked" };
const BTN = { Grill: "Grill it →", Pass: "It works ✓", Fail: "It's broken ✕" };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const PER_STORY = 3;

function actions(parent, i) {
  const r = parent.createDiv({ cls: "dhi-acts" });
  for (const a of i.actions) {
    const b = r.createEl("a", { cls: `dhi-btn dhi-btn-${a.label.toLowerCase()}`, text: BTN[a.label], href: a.url });
    b.onclick = (e) => e.stopPropagation();
  }
  if (i.actions.length) {
    r.createEl("button", { cls: "dhi-btn dhi-btn-ghost", text: "Copy command" }).onclick =
      async (e) => { e.stopPropagation(); await navigator.clipboard.writeText(i.actions[0].copy); toast(`Copied: ${i.actions[0].copy}`); };
  } else {
    const g = r.createEl("a", { cls: "dhi-btn dhi-btn-ghost", text: "Open on GitHub ↗", href: i.url });
    g.onclick = (e) => e.stopPropagation();
  }
}
function entry(parent, i, n) {
  const e = parent.createDiv({ cls: `dhi-entry dhi-c-${i.bucket}` });
  e.createDiv({ cls: "dhi-num", text: String(n) });
  const m = e.createDiv({ cls: "dhi-entry-main" });
  m.createDiv({ cls: "dhi-kicker", text: (i.urgent ? "Urgent · " : "") + KICK[i.bucket] + ` · #${i.num} · ${i.age}` });
  const t = m.createEl("a", { cls: "dhi-entry-title", text: i.title });
  t.onclick = () => go(itemPath(i));
  if (i.para) m.createDiv({ cls: "dhi-dek", text: i.para.replace(/\*\*|__|`/g, "") });
  actions(m, i);
}
function masthead(sub) {
  const h = wrap.createDiv({ cls: "dhi-mast" });
  const row = h.createDiv({ cls: "dhi-mast-row" });
  row.createDiv({ cls: "dhi-mast-name", text: "The Dev Hub" });
  row.createEl("button", { cls: "dhi-btn dhi-btn-ghost dhi-refresh", text: "↻ Refresh" }).onclick =
    () => toast("Prototype: refresh isn't wired up. The real one re-reads GitHub.");
  h.createDiv({ cls: "dhi-mast-sub", text: sub });
}

// ---------------------------------------------------------------- hub
if (kind === "hub") {
  masthead(`Edition of ${data.stamp}`);
  const q = data.items.filter(needs);
  const n = (b) => q.filter((i) => i.bucket === b).length;
  const urgent = data.projects.filter((p) => p.urgent).map((p) => p.name);
  const shipped = data.done.filter((d) => d.week).length;
  const lede = wrap.createDiv({ cls: "dhi-lede" });
  lede.createSpan({ cls: "dhi-lede-big", text: `${plural(q.length, "thing needs", "things need")} you. ` });
  lede.appendText(`${n("grill")} want answers, ${n("test")} ${n("test") === 1 ? "is" : "are"} ready to test, and ${n("blocked")} ${n("blocked") === 1 ? "is" : "are"} stuck. `);
  if (urgent.length) lede.appendText(`Start with ${urgent.join(" and ")}: it's marked urgent. `);
  lede.appendText(`Claude shipped ${shipped} things this week.`);
  wrap.createDiv({ cls: "dhi-note", text: data.note });

  const cols = wrap.createDiv({ cls: "dhi-cols" });
  const main = cols.createDiv({ cls: "dhi-main" });
  const rail = cols.createDiv({ cls: "dhi-rail" });

  for (const p of data.projects.filter((x) => x.needs)) {
    let count = 0;
    const its = q.filter((i) => i.proj === p.name);
    const s = main.createDiv({ cls: "dhi-story" });
    const h = s.createEl("a", { cls: "dhi-story-h", text: p.name });
    h.onclick = () => go(projPath(p.name));
    s.createDiv({ cls: "dhi-story-dek", text: `${plural(p.needs, "needs", "need")} you · ${p.total} open` + (p.week ? ` · ${p.week} shipped this week` : "") });
    its.slice(0, PER_STORY).forEach((i) => entry(s, i, ++count));
    if (its.length > PER_STORY) {
      const more = s.createEl("a", { cls: "dhi-more", text: `${its.length - PER_STORY} more in ${p.name} →` });
      more.onclick = () => go(projPath(p.name));
    }
  }
  const quiet = data.projects.filter((x) => !x.needs);
  if (quiet.length) {
    const s = main.createDiv({ cls: "dhi-story" });
    s.createDiv({ cls: "dhi-story-h", text: "Quiet projects" });
    s.createDiv({ cls: "dhi-story-dek", text: "Nothing needs you here." });
    for (const p of quiet) s.createEl("a", { cls: "dhi-quiet", text: `${p.name} · ${p.total} open` }).onclick = () => go(projPath(p.name));
  }

  // Right rail on desktop (moves under the stories on phone): the numbers at a glance.
  const box = rail.createDiv({ cls: "dhi-railbox" });
  box.createDiv({ cls: "dhi-railh", text: "At a glance" });
  const tbl = box.createEl("table", { cls: "dhi-table" });
  const hr = tbl.createEl("tr");
  hr.createEl("th", { text: "Project" });
  for (const b of data.needsYou) hr.createEl("th", { text: data.labels[b] });
  for (const p of data.projects) {
    const r = tbl.createEl("tr");
    const c = r.createEl("td"); c.createEl("a", { text: p.name }).onclick = () => go(projPath(p.name));
    for (const b of data.needsYou) r.createEl("td", { cls: p.counts[b] ? `dhi-c-${b} dhi-has` : "dhi-zero", text: p.counts[b] ? String(p.counts[b]) : "–" });
  }
  const other = rail.createDiv({ cls: "dhi-railbox" });
  other.createDiv({ cls: "dhi-railh", text: "Everything else" });
  const ip = data.items.filter((i) => ["in-progress", "ready"].includes(i.bucket)).length;
  for (const [l, v] of [["Claude's queue", ip], ["Parked", data.items.filter((i) => i.bucket === "parked").length], ["Shipped this week", shipped]]) {
    const r = other.createDiv({ cls: "dhi-kv" }); r.createSpan({ text: l }); r.createSpan({ cls: "dhi-kv-n", text: String(v) });
  }
}

// ---------------------------------------------------------------- project
if (kind === "project") {
  const p = data.projects.find((x) => x.name === key);
  const its = data.items.filter((i) => i.proj === key);
  wrap.createEl("a", { cls: "dhi-back", text: "‹ The Dev Hub" }).onclick = () => go(`${root}/Dev Hub`);
  wrap.createDiv({ cls: "dhi-h1", text: key });
  const mine = its.filter(needs);
  const lede = wrap.createDiv({ cls: "dhi-lede dhi-lede-sm" });
  lede.setText(`${mine.length ? plural(mine.length, "thing needs", "things need") + " you" : "Nothing needs you"}. ` +
    `${its.length} open in total; ${p.week} shipped this week.`);

  let n = 0;
  const sec = (title, list, numbered) => {
    if (!list.length) return;
    const s = wrap.createDiv({ cls: "dhi-story" });
    s.createDiv({ cls: "dhi-story-h", text: title });
    if (numbered) list.forEach((i) => entry(s, i, ++n));
    else for (const i of list) {
      const r = s.createEl("a", { cls: `dhi-line dhi-c-${i.bucket}` });
      r.createSpan({ cls: "dhi-line-k", text: data.labels[i.bucket] });
      r.createSpan({ text: i.title });
      r.onclick = () => go(itemPath(i));
    }
  };
  sec("For you", mine, true);
  sec("With Claude", its.filter((i) => ["in-progress", "ready"].includes(i.bucket)), false);
  sec("Parked", its.filter((i) => i.bucket === "parked"), false);
  const done = data.done.filter((d) => d.proj === key);
  if (done.length) {
    const d = wrap.createEl("details", { cls: "dhi-story dhi-done" });
    d.createEl("summary", { cls: "dhi-story-h", text: `Shipped (${done.length})` });
    for (const x of done) {
      const r = d.createEl("a", { cls: "dhi-line", href: x.url });
      r.createSpan({ cls: "dhi-line-k", text: x.closed.replace(/, \d{4}$/, "") });
      r.createSpan({ text: x.title });
    }
  }
}

// ---------------------------------------------------------------- item
if (kind === "item") {
  const i = data.items.find((x) => `${x.proj}#${x.num}` === key);
  wrap.createEl("a", { cls: "dhi-back", text: `‹ ${i.proj}` }).onclick = () => go(projPath(i.proj));
  const art = wrap.createDiv({ cls: `dhi-article dhi-c-${i.bucket}` });
  art.createDiv({ cls: "dhi-kicker", text: (i.urgent ? "Urgent · " : "") + KICK[i.bucket] });
  art.createDiv({ cls: "dhi-h1", text: i.title });
  art.createDiv({ cls: "dhi-byline", text: `${i.proj} · issue #${i.num} · opened ${i.age === "today" ? "today" : i.age + " ago"}` });
  if (i.pretend) art.createDiv({ cls: "dhi-byline", text: `Prototype: pretend "${i.pretend}" label.` });
  const box = art.createDiv({ cls: "dhi-actbox" });
  actions(box, i);
  if (i.actions.length) box.createEl("a", { cls: "dhi-gh", text: "Open on GitHub ↗", href: i.url });
  await md(art.createDiv({ cls: "dhi-standfirst" }), i.para || "_No description._");
  if (i.comment) {
    art.createDiv({ cls: "dhi-subhead", text: i.commentHeading });
    await md(art.createDiv({ cls: "dhi-prose" }), i.comment);
  }
}
