// PROTOTYPE — Dev Hub variant E ("Focus", round 2 out-on-a-limb riff on A). Throwaway.
// Dark, one-thing-at-a-time: the hub hands you the next item with its button right there;
// projects are a board of bucket columns; item pages keep the action docked at the bottom.
const root = input.root;
const data = JSON.parse(await app.vault.adapter.read(`${root}/_view/data.json`));
const { kind, key } = input;
const here = dv.currentFilePath;
const wrap = dv.container.createDiv({ cls: "dhe" });
const go = (path) => app.workspace.openLinkText(path, here);
const itemPath = (i) => `${root}/Items/${i.file}`;
const projPath = (p) => `${root}/Projects/${p}`;
const md = async (el, text) => { const k = dv.container; dv.container = el; await dv.paragraph(text); dv.container = k; };
const toast = (msg) => new Notice(msg, 2500);
const queue = data.items.filter((i) => data.needsYou.includes(i.bucket)); // already urgent-first
const ASK = { grill: "Needs your answers", test: "Needs your test", blocked: "Stuck — needs a decision" };
const BTN = { Grill: "🔥 Grill it", Pass: "✓ Works", Fail: "✕ Broken" };

function buttons(parent, i, big) {
  const row = parent.createDiv({ cls: `dhe-acts ${big ? "dhe-acts-big" : ""}` });
  for (const a of i.actions) row.createEl("a", { cls: `dhe-btn dhe-btn-${a.label.toLowerCase()}`, text: BTN[a.label], href: a.url });
  if (i.actions.length) {
    const c = row.createEl("button", { cls: "dhe-btn dhe-btn-ghost", text: "Copy" });
    c.onclick = async (e) => { e.stopPropagation(); await navigator.clipboard.writeText(i.actions[0].copy); toast(`Copied: ${i.actions[0].copy}`); };
  } else row.createEl("a", { cls: "dhe-btn dhe-btn-ghost", text: "Open on GitHub ↗", href: i.url });
  return row;
}
function tag(parent, i) {
  const t = parent.createDiv({ cls: "dhe-tags" });
  if (i.urgent) t.createSpan({ cls: "dhe-tag dhe-c-urgent", text: "URGENT" });
  t.createSpan({ cls: `dhe-tag dhe-c-${i.bucket}`, text: `${data.icons[i.bucket]} ${data.labels[i.bucket].toUpperCase()}` });
  t.createSpan({ cls: "dhe-faint", text: `${i.proj} · #${i.num} · ${i.age}` });
}

// ---------------------------------------------------------------- hub
if (kind === "hub") {
  const top = wrap.createDiv({ cls: "dhe-top" });
  top.createDiv({ cls: "dhe-brand", text: "DEV HUB" });
  const rf = top.createEl("button", { cls: "dhe-icon", text: "↻" });
  rf.onclick = () => toast("Prototype: refresh isn't wired up.");
  top.createDiv({ cls: "dhe-faint dhe-stamp", text: data.stamp });

  let filter = "all", pos = 0;
  const chips = wrap.createDiv({ cls: "dhe-chips" });
  const main = wrap.createDiv({ cls: "dhe-main" });
  const hero = main.createDiv({ cls: "dhe-hero" });
  const side = main.createDiv({ cls: "dhe-next" });
  const list = () => queue.filter((i) => filter === "all" || i.bucket === filter);

  const draw = () => {
    const q = list();
    pos = (pos + q.length) % q.length;
    const i = q[pos];
    chips.querySelectorAll(".dhe-chip").forEach((c) => c.toggleClass("is-on", c.dataset.k === filter));
    hero.empty(); hero.className = `dhe-hero dhe-c-${i.bucket}`;
    const nav = hero.createDiv({ cls: "dhe-hero-nav" });
    nav.createSpan({ cls: "dhe-faint", text: `UP NEXT · ${pos + 1} OF ${q.length}` });
    const arrows = nav.createDiv({ cls: "dhe-arrows" });
    arrows.createEl("button", { cls: "dhe-icon", text: "‹" }).onclick = () => { pos--; draw(); };
    arrows.createEl("button", { cls: "dhe-icon", text: "›" }).onclick = () => { pos++; draw(); };
    hero.createDiv({ cls: "dhe-ask", text: i.urgent ? "Urgent · " + ASK[i.bucket] : ASK[i.bucket] });
    const h = hero.createDiv({ cls: "dhe-hero-title", text: i.title });
    h.onclick = () => go(itemPath(i));
    tag(hero, i);
    hero.createDiv({ cls: "dhe-hero-para", text: i.para || "No description." });
    buttons(hero, i, true);
    hero.createEl("a", { cls: "dhe-more", text: "Read the whole thing →" }).onclick = () => go(itemPath(i));

    side.empty();
    side.createDiv({ cls: "dhe-label", text: "AFTER THAT" });
    for (let n = 1; n <= Math.min(6, q.length - 1); n++) {
      const j = q[(pos + n) % q.length];
      const r = side.createDiv({ cls: `dhe-mini dhe-c-${j.bucket}` });
      r.onclick = () => { pos = (pos + n) % q.length; draw(); };
      r.createDiv({ cls: "dhe-mini-t", text: j.title });
      r.createDiv({ cls: "dhe-faint", text: `${data.icons[j.bucket]} ${j.proj}` });
    }
  };
  for (const [k, l] of [["all", `All ${queue.length}`], ...data.needsYou.map((b) => [b, `${data.icons[b]} ${data.labels[b]} ${queue.filter((i) => i.bucket === b).length}`])]) {
    const c = chips.createEl("button", { cls: "dhe-chip", text: l }); c.dataset.k = k;
    c.onclick = () => { if (!queue.some((i) => k === "all" || i.bucket === k)) return toast("Nothing there."); filter = k; pos = 0; draw(); };
  }
  draw();

  wrap.createDiv({ cls: "dhe-label dhe-label-pad", text: "PROJECTS" });
  const strip = wrap.createDiv({ cls: "dhe-strip" });
  for (const p of data.projects) {
    const tile = strip.createDiv({ cls: "dhe-tile" });
    tile.onclick = () => go(projPath(p.name));
    const pct = p.total ? Math.round((p.needs / p.total) * 100) : 0;
    const ring = tile.createDiv({ cls: "dhe-ring", attr: { style: `--p:${pct}` } });
    ring.createSpan({ text: String(p.needs) });
    tile.createDiv({ cls: "dhe-tile-name", text: p.name });
    tile.createDiv({ cls: "dhe-faint", text: `${p.total} open${p.week ? ` · ${p.week} shipped` : ""}` });
    if (p.urgent) tile.createSpan({ cls: "dhe-tag dhe-c-urgent dhe-tile-flag", text: "URGENT" });
  }
  const q = data.items.filter((i) => ["in-progress", "ready"].includes(i.bucket)).length;
  wrap.createDiv({ cls: "dhe-faint dhe-foot", text: `Claude's queue ${q} · Parked ${data.items.filter((i) => i.bucket === "parked").length} · Shipped this week ${data.done.filter((d) => d.week).length}. ${data.note}` });
}

// ---------------------------------------------------------------- project
if (kind === "project") {
  const p = data.projects.find((x) => x.name === key);
  const its = data.items.filter((i) => i.proj === key);
  const top = wrap.createDiv({ cls: "dhe-top" });
  top.createEl("a", { cls: "dhe-back", text: "‹ HUB" }).onclick = () => go(`${root}/Dev Hub`);
  wrap.createDiv({ cls: "dhe-pname", text: key });
  const stats = wrap.createDiv({ cls: "dhe-stats" });
  for (const [n, l] of [[p.needs, "need you"], [its.length, "open"], [p.week, "shipped this week"]]) {
    const s = stats.createDiv(); s.createDiv({ cls: "dhe-stat-n", text: String(n) }); s.createDiv({ cls: "dhe-faint", text: l });
  }
  const board = wrap.createDiv({ cls: "dhe-board" });
  for (const b of data.buckets) {
    const g = its.filter((i) => i.bucket === b).sort((a, z) => z.urgent - a.urgent);
    if (!g.length) continue;
    const col = board.createDiv({ cls: `dhe-col dhe-c-${b}` });
    const h = col.createDiv({ cls: "dhe-col-h" });
    h.createSpan({ text: `${data.icons[b]} ${data.labels[b].toUpperCase()}` }); h.createSpan({ text: String(g.length) });
    for (const i of g) {
      const c = col.createDiv({ cls: "dhe-card" });
      c.onclick = () => go(itemPath(i));
      if (i.urgent) c.createSpan({ cls: "dhe-tag dhe-c-urgent", text: "URGENT" });
      c.createDiv({ cls: "dhe-card-t", text: i.title });
      c.createDiv({ cls: "dhe-faint", text: `#${i.num} · ${i.age}` });
      if (i.actions.length) buttons(c, i, false);
    }
  }
  const done = data.done.filter((d) => d.proj === key);
  if (done.length) {
    wrap.createDiv({ cls: "dhe-label dhe-label-pad", text: "SHIPPED" });
    const tl = wrap.createDiv({ cls: "dhe-timeline" });
    done.forEach((d, n) => {
      const r = tl.createEl("a", { cls: `dhe-tl ${d.week ? "is-week" : ""} ${n >= 6 ? "is-hidden" : ""}`, href: d.url });
      r.createDiv({ cls: "dhe-tl-date", text: d.closed.replace(/, \d{4}$/, "") });
      r.createDiv({ cls: "dhe-tl-t", text: d.title });
    });
    if (done.length > 6) {
      const m = wrap.createEl("button", { cls: "dhe-btn dhe-btn-ghost dhe-showall", text: `Show all ${done.length}` });
      m.onclick = () => { tl.querySelectorAll(".is-hidden").forEach((e) => e.removeClass("is-hidden")); m.style.visibility = "hidden"; };
    }
  }
}

// ---------------------------------------------------------------- item
if (kind === "item") {
  const i = data.items.find((x) => `${x.proj}#${x.num}` === key);
  const top = wrap.createDiv({ cls: "dhe-top" });
  top.createEl("a", { cls: "dhe-back", text: `‹ ${i.proj.toUpperCase()}` }).onclick = () => go(projPath(i.proj));
  const head = wrap.createDiv({ cls: `dhe-ihead dhe-c-${i.bucket}` });
  if (data.needsYou.includes(i.bucket)) head.createDiv({ cls: "dhe-ask", text: (i.urgent ? "Urgent · " : "") + ASK[i.bucket] });
  head.createDiv({ cls: "dhe-ititle", text: i.title });
  tag(head, i);
  if (i.pretend) head.createDiv({ cls: "dhe-faint", text: `Prototype: pretend "${i.pretend}" label.` });

  const cols = wrap.createDiv({ cls: "dhe-icols" });
  const body = cols.createDiv({ cls: "dhe-ibody" });
  await md(body.createDiv({ cls: "dhe-lead" }), i.para || "_No description._");
  if (i.comment) {
    const q = body.createDiv({ cls: `dhe-qcard dhe-c-${i.bucket}` });
    q.createDiv({ cls: "dhe-label", text: i.commentHeading.toUpperCase() });
    await md(q.createDiv({ cls: "dhe-prose" }), i.comment);
  }
  const dock = cols.createDiv({ cls: "dhe-dock" });
  buttons(dock, i, true);
  if (i.actions.length) dock.createEl("a", { cls: "dhe-faint dhe-gh", text: "GitHub ↗", href: i.url });
  // "Next" walks the needs-you queue without going back to the hub.
  const n = queue.findIndex((x) => x === i);
  const nxt = queue[(n + 1) % queue.length];
  if (nxt && nxt !== i) {
    const nb = dock.createDiv({ cls: "dhe-nextup" });
    nb.createDiv({ cls: "dhe-faint", text: "NEXT UP" });
    nb.createDiv({ cls: "dhe-mini-t", text: nxt.title });
    nb.onclick = () => go(itemPath(nxt));
  }
}
