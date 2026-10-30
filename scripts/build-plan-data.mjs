/* ==========================================================================
   build-plan-data.mjs — produces the JSON the "What Changed" tool loads:
     src/data/plans-current.json   (prior plan year, e.g. 2026)
     src/data/plans-next.json      (upcoming plan year, e.g. 2027)
     src/data/crosswalk.json       (prior -> upcoming plan mapping + status)
     src/data/manifest.json        (years + provenance)

   Data source of record (public domain, no licensing):
     Landscape files:  https://www.cms.gov/medicare/coverage/prescription-drug-coverage
     Crosswalk files:  released alongside Landscape each late Sep / early Oct
     Plan Benefit Pkg: released shortly after

   Ingestion mode: if real CMS CSVs are present in src/data/ (landscape-current.csv,
   landscape-next.csv, crosswalk.csv) they are parsed and used verbatim. Otherwise
   a DETERMINISTIC, structurally-faithful sample dataset is generated so the tool
   works before the official 2027 files drop. Sample rows are clearly flagged in
   the manifest (sample:true) and every plan carries sample:true.

   The sample dataset deliberately uses INVENTED carrier names (every one starts
   with the word "Sample") and placeholder contract IDs. Made-up premiums must
   never be printed next to a real company's name or a real CMS contract number:
   the numbers are generated, so the identities have to look generated too.
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "src", "data");

const CURRENT_YEAR = 2026;
const NEXT_YEAR = 2027;

/* ---- deterministic PRNG (so builds are reproducible) ------------------- */
function cyrb32(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFor = (key) => mulberry32(cyrb32(key));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const round = (n, step) => Math.round(n / step) * step;

/* ---- geography (state, counties, fips) --------------------------------- */
const GEO = [
  { state: "FL", counties: [["Broward", "12011"], ["Miami-Dade", "12086"], ["Palm Beach", "12099"]] },
  { state: "TX", counties: [["Harris", "48201"], ["Dallas", "48113"], ["Bexar", "48029"]] },
  { state: "CA", counties: [["Los Angeles", "06037"], ["San Diego", "06073"], ["Orange", "06059"]] },
  { state: "NY", counties: [["Kings", "36047"], ["Queens", "36081"], ["Erie", "36029"]] },
  { state: "PA", counties: [["Philadelphia", "42101"], ["Allegheny", "42003"]] },
  { state: "AZ", counties: [["Maricopa", "04013"], ["Pima", "04019"]] },
  { state: "OH", counties: [["Cuyahoga", "39035"], ["Franklin", "39049"]] },
  { state: "NC", counties: [["Mecklenburg", "37119"], ["Wake", "37183"]] },
  { state: "GA", counties: [["Fulton", "13121"], ["DeKalb", "13089"]] },
  { state: "IL", counties: [["Cook", "17031"], ["DuPage", "17043"]] },
];

/* ---- carriers ----------------------------------------------------------
   INVENTED carriers only. Every name begins with "Sample" so the word appears
   in the plan list, in the results panel and in anything a reader prints.
   Contract-ID bases sit 100 apart so the per-state offset below can never make
   two sample carriers collide. -------------------------------------------- */
const MA_CARRIERS = [
  { org: "Sample Care One", prefix: "H", base: 9010, tiers: ["Complete", "Patriot", "Giveback"] },
  { org: "Sample Health Alliance", prefix: "H", base: 9110, tiers: ["Gold Plus", "Value", "Honor"] },
  { org: "Sample Mutual Medicare", prefix: "H", base: 9210, tiers: ["Eagle", "Premier", "Value"] },
  { org: "Sample Valley Health", prefix: "H", base: 9310, tiers: ["Preferred", "Achieve", "Essential"] },
  { org: "Sample Ridge Medicare", prefix: "H", base: 9410, tiers: ["Giveback", "Assist", "No Premium"] },
  { org: "Sample Coast Health", prefix: "H", base: 9510, tiers: ["Core", "Choice"] },
  { org: "Sample Prairie Health", prefix: "H", base: 9610, tiers: ["Vantage", "Select"] },
];
const KAISER = { org: "Sample Bay Health", prefix: "H", base: 9710, tiers: ["Senior Advantage", "Medicare Plus"], onlyStates: ["CA"] };
const PDP_CARRIERS = [
  { org: "Sample Script Rx", prefix: "S", base: 9010, tiers: ["SmartSaver", "Choice"] },
  { org: "Sample Rx Direct", prefix: "S", base: 9110, tiers: ["Value Script", "Classic"] },
  { org: "Sample Preferred Rx", prefix: "S", base: 9210, tiers: ["Part D Saver", "Preferred"] },
];

const PREMIUMS_MA = [0, 0, 0, 9, 18, 26, 39, 54, 78];
const PREMIUMS_PDP = [0, 2.4, 8.9, 15.5, 22.7, 36.4, 48.8];
const DEDUCTIBLES_CUR = [0, 0, 250, 400, 545];      // 2026: Part D max deductible $545
const DEDUCTIBLES_NEXT = [0, 0, 300, 470, 615];     // 2027: higher max
const MOOP_CUR = [3450, 4500, 5500, 6700, 7550, 8850];
const STARS = [2.5, 3.0, 3.0, 3.5, 3.5, 4.0, 4.0, 4.5, 5.0];

/* Placeholder contract IDs. Real CMS contracts are issued in low number bands;
   the sample set stays in the 9xxx band and is attached only to invented
   carriers, so no generated dollar figure ever sits under a real plan's ID. */
function contractId(carrier, state) {
  const stateIdx = GEO.findIndex((g) => g.state === state);
  const n = (carrier.base + stateIdx * 7) % 10000;
  return carrier.prefix + String(n).padStart(4, "0");
}

/* ---- build the current-year product catalog per carrier+state ---------- */
function makeProducts(carrier, state, type) {
  const rng = rngFor(`${carrier.org}|${state}|${type}|products`);
  const nProducts = type === "PDP" ? 2 : Math.max(2, Math.round(carrier.tiers.length * (0.7 + rng() * 0.4)));
  const products = [];
  for (let i = 0; i < nProducts && i < carrier.tiers.length; i++) {
    const tier = carrier.tiers[i];
    const planId = String(1 + i).padStart(3, "0");
    const network = type === "PDP" ? "PDP" : pick(rng, ["HMO", "HMO", "PPO"]);
    const isGiveback = /giveback|no premium|value|saver/i.test(tier);
    const premium =
      type === "PDP" ? pick(rng, PREMIUMS_PDP) : isGiveback ? pick(rng, [0, 0, 0, 9]) : pick(rng, PREMIUMS_MA);
    const stars = pick(rng, STARS);
    products.push({
      contractId: contractId(carrier, state),
      planId,
      segmentId: "0",
      orgName: carrier.org,
      planType: type,
      network,
      planName:
        type === "PDP"
          ? `${carrier.org} ${tier} (PDP)`
          : `${carrier.org} ${tier} (${network})`,
      premium: Number(premium),
      drugDeductible: type === "MA" ? null : pick(rng, DEDUCTIBLES_CUR),
      moop: type === "PDP" ? null : pick(rng, MOOP_CUR),
      starRating: stars,
      hasDrugCoverage: type !== "MA",
      hasDental: type === "PDP" ? false : rng() > 0.15,
      hasVision: type === "PDP" ? false : rng() > 0.2,
      hasHearing: type === "PDP" ? false : rng() > 0.3,
    });
  }
  return products;
}

/* ---- expand a product across a state's counties ------------------------ */
function expandToCounties(product, geo) {
  const rows = [];
  for (const [county, fips] of geo.counties) {
    const rng = rngFor(`${product.contractId}|${product.planId}|${county}|cur`);
    // Small county-level premium variation for MA (PDP is regional/flat).
    const premium =
      product.planType === "PDP" ? product.premium : Math.max(0, round(product.premium + (rng() - 0.5) * 12, 1));
    rows.push({
      ...product,
      state: geo.state,
      county,
      fips,
      premium: Number(premium.toFixed ? premium.toFixed(2) : premium),
      year: CURRENT_YEAR,
      sample: true,
    });
  }
  return rows;
}

/* ---- decide next-year status + build successor ------------------------- */
function statusFor(product) {
  const rng = rngFor(`${product.contractId}|${product.planId}|status`);
  const roll = rng();
  if (roll < 0.72) return "renewal";
  if (roll < 0.84) return "consolidation";
  if (roll < 0.92) return "service-area-reduction";
  return "termination";
}

/* Next-year rows for a plan that keeps its own contract+plan ID. Plans that
   consolidate produce NO rows of their own: they merge into a sibling plan
   that continues, which is what CMS consolidation actually means. Emitting a
   row for both would put two different plans under one contract|plan|county
   identity — and whichever the tool picked, half the users would be compared
   against a plan that is not theirs. */
function renewRows(product, currentRowsByCounty) {
  const toPlanId = product.planId;
  const rows = [];
  for (const cur of currentRowsByCounty) {
    const rng2 = rngFor(`${product.contractId}|${toPlanId}|${cur.county}|next`);
    // Premiums drift up more often than down (benefit-cost pressure).
    const premDelta = product.planType === "PDP" ? round((rng2() - 0.35) * 18, 1) : round((rng2() - 0.35) * 22, 1);
    const premium = Math.max(0, (Number(cur.premium) + premDelta));
    const moop =
      cur.moop == null ? null : Math.min(9250, round(cur.moop + Math.round((rng2() - 0.25) * 900), 50));
    const dedPool = cur.drugDeductible == null ? [null] : DEDUCTIBLES_NEXT;
    const drugDeductible = cur.drugDeductible == null ? null : (rng2() > 0.4 ? pick(rng2, dedPool) : cur.drugDeductible);
    // Occasionally trim a supplemental benefit (the 2027 contraction thesis).
    const dropDental = cur.hasDental && rng2() > 0.85;
    const dropVision = cur.hasVision && rng2() > 0.88;
    const dropHearing = cur.hasHearing && rng2() > 0.82;
    const starDelta = pick(rng2, [-0.5, 0, 0, 0, 0.5]);

    rows.push({
      ...cur,
      planId: toPlanId,
      planName: cur.planName.replace(/\((HMO|PPO|PDP)\)/, `($1)`),
      premium: Number(premium.toFixed(2)),
      moop,
      drugDeductible,
      hasDental: dropDental ? false : cur.hasDental,
      hasVision: dropVision ? false : cur.hasVision,
      hasHearing: dropHearing ? false : cur.hasHearing,
      starRating: Math.max(2.0, Math.min(5.0, cur.starRating + starDelta)),
      year: NEXT_YEAR,
      sample: true,
    });
  }
  return rows;
}

/**
 * Resolve one carrier's product line for next year.
 * Rules that keep every contract|plan|county identity unique:
 *   - renewal / service-area reduction: the plan keeps its ID and emits rows.
 *   - consolidation: no rows of its own; the crosswalk points at a sibling
 *     plan that is continuing.
 *   - termination: no rows, no successor.
 * If every plan in a contract would consolidate, the lowest-numbered one is
 * promoted to a renewal so the others have something real to merge into.
 */
function resolveProductLine(entries) {
  const survives = (e) => e.status === "renewal" || e.status === "service-area-reduction";
  if (entries.some((e) => e.status === "consolidation") && !entries.some(survives)) {
    const promote = entries.filter((e) => e.status === "consolidation")[0];
    promote.status = "renewal";
  }
  const survivors = entries.filter(survives);
  for (const e of entries) {
    if (e.status === "termination") {
      e.emitsRows = false;
      e.toContractId = null;
      e.toPlanId = null;
    } else if (survives(e)) {
      e.emitsRows = true;
      e.toContractId = e.product.contractId;
      e.toPlanId = e.product.planId;
    } else {
      // consolidation → merge into a continuing sibling
      const target = survivors.find((s) => s.product.planId !== e.product.planId) || survivors[0];
      e.emitsRows = false;
      e.toContractId = target.product.contractId;
      e.toPlanId = target.product.planId;
    }
  }
  return entries;
}

/* ---- generate the whole sample dataset --------------------------------- */
function generate() {
  const current = [];
  const next = [];
  const crosswalk = [];

  for (const geo of GEO) {
    const carriers = [
      ...MA_CARRIERS.map((c) => ({ c, type: "MA/MAPD" })),
      ...(KAISER.onlyStates.includes(geo.state) ? [{ c: KAISER, type: "MA/MAPD" }] : []),
      ...PDP_CARRIERS.map((c) => ({ c, type: "PDP" })),
    ];

    for (const { c, type } of carriers) {
      const kind = type === "PDP" ? "PDP" : "MAPD";
      const products = makeProducts(c, geo.state, kind === "PDP" ? "PDP" : "MAPD");
      const entries = products.map((product) => {
        const curRows = expandToCounties(product, geo);
        current.push(...curRows);
        return { product, curRows, status: statusFor(product) };
      });

      for (const e of resolveProductLine(entries)) {
        crosswalk.push({
          fromContractId: e.product.contractId,
          fromPlanId: e.product.planId,
          toContractId: e.toContractId,
          toPlanId: e.toPlanId,
          status: e.status,
        });
        if (e.emitsRows) next.push(...renewRows(e.product, e.curRows));
      }
    }
  }

  // A few brand-new 2027 plans (status: new) so the tool shows fresh options.
  const rngNew = rngFor("brand-new-2027");
  for (const geo of GEO.slice(0, 4)) {
    const c = pick(rngNew, MA_CARRIERS);
    const cid = contractId(c, geo.state);
    const planId = "090";
    for (const [county, fips] of geo.counties) {
      next.push({
        contractId: cid, planId, segmentId: "0", orgName: c.org, planType: "MAPD",
        network: "PPO", planName: `${c.org} ${pick(rngNew, ["Horizon", "Summit", "Freedom"])} (PPO)`,
        premium: pick(rngNew, [0, 0, 12, 29]), drugDeductible: pick(rngNew, DEDUCTIBLES_NEXT),
        moop: pick(rngNew, MOOP_CUR), starRating: pick(rngNew, [3.5, 4.0, 4.5]),
        hasDrugCoverage: true, hasDental: true, hasVision: true, hasHearing: true,
        state: geo.state, county, fips, year: NEXT_YEAR, sample: true,
      });
    }
    crosswalk.push({ fromContractId: null, fromPlanId: null, toContractId: cid, toPlanId: planId, status: "new" });
  }

  return { current, next, crosswalk, sample: true };
}

/* ---- optional real CSV ingestion --------------------------------------- */
function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",").map((c) => c.trim());
  return lines.filter(Boolean).map((line) => {
    // minimal CSV: handles quoted commas
    const cells = [];
    let cur = "", q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    const row = {};
    cols.forEach((c, i) => (row[c] = (cells[i] ?? "").trim()));
    return row;
  });
}

/* A CMS cell that is not a number is not a number. CMS writes "Not
   Applicable" and "Plan Too New To Be Measured" in money and rating cells.
   Those must become null (unknown) — never NaN, which compares as "no
   change" and prints as a dash, and never 0, which reads as a genuinely
   free plan. */
function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/* A benefit flag CMS did not publish is null (unknown) — NOT false. "No"
   would be a claim about the plan that the file does not support; the site
   has to be able to say "CMS did not publish this in this file". */
function flagOrNull(v) {
  if (v === "" || v == null) return null;
  return /^(1|true|y|yes)$/i.test(String(v).trim());
}

/* Read the sidecar a normalizer wrote next to its CSV. Real data with no
   provenance record is not shippable: a manifest that cannot say WHERE a
   number came from cannot be trusted with one. */
function readProvenance(csvPath, part) {
  const p = csvPath.replace(/\.csv$/, ".provenance.json");
  if (!existsSync(p)) {
    throw new Error(
      `${csvPath} exists but ${p} does not.\n` +
        `Re-run scripts/normalize-landscape.mjs / scripts/normalize-crosswalk.mjs so the ` +
        `data file carries its own source record (URL, release label, download date, SHA-256).`
    );
  }
  try {
    return { ...JSON.parse(readFileSync(p, "utf8")), sample: false };
  } catch (err) {
    throw new Error(`Could not read ${p}: ${err.message}`);
  }
}

function main() {
  const currentPath = join(DATA, "landscape-current.csv");
  const nextPath = join(DATA, "landscape-next.csv");
  const crossPath = join(DATA, "crosswalk.csv");

  /* Each part is real or generated on its OWN. A real current-year file with
     a generated crosswalk is a different dataset from a wholly generated one,
     and the disclosure has to be able to say WHICH part is missing — so the
     manifest carries per-part provenance and the banner keys off the parts. */
  const haveCurrent = existsSync(currentPath);
  const haveNext = existsSync(nextPath);
  const haveCross = existsSync(crossPath);

  const mapPlan = (r, year) => ({
    contractId: r.contract_id || r.contractId,
    planId: String(r.plan_id || r.planId).padStart(3, "0"),
    segmentId: r.segment_id || "0",
    orgName: r.organization_name || r.orgName || "",
    planType: r.plan_type || r.planType || "",
    network: r.network || "",
    planName: r.plan_name || r.planName || "",
    premium: numOrNull(r.premium),
    drugDeductible: numOrNull(r.drug_deductible),
    moop: numOrNull(r.moop),
    starRating: numOrNull(r.star_rating),
    hasDrugCoverage: /^(1|true|y|yes)$/i.test(r.has_drug || ""),
    hasDental: flagOrNull(r.has_dental),
    hasVision: flagOrNull(r.has_vision),
    hasHearing: flagOrNull(r.has_hearing),
    state: r.state, county: r.county, fips: r.fips || "",
    year, sample: false,
  });

  const mapCrosswalk = (r) => ({
    fromContractId: r.previous_contract_id || null,
    fromPlanId: r.previous_plan_id ? String(r.previous_plan_id).padStart(3, "0") : null,
    toContractId: r.contract_id || null,
    toPlanId: r.plan_id ? String(r.plan_id).padStart(3, "0") : null,
    status: (r.status || "renewal").toLowerCase(),
  });

  /* The generated fallback is only built when a part is actually missing. */
  const needFallback = !haveCurrent || !haveNext || !haveCross;
  const fallback = needFallback ? generate() : null;

  const current = haveCurrent
    ? parseCsv(readFileSync(currentPath, "utf8")).map((r) => mapPlan(r, CURRENT_YEAR))
    : fallback.current;
  const next = haveNext
    ? parseCsv(readFileSync(nextPath, "utf8")).map((r) => mapPlan(r, NEXT_YEAR))
    : fallback.next;
  const crosswalk = haveCross
    ? parseCsv(readFileSync(crossPath, "utf8")).map(mapCrosswalk)
    : fallback.crosswalk;

  /* Per-part provenance. A part with no data file is generated sample data,
     and says so; a part with a data file carries the normalizer's own record
     of where that file came from. */
  const parts = {
    current: haveCurrent
      ? { ...readProvenance(currentPath, "current"), rows: current.length }
      : { part: "current", planYear: CURRENT_YEAR, sample: true, rows: current.length, source: "generated sample", notes: "No src/data/landscape-current.csv present; the deterministic sample dataset was used." },
    next: haveNext
      ? { ...readProvenance(nextPath, "next"), rows: next.length }
      : { part: "next", planYear: NEXT_YEAR, sample: true, rows: next.length, source: "generated sample", notes: "No src/data/landscape-next.csv present; the deterministic sample dataset was used." },
    crosswalk: haveCross
      ? { ...readProvenance(crossPath, "crosswalk"), rows: crosswalk.length }
      : { part: "crosswalk", planYear: NEXT_YEAR, sample: true, rows: crosswalk.length, source: "generated sample", notes: "No src/data/crosswalk.csv present; the deterministic sample dataset was used." },
  };

  /* The dataset is sample if ANY part is sample. One generated part makes the
     whole comparison sample — a real plan file beside a made-up crosswalk
     would put invented successor rows under a real plan's name. */
  const sample = parts.current.sample || parts.next.sample || parts.crosswalk.sample;

  writeFileSync(join(DATA, "plans-current.json"), JSON.stringify(current));
  writeFileSync(join(DATA, "plans-next.json"), JSON.stringify(next));
  writeFileSync(join(DATA, "crosswalk.json"), JSON.stringify(crosswalk));
  writeFileSync(
    join(DATA, "manifest.json"),
    JSON.stringify(
      {
        currentYear: CURRENT_YEAR,
        nextYear: NEXT_YEAR,
        sample,
        source: "CMS Medicare Advantage / Part D Landscape Source File + Plan Year Crosswalk (public domain).",
        parts,
        counts: { current: current.length, next: next.length, crosswalk: crosswalk.length },
        states: GEO.map((g) => g.state),
        note: sample
          ? "SAMPLE DATA — one or more parts are generated placeholders. The part that is missing is named in `parts`. Replace the corresponding src/data file with the real CMS file and rebuild."
          : "Built from the official CMS Landscape and Plan Crosswalk files. Every part's source URL, release label, download date and SHA-256 are recorded in `parts`.",
      },
      null,
      2
    ) + "\n"
  );

  const partState = (k) => (parts[k].sample ? "SAMPLE" : "real");
  console.log(
    `  plans: ${current.length} current + ${next.length} next · crosswalk ${crosswalk.length} rows · ` +
      `current=${partState("current")} next=${partState("next")} crosswalk=${partState("crosswalk")} · ` +
      `${sample ? "SAMPLE" : "REAL CMS"} dataset`
  );
}

main();
