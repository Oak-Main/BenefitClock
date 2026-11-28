import { test } from "node:test";
import assert from "node:assert/strict";
import {
  indexPlans, indexCrosswalk, buildDiff, diffMetric, METRICS,
  listStates, listCounties, plansInCounty, statusInfo, planKey, planTypeLabel,
} from "../src/assets/js/lib/plandiff-core.js";

function plan(over) {
  return {
    contractId: "H1234", planId: "001", segmentId: "0",
    planName: "Test Plan (HMO)", orgName: "TestCare", planType: "MAPD", network: "HMO",
    state: "FL", county: "Broward", fips: "12011",
    premium: 20, drugDeductible: 400, moop: 5500, starRating: 4.0,
    hasDrugCoverage: true, hasDental: true, hasVision: true, hasHearing: true,
    ...over,
  };
}

test("indexes and geography helpers", () => {
  const plans = [plan(), plan({ contractId: "H9", planId: "002", county: "Miami-Dade", fips: "12086" }), plan({ state: "TX", county: "Harris" })];
  const idx = indexPlans(plans);
  assert.deepEqual(listStates(idx), ["FL", "TX"]);
  assert.deepEqual(listCounties(idx, "FL"), ["Broward", "Miami-Dade"]);
  assert.equal(plansInCounty(idx, "FL", "Broward").length, 1);
});

test("renewal with premium increase is flagged bad (red)", () => {
  const cur = indexPlans([plan({ premium: 20 })]);
  const next = indexPlans([plan({ premium: 45, year: 2027 })]);
  const xw = indexCrosswalk([{ fromContractId: "H1234", fromPlanId: "001", toContractId: "H1234", toPlanId: "001", status: "renewal" }]);
  const d = buildDiff({ currentIndex: cur, nextIndex: next, crosswalk: xw, contractId: "H1234", planId: "001", state: "FL", county: "Broward" });
  assert.equal(d.ok, true);
  const prem = d.metrics.find((m) => m.field === "premium");
  assert.equal(prem.direction, "up");
  assert.equal(prem.tone, "bad");
  assert.match(prem.deltaText, /\+\$25/);
  assert.match(d.headline, /premium is going up/i);
});

test("higher star rating is good (green)", () => {
  const m = diffMetric(METRICS.find((x) => x.field === "starRating"), { starRating: 3.5 }, { starRating: 4.5 });
  assert.equal(m.direction, "up");
  assert.equal(m.tone, "good");
});

test("dropping a dental benefit is bad", () => {
  const m = diffMetric(METRICS.find((x) => x.field === "hasDental"), { hasDental: true }, { hasDental: false });
  assert.equal(m.direction, "removed");
  assert.equal(m.tone, "bad");
  assert.match(m.deltaText, /Dropped/);
});

test("termination yields no successor and a clear headline", () => {
  const cur = indexPlans([plan()]);
  const next = indexPlans([]);
  const xw = indexCrosswalk([{ fromContractId: "H1234", fromPlanId: "001", toContractId: null, toPlanId: null, status: "termination" }]);
  const d = buildDiff({ currentIndex: cur, nextIndex: next, crosswalk: xw, contractId: "H1234", planId: "001", state: "FL", county: "Broward" });
  assert.equal(d.ok, true);
  assert.equal(d.status, "termination");
  assert.equal(d.next, null);
  assert.match(d.headline, /ending/i);
});

test("consolidation follows the crosswalk to the successor plan id", () => {
  const cur = indexPlans([plan({ planId: "001", premium: 30 })]);
  const next = indexPlans([plan({ planId: "004", premium: 0, year: 2027 })]);
  const xw = indexCrosswalk([{ fromContractId: "H1234", fromPlanId: "001", toContractId: "H1234", toPlanId: "004", status: "consolidation" }]);
  const d = buildDiff({ currentIndex: cur, nextIndex: next, crosswalk: xw, contractId: "H1234", planId: "001", state: "FL", county: "Broward" });
  assert.equal(d.ok, true);
  assert.equal(d.status, "consolidation");
  assert.equal(d.next.planId, "004");
  const prem = d.metrics.find((m) => m.field === "premium");
  assert.equal(prem.direction, "down");
  assert.equal(prem.tone, "good");
});

test("unknown plan returns ok:false", () => {
  const cur = indexPlans([plan()]);
  const next = indexPlans([plan({ year: 2027 })]);
  const xw = indexCrosswalk([]);
  const d = buildDiff({ currentIndex: cur, nextIndex: next, crosswalk: xw, contractId: "H0000", planId: "999", state: "FL", county: "Broward" });
  assert.equal(d.ok, false);
  assert.equal(d.reason, "not-found");
});

test("statusInfo covers all codes", () => {
  for (const s of ["renewal", "consolidation", "service-area-reduction", "termination", "new", "???"]) {
    const info = statusInfo(s);
    assert.ok(info.label && info.note && info.tone);
  }
});

test("a missing numeric metric is non-comparable, not a fabricated $0 movement", () => {
  const moop = METRICS.find((x) => x.field === "moop");
  const d = diffMetric(moop, { moop: 6700 }, { moop: null });
  assert.equal(d.direction, "flat");
  assert.equal(d.tone, "flat");
  assert.equal(d.deltaText, "No change");
  assert.equal(d.priorText, "$6,700");
  assert.equal(d.nextText, "—");
  // and the reverse (missing -> present) is also non-comparable
  const d2 = diffMetric(moop, { moop: null }, { moop: 5000 });
  assert.equal(d2.direction, "flat");
  assert.equal(d2.deltaText, "No change");
});

/* ---- colour comes from meaning, not from arithmetic direction ---------- */

test("a falling star rating is bad news even though the number went down", () => {
  const stars = METRICS.find((x) => x.field === "starRating");
  const drop = diffMetric(stars, { starRating: 3.0 }, { starRating: 2.5 });
  assert.equal(drop.direction, "down");
  assert.equal(drop.tone, "bad", "renderers must colour from tone, not direction");
  const rise = diffMetric(stars, { starRating: 2.5 }, { starRating: 3.0 });
  assert.equal(rise.direction, "up");
  assert.equal(rise.tone, "good");
});

/* ---- duplicate identities are surfaced, never silently resolved -------- */

test("two plans under one contract|plan|county identity are flagged as duplicates", () => {
  const idx = indexPlans([
    plan({ premium: 35, planName: "Core (HMO)" }),
    plan({ premium: 0, planName: "Choice (HMO)" }),
    plan({ county: "Miami-Dade" }),
  ]);
  assert.equal(idx.duplicateKeys.size, 1);
  assert.ok(idx.duplicateKeys.has(planKey("H1234", "001", "Broward")));
  // the first record wins the slot, but the key is known to be unsafe
  assert.equal(idx.byKey.get(planKey("H1234", "001", "Broward")).premium, 35);
});

test("a colliding successor yields no comparison instead of the wrong one", () => {
  const cur = indexPlans([plan({ premium: 40 })]);
  const next = indexPlans([
    plan({ premium: 0, year: 2027 }),
    plan({ premium: 5, year: 2027, planName: "Sibling (HMO)" }),
  ]);
  const xw = indexCrosswalk([{ fromContractId: "H1234", fromPlanId: "001", toContractId: "H1234", toPlanId: "001", status: "renewal" }]);
  const d = buildDiff({ currentIndex: cur, nextIndex: next, crosswalk: xw, contractId: "H1234", planId: "001", state: "FL", county: "Broward", nextYear: 2027 });
  assert.equal(d.ok, true);
  assert.equal(d.ambiguous, true);
  assert.equal(d.next, null);
  assert.deepEqual(d.metrics, []);
  assert.doesNotMatch(d.headline, /premium is going (up|down)/i);
  assert.match(d.statusInfo.note, /more than one plan/i);
});

test("a clean successor is not flagged ambiguous", () => {
  const cur = indexPlans([plan({ premium: 40 })]);
  const next = indexPlans([plan({ premium: 45, year: 2027 })]);
  const xw = indexCrosswalk([{ fromContractId: "H1234", fromPlanId: "001", toContractId: "H1234", toPlanId: "001", status: "renewal" }]);
  const d = buildDiff({ currentIndex: cur, nextIndex: next, crosswalk: xw, contractId: "H1234", planId: "001", state: "FL", county: "Broward", nextYear: 2027 });
  assert.equal(d.ambiguous, false);
  assert.ok(d.metrics.length > 0);
});

test("crosswalk rows for brand-new plans do not collide on a null key", () => {
  const xw = indexCrosswalk([
    { fromContractId: null, fromPlanId: null, toContractId: "H1", toPlanId: "090", status: "new" },
    { fromContractId: null, fromPlanId: null, toContractId: "H2", toPlanId: "090", status: "new" },
    { fromContractId: "H1234", fromPlanId: "001", toContractId: "H1234", toPlanId: "001", status: "renewal" },
  ]);
  assert.equal(xw.size, 1);
  assert.equal(xw.get("H1234|001").status, "renewal");
});

/* ---- year labels come from the data, not from a literal ---------------- */

test("every year label is driven by the manifest year", () => {
  const info = statusInfo("termination", { nextYear: 2031 });
  assert.match(info.label, /2031/);
  assert.match(info.note, /2031/);
  assert.doesNotMatch(`${info.label} ${info.note}`, /2027/);
  assert.match(statusInfo("renewal", { nextYear: 2031 }).label, /2031/);
  assert.match(statusInfo("new", { nextYear: 2031 }).label, /2031/);

  const dental = METRICS.find((x) => x.field === "hasDental");
  const dropped = diffMetric(dental, { hasDental: true }, { hasDental: false }, { nextYear: 2031 });
  assert.match(dropped.deltaText, /2031/);

  const cur = indexPlans([plan()]);
  const xw = indexCrosswalk([{ fromContractId: "H1234", fromPlanId: "001", toContractId: null, toPlanId: null, status: "termination" }]);
  const d = buildDiff({ currentIndex: cur, nextIndex: indexPlans([]), crosswalk: xw, contractId: "H1234", planId: "001", state: "FL", county: "Broward", nextYear: 2031 });
  assert.match(d.headline, /2031/);
});

test("without a manifest year no year is invented", () => {
  const info = statusInfo("termination");
  assert.doesNotMatch(`${info.label} ${info.note}`, /\d{4}/);
  assert.match(info.label, /next year/);
});

/* ---- jargon is expanded on first use ----------------------------------- */

test("runtime copy spells out AEP and MAPD", () => {
  const note = statusInfo("termination", { nextYear: 2027 }).note;
  assert.doesNotMatch(note, /\bAEP\b/);
  assert.match(note, /Open Enrollment/);
  const label = planTypeLabel({ planType: "MAPD", network: "PPO" });
  assert.doesNotMatch(label, /MAPD/);
  assert.match(label, /Medicare Advantage/);
  assert.match(planTypeLabel({ planType: "PDP", network: "PDP" }), /Drug-only plan/);
});

/* ---- plan type / network is compared ----------------------------------- */

test("a PPO to HMO switch is compared and explained in plain language", () => {
  const cur = indexPlans([plan({ network: "PPO", premium: 10 })]);
  const next = indexPlans([plan({ network: "HMO", premium: 30, year: 2027 })]);
  const xw = indexCrosswalk([{ fromContractId: "H1234", fromPlanId: "001", toContractId: "H1234", toPlanId: "001", status: "consolidation" }]);
  const d = buildDiff({ currentIndex: cur, nextIndex: next, crosswalk: xw, contractId: "H1234", planId: "001", state: "FL", county: "Broward", nextYear: 2027 });
  const net = d.metrics.find((m) => m.field === "network");
  assert.ok(net, "plan type must be one of the compared metrics");
  assert.equal(net.priorText, "PPO");
  assert.equal(net.nextText, "HMO");
  assert.equal(net.direction, "changed");
  assert.equal(net.tone, "warn");
  assert.ok(d.notes.some((n) => /doctors/i.test(n)), "a network change must be called out, not hidden behind the premium");
});

test("an unchanged plan type reports no change", () => {
  const net = diffMetric(METRICS.find((x) => x.field === "network"), { network: "HMO" }, { network: "HMO" });
  assert.equal(net.direction, "flat");
  assert.equal(net.deltaText, "No change");
});

/* ---- drug-only plans never had medical benefits ------------------------ */

test("a drug-only plan shows medical rows as not applicable, not 'No change'", () => {
  const pdp = (over) => plan({
    contractId: "S5555", planType: "PDP", network: "PDP", planName: "Test Rx (PDP)",
    moop: null, hasDental: false, hasVision: false, hasHearing: false, ...over,
  });
  const cur = indexPlans([pdp({ premium: 12, drugDeductible: 400 })]);
  const next = indexPlans([pdp({ premium: 18, drugDeductible: 615, year: 2027 })]);
  const xw = indexCrosswalk([{ fromContractId: "S5555", fromPlanId: "001", toContractId: "S5555", toPlanId: "001", status: "renewal" }]);
  const d = buildDiff({ currentIndex: cur, nextIndex: next, crosswalk: xw, contractId: "S5555", planId: "001", state: "FL", county: "Broward", nextYear: 2027 });
  for (const field of ["moop", "hasDental", "hasVision", "hasHearing"]) {
    const row = d.metrics.find((m) => m.field === field);
    assert.equal(row.direction, "na", `${field} must not claim "No change"`);
    assert.equal(row.deltaText, "Not applicable");
    assert.equal(row.priorText, "—");
    assert.equal(row.nextText, "—");
  }
  // the rows a drug plan really does have still compare normally
  assert.equal(d.metrics.find((m) => m.field === "drugDeductible").direction, "up");
  assert.ok(d.notes.some((n) => /drug-only/i.test(n)));
});

test("a Medicare Advantage plan still compares its medical rows", () => {
  const moop = METRICS.find((x) => x.field === "moop");
  const m = diffMetric(moop, plan({ moop: 5500 }), plan({ moop: 6700 }));
  assert.equal(m.direction, "up");
  assert.equal(m.tone, "bad");
});

test("zero is a real value, not treated as missing", () => {
  const prem = METRICS.find((x) => x.field === "premium");
  const d = diffMetric(prem, { premium: 0 }, { premium: 20 });
  assert.equal(d.direction, "up");
  assert.equal(d.tone, "bad");
  assert.match(d.deltaText, /\+\$20/);
  // premium dropping to $0 is a real, good change
  const d2 = diffMetric(prem, { premium: 20 }, { premium: 0 });
  assert.equal(d2.direction, "down");
  assert.equal(d2.tone, "good");
  assert.equal(d2.nextText, "$0");
});

/* ---- terminating-plan note: nonrenewal SEP, dates from aep.json -------- */

test("termination note names the nonrenewal SEP with dates from aep.json", () => {
  const aep = { windowRange: "October 16 – December 9", nonrenewalSepStartLabel: "December 10" };
  const note = statusInfo("termination", { nextYear: 2031, aep }).note;
  assert.match(note, /Open Enrollment, October 16 – December 9/);
  assert.match(note, /Special Enrollment Period from December 10 through the last day in February/);
  assert.doesNotMatch(note, /October 15|December 7|December 8/);
  assert.doesNotMatch(note, /drug coverage/i);

  const cur = indexPlans([plan()]);
  const xw = indexCrosswalk([{ fromContractId: "H1234", fromPlanId: "001", toContractId: null, toPlanId: null, status: "termination" }]);
  const d = buildDiff({ currentIndex: cur, nextIndex: indexPlans([]), crosswalk: xw, contractId: "H1234", planId: "001", state: "FL", county: "Broward", nextYear: 2031, aep });
  assert.equal(d.statusInfo.note, note);
});

test("termination note types no dates when aep.json is unavailable", () => {
  const note = statusInfo("termination", { nextYear: 2027 }).note;
  assert.match(note, /Special Enrollment Period/);
  assert.doesNotMatch(note, /(January|February|March|April|May|June|July|August|September|October|November|December) \d/);
});

test("the nonrenewal SEP is named only for a termination or a dropped county", () => {
  assert.match(statusInfo("service-area-reduction").note, /If your county is being dropped.*Special Enrollment Period/);
  for (const s of ["renewal", "consolidation", "new", "unknown"]) {
    assert.doesNotMatch(statusInfo(s, { nextYear: 2027 }).note, /Special Enrollment Period/);
  }
});

/* CMS reassigns Extra Help (LIS) enrollees in terminating plans (CY 2027
   enrollment guidance §40.1.9), so a blanket "you'll lose drug coverage" is
   wrong for some readers. Removed in #37, crept back in #40; keep it out. */
test("no page or runtime copy says a nonrenewal means losing drug coverage", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const files = [
    ...readdirSync("src/pages").filter((f) => f.endsWith(".html")).map((f) => `src/pages/${f}`),
    "src/assets/js/plan-diff.js",
  ];
  const bad = /lose (your )?drug coverage|no drug coverage unless/i;
  for (const f of files) assert.doesNotMatch(readFileSync(f, "utf8"), bad, f);
  for (const s of ["termination", "service-area-reduction"]) assert.doesNotMatch(statusInfo(s).note, bad);
});
