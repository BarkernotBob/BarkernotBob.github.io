/* =========================================================================
   views/capture.js — S5 "Capture" screen (PRD §12 S5).
   Snap a receipt photo: client-side downscale to JPEG, then one atomic commit
   lands the image blob + an unprocessed receipt stub together (Claude reads it
   a minute or two later). Reads only from the in-memory db (D); mutations go
   through the shared commitFiles. Follows the views/today.js module shape (§11.1).
   ========================================================================= */
import { D, FILES, commitFiles, LS } from '../app.js';
import { $, money, esc, uid } from '../core/domain.js';
import { toast } from '../ui/components.js';

let pendingImg=null;
export function renderCapture(){
  const recent=[...D.receipts].sort((a,b)=>(b.capturedAt||'').localeCompare(a.capturedAt||'')).slice(0,8);
  $('#main').innerHTML = `
  <div class="card">
    <h2>Snap a receipt</h2>
    <p class="small muted">Take a clear photo of the whole receipt. It saves to your private folder and is read automatically a minute or two later.</p>
    <input id="cap_file" type="file" accept="image/*" capture="environment" class="hidden" data-change="pick"/>
    <button data-action="pickFile"><svg class="mk-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-capture"></use></svg> Open camera / choose photo</button>
    <img id="cap_prev" class="preview hidden"/>
    <div id="cap_actions" class="hidden" style="margin-top:10px">
      <label>Store (optional — it's read from the photo, but you can hint)</label>
      <input id="cap_store" placeholder="e.g. Costco"/>
      <div class="row" style="margin-top:10px">
        <button class="sec" data-action="resetCapture">Retake</button>
        <button id="cap_save" data-action="saveReceipt">Save receipt</button>
      </div>
    </div>
  </div>
  <div class="card">
    <h2>Recent captures</h2>
    ${recent.length? recent.map(r=>{
      const st = r.status==='processed'?'<span class="pill ok">read</span>'
               : r.status==='needs_review'?'<span class="pill warn">needs review</span>'
               : '<span class="pill gray">reading…</span>';
      return `<div class="item flex"><div><b>${esc(r.store||'Unread receipt')}</b><div class="small muted">${esc((r.purchasedAt||r.capturedAt||'').slice(0,10))} · by ${esc(r.capturedBy||'?')}${r.total!=null?' · '+money(r.total):''}</div></div>${st}</div>`;
    }).join('') : '<p class="muted small">No receipts yet. Snap your first one above.</p>'}
    <p class="small muted" style="margin-top:10px">${D.receipts.filter(r=>r.status==='unprocessed').length} still being read. New receipts are read automatically a minute or two after you snap them.</p>
  </div>`;
}
function onPick(ev){
  const f=ev.target.files[0]; if(!f) return;
  const img=new Image();
  img.onload=()=>{
    const max=1600, scale=Math.min(1, max/Math.max(img.width,img.height));
    const c=document.createElement('canvas'); c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    pendingImg = c.toDataURL('image/jpeg', 0.7);
    const p=$('#cap_prev'); p.src=pendingImg; p.classList.remove('hidden');
    $('#cap_actions').classList.remove('hidden');
  };
  img.src=URL.createObjectURL(f);
}
function resetCapture(){ pendingImg=null; $('#cap_prev').classList.add('hidden'); $('#cap_actions').classList.add('hidden'); $('#cap_file').value=''; }
async function saveReceipt(){
  if(!pendingImg) return;
  const btn=$('#cap_save'); btn.disabled=true; btn.innerHTML='<span class="spin"></span> Saving…';
  try{
    const id=uid('r'); const path='inbox/'+id+'.jpg';
    const b64=pendingImg.split(',')[1];
    const rec={ id, status:'unprocessed', photo:path, capturedAt:new Date().toISOString(), capturedBy:LS.me,
      store:($('#cap_store').value.trim()||null), storeId:null, purchasedAt:null, subtotal:null, tax:null, total:null,
      currency:(D.config.currency||'USD'), itemIds:[], notes:'' };
    // One atomic commit: the photo blob + the receipt stub land together.
    await commitFiles([
      { path, op:'putBinaryB64', contentB64:b64 },
      { path:FILES.receipts, op:'append', record:rec }
    ], 'Add unprocessed receipt '+id);
    toast('Saved! It will be read automatically in a minute or two. 📷');
    resetCapture(); renderCapture();
  }catch(e){ toast(String(e.message||e)); }
  finally{ btn.disabled=false; btn.innerHTML='Save receipt'; }
}

/* Handlers this view contributes to the shared delegated registries (§11.1). */
export const captureActions = {
  saveReceipt,
  resetCapture,
  pickFile: () => document.getElementById('cap_file').click(),
};
export const captureChanges = {
  pick: (t,e) => onPick(e),
};
