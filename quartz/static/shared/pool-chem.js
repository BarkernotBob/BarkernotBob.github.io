/* =========================================================================
   Pool Care — the chemistry: one copy, shared by the app and the email.
   -------------------------------------------------------------------------
   Imported by BOTH:
     - quartz/static/pool/index.html  (the app, in the browser)
     - quartz/static/pool/reminders.mjs (the daily email/RSS, under plain Node
       in the pool-data repo's GitHub Actions workflow)
   Before issue #142 each held its own ~200-line copy of this. The copies had
   already drifted: the email skipped the app's config upgrade, so a config
   missing a target range was judged differently on the two sides.

   RULES FOR THIS FILE
   - NO imports. reminders.mjs is fetched on its own with `curl`, so it loads
     this file as text (from beside it, or from the live site) and imports it
     through a data: URL. A data: URL module has no base to resolve a relative
     import against, so one here would break the email.
   - No DOM, no `window`, no Node APIs. It has to run in both places.
   - The config comes from the caller: `useConfig(() => cfg)`. The app passes
     a getter for its live config; the email passes the one it read from disk.
   tests/pool/parity.spec.js runs the email script and the app on the same
   record and fails if their advice text differs.
   ========================================================================= */

let getConfig = () => null;
/* Tell the chemistry where the current config lives. A getter rather than a
   value, because the app replaces its config object on every load. */
export function useConfig(fn){ getConfig = typeof fn==='function' ? fn : () => null; }
function cfgNow(){ return getConfig(); }

/* ---- The seven pads on Isaiah's test strip, in the order they read ----
   Total hardness · Total chlorine · Total bromine · Free chlorine · pH ·
   Total alkalinity · Cyanuric acid.  `strip:true` = it's on the strip, so it
   shows on the Strips form. Phosphates are NOT on the strip (Leslie's tests
   them) so they stay available in Numbers mode only.
   `advisory:true` = shown and stored, but never counted as "off target".
   `scale` = the values printed beside that pad's colour swatches on the strip
   bottle (issue #137). The Strips form offers exactly these, so a strip test
   saves real numbers. They're the built-in default: a config can override one
   (`config.stripScales[key]`, edited in Settings) if the strips change brand —
   always read them through stripScale(). */
export const READINGS = [
  {key:'ch',  name:'Total hardness',   numUnit:'ppm', numRange:[200,400], strip:true, scale:[0,100,250,500]},
  {key:'tc',  name:'Total chlorine',   numUnit:'ppm', numRange:[1,3],     strip:true, scale:[0,0.5,1,3,5,10]},
  {key:'br',  name:'Total bromine',    numUnit:'ppm', numRange:[2,4],     strip:true, scale:[0,1,2,6,10,20], advisory:true},
  {key:'fc',  name:'Free chlorine',    numUnit:'ppm', numRange:[1,3],     strip:true, scale:[0,0.5,1,3,5,10]},
  {key:'ph',  name:'pH',               numUnit:'',    numRange:[7.4,7.6], strip:true, scale:[6.2,6.8,7.2,7.8,8.4]},
  {key:'ta',  name:'Total alkalinity', numUnit:'ppm', numRange:[80,120],  strip:true, scale:[0,40,80,120,180,240]},
  {key:'cya', name:'Cyanuric acid',    numUnit:'ppm', numRange:[30,50],   strip:true, scale:[0,30,100,150,300]},
  {key:'po4', name:'Phosphates',       numUnit:'ppb', numRange:[0,100],   strip:false},
];
export const STRIP_READINGS = READINGS.filter(r=>r.strip);
/* A strip pad offers at most this many printed values — more won't fit a
   phone-width row of buttons. */
export const SCALE_MAX = 8;
/* Turn whatever a scale was stored as into a clean ascending list of distinct
   finite numbers, or null if it isn't a usable scale (fewer than two values,
   or too many to show). */
export function cleanScale(v){
  if(!Array.isArray(v)) return null;
  const all=v.map(x=>(x===null||(typeof x==='string'&&x.trim()===''))?NaN:Number(x));
  if(!all.every(Number.isFinite)) return null;
  const nums=[...new Set(all)].sort((a,b)=>a-b);
  return (nums.length>=2 && nums.length<=SCALE_MAX) ? nums : null;
}
/* The printed values for one strip pad: the config's override when it's a
   usable scale, else the built-in one. [] for a pad that isn't on the strip. */
export function stripScale(key, cfg=cfgNow()){
  const r=readingByKey(key); const built=(r && r.scale) ? r.scale.slice() : [];
  const o=cfg && cfg.stripScales && cfg.stripScales[key];
  return (o && cleanScale(o)) || built;
}
/* Half-way between two neighbouring printed values — for a pad whose colour
   lands between two swatches. pH is why this exists: its target (7.4–7.6)
   sits between the printed 7.2 and 7.8, so without it no strip pH could ever
   read as in range. */
export function scaleMid(a, b){ return Math.round((a+b)/2*100)/100; }
export const LEVELS = ['very low','low','normal','high','very high']; // index 0..4, normal=2
export function levelIdx(l){ return LEVELS.indexOf(l); }
export function severity(l){ const i=levelIdx(l); return i<0?null:Math.abs(i-2); } // 0 good,1,2
export function readingByKey(k){ return READINGS.find(r=>r.key===k); }
export function isAdvisory(k){ const r=readingByKey(k); return !!(r && r.advisory); }

/* ---- Chemicals catalog + which one each fix needs (for the inventory) ----
   The first six are what Isaiah actually keeps in the shed; the rest are here
   only so a fix he *can't* do today turns into a clear shopping note. */
export const CHEMS = {
  liquid_chlorine:   'Liquid chlorine (sodium hypochlorite)',
  cal_hypo:          'Cal-hypo granular chlorine (calcium hypochlorite)',
  trichlor_tabs:     '3" chlorinating tabs (trichlor, "Sanitize")',
  phosphate_remover: 'PR-10,000 phosphate remover concentrate',
  alkalinity_up:     'Alkalinity Up (sodium bicarbonate)',
  soda_ash:          'Soda ash / pH Up (sodium carbonate)',
  ph_down:           'pH Down (dry acid / sodium bisulfate)',
  muriatic_acid:     'Muriatic acid',
  cya:               'Stabilizer / conditioner (cyanuric acid)',
  calcium:           'Calcium chloride (hardness increaser)',
};
export const CHEM_KEYS = Object.keys(CHEMS);
// What Isaiah told us he has on hand — the default inventory for a fresh config.
export const CHEMS_DEFAULT_ON_HAND = {
  liquid_chlorine:true, cal_hypo:true, trichlor_tabs:true,
  phosphate_remover:true, alkalinity_up:true, soda_ash:true,
};
// Older configs used different keys for the same two products.
export const CHEM_ALIASES = { chlorine_granular:'cal_hypo', ph_up:'soda_ash' };
export function migrateChemKeys(onHand){
  const out={}; for(const k in (onHand||{})){ if(!onHand[k]) continue; out[CHEM_ALIASES[k]||k]=true; }
  return out;
}
// per reading + direction, acceptable chemicals (first = preferred). [] = no chemical fix.
export function neededChem(key, dir){
  const map = {
    fc:  { low:['liquid_chlorine','cal_hypo','trichlor_tabs'], high:[] },
    tc:  { low:['liquid_chlorine','cal_hypo','trichlor_tabs'], high:[] },
    br:  { low:[],                              high:[] },
    ph:  { low:['soda_ash'],                    high:['ph_down','muriatic_acid'] },
    ta:  { low:['alkalinity_up'],               high:['muriatic_acid','ph_down'] },
    cya: { low:['cya','trichlor_tabs'],         high:[] },
    ch:  { low:['calcium'],                     high:[] },
    po4: { low:['phosphate_remover'],           high:['phosphate_remover'] },
  };
  return (map[key]||{})[dir] || [];
}
export function chemsOnHand(){ return migrateChemKeys((cfgNow() && cfgNow().chemicals && cfgNow().chemicals.onHand) || {}); }
/* Target ranges live in config so they're editable, but the strip gained pads
   (total chlorine, bromine) after the first configs were written — so always
   read them through here and fall back to the built-in range. */
export function targetRange(key, cfg=cfgNow()){
  const r=readingByKey(key), t=cfg && cfg.targets && cfg.targets[key];
  const built = r ? r.numRange.slice() : [0,0];
  if(!t || !Array.isArray(t.range) || t.range.length!==2) return built;
  const [lo,hi]=t.range;
  // A stored value that isn't a finite number (blanked in Settings, or hand-
  // edited JSON) falls back to the built-in range instead of poisoning every
  // comparison against it with NaN/null.
  return (Number.isFinite(lo) && Number.isFinite(hi)) ? t.range : built;
}
export function ensureTarget(key, cfg=cfgNow()){
  if(!cfg.targets) cfg.targets={};
  if(!cfg.targets[key]) cfg.targets[key]={range:targetRange(key, cfg)};
  return cfg.targets[key];
}
/* Bring an older saved config up to date: new strip pads get target ranges,
   and the two renamed chemical keys become their new names. */
export function migrateConfig(cfg=cfgNow()){
  if(!cfg) return;
  READINGS.forEach(r=>ensureTarget(r.key, cfg));
  // An empty onHand means "I'm out of everything", which is a real answer —
  // only a config that never had the key at all gets the starting inventory.
  const had = !!(cfg.chemicals && cfg.chemicals.onHand);
  const on = migrateChemKeys((cfg.chemicals&&cfg.chemicals.onHand)||{});
  cfg.chemicals={ onHand: had?on:{...CHEMS_DEFAULT_ON_HAND} };
}
export function hasChem(k){ return !!chemsOnHand()[k]; }
// Given a list of acceptable chemicals, decide whether the user can act now.
export function chemPlan(chemArr){
  if(!chemArr || !chemArr.length) return null; // no chemical needed (e.g. drain/dilute/wait)
  const have = chemsOnHand();
  const owned = chemArr.find(c=>have[c]);
  return owned ? {have:true, use:owned} : {have:false, buy:chemArr[0]};
}

/* Which chlorine to reach for, given what's on hand and the latest hardness.
   Cal-hypo adds calcium (bad when hardness is already high); liquid adds none.
   Tabs are the last resort because they push CYA up and pH down. */
export function chlorineChoice(ctx){
  const hardHigh = ctx && ctx.dirOf && ctx.dirOf('ch')==='high';
  const hardLow  = ctx && ctx.dirOf && ctx.dirOf('ch')==='low';
  if(hardHigh && hasChem('liquid_chlorine'))
    return {key:'liquid_chlorine', why:'your hardness is already high, so use liquid — cal-hypo would add more calcium'};
  if(hardLow && hasChem('cal_hypo'))
    return {key:'cal_hypo', why:'cal-hypo also nudges your low hardness up'};
  if(hasChem('cal_hypo'))   return {key:'cal_hypo', why:''};
  if(hasChem('liquid_chlorine')) return {key:'liquid_chlorine', why:''};
  if(hasChem('trichlor_tabs'))   return {key:'trichlor_tabs', why:'tabs are slow — they also raise CYA and lower pH'};
  return null;
}
// Dose sentence for one "step" of chlorine, in whichever product we picked.
// Doses are for ~10,000 gal and scale with your volume.
// Assumes 73% cal-hypo granular and 12.5% liquid chlorine — check your labels.
export function chlorineDose(strength, gallons, ctx){
  const f=(gallons||10000)/10000, pick=chlorineChoice(ctx);
  if(!pick) return 'You have no chlorine on hand — pick some up before dosing.';
  const dbl = strength==='shock';
  if(pick.key==='cal_hypo'){
    const cups = dbl?1:0.5;
    return `Add ${cups===1?'1 cup':'½ cup'} cal-hypo granular${f!==1?` ×${f.toFixed(1)} for your volume`:''} — mixed into a half-full 5-gal bucket of water, then poured by the pump return${pick.why?` (${pick.why})`:''}.`;
  }
  if(pick.key==='liquid_chlorine'){
    const qt = dbl?2:1;
    return `Add about ${qt===2?'2 quarts':'1 quart'} liquid chlorine (sodium hypochlorite)${f!==1?` ×${f.toFixed(1)} for your volume`:''} — pour it slowly around the pool with the pump running${pick.why?` (${pick.why})`:''}.`;
  }
  return `Load your 3" tabs into the floater/chlorinator${pick.why?` (${pick.why})`:''}. Tabs dissolve slowly, so for a fast correction you want liquid or cal-hypo instead.`;
}

/* Qualitative level -> recommended action, per reading. {tone, text}
   ctx (optional) carries the rest of the test so readings can talk to each other. */
// Only a SHOCK dose burns chloramines out. If the free-chlorine card is already
// prescribing one, the total-chlorine card points at it instead of telling you
// to pour twice — but a routine top-up doesn't count, so a ½-cup dose never
// gets mistaken for the shock the chloramines actually need.
export function fcShockAlreadyDosed(ctx){
  if(!ctx) return false;
  const n = ctx.nums && ctx.nums.fc!=null && ctx.nums.fc!=='' ? Number(ctx.nums.fc) : null;
  if(n!=null) return n<0.5;
  return (ctx.levels && ctx.levels.fc)==='very low';
}
// A routine low-chlorine dose does cover a merely-low total chlorine, though.
export function fcAlreadyDosed(ctx){ return !!(ctx && ctx.dirOf && ctx.dirOf('fc')==='low'); }
export function recForLevel(key, level, ctx){
  const sev = severity(level);
  const gal = (cfgNow() && cfgNow().pool && cfgNow().pool.gallons) || 10000;
  if(key==='br') return {tone:'ok', text:'You run a chlorine pool, not bromine — this pad is the same chemistry read on the bromine scale. Nothing to do with it; go by the chlorine pads.'};
  if(key==='tc'){
    const fcL = ctx && ctx.levels && ctx.levels.fc;
    if(fcL && levelIdx(level) > levelIdx(fcL))
      return {tone:'warn', text:'Total chlorine reads higher than free chlorine — that gap is combined chlorine (chloramines: the "pool smell", stinging eyes). '+(fcShockAlreadyDosed(ctx)?'The shock dose under free chlorine clears this too — one dose, not two.':'Shock it: '+chlorineDose('shock', gal, ctx)+' Run the pump and re-test in a few hours.')};
    if(sev===0) return {tone:'ok', text:'In range, and it matches your free chlorine — no chloramines to burn off.'};
    return levelIdx(level)<2
      ? {tone:'warn', text:fcAlreadyDosed(ctx) ? 'Total chlorine low for the same reason free chlorine is — the dose above covers both.' : 'Total chlorine low. '+chlorineDose('normal', gal, ctx)+' Re-test tomorrow.'}
      : {tone:'warn', text:'Total chlorine high. Hold off on chlorine and let it drift down before the next dose.'};
  }
  if(sev===0) return {tone:'ok', text:'In range — nothing to do.'};
  const i = levelIdx(level), low = i<2, vv = (i===0||i===4);
  switch(key){
    case 'fc':
      return low
        ? (vv ? {tone:'danger', text:'Chlorine very low. SHOCK: '+chlorineDose('shock', gal, ctx)+' Keep swimmers out until it reads normal, and re-test in a few hours.'}
              : {tone:'warn',   text:'Chlorine low. '+chlorineDose('normal', gal, ctx)+' Re-test tomorrow.'})
        : (vv ? {tone:'danger', text:'Chlorine very high. Do NOT add more — pull any tabs out of the floater. Keep swimmers out until it drops to normal; partial fresh-water dilution speeds it up.'}
              : {tone:'warn',   text:'Chlorine high. Hold off adding chlorine (and pull the tabs) until it drifts back down.'});
    case 'ph':
      return low
        ? {tone:'warn', text:'pH low (acidic). Add your soda ash (pH Up) per the label for ~'+gal.toLocaleString()+' gal, then re-test. Low pH stings eyes and corrodes metal. If you\'ve been running tabs, they\'re part of the reason — tabs are acidic.'}
        : (vv ? {tone:'danger', text:'pH very high. This needs acid — pH Down (dry acid) or muriatic acid — which you don\'t keep on hand. Meanwhile switch dosing to your 3" tabs (they\'re acidic and will pull pH down slowly) and stop adding soda ash. High pH makes chlorine sluggish.'}
              : {tone:'warn',   text:'pH high. You have no acid on hand — dose with your 3" tabs instead of cal-hypo for a while (tabs lower pH), skip the soda ash, and re-test. To fix it properly, pick up pH Down.'});
    case 'ta':
      return low
        ? {tone:'warn', text:'Alkalinity low. Add your Alkalinity Up (sodium bicarbonate) — about 1.5 lb raises ~10 ppm in 10,000 gal. Low alkalinity makes pH bounce around, so fix this before chasing pH.'}
        : {tone:'warn', text:'Alkalinity high. Lowering it takes acid (muriatic or dry acid), which you don\'t stock. Until then, stop adding Alkalinity Up, favour your 3" tabs over cal-hypo, and aerate (run the return upward) — it will drift down slowly.'};
    case 'cya':
      return low
        ? {tone:'warn', text:'Stabilizer (CYA) low — sunlight burns your chlorine off fast. You don\'t stock straight conditioner, but your 3" tabs raise CYA as they dissolve: run tabs in the floater for a couple of weeks and re-test. For a fast fix, buy stabilizer/conditioner.'}
        : {tone:'danger', text:'Stabilizer (CYA) high — nothing lowers it chemically. Take the 3" tabs OUT of the floater (they\'re what raises it), switch to liquid or cal-hypo, partially drain (~⅓) and refill, then re-test.'};
    case 'ch':
      return low
        ? {tone:'warn', text:'Total hardness low. Soft water etches plaster, grout and stone. Dose with your cal-hypo rather than liquid (cal-hypo adds calcium) — and for a real fix, calcium chloride hardness increaser.'}
        : {tone:'warn', text:'Total hardness high. Switch your chlorine to liquid (sodium hypochlorite) — your cal-hypo is what keeps adding calcium. Dilute with fresh water and watch for scale.'};
    case 'po4':
      return low
        ? {tone:'ok', text:'Phosphates fine. Keep your every-2-weeks 1 oz PR-10,000 maintenance dose.'}
        : (vv ? {tone:'danger', text:'Phosphates very high (algae food). Dose PR-10,000 per label for a heavy correction, run the filter, then re-test. Resume the 1 oz biweekly routine after.'}
              : {tone:'warn',   text:'Phosphates high. Add a corrective dose of PR-10,000 per label, then return to 1 oz every 2 weeks.'});
  }
  return {tone:'warn', text:'Off target — adjust and re-test.'};
}

/* Numeric value -> simple dose estimate for 10,000 gal (editable volume). */
export function recForNumber(key, val, gallons, ctx){
  const r = readingByKey(key); const [lo,hi]=r.numRange; const g=gallons||10000;
  const f = g/10000; // scale factor vs 10k gal
  if(key==='br') return {tone:'ok', text:'You run a chlorine pool, not bromine — this pad is the same chemistry read on the bromine scale. Nothing to do with it; go by the chlorine pads.'};
  if(key==='tc'){
    const fcN = ctx && ctx.nums && ctx.nums.fc!=null && ctx.nums.fc!=='' ? Number(ctx.nums.fc) : null;
    if(fcN!=null){
      const cc = Math.round((val - fcN)*100)/100;
      if(cc>0.5) return {tone:cc>1?'danger':'warn', text:`Combined chlorine is ${cc} ppm (total ${val} − free ${fcN}). Anything over 0.5 ppm is chloramines — the "pool smell" that stings eyes. `+(fcShockAlreadyDosed(ctx)?'The shock dose under free chlorine clears this too — one dose, not two.':`Shock it: ${chlorineDose('shock', g, ctx)} Run the pump and re-test in a few hours.`)};
      if(val>=lo && val<=hi) return {tone:'ok', text:`In range, and combined chlorine is only ${cc<0?0:cc} ppm — nothing to burn off.`};
    }
    if(val>=lo && val<=hi) return {tone:'ok', text:`In range (${lo}–${hi} ppm). Enter free chlorine too and the app will work out your combined chlorine.`};
    return val<lo ? {tone:'warn', text:fcAlreadyDosed(ctx) ? `Total chlorine below ${lo} ppm for the same reason free chlorine is — the dose above covers both.` : `Total chlorine below ${lo} ppm. `+chlorineDose('normal', g, ctx)+' Re-test in a few hours.'}
                  : {tone:'warn', text:`Total chlorine above ${hi} ppm — skip your next dose and let it fall back.`};
  }
  if(val>=lo && val<=hi) return {tone:'ok', text:`In range (${lo}–${hi} ${r.numUnit}). Nothing to do.`};
  switch(key){
    case 'fc':{
      if(val<lo) return {tone:val<0.5?'danger':'warn', text:chlorineDose(val<0.5?'shock':'normal', g, ctx)+' Re-test in a few hours.'};
      return {tone:'warn', text:`Above ${hi} ppm — skip chlorine and pull the tabs until it falls back into ${lo}–${hi} ppm.`};
    }
    case 'ph':
      return val<lo ? {tone:'warn', text:`Below ${lo} — add your soda ash (pH Up) per label and re-test.`}
                    : {tone:'warn', text:`Above ${hi} — this needs acid, which you don't stock. Dose with 3" tabs instead of cal-hypo (tabs are acidic), skip the soda ash, and buy pH Down for a proper fix.`};
    case 'ta':{
      if(val<lo){ const lbs=(((lo+hi)/2 - val)/10*1.5*f); return {tone:'warn', text:`Add ~${lbs.toFixed(1)} lb Alkalinity Up (sodium bicarbonate) to bring alkalinity toward ${(lo+hi)/2} ppm, then re-test.`}; }
      return {tone:'warn', text:`Above ${hi} ppm — lowering it needs acid, which you don\'t stock. Stop adding Alkalinity Up, favour tabs over cal-hypo, and aerate; it drifts down slowly.`};
    }
    case 'cya':{
      if(val<lo) return {tone:'warn', text:`Below ${lo} ppm — your 3" tabs raise CYA as they dissolve, so run tabs in the floater for a couple of weeks and re-test. For a quick fix, buy stabilizer/conditioner.`};
      return {tone:'danger', text:`Above ${hi} ppm — no chemical lowers CYA. Pull the 3" tabs out, switch to liquid or cal-hypo, partially drain & refill, then re-test.`};
    }
    case 'ch':
      return val<lo ? {tone:'warn', text:`Below ${lo} ppm — dose with cal-hypo rather than liquid (it adds calcium); a calcium chloride hardness increaser is the real fix.`}
                    : {tone:'warn', text:`Above ${hi} ppm — switch your chlorine to liquid (sodium hypochlorite) and dilute with fresh water; your cal-hypo keeps adding calcium.`};
    case 'po4':
      return {tone:val>250?'danger':'warn', text:`Phosphates above ~${hi} ppb — dose PR-10,000 per label, filter, then resume 1 oz every 2 weeks.`};
  }
  return {tone:'warn', text:'Out of range — adjust and re-test.'};
}


/* Build per-reading recommendation list from a test record.
   ctx lets one reading see the others (total vs. free chlorine, and which
   chlorine to reach for given the hardness reading). */
export function testCtx(t){
  const levels=t.levels||{}, nums=t.nums||{};
  return { levels, nums, dirOf(key){
    const r=readingByKey(key); if(!r) return null;
    const n = nums[key]!=null && nums[key]!=='' ? Number(nums[key]) : null;
    if(n!=null){ const [lo,hi]=r.numRange; return n<lo?'low':(n>hi?'high':null); }
    const q = levels[key]; if(!q) return null;
    const i = levelIdx(q); return i<2?'low':(i>2?'high':null);
  }};
}
export function testRecs(t){
  const ctx=testCtx(t);
  return READINGS.map(r=>{
    const q = t.levels && t.levels[r.key];
    const n = t.nums && (t.nums[r.key]!=null && t.nums[r.key]!=='') ? Number(t.nums[r.key]) : null;
    let dir=null, rec, display;
    if(n!=null){ const [lo,hi]=r.numRange; dir = n<lo?'low':(n>hi?'high':null); rec=recForNumber(r.key, n, cfgNow() && cfgNow().pool && cfgNow().pool.gallons, ctx); display=n+(r.numUnit?(' '+r.numUnit):''); }
    else if(q){ const i=levelIdx(q); dir = i<2?'low':(i>2?'high':null); rec=recForLevel(r.key, q, ctx); display=q; }
    else return null;
    // Bromine is informational on a chlorine pool: never treat it as off target.
    if(r.advisory){ dir=null; }
    let chem = dir?neededChem(r.key,dir):[];
    // The chlorine advice picks a product by hardness; lead the chemical list
    // with that same one, or the "using your…" note names a different bottle
    // than the dose sentence just told you to pour.
    if(dir==='low' && (r.key==='fc'||r.key==='tc')){
      const pick=chlorineChoice(ctx);
      if(pick && chem.includes(pick.key)) chem=[pick.key, ...chem.filter(k=>k!==pick.key)];
    }
    return {key:r.key, name:r.name, display, rec, dir, chem};
  }).filter(Boolean);
}

/* The order the app shows the reading cards in: balance alkalinity and pH
   before chasing chlorine. The advice text leans on it ("the dose above"),
   so the email lists readings in this order too. */
export const BALANCE_ORDER=['ta','ph','fc','tc','cya','ch','br','po4'];
/* The readings that need attention, in card order: exactly the advice the app
   shows for this test, minus the in-range ones. The email uses this. */
export function offTargetAdvice(t){
  if(!t) return [];
  return testRecs(t).filter(r=>r.rec.tone!=='ok')
    .sort((a,b)=>BALANCE_ORDER.indexOf(a.key)-BALANCE_ORDER.indexOf(b.key));
}
/* Apply a config's saved target ranges to READINGS, falling back to the
   built-in range for a missing or non-numeric one (see targetRange). */
export function applyTargets(cfg=cfgNow()){
  READINGS.forEach(r=>{ r.numRange=targetRange(r.key, cfg); });
}
