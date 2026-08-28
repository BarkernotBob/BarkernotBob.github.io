/* =========================================================================
   shared/dom.js — the two DOM shorthands every app defines for itself.
   ========================================================================= */

export const $ = (sel) => document.querySelector(sel);

export const el = (tag, attrs = {}, html = '') => {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (html !== '') e.innerHTML = html;
  return e;
};
