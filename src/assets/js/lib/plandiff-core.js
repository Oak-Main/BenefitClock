/* ==========================================================================
   plandiff-core.js — Medicare "What Changed" plan-year diff (pure, no deps)
   Single source of truth: imported by the browser tool AND Node tests.

   Data model (see scripts/build-plan-data.mjs for the CMS ingestion that
   produces these shapes from the public Landscape + Crosswalk files):

     Plan   { contractId, planId, segmentId, planName, orgName, planType,
              network, state, county, fips, premium, drugDeductible, moop,
              starRating, hasDental, hasVision, hasHearing, hasDrugCoverage }
     Xwalk  { fromContractId, fromPlanId, toContractId, toPlanId, status }

   Year labels are never hardcoded: every function that puts a plan year in
   front of a reader takes it from the caller (the manifest), so the copy
   cannot contradict the table headers once the data rolls to a new year.
   ========================================================================== */

/** Canonical key for a plan within a county. */
export function planKey(contractId, planId, county) {
  return `${String(contractId).toUpperCase()}|${String(planId).padStart(3, "0")}|${normCounty(county)}`;
}

/** Contract+plan key ignoring county (crosswalk granularity). */
export function contractPlanKey(contractId, planId) {
  return `${String(contractId).toUpperCase()}|${String(planId).padStart(3, "0")}`;
}

function normCounty(county) {
  return String(county || "").trim().toLowerCase();
}

/**
 * Year wording for copy. `nextYear` comes from the data manifest; when a
 * caller has no manifest we fall back to neutral wording rather than to a
 * literal year that would be wrong the moment the data moves on.
 */
function yearWords(opts) {
  const o = opts || {};
  const next = o.nextYear === null || o.nextYear === undefined || o.nextYear === "" ? null : String(o.nextYear);
  return {
    next: next || "next year",
    inNext: next ? `in ${next}` : "next year",
    forNext: next ? `for ${next}` : "for next year",
  };
}

/**
 * True when ANY part of the plan dataset is sample data.
 *
 * The manifest's per-part flags are the source of truth: the current-year
 * landscape, the next-year landscape and the crosswalk are three separate
 * files, and a dataset built from two real files and one generated one is
 * still a dataset with made-up numbers in it. The top-level `sample` flag
 * says the same thing, but it is the summary — this function derives the
 * answer from the parts so the browser, the build and the tests cannot
 * disagree about whether the disclosure belongs on the page.
 *
 * A manifest with no parts at all (an older build) falls back to the
 * top-level flag.
 *
 * @param {object|null} manifest
 * @returns {boolean}
 */
export function isSampleDataset(manifest) {
  if (!manifest) return true;
  const parts = manifest.parts;
  if (parts && typeof parts === "object") {
    const flags = Object.values(parts).map((p) =>
      p && typeof p === "object" ? p.sample : p
    );
    if (flags.some((f) => f === true)) return true;
    if (flags.length && flags.every((f) => f === false)) return false;
  }
  return manifest.sample !== false;
}

/**
 * Build lookup indexes over a flat list of plan records for a single year.
 *
 * Two records sharing one `contract|plan|county` identity are not a thing CMS
 * publishes, and silently keeping one of them means comparing a beneficiary
 * against a plan that is not theirs. We keep the first, record the key in
 * `duplicateKeys`, and let buildDiff() refuse to guess.
 * @param {Array<object>} plans
 */
export function indexPlans(plans) {
  const byKey = new Map();          // contract|plan|county -> plan
  const byContractPlan = new Map(); // contract|plan -> [plans across counties]
  const byCounty = new Map();       // state|county -> [plans]
  const duplicateKeys = new Set();  // keys seen more than once (ambiguous)
  for (const p of plans) {
    const k = planKey(p.contractId, p.planId, p.county);
    if (byKey.has(k)) duplicateKeys.add(k);
    else byKey.set(k, p);
    const cp = contractPlanKey(p.contractId, p.planId);
    if (!byContractPlan.has(cp)) byContractPlan.set(cp, []);
    byContractPlan.get(cp).push(p);
    const ck = `${String(p.state).toUpperCase()}|${normCounty(p.county)}`;
    if (!byCounty.has(ck)) byCounty.set(ck, []);
    byCounty.get(ck).push(p);
  }
  return { byKey, byContractPlan, byCounty, duplicateKeys, all: plans };
}

/** Index a crosswalk list by the prior-year contract|plan key. */
export function indexCrosswalk(rows) {
  const map = new Map();
  for (const r of rows) {
    // "new for next year" rows have no prior-year plan to key on.
    if (r.fromContractId == null || r.fromPlanId == null) continue;
    map.set(contractPlanKey(r.fromContractId, r.fromPlanId), r);
  }
  return map;
}

/** List distinct states present in a plan index, sorted. */
export function listStates(index) {
  const set = new Set(index.all.map((p) => String(p.state).toUpperCase()));
  return [...set].sort();
}

/** List counties for a state, sorted. */
export function listCounties(index, state) {
  const s = String(state).toUpperCase();
  const set = new Set(
    index.all.filter((p) => String(p.state).toUpperCase() === s).map((p) => p.county)
  );
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** All plans available in a state+county, sorted by org then name. */
export function plansInCounty(index, state, county) {
  const ck = `${String(state).toUpperCase()}|${normCounty(county)}`;
  const list = index.byCounty.get(ck) || [];
  return [...list].sort(
    (a, b) => a.orgName.localeCompare(b.orgName) || a.planName.localeCompare(b.planName)
  );
}

/**
 * The comparable metrics, in display order. `higherIsBetter` drives red/green.
 * `kind` selects the formatter and comparison behaviour.
 * `maOnly` marks rows a stand-alone drug plan never had, so they are reported
 * as not applicable instead of a misleading "No change".
 */
export const METRICS = [
  { field: "premium",       label: "Monthly plan premium",     kind: "money",  higherIsBetter: false },
  { field: "network",       label: "Plan type",                kind: "network" },
  { field: "drugDeductible",label: "Drug (Part D) deductible", kind: "money",  higherIsBetter: false },
  { field: "moop",          label: "Yearly limit on what you pay (MOOP)", kind: "money", higherIsBetter: false, maOnly: true },
  { field: "starRating",    label: "CMS Star Rating",          kind: "stars",  higherIsBetter: true  },
  { field: "hasDental",     label: "Dental benefit",           kind: "bool",   higherIsBetter: true, maOnly: true },
  { field: "hasVision",     label: "Vision benefit",           kind: "bool",   higherIsBetter: true, maOnly: true },
  { field: "hasHearing",    label: "Hearing benefit",          kind: "bool",   higherIsBetter: true, maOnly: true },
];

function fmtMoney(n) {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtStars(n) {
  if (n === null || n === undefined || n === "") return "Not rated";
  const v = Number(n);
  if (!Number.isFinite(v)) return "Not rated";
  return `${v.toFixed(1)} ★`;
}
function fmtBool(b) {
  /* null means CMS did not publish this flag in the file the site read.
     "Not included" would be a claim about the plan that the file does not
     support, so say what is actually true instead. */
  if (b === null || b === undefined) return "Not published by CMS in this file";
  return b ? "Included" : "Not included";
}
function fmtNetwork(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return "—";
  if (s === "PDP") return "Drug-only";
  return s;
}

/** Format a raw metric value for display. */
export function formatMetric(kind, value) {
  if (kind === "money") return fmtMoney(value);
  if (kind === "stars") return fmtStars(value);
  if (kind === "bool") return fmtBool(value);
  if (kind === "network") return fmtNetwork(value);
  return String(value ?? "—");
}

/** True for a stand-alone Part D drug plan (no medical benefits to compare). */
export function isDrugOnlyPlan(plan) {
  if (!plan) return false;
  return /^pdp$/i.test(String(plan.planType || "")) || /^pdp$/i.test(String(plan.network || ""));
}

/**
 * Compare one metric between prior and next plan.
 * direction: 'up' | 'down' | 'flat' | 'added' | 'removed' | 'changed' | 'na'
 * tone:      'good' | 'bad' | 'warn' | 'flat'  (this is what drives colour —
 *            never `direction`, because a falling star rating is a bad thing)
 * @param {object} opts  { nextYear } — year wording for the delta copy.
 */
export function diffMetric(metric, prior, next, opts) {
  const a = prior ? prior[metric.field] : undefined;
  const b = next ? next[metric.field] : undefined;
  const yr = yearWords(opts);

  let direction = "flat";
  let tone = "flat";
  let deltaText = "No change";

  // A drug-only plan never had a dental benefit or an out-of-pocket limit, so
  // "No change" would read as "you still have it". Say it does not apply.
  if (metric.maOnly && (isDrugOnlyPlan(prior) || isDrugOnlyPlan(next))) {
    return {
      field: metric.field,
      label: metric.label,
      kind: metric.kind,
      priorText: "—",
      nextText: "—",
      priorRaw: a,
      nextRaw: b,
      direction: "na",
      tone: "flat",
      deltaText: "Not applicable",
    };
  }

  if (metric.kind === "bool") {
    /* A null flag is "CMS did not publish this in this file", on either
       side. Comparing it would turn an unknown into a fact — "Newly added"
       for a plan whose next-year row simply came from a different file.
       So an unpublished flag is never comparable. */
    const aUnknown = a === null || a === undefined;
    const bUnknown = b === null || b === undefined;
    if (aUnknown || bUnknown) {
      return {
        field: metric.field,
        label: metric.label,
        kind: metric.kind,
        priorText: formatMetric(metric.kind, a),
        nextText: formatMetric(metric.kind, b),
        priorRaw: a,
        nextRaw: b,
        direction: "na",
        tone: "flat",
        deltaText: aUnknown && bUnknown ? "Not published by CMS in this file" : "Not applicable",
      };
    }
    const av = !!a, bv = !!b;
    if (av === bv) {
      direction = "flat"; tone = "flat"; deltaText = "No change";
    } else if (bv && !av) {
      direction = "added"; tone = "good"; deltaText = "Newly added";
    } else {
      direction = "removed"; tone = "bad"; deltaText = `Dropped ${yr.forNext}`;
    }
  } else if (metric.kind === "network") {
    const av = String(a ?? "").trim().toUpperCase();
    const bv = String(b ?? "").trim().toUpperCase();
    if (!av || !bv || av === bv) {
      direction = "flat"; tone = "flat"; deltaText = "No change";
    } else {
      direction = "changed"; tone = "warn"; deltaText = "Changed";
    }
  } else {
    const av = Number(a), bv = Number(b);
    // A missing metric (null / undefined / "") is NOT comparable. Guard before
    // coercing, because Number(null) and Number("") are 0, not NaN — otherwise a
    // blank value would masquerade as a real $0 and fabricate a movement.
    const missing = (x) => x === null || x === undefined || x === "";
    const bothNum = !missing(a) && !missing(b) && Number.isFinite(av) && Number.isFinite(bv);
    if (!bothNum || av === bv) {
      direction = "flat"; tone = "flat"; deltaText = "No change";
    } else {
      const up = bv > av;
      direction = up ? "up" : "down";
      const better = up ? metric.higherIsBetter : !metric.higherIsBetter;
      tone = better ? "good" : "bad";
      if (metric.kind === "money") {
        const delta = bv - av;
        deltaText = `${delta > 0 ? "+" : "−"}${fmtMoney(Math.abs(delta))}`;
      } else if (metric.kind === "stars") {
        const delta = bv - av;
        deltaText = `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} ★`;
      }
    }
  }

  return {
    field: metric.field,
    label: metric.label,
    kind: metric.kind,
    priorText: formatMetric(metric.kind, a),
    nextText: formatMetric(metric.kind, b),
    priorRaw: a,
    nextRaw: b,
    direction,
    tone,
    deltaText,
  };
}

/**
 * Human-readable label + tone for a crosswalk status code.
 * @param {string} status
 * @param {object} opts  { nextYear } from the data manifest.
 */
export function statusInfo(status, opts) {
  const yr = yearWords(opts);
  switch (status) {
    case "renewal":
      return { label: `Renewing ${yr.forNext}`, tone: "good", note: `Your plan continues ${yr.inNext}. Review the changes below.` };
    case "consolidation":
      return { label: "Consolidated into another plan", tone: "warn", note: "CMS is merging your plan into the successor plan shown. Your benefits map to the new plan ID." };
    case "service-area-reduction":
      return { label: "Service-area reduction", tone: "warn", note: "This plan is shrinking its service area. Confirm it is still offered in your county." };
    case "termination":
      return { label: `Terminating — not offered ${yr.inNext}`, tone: "bad", note: `This plan will not be offered ${yr.inNext}. You need to pick a new plan during Open Enrollment. That is the yearly sign-up window, October 15 to December 7. If you do nothing, you may be moved to Original Medicare.` };
    case "new":
      return { label: `New plan ${yr.forNext}`, tone: "info", note: `This is a newly offered plan ${yr.forNext}.` };
    default:
      return { label: "Status unavailable", tone: "flat", note: `We could not tell what happens to this plan ${yr.inNext} from the Crosswalk file.` };
  }
}

/** Plain-language name for a plan type code, for the meta line. */
export function planTypeLabel(plan) {
  if (!plan) return "";
  const type = String(plan.planType || "").toUpperCase();
  const net = String(plan.network || "").toUpperCase();
  if (type === "PDP" || net === "PDP") return "Drug-only plan (Part D)";
  if (type === "MAPD") return `Medicare Advantage with drug coverage${net && net !== "PDP" ? ` · ${net}` : ""}`;
  if (type === "MA") return `Medicare Advantage${net && net !== "PDP" ? ` · ${net}` : ""}`;
  return [type, net].filter(Boolean).join(" · ");
}

/**
 * Produce the full diff for a beneficiary's plan.
 * @param {object} args
 * @param {object} args.currentIndex   indexPlans() of prior year
 * @param {object} args.nextIndex      indexPlans() of upcoming year
 * @param {Map}    args.crosswalk      indexCrosswalk()
 * @param {string} args.contractId
 * @param {string} args.planId
 * @param {string} args.county
 * @param {string} args.state
 * @param {number} [args.nextYear]     upcoming plan year, from the manifest
 * @returns {object} { ok, reason?, prior, next, status, statusInfo, metrics, headline }
 */
export function buildDiff(args) {
  const { currentIndex, nextIndex, crosswalk, contractId, planId, county, state } = args;
  const yr = yearWords(args);
  const yearOpts = { nextYear: args.nextYear };

  const priorKey = planKey(contractId, planId, county);
  const prior =
    currentIndex.byKey.get(priorKey) ||
    (currentIndex.byContractPlan.get(contractPlanKey(contractId, planId)) || [])[0];

  if (!prior) {
    return { ok: false, reason: "not-found" };
  }

  const xw = crosswalk.get(contractPlanKey(contractId, planId));
  const status = xw ? xw.status : "renewal";
  const info = statusInfo(status, yearOpts);

  // Refuse to compare when one identity maps to two different plan records:
  // picking either one would put another plan's dollars under this plan's name.
  const dupPrior = currentIndex.duplicateKeys && currentIndex.duplicateKeys.has(priorKey);

  let next = null;
  let nextKey = null;
  if (status !== "termination" && xw) {
    nextKey = planKey(xw.toContractId, xw.toPlanId, county);
    next =
      nextIndex.byKey.get(nextKey) ||
      (nextIndex.byContractPlan.get(contractPlanKey(xw.toContractId, xw.toPlanId)) || [])[0] ||
      null;
  } else if (status !== "termination") {
    // No crosswalk row: assume same ID renews if present next year.
    nextKey = priorKey;
    next =
      nextIndex.byKey.get(nextKey) ||
      (nextIndex.byContractPlan.get(contractPlanKey(contractId, planId)) || [])[0] ||
      null;
  }

  const dupNext = !!(nextKey && nextIndex.duplicateKeys && nextIndex.duplicateKeys.has(nextKey));

  if (dupPrior || dupNext) {
    return {
      ok: true,
      ambiguous: true,
      ambiguousSide: dupPrior ? "prior" : "next",
      prior,
      next: null,
      status,
      statusInfo: {
        label: "Comparison unavailable",
        tone: "warn",
        note:
          "Our copy of the plan file lists more than one plan under this exact plan ID in your county. " +
          "Rather than show you numbers that may belong to a different plan, we are not comparing it. " +
          "Please check the official Medicare Plan Finder at medicare.gov or call 1-800-MEDICARE.",
      },
      metrics: [],
      headline: "We can't safely compare this plan.",
      counts: { good: 0, bad: 0 },
    };
  }

  const metrics = next ? METRICS.map((m) => diffMetric(m, prior, next, yearOpts)) : [];

  // Headline: premium movement is what people feel first.
  let headline = info.label;
  const premiumDiff = metrics.find((m) => m.field === "premium");
  if (status === "termination") {
    headline = `This plan is ending. You will need to pick a new plan ${yr.forNext}.`;
  } else if (premiumDiff && premiumDiff.direction === "up") {
    headline = `Your premium is going up by ${premiumDiff.deltaText.replace("+", "")} a month.`;
  } else if (premiumDiff && premiumDiff.direction === "down") {
    headline = `Your premium is going down by ${premiumDiff.deltaText.replace("−", "")} a month.`;
  } else if (next) {
    headline = "Your premium is unchanged — but other details may have moved. See below.";
  }

  // Plain-language flags for changes a premium headline would otherwise hide.
  const notes = [];
  const netDiff = metrics.find((m) => m.field === "network");
  if (netDiff && netDiff.direction === "changed") {
    notes.push(
      `Your plan type changes from ${netDiff.priorText} to ${netDiff.nextText}. ` +
        "That can change which doctors and hospitals you can use, and whether you need referrals. Check that your doctors are in the new plan."
    );
  }
  if (next && isDrugOnlyPlan(prior)) {
    notes.push(
      "This is a drug-only Part D plan, so the rows for dental, vision, hearing and the yearly limit on what you pay do not apply to it."
    );
  }

  const bad = metrics.filter((m) => m.tone === "bad").length;
  const good = metrics.filter((m) => m.tone === "good").length;

  return {
    ok: true,
    ambiguous: false,
    prior,
    next,
    status,
    statusInfo: info,
    metrics,
    notes,
    headline,
    counts: { good, bad },
  };
}
