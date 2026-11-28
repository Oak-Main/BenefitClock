import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, toRows, deriveAep } from "../scripts/build-aep-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = join(ROOT, "src", "pages");

const HEAD = "season_year,coverage_year,window_start,window_end,ma_oep_start,ma_oep_end,status,source_updated,source";
const row = (o = {}) => {
  const d = {
    season_year: 2026, coverage_year: 2027,
    window_start: "2026-10-15", window_end: "2026-12-07",
    ma_oep_start: "2027-01-01", ma_oep_end: "2027-03-31",
    status: "current", source_updated: "2026-10-15", source: "CMS",
    ...o,
  };
  return [d.season_year, d.coverage_year, d.window_start, d.window_end,
    d.ma_oep_start, d.ma_oep_end, d.status, d.source_updated, d.source].join(",");
};
const csv = (...rows) => [HEAD, ...rows].join("\n");
const derive = (...rows) => deriveAep(toRows(csv(...rows)));

test("parseCsv skips comment lines so a written-in caveat is never a data row", () => {
  const rows = parseCsv(`# a caveat about the figures\n${HEAD}\n${row()}`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].season_year, "2026");
});

test("derives the season, coverage year and every phrasing the pages quote", () => {
  const a = derive(row());
  assert.equal(a.seasonYear, 2026);
  assert.equal(a.coverageYear, 2027);
  assert.equal(a.windowStartLabel, "October 15");
  assert.equal(a.windowEndLabel, "December 7");
  assert.equal(a.windowEndLong, "December 7, 2026");
  assert.equal(a.windowRange, "October 15 – December 7");
  assert.equal(a.windowRangeLong, "October 15 – December 7, 2026");
  assert.equal(a.coverageStartLabel, "January 1");
  assert.equal(a.coverageStartLong, "January 1, 2027");
  assert.equal(a.maOepRangeLong, "January 1 – March 31, 2027");
});

test("the season rolls purely from the data", () => {
  const a = derive(row({ season_year: 2027, coverage_year: 2028,
    window_start: "2027-10-15", window_end: "2027-12-07",
    ma_oep_start: "2028-01-01", ma_oep_end: "2028-03-31" }));
  assert.equal(a.seasonYear, 2027);
  assert.equal(a.windowRangeLong, "October 15 – December 7, 2027");
  assert.equal(a.maOepRangeLong, "January 1 – March 31, 2028");
});

test("a statutory date change flows through without touching markup", () => {
  const a = derive(row({ window_start: "2026-10-01", window_end: "2026-12-15" }));
  assert.equal(a.windowRangeLong, "October 1 – December 15, 2026");
});

test("no current season is a build failure, not a stale window left on the page", () => {
  assert.throws(() => derive(row({ status: "past" })), /exactly one row with status=current/);
});

test("two current seasons are rejected rather than silently picking one", () => {
  assert.throws(
    () => derive(row(), row({ season_year: 2027, coverage_year: 2028,
      window_start: "2027-10-15", window_end: "2027-12-07",
      ma_oep_start: "2028-01-01", ma_oep_end: "2028-03-31" })),
    /found 2/
  );
});

test("adding next season early does not roll the site onto an unopened window", () => {
  const a = derive(
    row(),
    row({ season_year: 2027, coverage_year: 2028, window_start: "2027-10-15",
      window_end: "2027-12-07", ma_oep_start: "2028-01-01", ma_oep_end: "2028-03-31",
      status: "future" })
  );
  assert.equal(a.seasonYear, 2026);
});

test("coverage year must be the season year plus one", () => {
  assert.throws(() => derive(row({ coverage_year: 2029 })), /must be season_year \+ 1/);
});

test("window dates must fall inside the season year", () => {
  assert.throws(() => derive(row({ window_start: "2025-10-15" })), /window dates must fall in 2026/);
});

test("MA OEP dates must fall inside the coverage year", () => {
  assert.throws(() => derive(row({ ma_oep_end: "2028-03-31" })), /MA OEP dates must fall in the coverage year/);
});

test("an inverted window is rejected", () => {
  assert.throws(() => derive(row({ window_end: "2026-10-01" })), /window_end must come after window_start/);
});

test("a malformed date is rejected rather than rendered as-is", () => {
  assert.throws(() => derive(row({ window_start: "15-10-2026" })), /must be an ISO date/);
  assert.throws(() => derive(row({ window_start: "" })), /must be an ISO date/);
  assert.throws(() => derive(row({ window_start: "2026-13-01" })), /not a real date/);
});

/* A day-of-month bound of 1-31 accepts dates that do not exist. These are
   enrolment deadlines: an accepted "2026-11-31" renders as "November 31" in
   body copy, meta description and FAQPage structured data, build green. */
test("a day past the end of its month is rejected, not rendered", () => {
  assert.throws(() => derive(row({ window_end: "2026-11-31" })), /not a real date/);
  assert.throws(() => derive(row({ window_start: "2026-09-31" })), /not a real date/);
  assert.throws(() => derive(row({ ma_oep_end: "2027-02-30" })), /not a real date/);
});

test("the last real day of a month is still accepted", () => {
  // Guards the fix from over-correcting: a 31-day month, a 30-day month and a
  // leap-year February must all still parse.
  assert.equal(derive(row({ window_end: "2026-12-31" })).windowEndLong, "December 31, 2026");
  assert.equal(derive(row({ window_start: "2026-09-30" })).windowStartLabel, "September 30");
  const leap = row({ season_year: 2027, coverage_year: 2028,
    window_start: "2027-10-15", window_end: "2027-12-07",
    ma_oep_start: "2028-01-01", ma_oep_end: "2028-02-29", source_updated: "2027-10-15" });
  assert.equal(derive(leap).maOepEnd, "2028-02-29");
  assert.match(derive(leap).maOepRangeLong, /February 29, 2028$/);
});

/* The defect these guard against: markup that looks data-bound but is not.
   `data-year-*` spans are only rewritten by plan-diff.js, which loads on the
   plan tool page alone — so on every other page the fallback text was the
   number people actually read, frozen at whatever year it was typed in. */
const pageFiles = readdirSync(PAGES).filter((f) => f.endsWith(".html"));

/* A sweep over a directory is only a guard while the directory has files in
   it. If PAGES ever moves, every filter below returns [] and all three tests
   pass while checking nothing. */
test("the page sweep these guards depend on is not empty", () => {
  assert.ok(pageFiles.length >= 13, `expected the 13+ source pages, found ${pageFiles.length}`);
});

/* Anchor on the ELEMENT, not on the attribute being written last. The previous
   pattern was /data-year-[a-z]+>\s*\d{4}/, which required `>` to follow the
   attribute name immediately — so `<span data-year-next class="yr">2027</span>`
   sailed past it. One added attribute, a routine styling edit, switched the
   guard off. */
const HARDCODED_YEAR_SPAN = /<[a-z]+\b[^>]*\bdata-year-[a-z]+\b[^>]*>\s*\d{4}/i;

test("no page hardcodes a year inside a data-year span", () => {
  const offenders = pageFiles.filter((f) =>
    HARDCODED_YEAR_SPAN.test(readFileSync(join(PAGES, f), "utf8"))
  );
  assert.deepEqual(offenders, [], `hardcoded year in a data-year span: ${offenders.join(", ")}`);
});

test("the hardcoded-year guard still fires when other attributes follow data-year-*", () => {
  // The exact shape that defeated the old pattern.
  assert.ok(HARDCODED_YEAR_SPAN.test('<span data-year-next class="yr">2027</span>'));
  assert.ok(HARDCODED_YEAR_SPAN.test('<span class="yr" data-year-current id="x">2026</span>'));
  assert.ok(HARDCODED_YEAR_SPAN.test("<span data-year-next>2027</span>"));
  // and does not fire on the bound form the pages actually use
  assert.ok(!HARDCODED_YEAR_SPAN.test('<span data-year-next class="yr">{{PLAN_YEAR_NEXT}}</span>'));
});

test("data-year spans only appear on pages that actually load plan-diff.js", () => {
  const offenders = pageFiles.filter((f) => {
    const src = readFileSync(join(PAGES, f), "utf8");
    return src.includes("data-year-") && !/^scripts:.*plan-diff\.js/m.test(src);
  });
  assert.deepEqual(offenders, [], `data-year span with no script to fill it: ${offenders.join(", ")}`);
});

/* Pages are resolved by what they BIND, never by filename. Pinning the filename
   meant renaming the source file failed the deploy with a bare ENOENT from
   readFileSync, which names no cause a redesigner could act on.

   This used to resolve "the AEP guide" as the single page carrying {{AEP_*}}
   tokens, and assert that exactly one existed. That premise expired: the
   enrolment dates were being written as literals on five other pages, all
   rendering the identical string, so the roll would have moved the guide while
   the rest of the site stayed pinned to a closed window. Those pages now bind
   the tokens too, so the rule is enforced across every page instead of one —
   which is what "no enrolment date except through the data layer" always meant. */
function aepBoundPages() {
  const hits = pageFiles.filter((f) => /\{\{AEP_[A-Z_]+\}\}/.test(readFileSync(join(PAGES, f), "utf8")));
  assert.ok(
    hits.length >= 1,
    "no page uses the {{AEP_*}} tokens — the AEP data layer is unreachable from the markup"
  );
  return hits;
}

test("the AEP data layer is reached through tokens, not filenames", () => {
  for (const f of aepBoundPages()) assert.ok(f.endsWith(".html"));
});

test("no page states an enrolment date except through the data layer", () => {
  const offenders = [];
  for (const f of pageFiles) {
    const src = readFileSync(join(PAGES, f), "utf8");
    // The AEP guide's own slug carries a year — that is a URL, not a date.
    const body = src.split("\n").filter((l) => !l.includes("/guides/medicare-aep-2026")).join("\n");
    const literals = body.match(/October \d+|December \d+|November \d{4}|March 31|January 1(?!\d)/g) || [];
    if (literals.length) offenders.push(`${f}: ${literals.join(", ")}`);
  }
  assert.deepEqual(
    offenders, [],
    `enrolment date written into markup — bind the {{AEP_*}} token instead: ${offenders.join(" | ")}`
  );
});

/* The nonrenewal Special Enrollment Period (CMS enrollment guidance §30.6.10.A)
   is quoted on /key-dates and the AEP checklist through {{AEP_NONRENEWAL_SEP_START}}. */
test("nonrenewal SEP start comes from aep.csv and must follow the AEP in December", () => {
  const H = "season_year,coverage_year,window_start,window_end,ma_oep_start,ma_oep_end,nonrenewal_sep_start,status,source_updated,source";
  const r = (sep) => `2026,2027,2026-10-15,2026-12-07,2027-01-01,2027-03-31,${sep},current,2026-10-15,CMS`;
  const d = deriveAep(toRows([H, r("2026-12-08")].join("\n")));
  assert.equal(d.nonrenewalSepStart, "2026-12-08");
  assert.equal(d.nonrenewalSepStartLabel, "December 8");
  assert.throws(() => deriveAep(toRows([H, r("2026-12-07")].join("\n"))), /nonrenewal_sep_start/);
  assert.throws(() => deriveAep(toRows([H, r("2027-01-08")].join("\n"))), /nonrenewal_sep_start/);
  assert.equal(derive(row()).nonrenewalSepStartLabel, null);
});
