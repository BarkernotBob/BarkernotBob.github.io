// PROTOTYPE — Dev Hub variant H ("Workspace", round 3). Throwaway.
// A Mail/Things-style app: lists on the left, items in the middle, the chosen item on the right,
// so on desktop you never leave the page. Every note (hub, project, item) opens the same workspace
// with a different thing selected. On phone it's one pane at a time, drilled into like Mail.
const root = input.root;
const data = JSON.parse(await app.vault.adapter.read(`${root}/_view/data.json`));
const { kind, key } = input;
const here = dv.currentFilePath;
// Outer div is the size container: a container query can't restyle the container itself.
const wrap = dv.container.createDiv({ cls: "dhh-outer" }).createDiv({ cls: "dhh" });
const md = async (el, text) => { const k = dv.container; dv.container = el; await dv.paragraph(text); dv.container = k; };
const toast = (msg) => new Notice(msg, 2500);
const ASK = { grill: "Needs your answers", test: "Needs you to test it", blocked: "Stuck: needs a decision",
  "in-progress": "Claude is building it", ready: "Waiting for Claude", parked: "Parked" };
const BTN = { Grill: "Grill it", Pass: "It works", Fail: "It's broken" };
const needs = (i) => data.needsYou.includes(i.bucket);

// Lists: smart lists first, then one per project.
const LISTS = [
  { id: "needs", icon: "⭐", name: "Needs you", sub: "Grill, test or unblock", items: data.items.filter(needs) },
  ...data.needsYou.map((b) => ({ id: b, icon: data.icons[b], name: data.labels[b], sub: ASK[b], items: data.items.filter((i) => i.bucket === b) })),
  { id: "queue", icon: "⚙️", name: "Claude's queue", sub: "Ready or being built", items: data.items.filter((i) => ["in-progress", "ready"].includes(i.bucket)) },
  { id: "parked", icon: data.icons.parked, name: "Parked", sub: "On hold", items: data.items.filter((i) => i.bucket === "parked") },
];
const PROJ = data.projects.map((p) => ({ id: `p:${p.name}`, name: p.name, p, items: data.items.filter((i) => i.proj === p.name) }));
const listById = (id) => [...LISTS, ...PROJ].find((l) => l.id === id);

let cur = kind === "project" ? `p:${key}` : "needs";
let sel = kind === "item" ? data.items.find((x) => `${x.proj}#${x.num}` === key) : null;
if (sel && !listById(cur).items.includes(sel)) cur = `p:${sel.proj}`;
// Phone shows one pane: nav (hub), list (project), detail (item).
wrap.dataset.view = kind === "item" ? "detail" : kind === "project" ? "list" : "nav";

const nav = wrap.createDiv({ cls: "dhh-pane dhh-nav" });
const mid = wrap.createDiv({ cls: "dhh-pane dhh-mid" });
const det = wrap.createDiv({ cls: "dhh-pane dhh-det" });

function drawNav() {
  nav.empty();
  const h = nav.createDiv({ cls: "dhh-navhead" });
  h.createDiv({ cls: "dhh-brand", text: "Dev Hub" });
  h.createEl("button", { cls: "dhh-icon", text: "↻", attr: { "aria-label": "Refresh" } }).onclick =
    () => toast("Prototype: refresh isn't wired up. The real one re-reads GitHub.");
  nav.createDiv({ cls: "dhh-stamp", text: `Updated ${data.stamp}` });
  const navRow = (l, sub, flag) => {
    const r = nav.createDiv({ cls: `dhh-navrow ${l.id === cur ? "is-on" : ""}` });
    r.createSpan({ cls: "dhh-navicon", text: l.icon ?? "" });
    const t = r.createDiv({ cls: "dhh-navtext" });
    const nm = t.createDiv({ cls: "dhh-navname", text: l.name });
    if (flag) nm.createSpan({ cls: "dhh-urgent", text: "Urgent" });
    if (sub) t.createDiv({ cls: "dhh-navsub", text: sub });
    r.createSpan({ cls: "dhh-navcount", text: String(l.items.length) });
    r.onclick = () => pick(l.id);
  };
  for (const l of LISTS) navRow(l, l.sub);
  nav.createDiv({ cls: "dhh-navsec", text: "Projects" });
  for (const l of PROJ) {
    l.icon = "📁";
    navRow(l, `${l.p.needs} need you` + (l.p.week ? ` · ${l.p.week} shipped` : ""), l.p.urgent);
  }
  nav.createDiv({ cls: "dhh-note", text: data.note });
}

function drawMid() {
  mid.empty();
  const l = listById(cur);
  const h = mid.createDiv({ cls: "dhh-midhead" });
  h.createEl("a", { cls: "dhh-back", text: "‹ Dev Hub" }).onclick = () => (wrap.dataset.view = "nav");
  h.createDiv({ cls: "dhh-title", text: l.name });
  const isProj = cur.startsWith("p:");
  h.createDiv({ cls: "dhh-sub", text: isProj ? `${l.p.needs} need you · ${l.items.length} open · ${l.p.week} shipped this week` : `${l.items.length} items · ${l.sub}` });
  if (!l.items.length) mid.createDiv({ cls: "dhh-empty", text: "Nothing here right now." });
  // Projects group by bucket so "what do I do here" reads top-down; smart lists stay one flat list.
  const groups = isProj
    ? [["Urgent", l.items.filter((i) => i.urgent)], ...data.buckets.map((b) => [`${data.icons[b]} ${data.labels[b]}`, l.items.filter((i) => i.bucket === b && !i.urgent)])]
    : [[null, l.items]];
  for (const [label, its] of groups) {
    if (!its.length) continue;
    if (label) mid.createDiv({ cls: "dhh-group", text: `${label} · ${its.length}` });
    for (const i of its) {
      const r = mid.createDiv({ cls: `dhh-item dhh-c-${i.bucket} ${i === sel ? "is-on" : ""}` });
      r.createSpan({ cls: "dhh-dot" });
      const t = r.createDiv({ cls: "dhh-itemtext" });
      t.createDiv({ cls: "dhh-itemtitle", text: i.title });
      t.createDiv({ cls: "dhh-itemsub", text: `${isProj ? "" : i.proj + " · "}${data.labels[i.bucket]} · #${i.num} · ${i.age}` });
      if (i.urgent) r.createSpan({ cls: "dhh-urgent", text: "Urgent" });
      r.onclick = () => { sel = i; wrap.dataset.view = "detail"; drawMid(); drawDet(); };
    }
  }
  if (isProj) {
    const done = data.done.filter((d) => d.proj === l.name);
    if (done.length) {
      const d = mid.createEl("details", { cls: "dhh-done" });
      d.createEl("summary", { text: `✅ Shipped · ${done.length}` });
      for (const x of done) {
        const r = d.createEl("a", { cls: "dhh-donerow", href: x.url });
        r.createDiv({ text: x.title }); r.createDiv({ cls: "dhh-itemsub", text: x.closed });
      }
    }
  }
}

async function drawDet() {
  det.empty();
  const i = sel;
  const h = det.createDiv({ cls: "dhh-dethead" });
  h.createEl("a", { cls: "dhh-back", text: `‹ ${listById(cur).name}` }).onclick = () => (wrap.dataset.view = "list");
  if (!i) { det.createDiv({ cls: "dhh-empty dhh-pickone", text: "Pick an item to see it here." }); return; }
  const card = det.createDiv({ cls: `dhh-detcard dhh-c-${i.bucket}` });
  card.createDiv({ cls: "dhh-ask", text: (i.urgent ? "Urgent · " : "") + ASK[i.bucket] });
  card.createDiv({ cls: "dhh-dettitle", text: i.title });
  card.createDiv({ cls: "dhh-sub", text: `${i.proj} · #${i.num} · opened ${i.age === "today" ? "today" : i.age + " ago"}` });
  if (i.pretend) card.createDiv({ cls: "dhh-sub", text: `Prototype: pretend "${i.pretend}" label.` });
  const acts = card.createDiv({ cls: "dhh-acts" });
  for (const a of i.actions) acts.createEl("a", { cls: `dhh-btn dhh-btn-${a.label.toLowerCase()}`, text: BTN[a.label], href: a.url });
  if (i.actions.length) {
    acts.createEl("button", { cls: "dhh-btn dhh-btn-ghost", text: "Copy command" }).onclick =
      async () => { await navigator.clipboard.writeText(i.actions[0].copy); toast(`Copied: ${i.actions[0].copy}`); };
  }
  acts.createEl("a", { cls: "dhh-btn dhh-btn-ghost", text: "GitHub ↗", href: i.url });

  const body = det.createDiv({ cls: "dhh-body" });
  body.createDiv({ cls: "dhh-label", text: "What it is" });
  await md(body.createDiv({ cls: "dhh-prose" }), i.para || "_No description._");
  if (i.comment) {
    body.createDiv({ cls: `dhh-label dhh-c-${i.bucket} dhh-label-c`, text: i.commentHeading });
    await md(body.createDiv({ cls: "dhh-prose" }), i.comment);
  }
}

function pick(id) {
  cur = id;
  const l = listById(id);
  sel = l.items[0] ?? null;          // desktop: always show something on the right
  wrap.dataset.view = "list";
  drawNav(); drawMid(); drawDet();
}

if (!sel) sel = listById(cur).items[0] ?? null;
drawNav(); drawMid(); await drawDet();
