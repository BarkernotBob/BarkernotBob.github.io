/* =========================================================================
   views/today.js — S4 "Today" home screen (PRD §12 S4).
   The at-a-glance landing: what to use up, sync status, what needs attention,
   this-week spend + trend, and recent trips with Snap/Sync provenance. Reads
   only from the in-memory db (D); mutations go through the shared commitFiles.
   First proper view module (§11.1) — S5–S8 screens follow this shape.
   ========================================================================= */
import { D, FILES, commitFiles, show, updateBadges } from '../app.js';
import { money, esc, todayISO } from '../core/domain.js';
import { toast } from '../ui/components.js';

const DAY = 86400000;
// Parse calendar dates as UTC midnight so they line up with todayISO() (which is
// the UTC calendar date) — a local-midnight parse drifts a day off in +/- offset
// timezones (this-week bucket loses "today", use-by countdown fires a day early).
const startOfDay = (iso) => Date.parse(iso + 'T00:00:00Z');
const daysUntil = (iso) => Math.round((startOfDay(iso) - startOfDay(todayISO())) / DAY);
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(startOfDay(iso.slice(0, 10)));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function weekAgo(n) {
  return new Date(startOfDay(todayISO()) - n * DAY).toISOString().slice(0, 10);
}

/* Perishables approaching use-by, soonest first — sourced from pending use-by
   reminders whose item is still active (matches the Review tab's model). */
function useUpRows() {
  const rows = (D.reminders || [])
    .filter((r) => r.status === 'pending' && r.dueDate)
    .map((r) => ({ r, it: r.itemId ? (D.items || []).find((i) => i.id === r.itemId) : null }))
    .filter((x) => !x.it || x.it.status === 'active')
    .sort((a, b) => (a.r.dueDate || '').localeCompare(b.r.dueDate || ''));
  return rows.slice(0, 6);
}
function shelfClass(due) {
  const d = daysUntil(due);
  if (d <= 1) return 's-hot';
  if (d <= 3) return 's-mid';
  return 's-fresh';
}
function useByStamp(due) {
  return daysUntil(due) <= 0
    ? `<span class="stamp today">Use today</span>`
    : `<span class="stamp useby">Use by ${esc(fmtDate(due))}</span>`;
}

/* This-week spend, previous week (for the delta), and 8 weekly buckets oldest→
   newest for the trend sparkline. Buckets are [weekStart, weekStart+7). */
function weekSpends() {
  const buckets = [];
  for (let w = 7; w >= 0; w--) {
    const from = weekAgo(w * 7 + 6),
      to = weekAgo(w * 7);
    const sum = (D.items || [])
      .filter((i) => i.purchasedAt && i.purchasedAt >= from && i.purchasedAt <= to)
      .reduce((s, i) => s + (+i.price || 0), 0);
    buckets.push(sum);
  }
  return buckets; // buckets[7] = this week, buckets[6] = last week
}
function sparkline(vals) {
  const w = 300,
    h = 44,
    max = Math.max(1, ...vals);
  const pts = vals.map((v, i) => {
    const x = vals.length > 1 ? (i / (vals.length - 1)) * (w - 8) + 4 : w / 2;
    const y = h - 5 - (v / max) * (h - 12);
    return [Math.round(x), Math.round(y)];
  });
  const poly = pts.map((p) => p.join(',')).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" y1="${h - 4}" x2="${w}" y2="${h - 4}" stroke="var(--rule)" stroke-width="1"/>
    <polyline points="${poly}" fill="none" stroke="var(--pine)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="3.2" fill="var(--pine)"/>
  </svg>`;
}

/* Snap (photographed) vs Sync (extension/email-imported) provenance (§9). */
function provStamp(rcpt) {
  const src = rcpt.source;
  if (src === 'extension') return `<span class="prov sync">Sync</span>`;
  if (src === 'email') return `<span class="prov mail">Email</span>`;
  return `<span class="prov snap">Snap</span>`;
}

export function renderToday() {
  const items = D.items || [],
    receipts = D.receipts || [];
  // Cold start: nothing captured yet → one clear call to action.
  if (!items.length && !receipts.length) {
    document.getElementById('main').innerHTML = `
      <div class="today-empty card">
        <h2>Welcome to Grocery Tracker</h2>
        <p class="small muted">Snap your first receipt and it'll be read automatically — then this screen fills with what to use up, what you're spending, and what needs a look.</p>
        <button data-action="show" data-arg="capture">Snap a receipt</button>
      </div>`;
    return;
  }

  const up = useUpRows();
  const waiting = receipts.filter((r) => r.status === 'unprocessed').length;
  const openNeeds =
    (D.needs || []).filter((n) => n.status === 'open').length +
    (D.reminders || []).filter((r) => r.status === 'pending' && (r.dueDate || '') <= todayISO()).length;
  const weeks = weekSpends();
  const thisWk = weeks[7],
    lastWk = weeks[6];
  // "first week tracked" only when there's genuinely no earlier history — a real
  // $0 last week must still read "vs $0.00", not swallow the comparison.
  const weekStart = weekAgo(6);
  const hasPrior = (D.items || []).some((i) => i.purchasedAt && i.purchasedAt < weekStart);
  const recent = receipts
    .filter((r) => r.status !== 'unprocessed') // a still-reading receipt isn't a trip yet
    .sort((a, b) => (b.purchasedAt || b.capturedAt || '').localeCompare(a.purchasedAt || a.capturedAt || ''))
    .slice(0, 4);

  const upSection = `
    <div class="eyebrow">${up.length ? `${up.length} thing${up.length > 1 ? 's' : ''} to use up` : 'Nothing to use up'}</div>
    ${
      up.length
        ? `<div class="uplist">${up
            .map(({ r }) => `
          <div class="urow">
            <div>
              <div class="nm">${esc(r.name || 'Item')}</div>
              <div class="meta">use by ${esc(fmtDate(r.dueDate))}</div>
              <span class="slbar ${shelfClass(r.dueDate)}"><i></i><i></i><i></i><i></i></span>
            </div>
            <div class="gutter">
              ${useByStamp(r.dueDate)}
              <button class="mini use" data-action="todayUsed" data-id="${esc(r.id)}">Used</button>
            </div>
          </div>`).join('')}</div>`
        : `<div class="tile-card"><p class="small muted" style="margin:0">No perishables tracked right now — nice.</p></div>`
    }`;

  const syncSection = `
    <div class="eyebrow">This week's sync</div>
    <div class="chips">
      ${waiting ? `<span class="chip"><span class="d mar"></span>${waiting} waiting for Claude to read</span>` : `<span class="chip"><span class="d pine"></span>All receipts read</span>`}
      <span class="chip wait">Store auto-sync · coming soon</span>
    </div>`;

  const attnSection = openNeeds
    ? `<div class="eyebrow">Needs your attention</div>
       <div class="tile-card rev" data-action="show" data-arg="review" style="cursor:pointer">
         <span class="cnt">${openNeeds}</span>
         <span class="txt"><b>${openNeeds} item${openNeeds > 1 ? 's' : ''} to review</b><span>Flags &amp; use-by reminders</span></span>
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
       </div>`
    : '';

  const weekSection = `
    <div class="eyebrow">This week</div>
    <div class="tile-card week">
      <div class="figure">${money(thisWk)}</div>
      <div class="cap">${hasPrior ? `vs ${money(lastWk)} last week` : 'first week tracked'} · 8-wk trend</div>
      ${sparkline(weeks)}
    </div>`;

  const tripsSection = recent.length
    ? `<div class="eyebrow">Recent trips</div>
       <div class="tile-card" style="padding:2px 14px">
         ${recent
           .map((r) => `
           <div class="trow" ${r.id ? `data-action="viewReceipt" data-id="${esc(r.id)}" style="cursor:pointer"` : ''}>
             <div class="store">${esc(r.store || 'Receipt')}<div class="when">${esc(fmtDate((r.purchasedAt || r.capturedAt || '').slice(0, 10)))}</div></div>
             ${provStamp(r)}
             <span class="amt">${money(r.total)}</span>
           </div>`).join('')}
       </div>`
    : '';

  document.getElementById('main').innerHTML =
    upSection + syncSection + attnSection + weekSection + tripsSection;
}

/* Click handlers this view contributes to the shared delegated registry. */
export const todayActions = {
  todayUsed: async (t) => {
    const r = (D.reminders || []).find((x) => x.id === t.dataset.id);
    if (!r) return;
    const it = r.itemId ? (D.items || []).find((i) => i.id === r.itemId) : null;
    // Mark the row used IN PLACE — the row keeps its reserved height and nothing
    // below shifts (§8.4 "clicking must never reflow the UI"). A full re-render
    // would drop the row and pull every section up; it only happens on the next
    // visit to Today (or on commit failure, to restore truth).
    const row = t.closest('.urow');
    if (row) {
      row.classList.add('done');
      const g = row.querySelector('.gutter');
      if (g) g.innerHTML = '<span class="stamp done">Used</span>';
    }
    const deltas = [{ path: FILES.reminders, op: 'setField', id: r.id, fields: { status: 'done' } }];
    if (it) deltas.push({ path: FILES.items, op: 'setField', id: it.id, fields: { status: 'consumed' } });
    try {
      await commitFiles(deltas, 'Mark item used (Today)');
      toast('Marked used');
      updateBadges();
    } catch (e) {
      toast(String(e.message || e));
      renderToday(); // restore the true state on failure
    }
  },
};
