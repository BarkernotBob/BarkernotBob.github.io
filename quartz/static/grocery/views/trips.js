/* =========================================================================
   views/trips.js — S5 "Trips" (PRD §12 S5, FR of §9.5 receipt motif).
   Every receipt & order, all sources, reverse-chron, no cap. A row carries
   store · date · total · channel chip · provenance stamp · status. Tapping it
   opens the receipt-motif detail SHEET (overlay — never reflows the list, §8.4):
   perforated top edge, dot-leader line items, dashed hairlines, a subtotal/tax/
   fees/total block, and a provenance + orderKey + storeNumber footer. Photo
   viewer only when a photo exists; a Print/PDF button appears on structured
   orders (HSA artifact, §10.9) with an iOS-standalone share fallback.
   Read-only view: opening a sheet mutates nothing. Reads from in-memory D only.
   ========================================================================= */
import { D } from '../app.js';
import { viewPhoto } from './review.js';
import { money, esc, fmtShortDate } from '../core/domain.js';
import { toast, openSheet } from '../ui/components.js';

const fmtDate = (iso) => fmtShortDate(iso, true);
function isStructured(r) {
  return r.source === 'extension' || r.source === 'email';
}
/* Snap (photographed) vs Sync (extension) vs Email provenance (§9). */
function provStamp(r) {
  if (r.source === 'extension') return `<span class="prov sync">Sync</span>`;
  if (r.source === 'email') return `<span class="prov mail">Email</span>`;
  return `<span class="prov snap">Snap</span>`;
}
function channelChip(r) {
  const c = r.channel;
  if (!c) return '';
  return `<span class="chchip">${esc(c)}</span>`;
}
function statusChip(r) {
  if (r.status === 'unprocessed') return `<span class="pill gray">reading…</span>`;
  if (r.status === 'needs_review') return `<span class="pill warn">review</span>`;
  return '';
}

/* All receipts, newest first — no 8-item cap (PRD §9 mobile Trips). */
function tripsSorted() {
  return (D.receipts || [])
    .slice()
    .sort((a, b) =>
      (b.purchasedAt || b.capturedAt || '').localeCompare(a.purchasedAt || a.capturedAt || '')
    );
}

export function renderTrips() {
  const trips = tripsSorted();
  const main = document.getElementById('main');
  if (!trips.length) {
    main.innerHTML = `
      <div class="card trips-empty">
        <h2>No trips yet</h2>
        <p class="small muted">Snap a receipt, or sync a store, and every shopping trip lands here — newest first, with what you spent and how it arrived.</p>
        <button data-action="show" data-arg="capture">Snap a receipt</button>
      </div>`;
    return;
  }
  const rows = trips
    .map(
      (r) => `
    <div class="triprow" data-action="openTrip" data-id="${esc(r.id)}">
      <div class="tr-l">
        <div class="store">${esc(r.store || 'Receipt')}</div>
        <div class="when">${esc(fmtDate(r.purchasedAt || r.capturedAt))}${r.capturedBy ? ' · ' + esc(r.capturedBy) : ''}</div>
      </div>
      <div class="tr-r">
        <div class="tags">${channelChip(r)}${provStamp(r)}${statusChip(r)}</div>
        <div class="amt">${money(r.total)}</div>
      </div>
    </div>`
    )
    .join('');
  main.innerHTML = `
    <div class="eyebrow">${trips.length} trip${trips.length > 1 ? 's' : ''}</div>
    <div class="triplist">${rows}</div>`;
}

/* ---- receipt-motif detail sheet (§9.5) ---------------------------------- */
function receiptSheetHtml(r) {
  const items = (D.items || [])
    .filter((i) => i.receiptId === r.id)
    .sort((a, b) => (a.name || a.rawName || '').localeCompare(b.name || b.rawName || ''));
  const lines = items.length
    ? items
        .map(
          (i) => `<div class="rline">
            <span class="nm">${esc(i.name || i.rawName || 'Item')}${i.qty && +i.qty !== 1 ? ` <span class="q">×${esc(i.qty)}</span>` : ''}</span>
            <span class="lead" aria-hidden="true"></span>
            <span class="amt">${money(i.price)}</span>
          </div>`
        )
        .join('')
    : `<p class="small muted" style="margin:8px 0">No itemized lines recorded for this trip.</p>`;
  const totals = [
    r.subtotal != null ? ['Subtotal', r.subtotal] : null,
    r.tax != null ? ['Tax', r.tax] : null,
    r.fees != null && +r.fees > 0 ? ['Fees', r.fees] : null,
  ].filter(Boolean);
  const totalsBlock = `
    ${totals.map(([k, v]) => `<div class="rtot"><span>${k}</span><span class="amt">${money(v)}</span></div>`).join('')}
    ${r.total != null ? `<div class="rtot grand"><span>Total</span><span class="amt">${money(r.total)}</span></div>` : ''}`;
  const footerBits = [
    r.source === 'extension' ? 'Synced from ' + esc(r.retailer || 'store') : r.source === 'email' ? 'Imported from email' : 'Photographed receipt',
    r.orderKey ? 'Order ' + esc(r.orderKey) : r.orderId ? 'Order ' + esc(r.orderId) : '',
    r.storeNumber ? 'Store #' + esc(r.storeNumber) : '',
  ].filter(Boolean);
  const actions = `
    <div class="sheet-actions">
      ${r.photo ? `<button class="sec" data-action="tripPhoto" data-path="${esc(r.photo)}">View photo</button>` : ''}
      ${isStructured(r) ? `<button class="sec" data-action="tripPrint" data-id="${esc(r.id)}">Print / PDF</button>` : ''}
      <button class="link" data-sheet-close style="width:100%">Close</button>
    </div>`;
  return `
    <span class="receipt-perf" aria-hidden="true"></span>
    <div class="sheet-body receipt">
      <div class="rhead">
        <div>
          <div class="rstore">${esc(r.store || 'Receipt')}</div>
          <div class="rwhen">${esc(fmtDate(r.purchasedAt || r.capturedAt))}</div>
        </div>
        <div class="rtags">${channelChip(r)}${provStamp(r)}</div>
      </div>
      <div class="rlines">${lines}</div>
      <div class="rtotals">${totalsBlock}</div>
      ${footerBits.length ? `<div class="rfoot">${footerBits.map((b) => `<div>${b}</div>`).join('')}</div>` : ''}
    </div>
    ${actions}`;
}

/* Exported so Pantry's per-purchase drill-in reuses the same motif (§9 "links to
   trips"). Returns the sheet handle. */
export function openReceiptSheet(receiptId) {
  const r = (D.receipts || []).find((x) => x.id === receiptId);
  if (!r) {
    toast('No details saved for this trip yet');
    return null;
  }
  return openSheet(receiptSheetHtml(r));
}

/* Plain-text fallback for the iOS share sheet (print() is unreliable in an
   installed iOS PWA — §9.5). */
function receiptPlainText(r) {
  const items = (D.items || []).filter((i) => i.receiptId === r.id);
  const lines = items.map((i) => `${i.name || i.rawName}  ${money(i.price)}`).join('\n');
  return `${r.store || 'Receipt'} — ${fmtDate(r.purchasedAt || r.capturedAt)}\n${lines}\nTotal ${money(r.total)}${r.orderKey ? '\nOrder ' + r.orderKey : ''}`;
}
function printReceipt(rid) {
  const r = (D.receipts || []).find((x) => x.id === rid);
  if (!r) return;
  const iosStandalone =
    /iP(hone|ad|od)/.test(navigator.userAgent) &&
    (navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  if (iosStandalone) {
    // window.print() is unreliable in an iOS home-screen PWA; share instead, or
    // point the owner at Safari where Print → Save as PDF works.
    if (navigator.share) {
      navigator.share({ title: `${r.store || 'Receipt'} · order ${r.orderId || ''}`, text: receiptPlainText(r) }).catch(() => {});
    } else {
      toast('On iPhone: tap Share ▸ “Open in Safari”, then Print ▸ Save as PDF.');
    }
    return;
  }
  window.print(); // the @media print block isolates the open receipt sheet
}

/* Click handlers this view contributes to the shared delegated registry. */
export const tripsActions = {
  openTrip: (t) => openReceiptSheet(t.dataset.id),
  tripPhoto: (t) => viewPhoto(t.dataset.path),
  tripPrint: (t) => printReceipt(t.dataset.id),
};
