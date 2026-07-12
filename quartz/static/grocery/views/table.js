/* =========================================================================
   views/table.js — S? "All items" table (full sortable + filterable view of
   every stored item field). Extracted from app.js in the §11.1 module split,
   mirroring views/today.js: reads only from the in-memory db (D); pure helpers
   come from core/domain.js. This view has no mutations — sort/filter live in the
   module-local TS state and only re-render the table body.
   ========================================================================= */
import { D } from '../app.js';
import { $, esc } from '../core/domain.js';

const TABLE_COLS = [
  {key:'rawName',    label:'Raw name',   type:'text'},
  {key:'name',       label:'Name',       type:'text'},
  {key:'groupId',    label:'Group',      type:'text'},
  {key:'category',   label:'Category',   type:'text'},
  {key:'qty',        label:'Qty',        type:'num'},
  {key:'unit',       label:'Unit',       type:'text'},
  {key:'unitPrice',  label:'Unit price', type:'num'},
  {key:'price',      label:'Price',      type:'num'},
  {key:'store',      label:'Store',      type:'text'},
  {key:'purchasedAt',label:'Purchased',  type:'text'},
  {key:'perishable', label:'Perishable', type:'bool'},
  {key:'useByDate',  label:'Use by',     type:'text'},
  {key:'hsaEligible',label:'HSA',        type:'bool'},
  {key:'status',     label:'Status',     type:'text'},
  {key:'flags',      label:'Flags',      type:'list'},
];
let TS = { field:'purchasedAt', dir:'desc', filters:{} };
function cellText(it, col){
  const v=it[col.key];
  if(col.type==='bool') return v?'yes':'no';
  if(col.type==='list') return Array.isArray(v)?v.join(', '):(v==null?'':String(v));
  return v==null?'':String(v);
}
function cellSort(it, col){
  const v=it[col.key];
  if(col.type==='num') return (v==null||v==='')? -Infinity : Number(v);
  if(col.type==='bool') return v?1:0;
  return cellText(it,col).toLowerCase();
}
function tableRows(){
  let rows=D.items.slice();
  for(const c of TABLE_COLS){
    const f=(TS.filters[c.key]||'').trim().toLowerCase();
    if(f) rows=rows.filter(it=>cellText(it,c).toLowerCase().includes(f));
  }
  const col=TABLE_COLS.find(c=>c.key===TS.field);
  if(col) rows.sort((a,b)=>{ const x=cellSort(a,col), y=cellSort(b,col);
    if(x<y) return TS.dir==='asc'?-1:1; if(x>y) return TS.dir==='asc'?1:-1; return 0; });
  return rows;
}
export function renderTable(){
  $('#main').innerHTML = `
  <div class="card">
    <div class="flex"><h2 style="margin:0"><svg class="mk-ic" viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px;vertical-align:-4px"><use href="#ic-table"></use></svg> All items</h2><div class="small muted" id="tcount"></div></div>
    <p class="small muted" style="margin:6px 0 0">Every stored field. Tap a column title to sort (tap again to reverse); type in the box under any column to filter.</p>
    <button class="link" data-action="clearTableFilters" style="margin-top:6px">Clear all filters</button>
    <div class="tablewrap">
      <table id="ttable">
        <thead>
          <tr>${TABLE_COLS.map(c=>`<th class="sortable ${c.type==='num'?'n':''}" data-action="sortTable" data-col="${esc(c.key)}">${esc(c.label)}<span class="sortarrow" data-col="${esc(c.key)}"></span></th>`).join('')}</tr>
          <tr>${TABLE_COLS.map(c=>`<th><input data-f="${esc(c.key)}" placeholder="filter" data-input="tableFilter" data-col="${esc(c.key)}" autocapitalize="off" autocorrect="off" spellcheck="false"/></th>`).join('')}</tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  </div>`;
  // restore any active filter text into the inputs
  document.querySelectorAll('#ttable input[data-f]').forEach(i=>{ i.value=TS.filters[i.getAttribute('data-f')]||''; });
  updateSortArrows(); drawTableBody();
}
function drawTableBody(){
  const tb=$('#tbody'); if(!tb) return;
  const rows=tableRows();
  tb.innerHTML = rows.length
    ? rows.map(it=>`<tr>${TABLE_COLS.map(c=>{ const t=cellText(it,c);
        return `<td class="${c.type==='num'?'n':''}">${t!==''?esc(t):'<span class="muted">—</span>'}</td>`; }).join('')}</tr>`).join('')
    : `<tr><td colspan="${TABLE_COLS.length}" class="muted small" style="padding:14px">No items match these filters.</td></tr>`;
  const cnt=$('#tcount'); if(cnt) cnt.textContent = rows.length+' of '+D.items.length+' shown';
}
function updateSortArrows(){
  document.querySelectorAll('#ttable .sortarrow').forEach(s=>{
    s.textContent = TS.field===s.getAttribute('data-col') ? (TS.dir==='asc'?'▲':'▼') : '';
  });
}
function sortTable(field){
  if(TS.field===field) TS.dir = TS.dir==='asc'?'desc':'asc';
  else { TS.field=field; TS.dir='asc'; }
  updateSortArrows(); drawTableBody();   // header inputs untouched → keeps focus/values
}
function setTableFilter(field, val){ TS.filters[field]=val; drawTableBody(); }
function clearTableFilters(){ TS.filters={}; document.querySelectorAll('#ttable input[data-f]').forEach(i=>i.value=''); drawTableBody(); }

/* Handlers this view contributes to the shared delegated registries (§11.1). */
export const tableActions = {
  clearTableFilters,
  sortTable: t => sortTable(t.dataset.col),
};
export const tableInputs = {
  tableFilter: t => setTableFilter(t.dataset.col, t.value),
};
