// PROTOTYPE — Dev Hub round 4: J "Studio", K "Blocks", L "Pebble". Throwaway.
// One renderer for all three (input.variant picks the riff); the look lives in jkl_base.css + <v>_view.css.
// H's workspace (lists | items | the item), plus: G's Grill/Test/Blocked filter tiles, A's stacked
// progress bar under each project, and push-and-pull on desktop: the item viewer never moves; the two
// left panes share a fixed width, one expanded and one squished. Hovering the squished one expands it
// at once. No snap-back. Every row keeps the same height in both states (pin()), so whatever is under
// the mouse is still under it when the swap finishes.
// Phone: J and K drill in one pane at a time like H; L keeps both panes and swaps them on tap.
const root = input.root;
const v = input.variant;
const data = JSON.parse(await app.vault.adapter.read(`${root}/_view/data.json`));
const { kind, key } = input;
const outer = dv.container.createDiv({ cls: "dhx-outer" });
const wrap = outer.createDiv({ cls: `dhx dhx-${v}` });
const md = async (el, text) => { const k = dv.container; dv.container = el; await dv.paragraph(text); dv.container = k; };
const toast = (msg) => new Notice(msg, 2500);
const phone = () => outer.clientWidth <= 760;
const ASK = { grill: "Needs your answers", test: "Needs you to test it", blocked: "Stuck: needs a decision",
  "in-progress": "Claude is building it", ready: "Waiting for Claude", parked: "Parked" };
const BTN = { Grill: "Grill it", Pass: "It works", Fail: "It's broken" };
const needs = (i) => data.needsYou.includes(i.bucket);

// Icons: J = emoji, K = Obsidian's line icons, L = emoji in a soft round badge.
const LUCIDE = { grill: "flame", test: "flask-conical", blocked: "ban", "in-progress": "cog", ready: "list-todo",
  parked: "pause", needs: "star", queue: "cog", project: "folder", refresh: "refresh-cw" };
const EMOJI = { ...data.icons, needs: "⭐", queue: "⚙️", project: "📁", refresh: "↻" };
function icon(parent, k, cls = "") {
  const el = parent.createSpan({ cls: `dhx-ic ${cls}` });
  const si = dv.obsidian?.setIcon ?? globalThis.setIcon;
  if (v === "k" && si) { try { si(el, LUCIDE[k] ?? "circle"); if (el.firstChild) return el; } catch (e) {} }
  el.setText(EMOJI[k] ?? "•");
  return el;
}

const LISTS = [
  { id: "needs", ic: "needs", name: "Needs you", sub: "Grill, test or unblock", items: data.items.filter(needs) },
  ...data.needsYou.map((b) => ({ id: b, ic: b, name: data.labels[b], sub: ASK[b], items: data.items.filter((i) => i.bucket === b) })),
  { id: "queue", ic: "queue", name: "Claude's queue", sub: "Ready or being built", items: data.items.filter((i) => ["in-progress", "ready"].includes(i.bucket)) },
  { id: "parked", ic: "parked", name: "Parked", sub: "On hold", items: data.items.filter((i) => i.bucket === "parked") },
];
const PROJ = data.projects.map((p) => ({ id: `p:${p.name}`, ic: "project", name: p.name, p, items: data.items.filter((i) => i.proj === p.name) }));
const listById = (id) => [...LISTS, ...PROJ].find((l) => l.id === id);

let cur = kind === "project" ? `p:${key}` : "needs";
let sel = kind === "item" ? data.items.find((x) => `${x.proj}#${x.num}` === key) : null;
if (sel && !listById(cur).items.includes(sel)) cur = `p:${sel.proj}`;
let kf = null;                       // K only: the tiles filter whatever list is showing
wrap.dataset.open = "mid";           // decided: the items list starts expanded
wrap.dataset.view = kind === "item" ? "detail" : kind === "project" ? "list" : "nav";

const band = v === "l" ? wrap.createDiv({ cls: "dhx-band" }) : null;
const nav = wrap.createDiv({ cls: "dhx-pane dhx-nav" });
const mid = wrap.createDiv({ cls: "dhx-pane dhx-mid" });
const det = wrap.createDiv({ cls: "dhx-pane dhx-det" });

// ---------------------------------------------------------------- push and pull
for (const [pane, name] of [[nav, "nav"], [mid, "mid"]]) {
  pane.addEventListener("mouseenter", () => { if (!phone()) wrap.dataset.open = name; });
  // A click on the squished pane only expands it, so a mis-tap on a narrow strip never opens anything.
  pane.addEventListener("click", (e) => {
    if (wrap.dataset.open === name) return;
    if (phone() && v !== "l") return;
    e.stopPropagation(); e.preventDefault();
    wrap.dataset.open = name;
  }, true);
}

// Each row gets the taller of its two heights (expanded, squished), measured with the animation off.
const ROWS = {
  nav: ".dhx-navhead, .dhx-stamp, .dhx-tiles, .dhx-navrow, .dhx-navsec, .dhx-legend, .dhx-proj, .dhx-note",
  mid: ".dhx-midhead, .dhx-tiles, .dhx-filter, .dhx-empty, .dhx-group, .dhx-item",
};
function pin() {
  const rows = [...nav.querySelectorAll(ROWS.nav), ...mid.querySelectorAll(ROWS.mid)];
  rows.forEach((r) => (r.style.height = ""));
  if (phone() && (v !== "l" || wrap.dataset.view === "detail")) return;
  const was = wrap.dataset.open, h = rows.map(() => 0);
  wrap.addClass("is-measuring");
  for (const s of ["mid", "nav"]) {
    wrap.dataset.open = s;
    rows.forEach((r, i) => (h[i] = Math.max(h[i], r.getBoundingClientRect().height)));
  }
  wrap.dataset.open = was;
  rows.forEach((r, i) => { if (h[i]) r.style.height = `${h[i]}px`; });
  void wrap.offsetWidth;
  wrap.removeClass("is-measuring");
}
const setView = (x) => { wrap.dataset.view = x; pin(); };
let lastW = 0;
new ResizeObserver(() => { if (outer.clientWidth !== lastW) { lastW = outer.clientWidth; pin(); } }).observe(outer);
document.fonts?.ready.then(pin);

// ---------------------------------------------------------------- pieces
function bar(parent, counts) {
  const b = parent.createDiv({ cls: "dhx-bar" });
  const total = data.buckets.reduce((s, k) => s + counts[k], 0) || 1;
  for (const k of data.buckets) if (counts[k])
    b.createDiv({ cls: `dhx-seg dhx-c-${k}`, attr: { style: `flex:${counts[k] / total}`, "aria-label": `${counts[k]} ${data.labels[k]}` } });
}
function legend(parent) {
  const l = parent.createDiv({ cls: "dhx-legend" });
  for (const k of data.buckets) { const s = l.createSpan({ cls: `dhx-leg dhx-c-${k}` }); s.createSpan({ cls: "dhx-legdot" }); s.createSpan({ text: data.labels[k] }); }
}
function tiles(parent, source, onCls) {
  const t = parent.createDiv({ cls: "dhx-tiles" });
  for (const b of data.needsYou) {
    const n = source.filter((i) => i.bucket === b).length;
    const tile = t.createDiv({ cls: `dhx-tile dhx-c-${b} ${onCls(b) ? "is-on" : ""} ${n ? "" : "is-zero"}` });
    const top = tile.createDiv({ cls: "dhx-tile-top" });
    icon(top, b, "dhx-tile-ic");
    top.createSpan({ cls: "dhx-tile-n", text: String(n) });
    tile.createDiv({ cls: "dhx-tile-l", text: data.labels[b] });
    tile.createDiv({ cls: "dhx-tile-s", text: ASK[b] });
    tile.dataset.k = b;
  }
  return t;
}
function navRow(parent, l, sub) {
  const r = parent.createDiv({ cls: `dhx-navrow ${l.id === cur ? "is-on" : ""}` });
  icon(r, l.ic, "dhx-navic");
  const t = r.createDiv({ cls: "dhx-navtext" });
  t.createDiv({ cls: "dhx-navname", text: l.name });
  if (sub) t.createDiv({ cls: "dhx-navsub", text: sub });
  const c = r.createDiv({ cls: "dhx-count" });
  c.createDiv({ cls: "dhx-count-n", text: String(l.items.length) });
  c.createDiv({ cls: "dhx-count-l", text: "items" });
  r.onclick = () => pick(l.id);
}
function projRow(parent, l) {
  const p = l.p;
  const r = parent.createDiv({ cls: `dhx-proj ${l.id === cur ? "is-on" : ""}` });
  const top = r.createDiv({ cls: "dhx-proj-top" });
  const ic = icon(top, "project", "dhx-navic");
  if (v === "l") ic.setText(p.name[0].toUpperCase());
  const nm = top.createDiv({ cls: "dhx-proj-name" });
  const nmt = nm.createSpan();
  p.name.split(/(?<=[.\-_])/).forEach((part, i) => { if (i) nmt.createEl("wbr"); nmt.appendText(part); });
  if (p.urgent) nm.createSpan({ cls: "dhx-urgent", text: "Urgent" });
  const c = top.createDiv({ cls: "dhx-count" });
  c.createDiv({ cls: "dhx-count-n", text: String(p.total) });
  c.createDiv({ cls: "dhx-count-l", text: "open" });
  bar(r, p.counts);
  r.createDiv({ cls: "dhx-proj-sub", text: `${p.needs} need you` + (p.week ? ` · ${p.week} shipped this week` : "") });
  const chips = r.createDiv({ cls: "dhx-chips" });
  for (const b of data.buckets) if (p.counts[b]) {
    const s = chips.createSpan({ cls: `dhx-chip dhx-c-${b}` });
    s.createSpan({ cls: "dhx-chip-n", text: String(p.counts[b]) }); s.createSpan({ text: data.labels[b] });
  }
  r.onclick = () => pick(l.id);
}

// ---------------------------------------------------------------- left: lists
function drawNav() {
  nav.empty();
  const h = nav.createDiv({ cls: "dhx-navhead" });
  h.createDiv({ cls: "dhx-brand", text: "Dev Hub" });
  const rf = h.createEl("button", { cls: "dhx-refresh", attr: { "aria-label": "Refresh" } });
  icon(rf, "refresh"); rf.createSpan({ cls: "dhx-refresh-l", text: "Refresh" });
  rf.onclick = () => toast("Prototype: refresh isn't wired up. The real one re-reads GitHub.");
  nav.createDiv({ cls: "dhx-stamp", text: `Updated ${data.stamp}` });

  if (v === "j") {
    const t = tiles(nav, data.items, (b) => cur === b);
    t.querySelectorAll(".dhx-tile").forEach((x) => (x.onclick = () => pick(cur === x.dataset.k ? "needs" : x.dataset.k)));
  }
  navRow(nav, LISTS[0], v === "j" ? "All three kinds" : LISTS[0].sub);
  const sec = nav.createDiv({ cls: "dhx-navsec" });
  sec.createSpan({ text: `Projects · ${PROJ.length}` });
  legend(nav);
  const pl = nav.createDiv({ cls: "dhx-projs" });
  for (const l of PROJ) projRow(pl, l);
  nav.createDiv({ cls: "dhx-navsec", text: "More lists" });
  navRow(nav, LISTS[4], LISTS[4].sub);
  navRow(nav, LISTS[5], LISTS[5].sub);
  nav.createDiv({ cls: "dhx-note", text: data.note });
}

function drawBand() {
  band.empty();
  const t = tiles(band, data.items, (b) => cur === b);
  t.querySelectorAll(".dhx-tile").forEach((x) => (x.onclick = () => pick(cur === x.dataset.k ? "needs" : x.dataset.k)));
}

// ---------------------------------------------------------------- middle: items
function drawMid() {
  mid.empty();
  const l = listById(cur);
  const isProj = cur.startsWith("p:");
  const h = mid.createDiv({ cls: "dhx-midhead" });
  h.createEl("a", { cls: "dhx-back", text: "‹ Dev Hub" }).onclick = () => setView("nav");
  h.createDiv({ cls: "dhx-title", text: l.name });
  h.createDiv({ cls: "dhx-sub", text: isProj ? `${l.p.needs} need you · ${l.items.length} open · ${l.p.week} shipped this week` : `${l.items.length} items · ${l.sub}` });
  h.createDiv({ cls: "dhx-sub-short", text: `${l.items.length} ${isProj ? "open" : "items"}` });

  let its = l.items;
  if (v === "k") {
    const t = tiles(mid, l.items, (b) => kf === b);
    t.querySelectorAll(".dhx-tile").forEach((x) => (x.onclick = () => {
      if (x.hasClass("is-zero")) return;
      kf = kf === x.dataset.k ? null : x.dataset.k; drawMid(); pin();
    }));
    const f = mid.createDiv({ cls: "dhx-filter" });
    f.createSpan({ text: kf ? `Showing ${data.labels[kf]} only` : "Showing everything" });
    const all = f.createEl("a", { cls: "dhx-link", text: "Show all" });
    all.style.visibility = kf ? "visible" : "hidden";
    all.onclick = () => { kf = null; drawMid(); pin(); };
    if (kf) its = its.filter((i) => i.bucket === kf);
  }
  if (!its.length) mid.createDiv({ cls: "dhx-empty", text: "Nothing here right now." });
  const groups = isProj
    ? [["urgent", "Urgent", its.filter((i) => i.urgent)], ...data.buckets.map((b) => [b, data.labels[b], its.filter((i) => i.bucket === b && !i.urgent)])]
    : [[null, null, its]];
  for (const [k, label, g] of groups) {
    if (!g.length) continue;
    if (label) {
      const gh = mid.createDiv({ cls: `dhx-group dhx-c-${k}` });
      if (k !== "urgent") icon(gh, k, "dhx-group-ic");
      gh.createSpan({ text: `${label} · ${g.length}` });
    }
    for (const i of g) {
      const r = mid.createDiv({ cls: `dhx-item dhx-c-${i.bucket} ${i === sel ? "is-on" : ""}`, attr: { "aria-label": i.title } });
      r.createSpan({ cls: "dhx-dot" });
      const t = r.createDiv({ cls: "dhx-itemtext" });
      t.createDiv({ cls: "dhx-itemtitle", text: i.title });
      t.createDiv({ cls: "dhx-itemsub", text: `${isProj ? "" : i.proj + " · "}${data.labels[i.bucket]} · #${i.num} · ${i.age}` });
      if (i.urgent) r.createSpan({ cls: "dhx-urgent", text: "Urgent" });
      r.onclick = () => { sel = i; wrap.dataset.view = "detail"; drawMid(); pin(); drawDet(); };
    }
  }
  if (isProj) {
    const done = data.done.filter((d) => d.proj === l.name);
    if (done.length) {
      const d = mid.createEl("details", { cls: "dhx-done" });
      d.createEl("summary", { text: `✅ Shipped · ${done.length}` });
      for (const x of done) {
        const r = d.createEl("a", { cls: "dhx-donerow", href: x.url });
        r.createDiv({ text: x.title }); r.createDiv({ cls: "dhx-itemsub", text: x.closed });
      }
    }
  }
}

// ---------------------------------------------------------------- right: the item (never moves)
async function drawDet() {
  det.empty();
  const i = sel;
  const h = det.createDiv({ cls: "dhx-dethead" });
  h.createEl("a", { cls: "dhx-back", text: v === "l" ? "‹ Back" : `‹ ${listById(cur).name}` }).onclick =
    () => setView(v === "l" ? "nav" : "list");
  if (!i) { det.createDiv({ cls: "dhx-empty", text: "Pick an item to see it here." }); return; }
  const card = det.createDiv({ cls: `dhx-detcard dhx-c-${i.bucket}` });
  const ask = card.createDiv({ cls: "dhx-ask" });
  icon(ask, i.bucket, "dhx-ask-ic");
  ask.createSpan({ text: (i.urgent ? "Urgent · " : "") + ASK[i.bucket] });
  card.createDiv({ cls: "dhx-dettitle", text: i.title });
  card.createDiv({ cls: "dhx-sub", text: `${i.proj} · #${i.num} · opened ${i.age === "today" ? "today" : i.age + " ago"}` });
  if (i.pretend) card.createDiv({ cls: "dhx-sub", text: `Prototype: pretend "${i.pretend}" label.` });
  const acts = card.createDiv({ cls: "dhx-acts" });
  for (const a of i.actions) acts.createEl("a", { cls: `dhx-btn dhx-btn-${a.label.toLowerCase()}`, text: BTN[a.label], href: a.url });
  if (i.actions.length) {
    acts.createEl("button", { cls: "dhx-btn dhx-btn-ghost", text: "Copy command" }).onclick =
      async () => { await navigator.clipboard.writeText(i.actions[0].copy); toast(`Copied: ${i.actions[0].copy}`); };
  }
  acts.createEl("a", { cls: "dhx-btn dhx-btn-ghost", text: "Open on GitHub ↗", href: i.url });

  const body = det.createDiv({ cls: "dhx-body" });
  body.createDiv({ cls: "dhx-label", text: "What it is" });
  await md(body.createDiv({ cls: "dhx-prose" }), i.para || "_No description._");
  if (i.comment) {
    body.createDiv({ cls: `dhx-label dhx-label-c dhx-c-${i.bucket}`, text: i.commentHeading });
    await md(body.createDiv({ cls: "dhx-prose" }), i.comment);
  }
}

function pick(id) {
  cur = id; kf = null;
  sel = listById(id).items[0] ?? null;   // desktop: always show something on the right
  wrap.dataset.view = "list";
  drawAll();
}
function drawAll() { if (band) drawBand(); drawNav(); drawMid(); pin(); return drawDet(); }

if (!sel) sel = listById(cur).items[0] ?? null;
await drawAll();
