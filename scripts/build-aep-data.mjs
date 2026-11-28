/* ==========================================================================
   build-aep-data.mjs — turns src/data/aep.csv into src/data/aep.json.

   The Annual Enrollment Period is the fall window for changing Medicare
   coverage; whatever you change takes effect January 1 of the following year.
   The enrolment season and that coverage year move together, on a schedule of
   their own — the COLA year and the Part B figures year both roll at different
   moments, so neither can stand in for them.

   The season used to be written into markup as a literal, which meant the page
   would keep advertising a window that had already closed until somebody
   noticed. Keeping it here lets the build assert a season is actually declared.

   Refreshing each autumn: add the next season's row and move `status=current`
   onto it.
   ========================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "src", "data");

export function parseCsv(text) {
  // `#` lines are comments. Without this a caveat written into the file would
  // silently parse as a data row — exactly the kind of quiet wrong number this
  // whole data layer exists to prevent.
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  const [head, ...rows] = lines;
  const cols = head.split(",");
  return rows.map((line) => {
    const cells = line.split(",");
    const row = {};
    cols.forEach((c, i) => (row[c.trim()] = (cells[i] ?? "").trim()));
    return row;
  });
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* Dates are stored ISO so they sort and diff cleanly, but every one of them is
   read aloud in body copy, so the presentation forms are derived here rather
   than being hand-written into pages a second time. */
function parseIso(iso, field) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) throw new Error(`aep.csv: ${field} must be an ISO date (YYYY-MM-DD), got "${iso}"`);
  const [, y, mo, d] = m.map(Number);
  /* Check the day against the length of THAT month, not a flat 1-31. A blanket
     upper bound accepts November 31 and February 30, and every one of these
     dates is read aloud as an enrolment deadline — "November 31" would render
     into body copy, metadata and structured data with the build green. */
  const monthLength = mo >= 1 && mo <= 12 ? new Date(Date.UTC(y, mo, 0)).getUTCDate() : 0;
  if (mo < 1 || mo > 12 || d < 1 || d > monthLength) {
    throw new Error(`aep.csv: ${field} is not a real date: "${iso}"`);
  }
  return { year: y, month: mo, day: d, iso: String(iso).trim() };
}

const monthDay = (p) => `${MONTHS[p.month - 1]} ${p.day}`;
const longDate = (p) => `${monthDay(p)}, ${p.year}`;

export function toRows(text) {
  return parseCsv(text)
    .map((r) => ({
      seasonYear: Number(r.season_year),
      coverageYear: Number(r.coverage_year),
      windowStart: r.window_start,
      windowEnd: r.window_end,
      maOepStart: r.ma_oep_start,
      maOepEnd: r.ma_oep_end,
      nonrenewalSepStart: r.nonrenewal_sep_start || null,
      status: r.status || "past",
      sourceUpdated: r.source_updated || null,
      source: r.source || "",
    }))
    .sort((a, b) => a.seasonYear - b.seasonYear);
}

/* Pure so the validation rules below can be tested directly — they are the
   whole reason this file exists, and a rule nothing exercises is a rule that
   quietly stops holding. */
export function deriveAep(rows) {
  if (!rows.length) throw new Error("aep.csv has no rows");

  /* Exactly one current season. Picking "the newest row" instead would mean that
     adding next season's row early — a natural thing to do — silently rolls the
     live site onto a window that has not opened yet. */
  const currentRows = rows.filter((r) => r.status === "current");
  if (currentRows.length !== 1) {
    throw new Error(
      `aep.csv must have exactly one row with status=current, found ${currentRows.length}. ` +
        `Move status=current onto the season the site should be describing.`
    );
  }
  const current = currentRows[0];

  const start = parseIso(current.windowStart, "window_start");
  const end = parseIso(current.windowEnd, "window_end");
  const coverage = parseIso(current.maOepStart, "ma_oep_start");
  const oepEnd = parseIso(current.maOepEnd, "ma_oep_end");

  if (!Number.isInteger(current.seasonYear) || !Number.isInteger(current.coverageYear)) {
    throw new Error("aep.csv: the current row needs a numeric season_year and coverage_year");
  }
  /* Coverage from a fall window always begins the next calendar year. If these
     ever disagree the copy would tell people their new plan starts in a year it
     does not, so it is a build failure rather than a rendered contradiction. */
  if (current.coverageYear !== current.seasonYear + 1) {
    throw new Error(
      `aep.csv: coverage_year (${current.coverageYear}) must be season_year + 1 (${current.seasonYear + 1})`
    );
  }
  if (start.year !== current.seasonYear || end.year !== current.seasonYear) {
    throw new Error(`aep.csv: the ${current.seasonYear} window dates must fall in ${current.seasonYear}`);
  }
  if (coverage.year !== current.coverageYear || oepEnd.year !== current.coverageYear) {
    throw new Error(`aep.csv: the MA OEP dates must fall in the coverage year (${current.coverageYear})`);
  }
  if (end.iso <= start.iso) throw new Error("aep.csv: window_end must come after window_start");
  if (oepEnd.iso <= coverage.iso) throw new Error("aep.csv: ma_oep_end must come after ma_oep_start");

  /* Nonrenewal SEP (CMS enrollment guidance §30.6.10.A): begins in December of
     the contract year, after the AEP closes. Optional here so older rows parse;
     build.mjs refuses to render the copy that needs it when it is missing. */
  let sepStart = null;
  if (current.nonrenewalSepStart) {
    sepStart = parseIso(current.nonrenewalSepStart, "nonrenewal_sep_start");
    if (sepStart.year !== current.seasonYear || sepStart.month !== 12 || sepStart.iso <= end.iso) {
      throw new Error(
        `aep.csv: nonrenewal_sep_start must be in December ${current.seasonYear}, after window_end`
      );
    }
  }

  return {
    generatedFrom: "src/data/aep.csv",
    seasonYear: current.seasonYear,
    coverageYear: current.coverageYear,
    windowStart: start.iso,
    windowEnd: end.iso,
    maOepStart: coverage.iso,
    maOepEnd: oepEnd.iso,
    // Presentation forms, so no page has to restate a date in prose.
    windowStartLabel: monthDay(start),
    windowEndLabel: monthDay(end),
    windowEndLong: longDate(end),
    windowRange: `${monthDay(start)} – ${monthDay(end)}`,
    windowRangeLong: `${monthDay(start)} – ${longDate(end)}`,
    coverageStartLabel: monthDay(coverage),
    coverageStartLong: longDate(coverage),
    maOepRangeLong: `${monthDay(coverage)} – ${longDate(oepEnd)}`,
    nonrenewalSepStart: sepStart ? sepStart.iso : null,
    nonrenewalSepStartLabel: sepStart ? monthDay(sepStart) : null,
    sourceUpdated: current.sourceUpdated,
    source: current.source,
    seasons: rows,
  };
}

// Only write when run as a script; importing this file (tests) must not emit.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = deriveAep(toRows(readFileSync(join(DATA, "aep.csv"), "utf8")));
  writeFileSync(join(DATA, "aep.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`  aep.json: ${out.seasonYear} season (${out.windowRangeLong}) → coverage ${out.coverageYear}`);
}
