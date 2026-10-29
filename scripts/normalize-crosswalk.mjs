#!/usr/bin/env node
/* ==========================================================================
   normalize-crosswalk.mjs — turns CMS's official Plan Year Crosswalk file
   into the src/data/crosswalk.csv shape that scripts/build-plan-data.mjs
   consumes.

   Run once per plan year:

     node scripts/normalize-crosswalk.mjs --year 2027 \
       --src  raw-cms/crosswalk-2027/PlanCrosswalk2027_10012026.txt \
       --out  crosswalk.csv

   Source of record (public domain):
     https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/plan-crosswalks/

   The crosswalk answers one question per plan: "the plan you have now —
   what happens to it next year?" CMS publishes a fixed vocabulary for the
   answer, and this file maps that vocabulary onto the site's five states
   without inventing anything in between:

     Renewal Plan                       -> renewal
     Renewal Plan with an SAE           -> renewal
     Renewal Plan with a SAR            -> service-area-reduction
     Consolidated Renewal Plan          -> consolidation
     Terminated/Non-renewed Contract    -> termination
     New Plan                           -> new
     Initial Contract                   -> new

   Two CMS quirks are handled here rather than in the build, because they are
   about the FILE, not about the site:

   - "Renewal Plan with an SAE" (service-area EXPANSION) is a renewal: the
     plan keeps its ID and its counties and gains more. The site's only
     service-area state is a reduction, so expansion is a renewal.
   - CMS writes the literal token "NEW" in the previous-plan columns for a
     plan that has no predecessor, and "TERMINATED" in the current-plan
     columns for one that has no successor. Both are turned into an empty
     cell, which is how the build knows a row has no other end.
   ========================================================================== */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapCrosswalkRow } from './lib/crosswalk-map.mjs';
import { writeProvenance, fileSha256 } from './lib/provenance.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

const YEAR = String(argOf('--year', '2027')).trim();
const OUT = join(HERE, '..', 'src', 'data', argOf('--out', 'crosswalk.csv'));
const SRC = argOf('--src', join(HERE, `PlanCrosswalk${YEAR}.txt`));

if (!existsSync(SRC)) {
  console.error(
    `Source file not found at ${SRC}.\n` +
      `Download the CY${YEAR} Plan Crosswalk ZIP from ` +
      `https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/plan-crosswalks/ ` +
      `and pass --src <path to the extracted .txt>.`
  );
  process.exit(1);
}

/* Split a tab-delimited CMS line. */
function splitTsv(line) {
  return line.split('\t').map((c) => c.trim());
}

/* The set of contract|plan keys the site's counties actually serve, read out
   of the normalized landscape files. The CMS crosswalk is national; the site
   only serves its own counties, so a row is kept when EITHER end of it is a
   plan the site has. */
function servedPlanKeys(csvPaths) {
  const keys = new Set();
  for (const p of csvPaths) {
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'utf8').split(/\r?\n/);
    if (!lines.length) continue;
    const cols = lines[0].split(',').map((c) => c.trim());
    const ci = cols.indexOf('contract_id');
    const pi = cols.indexOf('plan_id');
    if (ci === -1 || pi === -1) continue;
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const cells = line.split(',');
      const c = (cells[ci] || '').trim();
      const pl = (cells[pi] || '').trim();
      if (c && pl) keys.add(`${c.toUpperCase()}|${pl.padStart(3, '0')}`);
    }
  }
  return keys;
}

const csv = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const lines = readFileSync(SRC, 'utf8').split(/\r?\n/);
const header = splitTsv(lines[0] || '');
const headerIdx = {
  prevContract: header.indexOf('PREVIOUS_CONTRACT_ID'),
  prevPlan: header.indexOf('PREVIOUS_PLAN_ID'),
  currContract: header.indexOf('CURRENT_CONTRACT_ID'),
  currPlan: header.indexOf('CURRENT_PLAN_ID'),
  status: header.indexOf('STATUS'),
};
if (Object.values(headerIdx).some((v) => v === -1)) {
  console.error(`Unexpected crosswalk header. Got: ${header.join(' | ')}`);
  process.exit(1);
}

const scopeFiles = [
  join(HERE, '..', 'src', 'data', 'landscape-current.csv'),
  join(HERE, '..', 'src', 'data', 'landscape-next.csv'),
];
const served = servedPlanKeys(scopeFiles);

const rows = [];
let unmapped = 0;
let outOfScope = 0;
for (const line of lines.slice(1)) {
  if (!line.trim()) continue;
  const cells = splitTsv(line);
  const mapped = mapCrosswalkRow({
    prevContract: cells[headerIdx.prevContract],
    prevPlan: cells[headerIdx.prevPlan],
    currContract: cells[headerIdx.currContract],
    currPlan: cells[headerIdx.currPlan],
    status: cells[headerIdx.status],
  });
  if (!mapped) {
    unmapped++;
    continue;
  }
  /* Scope to the counties the site serves: keep the row when either end is a
     plan we carry. A termination names a plan we have; a new plan names a
     plan we will have; a consolidation names both. */
  const prevKey = mapped.previous_contract_id
    ? `${mapped.previous_contract_id.toUpperCase()}|${mapped.previous_plan_id}`
    : '';
  const currKey = mapped.contract_id ? `${mapped.contract_id.toUpperCase()}|${mapped.plan_id}` : '';
  if (served.size && !served.has(prevKey) && !served.has(currKey)) {
    outOfScope++;
    continue;
  }
  rows.push(mapped);
}

rows.sort(
  (a, b) =>
    a.previous_contract_id.localeCompare(b.previous_contract_id) ||
    a.previous_plan_id.localeCompare(b.previous_plan_id) ||
    a.contract_id.localeCompare(b.contract_id) ||
    a.plan_id.localeCompare(b.plan_id)
);

const COLUMNS = 'previous_contract_id,previous_plan_id,contract_id,plan_id,status';
writeFileSync(
  OUT,
  [COLUMNS, ...rows.map((r) => [r.previous_contract_id, r.previous_plan_id, r.contract_id, r.plan_id, r.status].map(csv).join(','))].join('\n') + '\n'
);

const counts = rows.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] || 0) + 1;
  return acc;
}, {});
console.log(`${OUT}: ${rows.length} crosswalk rows for CY${YEAR}`);
console.log(`  by status: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(`  dropped: ${outOfScope} outside the site's counties, ${unmapped} with an unmapped CMS status`);

const zipPath = argOf('--zip', '');
const provenance = writeProvenance(OUT, {
  part: 'crosswalk',
  planYear: Number(YEAR),
  sourcePage: argOf(
    '--source-page',
    'https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/plan-crosswalks/'
  ),
  releaseLabel: argOf('--release-label', `CY${YEAR} Part C/D Plan Crosswalk`),
  fileName: argOf('--file-name', zipPath ? zipPath.split(/[\\/]/).pop() : null),
  downloadDate: argOf('--download-date', null),
  zipSha256: argOf('--zip-sha256', null) || (zipPath ? fileSha256(zipPath) : null),
  sourceCsvSha256: fileSha256(SRC),
  normalizedFile: relative(join(HERE, '..'), OUT).split('\\').join('/'),
  rows: rows.length,
  notes:
    `Normalized from the official CMS CY${YEAR} Plan Crosswalk file (tab-delimited), scoped to the ` +
    `contract+plan identities this site's counties serve. CMS status text is mapped onto the site's ` +
    `five crosswalk states without inventing anything in between.`,
});
console.log(`  provenance: ${provenance.normalizedFile.replace(/\.csv$/, '.provenance.json')} (zip ${String(provenance.zipSha256).slice(0, 12)}…, source ${String(provenance.sourceCsvSha256).slice(0, 12)}…)`);
