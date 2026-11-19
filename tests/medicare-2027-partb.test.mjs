// Gate for the 2027 Part B figures (Away Run 6, T8). Fails while any staged value is empty,
// so the 2027 premium, deductible and IRMAA rows cannot ship half-filled.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function rows(path) {
  const lines = readFileSync(new URL(path, import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"));
  const head = lines.shift().split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [head[i], v.trim()])));
}

test("2027 Part B premium and deductible are filled", () => {
  const y2027 = rows("../src/data/medicare-figures.csv").find((r) => r.year === "2027");
  assert.ok(y2027, "medicare-figures.csv has a 2027 row");
  for (const k of ["part_b_premium", "part_b_deductible"]) {
    assert.notEqual(y2027[k], "", `2027 ${k} is empty`);
    assert.ok(Number.isFinite(Number(y2027[k])), `2027 ${k} is a number`);
  }
});

test("2027 IRMAA rows are filled (individual, joint, married filing separately)", () => {
  const t = rows("../src/data/part-b-irmaa-2027.csv");
  assert.equal(t.filter((r) => r.filing === "individual").length, 6);
  assert.equal(t.filter((r) => r.filing === "joint").length, 6);
  assert.equal(t.filter((r) => r.filing === "separate").length, 3);
  const empty = [];
  for (const r of t) {
    for (const k of ["irmaa", "total_monthly_premium", "status", "source_updated", "source"]) {
      if (r[k] === "") empty.push(`${r.filing} tier ${r.tier}: ${k}`);
    }
    // Tier 1 has no lower bound and the top tier has no upper bound; every other bound is required.
    const top = r.filing === "separate" ? "3" : "6";
    if (r.tier !== "1" && r.magi_over === "") empty.push(`${r.filing} tier ${r.tier}: magi_over`);
    if (r.tier !== top && r.magi_up_to === "") empty.push(`${r.filing} tier ${r.tier}: magi_up_to`);
  }
  assert.deepEqual(empty, [], `empty IRMAA cells:\n${empty.join("\n")}`);
});
