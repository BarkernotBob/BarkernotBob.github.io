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
const READINGS = [
  {key:'fc',  name:'Free chlorine',   numUnit:'ppm', numRange:[1,3]},
  {key:'ph',  name:'pH',              numUnit:'',    numRange:[7.4,7.6]},
  {key:'ta',  name:'Total alkalinity',numUnit:'ppm', numRange:[80,120]},
  {key:'cya', name:'Cyanuric acid',   numUnit:'ppm', numRange:[30,50]},
  {key:'ch',  name:'Calcium hardness',numUnit:'ppm', numRange:[200,400]},
  {key:'po4', name:'Phosphates',      numUnit:'ppb', numRange:[0,100]},
];
const LEVELS = ['very low','low','normal','high','very high'];
const levelIdx = l => LEVELS.indexOf(l);
const severity = l => { const i=levelIdx(l); return i<0?null:Math.abs(i-2); };

function recForLevel(key, level){
  const sev = severity(level);
  if(sev===0) return {tone:'ok', text:'In range — nothing to do.'};
  const i = levelIdx(level), low = i<2, vv = (i===0||i===4);
  switch(key){
    case 'fc':
      return low
        ? (vv ? {tone:'danger', text:'Chlorine very low. SHOCK: add 1 cup granular chlorine (double dose), run the pump, and keep swimmers out until it reads normal. Re-test in a few hours.'}
              : {tone:'warn',   text:'Chlorine low. Add your usual ½ cup granular chlorine (in a bucket of water, poured by the pump return). Re-test tomorrow.'})
        : (vv ? {tone:'danger', text:'Chlorine very high. Do NOT add more. Keep swimmers out until it drops to normal; partial fresh-water dilution speeds it up.'}
              : {tone:'warn',   text:'Chlorine high. Hold off adding chlorine; let it drift down before the next dose.'});
    case 'ph':
      return low
        ? {tone:'warn', text:'pH low (acidic). Add pH Up (soda ash) per the label for ~10,000 gal, then re-test. Low pH can irritate eyes and corrode metal.'}
        : (vv ? {tone:'danger', text:'pH very high. Add pH Down (dry acid / muriatic acid) per label, run the pump, re-test in a few hours. High pH makes chlorine sluggish.'}
              : {tone:'warn',   text:'pH high. Add a measured dose of pH Down per label and re-test. High pH weakens chlorine.'});
    case 'ta':
      return low
        ? {tone:'warn', text:'Alkalinity low. Add baking soda (sodium bicarbonate) — about 1.5 lb raises ~10 ppm in 10,000 gal. Low alkalinity makes pH bounce around.'}
        : {tone:'warn', text:'Alkalinity high. Lower it slowly with muriatic acid and aerate; re-test over a few days.'};
    case 'cya':
      return low
        ? {tone:'warn', text:'Stabilizer (CYA) low — chlorine burns off fast in sunlight. Add cyanuric acid / conditioner per label and re-test in a couple days.'}
        : {tone:'danger', text:'Stabilizer (CYA) high — there is no chemical that lowers it. Partially drain (~⅓) and refill with fresh water, then re-test.'};
    case 'ch':
      return low
        ? {tone:'warn', text:'Calcium hardness low. Add calcium chloride per label; soft water can etch plaster/grout.'}
        : {tone:'warn', text:'Calcium hardness high. Dilute with fresh water and avoid calcium-based chlorine; watch for scaling.'};
    case 'po4':
      return low
        ? {tone:'ok', text:'Phosphates fine. Keep your every-2-weeks 1 oz maintenance dose.'}
        : (vv ? {tone:'danger', text:'Phosphates very high (algae food). Add phosphate remover per label for a heavy dose, run/filter, then re-test. Resume the 1 oz biweekly routine after.'}
              : {tone:'warn',   text:'Phosphates high. Add a corrective dose of phosphate remover per label, then return to 1 oz every 2 weeks.'});
  }
  return {tone:'warn', text:'Off target — adjust and re-test.'};
}
function recForNumber(key, val, gallons){
  const r = READINGS.find(x=>x.key===key); const [lo,hi]=r.numRange; const g=gallons||10000;
  const f = g/10000;
  if(val>=lo && val<=hi) return {tone:'ok', text:`In range (${lo}–${hi} ${r.numUnit}). Nothing to do.`};
  switch(key){
    case 'fc':{
      if(val<lo){ const cups = val<0.5 ? 1 : 0.5; return {tone:val<0.5?'danger':'warn', text:`Add about ${cups===1?'1 cup':'½ cup'} granular chlorine (×${f.toFixed(1)} for your volume). Re-test in a few hours.`}; }
      return {tone:'warn', text:'Above 3 ppm — skip chlorine until it falls back into 1–3 ppm.'};
    }
    case 'ph':
      return val<lo ? {tone:'warn', text:'Below 7.4 — add pH Up (soda ash) per label and re-test.'}
                    : {tone:'warn', text:'Above 7.6 — add pH Down per label and re-test in a few hours.'};
    case 'ta':{
      if(val<lo){ const lbs=(((lo+hi)/2 - val)/10*1.5*f); return {tone:'warn', text:`Add ~${lbs.toFixed(1)} lb baking soda to bring alkalinity toward ${(lo+hi)/2} ppm, then re-test.`}; }
      return {tone:'warn', text:'Above 120 ppm — lower slowly with muriatic acid and aerate.'};
    }
    case 'cya':{
      if(val<lo){ const oz=(((lo+hi)/2 - val)*0.13*8*f); return {tone:'warn', text:`Add stabilizer to raise CYA toward ${(lo+hi)/2} ppm (~${oz.toFixed(0)} oz dry conditioner). Re-test in 2 days.`}; }
      return {tone:'danger', text:'Above 50 ppm — no chemical lowers CYA. Partially drain & refill, then re-test.'};
    }
    case 'ch':
      return val<lo ? {tone:'warn', text:'Below 200 ppm — add calcium chloride per label.'}
                    : {tone:'warn', text:'Above 400 ppm — dilute with fresh water; avoid calcium-based products.'};
    case 'po4':
      return {tone:val>250?'danger':'warn', text:'Phosphates above ~100 ppb — dose phosphate remover per label, filter, then resume 1 oz every 2 weeks.'};
  }
  return {tone:'warn', text:'Out of range — adjust and re-test.'};
}

/* ---------- load data ---------- */
const readJson = (p, dflt) => { try{ return JSON.parse(readFileSync(p,'utf8')); }catch{ return dflt; } };
const config = readJson('db/config.json', null);
if(!config){ console.error('No db/config.json found — has the app been opened/signed-in yet?'); process.exit(0); }
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
  if(t.mode==='num'){
    for(const k in (t.nums||{})){ const r=recForNumber(k,t.nums[k],gal); if(r.tone!=='ok'){ const m=READINGS.find(x=>x.key===k); out.push({name:m.name, display:`${t.nums[k]} ${m.numUnit}`.trim(), ...r}); } }
  } else {
    for(const k in (t.levels||{})){ const r=recForLevel(k,t.levels[k]); if(r.tone!=='ok'){ const m=READINGS.find(x=>x.key===k); out.push({name:m.name, display:t.levels[k], ...r}); } }
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
const subject = subjParts.length ? `🏊 Pool: ${subjParts.join(', ')}` : '🏊 Pool Care reminder';

/* ---------- write outputs ---------- */
mkdirSync('out', { recursive:true });
writeFileSync('out/pool.xml', rss);
writeFileSync('out/email_subject.txt', subject);
writeFileSync('out/email_body.html', emailHtml());
if(stateChanged) writeFileSync('db/feed-state.json', JSON.stringify(state,null,2)+'\n');

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

console.error(`[reminders] today=${today} due=${due.length} season=${sp?sp.kind:'-'} testAdvice=${adv.length} hasDue=${hasDue} to=${to||'(none)'}`);
