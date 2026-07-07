/* =========================================================================
   views/reports.js — S6 "Reports" screen (PRD §12 S6).
   Spend totals + per-store / per-item breakdowns, HSA reimbursement tally, and
   waste cost over a chosen date range. Reads only from the in-memory db (D);
   this view is read-only (no mutations). Mirrors views/today.js (§11.1).
   groupLabel/groupKeyFor are shared with Search, so they're imported from app.js
   rather than moved. Date math here stays as the original LOCAL-time new Date()
   (behaviour preserved from the pre-split app.js).
   ========================================================================= */
import { D, FILES, commitFiles, show, updateBadges, groupLabel, groupKeyFor } from '../app.js';
import { $, money, esc, todayISO } from '../core/domain.js';

function monthStart(){ const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10); }
function inRange(date, from, to){ if(!date) return false; return date>=from && date<=to; }
export function renderReports(){
  const from=monthStart(), to=todayISO();
  $('#main').innerHTML = `
  <div class="card">
    <h2>Reports</h2>
    <div class="row">
      <div><label>From</label><input id="rf" type="date" value="${from}" data-change="reports"/></div>
      <div><label>To</label><input id="rt" type="date" value="${to}" data-change="reports"/></div>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="sec" data-action="setRange" data-range="month">This month</button>
      <button class="sec" data-action="setRange" data-range="30">Last 30 days</button>
      <button class="sec" data-action="setRange" data-range="year">This year</button>
    </div>
  </div>
  <div id="rout"></div>`;
  runReports();
}
function setRange(kind){
  const t=new Date(); let f;
  if(kind==='month') f=new Date(t.getFullYear(),t.getMonth(),1);
  else if(kind==='30'){ f=new Date(); f.setDate(f.getDate()-30); }
  else f=new Date(t.getFullYear(),0,1);
  $('#rf').value=f.toISOString().slice(0,10); $('#rt').value=todayISO(); runReports();
}
function runReports(){
  const from=$('#rf').value, to=$('#rt').value;
  const items=D.items.filter(i=>inRange(i.purchasedAt,from,to));
  const total=items.reduce((s,i)=>s+(+i.price||0),0);
  // per store
  const byStore={}; items.forEach(i=>{ const k=i.store||'Unknown'; byStore[k]=(byStore[k]||0)+(+i.price||0); });
  const storeRows=Object.entries(byStore).sort((a,b)=>b[1]-a[1]);
  // per group (top spend)
  const byGroup={}; items.forEach(i=>{ const k=groupLabel(groupKeyFor(i)); byGroup[k]=(byGroup[k]||0)+(+i.price||0); });
  const groupRows=Object.entries(byGroup).sort((a,b)=>b[1]-a[1]).slice(0,15);
  // HSA
  const hsa=items.filter(i=>i.hsaEligible); const hsaTotal=hsa.reduce((s,i)=>s+(+i.price||0),0);
  // waste
  const waste=D.waste.filter(w=>inRange(w.thrownAt,from,to)); const wasteCost=waste.reduce((s,w)=>s+(+w.estCost||0),0);

  $('#rout').innerHTML = `
  <div class="card"><div class="small muted">Total spend ${esc(from)} → ${esc(to)}</div><div class="big hero-figure">${money(total)}</div>
    <div class="small muted">${items.length} items across ${storeRows.length} store(s)</div></div>

  <div class="card"><h2>Spend per store</h2>
    ${storeRows.length?`<table><tr><th>Store</th><th class="n">Spent</th></tr>${storeRows.map(([s,v])=>`<tr><td>${esc(s)}</td><td class="n">${money(v)}</td></tr>`).join('')}</table>`:'<p class="muted small">No data in range.</p>'}
  </div>

  <div class="card"><h2>Top items by spend</h2>
    ${groupRows.length?`<table><tr><th>Item</th><th class="n">Spent</th></tr>${groupRows.map(([s,v])=>`<tr><td>${esc(s)}</td><td class="n">${money(v)}</td></tr>`).join('')}</table>`:'<p class="muted small">No data in range.</p>'}
    <p class="small muted" style="margin-top:8px">Tip: use the <b>Search</b> tab to see the full history and price of any one item.</p>
  </div>

  <div class="card"><h2><svg class="mk-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-heart"></use></svg> HSA reimbursement</h2>
    <div class="kv"><span>Eligible spend in range</span><b>${money(hsaTotal)}</b></div>
    ${hsa.length?`<table><tr><th>Item</th><th>Date</th><th class="n">Price</th></tr>${hsa.map(i=>`<tr><td>${esc(i.name||i.rawName)}</td><td>${esc(i.purchasedAt||'')}</td><td class="n">${money(i.price)}</td></tr>`).join('')}</table>
      <p class="small muted" style="margin-top:8px">Keep these for your HSA records — receipt photos are saved in your data folder.</p>`:'<p class="muted small">No HSA-eligible items flagged in range.</p>'}
  </div>

  <div class="card"><h2><svg class="mk-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-trash"></use></svg> Waste</h2>
    <div class="kv"><span>Estimated money wasted</span><b>${money(wasteCost)}</b></div>
    <div class="kv"><span>Items thrown away</span><b>${waste.length}</b></div>
    ${waste.length?`<table><tr><th>Item</th><th>Date</th><th>Reason</th><th class="n">Cost</th></tr>${waste.map(w=>`<tr><td>${esc(w.name)}</td><td>${esc(w.thrownAt)}</td><td>${esc(w.reason)}</td><td class="n">${money(w.estCost)}</td></tr>`).join('')}</table>`:'<p class="muted small">Nothing wasted in range — nice.</p>'}
  </div>`;
}

/* Handlers this view contributes to the shared delegated registries (§11.1). */
export const reportsActions = { setRange: t => setRange(t.dataset.range) };
export const reportsChanges = { reports: () => runReports() };
