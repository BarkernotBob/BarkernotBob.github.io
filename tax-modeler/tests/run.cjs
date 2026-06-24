#!/usr/bin/env node
/* Regression tests for the US Tax Modeler.
 * Loads index.html, extracts the inline script, stubs a minimal DOM, and runs
 * assertions against compute() and friends. Run:  node tests/run.js
 * These check internal consistency and hand-verifiable relationships — they are
 * a safety net so a future edit can't silently break a number.
 */
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];

// minimal DOM stub so the script's render code doesn't throw at module load
const _el = { innerHTML:"", textContent:"", value:0, max:0, style:{}, dataset:{}, classList:{toggle(){},add(){},remove(){}},
  addEventListener(){}, setAttribute(){}, select(){}, scrollIntoView(){}, getBoundingClientRect(){return{left:0,width:340};}, focus(){} };
global.document = { getElementById:()=>_el, querySelector:()=>_el, querySelectorAll:()=>[], addEventListener(){}, createElement:()=>_el };
global.window = { addEventListener(){}, innerWidth:1024, innerHeight:768 }; global.navigator = { clipboard:{ writeText(){} } }; global.setTimeout = ()=>{};
global.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };

const api = new Function(js + ";return {compute,defaults,computeState,planLevers,opportunities,sideBusiness,buildExport,combinedMarginal,plainEnglishSummary,deadlineFor,safeHarbor};")();

let pass = 0, fail = 0;
const approx = (a,b,tol=1) => Math.abs(a-b) <= tol;
function check(name, cond, detail="") {
  if (cond) { pass++; }
  else { fail++; console.log("  ✗ " + name + (detail? "  — "+detail : "")); }
}
function base(over={}) { return Object.assign(api.defaults(), over); }

// 1. AGI = total income − adjustments
{
  const r = api.compute(base({ filingStatus:"single", wages:80000, trad401k:10000, hsaContribution:2000, hsaFamily:false }));
  check("AGI = income − pretax adjustments", approx(r.agi, 80000-10000-2000, 2), "agi="+Math.round(r.agi));
  check("taxable income = AGI − deduction", approx(r.taxableIncome, r.agi - r.deduction, 2));
}

// 2. Federal-only adds no state tax; Indiana adds state+county
{
  const fed = api.compute(base({ filingStatus:"single", wages:70000, state:"federal" }));
  const ind = api.compute(base({ filingStatus:"single", wages:70000, state:"IN", county:"Marion" }));
  check("federal-only state tax = 0", fed.indiana.stateTax===0 && fed.indiana.countyTax===0);
  check("Indiana adds positive state+county", ind.indiana.stateTax>0 && ind.indiana.countyTax>0);
  check("Indiana total tax > federal-only", ind.totalTax > fed.totalTax);
}

// 3. No-tax state = $0 state; other-state estimate ≈ rate × AGI
{
  const nt = api.compute(base({ wages:90000, state:"notax", stateName:"Texas" }));
  check("no-tax state → $0 state tax", nt.indiana.stateTax===0 && nt.indiana.kind==="notax");
  const ot = api.compute(base({ wages:90000, state:"other", stateRateOverride:5 }));
  check("other-state estimate ≈ 5% of AGI", approx(ot.indiana.stateTax, ot.agi*0.05, 2), "got "+Math.round(ot.indiana.stateTax));
  check("other-state flagged as estimate", ot.indiana.isEstimate===true);
}

// 4. Indiana 529 credit = 20% of contribution, capped at $1,500
{
  const a = api.compute(base({ wages:90000, state:"IN", in529:5000 }));
  check("529 credit = 20% of $5,000 = $1,000", approx(a.indiana.credit529, 1000, 1), "got "+Math.round(a.indiana.credit529));
  const b = api.compute(base({ wages:90000, state:"IN", in529:50000 }));
  check("529 credit capped at $1,500", approx(b.indiana.credit529, 1500, 1));
}

// 5. Dependent-care FSA lowers AGI and FICA wages by the contribution
{
  const nof = api.compute(base({ filingStatus:"mfj", wages:90000, wagesSpouse:40000, dependents:[{age:4},{age:6}], depCareExpenses:6000 }));
  const fsa = api.compute(base({ filingStatus:"mfj", wages:90000, wagesSpouse:40000, dependents:[{age:4},{age:6}], depCareExpenses:6000, depCareFsa:5000 }));
  check("DCFSA reduces AGI by ~$5,000", approx(nof.agi - fsa.agi, 5000, 2), "delta="+Math.round(nof.agi-fsa.agi));
  check("DCFSA reduces FICA (SS) tax", fsa.ssTax < nof.ssTax);
}

// 6. Social Security wage base cap respected
{
  const r = api.compute(base({ filingStatus:"single", wages:400000 }));
  const cap = 184500 * 0.062;
  check("employee SS tax capped at wage base", approx(r.ssTax, cap, 1), "ssTax="+Math.round(r.ssTax)+" cap="+Math.round(cap));
}

// 7. HSA via payroll saves FICA; HSA not via payroll does not
{
  const pay = api.compute(base({ wages:80000, hsaContribution:4000, hsaThroughPayroll:true }));
  const dir = api.compute(base({ wages:80000, hsaContribution:4000, hsaThroughPayroll:false }));
  check("payroll HSA has lower FICA than direct HSA", (pay.ssTax+pay.medTax) < (dir.ssTax+dir.medTax));
  check("both HSA routes give same AGI", approx(pay.agi, dir.agi, 1));
}

// 8. Side-business deductions and net profit math
{
  const b = api.sideBusiness(base({ yourAge:35, sbRevenue:40000, sbExpenses:6000, sbHomeSqft:200, sbMiles:3000, sbEquipment:2000 }));
  check("home office = 200 sqft × $5 = $1,000", b.home===1000);
  check("mileage = 3000 × $0.70 = $2,100", b.miles===2100);
  check("net profit = revenue − all deductions", b.netProfit===40000-6000-1000-2100-2000);
  check("starting a business adds tax (SE tax)", b.dTax>0 && b.dSe>0);
  check("Solo 401(k) room exceeds employee 401(k) limit", b.soloRoom>24500-1);
}

// 9. Opportunities "room" excludes the 529 credit (not income-lowering)
{
  const s = base({ filingStatus:"mfj", wages:120000, dependents:[{age:5}], state:"IN", trad401k:5000 });
  const levers = api.planLevers(s);
  check("529 lever exists but flagged non-income-lowering", levers.some(l=>l.key==="in529" && l.lowersIncome===false));
  const o = api.opportunities(s, api.compute(s));
  const roomFromLowering = levers.filter(l=>l.lowersIncome).reduce((t,l)=>t+l.room,0);
  check("opportunity room = sum of income-lowering levers only", approx(o.room, roomFromLowering, 1));
}

// 10. 401(k) lever requires that person's wages (no spouse wages → no spouse 401k)
{
  const oneEarner = api.planLevers(base({ filingStatus:"mfj", wages:120000, wagesSpouse:0 }));
  check("no spouse 401(k) lever when spouse has no wages", !oneEarner.some(l=>l.key==="trad401kSpouse"));
  check("spousal IRA lever still present", oneEarner.some(l=>l.key==="tradIRASpouse"));
}

// 11. Export builds (markdown + valid JSON) with no UI-state leakage
{
  // buildExport reads the app's live state; with no localStorage it is the defaults.
  const r = api.compute(api.defaults());
  const md = api.buildExport(r, "md");
  const json = api.buildExport(r, "json");
  check("markdown export builds with results", typeof md==="string" && md.includes("Computed results"));
  check("JSON export is valid", (()=>{ try{ JSON.parse(json); return true; }catch(e){ return false; } })());
  check("export strips UI-state keys", !md.includes("resultsTab") && !md.includes("uiMode") && !md.includes("expandedRows"));
}

// 12. Combined marginal ≥ federal marginal (state adds on top in IN)
{
  const s = base({ filingStatus:"mfj", wages:140000, state:"IN", county:"Allen" });
  const r = api.compute(s);
  check("all-in marginal ≥ federal marginal", api.combinedMarginal(s) >= r.marginalOrd - 0.001);
}

// 13. Plain-English summary produces a non-trivial narrative referencing the balance
{
  const s = base({ filingStatus:"single", wages:75000, fedWithholding:9000, state:"IN" });
  const txt = api.plainEnglishSummary(s, api.compute(s));
  check("plain-English summary is a substantial string", typeof txt==="string" && txt.length>120);
  check("plain-English mentions refund or owe", /refund|owe/.test(txt));
}

// 14. Deadline mapping: 401(k) is year-end, IRA is filing-deadline
{
  const s = base({});
  check("401(k) deadline is Dec 31 (urgent)", api.deadlineFor("trad401k", s).u === true);
  check("Traditional IRA deadline is not urgent (April)", api.deadlineFor("tradIRA", s).u === false);
  check("payroll HSA is year-end, direct HSA is April",
    api.deadlineFor("hsaContribution", base({hsaThroughPayroll:true})).u === true &&
    api.deadlineFor("hsaContribution", base({hsaThroughPayroll:false})).u === false);
}

// 15. Safe harbor: under $1,000 owed = safe; large unpaid SE tax = not safe; prior-year lowers the bar
{
  const fullyPaid = api.safeHarbor(base({ wages:80000, fedWithholding:30000 }), api.compute(base({ wages:80000, fedWithholding:30000 })));
  check("fully-withheld filer is in safe harbor", fullyPaid.safe === true);
  const sUnpaid = base({ seNetProfit:150000, fedWithholding:0, fedEstimated:0 });
  const unpaid = api.safeHarbor(sUnpaid, api.compute(sUnpaid));
  check("big unpaid SE income is NOT safe", unpaid.safe === false && unpaid.shortfall > 0);
  // prior-year tax of $1 (tiny) makes the required prepayment tiny → safe
  const sPrior = base({ seNetProfit:150000, fedWithholding:200, priorYearTax:100 });
  const withPrior = api.safeHarbor(sPrior, api.compute(sPrior));
  check("low prior-year tax lowers the required prepayment (becomes safe)", withPrior.safe === true);
}

// 16. Side business can run at a loss that reduces tax
{
  const profit = api.sideBusiness(base({ yourAge:35, sbRevenue:40000, sbExpenses:6000 }));
  check("profitable side business adds tax", profit.isLoss===false && profit.dTax>0);
  const loss = api.sideBusiness(base({ yourAge:35, wages:90000, sbRevenue:5000, sbExpenses:20000 }));
  check("loss is negative net profit", loss.isLoss===true && loss.netProfit===-15000);
  check("loss reduces tax (dTax negative / taxSaved positive)", loss.dTax<0 && loss.taxSaved>0);
  check("Solo room hint isn't claimed above the limit when zero", api.sideBusiness(base({sbRevenue:0})).soloRoom===0);
}

// 17. Employee FICA is auto-counted as paid (balance not inflated by already-withheld FICA)
{
  const r = api.compute(base({ wages:80000, fedWithholding:9000 }));
  check("ficaPaid defaults to computed employee FICA", approx(r.ficaPaid, r.ssTax+r.medTax, 1));
  check("payments include income-tax withholding + FICA", approx(r.payments, 9000 + r.ssTax + r.medTax, 1));
  const over = api.compute(base({ wages:80000, fedWithholding:9000, ficaWithheld:1234, ficaWithheldTouched:true }));
  check("user can override FICA withheld", approx(over.payments, 9000+1234, 1));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
