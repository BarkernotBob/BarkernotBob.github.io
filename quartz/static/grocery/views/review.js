/* =========================================================================
   views/review.js — S6 "Review" screen (needs attention + freshness reminders).
   Surfaces the things Claude couldn't read (open needs_attention flags) and the
   perishables approaching their use-by date, and lets you resolve/act on each
   without leaving the screen. Reads only from the in-memory db (D); mutations go
   through the shared commitFiles. Mirrors views/today.js (§11.1).

   Cross-module note: viewPhoto and purgeStaleFlags live here but are ALSO called
   by code that stays in app.js (viewReceipt in Search, and loadAll's self-heal
   respectively), so both are exported and app.js imports them back — an
   intentional runtime-only cycle (usage is deferred, never at module eval).
   ========================================================================= */
import { D, FILES, commitFiles, show, updateBadges, LS, getImageDataUrl } from '../app.js';
import { $, el, esc, todayISO, uid } from '../core/domain.js';
import { toast, fixInputAttrs } from '../ui/components.js';

function renderReview(){
  const open=D.needs.filter(n=>n.status==='open');
  const dueRem=D.reminders.filter(r=>r.status==='pending').sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||''));
  $('#main').innerHTML = `
  <div class="card">
    <h2><svg class="mk-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-review"></use></svg>Needs attention ${open.length?`<span class="pill warn">${open.length}</span>`:''}</h2>
    <p class="small muted">Things Claude couldn't read or wants you to confirm.</p>
    ${open.length? open.map(renderFlag).join('') : '<p class="muted small">All clear — nothing to review. <svg class="mk-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-sparkle"></use></svg></p>'}
  </div>
  <div class="card">
    <h2><svg class="mk-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-sprout"></use></svg>Freshness reminders</h2>
    <p class="small muted">Perishables and their estimated use-by dates. Act on them here.</p>
    ${dueRem.length? dueRem.map(renderRem).join('') : '<p class="muted small">No active reminders.</p>'}
  </div>`;
}
function renderFlag(n){
  return `<div class="item" id="flag_${n.id}">
    <div class="flex"><b>${esc(n.field||n.kind||'Review')}</b><span class="pill gray">${esc(n.kind||'')}</span></div>
    <div class="small">${esc(n.message||'')}</div>
    ${n.photo?`<button class="link" data-action="viewPhoto" data-path="${esc(n.photo)}">View receipt photo</button>`:''}
    <div class="row" style="margin-top:6px">
      <input id="fix_${esc(n.id)}" ${fixInputAttrs(n.field)} placeholder="Correct value${n.suggested?(' (suggested: '+esc(JSON.stringify(Object.values(n.suggested)[0]))+')'):''}"/>
      <button style="flex:0 0 auto;width:auto" data-action="resolveFlag" data-id="${esc(n.id)}">Save</button>
    </div>
    <button class="link" data-action="resolveFlag" data-id="${esc(n.id)}" data-dismiss="1">Dismiss (no change)</button>
  </div>`;
}
async function viewPhoto(path){
  toast('Loading photo…');
  const url=await getImageDataUrl(path);
  if(!url){ toast('Could not load photo'); return; }
  const o=el('div',{style:'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:80;display:flex;align-items:center;justify-content:center;padding:16px'});
  o.innerHTML=`<img src="${url}" style="max-width:100%;max-height:100%;border-radius:8px"/>`;
  o.onclick=()=>o.remove(); document.body.appendChild(o);
}
/* A review flag's "field" (price, qty, name, store, date…) → the real item property. */
function itemFieldFor(field){
  const k=String(field||'').toLowerCase();
  return ({date:'purchasedAt', purchaseddate:'purchasedAt', purchased:'purchasedAt',
           useby:'useByDate', use_by:'useByDate', usebydate:'useByDate'})[k] || field;
}
/* Which item property does an "_unclear"-style flag refer to? (null if unrecognized) */
function flagItemField(flag){
  const f=String(flag).toLowerCase();
  const map=[['purchasedat','purchasedAt'],['date','purchasedAt'],['usebydate','useByDate'],['useby','useByDate'],
    ['unitprice','unitPrice'],['price','price'],['quantity','qty'],['qty','qty'],
    ['rawname','rawName'],['name','name'],['store','store'],['category','category']];
  for(const [tok,prop] of map){ if(f.includes(tok)) return prop; }
  return null;
}
function valueFilled(it, prop){ const v=it[prop]; return !(v==null || v==='' || (typeof v==='number' && isNaN(v))); }
function hasOpenNeed(itemId, prop){
  return (D.needs||[]).some(n=>n.status==='open' && n.itemId===itemId && itemFieldFor(n.field)===prop);
}
/* Drop any field-uncertainty flag whose field now has a value and no open review.
   Mutates each affected item's flags in place and returns the array of items that
   changed (empty = nothing changed), so callers can build precise commit deltas. */
function purgeStaleFlags(){
  const changed=[];
  (D.items||[]).forEach(it=>{
    if(!Array.isArray(it.flags) || !it.flags.length) return;
    const kept=it.flags.filter(fl=>{
      const prop=flagItemField(fl);
      if(!prop) return true;                                  // unrecognized flag: leave it alone
      if(valueFilled(it,prop) && !hasOpenNeed(it.id,prop)) return false; // resolved → purge
      return true;
    });
    if(kept.length!==it.flags.length){ it.flags=kept; changed.push(it); }
  });
  return changed;
}
async function resolveFlag(id, dismiss){
  const n=D.needs.find(x=>x.id===id); if(!n) return;
  const val=dismiss?null:($('#fix_'+id)?$('#fix_'+id).value.trim():'');
  const itemUpdates=[];   // {id, fields} accumulated into ONE items.json delta
  if(!dismiss && val && n.itemId && n.field){
    const it=D.items.find(i=>i.id===n.itemId);
    if(it){ const prop=itemFieldFor(n.field); let v=val;
      if(['price','qty','unitPrice','tax','subtotal','total'].includes(prop)) v=parseFloat(val)||0;
      it[prop]=v;                                              // local apply so purge sees the filled field
      itemUpdates.push({id:it.id, fields:{[prop]:v}}); }
  }
  n.status='resolved'; n.resolvedAt=new Date().toISOString(); n.resolvedBy=LS.me;
  purgeStaleFlags().forEach(it=>{                              // fold cleared "_unclear" flags into the same delta
    const u=itemUpdates.find(x=>x.id===it.id);
    if(u) u.fields=Object.assign({}, u.fields, {flags:it.flags});
    else itemUpdates.push({id:it.id, fields:{flags:it.flags}});
  });
  const deltas=[{ path:FILES.needs, op:'setField', id:n.id, fields:{status:'resolved', resolvedAt:n.resolvedAt, resolvedBy:n.resolvedBy} }];
  if(itemUpdates.length) deltas.push({ path:FILES.items, op:'setFields', updates:itemUpdates });
  try{
    await commitFiles(deltas, 'Resolve review flag');
    toast(dismiss?'Dismissed':'Saved'); updateBadges(); renderReview();
  }catch(e){ toast(String(e.message||e)); }
}
function renderRem(r){
  const due=r.dueDate||''; const overdue=due && due<=todayISO();
  return `<div class="item">
    <div class="flex"><div><b>${esc(r.name||'Item')}</b>
      <div class="small ${overdue?'':'muted'}" style="${overdue?'color:var(--marigold-ink);font-weight:600':''}">use by ${esc(due)}${overdue?' — check now':''}</div></div></div>
    <div class="row" style="margin-top:6px">
      <button class="sec" data-action="remAction" data-id="${esc(r.id)}" data-remaction="kept">Still good</button>
      <button class="sec" data-action="remAction" data-id="${esc(r.id)}" data-remaction="consumed">Used it</button>
      <button class="warn" data-action="remAction" data-id="${esc(r.id)}" data-remaction="wasted">Threw away</button>
    </div>
  </div>`;
}
async function remAction(id, action){
  const r=D.reminders.find(x=>x.id===id); if(!r) return;
  const it=r.itemId?D.items.find(i=>i.id===r.itemId):null;
  const deltas=[];   // all touched files land in ONE atomic commit
  if(action==='kept'){
    deltas.push({ path:FILES.reminders, op:'setField', id:r.id, fields:{status:'done', note:'kept '+todayISO()} });
  } else if(action==='consumed'){
    deltas.push({ path:FILES.reminders, op:'setField', id:r.id, fields:{status:'done'} });
    if(it) deltas.push({ path:FILES.items, op:'setField', id:it.id, fields:{status:'consumed'} });
  } else if(action==='wasted'){
    deltas.push({ path:FILES.reminders, op:'setField', id:r.id, fields:{status:'done'} });
    if(it){
      deltas.push({ path:FILES.items, op:'setField', id:it.id, fields:{status:'thrown_away'} });
      deltas.push({ path:FILES.waste, op:'append', record:{id:uid('w'),itemId:it.id,groupId:it.groupId||null,name:it.name||it.rawName,qty:it.qty||1,thrownAt:todayISO(),reason:'spoiled',estCost:(+it.price||0),by:LS.me} });
    }
  }
  try{
    await commitFiles(deltas, 'Update reminder ('+action+')');
    toast('Updated'); updateBadges(); renderReview();
  }catch(e){ toast(String(e.message||e)); }
}

/* renderReview is the view entry (called by app.js router). viewPhoto and
   purgeStaleFlags are also re-imported by app.js (Search's viewReceipt and
   loadAll's self-heal). */
export { renderReview, viewPhoto, purgeStaleFlags };

/* Click handlers this view contributes to the shared delegated registry. */
export const reviewActions = {
  viewPhoto:   t => viewPhoto(t.dataset.path),
  resolveFlag: t => resolveFlag(t.dataset.id, t.dataset.dismiss==='1'),
  remAction:   t => remAction(t.dataset.id, t.dataset.remaction),
};
