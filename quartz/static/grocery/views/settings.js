/* =========================================================================
   views/settings.js — S? "Settings" screen (PRD §12).
   This device's identity + data-repo/token, appearance (theme), multi-device
   help, shared notification emails, and a "how this works" note. Reads the
   in-memory db (D) + this-browser state (LS); mutations go through the shared
   commitFiles / resetCaches primitives that live in app.js. Sibling of
   views/today.js under the §11.1 ES-module split.
   NOTE: signOut + setTheme are BOOT-critical and stay in app.js — they're
   imported here and merely re-exposed through settingsActions.
   ========================================================================= */
import { D, FILES, commitFiles, show, updateBadges, signOut, setTheme, LS, DB, API, ghHeaders, resetCaches } from '../app.js';
import { $, esc } from '../core/domain.js';
import { toast } from '../ui/components.js';

export function renderSettings(){
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
    <h2><svg class="mk-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-phone"></use></svg><svg class="mk-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-laptop"></use></svg> Using more than one device</h2>
    <p class="small muted"><b>Easiest:</b> on each device just open the app and tap <b><svg class="mk-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-lock"></use></svg> Sign in with GitHub</b> — no tokens to copy. You can stay signed in on your phone, computer, and tablet all at once.</p>
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
function saveSettings(){ LS.me=$('#set_me').value; LS.device=$('#set_device').value.trim(); LS.repo=$('#set_repo').value.trim(); LS.token=$('#set_token').value.trim(); toast('Saved'); resetCaches(); show('settings'); }
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

/* Click handlers this view contributes to the shared delegated registry (§11.1).
   signOut + setTheme are re-exposed but their impls stay in app.js (boot-critical). */
export const settingsActions = {
  testConn,
  saveSettings,
  saveConfig,
  signOut:  () => signOut(),
  setTheme: t => setTheme(t.dataset.theme),
};
