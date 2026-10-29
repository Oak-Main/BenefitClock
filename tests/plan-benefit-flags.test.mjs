import { test } from "node:test";
import assert from "node:assert/strict";
import { diffMetric, METRICS, formatMetric } from "../src/assets/js/lib/plandiff-core.js";

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
