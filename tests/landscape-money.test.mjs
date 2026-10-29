import { test } from "node:test";
import assert from "node:assert/strict";
import { money, selectPremium, stars } from "../scripts/lib/landscape-money.mjs";

/* The monthly premium a member actually pays for a plan.
 *
 * `Monthly Consolidated Premium (Part C + D)` is what Medicare shows a member
 * for a plan with drug coverage. `Part C Premium` is the medical benefit
 * alone, and CMS very often writes $0.00 there for a MAPD because the Part C
 * premium is waived. So the consolidated column has to win whenever CMS
 * publishes a number in it — and the choice has to be made on PARSABILITY,
 * because money() returns the string "0", which is truthy. */

test("a $0 Part C premium does not hide a real consolidated premium", () => {
  assert.equal(selectPremium("$12.40", "$0.00"), "12.4");
  assert.equal(selectPremium("$12.40", "0.00"), "12.4");
});

test("an unparseable consolidated premium falls back to the Part C premium", () => {
  assert.equal(selectPremium("Not Applicable", "$35.00"), "35");
  assert.equal(selectPremium("Not Applicable", "0.00"), "0");
});

test("both premiums $0 is a real $0, not a missing value", () => {
  assert.equal(selectPremium("$0.00", "$0.00"), "0");
  assert.equal(selectPremium("0", "0"), "0");
});

test("neither premium parses is empty, never NaN and never a made-up 0", () => {
  assert.equal(selectPremium("Not Applicable", "Not Applicable"), "");
  assert.equal(selectPremium("", ""), "");
  assert.equal(selectPremium("Plan Too New To Be Measured", "N/A"), "");
  const picked = selectPremium("Not Applicable", "Not Applicable");
  assert.notEqual(picked, "NaN");
  /* The empty string is the point: Number("") is 0, so a consumer that
     coerces without checking for "" first would turn an unknown premium into
     a real free plan. The build's numOrNull() checks for "" before it
     coerces, and this is the value it has to be handed. */
  assert.equal(picked, "");
  assert.equal(Number(picked), 0, "why the consumer must check for \"\" before coercing");
});

test("the consolidated premium wins even when Part C is higher", () => {
  /* A plan can charge more for the drug benefit than the medical benefit
     premium CMS would have shown on its own. The member pays the sum. */
  assert.equal(selectPremium("$49.00", "$20.00"), "49");
});

test("money() keeps a real zero and rejects a non-number", () => {
  assert.equal(money("$0.00"), "0");
  assert.equal(money("0"), "0");
  assert.equal(money(""), "");
  assert.equal(money("Not Applicable"), "");
  assert.equal(money(null), "");
  assert.equal(money(undefined), "");
});

test("money() reads a CMS money cell", () => {
  assert.equal(money("$1,234.50"), "1234.5");
  assert.equal(money("18.60"), "18.6");
  assert.equal(money("($52.20)"), "-52.2");
});

test("a non-numeric star rating is 'not rated', not a number", () => {
  assert.equal(stars("4.5"), "4.5");
  assert.equal(stars("Plan Too New To Be Measured"), "");
  assert.equal(stars("Not Enough Data Available"), "");
  assert.equal(stars(""), "");
});
