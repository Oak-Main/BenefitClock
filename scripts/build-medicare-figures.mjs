/* ==========================================================================
   build-medicare-figures.mjs — turns src/data/medicare-figures.csv into
   src/data/medicare-figures.json.

   These are statutory figures that change every year:
     - Part B standard monthly premium and annual deductible (CMS, each autumn)
     - Part D annual out-of-pocket cap (Inflation Reduction Act; indexed annually)

   They used to be hardcoded in page markup, which meant they silently went
   stale a year at a time. Keeping them here lets the build assert that the
   figures actually cover the year a page is talking about.

   Refreshing each autumn:
     - Part B premium/deductible: CMS "Medicare Parts A & B Premiums and
       Deductibles" fact sheet (published Nov, effective Jan 1).
     - Part D cap: CMS Part D redesign guidance / annual parameters.
   Add one row per year, keep `source_updated` as the date the figure was
   published and `verified` as the date you confirmed it first-hand, and
   rebuild. The site's "Figures verified" label reads `verified`.
   ========================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "src", "data");

function parseCsv(text) {
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

const num = (v) => (v === "" || v == null ? null : Number(v));

const rows = parseCsv(readFileSync(join(DATA, "medicare-figures.csv"), "utf8"))
  .map((r) => ({
    year: Number(r.year),
    partBPremium: num(r.part_b_premium),
    partBDeductible: num(r.part_b_deductible),
    partDOopCap: num(r.part_d_oop_cap),
    partDDeductible: num(r.part_d_deductible),
    status: r.status || "official",
    sourceUpdated: r.source_updated || null,
    verified: r.verified || null,
    source: r.source || "",
  }))
  .sort((a, b) => a.year - b.year);

if (!rows.length) throw new Error("medicare-figures.csv has no rows");

const official = rows.filter((r) => r.status === "official");
const current = official[official.length - 1];

if (!current || current.partBPremium == null) {
  throw new Error("medicare-figures.csv: latest official row is missing part_b_premium");
}

const out = {
  generatedFrom: "src/data/medicare-figures.csv",
  currentYear: current.year,
  partBPremium: current.partBPremium,
  partBDeductible: current.partBDeductible,
  partDOopCap: current.partDOopCap,
  partDDeductible: current.partDDeductible,
  sourceUpdated: current.sourceUpdated,
  // The date the current row was last confirmed first-hand. Falls back to the
  // publication date for rows written before the column existed.
  lastVerified: current.verified || current.sourceUpdated,
  source: current.source,
  history: rows,
};

writeFileSync(join(DATA, "medicare-figures.json"), JSON.stringify(out, null, 2) + "\n");
console.log(
  `  medicare-figures.json: ${out.currentYear} Part B $${out.partBPremium.toFixed(2)}/mo` +
    (out.partDOopCap != null ? ` · Part D cap $${out.partDOopCap.toLocaleString("en-US")}` : "")
);
