import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diffMetric,
  METRICS,
  formatMetric,
  buildDiff,
  indexPlans,
  indexCrosswalk,
} from "../src/assets/js/lib/plandiff-core.js";

/* ---- dental / vision / hearing: not published in the Landscape file -----
   The combined CMS Landscape file has no dental/vision/hearing columns for
   any plan year. The normalizer emits those cells empty, the build turns an
   empty cell into null ("unknown"), and the site must SAY that — because
   "No" would be a claim about the plan that the file does not support. */

test("an unpublished benefit flag says so, and never says 'No'", () => {
  const m = diffMetric(
    METRICS.find((x) => x.field === "hasDental"),
    { hasDental: null },
    { hasDental: null }
  );
  assert.equal(m.direction, "na");
  assert.equal(m.tone, "flat");
  assert.equal(m.priorText, "Not published by CMS in this file");
  assert.equal(m.nextText, "Not published by CMS in this file");
  assert.equal(m.deltaText, "Not published by CMS in this file");
  for (const text of [m.priorText, m.nextText, m.deltaText]) {
    assert.doesNotMatch(text, /not included/i, "an unpublished flag must not read as 'No'");
  }
});

test("a published benefit flag still reads Included / Not included", () => {
  assert.equal(formatMetric("bool", true), "Included");
  assert.equal(formatMetric("bool", false), "Not included");
});

test("an unpublished flag on one side is never compared against a published one", () => {
  /* "Newly added" would be a claim about the plan that the file does not
     support when only one side's flag is known. */
  const m = diffMetric(
    METRICS.find((x) => x.field === "hasVision"),
    { hasVision: null },
    { hasVision: true }
  );
  assert.equal(m.direction, "na");
  assert.equal(m.priorText, "Not published by CMS in this file");
  assert.equal(m.nextText, "Included");
  assert.equal(m.deltaText, "Not applicable");
});

test("a real benefit change is still detected", () => {
  const m = diffMetric(
    METRICS.find((x) => x.field === "hasHearing"),
    { hasHearing: true },
    { hasHearing: false }
  );
  assert.equal(m.direction, "removed");
  assert.equal(m.tone, "bad");
  assert.match(m.deltaText, /Dropped/);
});

/* ---- a row nobody can act on is not a row ----------------------------- */

function plan(over) {
  return {
    contractId: "H1234", planId: "001", segmentId: "0",
    planName: "Test Plan (HMO)", orgName: "TestCare", planType: "MAPD", network: "HMO",
    state: "FL", county: "Broward", fips: "12011",
    premium: 20, drugDeductible: 400, moop: 5500, starRating: 4.0,
    hasDrugCoverage: true,
    hasDental: null, hasVision: null, hasHearing: null,
    ...over,
  };
}

function compare(prior, next) {
  const cur = indexPlans([prior]);
  const nxt = indexPlans([next]);
  const xw = indexCrosswalk([
    { fromContractId: "H1234", fromPlanId: "001", toContractId: "H1234", toPlanId: "001", status: "renewal" },
  ]);
  return buildDiff({
    currentIndex: cur, nextIndex: nxt, crosswalk: xw,
    contractId: "H1234", planId: "001", state: "FL", county: "Broward",
  });
}

test("the benefit rows are not rendered when both years are unpublished", () => {
  const d = compare(plan({}), plan({}));
  assert.equal(d.ok, true);
  const fields = d.metrics.map((m) => m.field);
  assert.ok(!fields.includes("hasDental"), "dental row should be absent");
  assert.ok(!fields.includes("hasVision"), "vision row should be absent");
  assert.ok(!fields.includes("hasHearing"), "hearing row should be absent");
  /* The rows that DO carry a number are still there. */
  assert.ok(fields.includes("premium"));
  assert.ok(fields.includes("drugDeductible"));
  assert.ok(fields.includes("moop"));
  assert.ok(fields.includes("starRating"));
});

test("a one-sided unpublished benefit row is still rendered", () => {
  const d = compare(plan({ hasDental: null }), plan({ hasDental: true }));
  assert.equal(d.ok, true);
  const dental = d.metrics.find((m) => m.field === "hasDental");
  assert.ok(dental, "the dental row should be present when one side published it");
  assert.equal(dental.priorText, "Not published by CMS in this file");
  assert.equal(dental.nextText, "Included");
  assert.equal(dental.direction, "na");
});

test("a benefit flag that is published on both sides is rendered normally", () => {
  const d = compare(plan({ hasDental: true }), plan({ hasDental: false }));
  const dental = d.metrics.find((m) => m.field === "hasDental");
  assert.ok(dental);
  assert.equal(dental.direction, "removed");
  assert.equal(dental.tone, "bad");
});

test("a false flag is NOT treated as unpublished", () => {
  /* false means CMS published it and it says "no" — that is a fact about
     the plan, and the row belongs in the table. */
  const d = compare(plan({ hasDental: false }), plan({ hasDental: false }));
  const dental = d.metrics.find((m) => m.field === "hasDental");
  assert.ok(dental, "a published false flag must still be a row");
  assert.equal(dental.priorText, "Not included");
  assert.equal(dental.direction, "flat");
});
