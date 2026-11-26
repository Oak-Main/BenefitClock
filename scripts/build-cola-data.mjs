/* ==========================================================================
   build-cola-data.mjs — turns src/data/cola-history.csv into src/data/cola.json
   consumed by the COLA calculator, the Key Dates page, and the methodology page.

   Refreshing from the source (optional, requires network to BLS/SSA):
     - Official COLAs:  https://www.ssa.gov/cola/
     - CPI-W (CWUR0000SA0) series: https://www.bls.gov/cpi/  (BLS API v2)
   The bundled CSV keeps builds reproducible offline; update it each October
   after the SSA announcement.
   ========================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { colaFromQuarterAverages, reconcileCola, projectBenefit, determinationCycleYear } from "../src/assets/js/lib/cola-core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "src", "data");

function parseCsv(text) {
  // Comment lines (# …) carry the refresh notes and come BEFORE the header;
  // the medicare-figures and aep CSVs use the same convention.
  const [head, ...rows] = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"));
  const cols = head.split(",");
  return rows.map((line) => {
    const cells = line.split(",");
    const row = {};
    cols.forEach((c, i) => (row[c.trim()] = (cells[i] ?? "").trim()));
    return row;
  });
}

const rows = parseCsv(readFileSync(join(DATA, "cola-history.csv"), "utf8")).map((r) => ({
  year: Number(r.year),
  colaPct: Number(r.cola_pct),
  effective: r.effective || null,
  announced: r.announced || null,
  q3CpiwAvg: r.q3_cpiw_avg ? Number(r.q3_cpiw_avg) : null,
  status: r.status || "official",
  source: r.source || "",
  /* Deliberately NOT the `announced` column. `announced` is a provenance date —
     build.mjs derives "Data last refreshed" from the newest one — so putting a
     FUTURE expected date there would date-stamp the whole site into the future.
     This is the date the site says the next COLA is *expected*, which is a
     forward-looking claim about a cycle that has not happened yet. */
  announceExpected: r.announce_expected || null,
  /* Optional, official rows only: why the announcement came later than usual
     (no commas — this CSV is split on them). The site's "the date can move"
     sentences cite the most recent LATE announcement by this column, instead
     of whichever COLA happens to be newest, so a punctual announcement never
     gets described as a late one. */
  lateReason: r.late_reason || null,
}));

const official = rows.filter((r) => r.status === "official").sort((a, b) => a.year - b.year);
const projectedRow = rows.find((r) => r.status === "projected");
const latestOfficial = official[official.length - 1];
const latestLate = [...official].reverse().find((r) => r.lateReason && r.announced) || null;

/* "Today" in US Eastern: the announcement is a US event, and a UTC clock rolls
   over while it is still the previous afternoon in Washington. Hoisted here so
   both the projected-row guard and the determination-cycle row can use it. */
const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/* The dollar-impact worked examples: 2026 benefit-year base amounts (SSA's
   fact sheet figures) that the current cycle's COLA is applied to. */
const exampleRows = parseCsv(readFileSync(join(DATA, "benefit-examples.csv"), "utf8")).map((r) => ({
  key: r.key,
  label: r.label,
  monthlyBase: Number(r.monthly_base),
  partbBase: Number(r.partb_base || 0),
  source: r.source || "",
  publishedAfter: r.monthly_after_published ? Number(r.monthly_after_published) : null,
}));
for (const e of exampleRows) {
  if (!e.key || !e.label || !Number.isFinite(e.monthlyBase) || e.monthlyBase <= 0) {
    throw new Error(
      `benefit-examples.csv: the row ${JSON.stringify(e.key)} is missing a key, a label, or a usable monthly_base. ` +
        `These amounts are quoted as dollar figures on the COLA guide — the build will not guess them.`
    );
  }
}

/* The cycle the site tells the story of — see determinationCycleYear. During
   the Sept–Dec determination window that is the raise about to be announced
   (the projected row, or the official row once the announcement lands); the
   rest of the year it is the raise now being paid. Keying the worked examples
   to this row is what makes announcement day a one-row data edit: the same
   table that reads "projected 3.5%" reads "confirmed by SSA" the moment the
   cycle row is promoted, before any next-year projection row is added. */
const cycleYear = determinationCycleYear(todayET);
const cycleRow = rows.find((r) => r.year === cycleYear) || latestOfficial;

/* The official COLA just before the cycle year: the calculator's second choice.
   It used to be "the newest official COLA", which on announcement day becomes
   the cycle's own COLA and would have listed the same percentage twice. */
const priorRow = [...official].reverse().find((r) => r.year < cycleRow.year) || null;

const examples = exampleRows.map((e) => {
  const p = projectBenefit({ priorGross: e.monthlyBase, colaPercent: cycleRow.colaPct, priorPartB: e.partbBase });
  if (e.publishedAfter !== null) {
    /* SSA publishes this figure for each year itself (benefit-examples.csv,
       monthly_after_published): show it, not monthly_base x COLA. */
    if (!Number.isFinite(e.publishedAfter) || e.publishedAfter <= 0) {
      throw new Error(`benefit-examples.csv: the row ${JSON.stringify(e.key)} has an unusable monthly_after_published.`);
    }
    const inc = e.publishedAfter - e.monthlyBase;
    return {
      key: e.key,
      label: e.label,
      source: e.source,
      monthlyBefore: e.monthlyBase,
      monthlyAfter: e.publishedAfter,
      increase: inc,
      increaseYear: inc * 12,
      partB: p.priorPartB,
      netIncrease: inc,
      published: true,
    };
  }
  return {
    key: e.key,
    label: e.label,
    source: e.source,
    monthlyBefore: p.priorGross,
    monthlyAfter: p.newGross,
    increase: p.grossIncrease,
    increaseYear: p.grossIncrease * 12,
    partB: p.priorPartB,
    netIncrease: p.netIncrease,
  };
});

// Worked example: recompute the most recent official COLA from CPI-W to prove
// the formula (prior year's Q3 average vs the year before that).
let worked = null;
if (official.length >= 2) {
  const cur = official[official.length - 1];
  const prev = official[official.length - 2];
  if (cur.q3CpiwAvg && prev.q3CpiwAvg) {
    const c = colaFromQuarterAverages(prev.q3CpiwAvg, cur.q3CpiwAvg);
    /* The build already knew. It computed this reconciliation, printed
       "worked check X% (official Y%)" to the log, and shipped Y regardless —
       so a mistyped cola_pct reached the calculator's own dropdown, the
       homepage and four guides with 66 tests and every CI check green.
       Refusing to build is the point: this figure is a benefit increase
       people plan around, and it is quoted on five pages. */
    const check = reconcileCola(prev.q3CpiwAvg, cur.q3CpiwAvg, cur.colaPct);
    if (!check.agrees) {
      throw new Error(
        `cola-history.csv: the published ${cur.year} COLA (${check.publishedColaPercent}%) does not ` +
        `match the ${check.computedColaPercent}% the statutory formula gives for the Q3 CPI-W ` +
        `averages on the same rows (${prev.year - 1}: ${prev.q3CpiwAvg} → ${cur.year - 1}: ${cur.q3CpiwAvg}). ` +
        `One of the three is wrong. Refusing to build: this figure is quoted as a confirmed ` +
        `benefit increase on five pages and is the calculator's default.`
      );
    }
    worked = {
      priorDeterminationYear: prev.year - 1,
      priorQ3Avg: prev.q3CpiwAvg,
      currentDeterminationYear: cur.year - 1,
      currentQ3Avg: cur.q3CpiwAvg,
      computedColaPercent: Number(c.colaPercent.toFixed(1)),
      officialColaPercent: cur.colaPct,
      colaEffectiveYear: cur.year,
    };
  }
}

/* The announcement date is quoted as a FUTURE event ("expected on …") in 18
   places across 8 pages, including four FAQPage blocks. Nothing about a static
   build notices the day that stops being true: the date used to be a literal in
   this file, so every rebuild re-shipped it unchanged and the site would have
   spent the whole of AEP telling readers to wait for an announcement that had
   already happened. It now comes from the data, and the build refuses to
   produce that copy once the date is behind us. */
if (projectedRow) {
  if (!projectedRow.announceExpected) {
    throw new Error(
      `cola-history.csv: the projected ${projectedRow.year} row has no announce_expected date. ` +
        `Eight pages say the official COLA is "expected on" that date, so the build will not ` +
        `guess it. Add the expected BLS/SSA announcement date to the row.`
    );
  }
  // "Today" in US Eastern, computed above — the announcement is a US event,
  // and a UTC clock rolls over while it is still the previous afternoon in
  // Washington.
  if (todayET > projectedRow.announceExpected) {
    throw new Error(
      `cola-history.csv: the ${projectedRow.year} COLA announcement was expected on ` +
        `${projectedRow.announceExpected}, which is now in the past (today is ${todayET}), but the row ` +
        `is still status=projected. Eight pages currently say that date is still ahead of the reader.\n` +
        `Do one of these:\n` +
        `  • The SSA has announced — promote the ${projectedRow.year} row to status=official with the ` +
        `real cola_pct, q3_cpiw_avg and announced date (a next-year projected row is optional — add one only ` +
        `when you have a source for it).\n` +
        `  • The SSA has not announced yet (the date does slip — 2026 ran to October 24) — move ` +
        `announce_expected forward to the new expected date.\n` +
        `Refusing to build: this copy tells people when to expect a change to their benefit.`
    );
  }
}

const out = {
  generatedFrom: "src/data/cola-history.csv",
  confirmedYear: latestOfficial.year,
  confirmedCola: latestOfficial.colaPct,
  confirmedAnnounced: latestOfficial.announced,
  // Set only when the newest official COLA was announced later than usual.
  confirmedLateReason: latestOfficial.lateReason,
  // The most recent official COLA that was announced late — see lateReason.
  lateYear: latestLate ? latestLate.year : null,
  lateAnnounced: latestLate ? latestLate.announced : null,
  projectedYear: projectedRow ? projectedRow.year : null,
  projectedCola: projectedRow ? projectedRow.colaPct : null,
  projectedSource: projectedRow ? projectedRow.source : null,
  // The official CPI-W release + SSA COLA announcement for the projected cycle,
  // from the data rather than a literal — see the guard above.
  nextAnnouncementDate: projectedRow ? projectedRow.announceExpected : null,
  nextAnnouncementNote: "BLS releases September CPI-W at 8:30 a.m. ET; SSA typically announces the official COLA the same day.",
  // The benefit-year whose raise the site is currently telling the story of —
  // see determinationCycleYear — with its status, so the guide's dollar-impact
  // content can label itself "projected" today and "confirmed by SSA" on
  // announcement day without a markup edit.
  cycle: {
    year: cycleRow.year,
    cola: cycleRow.colaPct,
    status: cycleRow.status,
    announced: cycleRow.announced,
    effective: cycleRow.effective,
    source: cycleRow.source,
    priorYear: priorRow ? priorRow.year : null,
    priorCola: priorRow ? priorRow.colaPct : null,
  },
  // The current cycle's COLA applied to SSA's published base amounts
  // (src/data/benefit-examples.csv). Recomputed on every build, so the
  // announcement-day CSV edit re-prices the whole table.
  examples: {
    generatedFrom: "src/data/benefit-examples.csv",
    rows: examples,
  },
  history: rows,
  worked,
};

writeFileSync(join(DATA, "cola.json"), JSON.stringify(out, null, 2) + "\n");
console.log(
  `  cola.json: confirmed ${out.confirmedYear}=${out.confirmedCola}% · projected ${out.projectedYear}=${out.projectedCola}%` +
    ` · cycle ${out.cycle.year} ${out.cycle.status} ${out.cycle.cola}% (avg check ${usdExample(examples.find((e) => e.key === "average"))})` +
    (worked ? ` · worked check ${worked.computedColaPercent}% (official ${worked.officialColaPercent}%)` : "")
);

function usdExample(e) {
  return e ? `$${e.monthlyBefore.toLocaleString("en-US")}→$${e.monthlyAfter.toLocaleString("en-US")} (+$${e.increase}/mo)` : "n/a";
}
