import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCrosswalkRow, STATUS_MAP, realId } from "../scripts/lib/crosswalk-map.mjs";

/* One CMS row as the crosswalk file stores it: the tab-delimited columns the
   normalizer reads, reduced to the five that matter. */
const row = (prevContract, prevPlan, currContract, currPlan, status) => ({
  prevContract,
  prevPlan,
  currContract,
  currPlan,
  status,
});

test("a renewal plan keeps its contract and plan id", () => {
  const m = mapCrosswalkRow(row("H0028", "028", "H0028", "028", "Renewal Plan"));
  assert.deepEqual(m, {
    previous_contract_id: "H0028",
    previous_plan_id: "028",
    contract_id: "H0028",
    plan_id: "028",
    status: "renewal",
  });
});

test("a renewal plan that EXPANDS its service area is still a renewal", () => {
  /* CMS: "A 2027 plan that links to a 2026 plan and retains all of its plan
     service area from 2026 but also adds one or more new counties." The plan
     keeps its ID and its counties, so it is a renewal — the site's only
     service-area state is a reduction. */
  const m = mapCrosswalkRow(row("H0029", "007", "H0029", "007", "Renewal Plan with an SAE"));
  assert.equal(m.status, "renewal");
  assert.equal(m.previous_plan_id, "007");
  assert.equal(m.plan_id, "007");
});

test("a renewal plan that SHRINKS its service area is a service-area reduction", () => {
  const m = mapCrosswalkRow(row("H0028", "014", "H0028", "014", "Renewal Plan with a SAR"));
  assert.equal(m.status, "service-area-reduction");
  assert.equal(m.previous_contract_id, "H0028");
  assert.equal(m.plan_id, "014");
});

test("a consolidated plan points at the successor plan that continues", () => {
  /* CMS: two or more 2026 plans consolidate into one 2027 plan; the resultant
     plan id is one of the consolidating 2026 plan ids. */
  const m = mapCrosswalkRow(row("H5322", "029", "H0169", "004", "Consolidated Renewal Plan"));
  assert.equal(m.status, "consolidation");
  assert.equal(m.previous_contract_id, "H5322");
  assert.equal(m.previous_plan_id, "029");
  assert.equal(m.contract_id, "H0169");
  assert.equal(m.plan_id, "004");
});

test("a terminated plan has a prior plan and no successor", () => {
  /* CMS writes the literal token "TERMINATED" in the current-plan columns. */
  const m = mapCrosswalkRow(row("H0029", "009", "TERMINATED", "TERMINATED", "Terminated/Non-renewed Contract"));
  assert.equal(m.status, "termination");
  assert.equal(m.previous_contract_id, "H0029");
  assert.equal(m.previous_plan_id, "009");
  assert.equal(m.contract_id, "");
  assert.equal(m.plan_id, "");
});

test("a new plan has a successor and no prior plan", () => {
  /* CMS writes the literal token "NEW" in the previous-plan columns. */
  const m = mapCrosswalkRow(row("H0062", "NEW", "H0062", "013", "New Plan"));
  assert.equal(m.status, "new");
  assert.equal(m.previous_plan_id, "");
  assert.equal(m.contract_id, "H0062");
  assert.equal(m.plan_id, "013");
});

test("an initial contract is a new plan", () => {
  const m = mapCrosswalkRow(row("H0279", "NEW", "H0279", "801", "Initial Contract"));
  assert.equal(m.status, "new");
  assert.equal(m.previous_plan_id, "");
  assert.equal(m.plan_id, "801");
});

test("plan ids are zero-padded to three digits", () => {
  const m = mapCrosswalkRow(row("H1234", "1", "H1234", "1", "Renewal Plan"));
  assert.equal(m.previous_plan_id, "001");
  assert.equal(m.plan_id, "001");
});

test("an unknown CMS status is dropped rather than guessed", () => {
  assert.equal(mapCrosswalkRow(row("H1", "001", "H1", "001", "Something Else")), null);
  assert.equal(mapCrosswalkRow(row("H1", "001", "H1", "001", "")), null);
});

test("every CMS status in the published vocabulary maps to one of the five states", () => {
  const allowed = new Set(["renewal", "consolidation", "service-area-reduction", "termination", "new"]);
  for (const [cmsStatus, mapped] of Object.entries(STATUS_MAP)) {
    assert.ok(allowed.has(mapped), `${cmsStatus} maps to ${mapped}, which is not a site state`);
    const m = mapCrosswalkRow(row("H1", "001", "H1", "001", cmsStatus));
    assert.equal(m.status, mapped);
  }
});

test("CMS sentinel tokens are never mistaken for real ids", () => {
  for (const sentinel of ["NEW", "new", "TERMINATED", "terminated", "None", "N/A", ""]) {
    assert.equal(realId(sentinel), "", `${sentinel} should not be a real id`);
  }
  assert.equal(realId("H1234"), "H1234");
});
