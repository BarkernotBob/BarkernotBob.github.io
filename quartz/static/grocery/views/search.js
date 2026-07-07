/* =========================================================================
   views/search.js — S5 "Search items" screen (PRD §12 S5).
   Type-to-filter across every purchased item, grouped by canonical group (or a
   normalized raw-name fallback) with per-group spend/qty/last-bought and a
   drill-down list of each purchase. Reads only from the in-memory db (D); the
   actual mutations it exposes (Waste, view receipt) are shared handlers that
   STAY in app.js and fire via data-action. Mirrors views/today.js (§11.1).
   groupLabel/groupKeyFor are shared with Reports, so they're imported from
   app.js rather than moved.
   ========================================================================= */
import { D, FILES, commitFiles, show, updateBadges, groupLabel, groupKeyFor } from '../app.js';
import { $, money, esc, norm } from '../core/domain.js';

function matchesQuery(item, q){
  if(!q) return true;
  const hay = [item.name,item.rawName, groupLabel(groupKeyFor(item))].map(norm).join(' ');
  const g=D.groups[item.groupId];
  const aliases = g? (g.aliases||[]).map(norm).join(' ') : '';
  return (hay+' '+aliases).includes(norm(q));
}
export function renderSearch(){
  $('#main').innerHTML = `
  <div class="card">
    <h2>Search items</h2>
    <input id="sq" placeholder="Type an item, e.g. milk, chicken, bananas" data-input="search"/>
    <p class="small muted" style="margin-top:6px">Similar names are grouped together. Tap a group to see each purchase and mark waste.</p>
  </div>
  <div id="sresults"></div>`;
  runSearch();
}
function runSearch(){
  const q=$('#sq')?$('#sq').value.trim():'';
  const items=D.items.filter(i=>matchesQuery(i,q));
  const groups={};
  for(const it of items){ const k=groupKeyFor(it); (groups[k]=groups[k]||[]).push(it); }
  const keys=Object.keys(groups).sort((a,b)=>groupLabel(a).localeCompare(groupLabel(b)));
  const wrap=$('#sresults');
  if(keys.length===0){ wrap.innerHTML='<div class="card"><p class="muted small">No matching items yet.</p></div>'; return; }
  wrap.innerHTML = keys.map(k=>{
    const arr=groups[k].sort((a,b)=>(b.purchasedAt||'').localeCompare(a.purchasedAt||''));
    const spent=arr.reduce((s,i)=>s+(+i.price||0),0);
    const qty=arr.reduce((s,i)=>s+(+i.qty||0),0);
    const last=arr[0]?(arr[0].purchasedAt||''):'';
    const g=D.groups[k];
    return `<div class="card grp" data-action="toggleOpen">
      <div class="flex">
        <div><b>${esc(groupLabel(k))}</b> ${g&&g.hsaEligible?'<span class="pill hsa">HSA</span>':''} ${g&&g.perishable?'<span class="pill gray">perishable</span>':''}
          <div class="small muted">${arr.length} purchase(s) · ${qty} bought · last ${esc(last||'—')}</div></div>
        <div style="text-align:right"><div class="big" style="font-size:18px">${money(spent)}</div><div class="small muted">total spent</div></div>
      </div>
      <div class="body">
        ${arr.map(i=>`<div class="item flex" ${i.receiptId?`style="cursor:pointer" data-action="viewReceipt" data-id="${esc(i.receiptId)}"`:''}>
          <div><div>${esc(i.name||i.rawName)} <span class="small muted">${esc(i.rawName&&i.rawName!==i.name?'('+i.rawName+')':'')}</span></div>
            <div class="small muted">${esc(i.purchasedAt||'')} · ${esc(i.store||'')} · ${money(i.price)} ${i.qty?('· qty '+i.qty):''}
            ${i.status==='thrown_away'?'· <span style="color:var(--tomato-ink)">thrown away</span>':i.status==='consumed'?'· used up':''}
            ${i.useByDate?('· use by '+i.useByDate):''}</div></div>
          <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
            ${i.status==='active'?`<button class="sec" style="width:auto;padding:8px 10px" data-action="markWaste" data-id="${esc(i.id)}"><svg class="mk-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-trash"></use></svg> Waste</button>`:''}
            ${i.receiptId?'<span class="muted" aria-hidden="true"><svg class="mk-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-receipt"></use></svg>›</span>':''}
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

/* INPUT handler this view contributes to the shared delegated registry (§11.1).
   No CLICK keys are exclusive to Search — its toggleOpen/markWaste/viewReceipt
   actions are all shared handlers that stay in app.js. */
export const searchInputs = { search: () => runSearch() };
