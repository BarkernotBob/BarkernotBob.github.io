import { $, el, money, esc, todayISO, uid, b64encode, b64decode, norm } from './core/domain.js';
import { toast, modal, confirmModal, fixInputAttrs } from './ui/components.js';
import { createStore } from '../shared/storage.js';
import { GITHUB_API, OAUTH, oauthReady, ghHeaders as githubHeaders } from '../shared/github.js';
import { renderToday, todayActions } from './views/today.js';
import { renderPantry, pantryActions, pantryInputs } from './views/pantry.js';
import { renderTrips, tripsActions } from './views/trips.js';
import { renderCapture, captureActions, captureChanges } from './views/capture.js';
import { renderTable, tableActions, tableInputs } from './views/table.js';
import { renderReports, reportsActions, reportsChanges } from './views/reports.js';
import { renderReview, reviewActions, viewPhoto, purgeStaleFlags } from './views/review.js';
import { renderSettings, settingsActions } from './views/settings.js';

/* =========================================================================
   Grocery Tracker — single-file app.
   Stores everything in a PRIVATE GitHub repo (the "data repo") via the GitHub
   API. No data lives in this file. Settings (repo + token + your name) live in
   this browser only (localStorage).
   ========================================================================= */

/* ---- App-wide sign-in config. The OAuth App id and Worker URL are shared with
        the Pool app and now live in one place, shared/github.js (GAP-W5) — they
        used to be duplicated here and in pool/index.html. Both values are
        PUBLIC, not secrets; the token-paste fallback works even before OAuth is
        set up. ---- */

/* Settings for THIS browser. Keys are gt_-prefixed; theme writes 'system' by
   removing the key, so the OS preference takes over again rather than being
   pinned. */
const LS = createStore('gt_', {
  repo: '',                                  // "owner/name"
  token: '',
  me: '',                                    // "Me" / "Wife"
  device: '',                                // "My iPhone" — names THIS device's sign-in
  login: '',                                 // GitHub username (from OAuth)
  method: '',                                // 'oauth' | 'token'
  theme: { default: 'system', clearOn: 'system' }, // 'system' | 'light' | 'dark'
});

/* Apply the chosen theme (§9.2). 'system' clears data-theme so the OS preference
   (prefers-color-scheme) drives tokens.css; 'light'/'dark' stamp <html data-theme>
   which WINS both directions. Keep <meta theme-color> in step with the ground. */
function applyTheme(){
  const t = LS.theme;
  const root = document.documentElement;
  if(t==='light' || t==='dark') root.setAttribute('data-theme', t);
  else root.removeAttribute('data-theme');
  const mc = getComputedStyle(root).getPropertyValue('--theme-color').trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta && mc) meta.setAttribute('content', mc);
}
function setTheme(v){ LS.theme = v; applyTheme(); if(CUR==='settings') renderSettings(); }

const API = GITHUB_API;
const DB = {}; // in-memory read cache: { 'db/items.json': {value, sha:<blobSha>}, ... }


/* ---------- event delegation (zero inline handlers) --------------------------
   Every interactive element carries data-action / data-input / data-change plus
   any data-* args it needs, instead of an inline on* handler. A single delegated
   listener per event type dispatches to the handler map. This removes the audited
   HTML-injection class (no data ever lands in an executable attribute) — see the
   esc() single-quote fix above — and keeps one click handler per gesture, so a
   nested action (e.g. Waste inside a group card) resolves to the nearest
   [data-action] only; the outer card toggle never fires for the same click. */
const CLICK_ACTIONS = {
  show:            t => show(t.dataset.arg),
  signIn:          () => signInWithGitHub(),
  saveSetup,
  viewReceipt:     t => viewReceipt(t.dataset.id),
};
// View modules contribute their own handlers to the shared registry (§11.1).
Object.assign(CLICK_ACTIONS, todayActions, pantryActions, tripsActions);
Object.assign(CLICK_ACTIONS, captureActions, tableActions, reportsActions, reviewActions, settingsActions);
const INPUT_ACTIONS = {};
const CHANGE_ACTIONS = {};
Object.assign(INPUT_ACTIONS, pantryInputs, tableInputs);
Object.assign(CHANGE_ACTIONS, captureChanges, reportsChanges);
document.addEventListener('click', e=>{
  const t = e.target.closest('[data-action]');
  if(!t) return;
  const fn = CLICK_ACTIONS[t.dataset.action];
  if(fn) fn(t, e);
});
document.addEventListener('input', e=>{
  const t = e.target.closest('[data-input]');
  if(!t) return;
  const fn = INPUT_ACTIONS[t.dataset.input];
  if(fn) fn(t, e);
});
document.addEventListener('change', e=>{
  const t = e.target.closest('[data-change]');
  if(!t) return;
  const fn = CHANGE_ACTIONS[t.dataset.change];
  if(fn) fn(t, e);
});

/* ---------- GitHub API (Git Data layer — S1) ------------------------------
   Reads go through the Git Data API (ref → commit → tree → blob). A default
   Contents GET errors on files >1 MB; the blobs API is good to 100 MB, so the
   old crash-ceiling is gone. Writes are ATOMIC BATCHED COMMITS: one primitive
   `commitFiles(deltas, message)` (blobs → tree(on base_tree) → commit → PATCH
   ref). Each mutation is a pure DELTA applied to freshly-fetched content, so a
   ref-update race (another writer moved `main`) is handled by refetching HEAD,
   replaying the deltas onto the fresh content, and retrying (×3) — this kills
   the lost-update bug and makes mark-waste/snooze/resolve single commits.
   Contents API is kept only for repo-existence checks, first-run seeding, and
   an image fallback for paths not in the cached tree. -------------------------*/
const BRANCH = 'main';
/* shared/github.js builds the headers; the token is passed in so that module
   never has to know grocery's gt_ key prefix. Kept under the original name so
   the 13 call sites (and views/settings.js) are unchanged. */
function ghHeaders(){ return githubHeaders(LS.token); }
async function ghContents(path){
  const r = await fetch(`${API}/repos/${LS.repo}/contents/${path}`, {headers:ghHeaders()});
  if(r.status===404) return null;
  if(!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0,180)}`);
  return r.json();
}
/* Contents PUT — only used to bootstrap missing db files into a fresh/empty repo
   (ensureInitialized). The Git Data API needs an existing commit to build on, so
   seeding the very first files still goes through Contents. Never a write path
   for user data (those go through commitFiles). */
async function ghPut(path, contentB64, sha, message){
  const body = { message, content:contentB64 };
  if(sha) body.sha = sha;
  const r = await fetch(`${API}/repos/${LS.repo}/contents/${path}`, {method:'PUT', headers:ghHeaders(), body:JSON.stringify(body)});
  if(!r.ok) throw new Error(`Save failed ${r.status}: ${(await r.text()).slice(0,180)}`);
  return r.json();
}

/* HEAD mirrors main's tip: the commit sha, its tree sha, the ref ETag (for
   cheap conditional polling), and a path→blobSha map so we refetch only files
   whose blob actually changed. */
let HEAD = null;
async function ghGetRef(conditional){
  const h = ghHeaders();
  if(conditional && HEAD && HEAD.etag) h['If-None-Match'] = HEAD.etag;
  const r = await fetch(`${API}/repos/${LS.repo}/git/ref/heads/${BRANCH}`, {headers:h});
  if(r.status===304) return { notModified:true };
  if(!r.ok) throw new Error(`ref ${r.status}: ${(await r.text()).slice(0,180)}`);
  const j = await r.json();          // { ref, object:{ sha, type:'commit' } }
  return { commitSha:j.object.sha, etag:r.headers.get('etag') };
}
async function ghGetCommit(sha){
  const r = await fetch(`${API}/repos/${LS.repo}/git/commits/${sha}`, {headers:ghHeaders()});
  if(!r.ok) throw new Error(`commit ${r.status}`);
  return r.json();                   // { sha, tree:{ sha }, ... }
}
async function ghTreeRaw(sha, recursive){
  const r = await fetch(`${API}/repos/${LS.repo}/git/trees/${sha}${recursive?'?recursive=1':''}`, {headers:ghHeaders()});
  if(!r.ok) throw new Error(`tree ${r.status}`);
  return r.json();                   // { sha, tree:[{path,type,sha,mode}], truncated }
}
async function ghGetTree(sha){
  const j = await ghTreeRaw(sha, true);
  const map = {};
  (j.tree||[]).forEach(e=>{ if(e.type==='blob') map[e.path]=e.sha; });
  if(j.truncated){
    // Real GitHub caps a recursive listing (~100k entries / 7 MB) and returns an
    // INCOMPLETE array. Resolve the critical db/*.json from the db subtree so data
    // never silently reads as empty. (Images fall back to the Contents API in
    // getImageDataUrl.) Only fires at a repo scale we're years from.
    try{
      const root = await ghTreeRaw(sha, false);
      const dbEntry = (root.tree||[]).find(e=>e.path==='db' && e.type==='tree');
      if(dbEntry){ (await ghTreeRaw(dbEntry.sha, true)).tree.forEach(e=>{ if(e.type==='blob') map['db/'+e.path]=e.sha; }); }
    }catch(e){ /* best-effort; loadJson's fallback covers any still-missing path */ }
  }
  return { treeSha:j.sha, map, truncated:!!j.truncated };
}
async function ghGetBlobB64(sha){
  const r = await fetch(`${API}/repos/${LS.repo}/git/blobs/${sha}`, {headers:ghHeaders()});
  if(!r.ok) throw new Error(`blob ${r.status}`);
  const j = await r.json();          // { sha, encoding:'base64', content }
  return (j.content||'').replace(/\n/g,'');
}
async function ghGetBlobText(sha){ return b64decode(await ghGetBlobB64(sha)); }
async function ghCreateBlobB64(contentB64){
  const r = await fetch(`${API}/repos/${LS.repo}/git/blobs`, {method:'POST', headers:ghHeaders(), body:JSON.stringify({content:contentB64, encoding:'base64'})});
  if(!r.ok) throw new Error(`create blob ${r.status}: ${(await r.text()).slice(0,180)}`);
  return (await r.json()).sha;
}
async function ghCreateTree(baseTreeSha, entries){
  const r = await fetch(`${API}/repos/${LS.repo}/git/trees`, {method:'POST', headers:ghHeaders(), body:JSON.stringify({base_tree:baseTreeSha, tree:entries})});
  if(!r.ok) throw new Error(`create tree ${r.status}: ${(await r.text()).slice(0,180)}`);
  return (await r.json()).sha;
}
async function ghCreateCommit(message, treeSha, parentSha){
  const r = await fetch(`${API}/repos/${LS.repo}/git/commits`, {method:'POST', headers:ghHeaders(), body:JSON.stringify({message, tree:treeSha, parents:[parentSha]})});
  if(!r.ok) throw new Error(`create commit ${r.status}: ${(await r.text()).slice(0,180)}`);
  return (await r.json()).sha;
}
async function ghUpdateRef(commitSha){
  // force:false → GitHub returns 422 (non-fast-forward) when main moved under us.
  const r = await fetch(`${API}/repos/${LS.repo}/git/refs/heads/${BRANCH}`, {method:'PATCH', headers:ghHeaders(), body:JSON.stringify({sha:commitSha, force:false})});
  if(!r.ok) throw new Error(`update ref ${r.status}: ${(await r.text()).slice(0,180)}`);
  return r.json();
}
async function getImageDataUrl(path){
  const blobSha = (HEAD && HEAD.tree) ? HEAD.tree[path] : null;
  if(blobSha){ return 'data:image/jpeg;base64,'+(await ghGetBlobB64(blobSha)); }
  // Fallback for a freshly-added photo not yet in the cached tree.
  const c = await ghContents(path);
  if(!c) return null;
  if(c.content) return 'data:image/jpeg;base64,'+c.content.replace(/\n/g,'');
  if(c.download_url){ const r=await fetch(c.download_url, {headers:ghHeaders()}); const b=await r.blob(); return URL.createObjectURL(b); }
  return null;
}

/* ---------- data load ---------- */
const FILES = {
  items:'db/items.json', receipts:'db/receipts.json', groups:'db/item_groups.json',
  stores:'db/stores.json', waste:'db/waste.json', reminders:'db/reminders.json',
  needs:'db/needs_attention.json', config:'db/config.json'
};
const KEY_BY_PATH = Object.fromEntries(Object.entries(FILES).map(([k,v])=>[v,k]));
function pathToKey(p){ return KEY_BY_PATH[p]||null; }
let D = {}; // loaded data

/* ---------- atomic batched commits (deltas) ------------------------------
   A delta is a pure description of a change to ONE file, applied to freshly-
   fetched content at commit time (never a stale local snapshot):
     {path, op:'append', record}                    – push one record
     {path, op:'appendMany', records:[...]}          – push several
     {path, op:'setField', id, fields}               – Object.assign onto record #id
     {path, op:'setFields', updates:[{id,fields}]}   – several set-field on one file
     {path, op:'replace', value}                     – blind overwrite (seed only; NOT race-safe)
     {path, op:'mutate', fn}                          – fn(freshParsed)→newValue, race-safe object edit
     {path, op:'putBinaryB64', contentB64}           – raw binary blob (receipt photo)  */
function applyDelta(currentText, delta){
  if(delta.op==='putBinaryB64') return { b64:delta.contentB64 };
  if(delta.op==='replace') return { value:delta.value };
  // mutate applies the caller's pure fn to the FRESH parsed content (an object
  // file like config.json), so a ref-race replay never clobbers a concurrent
  // writer — unlike replace, which would re-write a stale snapshot.
  if(delta.op==='mutate'){
    const cur = currentText!=null ? JSON.parse(currentText) : (delta.base!==undefined ? delta.base : {});
    return { value: delta.fn(cur) };
  }
  const arr = currentText!=null ? JSON.parse(currentText) : (delta.base || []);
  if(delta.op==='append') arr.push(delta.record);
  else if(delta.op==='appendMany') (delta.records||[]).forEach(r=>arr.push(r));
  else if(delta.op==='setField'){ const o=arr.find(x=>x&&x.id===delta.id); if(o) Object.assign(o, delta.fields); }
  else if(delta.op==='setFields'){ (delta.updates||[]).forEach(u=>{ const o=arr.find(x=>x&&x.id===u.id); if(o) Object.assign(o,u.fields); }); }
  else throw new Error('unknown delta op '+delta.op);
  return { value:arr };
}
/* One atomic commit across all files a mutation touches. On a ref race (422/409)
   we refetch HEAD, replay the deltas onto the now-fresh content, and retry ×3 —
   so a concurrent writer's changes are never clobbered. */
async function commitFiles(deltas, message){
  if(!deltas || !deltas.length) return {};
  let lastErr;
  for(let attempt=0; attempt<3; attempt++){
    try{
      const ref = await ghGetRef(false);
      const commit = await ghGetCommit(ref.commitSha);
      const baseTreeSha = commit.tree.sha;
      const tree = await ghGetTree(baseTreeSha);
      const entries = [], newValues = {};
      for(const d of deltas){
        const blobSha = tree.map[d.path];
        let currentText = null;
        if(blobSha && d.op!=='putBinaryB64' && d.op!=='replace') currentText = await ghGetBlobText(blobSha);
        const applied = applyDelta(currentText, d);
        let newBlobSha;
        if(applied.b64!=null){ newBlobSha = await ghCreateBlobB64(applied.b64); }
        else { newBlobSha = await ghCreateBlobB64(b64encode(JSON.stringify(applied.value,null,2))); newValues[d.path]=applied.value; }
        entries.push({ path:d.path, mode:'100644', type:'blob', sha:newBlobSha });
      }
      const newTreeSha = await ghCreateTree(baseTreeSha, entries);
      const newCommitSha = await ghCreateCommit(message, newTreeSha, ref.commitSha);
      await ghUpdateRef(newCommitSha);                 // 422 here on a race → caught below
      // Success — advance our HEAD view and refresh the in-memory + cached data.
      const newTreeMap = Object.assign({}, tree.map);
      entries.forEach(e=> newTreeMap[e.path]=e.sha);
      HEAD = { commitSha:newCommitSha, treeSha:newTreeSha, etag:(HEAD?HEAD.etag:null), tree:newTreeMap };
      for(const p in newValues){ DB[p]={value:newValues[p], sha:newTreeMap[p]}; const k=pathToKey(p); if(k) D[k]=newValues[p]; }
      saveSnapshot();
      return newValues;
    }catch(e){
      lastErr = e; const s = String(e);
      if((s.includes('422')||s.includes('409')) && attempt<2) continue;  // ref moved: replay
      throw e;
    }
  }
  throw lastErr;
}

/* ---------- reads (blob-based, no 1 MB ceiling) ---------- */
async function loadHead(){
  const ref = await ghGetRef(false);
  const commit = await ghGetCommit(ref.commitSha);
  const tree = await ghGetTree(commit.tree.sha);
  HEAD = { commitSha:ref.commitSha, treeSha:tree.treeSha, etag:ref.etag, tree:tree.map };
  return HEAD;
}
async function loadJson(path, fallback){
  const blobSha = (HEAD && HEAD.tree) ? HEAD.tree[path] : null;
  if(!blobSha){ DB[path]={value:JSON.parse(JSON.stringify(fallback)), sha:null}; return DB[path].value; }
  if(DB[path] && DB[path].sha===blobSha) return DB[path].value;   // unchanged since last fetch
  const value = JSON.parse(await ghGetBlobText(blobSha));
  DB[path] = {value, sha:blobSha};
  return value;
}
function resetCaches(){ D={}; HEAD=null; for(const k in DB) delete DB[k]; }
async function loadAll(){
  await loadHead();
  D.items   = await loadJson(FILES.items, []);
  D.receipts= await loadJson(FILES.receipts, []);
  D.groups  = await loadJson(FILES.groups, {});
  D.stores  = await loadJson(FILES.stores, {});
  D.waste   = await loadJson(FILES.waste, []);
  D.reminders=await loadJson(FILES.reminders, []);
  D.needs   = await loadJson(FILES.needs, []);
  D.config  = await loadJson(FILES.config, {members:[],currency:'USD'});
  // self-heal: clear any leftover "_unclear" flags whose field is now filled & resolved
  const healed = purgeStaleFlags();
  if(healed.length){ try{ await commitFiles([{path:FILES.items, op:'setFields',
    updates:healed.map(it=>({id:it.id, fields:{flags:it.flags}}))}], 'Clear stale review flags'); }catch(e){} }
  saveSnapshot();
  updateBadges();
}
function updateBadges(){
  const open = (D.needs||[]).filter(n=>n.status==='open').length
             + (D.reminders||[]).filter(r=>r.status==='pending' && r.dueDate<=todayISO()).length;
  const b=$('#reviewBadge');
  if(open>0){ b.textContent=open; b.classList.remove('hidden'); } else b.classList.add('hidden');
}

/* ---------- IndexedDB boot snapshot -------------------------------------
   Persist per-file {value, sha} plus HEAD so boot renders instantly, then
   revalidate with conditional GETs. IndexedDB (not localStorage) because a
   backfilled items.json would blow localStorage's ~5 MB origin-shared quota. */
const IDB_NAME='gt_cache', IDB_STORE='files';
function idbOpen(){ return new Promise((res,rej)=>{ let req; try{ req=indexedDB.open(IDB_NAME,1); }catch(e){ return rej(e); }
  req.onupgradeneeded=()=>{ req.result.createObjectStore(IDB_STORE); };
  req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); }); }
async function idbSet(entries){
  try{ const db=await idbOpen(); await new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite');
    const os=tx.objectStore(IDB_STORE); entries.forEach(([k,v])=>os.put(v,k));
    tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); db.close(); }catch(e){}
}
async function idbGetAll(){
  try{ const db=await idbOpen(); const out=await new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readonly');
    const os=tx.objectStore(IDB_STORE); const kReq=os.getAllKeys(), vReq=os.getAll(); let keys,vals;
    kReq.onsuccess=()=>{keys=kReq.result;}; vReq.onsuccess=()=>{vals=vReq.result;};
    tx.oncomplete=()=>{ const o={}; (keys||[]).forEach((k,i)=>o[k]=vals[i]); res(o); }; tx.onerror=()=>rej(tx.error); });
    db.close(); return out; }catch(e){ return {}; }
}
function saveSnapshot(){
  if(!HEAD) return;
  const entries=[['__head__', HEAD]];
  for(const p in DB){ entries.push(['file:'+p, {value:DB[p].value, sha:DB[p].sha}]); }
  idbSet(entries);                    // fire-and-forget
}
async function loadSnapshot(){
  const all = await idbGetAll();
  const head = all['__head__'];
  if(!head || !head.tree) return false;
  HEAD = head;
  for(const key in all){ if(key.indexOf('file:')!==0) continue; const p=key.slice(5);
    DB[p]={value:all[key].value, sha:all[key].sha}; const k=pathToKey(p); if(k) D[k]=all[key].value; }
  return D.items!=null;
}

/* ---------- freshness: poll main, refetch only changed paths ------------- */
let _polling=false;
async function checkFreshness(){
  if(!isConfigured() || !HEAD || _polling) return;
  _polling=true;
  try{
    const ref = await ghGetRef(true);            // conditional (ETag)
    if(ref.notModified) return;
    if(ref.commitSha===HEAD.commitSha){ HEAD.etag=ref.etag; return; }
    const commit = await ghGetCommit(ref.commitSha);
    const tree = await ghGetTree(commit.tree.sha);
    const beforeProcessed = new Set((D.receipts||[]).filter(r=>r.status==='processed').map(r=>r.id));
    const changedPaths=[];
    for(const key in FILES){ const path=FILES[key];
      const oldSha=HEAD.tree[path], newSha=tree.map[path];
      if(newSha && newSha!==oldSha){ const value=JSON.parse(await ghGetBlobText(newSha)); DB[path]={value, sha:newSha}; D[key]=value; changedPaths.push(path); } }
    HEAD = { commitSha:ref.commitSha, treeSha:tree.treeSha, etag:ref.etag, tree:tree.map };
    saveSnapshot();
    if(changedPaths.length){
      const nowProcessed=(D.receipts||[]).filter(r=>r.status==='processed' && !beforeProcessed.has(r.id)).length;
      updateBadges();
      if(CUR) show(CUR);                          // self-resolves "reading…" without a reload
      toast(nowProcessed>0 ? `Synced — ${nowProcessed} receipt${nowProcessed>1?'s':''} processed.` : 'Synced — data updated.');
    }
  }catch(e){ /* transient — the next tick retries */ }
  finally{ _polling=false; }
}
function startFreshnessPolling(){
  if(startFreshnessPolling._on) return; startFreshnessPolling._on=true;
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') checkFreshness(); });
  setInterval(()=>{ if(document.visibilityState!=='hidden') checkFreshness(); }, 60000);
}

/* =========================================================================
   ROUTER
   ========================================================================= */
let CUR='today';
async function show(tab){
  CUR=tab;
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  if(!isConfigured() && tab!=='settings'){ return renderSetup(); }
  const m=$('#main'); m.innerHTML='<div class="card"><span class="spin" style="border-color:var(--pine);border-top-color:transparent"></span> Loading…</div>';
  try{
    if(!isConfigured()){ renderSetup(); return; }
    if(!D.items) await loadAll(); // first load
    if(tab==='today') renderToday();
    else if(tab==='capture') renderCapture();
    else if(tab==='pantry') renderPantry();
    else if(tab==='trips') renderTrips();
    else if(tab==='reports') renderReports();
    else if(tab==='review') renderReview();
    else if(tab==='table') renderTable();
    else if(tab==='settings') renderSettings();
  }catch(e){
    m.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted small">${esc(String(e))}</p>
      <p class="small">If this mentions 401/403, your access key (token) may be wrong or expired. Open Settings to re-enter it.</p>
      <button class="sec" data-action="show" data-arg="settings">Open Settings</button></div>`;
  }
  $('#whoami').textContent = LS.me ? ('Signed in as '+LS.me + (LS.device?(' · '+LS.device):'')) : '';
}
function isConfigured(){ return LS.repo && LS.token && LS.me; }
/* Who's driving this device — view modules stamp `by` on waste records with it. */
function getMe(){ return LS.me; }

/* =========================================================================
   SIGN-IN  (GitHub OAuth via Cloudflare Worker, with token-paste fallback)
   ========================================================================= */

function appRedirect(){ return location.origin + location.pathname; }

function signInWithGitHub(){
  if(!oauthReady()){ toast('GitHub sign-in isn\'t set up yet — use “paste a token” below for now.'); return; }
  // The redirect navigates away, so capture the name/device first.
  const me = $('#su_me') ? $('#su_me').value.trim() : LS.me;
  const device = $('#su_device') ? $('#su_device').value.trim() : LS.device;
  if(!me){ toast('Choose your name first'); return; }
  LS.me = me; if(device) LS.device = device;
  const state = uid('s'); localStorage.setItem('gt_oauth_state', state);
  const u = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(OAUTH.clientId)}`
          + `&scope=repo&redirect_uri=${encodeURIComponent(appRedirect())}&state=${encodeURIComponent(state)}`;
  location.href = u;
}
async function handleOAuthRedirect(){
  const p = new URLSearchParams(location.search);
  const code = p.get('code'), state = p.get('state');
  if(!code) return false;
  history.replaceState({}, '', appRedirect()); // clean the URL no matter what
  if(state !== localStorage.getItem('gt_oauth_state')){ toast('Sign-in expired, please try again.'); return false; }
  try{
    const r = await fetch(OAUTH.workerUrl.replace(/\/$/,'')+'/exchange', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ code, redirect_uri: appRedirect() })
    });
    const j = await r.json();
    if(!j.access_token) throw new Error(j.error_description||j.error||'No token returned');
    LS.token = j.access_token; LS.method='oauth';
    await afterSignIn();
    return true;
  }catch(e){ toast('Sign-in failed: '+(e.message||e)); return false; }
}
/* After we have a token: learn the username, default the data repo, seed files. */
async function afterSignIn(){
  try{
    const r = await fetch(`${API}/user`, {headers:ghHeaders()});
    if(r.ok){ const u=await r.json(); LS.login=u.login; if(!LS.repo) LS.repo = u.login+'/grocery-data'; }
  }catch(e){}
  if(!LS.device) LS.device = (LS.me||'this')+"'s device";
  toast('Signed in 🎉');
  if(isConfigured()){
    try{ await ensureInitialized(); D={}; for(const k in DB) delete DB[k]; await loadAll(); }catch(e){}
  }
  show('today');   // land on the home screen, consistent with boot
}

/* =========================================================================
   SETUP (first run)
   ========================================================================= */
function renderSetup(){
  $('#main').innerHTML = `
  <div class="card">
    <h2>Welcome — let's connect your tool</h2>
    <p class="small muted">A one-time sign-in on this phone/computer. Your wife does the same on hers.
    Your receipts live in your own <b>private</b> GitHub repo — see the <b>SETUP guide</b>
    (grocery-tool/SETUP.md) if you haven't made it yet.</p>
    <label>Your name (so we know who snapped each receipt)</label>
    <select id="su_me"><option value="">Choose…</option><option ${LS.me==='Me'?'selected':''}>Me</option><option ${LS.me==='Wife'?'selected':''}>Wife</option></select>
    <label>This device's name (so your phone and computer can both stay signed in)</label>
    <input id="su_device" placeholder="e.g. My iPhone" value="${esc(LS.device)}" autocapitalize="words" autocorrect="off" spellcheck="false"/>
    <button data-action="signIn">🔐 Sign in with GitHub</button>
    <p class="small muted" style="margin-top:6px">${oauthReady()?'Pick your name above, then approve on GitHub and you\'ll come right back here.':'<b>Not set up yet</b> — use the token option below until OAuth is configured.'}</p>
    <details style="margin-top:10px"><summary>Advanced: paste a token instead</summary>
      <label>Private data repository (<code>owner/name</code>)</label>
      <input id="su_repo" placeholder="BarkernotBob/grocery-data" value="${esc(LS.repo)}" autocapitalize="off" autocorrect="off" spellcheck="false"/>
      <label>Access key (your private token — like a house key)</label>
      <input id="su_token" type="password" placeholder="github_pat_…" value="${esc(LS.token)}" autocapitalize="off" autocorrect="off" spellcheck="false"/>
      <p class="small muted">The key is saved only in this browser, never sent anywhere except GitHub.</p>
      <button class="sec" data-action="saveSetup">Connect with token</button>
    </details>
  </div>`;
}
async function saveSetup(){
  const me=$('#su_me').value.trim(), repo=$('#su_repo').value.trim(), token=$('#su_token').value.trim();
  const device=$('#su_device').value.trim();
  if(!me||!repo||!token){ toast('Please fill in your name, repository and key'); return; }
  LS.me=me; LS.repo=repo; LS.token=token; LS.method='token'; LS.device=device||(me+"'s device");
  toast('Checking your connection…');
  try{
    const r = await fetch(`${API}/repos/${repo}`, {headers:ghHeaders()});
    if(!r.ok) throw new Error('Could not open that repository ('+r.status+'). Check the name and key.');
    await ensureInitialized();
    D={}; for(const k in DB) delete DB[k];
    await loadAll();
    toast('Connected! 🎉');
    show('today');
  }catch(e){ toast(String(e.message||e)); }
}
async function ensureInitialized(){
  // create any missing db files so later writes have something to update
  const seed = {
    'db/items.json':[], 'db/receipts.json':[], 'db/waste.json':[], 'db/reminders.json':[],
    'db/needs_attention.json':[], 'db/item_groups.json':{}, 'db/stores.json':{},
    'db/config.json':{household:'Our Household',currency:'USD',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',
      members:[{name:'Me',email:'',notify:true},{name:'Wife',email:'',notify:true}],
      reminders:{useByLeadDays:0,sendReviewEmails:true,sendUseByEmails:true}}
  };
  for(const path in seed){
    const c = await ghContents(path);
    if(c===null){ await ghPut(path, b64encode(JSON.stringify(seed[path],null,2)), null, 'Initialize '+path); }
  }
}

/* =========================================================================
   GROUPING helpers — shared by Pantry (views/pantry.js) and Reports. An item's
   group key is its canonical groupId, or a normalized raw-name fallback.
   ========================================================================= */
function groupKeyFor(item){ return item.groupId || ('raw:'+norm(item.name||item.rawName)); }
function groupLabel(key){
  if(key.startsWith('raw:')) return key.slice(4);
  const g=D.groups[key]; return g? g.canonical : key;
}
/* Show every item on the same receipt as the tapped item, plus the photo. */
function viewReceipt(receiptId){
  const r=(D.receipts||[]).find(x=>x.id===receiptId);
  const items=(D.items||[]).filter(i=>i.receiptId===receiptId)
    .sort((a,b)=>(a.name||a.rawName||'').localeCompare(b.name||b.rawName||''));
  if(!r && !items.length){ toast('No receipt details saved for this item yet'); return; }
  const head = r ? `${esc(r.store||'Receipt')} · ${esc((r.purchasedAt||r.capturedAt||'').slice(0,10))}` : 'Receipt';
  const rows = items.length ? items.map(i=>`<div class="item">
      <div class="flex"><div>${esc(i.name||i.rawName||'Item')} ${i.qty?`<span class="small muted">×${esc(i.qty)}</span>`:''}</div><div><b>${money(i.price)}</b></div></div>
      <div class="small muted">${esc(i.rawName||'')}${i.category?(' · '+esc(i.category)):''}${i.status==='thrown_away'?' · <span style="color:var(--tomato-ink)">thrown away</span>':''}${i.useByDate?(' · use by '+esc(i.useByDate)):''}</div>
    </div>`).join('') : '<p class="muted small">No line items recorded for this receipt.</p>';
  const totals = r ? `${r.subtotal!=null?`<div class="kv"><span>Subtotal</span><b>${money(r.subtotal)}</b></div>`:''}${r.tax!=null?`<div class="kv"><span>Tax</span><b>${money(r.tax)}</b></div>`:''}${r.total!=null?`<div class="kv"><span>Total</span><b>${money(r.total)}</b></div>`:''}` : '';
  modal(`<h2 style="margin:0 0 2px">🧾 ${head}</h2>
    <p class="small muted" style="margin:0 0 10px">${items.length} item(s) on this receipt${r&&r.capturedBy?(' · snapped by '+esc(r.capturedBy)):''}</p>
    <div style="max-height:48vh;overflow:auto">${rows}</div>
    ${totals}
    ${r&&r.photo?`<button class="sec" data-mval="photo" style="margin-top:12px">View receipt photo</button>`:''}
    <button class="link" data-mcancel style="width:100%;margin-top:4px">Close</button>`)
    .then(v=>{ if(v==='photo' && r && r.photo) viewPhoto(r.photo); });
}

async function signOut(){ if(await confirmModal('Sign out on this device? Your data stays safe in GitHub; other devices stay signed in.','Sign out',true)){ localStorage.removeItem('gt_token'); localStorage.removeItem('gt_login'); localStorage.removeItem('gt_method'); toast('Signed out'); show('settings'); } }

/* ---------- boot ---------- */
/* Register the service worker (S2): offline read-only app shell. Best-effort —
   a failure (unsupported / blocked) must never break the app. */
function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
window.addEventListener('load', async ()=>{
  applyTheme();   // sync <meta theme-color> to the resolved theme (data-theme was set pre-paint)
  registerSW();
  // Handle the "back from GitHub sign-in" return first; otherwise show the app.
  const came = await handleOAuthRedirect();
  if(came) return;
  if(isConfigured()){
    // Render instantly from the IndexedDB snapshot if we have one, then revalidate.
    let hadSnap=false;
    try{ hadSnap = await loadSnapshot(); }catch(e){}
    await show('today');
    if(hadSnap){ try{ await loadAll(); await show(CUR); }catch(e){} }  // conditional refetch of changed paths
    startFreshnessPolling();
  } else {
    await show('settings');
  }
});

/* ---------- module boundary (§11.1) ----------
   Shared surface consumed by view modules (views/*.js). State (D) is a live
   binding; api/router helpers are functions. Views import from here rather than
   the reverse for anything stateful. */
export { D, FILES, commitFiles, show, updateBadges, LS, DB, API, ghHeaders, groupLabel, groupKeyFor, getImageDataUrl, getMe, signOut, setTheme, resetCaches };
