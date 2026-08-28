/* =========================================================================
   ui/components.js — grocery's re-export of the shared UI primitives, plus the
   one input helper that is genuinely grocery's.

   toast/modal/confirmModal/openSheet live in quartz/static/shared/ui.js
   (GAP-W5). Do not add an implementation here.
   ========================================================================= */

export { toast, modal, confirmModal, openSheet, isModalOpen, openModal } from '../../shared/ui.js';

/* Field-aware input attrs (FR-18): numeric flags get a decimal keypad, date
   flags a native date picker, so the owner isn't typing digits on a QWERTY.
   Stays here rather than in shared/ — the key list is grocery's data model
   (price, qty, useby...), not a general vocabulary. */
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
