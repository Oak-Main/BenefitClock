/* ==========================================================================
   verify-build-output.mjs — assertions against dist/ that the existing gates
   cannot make.

   ci.yml already checks that the pages exist, that no {{TOKEN}} survived, and
   that every HTML href/src resolves. Three classes of breakage slip straight
   through all of that:

     1. The JSON the plan tool fetches at RUNTIME. It is requested by
        /assets/js/plan-diff.js, never by an href or src, so a data file that
        failed to copy into dist/ is invisible to the link checker and shows up
        as a broken tool in production.
     2. The _redirects targets. Seven friendly aliases 301 to canonical URLs;
        nothing verifies the destinations still exist, so a renamed slug turns a
        published alias into a 404 silently.
     3. Whether the built HTML still says what the data says. The repo's worst
        historical defect was a COLA figure that disagreed with itself while the
        build exited 0, and its second worst was sample plan data presented as
        verified CMS figures. Both were content-level, and both passed every
        structural check that existed at the time.

   Run after `npm run build`. Exits non-zero on any failure.
   ========================================================================== */
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { failures++; console.log(`  ✗ ${m}`); };
const read = (p) => readFileSync(p, "utf8");
const isFile = (p) => existsSync(p) && statSync(p).isFile();

if (!existsSync(DIST)) {
  console.error("dist/ does not exist — run `npm run build` first.");
  process.exit(1);
}

/* ---- 1. Runtime-fetched JSON ------------------------------------------ */
console.log("\nRuntime data files (fetched by plan-diff.js)");
{
  const js = read(join(ROOT, "src/assets/js/plan-diff.js"));
  // Derive the list from the code itself so this cannot drift from what the
  // browser actually requests.
  const refs = [...js.matchAll(/\$\{DATA_BASE\}\/([\w.-]+\.json)/g)].map((m) => m[1]);
  const unique = [...new Set(refs)];
  if (!unique.length) bad("no ${DATA_BASE}/*.json references found — has plan-diff.js changed shape?");
  for (const name of unique) {
    const p = join(DIST, "data", name);
    if (!isFile(p)) { bad(`dist/data/${name} is missing — the plan tool fetches it at runtime`); continue; }
    try { JSON.parse(read(p)); ok(`dist/data/${name} exists and parses`); }
    catch (e) { bad(`dist/data/${name} is not valid JSON — ${e.message}`); }
  }
}

/* ---- 2. _redirects targets -------------------------------------------- */
console.log("\nRedirect targets (_redirects)");
{
  const file = join(DIST, "_redirects");
  if (!isFile(file)) bad("_redirects did not reach dist/");
  else {
    const rules = read(file)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split(/\s+/));
    if (!rules.length) bad("_redirects contains no rules");
    for (const [from, to] of rules) {
      if (!to) { bad(`malformed rule: "${from}"`); continue; }
      const path = to.split(/[?#]/)[0];
      const hit = [join(DIST, path), join(DIST, path + ".html"), join(DIST, path, "index.html")].some(isFile);
      hit ? ok(`${from} → ${to}`) : bad(`${from} → ${to} — the target does not exist in dist/`);
    }
  }
}

/* ---- 3. Built HTML agrees with the data ------------------------------- */
console.log("\nBuilt pages agree with the data layer");
{
  const cola = JSON.parse(read(join(DIST, "data", "cola.json")));
  const calc = read(join(DIST, "cola-calculator.html"));

  /* The cycle's COLA (projected today, official from announcement day) is the
     calculator's own default. When these disagree the tool computes a raise from
     a percentage the rest of the page never mentions. */
  const cycleDefault = String(cola.cycle.cola);
  calc.includes(`<option value="${cycleDefault}" selected>`)
    ? ok(`cycle COLA ${cycleDefault}% from cola.json is the calculator's selected default`)
    : bad(`cola.json says cycle.cola=${cycleDefault} but it is not the selected default in cola-calculator.html`);

  const confirmed = String(cola.confirmedCola);
  const keyDates = read(join(DIST, "key-dates.html"));
  keyDates.includes(`${confirmed}%`)
    ? ok(`confirmed COLA ${confirmed}% from cola.json appears on key-dates`)
    : bad(`cola.json says confirmedCola=${confirmed} but "${confirmed}%" does not appear in key-dates.html`);

  /* Statutory figures are indexed annually and must never be inlined. */
  const figures = JSON.parse(read(join(DIST, "data", "medicare-figures.json")));
  const premium = Number(figures.partBPremium).toFixed(2);
  calc.includes(premium)
    ? ok(`Part B premium $${premium} from the data appears on the calculator`)
    : bad(`medicare-figures.json says partBPremium=${premium}, absent from cola-calculator.html`);

  /* The dollar-impact examples are keyed to the determination cycle, so the
     guide's money table must carry the cycle figure, the cycle badge, and the
     recomputed average-check math — whichever state the CSV is in. If the
     cycle row says projected but the page ships a "Confirmed by SSA" badge
     (or vice versa), the flip half-happened and the page contradicts itself. */
  const guide = read(join(DIST, "guides", "2027-social-security-cola.html"));
  const cycle = cola.cycle || {};
  const cycleCola = String(cycle.cola);
  guide.includes(`${cycleCola}%`)
    ? ok(`cycle COLA ${cycleCola}% from cola.json appears on the COLA guide`)
    : bad(`cola.json says cycle.cola=${cycleCola} but "${cycleCola}%" does not appear in the COLA guide`);

  const avg = (cola.examples && cola.examples.rows || []).find((r) => r.key === "average");
  if (!avg) bad("cola.json examples has no 'average' row — the guide's dollar table cannot be verified");
  else {
    const after = "$" + Number(avg.monthlyAfter).toLocaleString("en-US");
    const increase = "+$" + Number(avg.increase).toLocaleString("en-US");
    (guide.includes(after) && guide.includes(increase))
      ? ok(`average-check example ${after} (${increase}) from cola.json appears on the COLA guide`)
      : bad(`cola.json examples say the average check becomes ${after} (${increase}), absent from the COLA guide`);
  }

  const expectedBadge = cycle.status === "projected" ? ">Projected<" : ">Confirmed by SSA<";
  guide.includes(expectedBadge)
    ? ok(`cycle badge on the COLA guide matches the cycle status (${cycle.status})`)
    : bad(`cycle status is ${cycle.status} but the COLA guide does not carry the matching "${expectedBadge.replace(/[<>]/g, "")}" badge`);

  const wrongBadge = cycle.status === "projected" ? ">Confirmed by SSA<" : ">Projected<";
  guide.includes(wrongBadge) && bad(`the COLA guide carries a "${wrongBadge.replace(/[<>]/g, "")}" badge while the cycle row says ${cycle.status}`);
}

/* ---- 4. Sample data is disclosed, visibly ----------------------------- */
console.log("\nSample-data disclosure");
{
  const manifest = JSON.parse(read(join(DIST, "data", "manifest.json")));
  const page = read(join(DIST, "medicare-plan-changes.html"));

  /* The dataset is sample if ANY part is sample: the current-year landscape,
     the next-year landscape and the crosswalk are three separate files, and
     one generated part puts made-up numbers next to real plan names. The
     manifest's per-part flags are the source of truth. */
  const parts = manifest.parts || {};
  const partFlags = Object.values(parts).map((p) => (p && typeof p === "object" ? p.sample : p));
  const anySample = partFlags.some((f) => f === true) || (partFlags.length ? false : manifest.sample !== false);

  if (anySample) {
    /* The banner must ship VISIBLE and be hidden only by script, so that a JS
       failure degrades toward honesty. A `hidden` attribute in the built markup
       inverts that: the disclosure would then depend on the very script that
       could fail. */
    const banner = page.match(/<div[^>]*id="pd-sample-banner"[^>]*>/);
    if (!banner) bad('the dataset is sample but #pd-sample-banner is not in the built page');
    else if (/\shidden[\s>=]/.test(banner[0])) {
      bad(`#pd-sample-banner ships with a "hidden" attribute — the sample warning would depend on JS running: ${banner[0]}`);
    } else ok("#pd-sample-banner ships visible (hidden only by script)");

    const inline = page.match(/<p[^>]*id="pd-sample-inline"[^>]*>/);
    if (!inline) bad('the dataset is sample but #pd-sample-inline is not in the built page');
    else if (/\shidden[\s>=]/.test(inline[0])) bad('#pd-sample-inline ships hidden');
    else ok("#pd-sample-inline ships visible");

    page.toLowerCase().includes("sample")
      ? ok("the word \"sample\" is present in the built page text")
      : bad('the dataset is sample but the page never says "sample"');
  } else {
    /* Real data: the disclosure must be GONE, not merely hidden. A banner
       that survives in the markup says the opposite of the truth about every
       number on the page. */
    if (/id="pd-sample-banner"/.test(page)) {
      bad('#pd-sample-banner is in the built page although every part of the dataset is real');
    } else ok("#pd-sample-banner is absent from the built page (real CMS data)");

    if (/id="pd-sample-inline"/.test(page)) {
      bad('#pd-sample-inline is in the built page although every part of the dataset is real');
    } else ok("#pd-sample-inline is absent from the built page");

    /These are sample numbers/.test(page)
      ? bad("the built page still carries the sample-banner wording although every part of the dataset is real")
      : ok("no sample-banner wording in the built page");

    /Source: CMS Landscape &amp; Crosswalk files/.test(page)
      ? ok("the page names the CMS Landscape & Crosswalk files as the source")
      : bad("the built page does not name the CMS source files");
  }
}

/* ---- 5. Manifest icons resolve ---------------------------------------- */
console.log("\nPWA manifest icons");
{
  const mf = JSON.parse(read(join(DIST, "site.webmanifest")));
  for (const icon of mf.icons || []) {
    isFile(join(DIST, icon.src.replace(/^\//, "")))
      ? ok(`${icon.src} exists`)
      : bad(`${icon.src} is declared in the manifest but missing from dist/ — installability fails on a 404 icon`);
  }
}

console.log(
  failures === 0
    ? `\nBuild output verified.\n`
    : `\n${failures} check(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
