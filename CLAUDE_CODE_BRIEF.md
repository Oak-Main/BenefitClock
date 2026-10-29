# CLAUDE_CODE_BRIEF — finalization list for lane M1

**Repo:** Oak-Main/BenefitClock · **Branch:** `mm/aep-2027-plans`
**Draft PR:** https://github.com/Oak-Main/BenefitClock/pull/27 (green)
**Written:** 2026-10-29

The tool now runs on real CMS data. This list is what is left, in priority
order, for whoever finalizes this.

---

## Priority 1 — the site currently says something untrue

**Six passages tell readers the plan tool runs on made-up data. It does not.**
The CMS CY2026 Landscape, CY2027 Landscape and CY2027 Plan Crosswalk are all
loaded (`manifest.json` → `parts` → all three `sample: false`), and the
sample banner is gone from the built page.

Drafted replacements are in `content/drafts/aep-2027-copy.md`, each marked
`status: needs-human-review`.

1. `src/pages/open-enrollment.html:260` — the Open Enrollment hub says
   "**Sample data.** The tool runs on clearly-labeled sample plans until CMS
   publishes the … files." This is the worst one: it is on the AEP hub, in
   front of every visitor, during the only season this matters.
2. `src/pages/how-it-works.html:144-145` — the "honest note" callout now
   admits to a sample dataset that no longer exists, and its last sentence
   ("we would rather tell you this plainly than pretend the … numbers are
   already final") reads as a false confession.
3. `src/pages/medicare-plan-changes.html:206-208` — FAQ "Why don't I see
   2027 numbers yet?"
4. `src/pages/medicare-plan-changes.html:233` — the same stale answer in the
   JSON-LD, where search engines will quote it. It also hardcodes `2027`
   where the visible copy uses `{{PLAN_YEAR_NEXT}}` — a second defect that
   would silently go wrong at the next roll.
5. `src/pages/how-it-works.html:157-159` — the timeline entry for an event
   that has already happened.
6. `src/pages/medicare-plan-changes.html:40, 101` — the sample banner's own
   wording, which returns the moment the data is only *partly* real.

**Mechanism is ready:** `{{#sample}} … {{/sample}}` / `{{#real}} … {{/real}}`
blocks, resolved at build time from the manifest's per-part flags
(`scripts/lib/sample-blocks.mjs`). Straight replacements are fine; per-part
wording is better if a part ever goes missing again.

## Priority 2 — one new user-facing string to approve

`src/assets/js/lib/plandiff-core.js` → `fmtBool()` renders
**"Not published by CMS in this file"** for the dental / vision / hearing
rows, because the combined Landscape file does not publish those flags and
the old behaviour printed "Not included" — a claim the file cannot support.

Wording and capitalisation are the owner's call.

## Priority 3 — decide the stand-alone Part D (PDP) gap

The county-scoped Landscape file contains no national PDP plans
(`National PDP` = `Not Applicable` on every scoped row), so the tool compares
Medicare Advantage plans only. Is that acceptable for the AEP season, or
should national PDP plans be added? Adding them needs a scope rule for a plan
with no county in a State → County → Plan picker.

## Priority 4 — the November 2027 Part B job (not this lane)

1. Fill `part_b_premium` and `part_b_deductible` on the 2027 row of
   `src/data/medicare-figures.csv` from the Federal Register notice, and
   change `status` from `announced` to `official`.
2. Replace the hand-typed 2027 projection figures (`~$209.50`, `~+$6.60`) —
   full hit list in `HANDOFF.md` §4. They are correct today (verified against
   https://www.cms.gov/oact/tr/2026) and must not survive the official
   number.

## Priority 5 — merge and deploy

The draft PR is green. This lane never merges, never deploys and never
creates cloud resources. Cloudflare Pages deploys from `main` once merged.

---

## Open questions

1. **Should the open-enrollment "Sample data" line be dropped or replaced?**
   A replacement sentence is drafted; dropping it entirely is also defensible
   now that the tool carries its own on-page provenance line.
2. **Should the timeline entry in `how-it-works.html` stay as a past-tense
   entry, or move to a "what happened" section?** The draft offers both.
3. **Do you want the partially-real case handled per part?** Today the
   disclosure is one blanket "sample" state. If a single file ever goes
   missing, the honest wording has to name which part — the manifest already
   knows. That needs per-part build branches and new sentences.
4. **Is MA-only acceptable for the AEP season?** See Priority 3.

## Things worth knowing

- **The three CMS files are hashed.** `docs/CMS-2027-SOURCES.md` has the page
  URL, release label, download date, and SHA-256 for both the archive and the
  extracted CSV of each. `src/data/manifest.json` quotes all of it. A data
  file without a provenance sidecar now **fails the build** — a number nobody
  can trace does not ship.
- **The normalizer fixes three defects the earlier branch shipped.** 246 CY2026
  rows carried `Not Applicable` as a premium, and 217 rows carried
  `Plan Too New To Be Measured` as a MOOP. Those became `NaN` in the JSON,
  which compares as "no change" and prints as a dash. Now they are empty
  (unknown), never `NaN` and never `0`.
- **The premium comes from `Part C Premium`, not the consolidated Part C+D
  column.** The consolidated column is `Not Applicable` on every plan without
  Part D — 209 of the 2,137 CY2027 rows — so it can only ever be a fallback.
- **The five-plan spot check compared the shipped CSV against the raw CMS
  archive**, not against itself: 5/5 match on plan name, premium, drug
  deductible, MOOP and star rating (`HANDOFF.md` §5).
- **The banner is decided at build time**, so the shipped HTML is correct
  before any script runs, and `verify:build` fails if the banner is present
  with real data or missing with sample data.
- **The 2027 Part B projection was verified against CMS's primary source**
  before being left in place: the 2026 Medicare Trustees Report states
  $209.50 for 2027.
