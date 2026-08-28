/* =========================================================================
   shared/ui.js — toast, modal, confirm and bottom sheet.

   These replace window.alert/prompt/confirm, which are blocked in installed
   (home-screen) PWAs and in many in-app browsers — so an app that relies on
   them appears to do nothing once it is installed, which is exactly how these
   are meant to be used.
   ========================================================================= */
import { $, el } from './dom.js';
import { esc } from './text.js';

/* Requires an element with id="toast" in the page. */
export function toast(msg, ms = 2600) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), ms);
}

/* Returns a Promise resolving to the chosen [data-mval] value, or null if
 * cancelled or backdrop-tapped.
 *
 * The overlay is detached only AFTER the awaiting caller has resumed. Callers
 * that collect input read their fields on the line following `await modal(...)`,
 * and detaching first left them reading `.value` off null — which threw inside
 * an async handler and silently did nothing. That is exactly what happened to
 * bank-bonus's "Add Account" and "Add Offer", which both did nothing at all
 * until it was found by its test suite. Do not "simplify" this back.
 *
 * So: hide immediately (the UI must feel instant), resolve — the caller runs as
 * a microtask, with the fields still attached — then remove on the next
 * macrotask. While it is in that limbo it carries [data-closing], so
 * isModalOpen() and any Escape handler skip it; otherwise a second modal opened
 * straight after would find the dead one and have its Escape swallowed.
 */
export function modal(innerHtml) {
  return new Promise((resolve) => {
    const o = el('div', { class: 'modal-ov' });
    o.innerHTML = `<div class="modal-card">${innerHtml}</div>`;
    const close = (val) => {
      if (o._done) return;
      o._done = true;
      o.style.visibility = 'hidden';
      o.style.pointerEvents = 'none';
      o.setAttribute('data-closing', '');
      resolve(val);
      setTimeout(() => o.remove(), 0);
    };
    o._esc = () => close(null);
    o.addEventListener('click', (e) => {
      if (e.target === o) close(null);
    });
    document.body.appendChild(o);
    const focusEl = o.querySelector('[autofocus]') || o.querySelector('input, select, textarea');
    if (focusEl) setTimeout(() => focusEl.focus(), 30);
    o.querySelectorAll('[data-mval]').forEach((b) =>
      b.addEventListener('click', () => close(b.getAttribute('data-mval')))
    );
    o.querySelectorAll('[data-mcancel]').forEach((b) => b.addEventListener('click', () => close(null)));
  });
}

/* A modal that is still open — i.e. not one of the closing ones above. */
export const isModalOpen = () => Boolean(document.querySelector('.modal-ov:not([data-closing])'));
export const openModal = () => document.querySelector('.modal-ov:not([data-closing])');

export function confirmModal(message, okLabel = 'OK', danger = false) {
  return modal(
    `<p style="margin:0 0 14px">${esc(message)}</p>
    <div class="row"><button class="sec" data-mcancel>Cancel</button><button class="${
      danger ? 'danger' : ''
    }" data-mval="yes">${esc(okLabel)}</button></div>`
  ).then((v) => v === 'yes');
}

/* Bottom sheet. An OVERLAY (position:fixed), so opening it never reflows the
   list behind it. Returns { el, close, setBody } — setBody swaps .sheet-body in
   place, for use after an in-sheet mutation. */
export function openSheet(innerHtml) {
  const o = el('div', { class: 'sheet-ov' });
  o.innerHTML = `<div class="sheet-card" role="dialog" aria-modal="true"><span class="sheet-grip" aria-hidden="true"></span>${innerHtml}</div>`;
  const close = () => {
    if (o._done) return;
    o._done = true;
    o.classList.remove('in');
    setTimeout(() => o.remove(), 180);
  };
  o.addEventListener('click', (e) => {
    if (e.target === o) close();
  });
  o.querySelectorAll('[data-sheet-close]').forEach((b) => b.addEventListener('click', close));
  document.body.appendChild(o);
  requestAnimationFrame(() => o.classList.add('in'));
  return {
    el: o,
    close,
    setBody(html) {
      const b = o.querySelector('.sheet-body');
      if (b) b.innerHTML = html;
    },
  };
}
