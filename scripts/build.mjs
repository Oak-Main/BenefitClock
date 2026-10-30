/* ==========================================================================
   build.mjs — BenefitDial's tiny static-site generator (zero dependencies)

   - Assembles src/pages/*.html into full documents using src/layout.html
     and src/partials/*.html (token + include based).
   - Copies src/assets -> dist/assets and src/data/*.json -> dist/data.
   - Regenerates data JSON from CSV (via build-*-data.mjs) when needed.
   - Emits sitemap.xml, robots.txt passthrough, and Cloudflare Pages config.

   Page front-matter is an HTML comment at the very top of each page file:

     <!--
     title: Page title | BenefitDial
     description: Meta description (<=160 chars).
     slug: cola-calculator        # output path; "" or "index" => site root
     nav: cola                    # active nav id (home|cola|medicare|dates|guides|about)
     scripts: cola.js             # comma-separated module scripts from /assets/js
     ogtype: website
     -->
   ========================================================================== */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, cpSync, existsSync, statSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { colaHistoryChart, planCountChart } from "./lib/svgcharts.mjs";
import { applyStatusBlocks } from "./lib/status-blocks.mjs";
import { applySampleBlocks } from "./lib/sample-blocks.mjs";
import { isSampleDataset } from "../src/assets/js/lib/plandiff-core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

/* SITE_URL must be an absolute origin. A protocol-less value ("benefitdial.com")
   silently produces relative canonicals, og:image and sitemap <loc> entries —
   all of which look fine in the build log and are broken in production. */
function resolveSiteUrl(raw) {
  const value = (raw || "https://benefitdial.com").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+$/i.test(value)) {
    throw new Error(
      `SITE_URL must be an absolute origin such as "https://benefitdial.com" ` +
        `(got ${JSON.stringify(raw)}). Canonical URLs, og:image and sitemap entries depend on it.`
    );
  }
  return value;
}

const SITE = {
  name: "BenefitDial",
  url: resolveSiteUrl(process.env.SITE_URL),
  tagline: "Your Social Security raise and your Medicare plan — side by side, with no phone calls.",
  twitter: "",
  buildDate: new Date().toISOString().slice(0, 10),
  buildYear: new Date().getFullYear(),
};

/* ---- helpers ----------------------------------------------------------- */
const read = (p) => readFileSync(p, "utf8");
const partialsDir = join(SRC, "partials");

function parseFrontMatter(raw) {
  const m = raw.match(/^\s*<!--([\s\S]*?)-->\s*/);
  const meta = {};
  let body = raw;
  if (m) {
    body = raw.slice(m[0].length);
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key) meta[key] = val;
    }
  }
  return { meta, body };
}

// Recursively resolve {{> partial }} includes.
function resolveIncludes(html, seen = new Set()) {
  return html.replace(/\{\{>\s*([a-z0-9\-_]+)\s*\}\}/gi, (_, name) => {
    if (seen.has(name)) return "";
    const file = join(partialsDir, `${name}.html`);
    if (!existsSync(file)) throw new Error(`Missing partial: ${name}`);
    const nested = new Set(seen);
    nested.add(name);
    return resolveIncludes(read(file), nested);
  });
}

function applyTokens(html, tokens, cycleStatus, isSample) {
  /* Sample blocks are resolved BEFORE the COLA status blocks and before the
     tokens, so the status validator never sees a "{{#sample}}" marker and a
     token inside a block that is kept still gets substituted. A block that is
     dropped takes its tokens with it. */
  const withBlocks = applyStatusBlocks(applySampleBlocks(html, isSample), cycleStatus);
  return withBlocks.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : m
  );
}

/* sitemap <lastmod> should describe when the page changed. Stamping every URL
   with the build date meant it re-fired on every rebuild and carried no signal.
   Fall back to omitting lastmod (it is optional) rather than inventing one. */
function gitDate(args) {
  try {
    const out = execFileSync("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim().split("\n").filter(Boolean);
    const date = args.includes("--diff-filter=A") ? out[out.length - 1] : out[0];
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  } catch {
    return null;
  }
}

const lastCommitDate = (file) => gitDate(["log", "-1", "--format=%cs", "--", file]);

/* Article datePublished/dateModified describe the page, so derive them from the
   page's own history rather than hardcoding a date that never moves again.
   Degrades to null on a shallow clone, same as sitemap lastmod. */
const firstCommitDate = (file) => gitDate(["log", "--diff-filter=A", "--format=%cs", "--", file]);

function cleanUrl(slug) {
  if (!slug || slug === "index") return "/";
  return `/${slug}`;
}

function outPath(slug) {
  if (!slug || slug === "index") return join(DIST, "index.html");
  return join(DIST, `${slug}.html`);
}

/* ---- data build -------------------------------------------------------- */
function buildData() {
  console.log("• Building data (CPI-W + CMS plan JSON + statutory figures + AEP season)…");
  execFileSync(process.execPath, [join(__dirname, "build-cola-data.mjs")], { stdio: "inherit" });
  execFileSync(process.execPath, [join(__dirname, "build-medicare-figures.mjs")], { stdio: "inherit" });
  execFileSync(process.execPath, [join(__dirname, "build-aep-data.mjs")], { stdio: "inherit" });
  execFileSync(process.execPath, [join(__dirname, "build-plan-data.mjs")], { stdio: "inherit" });
}

/* Every figure the pages quote comes from the data layer. When the data stops
   carrying a figure, the correct outcome is a failed build — not a plausible
   number baked into money copy that no test would ever flag. */
function requireFigure(value, token, hint) {
  if (value == null || value === "") {
    throw new Error(
      `Missing data for {{${token}}}. ${hint}\n` +
        `Refusing to build: pages quote this figure in copy about people's benefits.`
    );
  }
  return String(value);
}

/* ---- main -------------------------------------------------------------- */
function build() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  buildData();

  // Pull confirmed/projected COLA figures so pages stay in sync with the data.
  // A missing or unreadable data file is a build failure, not a fallback.
  let cola;
  try {
    cola = JSON.parse(read(join(SRC, "data", "cola.json")));
  } catch (err) {
    throw new Error(`Could not read src/data/cola.json — every COLA figure on the site comes from it. (${err.message})`);
  }
  let figures;
  try {
    figures = JSON.parse(read(join(SRC, "data", "medicare-figures.json")));
  } catch (err) {
    throw new Error(`Could not read src/data/medicare-figures.json — Part B and Part D figures come from it. (${err.message})`);
  }
  /* The enrolment season rolls on its own schedule too — see aep.csv. */
  let aep;
  try {
    aep = JSON.parse(read(join(SRC, "data", "aep.json")));
  } catch (err) {
    throw new Error(`Could not read src/data/aep.json — the Annual Enrollment Period dates come from it. (${err.message})`);
  }
  /* The plan tool compares its own pair of years, which roll on the CMS
     schedule — not with the COLA or the Part B figures. Borrowing any of those
     tokens for plan-year copy would read wrong for weeks at each roll point. */
  let planManifest;
  try {
    planManifest = JSON.parse(read(join(SRC, "data", "manifest.json")));
  } catch (err) {
    throw new Error(`Could not read src/data/manifest.json — the plan-comparison years come from it. (${err.message})`);
  }
  /* Whether ANY part of the plan dataset is sample. The same function the
     browser uses (plandiff-core.js) decides this, so the build and the page
     can never disagree about whether the disclosure belongs on the page. */
  const planIsSample = isSampleDataset(planManifest);

  const longDate = (iso) => {
    const [y, m, d] = String(iso || "").split("-").map(Number);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return y && m && d ? `${months[m - 1]} ${d}, ${y}` : String(iso || "");
  };
  const money = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const whole = (n) => Number(n).toLocaleString("en-US");

  /* Hub date-band + checklist helpers. Everything is derived from aep.json /
     cola.json so the hub never carries a typed season date. */
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parseIso = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const shortParts = (iso) => { const dt = parseIso(iso); return { monthShort: MONTHS_SHORT[dt.getUTCMonth()], day: String(dt.getUTCDate()) }; };
  const shortLabel = (iso) => { const p = shortParts(iso); return `${p.monthShort} ${p.day}`; };
  const plusDays = (iso, n) => { const dt = parseIso(iso); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); };
  const aepStart = shortParts(requireFigure(aep.windowStart, "AEP window start", "The current row in src/data/aep.csv needs a window_start."));
  const aepEnd = shortParts(requireFigure(aep.windowEnd, "AEP window end", "The current row in src/data/aep.csv needs a window_end."));
  /* The cycle the site is telling the story of, and whether its COLA is still
     a projection. Declared here (not with the other cycle tokens below)
     because the announcement date and the projected-row tokens depend on it. */
  const cycle = cola.cycle || {};
  const cycleIsProjected = (cycle.status || "") === "projected";
  /* The cycle's announcement date: the EXPECTED date while the cycle row is a
     projection, the ACTUAL date once it is official. Everything that shows "the
     date" for this cycle reads this, so the flip moves it with the row. */
  const cycleAnnounceIso = requireFigure(
    cycleIsProjected ? cola.nextAnnouncementDate : cycle.announced,
    "CYCLE_ANNOUNCE_DATE",
    cycleIsProjected
      ? "The projected row in src/data/cola-history.csv needs an announce_expected date."
      : "The current cycle row in src/data/cola-history.csv needs an `announced` date once status=official."
  );
  const colaAnnounce = shortParts(cycleAnnounceIso);
  /* Weeks 1-3 roll forward from the window start; week 4 runs from day 22 to
     thirteen days before the deadline, and week 5 is the final twelve-day
     stretch, so the last heading always names the deadline itself. */
  const weekRange = (offset) => {
    let from, to;
    if (offset <= 14) { from = plusDays(aep.windowStart, offset); to = plusDays(aep.windowStart, offset + 6); }
    else if (offset === 21) { from = plusDays(aep.windowStart, 21); to = plusDays(aep.windowEnd, -13); }
    else { from = plusDays(aep.windowEnd, -12); to = aep.windowEnd; }
    return `${shortLabel(from)} – ${shortLabel(to)}`;
  };

  /* The NEXT projection's expected date (the projected row's announce_expected).
     Only meaningful while a projected row exists; see projectedTokens. */
  const announce = cola.nextAnnouncementDate || null;

  /* "Data last refreshed" describes the DATA, so it is derived from the data's
     own provenance dates. Using the build date meant every unrelated CSS commit
     silently re-stamped the site as freshly verified.

     Two stamps, because two different things were verified:
       DATA_UPDATED       — the Medicare figures (Part B / Part D). Only the
                            Medicare source date moves it. A COLA announcement
                            used to move this too, so on announcement day the
                            plan tool and the "Federal Register via GPO govinfo,
                            confirmed ..." lines would have claimed the Part B
                            figures were re-confirmed that day. They were not.
       COLA_DATA_UPDATED  — the COLA figures, which really are confirmed on the
                            day SSA announces; the newest of the COLA
                            announcement dates and the Medicare source date. */
  const dataUpdated = figures.sourceUpdated || null;
  const colaProvenanceDates = [
    ...(cola.history || []).map((h) => h.announced).filter(Boolean),
    figures.sourceUpdated,
  ].filter(Boolean).sort();
  const colaDataUpdated = colaProvenanceDates[colaProvenanceDates.length - 1] || null;

  /* The projected row's figures. While the cycle is still a projection these
     are required (pages quote them, inside {{#projected}} blocks). Once the
     cycle row is official there may be no projected row at all — a next-year
     projection should only appear when someone has a real source for one — so
     the tokens are then simply not defined. A page that uses one outside a
     {{#projected}} block fails the build with the token's name, which is what
     keeps a stale estimate from being quoted after the flip. */
  const projectedTokens = cola.projectedYear == null && !cycleIsProjected
    ? {}
    : {
        COLA_PROJECTED: requireFigure(
          cola.projectedCola,
          "COLA_PROJECTED",
          "No row with status=projected in src/data/cola-history.csv, and the current cycle's row is still projected."
        ),
        COLA_PROJECTED_YEAR: requireFigure(cola.projectedYear, "COLA_PROJECTED_YEAR", "No row with status=projected in src/data/cola-history.csv."),
        COLA_PROJECTED_SOURCE: requireFigure(cola.projectedSource, "COLA_PROJECTED_SOURCE", "The projected row in src/data/cola-history.csv needs a source."),
        COLA_ANNOUNCE_DATE: requireFigure(announce, "COLA_ANNOUNCE_DATE", "The projected row in src/data/cola-history.csv needs an announce_expected date."),
        COLA_ANNOUNCE_DATE_LONG: longDate(requireFigure(announce, "COLA_ANNOUNCE_DATE_LONG", "The projected row in src/data/cola-history.csv needs an announce_expected date.")),
      };

  const colaTokens = {
    COLA_CONFIRMED: requireFigure(cola.confirmedCola, "COLA_CONFIRMED", "No official COLA in src/data/cola-history.csv."),
    COLA_CONFIRMED_YEAR: requireFigure(cola.confirmedYear, "COLA_CONFIRMED_YEAR", "No official COLA row in src/data/cola-history.csv."),
    ...projectedTokens,
    COLA_CONFIRMED_ANNOUNCED: requireFigure(cola.confirmedAnnounced, "COLA_CONFIRMED_ANNOUNCED", "The latest official row in src/data/cola-history.csv needs an `announced` date."),
    COLA_CONFIRMED_ANNOUNCED_LONG: longDate(requireFigure(cola.confirmedAnnounced, "COLA_CONFIRMED_ANNOUNCED_LONG", "The latest official row in src/data/cola-history.csv needs an `announced` date.")),
    COLA_CONFIRMED_LATE_NOTE: cola.confirmedLateReason ? ` (later than usual because of ${cola.confirmedLateReason})` : "",
    COLA_LATE_YEAR: requireFigure(cola.lateYear, "COLA_LATE_YEAR", "No official row in src/data/cola-history.csv has a late_reason. The \"date can move\" sentences cite the most recent late announcement."),
    COLA_LATE_ANNOUNCED_LONG: longDate(requireFigure(cola.lateAnnounced, "COLA_LATE_ANNOUNCED_LONG", "The official row with a late_reason in src/data/cola-history.csv needs an `announced` date.")),
    DATA_UPDATED: longDate(requireFigure(dataUpdated, "DATA_UPDATED", "No source_updated date on the current row of src/data/medicare-figures.csv.")),
    COLA_DATA_UPDATED: longDate(requireFigure(colaDataUpdated, "COLA_DATA_UPDATED", "No provenance dates found in the COLA history or Medicare figures.")),

    // Statutory Medicare figures — indexed annually, so never inline them in markup.
    PART_B_PREMIUM: money(requireFigure(figures.partBPremium, "PART_B_PREMIUM", "Add the current year's part_b_premium to src/data/medicare-figures.csv.")),
    PART_B_DEDUCTIBLE: whole(requireFigure(figures.partBDeductible, "PART_B_DEDUCTIBLE", "Add the current year's part_b_deductible to src/data/medicare-figures.csv.")),
    PART_D_OOP_CAP: whole(requireFigure(figures.partDOopCap, "PART_D_OOP_CAP", "Add the current year's part_d_oop_cap to src/data/medicare-figures.csv.")),
    MEDICARE_FIGURES_YEAR: requireFigure(figures.currentYear, "MEDICARE_FIGURES_YEAR", "src/data/medicare-figures.csv has no official row."),
    /* The Part D cap for the plan year the site is helping people shop for
       (PLAN_YEAR_NEXT). Looked up by year rather than "the newest row", so it
       does not move when the Part B notice later promotes the 2027 row. */
    PART_D_OOP_CAP_NEXT: whole(requireFigure(
      ((figures.history || []).find((r) => Number(r.year) === Number(planManifest.nextYear)) || {}).partDOopCap,
      "PART_D_OOP_CAP_NEXT",
      `Add a ${planManifest.nextYear} row with part_d_oop_cap to src/data/medicare-figures.csv (status=announced is fine before the Part B notice).`
    )),

    // Plan-comparison years, straight from the plan data the tool actually loads.
    PLAN_YEAR_CURRENT: requireFigure(planManifest.currentYear, "PLAN_YEAR_CURRENT", "src/data/manifest.json has no currentYear — check scripts/build-plan-data.mjs."),
    PLAN_YEAR_NEXT: requireFigure(planManifest.nextYear, "PLAN_YEAR_NEXT", "src/data/manifest.json has no nextYear — check scripts/build-plan-data.mjs."),

    /* Enrolment season. The window dates are quoted in body copy and in FAQ
       structured data, so every phrasing the pages need is derived in
       build-aep-data.mjs rather than restated by hand on either side. */
    AEP_SEASON_YEAR: requireFigure(aep.seasonYear, "AEP_SEASON_YEAR", "No row with status=current in src/data/aep.csv."),
    AEP_COVERAGE_YEAR: requireFigure(aep.coverageYear, "AEP_COVERAGE_YEAR", "No row with status=current in src/data/aep.csv."),
    AEP_WINDOW_START: requireFigure(aep.windowStartLabel, "AEP_WINDOW_START", "The current row in src/data/aep.csv needs a window_start."),
    AEP_WINDOW_END: requireFigure(aep.windowEndLabel, "AEP_WINDOW_END", "The current row in src/data/aep.csv needs a window_end."),
    AEP_WINDOW_END_LONG: requireFigure(aep.windowEndLong, "AEP_WINDOW_END_LONG", "The current row in src/data/aep.csv needs a window_end."),
    AEP_WINDOW_RANGE: requireFigure(aep.windowRange, "AEP_WINDOW_RANGE", "The current row in src/data/aep.csv needs window_start and window_end."),
    AEP_WINDOW_RANGE_LONG: requireFigure(aep.windowRangeLong, "AEP_WINDOW_RANGE_LONG", "The current row in src/data/aep.csv needs window_start and window_end."),
    AEP_COVERAGE_START: requireFigure(aep.coverageStartLabel, "AEP_COVERAGE_START", "The current row in src/data/aep.csv needs an ma_oep_start."),
    AEP_COVERAGE_START_LONG: requireFigure(aep.coverageStartLong, "AEP_COVERAGE_START_LONG", "The current row in src/data/aep.csv needs an ma_oep_start."),
    AEP_MA_OEP_RANGE_LONG: requireFigure(aep.maOepRangeLong, "AEP_MA_OEP_RANGE_LONG", "The current row in src/data/aep.csv needs ma_oep_start and ma_oep_end."),

    /* Open-enrollment hub (src/pages/open-enrollment.html). The hub's date-band
       cards split month from day, and its week-by-week checklist headers quote
       five rolling sub-windows — all derived here from the same window dates so
       the hub re-labels itself every season instead of carrying typed dates
       that silently go stale (the exact failure AEP_LITERALS guards against). */
    AEP_START_MONTH: aepStart.monthShort, AEP_START_DAY: aepStart.day,
    AEP_END_MONTH: aepEnd.monthShort, AEP_END_DAY: aepEnd.day,
    COLA_ANNOUNCE_MONTH: colaAnnounce.monthShort, COLA_ANNOUNCE_DAY: colaAnnounce.day,
    AEP_WEEK1_RANGE: weekRange(0), AEP_WEEK2_RANGE: weekRange(7),
    AEP_WEEK3_RANGE: weekRange(14), AEP_WEEK4_RANGE: weekRange(21),
    AEP_WEEK5_RANGE: weekRange(28),
  };

  /* ---- Dollar-impact worked examples (COLA guide) ------------------------
     cola.json's cycle/examples are keyed to the determination cycle, so the
     guide's money table labels itself "projected" today and "confirmed by SSA"
     on announcement day from the same one-row CSV edit. The table is generated
     HTML rather than markup tokens: String.replace does not re-scan inserted
     text, so a token inside a token's replacement would ship unresolved. */
  const exampleRows = (cola.examples && cola.examples.rows) || [];
  const usd0 = (n) => Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const signedUsd0 = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + usd0(Math.abs(n));
  const exRow = (key, token) => {
    // Not requireFigure: it returns String(value), and a row is an object.
    // The examples carry real dollar figures, so a missing row is a failed
    // build, not a silently NaN table.
    const row = exampleRows.find((r) => r.key === key);
    if (!row) {
      throw new Error(
        `Missing data for {{${token}}}. Add a "${key}" row to src/data/benefit-examples.csv.\n` +
          `Refusing to build: pages quote this figure in copy about people's benefits.`
      );
    }
    return row;
  };
  const exampleTokens = Object.fromEntries(
    [
      ["average", "AVG"],
      ["max_fra", "MAX"],
      ["ssi_individual", "SSI_IND"],
      ["ssi_couple", "SSI_COUPLE"],
      ["couple", "COUPLE"],
    ].flatMap(([key, prefix]) => {
      const row = exRow(key, `COLA_EX_${prefix}`);
      return [
        [`COLA_EX_${prefix}_BEFORE`, usd0(row.monthlyBefore)],
        [`COLA_EX_${prefix}_AFTER`, usd0(row.monthlyAfter)],
        [`COLA_EX_${prefix}_MONTH`, signedUsd0(row.increase)],
        [`COLA_EX_${prefix}_YEAR`, signedUsd0(row.increaseYear)],
      ];
    })
  );
  const cycleAnnouncedLong = cycleIsProjected ? "" : longDate(cycleAnnounceIso);
  const cycleTokens = {
    CYCLE_YEAR: requireFigure(cycle.year, "CYCLE_YEAR", "cola.json has no cycle object — run scripts/build-cola-data.mjs."),
    CYCLE_COLA: requireFigure(cycle.cola, "CYCLE_COLA", "cola.json has no cycle.cola — run scripts/build-cola-data.mjs."),
    CYCLE_STATUS_LC: cycleIsProjected ? "projected" : "confirmed",
    /* The cycle's announcement date, long form: expected while projected,
       actual once official (see cycleAnnounceIso). */
    CYCLE_ANNOUNCE_DATE_LONG: longDate(cycleAnnounceIso),
    COLA_PRIOR_YEAR: requireFigure(cycle.priorYear, "COLA_PRIOR_YEAR", "No official COLA row before the cycle year in src/data/cola-history.csv."),
    COLA_PRIOR_COLA: requireFigure(cycle.priorCola, "COLA_PRIOR_COLA", "No official COLA row before the cycle year in src/data/cola-history.csv."),
    /* Calculator hint under the COLA picker. The picker defaults to the cycle's
       COLA (the raise people are about to get), which is the projected figure
       today and the official one from announcement day. */
    CYCLE_CALC_HINT: cycleIsProjected
      ? `The ${cycle.year} figure is an early estimate. The official COLA is expected on <strong>${longDate(cycleAnnounceIso)}</strong>.`
      : `The ${cycle.year} COLA is official: the Social Security Administration announced it on ${cycleAnnouncedLong}.`,
    // The benefit-year the base amounts come from: the raise taking effect in
    // January of cycle year Y is applied to the figures SSA published for Y-1.
    CYCLE_BASE_YEAR: String(Number(cycle.year) - 1),
    CYCLE_STATUS_CLAUSE: cycleIsProjected
      ? `The ${cycle.cola}% figure is still a projection; the official ${cycle.year} figure is expected on ${longDate(cycleAnnounceIso)}.`
      : `The ${cycle.cola}% figure is official — the Social Security Administration announced it on ${cycleAnnouncedLong}.`,
    COLA_CYCLE_BADGE: cycleIsProjected
      ? `<span class="badge badge--warn">Projected</span> <span class="muted">Official figure expected ${longDate(cycleAnnounceIso)}.</span>`
      : `<span class="badge badge--good">Confirmed by SSA</span> <span class="muted">Announced ${cycleAnnouncedLong}.</span>`,
    ...exampleTokens,
  };
  const TABLE_COLA_RAISE_EXAMPLES = `<div class="table-scroll">
      <table class="data">
        <caption>What the ${cycle.cola}% ${cycleIsProjected ? "projected" : "confirmed"} ${cycle.year} COLA means by benefit level</caption>
        <thead>
          <tr>
            <th scope="col">Benefit level</th>
            <th scope="col" class="num">Monthly ${Number(cycle.year) - 1}</th>
            <th scope="col" class="num">Monthly ${cycle.year}</th>
            <th scope="col" class="num">Change</th>
            <th scope="col" class="num">Per year</th>
          </tr>
        </thead>
        <tbody>
${exampleRows.map((r) => `          <tr>
            <td>${r.label}</td>
            <td class="num">${usd0(r.monthlyBefore)}</td>
            <td class="num">${usd0(r.monthlyAfter)}</td>
            <td class="num"><strong>${signedUsd0(r.increase)}</strong></td>
            <td class="num">${signedUsd0(r.increaseYear)}</td>
          </tr>`).join("\n")}
        </tbody>
      </table>
    </div>`;

  // Site-level tokens that front matter may also reference (titles, descriptions).
  const SITE_TOKENS = {
    SITE_URL: SITE.url,
    SITE_NAME: SITE.name,
    BUILD_YEAR: String(SITE.buildYear),
    BUILD_DATE: SITE.buildDate,
  };

  // Build-time inline-SVG charts (golden-fact data; no client JS, SEO-friendly).
  const chartTokens = {
    CHART_COLA_HISTORY: cola.history
      ? colaHistoryChart(cola.history, cola.confirmedYear, cola.projectedYear)
      : "",
    CHART_PLANS_MAPD: planCountChart({
      ariaWhat: "Average Medicare Advantage prescription-drug (MA-PD) plans available to a typical beneficiary",
      caption: "Average MA-PD plans available to a typical beneficiary.",
      fromYear: 2025, fromValue: 34, toYear: 2026, toValue: 32, unitLabel: "Plans",
    }),
    CHART_PLANS_PDP: planCountChart({
      ariaWhat: "Stand-alone Medicare Part D prescription drug plans offered nationwide",
      caption: "Stand-alone Part D plans offered nationwide.",
      fromYear: 2025, fromValue: 474, toYear: 2026, toValue: 367, unitLabel: "Plans",
    }),
  };

  const layout = read(join(SRC, "layout.html"));
  const pagesDir = join(SRC, "pages");
  const pageFiles = readdirSync(pagesDir).filter((f) => f.endsWith(".html"));

  /* Enrolment dates typed into markup instead of drawn from aep.csv. The season
     rolls every autumn, so a literal is a date that silently goes on being
     displayed a year after it stopped being true — and because the tokens below
     render the identical string today, nothing about the built page looks wrong
     until the roll. Fourteen of these were found across five pages, all
     rendering byte-identically to the token that should have produced them.
     The needles come from the data, so this can never check for a phrasing the
     data layer no longer emits. */
  const AEP_LITERALS = [
    [aep.windowRangeLong, "AEP_WINDOW_RANGE_LONG"],
    [aep.maOepRangeLong, "AEP_MA_OEP_RANGE_LONG"],
    [aep.coverageStartLong, "AEP_COVERAGE_START_LONG"],
    [aep.windowRange, "AEP_WINDOW_RANGE"],
  ].filter(([needle]) => needle);

  const built = [];
  for (const file of pageFiles) {
    const raw = read(join(pagesDir, file));

    for (const [needle, token] of AEP_LITERALS) {
      if (raw.includes(needle)) {
        throw new Error(
          `${file}: the enrolment date "${needle}" is written into the markup. ` +
            `Use {{${token}}} instead — it renders the same string today and moves with ` +
            `src/data/aep.csv when the season rolls.\n` +
            `Refusing to build: a literal here keeps advertising a window that has closed.`
        );
      }
    }

    const { meta, body } = parseFrontMatter(raw);
    const slug = meta.slug !== undefined ? meta.slug : basename(file, ".html");
    const url = cleanUrl(slug);
    const canonical = SITE.url + (url === "/" ? "/" : url);

    const scripts = (meta.scripts || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `<script type="module" src="/assets/js/${s}"></script>`)
      .join("\n    ");

    /* Per-page social card, via front-matter `ogimage:` (a filename inside
       /assets/img/). Missing file = failed build, not a silently broken
       og:image URL — crawlers fetch these long after the build log is gone. */
    let ogImage = `${SITE.url}/assets/img/og-default.png`;
    let ogImageType = "image/png";
    if (meta.ogimage) {
      const file = join(SRC, "assets", "img", meta.ogimage);
      if (!existsSync(file)) {
        throw new Error(
          `${file}: ogimage references a file that does not exist. ` +
            `Refusing to build: og:image would 404 in every social preview of ${url}.`
        );
      }
      ogImage = `${SITE.url}/assets/img/${meta.ogimage}`;
      ogImageType = meta.ogimage.endsWith(".png") ? "image/png" : "image/jpeg";
    }
    const DEFAULT_OG_ALT =
      "BenefitDial social card: &quot;Your raise. Your plan. Side by side.&quot; — Social Security COLA plus Medicare plan changes, with no phone calls.";

    /* Front-matter values are substituted INTO the token map, so they are never
       themselves scanned by applyTokens. Resolve them first, otherwise a title
       or description can only ever hardcode a year that the body tokenises. */
    const pageDates = {
      PAGE_PUBLISHED: firstCommitDate(join(pagesDir, file)) || SITE.buildDate,
      PAGE_MODIFIED: lastCommitDate(join(pagesDir, file)) || SITE.buildDate,
    };
    const fm = (value, fallback) =>
      applyTokens(String(value ?? fallback), { ...colaTokens, ...cycleTokens, ...SITE_TOKENS, ...pageDates, CANONICAL: canonical }, cycle.status, planIsSample);

    const tokens = {
      // TITLE lands in <title> and in several quoted attributes (og:title,
      // twitter:title, JSON-LD), so it needs the same escaping as DESCRIPTION.
      TITLE: fm(meta.title, SITE.name).replace(/"/g, "&quot;"),
      DESCRIPTION: fm(meta.description, SITE.tagline).replace(/"/g, "&quot;"),
      CANONICAL: canonical,
      SITE_URL: SITE.url,
      SITE_NAME: SITE.name,
      OG_TYPE: meta.ogtype || "website",
      OG_IMAGE: ogImage,
      OG_IMAGE_TYPE: ogImageType,
      // Describes the actual card (shared brand card or per-page photograph).
      OG_IMAGE_ALT: fm(meta.ogalt, DEFAULT_OG_ALT).replace(/"/g, "&quot;"),
      BUILD_DATE: SITE.buildDate,
      BUILD_YEAR: String(SITE.buildYear),
      PAGE_SCRIPTS: scripts,
      // Resolved like title/description — head: carries article:* meta that
      // needs the same tokens the body uses.
      HEAD_EXTRA: fm(meta.head, ""),
      ...pageDates,
      ROBOTS: meta.robots || "index, follow, max-image-preview:large",
      CONTENT: body.trim(),
      ...colaTokens,
      ...cycleTokens,
      ...chartTokens,
      TABLE_COLA_RAISE_EXAMPLES,
    };

    let html = layout.replace("{{CONTENT}}", () => tokens.CONTENT);
    html = resolveIncludes(html);
    html = applyTokens(html, tokens, cycle.status, planIsSample);

    /* A token that never got substituted ships as literal "{{FOO}}" in front of
       a reader. Treat it as a build failure rather than a proofreading problem.
       An unresolved conditional block ships as literal "{{#sample}}" — also a
       build failure, because it means the page asked a question the build
       never answered. */
    const orphans = [
      ...new Set(
        (html.match(/\{\{\s*[A-Z0-9_]+\s*\}\}|\{\{>\s*[a-z0-9\-_]+\s*\}\}/gi) || [])
      ),
    ];
    if (orphans.length) {
      throw new Error(`${file}: unresolved template token(s) in output: ${orphans.join(", ")}`);
    }
    const unclosedBlocks = [...new Set((html.match(/\{\{[#/][a-z]+\}\}/gi) || []))];
    if (unclosedBlocks.length) {
      throw new Error(
        `${file}: unresolved conditional block(s) in output: ${unclosedBlocks.join(", ")}`
      );
    }

    // Active nav state.
    if (meta.nav) {
      html = html.replace(
        new RegExp(`(data-nav="${meta.nav}")`),
        `$1 aria-current="page"`
      );
    }

    const dest = outPath(slug);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, html);
    built.push({ slug, url, file, priority: meta.priority, changefreq: meta.changefreq, robots: meta.robots, lastmod: lastCommitDate(join(pagesDir, file)) });
    console.log(`  → ${url}  (${basename(dest)})`);
  }

  // Assets & data. og-default.svg is the *source* the OG PNG is rendered from;
  // shipping it too just serves ~1.7 KB nobody requests.
  cpSync(join(SRC, "assets"), join(DIST, "assets"), {
    recursive: true,
    filter: (src) => basename(src) !== "og-default.svg",
  });
  if (existsSync(join(SRC, "data"))) {
    mkdirSync(join(DIST, "data"), { recursive: true });
    for (const f of readdirSync(join(SRC, "data"))) {
      if (f.endsWith(".json")) cpSync(join(SRC, "data", f), join(DIST, "data", f));
    }
  }

  // Static root passthrough (favicon, _headers, _redirects, robots, manifest…)
  const staticDir = join(SRC, "static");
  if (existsSync(staticDir)) {
    for (const f of readdirSync(staticDir)) {
      cpSync(join(staticDir, f), join(DIST, f), { recursive: true });
    }
  }

  // sitemap.xml
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    built
      .filter((p) => !/noindex/i.test(p.robots || ""))
      .map((p) => {
        const loc = SITE.url + (p.url === "/" ? "/" : p.url);
        const pr = p.priority || (p.url === "/" ? "1.0" : "0.8");
        const cf = p.changefreq || "weekly";
        const lastmod = p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : "";
        return `  <url><loc>${loc}</loc><changefreq>${cf}</changefreq><priority>${pr}</priority>${lastmod}</url>`;
      })
      .join("\n") +
    `\n</urlset>\n`;
  writeFileSync(join(DIST, "sitemap.xml"), sitemap);

  // robots.txt — generated from SITE_URL so it can never drift from the domain.
  writeFileSync(join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`);

  console.log(`\n✓ Built ${built.length} pages to dist/  (site: ${SITE.url})`);
}

build();
