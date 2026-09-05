/* =========================================================================
   Pool Care — reminder + RSS generator (runs in GitHub Actions)
   -------------------------------------------------------------------------
   This is the "push" side of the Pool Care app. The app shows what's due when
   you open it; this script runs on a daily schedule, reads the SAME data files
   from your private `pool-data` repo, applies the SAME season + cadence rules,
   and produces:
     - out/email_subject.txt / out/email_body.html  -> the reminder email
     - out/pool.xml                                  -> the RSS feed
     - db/feed-state.json                            -> remembered feed history
   It writes nothing back to your config/tests, so it never marks a task "done";
   you still do that in the app. Hosted publicly (no secrets here) so the
   workflow can curl the latest copy each run.
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';

const TZ = 'America/Indiana/Indianapolis'; // Fort Wayne — match the phone's local day
const APP_URL = 'https://barkernotbob.github.io/static/pool/';
const FEED_URL = 'https://barkernotbob.github.io/feeds/pool.xml';

/* ---------- date helpers (mirror the app) ---------- */
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
function addDaysISO(iso, n){ const d=new Date(iso+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
function daysBetween(a,b){ return Math.round((new Date(b+'T12:00:00Z') - new Date(a+'T12:00:00Z'))/86400000); }
const mmdd = iso => (iso||todayISO()).slice(5,10);
function addMonthDay(md, days){ const d=new Date('2024-'+md+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(5,10); }
const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function fmtDate(iso){ try{ return new Date(iso+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}); }catch{ return iso; } }

/* ---------- chemistry tables (mirror the app) ---------- */
/* ---- The seven pads on Isaiah's test strip, in the order they read ----
   Total hardness · Total chlorine · Total bromine · Free chlorine · pH ·
   Total alkalinity · Cyanuric acid.  `strip:true` = it's on the strip, so it
   shows on the Strips form. Phosphates are NOT on the strip (Leslie's tests
   them) so they stay available in Numbers mode only.
   `advisory:true` = shown and stored, but never counted as "off target". */
const READINGS = [
  {key:'ch',  name:'Total hardness',   numUnit:'ppm', numRange:[200,400], strip:true},
  {key:'tc',  name:'Total chlorine',   numUnit:'ppm', numRange:[1,3],     strip:true},
  {key:'br',  name:'Total bromine',    numUnit:'ppm', numRange:[2,4],     strip:true, advisory:true},
  {key:'fc',  name:'Free chlorine',    numUnit:'ppm', numRange:[1,3],     strip:true},
  {key:'ph',  name:'pH',               numUnit:'',    numRange:[7.4,7.6], strip:true},
  {key:'ta',  name:'Total alkalinity', numUnit:'ppm', numRange:[80,120],  strip:true},
  {key:'cya', name:'Cyanuric acid',    numUnit:'ppm', numRange:[30,50],   strip:true},
  {key:'po4', name:'Phosphates',       numUnit:'ppb', numRange:[0,100],   strip:false},
];
const STRIP_READINGS = READINGS.filter(r=>r.strip);
const LEVELS = ['very low','low','normal','high','very high']; // index 0..4, normal=2
function levelIdx(l){ return LEVELS.indexOf(l); }
function severity(l){ const i=levelIdx(l); return i<0?null:Math.abs(i-2); } // 0 good,1,2
function readingByKey(k){ return READINGS.find(r=>r.key===k); }
function isAdvisory(k){ const r=readingByKey(k); return !!(r && r.advisory); }

/* ---- Chemicals catalog + which one each fix needs (for the inventory) ----
   The first six are what Isaiah actually keeps in the shed; the rest are here
   only so a fix he *can't* do today turns into a clear shopping note. */
const CHEMS = {
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
const CHEM_KEYS = Object.keys(CHEMS);
// What Isaiah told us he has on hand — the default inventory for a fresh config.
const CHEMS_DEFAULT_ON_HAND = {
  liquid_chlorine:true, cal_hypo:true, trichlor_tabs:true,
  phosphate_remover:true, alkalinity_up:true, soda_ash:true,
};
// Older configs used different keys for the same two products.
const CHEM_ALIASES = { chlorine_granular:'cal_hypo', ph_up:'soda_ash' };
function migrateChemKeys(onHand){
  const out={}; for(const k in (onHand||{})){ if(!onHand[k]) continue; out[CHEM_ALIASES[k]||k]=true; }
  return out;
}
// per reading + direction, acceptable chemicals (first = preferred). [] = no chemical fix.
function neededChem(key, dir){
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
function chemsOnHand(){ return migrateChemKeys((config && config.chemicals && config.chemicals.onHand) || {}); }
function hasChem(k){ return !!chemsOnHand()[k]; }
// Given a list of acceptable chemicals, decide whether the user can act now.
function chemPlan(chemArr){
  if(!chemArr || !chemArr.length) return null; // no chemical needed (e.g. drain/dilute/wait)
  const have = chemsOnHand();
  const owned = chemArr.find(c=>have[c]);
  return owned ? {have:true, use:owned} : {have:false, buy:chemArr[0]};
}

/* Which chlorine to reach for, given what's on hand and the latest hardness.
   Cal-hypo adds calcium (bad when hardness is already high); liquid adds none.
   Tabs are the last resort because they push CYA up and pH down. */
function chlorineChoice(ctx){
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
function chlorineDose(strength, gallons, ctx){
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
function fcShockAlreadyDosed(ctx){
  if(!ctx) return false;
  const n = ctx.nums && ctx.nums.fc!=null && ctx.nums.fc!=='' ? Number(ctx.nums.fc) : null;
  if(n!=null) return n<0.5;
  return (ctx.levels && ctx.levels.fc)==='very low';
}
// A routine low-chlorine dose does cover a merely-low total chlorine, though.
function fcAlreadyDosed(ctx){ return !!(ctx && ctx.dirOf && ctx.dirOf('fc')==='low'); }
function recForLevel(key, level, ctx){
  const sev = severity(level);
  const gal = (config && config.pool && config.pool.gallons) || 10000;
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
function recForNumber(key, val, gallons, ctx){
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

/* ---------- load data ---------- */
const readJson = (p, dflt) => { try{ return JSON.parse(readFileSync(p,'utf8')); }catch{ return dflt; } };
const config = readJson('db/config.json', null);
if(!config){ console.error('No db/config.json found — has the app been opened/signed-in yet?'); process.exit(0); }
// A config written before the chemicals list existed has no inventory at all.
// The app fills that in from the starting shed on load; do the same here, or
// the email says "you have no chlorine on hand" while the app doses happily.
if(!(config.chemicals && config.chemicals.onHand)) config.chemicals={ onHand:{...CHEMS_DEFAULT_ON_HAND} };
// The app lets you edit target ranges in Settings; apply them here too, or the
// email judges readings against the built-in defaults and disagrees with it.
READINGS.forEach(r=>{ const t=config.targets && config.targets[r.key];
  if(t && Array.isArray(t.range) && t.range.length===2) r.numRange=t.range; });
const tests  = readJson('db/tests.json', []);
let   state  = readJson('db/feed-state.json', []);
if(!Array.isArray(state)) state = [];

/* ---------- season + cadence (mirror the app) ---------- */
const S = config.season || {};
const inSeason = (d) => { const md=mmdd(d); return md>=S.open && md<=S.close; };
const inPeak   = (d) => { const md=mmdd(d); return md>=S.peakStart && md<=S.peakEnd; };
function cadenceDays(task){
  if(task.cadence==='weekly') return 7;
  if(task.cadence==='biweekly') return 14;
  if(task.cadence==='monthly') return 30;
  if(task.cadence==='pump') return inPeak()?1:4;
  return 7;
}
function taskDue(task){
  if(task.season==='in' && !inSeason()) return {state:'offseason'};
  const days = cadenceDays(task);
  if(!task.last) return {state:'due', overdueBy:0, next:todayISO()};
  const next = addDaysISO(task.last, days);
  const od = daysBetween(next, todayISO());
  return od>=0 ? {state:'due', overdueBy:od, next} : {state:'ok', next};
}
const dueTasks = () => (config.tasks||[]).map(t=>({t, d:taskDue(t)})).filter(x=>x.d.state==='due');
function seasonalPrompt(){
  const md=mmdd();
  if(md < S.open  && md >= addMonthDay(S.open,-21))  return {kind:'open',  when:S.open};
  if(md <= S.close && md >= addMonthDay(S.close,-21)) return {kind:'close', when:S.close};
  return null;
}

/* ---------- latest test advice ---------- */
function latestTest(){ return (tests||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0]||null; }
function testAdvice(t){
  if(!t) return [];
  const out=[]; const gal=(config.pool&&config.pool.gallons)||10000;
  // ctx lets total-vs-free chlorine and the hardness-aware chlorine pick work,
  // exactly as they do in the app.
  const ctx={ levels:t.levels||{}, nums:t.nums||{}, dirOf(key){
    const m=readingByKey(key); if(!m) return null;
    const n=(t.nums||{})[key]; if(n!=null && n!==''){ const [lo,hi]=m.numRange; return n<lo?'low':(n>hi?'high':null); }
    const q=(t.levels||{})[key]; if(!q) return null;
    const i=levelIdx(q); return i<2?'low':(i>2?'high':null);
  }};
  if(t.mode==='num'){
    for(const k in (t.nums||{})){ if(isAdvisory(k)) continue; const m=READINGS.find(x=>x.key===k); if(!m) continue;
      const r=recForNumber(k,t.nums[k],gal,ctx); if(r.tone!=='ok') out.push({name:m.name, display:`${t.nums[k]} ${m.numUnit}`.trim(), ...r}); }
  } else {
    for(const k in (t.levels||{})){ if(isAdvisory(k)) continue; const m=READINGS.find(x=>x.key===k); if(!m) continue;
      const r=recForLevel(k,t.levels[k],ctx); if(r.tone!=='ok') out.push({name:m.name, display:t.levels[k], ...r}); }
  }
  return out;
}

/* ---------- assemble today's "events" ---------- */
const due  = dueTasks();
const sp   = seasonalPrompt();
const lt   = latestTest();
const adv  = testAdvice(lt);
const today = todayISO();
const year  = today.slice(0,4);

/* ---------- daily weather: rain, temperature, humidity (Open-Meteo, no key, no AI) ---------- */
async function getWeatherData(){
  const g = (config.geo && config.geo.lat!=null && config.geo.lon!=null) ? config.geo : {lat:41.0793, lon:-85.1394};
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}`
            + `&hourly=relative_humidity_2m`
            + `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min`
            + `&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto&past_days=10&forecast_days=1`;
  try{
    const r = await fetch(url);
    if(!r.ok){ console.error('[weather] HTTP '+r.status); return null; }
    const j = await r.json();
    const dt=j.daily.time, dp=j.daily.precipitation_sum, dmax=j.daily.temperature_2m_max, dmin=j.daily.temperature_2m_min;
    const rhByDay={};
    (j.hourly?.time||[]).forEach((ts,i)=>{ const d=ts.slice(0,10); (rhByDay[d]=rhByDay[d]||[]).push(j.hourly.relative_humidity_2m[i]); });
    return dt.map((d,i)=>({ date:d, in: dp[i]==null?0:Number(dp[i]), tmax:dmax[i], tmin:dmin[i],
      rhAvg: rhByDay[d]&&rhByDay[d].length ? Math.round(rhByDay[d].reduce((a,b)=>a+b,0)/rhByDay[d].length) : null }));
  }catch(e){ console.error('[weather] fetch failed:', e.message); return null; }
}
const wxDays = await getWeatherData();
let wxLog = readJson('db/weather.json', []); if(!Array.isArray(wxLog)) wxLog=[];
let wxChanged=false, rainSummary=null, rainAlert=null;
if(wxDays){
  const byDate = new Map(wxLog.map(x=>[x.date,x]));
  for(const d of wxDays){ const prev=byDate.get(d.date); if(!prev || prev.in!==d.in || prev.tmax!==d.tmax || prev.rhAvg!==d.rhAvg){ byDate.set(d.date, d); wxChanged=true; } }
  wxLog = [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-120);
  const yIso = addDaysISO(today,-1);
  const yRow = wxDays.find(x=>x.date===yIso) || {};
  const tRow = wxDays.find(x=>x.date===today) || {};
  const last7 = wxDays.filter(x=>x.date>addDaysISO(today,-8) && x.date<=today).reduce((s,x)=>s+(x.in||0),0);
  rainSummary = { yest: yRow.in||0, last7, tmax: tRow.tmax, tmin: tRow.tmin, rhAvg: tRow.rhAvg };
  // a notable wet day in the last 2 days is worth flagging (dilutes chlorine/CYA, washes in phosphates)
  const recent = wxDays.filter(x=>x.date>=addDaysISO(today,-2) && x.date<=today);
  const peak = recent.reduce((m,x)=>Math.max(m, x.in||0), 0);
  const peakDay = recent.find(x=>(x.in||0)===peak);
  if(peak>=0.5 && peakDay) rainAlert = { date:peakDay.date, in:peak };
}

const events = [];
for(const {t,d} of due){
  events.push({
    guid: `pool-task-${t.id}-${d.next}`,
    title: `Pool: ${t.title}`,
    body: t.detail || 'Due today.',
    overdueBy: d.overdueBy||0,
  });
}
if(sp){
  events.push({
    guid: `pool-season-${sp.kind}-${year}-${sp.when}`,
    title: sp.kind==='open' ? 'Pool: spring opening is coming up' : 'Pool: fall closing is coming up',
    body: sp.kind==='open'
      ? `Season opens around ${sp.when}. Time to plan opening: clean the cover, top up water, balance, and shock.`
      : `Season closes around ${sp.when}. Plan closing before the leaves drop: 6 oz phosphate remover, 2 doses chlorine, cover.`,
    overdueBy: 0,
  });
}
if(adv.length && lt){
  events.push({
    guid: `pool-test-${lt.id}`,
    title: `Pool: ${adv.length} reading${adv.length>1?'s':''} need attention (test ${lt.date})`,
    body: adv.map(a=>`${a.name} (${a.display}): ${a.text}`).join('  •  '),
    overdueBy: 0,
  });
}
if(rainAlert){
  events.push({
    guid: `pool-rain-${rainAlert.date}`,
    title: `Pool: heavy rain ${rainAlert.date} (${rainAlert.in.toFixed(2)} in)`,
    body: `Notable rainfall can dilute chlorine and stabilizer (CYA) and wash in phosphates. Test the water and rebalance if needed.`,
    overdueBy: 0,
  });
}

const hasDue = events.length > 0;

/* ---------- update feed state (dedupe by guid, keep newest 50) ---------- */
const nowRfc = new Date().toUTCString();
const known = new Set(state.map(i=>i.guid));
let stateChanged = false;
for(const e of events){
  if(!known.has(e.guid)){
    state.unshift({ guid:e.guid, title:e.title, body:e.body, date:today, pubDate:nowRfc });
    known.add(e.guid); stateChanged = true;
  }
}
state = state.slice(0,50);

/* ---------- render RSS ---------- */
const items = state.map(i => `    <item>
      <title>${esc(i.title)}</title>
      <description>${esc(i.body)}</description>
      <link>${esc(APP_URL)}</link>
      <guid isPermaLink="false">${esc(i.guid)}</guid>
      <pubDate>${esc(i.pubDate)}</pubDate>
    </item>`).join('\n');
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Pool Care reminders</title>
    <link>${esc(APP_URL)}</link>
    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${esc(FEED_URL)}" rel="self" type="application/rss+xml"/>
    <description>What's due for the pool — tasks, seasonal open/close, and test advice.</description>
    <lastBuildDate>${esc(nowRfc)}</lastBuildDate>
${items}
  </channel>
</rss>
`;

/* ---------- render email ---------- */
const toneColor = { ok:'#2e7d32', warn:'#b26a00', danger:'#c62828' };
function emailHtml(){
  const rows = [];
  if(due.length){
    rows.push(`<h3 style="margin:18px 0 6px">📋 Due now</h3>`);
    rows.push('<ul style="margin:0;padding-left:18px">');
    for(const {t,d} of due){
      const od = d.overdueBy>0 ? ` <span style="color:#c62828">(${d.overdueBy} day${d.overdueBy>1?'s':''} overdue)</span>` : '';
      rows.push(`<li style="margin:6px 0"><b>${esc(t.title)}</b>${od}<br><span style="color:#555;font-size:14px">${esc(t.detail||'')}</span></li>`);
    }
    rows.push('</ul>');
  }
  if(sp){
    rows.push(`<h3 style="margin:18px 0 6px">🗓️ Season</h3>`);
    rows.push(`<p style="margin:0;color:#333">${esc(sp.kind==='open'
      ? `Spring opening is coming up (~${sp.when}). Plan: clean cover, top up water, balance alkalinity→pH→chlorine, then shock.`
      : `Fall closing is coming up (~${sp.when}). Plan: 6 oz phosphate remover, 2 doses chlorine, run pump, cover before leaves drop.`)}</p>`);
  }
  if(adv.length && lt){
    rows.push(`<h3 style="margin:18px 0 6px">🧪 From your last test (${esc(fmtDate(lt.date))})</h3>`);
    for(const a of adv){
      rows.push(`<div style="border-left:4px solid ${toneColor[a.tone]||'#888'};padding:4px 0 4px 10px;margin:8px 0">
        <b>${esc(a.name)} — ${esc(a.display)}</b><br><span style="color:#444;font-size:14px">${esc(a.text)}</span></div>`);
    }
  }
  if(rainSummary){
    rows.push(`<h3 style="margin:18px 0 6px">🌦️ Weather</h3>`);
    const temp = rainSummary.tmax!=null ? `${Math.round(rainSummary.tmax)}°/${rainSummary.tmin!=null?Math.round(rainSummary.tmin):'–'}°F` : '—';
    const rh = rainSummary.rhAvg!=null ? `${rainSummary.rhAvg}%` : '—';
    rows.push(`<p style="margin:0;color:#333">Rain — yesterday <b>${rainSummary.yest.toFixed(2)} in</b>, last 7 days <b>${rainSummary.last7.toFixed(2)} in</b>.<br>Today high/low <b>${temp}</b> · humidity <b>${rh}</b>.${rainAlert?` <span style="color:#b26a00">— recent heavy rain may have thrown off your balance; test soon.</span>`:''}</p>`);
  }
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
    <h2 style="margin:0 0 2px">🏊 Pool Care — ${esc(fmtDate(today))}</h2>
    <p style="margin:0 0 4px;color:#777;font-size:14px">Here's what's on the list.</p>
    ${rows.join('\n')}
    <p style="margin:22px 0 4px"><a href="${esc(APP_URL)}" style="background:#1565c0;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;display:inline-block">Open the Pool Care app</a></p>
    <p style="color:#999;font-size:12px;margin:14px 0 0">You're getting this because reminders are on for your pool. Change your email or schedule in the app's Settings.</p>
  </div>`;
}

const subjParts = [];
if(due.length) subjParts.push(`${due.length} task${due.length>1?'s':''} due`);
if(sp)         subjParts.push('season heads-up');
if(adv.length) subjParts.push('test advice');
if(rainAlert)  subjParts.push('rain alert');
const subject = subjParts.length ? `🏊 Pool: ${subjParts.join(', ')}` : '🏊 Pool Care reminder';

/* ---------- write outputs ---------- */
mkdirSync('out', { recursive:true });
writeFileSync('out/pool.xml', rss);
writeFileSync('out/email_subject.txt', subject);
writeFileSync('out/email_body.html', emailHtml());
if(stateChanged) writeFileSync('db/feed-state.json', JSON.stringify(state,null,2)+'\n');
if(wxChanged)    writeFileSync('db/weather.json', JSON.stringify(wxLog,null,2)+'\n');

const to = (config.email && config.email.trim()) || process.env.MAIL_FALLBACK || '';

function setOutput(name, value){
  if(!process.env.GITHUB_OUTPUT){ console.log(`${name}=${value}`); return; }
  const d = `__OUT_${name}_EOF__`;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${d}\n${value}\n${d}\n`);
}
setOutput('has_due', hasDue ? 'true' : 'false');
setOutput('to', to);
setOutput('subject', subject);
setOutput('body', emailHtml());
setOutput('state_changed', stateChanged ? 'true' : 'false');

console.error(`[reminders] today=${today} due=${due.length} season=${sp?sp.kind:'-'} testAdvice=${adv.length} wx=${rainSummary?('rain'+rainSummary.last7.toFixed(2)+'/temp'+(rainSummary.tmax!=null?Math.round(rainSummary.tmax):'?')+'/rh'+(rainSummary.rhAvg??'?')+(rainAlert?'/ALERT':'')):'n/a'} hasDue=${hasDue} to=${to||'(none)'}`);
