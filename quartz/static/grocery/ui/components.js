/* =========================================================================
   ui/components.js — shared UI primitives (§11.1): toast, in-app modal, and
   field-aware input attrs. No app state; imports only the pure dom/text helpers.
   ========================================================================= */
import { $, el, esc } from '../core/domain.js';

export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), ms);
}

/* In-app modal — replaces window.prompt/confirm, which are blocked in installed
   (home-screen) PWAs and many in-app browsers. Returns a Promise that resolves to
   the chosen [data-mval] value, or null if cancelled/backdrop-tapped. */
export function modal(innerHtml) {
  return new Promise((resolve) => {
    const o = el('div', { class: 'modal-ov' });
    o.innerHTML = `<div class="modal-card">${innerHtml}</div>`;
    const close = (val) => {
      if (o._done) return;
      o._done = true;
      o.remove();
      resolve(val);
    };
    o.addEventListener('click', (e) => {
      if (e.target === o) close(null);
    });
    document.body.appendChild(o);
    o.querySelectorAll('[data-mval]').forEach((b) =>
      b.addEventListener('click', () => close(b.getAttribute('data-mval')))
    );
    o.querySelectorAll('[data-mcancel]').forEach((b) => b.addEventListener('click', () => close(null)));
  });
}

export function confirmModal(message, okLabel = 'OK', danger = false) {
  return modal(
    `<p style="margin:0 0 14px">${esc(message)}</p>
    <div class="row"><button class="sec" data-mcancel>Cancel</button><button class="${
      danger ? 'danger' : ''
    }" data-mval="yes">${esc(okLabel)}</button></div>`
  ).then((v) => v === 'yes');
}

/* Field-aware input attrs (FR-18): numeric flags get a decimal keypad, date
   flags a native date picker, so the owner isn't typing digits on a QWERTY. */
export function fixInputAttrs(field) {
  const f = String(field || '').toLowerCase();
  if (['price', 'qty', 'quantity', 'unitprice', 'unit price', 'total', 'subtotal', 'tax'].some((k) =>
      f.includes(k.replace(' ', ''))
    ))
    return 'inputmode="decimal"';
  if (['date', 'useby', 'use_by', 'usebydate', 'purchased'].some((k) => f.includes(k)))
    return 'type="date"';
  return '';
}
