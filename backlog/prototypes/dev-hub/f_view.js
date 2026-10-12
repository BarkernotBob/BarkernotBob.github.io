// PROTOTYPE — Dev Hub variant F ("Messages", round 2 off-the-wall riff on A). Throwaway.
// The backlog as a messaging app: each project is a conversation, items are messages,
// the action buttons are quick replies. Desktop is two-pane (list + open thread).
const root = input.root;
const data = JSON.parse(await app.vault.adapter.read(`${root}/_view/data.json`));
const { kind, key } = input;
const here = dv.currentFilePath;
const wrap = dv.container.createDiv({ cls: "dhf" });
const go = (path) => app.workspace.openLinkText(path, here);
const itemPath = (i) => `${root}/Items/${i.file}`;
const projPath = (p) => `${root}/Projects/${p}`;
const md = async (el, text) => { const k = dv.container; dv.container = el; await dv.paragraph(text); dv.container = k; };
const toast = (msg) => new Notice(msg, 2500);
const snap = new Date(data.snap);
const needsYou = (i) => data.needsYou.includes(i.bucket);
const ASK = { grill: "Needs your answers", test: "Ready for you to test", blocked: "Stuck — needs a decision",
              "in-progress": "Claude is working on this", ready: "Waiting in Claude's queue", parked: "Parked for later" };
const REPLY = { Grill: "🔥 Grill it", Pass: "👍 Works", Fail: "👎 Broken" };

const when = (iso) => {
  const d = new Date(iso), days = Math.floor((snap - d) / 864e5);
  return days < 1 ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : days < 7 ? d.toLocaleDateString([], { weekday: "short" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};
const initials = (n) => n.split(/[-. ]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const hue = (n) => [...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
function avatar(parent, name, size = "") {
  const a = parent.createDiv({ cls: `dhf-av ${size}`, text: name === "*" ? "🔔" : initials(name) });
  if (name !== "*") a.style.setProperty("--h", hue(name));
  else a.addClass("dhf-av-bell");
  return a;
}
function replies(parent, i, withOpen) {
  const r = parent.createDiv({ cls: "dhf-replies" });
  for (const a of i.actions) r.createEl("a", { cls: `dhf-reply dhf-reply-${a.label.toLowerCase()}`, text: REPLY[a.label], href: a.url });
  if (i.actions.length) {
    const c = r.createEl("button", { cls: "dhf-reply", text: "📋 Copy" });
    c.onclick = async (e) => { e.stopPropagation(); await navigator.clipboard.writeText(i.actions[0].copy); toast(`Copied: ${i.actions[0].copy}`); };
  }
  if (withOpen) r.createEl("a", { cls: "dhf-reply", text: "Open ›" }).onclick = () => go(itemPath(i));
  return r;
}

// One message bubble for an open item. `from` shows the project name (used in the all-projects thread).
function itemBubble(list, i, from) {
  const row = list.createDiv({ cls: "dhf-msg" });
  if (from) avatar(row, i.proj, "dhf-av-s"); else row.createDiv({ cls: "dhf-av-gap" });
  const col = row.createDiv({ cls: "dhf-msg-col" });
  if (from) col.createDiv({ cls: "dhf-from", text: i.proj });
  const b = col.createDiv({ cls: `dhf-bubble dhf-k-${i.bucket} ${needsYou(i) ? "" : "dhf-quiet"} ${i.urgent ? "dhf-urgent" : ""}` });
  b.onclick = () => go(itemPath(i));
  b.createDiv({ cls: "dhf-ask", text: `${data.icons[i.bucket]} ${i.urgent ? "URGENT · " : ""}${ASK[i.bucket]}` });
  b.createDiv({ cls: "dhf-bt", text: i.title });
  if (needsYou(i) && i.para) b.createDiv({ cls: "dhf-bp", text: i.para.replace(/\*\*|__|`/g, "") });
  b.createDiv({ cls: "dhf-time", text: `#${i.num} · ${when(i.updated)}` });
  if (needsYou(i)) replies(col, i, false);
  return row;
}

function thread(el, which, opts = {}) {
  el.empty();
  const head = el.createDiv({ cls: "dhf-thead" });
  if (opts.back) head.createEl("a", { cls: "dhf-back", text: "‹" }).onclick = opts.back;
  avatar(head, which);
  const t = head.createDiv({ cls: "dhf-thead-t" });
  const list = el.createDiv({ cls: "dhf-thread" });

  if (which === "*") {
    const its = data.items.filter(needsYou);
    t.createDiv({ cls: "dhf-name", text: "Needs you" });
    t.createDiv({ cls: "dhf-sub", text: `${its.length} waiting across ${new Set(its.map((i) => i.proj)).size} projects` });
    list.createDiv({ cls: "dhf-day", text: `Every project · newest at the bottom` });
    [...its].reverse().forEach((i) => itemBubble(list, i, true)); // urgent ends up last, nearest your thumb
  } else {
    const p = data.projects.find((x) => x.name === which);
    const its = data.items.filter((i) => i.proj === which);
    t.createDiv({ cls: "dhf-name", text: which });
    t.createDiv({ cls: "dhf-sub", text: `${p.needs} need you · ${its.length} open` });
    const done = data.done.filter((d) => d.proj === which).reverse(); // oldest first, like a chat
    const shown = done.slice(-5);
    if (done.length > shown.length) {
      const more = list.createEl("button", { cls: "dhf-earlier", text: `Show ${done.length - shown.length} earlier` });
      // Older messages load above the button, like a chat app; the button turns into a same-size label, so nothing on screen moves.
      more.onclick = () => { if (more.disabled) return; const box = createDiv(); list.insertBefore(box, more); done.slice(0, -5).forEach((d) => shippedBubble(box, d)); more.setText("Start of conversation"); more.disabled = true; };
    }
    let day = "";
    for (const d of shown) {
      const dd = when(d.closedIso);
      if (dd !== day) { list.createDiv({ cls: "dhf-day", text: dd }); day = dd; }
      shippedBubble(list, d);
    }
    // Quiet things first, then what needs you, so the newest-at-bottom spot holds what matters.
    const order = ["parked", "ready", "in-progress", "blocked", "test", "grill"];
    const sorted = [...its].sort((a, b) => (a.urgent - b.urgent) || (order.indexOf(a.bucket) - order.indexOf(b.bucket)) || a.created.localeCompare(b.created));
    list.createDiv({ cls: "dhf-day", text: "Open now" });
    sorted.forEach((i) => itemBubble(list, i, false));
  }
  el.createDiv({ cls: "dhf-delivered", text: `Updated ${data.stamp}` });
  return list;
}
function shippedBubble(list, d) {
  const row = list.createDiv({ cls: "dhf-msg dhf-me" });
  const b = row.createEl("a", { cls: "dhf-bubble dhf-shipped", href: d.url });
  b.createDiv({ cls: "dhf-ask", text: "✅ Shipped" });
  b.createDiv({ cls: "dhf-bt", text: d.title });
  if (d.what.length) b.createDiv({ cls: "dhf-bp", text: d.what[0] });
  b.createDiv({ cls: "dhf-time", text: d.closed });
}
// Chats open at the newest message. The desktop hub's pane scrolls itself; notes scroll the page.
// Obsidian resets the note's scroll after rendering, so nudge a few times.
const scrollEnd = (el) => [300, 900, 1800].forEach((t) => setTimeout(() => {
  if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = el.scrollHeight;
  else el.lastElementChild?.scrollIntoView({ block: "end" });
}, t));

// ---------------------------------------------------------------- hub: conversation list (+ open thread on desktop)
if (kind === "hub") {
  const shell = wrap.createDiv({ cls: "dhf-shell" });
  const side = shell.createDiv({ cls: "dhf-side" });
  const pane = shell.createDiv({ cls: "dhf-pane" });
  const top = side.createDiv({ cls: "dhf-top" });
  top.createEl("h1", { text: "Dev Hub" });
  top.createEl("button", { cls: "dhf-icon", text: "↻" }).onclick = () => toast("Prototype: refresh isn't wired up.");
  const search = side.createEl("input", { cls: "dhf-search", attr: { type: "search", placeholder: "Search projects and items" } });
  const convos = side.createDiv({ cls: "dhf-convos" });
  let open = "*";

  const latest = (p) => {
    const its = data.items.filter((i) => i.proj === p.name);
    const top = its.filter(needsYou)[0];
    if (top) return { icon: data.icons[top.bucket], text: top.title, at: top.updated };
    const d = data.done.find((x) => x.proj === p.name);
    return d ? { icon: "✅", text: d.title, at: d.closedIso } : { icon: data.icons[its[0].bucket], text: its[0].title, at: its[0].updated };
  };
  const rows = [{ name: "*", label: "Needs you", needs: data.items.filter(needsYou).length,
                  pre: { icon: "🚨", text: data.items.filter(needsYou)[0].title, at: data.snap }, pinned: true }]
    .concat([...data.projects].sort((a, b) => b.last.localeCompare(a.last)).map((p) => ({ name: p.name, label: p.name, needs: p.needs, urgent: p.urgent, pre: latest(p) })));

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    convos.empty();
    for (const r of rows) {
      const hits = q ? data.items.filter((i) => (r.name === "*" ? needsYou(i) : i.proj === r.name) && i.title.toLowerCase().includes(q)) : [];
      if (q && !r.label.toLowerCase().includes(q) && !hits.length) continue;
      const c = convos.createDiv({ cls: `dhf-convo ${r.name === open ? "is-open" : ""} ${r.pinned ? "is-pinned" : ""}` });
      avatar(c, r.name);
      const m = c.createDiv({ cls: "dhf-convo-m" });
      const l1 = m.createDiv({ cls: "dhf-l1" });
      l1.createSpan({ cls: "dhf-name", text: r.label });
      l1.createSpan({ cls: "dhf-when", text: r.pinned ? "Pinned" : when(r.pre.at) });
      const l2 = m.createDiv({ cls: "dhf-l2" });
      l2.createSpan({ cls: "dhf-prev", text: hits.length ? `🔍 ${hits[0].title}` : `${r.pre.icon} ${r.pre.text}` });
      if (r.needs) l2.createSpan({ cls: `dhf-badge ${r.urgent ? "is-urgent" : ""}`, text: String(r.needs) });
      c.onclick = () => { open = r.name; draw(); show(); };
    }
  };
  // Desktop: the thread fills the right pane. Phone: it slides over the list, with ‹ to come back.
  const phone = () => wrap.clientWidth <= 760;
  const show = () => {
    thread(pane, open, phone() ? { back: () => { wrap.removeClass("is-thread"); side.scrollIntoView({ block: "start" }); } } : {});
    wrap.toggleClass("is-thread", phone());
    scrollEnd(pane);
  };
  search.oninput = draw;
  draw();
  if (!phone()) show();
  wrap.createDiv({ cls: "dhf-note", text: data.note });
}

// ---------------------------------------------------------------- project: one conversation
if (kind === "project") {
  const box = wrap.createDiv({ cls: "dhf-solo" });
  thread(box, key, { back: () => go(`${root}/Dev Hub`) });
  scrollEnd(box);
}

// ---------------------------------------------------------------- item: the issue as a short chat
if (kind === "item") {
  const i = data.items.find((x) => `${x.proj}#${x.num}` === key);
  const box = wrap.createDiv({ cls: "dhf-solo" });
  const head = box.createDiv({ cls: "dhf-thead" });
  head.createEl("a", { cls: "dhf-back", text: "‹" }).onclick = () => go(projPath(i.proj));
  avatar(head, i.proj);
  const t = head.createDiv({ cls: "dhf-thead-t" });
  t.createDiv({ cls: "dhf-name", text: i.title });
  t.createDiv({ cls: "dhf-sub", text: `${i.proj} #${i.num} · ${data.icons[i.bucket]} ${data.labels[i.bucket]}` });
  head.createEl("a", { cls: "dhf-gh", text: "GitHub ↗", href: i.url });

  const list = box.createDiv({ cls: "dhf-thread" });
  list.createDiv({ cls: "dhf-day", text: `Opened ${when(i.created)} · ${i.age} ago` });
  if (i.pretend) list.createDiv({ cls: "dhf-day", text: `Prototype: pretend "${i.pretend}" label` });
  const mine = list.createDiv({ cls: "dhf-msg dhf-me" }).createDiv({ cls: "dhf-bubble dhf-out" });
  mine.createDiv({ cls: "dhf-ask", text: "You filed" });
  mine.createDiv({ cls: "dhf-bt", text: i.title });
  await md(mine.createDiv({ cls: "dhf-md" }), i.para || "_No description._");
  if (i.comment) {
    const row = list.createDiv({ cls: "dhf-msg" });
    avatar(row, i.proj, "dhf-av-s");
    const b = row.createDiv({ cls: "dhf-msg-col" }).createDiv({ cls: `dhf-bubble dhf-k-${i.bucket} dhf-long` });
    b.createDiv({ cls: "dhf-ask", text: `${data.icons[i.bucket]} ${i.commentHeading}` });
    await md(b.createDiv({ cls: "dhf-md" }), i.comment);
    b.createDiv({ cls: "dhf-time", text: when(i.updated) });
  }
  list.createDiv({ cls: "dhf-status", text: `${data.icons[i.bucket]} ${i.urgent ? "Urgent · " : ""}${ASK[i.bucket]}` });
  // Quick replies pinned to the bottom of the screen, like a chat's reply bar.
  const bar = box.createDiv({ cls: "dhf-bar" });
  if (i.actions.length) replies(bar, i, false);
  else bar.createDiv({ cls: "dhf-sub", text: "Nothing for you to do here. Claude picks this up on its own." });
}
