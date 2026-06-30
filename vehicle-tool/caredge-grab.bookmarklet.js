(async()=>{const A=m=>alert('Driveline · '+m);try{
const can=(document.querySelector('link[rel=canonical]')||{}).href||location.href;
const m=can.match(/caredge\.com\/([^\/?#]+)\/([^\/?#]+)/i);
if(!m){A("Open a car's CarEdge page first (its Depreciation page works best).");return;}
const make=m[1],model=m[2],base='https://caredge.com/'+make+'/'+model;
const money=s=>{const n=parseFloat(String(s).replace(/[^0-9.]/g,''));return isFinite(n)?n:null;};
function priceRows(doc){const tabs=[...doc.querySelectorAll('table')];
const t=tabs.find(t=>{const h=(t.querySelector('tr')||{}).textContent||'';return /current price/i.test(h)&&/maintenance/i.test(h);});
if(!t)return[];const trs=[...t.querySelectorAll('tr')];
const head=[...trs[0].querySelectorAll('th,td')].map(c=>c.textContent.trim().toLowerCase());
const ci=n=>head.findIndex(h=>h.includes(n));
const iy=ci('year'),ip=ci('current price'),im=ci('maintenance'),ipp=ci('% paid');const out=[];
trs.slice(1).forEach(tr=>{const c=[...tr.querySelectorAll('th,td')].map(x=>x.textContent.trim());const y=parseInt(c[iy],10);
if(y>1990&&y<2100)out.push({year:y,price:money(c[ip]),maint:money(c[im]),paid:ipp>=0?money(c[ipp]):null});});return out;}
let rows=priceRows(document);
if(!rows.length){A("Couldn't find the price table — open this car's Depreciation page, then click again.");return;}
async function fetchDoc(u){const r=await fetch(u,{credentials:'include'});return new DOMParser().parseFromString(await r.text(),'text/html');}
let insBase=null;try{const d=await fetchDoc(base+'/insurance');
const mm=d.body.textContent.match(/Avg\s*\$?([\d,]+)\s*\/\s*year/i);if(mm)insBase=money(mm[1]);
if(insBase==null){const t=[...d.querySelectorAll('table')].find(t=>/good driver/i.test(t.textContent));
const br=t&&[...t.querySelectorAll('tr')].find(tr=>/\bbase\b/i.test(tr.textContent));
if(br)insBase=money([...br.querySelectorAll('td')].map(x=>x.textContent).find(x=>/\$/.test(x)));}}catch(e){}
let mpg=null,pt=null;try{const t=await(await fetch(base,{credentials:'include'})).text();
if(/hybrid/i.test(t))pt='hybrid';else if(/\bMPGe\b/.test(t)||/\belectric\b/i.test(t))pt='ev';
const mg=t.match(/(\d{2,3})\s*MPGe/i)||t.match(/combined[^0-9]{0,24}(\d{2,3})\s*mpg/i)||t.match(/(\d{2,3})\s*mpg\b/i);
if(mg)mpg=parseInt(mg[1],10);}catch(e){}
const title=(make+' '+model).replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const bundle={name:title,make:make,model:model,rows:rows.map(r=>[r.year,Math.round(r.price||0),Math.round(r.maint||0),(insBase!=null&&r.paid!=null)?Math.round(insBase*r.paid/100):(insBase?Math.round(insBase):0),0])};
if(pt)bundle.pt=pt;if(mpg)bundle.mpg=mpg;
const json=JSON.stringify(bundle);
const msg='✓ '+title+' — '+rows.length+' years\nInsurance base '+(insBase!=null?'$'+insBase:'not found')+(mpg?' · '+mpg+' MPG':'')+'\n\nOpen Driveline → Settings → Add a car from CarEdge → paste.';
try{await navigator.clipboard.writeText(json);A('Copied to clipboard.\n'+msg);}catch(e){prompt('Copy this, then paste into Driveline:',json);}
}catch(e){A('grab failed: '+e.message);}})();
