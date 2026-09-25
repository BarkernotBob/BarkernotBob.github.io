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

/* ---------- chemistry: the SAME module the app imports (issue #142) ----------
   The reading definitions, level scale, chemical catalogue, config upgrade and
   every recommendation live in ../shared/pool-chem.js. This script used to
   carry its own copy, and the two had drifted.

   The pool-data workflow downloads ONLY this file (`curl .../reminders.mjs`),
   so a plain `import '../shared/pool-chem.js'` would find nothing there. It
   loads the module's text instead, then imports that text through a data: URL:
     1. from beside this file, when that exists (this repo, and its tests);
     2. otherwise from the live site (where the workflow fetched this file).
   POOL_CHEM_URL overrides step 2. If the module can't be loaded the run FAILS
   (and GitHub emails you that it failed): an email with no test advice would
   look like "all readings fine", which is worse than no email. */
const CHEM_URL = process.env.POOL_CHEM_URL || 'https://barkernotbob.github.io/static/shared/pool-chem.js';
async function loadChemistry(){
  let text = null;
  const local = new URL('../shared/pool-chem.js', import.meta.url);
  if(!process.env.POOL_CHEM_URL && existsSync(local)) text = readFileSync(local, 'utf8');
  for(let attempt=1; text==null && attempt<=3; attempt++){
    try{
      const r = await fetch(CHEM_URL);
      if(r.ok) text = await r.text();
      else console.error(`[chem] ${CHEM_URL} -> HTTP ${r.status} (attempt ${attempt})`);
    }catch(e){ console.error(`[chem] ${CHEM_URL} failed: ${e.message} (attempt ${attempt})`); }
    if(text==null && attempt<3) await new Promise(res=>setTimeout(res, 2000*attempt));
  }
  if(text==null) throw new Error(`Could not load the pool chemistry module from ${CHEM_URL}`);
  return import('data:text/javascript;base64,'+Buffer.from(text,'utf8').toString('base64'));
}
const { useConfig, migrateConfig, applyTargets, offTargetAdvice } = await loadChemistry();


/* ---------- load data ---------- */
const readJson = (p, dflt) => { try{ return JSON.parse(readFileSync(p,'utf8')); }catch{ return dflt; } };
const config = readJson('db/config.json', null);
if(!config){ console.error('No db/config.json found — has the app been opened/signed-in yet?'); process.exit(0); }
// Bring the config up to date the way the app does on load (the chemistry
// part of it — the app also fills in unrelated defaults like tasks): missing
// target ranges filled in, renamed chemical keys renamed, a config that never
// had an inventory given the starting shed. Then judge readings against the
// saved target ranges (a blank or non-numeric one falls back to the default).
useConfig(() => config);
migrateConfig(config);
applyTargets(config);
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
// The same list, text and order the app's advice cards show for this test.
function testAdvice(t){
  return offTargetAdvice(t).map(r=>({name:r.name, display:r.display, tone:r.rec.tone, text:r.rec.text}));
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
