/* =========================================================================
   views/pantry.js — S5 "Pantry" (PRD §12 S5, FR‑23). Rebuilds Search as the
   household larder: a pinned search field, a horizontally-scrolling filter-chip
   strip (status · source · perishable · HSA · store), and fixed-height group
   rows (category eyebrow · name · last price in mono · purchase count). Tapping
   a row opens a bottom SHEET (overlay — never inline growth, §8.4): price-by-
   store, shelf-life state, the purchase history, and a single-commit Waste flow
   (items + waste + reminders in ONE commitFiles). Each purchase links to its
   trip via the shared receipt-motif sheet.
   ========================================================================= */
import { D, FILES, commitFiles, updateBadges, groupKeyFor, groupLabel, getMe } from '../app.js';
import { money, esc, todayISO, uid, norm, daysUntil, fmtShortDate } from '../core/domain.js';
import { toast, modal, openSheet } from '../ui/components.js';
import { openReceiptSheet } from './trips.js';

const fmtDate = (iso) => fmtShortDate(iso);

/* Filter state (module-scoped so it survives an in-sheet mutation re-render). */
const PF = { q: '', status: 'all', source: 'all', store: 'all', perishable: false, hsa: false };
let curSheet = null; // the open group sheet, so a waste can refresh it in place
let curKey = null;

/* An item's provenance follows its own source, else its receipt's (photo=Snap). */
function itemSource(it) {
  if (it.source === 'extension' || it.source === 'email') return it.source;
  const r = (D.receipts || []).find((x) => x.id === it.receiptId);
  if (r && (r.source === 'extension' || r.source === 'email')) return r.source;
  return 'snap';
}
function statusMatch(it) {
  if (PF.status === 'all') return true;
  if (PF.status === 'active') return it.status === 'active';
  if (PF.status === 'used') return it.status === 'consumed';
  if (PF.status === 'wasted') return it.status === 'thrown_away';
  return true;
}
function matchesQuery(it) {
  if (!PF.q) return true;
  const g = D.groups[it.groupId];
  const hay = [it.name, it.rawName, groupLabel(groupKeyFor(it)), g ? (g.aliases || []).join(' ') : '']
    .map(norm)
    .join(' ');
  return hay.includes(norm(PF.q));
}
function passesChips(it) {
  return (
    statusMatch(it) &&
    (PF.source === 'all' || itemSource(it) === PF.source) &&
    (PF.store === 'all' || (it.store || 'Unknown') === PF.store) &&
    (!PF.perishable || !!it.perishable) &&
    (!PF.hsa || !!it.hsaEligible)
  );
}

/* Group the filtered items → one row per group, richest metadata surfaced. */
function buildGroups() {
  const items = (D.items || []).filter((it) => matchesQuery(it) && passesChips(it));
  const groups = {};
  for (const it of items) {
    const k = groupKeyFor(it);
    (groups[k] = groups[k] || []).push(it);
  }
  return Object.keys(groups)
    .map((k) => {
      const arr = groups[k].sort((a, b) => (b.purchasedAt || '').localeCompare(a.purchasedAt || ''));
      const g = D.groups[k];
      const last = arr[0];
      return {
        key: k,
        label: groupLabel(k),
        arr,
        count: arr.length,
        lastPrice: last ? last.unitPrice != null ? last.unitPrice : last.price : null,
        lastDate: last ? last.purchasedAt : '',
        category: (g && g.category) || last.category || '',
        perishable: g ? !!g.perishable : arr.some((i) => i.perishable),
        hsa: g ? !!g.hsaEligible : arr.some((i) => i.hsaEligible),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* ---- chip strip --------------------------------------------------------- */
function chip(label, active, action, arg) {
  return `<button class="fchip${active ? ' on' : ''}" data-action="${action}"${arg != null ? ` data-arg="${esc(arg)}"` : ''} aria-pressed="${active}">${esc(label)}</button>`;
}
function chipBar() {
  const stores = Array.from(new Set((D.items || []).map((i) => i.store || 'Unknown'))).sort();
  const status = [['all', 'All'], ['active', 'In pantry'], ['used', 'Used'], ['wasted', 'Wasted']];
  const source = [['all', 'Any source'], ['snap', 'Snap'], ['extension', 'Sync'], ['email', 'Email']];
  return `<div class="chipbar" role="group" aria-label="Filters">
    ${status.map(([v, l]) => chip(l, PF.status === v, 'pantryStatus', v)).join('')}
    <span class="chsep" aria-hidden="true"></span>
    ${chip('Perishable', PF.perishable, 'pantryPerish')}
    ${chip('HSA', PF.hsa, 'pantryHsa')}
    <span class="chsep" aria-hidden="true"></span>
    ${source.map(([v, l]) => chip(l, PF.source === v, 'pantrySource', v)).join('')}
    ${stores.length > 1 ? `<span class="chsep" aria-hidden="true"></span>${chip('All stores', PF.store === 'all', 'pantryStore', 'all')}${stores.map((s) => chip(s, PF.store === s, 'pantryStore', s)).join('')}` : ''}
  </div>`;
}

export function renderPantry() {
  document.getElementById('main').innerHTML = `
    <div class="pantry-head">
      <input id="pq" class="psearch" placeholder="Search the pantry — milk, eggs, tylenol…" value="${esc(PF.q)}"
        data-input="pantrySearch" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search"/>
      ${chipBar()}
    </div>
    <div id="presults"></div>`;
  // Pin the search head just below the sticky app header (its height varies
  // with safe-area insets, so top:0 in CSS would slide it underneath).
  const hh = document.querySelector('header')?.offsetHeight || 0;
  document.querySelector('.pantry-head').style.top = hh + 'px';
  drawPantry();
}

function drawPantry() {
  const wrap = document.getElementById('presults');
  if (!wrap) return;
  const groups = buildGroups();
  if (!groups.length) {
    wrap.innerHTML = `<div class="tile-card"><p class="small muted" style="margin:0">No items match — try clearing a filter or the search.</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="plist">${groups
    .map(
      (grp) => `
    <button class="prow" data-action="openPantry" data-key="${esc(grp.key)}">
      <div class="pr-main">
        <div class="pr-cat">${esc(grp.category || 'item')}</div>
        <div class="pr-nm">${esc(grp.label)}</div>
        <div class="pr-sub">${grp.count} purchase${grp.count > 1 ? 's' : ''}${grp.lastDate ? ' · last ' + esc(fmtDate(grp.lastDate)) : ''}</div>
      </div>
      <div class="pr-side">
        <div class="pr-price">${money(grp.lastPrice)}</div>
        <div class="pr-tags">${grp.hsa ? '<span class="minitag hsa">HSA</span>' : ''}${grp.perishable ? '<span class="minitag">perish</span>' : ''}</div>
      </div>
    </button>`
    )
    .join('')}</div>`;
}

/* ---- group sheet -------------------------------------------------------- */
function shelfWord(due) {
  const d = daysUntil(due);
  if (d < 0) return `<span class="shelf hot">Past use-by</span>`;
  if (d === 0) return `<span class="shelf hot">Use today</span>`;
  if (d <= 3) return `<span class="shelf mid">${d} day${d > 1 ? 's' : ''} left</span>`;
  return `<span class="shelf ok">${d} days left</span>`;
}
function statusTag(it) {
  if (it.status === 'thrown_away') return `<span class="minitag tom">wasted</span>`;
  if (it.status === 'consumed') return `<span class="minitag">used</span>`;
  return '';
}
function groupSheetBody(key) {
  const arr = (D.items || [])
    .filter((it) => groupKeyFor(it) === key)
    .sort((a, b) => (b.purchasedAt || '').localeCompare(a.purchasedAt || ''));
  if (!arr.length) return `<p class="small muted">No purchases recorded.</p>`;
  const g = D.groups[key];
  const label = groupLabel(key);
  const spent = arr.reduce((s, i) => s + (+i.price || 0), 0);
  // Price-by-store: latest unit price seen per store.
  const byStore = {};
  arr.forEach((i) => {
    const s = i.store || 'Unknown';
    if (!(s in byStore)) byStore[s] = i.unitPrice != null ? i.unitPrice : i.price;
  });
  const priceRows = Object.entries(byStore)
    .map(([s, v]) => `<div class="rtot"><span>${esc(s)}</span><span class="amt">${money(v)}</span></div>`)
    .join('');
  const active = arr.find((i) => i.status === 'active');
  const shelf =
    active && active.useByDate ? `<div class="sheet-shelf">${shelfWord(active.useByDate)} <span class="small muted">· use by ${esc(fmtDate(active.useByDate))}</span></div>` : '';
  const history = arr
    .map(
      (i) => `<div class="phist">
        <div class="ph-l">
          <div class="ph-when">${esc(fmtDate(i.purchasedAt)) || '—'} · ${esc(i.store || '')}</div>
          <div class="ph-raw small muted">${esc(i.rawName || i.name || '')}${i.qty ? ' · qty ' + esc(i.qty) : ''} ${statusTag(i)}</div>
        </div>
        <div class="ph-r">
          <span class="ph-amt">${money(i.price)}</span>
          ${i.status === 'active' ? `<button class="mini" data-action="pantryWaste" data-id="${esc(i.id)}">Waste</button>` : ''}
          ${i.receiptId ? `<button class="mini" data-action="pantryTrip" data-id="${esc(i.receiptId)}">Trip</button>` : ''}
        </div>
      </div>`
    )
    .join('');
  return `
    <div class="sheet-title">
      <h2>${esc(label)}</h2>
      <div class="sheet-tags">${g && g.hsaEligible ? '<span class="minitag hsa">HSA</span>' : ''}${(g ? g.perishable : arr.some((i) => i.perishable)) ? '<span class="minitag">perishable</span>' : ''}</div>
    </div>
    ${shelf}
    <div class="sheet-sub small muted">${arr.length} purchase${arr.length > 1 ? 's' : ''} · ${money(spent)} total spent</div>
    <div class="eyebrow" style="margin:14px 4px 8px">Price by store</div>
    <div class="rtotals">${priceRows}</div>
    <div class="eyebrow" style="margin:14px 4px 8px">Purchase history</div>
    <div class="phlist">${history}</div>`;
}

function openGroupSheet(key) {
  curKey = key;
  curSheet = openSheet(`<div class="sheet-body">${groupSheetBody(key)}</div><div class="sheet-actions"><button class="link" data-sheet-close style="width:100%">Close</button></div>`);
}

/* ---- waste: ONE atomic commit across items + waste + reminders ---------- */
function chooseWasteReason(it) {
  const reasons = ['spoiled', 'expired', 'leftover', 'other'];
  return modal(`<h2>Throw away</h2>
    <p class="small muted" style="margin:0 0 12px">"${esc(it.name || it.rawName)}" — why are you tossing it?</p>
    ${reasons.map((r) => `<button class="sec" data-mval="${r}">${r[0].toUpperCase() + r.slice(1)}</button>`).join('')}
    <button class="link" data-mcancel style="width:100%">Cancel</button>`);
}
async function wasteFromPantry(itemId) {
  const it = (D.items || []).find((i) => i.id === itemId);
  if (!it) return;
  const reason = await chooseWasteReason(it);
  if (reason === null) return;
  const w = {
    id: uid('w'),
    itemId: it.id,
    groupId: it.groupId || null,
    name: it.name || it.rawName,
    qty: it.qty || 1,
    thrownAt: todayISO(),
    reason: reason.trim() || 'other',
    estCost: +it.price || 0,
    by: getMe(),
  };
  const pend = (D.reminders || []).filter((r) => r.itemId === it.id && r.status === 'pending').map((r) => r.id);
  const deltas = [
    { path: FILES.items, op: 'setField', id: it.id, fields: { status: 'thrown_away' } },
    { path: FILES.waste, op: 'append', record: w },
  ];
  if (pend.length)
    deltas.push({ path: FILES.reminders, op: 'setFields', updates: pend.map((id) => ({ id, fields: { status: 'done' } })) });
  try {
    await commitFiles(deltas, 'Mark item thrown away (waste)');
    toast('Logged as waste');
    updateBadges();
    // Refresh the open sheet + the list in place (overlay stays put, no reflow).
    if (curSheet && curKey) curSheet.setBody(groupSheetBody(curKey));
    drawPantry();
  } catch (e) {
    toast(String(e.message || e));
  }
}

/* Reflect PF onto the chips in place — no rebuild, so the horizontally-scrolled
   chip strip keeps its scroll position and the search box keeps focus/caret
   (rebuilding #main would reset both under the user's finger). */
function syncChips() {
  document.querySelectorAll('.chipbar .fchip').forEach((c) => {
    const a = c.dataset.action, arg = c.dataset.arg;
    const on =
      a === 'pantryStatus' ? PF.status === arg :
      a === 'pantrySource' ? PF.source === arg :
      a === 'pantryStore' ? PF.store === arg :
      a === 'pantryPerish' ? PF.perishable :
      a === 'pantryHsa' ? PF.hsa : false;
    c.classList.toggle('on', on);
    c.setAttribute('aria-pressed', on);
  });
}
function applyFilter() { syncChips(); drawPantry(); }

/* Click + input handlers contributed to the shared delegated registries. */
export const pantryActions = {
  openPantry: (t) => openGroupSheet(t.dataset.key),
  pantryWaste: (t) => wasteFromPantry(t.dataset.id),
  pantryTrip: (t) => openReceiptSheet(t.dataset.id),
  pantryStatus: (t) => { PF.status = t.dataset.arg; applyFilter(); },
  pantrySource: (t) => { PF.source = t.dataset.arg; applyFilter(); },
  pantryStore: (t) => { PF.store = t.dataset.arg; applyFilter(); },
  pantryPerish: () => { PF.perishable = !PF.perishable; applyFilter(); },
  pantryHsa: () => { PF.hsa = !PF.hsa; applyFilter(); },
};
export const pantryInputs = {
  pantrySearch: (t) => { PF.q = t.value; drawPantry(); },
};
