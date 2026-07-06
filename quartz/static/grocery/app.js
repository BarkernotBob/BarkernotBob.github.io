import { $, el, money, esc, todayISO, uid, b64encode, b64decode, norm } from './core/domain.js';
import { toast, modal, confirmModal, fixInputAttrs } from './ui/components.js';
import { renderToday, todayActions } from './views/today.js';
import { renderPantry, pantryActions, pantryInputs } from './views/pantry.js';
import { renderTrips, tripsActions } from './views/trips.js';

/* =========================================================================
   Grocery Tracker — single-file app.
   Stores everything in a PRIVATE GitHub repo (the "data repo") via the GitHub
   API. No data lives in this file. Settings (repo + token + your name) live in
   this browser only (localStorage).
   ========================================================================= */

/* ---- App-wide sign-in config. Shared with the Pool app: one GitHub OAuth App
        + one Cloudflare Worker cover all of barkernotbob.github.io/static/*.
        These two values are PUBLIC (not secrets). The token-paste fallback works
        even before OAuth is set. ---- */
const OAUTH = {
  clientId:  'Ov23lirmVUCJFsZgphQC',                       // GitHub OAuth App "Client ID"
  workerUrl: 'https://pool-auth.barkernotbob.workers.dev'  // Cloudflare Worker base URL
};

const LS = {
  get repo(){ return localStorage.getItem('gt_repo') || '' },        // "owner/name"
  set repo(v){ localStorage.setItem('gt_repo', v) },
  get token(){ return localStorage.getItem('gt_token') || '' },
  set token(v){ localStorage.setItem('gt_token', v) },
  get me(){ return localStorage.getItem('gt_me') || '' },            // "Me" / "Wife"
  set me(v){ localStorage.setItem('gt_me', v) },
  get device(){ return localStorage.getItem('gt_device') || '' },    // "My iPhone" — names THIS device's sign-in
  set device(v){ localStorage.setItem('gt_device', v) },
  get login(){ return localStorage.getItem('gt_login') || '' },      // GitHub username (from OAuth)
  set login(v){ localStorage.setItem('gt_login', v) },
  get method(){ return localStorage.getItem('gt_method') || '' },    // 'oauth' | 'token'
  set method(v){ localStorage.setItem('gt_method', v) },
  get theme(){ return localStorage.getItem('gt_theme') || 'system' }, // 'system' | 'light' | 'dark'
  set theme(v){ if(v==='system') localStorage.removeItem('gt_theme'); else localStorage.setItem('gt_theme', v) },
};

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

const API = 'https://api.github.com';
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
  pickFile:        () => document.getElementById('cap_file').click(),
  saveReceipt,
  resetCapture,
  signIn:          () => signInWithGitHub(),
  saveSetup,
  viewReceipt:     t => viewReceipt(t.dataset.id),
  clearTableFilters,
  sortTable:       t => sortTable(t.dataset.col),
  setRange:        t => setRange(t.dataset.range),
  viewPhoto:       t => viewPhoto(t.dataset.path),
  resolveFlag:     t => resolveFlag(t.dataset.id, t.dataset.dismiss==='1'),
  remAction:       t => remAction(t.dataset.id, t.dataset.remaction),
  testConn,
  saveSettings,
  saveConfig,
  setTheme:        t => setTheme(t.dataset.theme),
  signOut,
};
// View modules contribute their own handlers to the shared registry (§11.1).
Object.assign(CLICK_ACTIONS, todayActions, pantryActions, tripsActions);
const INPUT_ACTIONS = {
  tableFilter: t  => setTableFilter(t.dataset.col, t.value),
};
Object.assign(INPUT_ACTIONS, pantryInputs);
const CHANGE_ACTIONS = {
  pick:    (t,e) => onPick(e),
  reports: () => runReports(),
};
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
function ghHeaders(){ return { 'Authorization':'Bearer '+LS.token, 'Accept':'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' }; }
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
function oauthReady(){ return OAUTH.clientId && OAUTH.workerUrl; }
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
   CAPTURE
   ========================================================================= */
let pendingImg=null;
function renderCapture(){
  const recent=[...D.receipts].sort((a,b)=>(b.capturedAt||'').localeCompare(a.capturedAt||'')).slice(0,8);
  $('#main').innerHTML = `
  <div class="card">
    <h2>Snap a receipt</h2>
    <p class="small muted">Take a clear photo of the whole receipt. It saves to your private folder and is read automatically a minute or two later.</p>
    <input id="cap_file" type="file" accept="image/*" capture="environment" class="hidden" data-change="pick"/>
    <button data-action="pickFile">📷 Open camera / choose photo</button>
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

/* =========================================================================
   TABLE  (full sortable + filterable view of every item field)
   ========================================================================= */
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
function renderTable(){
  $('#main').innerHTML = `
  <div class="card">
    <div class="flex"><h2 style="margin:0">📑 All items</h2><div class="small muted" id="tcount"></div></div>
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

/* =========================================================================
   REPORTS
   ========================================================================= */
function monthStart(){ const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10); }
function inRange(date, from, to){ if(!date) return false; return date>=from && date<=to; }
function renderReports(){
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

  <div class="card"><h2>💙 HSA reimbursement</h2>
    <div class="kv"><span>Eligible spend in range</span><b>${money(hsaTotal)}</b></div>
    ${hsa.length?`<table><tr><th>Item</th><th>Date</th><th class="n">Price</th></tr>${hsa.map(i=>`<tr><td>${esc(i.name||i.rawName)}</td><td>${esc(i.purchasedAt||'')}</td><td class="n">${money(i.price)}</td></tr>`).join('')}</table>
      <p class="small muted" style="margin-top:8px">Keep these for your HSA records — receipt photos are saved in your data folder.</p>`:'<p class="muted small">No HSA-eligible items flagged in range.</p>'}
  </div>

  <div class="card"><h2>🗑 Waste</h2>
    <div class="kv"><span>Estimated money wasted</span><b>${money(wasteCost)}</b></div>
    <div class="kv"><span>Items thrown away</span><b>${waste.length}</b></div>
    ${waste.length?`<table><tr><th>Item</th><th>Date</th><th>Reason</th><th class="n">Cost</th></tr>${waste.map(w=>`<tr><td>${esc(w.name)}</td><td>${esc(w.thrownAt)}</td><td>${esc(w.reason)}</td><td class="n">${money(w.estCost)}</td></tr>`).join('')}</table>`:'<p class="muted small">Nothing wasted in range — nice.</p>'}
  </div>`;
}

/* =========================================================================
   REVIEW  (needs attention + freshness reminders)
   ========================================================================= */
function renderReview(){
  const open=D.needs.filter(n=>n.status==='open');
  const dueRem=D.reminders.filter(r=>r.status==='pending').sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||''));
  $('#main').innerHTML = `
  <div class="card">
    <h2>📋 Needs attention ${open.length?`<span class="pill warn">${open.length}</span>`:''}</h2>
    <p class="small muted">Things Claude couldn't read or wants you to confirm.</p>
    ${open.length? open.map(renderFlag).join('') : '<p class="muted small">All clear — nothing to review. 🎉</p>'}
  </div>
  <div class="card">
    <h2>🥦 Freshness reminders</h2>
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
  const o=el('div',{style:'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:60;display:flex;align-items:center;justify-content:center;padding:16px'});
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

/* =========================================================================
   SETTINGS
   ========================================================================= */
function renderSettings(){
  const cfg = D.config || {members:[]};
  $('#main').innerHTML = `
  <div class="card">
    <h2>This device</h2>
    <label>Your name</label>
    <select id="set_me">${['Me','Wife'].map(n=>`<option ${LS.me===n?'selected':''}>${n}</option>`).join('')}</select>
    <label>Device name</label>
    <input id="set_device" value="${esc(LS.device)}" placeholder="e.g. My iPhone" autocapitalize="words" autocorrect="off" spellcheck="false"/>
    <label>Data repository</label>
    <input id="set_repo" value="${esc(LS.repo)}" autocapitalize="off" autocorrect="off" spellcheck="false"/>
    <label>Access key (token)</label>
    <input id="set_token" type="password" value="${esc(LS.token)}" autocapitalize="off" autocorrect="off" spellcheck="false"/>
    <div class="row" style="margin-top:10px"><button class="sec" data-action="testConn">Test connection</button><button data-action="saveSettings">Save</button></div>
    <button class="link" style="color:var(--tomato-ink)" data-action="signOut">Sign out / forget key on this device</button>
  </div>
  <div class="card">
    <h2>Appearance</h2>
    <label>Theme</label>
    <div class="row" role="group" aria-label="Theme">
      ${['system','light','dark'].map(t=>`<button class="${LS.theme===t?'':'sec'}" aria-pressed="${LS.theme===t}" data-action="setTheme" data-theme="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}
    </div>
    <p class="small muted" style="margin:8px 0 0">System follows your phone's light/dark setting. Your choice is remembered on this device.</p>
  </div>
  <div class="card">
    <h2>📱💻 Using more than one device</h2>
    <p class="small muted"><b>Easiest:</b> on each device just open the app and tap <b>🔐 Sign in with GitHub</b> — no tokens to copy. You can stay signed in on your phone, computer, and tablet all at once.</p>
    <p class="small muted">Prefer the token route? You can — there's no central login server: each device keeps its <b>own</b> access key (token) in its own browser, and GitHub happily lets many keys work at once for the same account.</p>
    <p class="small muted"><b>To add another device:</b> on that device, create a <b>brand-new</b> token (GitHub → Settings → Developer settings → Fine-grained tokens → <i>Generate new token</i>, give it the <code>grocery-data</code> repo with Contents = Read &amp; write) and paste that one into its setup screen.</p>
    <p class="small muted"><b>The thing that kicks a device out:</b> pressing <i>Regenerate</i> on an existing token — that changes the key's value, so whatever device was using the old value stops working. Making a <i>new</i> token never affects your other devices. Give each device its own token and its own name above, and they'll all stay signed in.</p>
  </div>
  ${D.config? `<div class="card">
    <h2>Who gets notified (emails)</h2>
    <p class="small muted">Claude emails these people for reviews and freshness reminders. Saved in your shared config.</p>
    ${(cfg.members||[]).map((m,idx)=>`
      <label>${esc(m.name)} email</label>
      <input id="mem_${idx}" type="email" inputmode="email" value="${esc(m.email||'')}" placeholder="name@example.com" autocapitalize="off" autocorrect="off" spellcheck="false"/>
    `).join('')}
    <button style="margin-top:10px" data-action="saveConfig">Save emails</button>
  </div>`:''}
  <div class="card">
    <h2>How this works</h2>
    <p class="small muted">Snap receipts here → they save to your private folder → a robot reads each one automatically
    (a minute or two later), fills the database, and flags anything unclear for your Review tab. Setup for the
    automatic reader: <b>grocery-tool/automation/README.md</b> in your repo.</p>
  </div>`;
}
function testConn(){
  fetch(`${API}/repos/${$('#set_repo').value.trim()}`, {headers:{...ghHeaders(),'Authorization':'Bearer '+$('#set_token').value.trim()}})
    .then(r=>toast(r.ok?'Connection works ✓':'Failed: '+r.status));
}
function saveSettings(){ LS.me=$('#set_me').value; LS.device=$('#set_device').value.trim(); LS.repo=$('#set_repo').value.trim(); LS.token=$('#set_token').value.trim(); toast('Saved'); D={}; HEAD=null; for(const k in DB) delete DB[k]; show('settings'); }
async function saveConfig(){
  // Only the member emails this device actually CHANGED (input differs from the
  // value we loaded), applied onto FRESH config at commit time — so a concurrent
  // writer editing a different member isn't clobbered, and untouched fields keep
  // the fresh remote value rather than this device's stale snapshot.
  const changes = (D.config.members||[]).map((m,idx)=>{ const v=$('#mem_'+idx); if(!v) return null; const val=v.value.trim(); return val!==(m.email||'') ? val : null; });
  if(!changes.some(c=>c!==null)){ toast('No changes'); return; }
  await commitFiles([{path:FILES.config, op:'mutate', base:(D.config||{}), fn:(cfg)=>{
    cfg = cfg || {};
    if(Array.isArray(cfg.members)) changes.forEach((val,idx)=>{ if(val!==null && cfg.members[idx]) cfg.members[idx].email = val; });
    return cfg;
  }}], 'Update notification emails');
  toast('Emails saved');
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
export { D, FILES, commitFiles, show, updateBadges, groupKeyFor, groupLabel, getImageDataUrl, viewPhoto, getMe };
