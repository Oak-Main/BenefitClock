#!/usr/bin/env node
/* ==========================================================================
   normalize-landscape.mjs — turns CMS's official Medicare Advantage / Part D
   "Landscape Source File" into the src/data/landscape-*.csv shape that
   scripts/build-plan-data.mjs consumes.

   Run once per plan year:

     node scripts/normalize-landscape.mjs --year 2027 \
       --src  raw-cms/landscape-2027/CY2027_Landscape_202610/CY2027_Landscape_202610.csv \
       --out  landscape-next.csv

     node scripts/normalize-landscape.mjs --year 2026 \
       --src  raw-cms/landscape-2026/CY2026_Landscape_202609/CY2026_Landscape_202609.csv \
       --out  landscape-current.csv

   The national file is ~350k rows; the site's tool only serves its own
   county list, so the file is scoped down to those counties on the way in.

   Source of record (public domain):
     https://www.cms.gov/medicare/coverage/prescription-drug-coverage

   Two rules this file exists to enforce:

   1. A CMS cell that is not a number is NOT a number. CMS writes
      "Not Applicable" for a Part D deductible on a plan with no Part D,
      "Plan Too New To Be Measured" and "Not Enough Data Available" for a
      star rating, and "Not Applicable" for a consolidated premium on a
      Part D-less plan. Those must land as an EMPTY cell (unknown), never as
      NaN and never as 0 — NaN silently compares as "no change" and 0
      would read as a real free plan.

   2. A field is never guessed. Dental / vision / hearing benefit flags are
      not published in the combined Landscape file at all, so they are
      emitted empty and the site says so in words rather than showing "No".
   ========================================================================== */
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProvenance, fileSha256 } from './lib/provenance.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

const YEAR = String(argOf('--year', '2026')).trim();

/* The CMS file name carries its own release stamp. These are the names CMS
   used for the years this repo carries; --src always wins over them. */
const DEFAULT_SRC = {
  2026: 'CY2026_Landscape_202609.csv',
  2027: 'CY2027_Landscape_202610.csv',
};
const DEFAULT_OUT = { 2026: 'landscape-current.csv', 2027: 'landscape-next.csv' };

const OUT = join(HERE, '..', 'src', 'data', argOf('--out', DEFAULT_OUT[YEAR] || `landscape-${YEAR}.csv`));
const SRC = argOf('--src', join(HERE, DEFAULT_SRC[YEAR] || `CY${YEAR}_Landscape_*.csv`));

if (!existsSync(SRC)) {
  console.error(
    `Source CSV not found at ${SRC}.\n` +
      `Download the CY${YEAR} Landscape ZIP from ` +
      `https://www.cms.gov/medicare/coverage/prescription-drug-coverage, extract it, ` +
      `and pass --src <path to the extracted .csv>.`
  );
  process.exit(1);
}

/* The counties the site serves. County names are matched on their letters
   only ("Miami-Dade" -> "miamidade") because CMS spells counties the way
   the state does and the site spells them the way the tool's own GEO
   table does. FIPS comes from the same table as the county list, so it is
   never derived from anything CMS did not publish. */
const GEO = {
  FL: [['Broward', '12011'], ['Miami-Dade', '12086'], ['Palm Beach', '12099']],
  TX: [['Harris', '48201'], ['Dallas', '48113'], ['Bexar', '48029']],
  CA: [['Los Angeles', '06037'], ['San Diego', '06073'], ['Orange', '06059']],
  NY: [['Kings', '36047'], ['Queens', '36081'], ['Erie', '36029']],
  PA: [['Philadelphia', '42101'], ['Allegheny', '42003']],
  AZ: [['Maricopa', '04013'], ['Pima', '04019']],
  OH: [['Cuyahoga', '39035'], ['Franklin', '39049']],
  NC: [['Mecklenburg', '37119'], ['Wake', '37183']],
  GA: [['Fulton', '13121'], ['DeKalb', '13089']],
  IL: [['Cook', '17031'], ['DuPage', '17043']],
};
const countyKey = (c) => String(c).toLowerCase().replace(/[^a-z]/g, '');
const FIPS = new Map();
for (const [state, counties] of Object.entries(GEO)) {
  for (const [county, fips] of counties) FIPS.set(`${state}|${countyKey(county)}`, fips);
}

/* Minimal CSV splitter honoring quoted fields. */
function splitLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}
const csv = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/* A CMS money cell: "$1,234.50", "0.00", "Not Applicable", "($52.20)".
   Returns a plain number string, or "" when the cell is not a number —
   which is the difference between "unknown" and "zero". */
function money(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const neg = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/^\(|\)$/g, '').replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return '';
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return '';
  return String(neg ? -n : n);
}

/* A CMS star rating: 4.5, or "Plan Too New To Be Measured" /
   "Not Enough Data Available". Anything that is not a number is "not rated". */
function stars(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return '';
  return s;
}

const rl = createInterface({ input: createReadStream(SRC, 'utf8') });
let header = null;
const idx = {};
const rows = [];
for await (const line of rl) {
  if (!line.trim()) continue;
  const cells = splitLine(line);
  if (!header) {
    header = cells.map((h) => h.replace(/^\uFEFF/, '').trim());
    for (const [i, h] of header.entries()) idx[h] = i;
    continue;
  }
  if (!cells.length || !String(cells[0] || '').trim()) continue;

  const pick = (name) => (idx[name] !== undefined ? String(cells[idx[name]] ?? '').trim() : '');

  const state = pick('State Territory Abbreviation');
  const counties = GEO[state];
  if (!counties) continue;
  const countyName = pick('County Name');
  if (!counties.some(([c]) => countyKey(c) === countyKey(countyName))) continue;

  /* Plan type in the site's vocabulary. CMS's own "Plan Type" column is the
     NETWORK (HMO, PPO, HMO-POS, SNP variants); whether the plan carries drug
     coverage is a separate question CMS answers per row. Deriving the site
     type from the per-row Part D flag keeps a drug-only plan identifiable
     and keeps a MAPD distinguishable from a plain MA plan. */
  const isPdp = /^yes$/i.test(pick('National PDP'));
  const hasDrug = isPdp || /^yes$/i.test(pick('Part D Coverage Indicator'));
  const planType = isPdp ? 'PDP' : hasDrug ? 'MAPD' : 'MA';

  rows.push([
    pick('Contract ID'),
    String(pick('Plan ID')).padStart(3, '0'),
    pick('Segment ID') || '0',
    pick('Organization Marketing Name') || pick('Contract Name'),
    planType,
    pick('Plan Type'),
    pick('Plan Name'),
    /* Part C premium is the monthly premium a beneficiary actually pays for
       the medical benefit, and CMS fills it in on every row. The consolidated
       Part C+D premium is "Not Applicable" on a plan with no Part D at all,
       so it can only ever be a fallback. */
    money(pick('Part C Premium')) || money(pick('Monthly Consolidated Premium (Part C + D)')),
    money(pick('Annual Part D Deductible Amount')),
    money(pick('In-Network Maximum Out-of-Pocket (MOOP) Amount')),
    stars(pick('Overall Star Rating')) || stars(pick('Part C Summary Star Rating')),
    hasDrug ? '1' : '',
    '', '', '', // dental/vision/hearing: NOT published in the combined Landscape file
    state,
    countyName,
    FIPS.get(`${state}|${countyKey(countyName)}`) || '',
  ]);
}

const COLUMNS =
  'contract_id,plan_id,segment_id,organization_name,plan_type,network,plan_name,premium,drug_deductible,moop,star_rating,has_drug,has_dental,has_vision,has_hearing,state,county,fips';

/* Deterministic order: the same CMS file must always produce the same bytes
   out, or every rebuild would look like a data change. */
rows.sort((a, b) =>
  a[0].localeCompare(b[0]) ||
  a[1].localeCompare(b[1]) ||
  a[2].localeCompare(b[2]) ||
  a[15].localeCompare(b[15]) ||
  a[16].localeCompare(b[16])
);

writeFileSync(OUT, [COLUMNS, ...rows.map((r) => r.map(csv).join(','))].join('\n') + '\n');

const states = [...new Set(rows.map((r) => r[15]))].sort();
console.log(`${OUT}: ${rows.length} plans across ${states.join(', ')}`);
console.log(
  `  dental/vision/hearing flags are not published in the CY${YEAR} combined Landscape file; ` +
    `emitted empty (never guessed).`
);

/* Provenance: where this file came from, so the manifest can show it and a
   reader can re-verify it. The archive hash and the download date are the
   operator's to supply — the normalizer did not download the file itself. */
const zipPath = argOf('--zip', '');
const outName = OUT.split(/[\\/]/).pop();
const provenance = writeProvenance(OUT, {
  part: outName === 'landscape-current.csv' ? 'current' : 'next',
  planYear: Number(YEAR),
  sourcePage: argOf('--source-page', 'https://www.cms.gov/medicare/coverage/prescription-drug-coverage'),
  releaseLabel: argOf('--release-label', `CY${YEAR} Landscape Source File`),
  fileName: argOf('--file-name', zipPath ? zipPath.split(/[\\/]/).pop() : null),
  downloadDate: argOf('--download-date', null),
  zipSha256: argOf('--zip-sha256', null) || (zipPath ? fileSha256(zipPath) : null),
  sourceCsvSha256: fileSha256(SRC),
  normalizedFile: relative(join(HERE, '..'), OUT).split('\\').join('/'),
  rows: rows.length,
  notes:
    `Normalized from the official CMS CY${YEAR} Medicare Advantage / Part D Landscape Source File, ` +
    `scoped to the ${rows.length} plan rows serving this site's counties. Dental / vision / hearing ` +
    `benefit flags are not published in the combined Landscape file and are emitted empty.`,
});
console.log(`  provenance: ${provenance.normalizedFile.replace(/\.csv$/, '.provenance.json')} (zip ${String(provenance.zipSha256).slice(0, 12)}…, csv ${String(provenance.sourceCsvSha256).slice(0, 12)}…)`);
