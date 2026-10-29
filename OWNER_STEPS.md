# OWNER STEPS — what only the owner can do

**Lane:** M1 · **Repo:** Oak-Main/BenefitClock · **Branch:** `mm/aep-2027-plans`
**Draft PR:** https://github.com/Oak-Main/BenefitClock/pull/27
**Written:** 2026-10-29

Everything on this list needs a decision, an approval, or an account action
that a construction lane cannot take. Nothing here blocks the build: the lane
built around all of it and the draft PR is green.

---

## 1. APPROVE THE STALE COPY — live pages currently say the opposite of the truth

**This is the most urgent item.** Six passages still tell readers the plan
tool runs on made-up data. It does not. The drafted replacements are in
`content/drafts/aep-2027-copy.md`, each marked `status: needs-human-review`.

| Priority | File:line | What it says today |
|---|---|---|
| **1** | `src/pages/open-enrollment.html:260` | "**Sample data.** The tool runs on clearly-labeled sample plans until CMS publishes the … files." — on the Open Enrollment hub, in front of every visitor |
| **2** | `src/pages/how-it-works.html:144-145` | "Until CMS publishes the official … files … our plan tool runs on a structurally identical sample dataset … We would rather tell you this plainly than pretend the … numbers are already final." |
| **3** | `src/pages/medicare-plan-changes.html:206-208` | FAQ "Why don't I see 2027 numbers yet?" |
| **4** | `src/pages/medicare-plan-changes.html:233` | The same stale answer in the FAQ structured data (JSON-LD) — and it hardcodes "2027" where the visible copy uses `{{PLAN_YEAR_NEXT}}` |
| **5** | `src/pages/how-it-works.html:157-159` | Timeline entry written in the future tense for an event that has happened |
| **6** | `src/pages/medicare-plan-changes.html:40, 101` | The sample banner's wording — not on the page today, but wrong again the moment the data is only partly real |

**What the owner does:** read the drafts, edit as they see fit, and apply.
The build-time switch they need (`{{#sample}}` / `{{#real}}`) already exists
and is documented in `scripts/lib/sample-blocks.mjs`.

**Decision needed:** straight replacement, or a build-time branch per part so
the wording can name *which* part is generated when the data is only partly
real (see draft #6 and #7).

---

## 2. REVIEW ONE NEW USER-FACING STRING

`src/assets/js/lib/plandiff-core.js` → `fmtBool()` now renders:

> Not published by CMS in this file

That is what the dental / vision / hearing rows say, because the combined CMS
Landscape file does not publish those flags at all. The previous behaviour
printed "Not included", which is a claim about the plan that the file does not
support.

The wording and capitalisation are the owner's call. It is flagged
`status: needs-human-review` at the bottom of
`content/drafts/aep-2027-copy.md`.

---

## 3. DECIDE THE STAND-ALONE PART D (PDP) GAP

The CMS Landscape file is county-scoped, and stand-alone Part D plans are
national — `National PDP` reads `Not Applicable` on every scoped row. So
**the tool compares Medicare Advantage plans only**; there are no Part D-only
plans in the county pickers.

This is inherited from the county-scoping approach, not introduced by this
lane, and it was not fixed here because adding national PDP rows means
deciding how a plan with no county should appear in a State → County → Plan
picker.

**What the owner decides:** is MA-only acceptable for the AEP season, or
should national PDP plans be added (which needs a new scope rule and new
copy)?

---

## 4. THE 2027 PART B FIGURES — no action yet, but not this lane's to do

The 2027 Part B premium and deductible are **not published** (the Federal
Register notice lands in ~November 2026). `src/data/medicare-figures.csv`
line 32 keeps those two cells empty on purpose, with
`part_d_oop_cap=2400` and `part_d_deductible=700` filled in from the CMS Part
D parameters that *are* published.

The lane did **not** fill the Part B cells and did **not** touch the COLA
flip machinery.

**What happens in November (not this lane):** fill `part_b_premium` and
`part_b_deductible` on the 2027 row from the Federal Register notice, change
`status` from `announced` to `official`, and replace the hand-typed 2027
projection figures (`~$209.50`, `~+$6.60`) listed in `HANDOFF.md` §4.

---

## 5. MERGE AND DEPLOY — out of this lane's scope

This lane never merges, never deploys, never creates cloud resources. The
draft PR is green and ready for review. Cloudflare Pages deploys from `main`
automatically once the PR is merged.

---

## Appendix — every URL checked to find the CMS files

The lane needed both files and had to look for them. For the next plan year,
these are the places that worked:

**Landscape Source File** (found on the page the lane was pointed at):

- https://www.cms.gov/medicare/coverage/prescription-drug-coverage — the page
  lists "CY2026 Landscape (202609) (ZIP)" and "CY2027 Landscape (202610) (ZIP)"
- https://www.cms.gov/files/zip/cy2027-landscape-202610.zip
- https://www.cms.gov/files/zip/cy2026-landscape-202609.zip
- (also on that page, for older years:
  https://www.cms.gov/files/zip/cy2006-cy2025-landscape-files.zip)

**Plan Crosswalk** (NOT on the prescription-drug-coverage page — that page
never mentions "crosswalk"):

- https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/plan-crosswalks/2027-part-cd-plan-crosswalk
- https://www.cms.gov/files/zip/plan-crosswalk-2027.zip

**URLs that were tried and did not exist** (recorded so nobody repeats them):

- https://www.cms.gov/files/zip/crosswalk-2027.zip — 404
- https://www.cms.gov/files/zip/crosswalk-202610.zip — 404
- https://www.cms.gov/files/zip/cy2027-crosswalk-202610.zip — 404
- https://www.cms.gov/files/zip/crosswalk-files-2027.zip — 404
- https://www.cms.gov/files/zip/cy2027-crosswalk-files.zip — 404
- https://www.cms.gov/files/zip/crosswalk-2026.zip — 404
- https://www.cms.gov/files/zip/cy2026-crosswalk-202609.zip — 404
- https://www.cms.gov/medicare/health-plans/plan-data — 404

**Not checked:** the "2027 Plan Year Crosswalk" page was found via a web
search for the CMS crosswalk page rather than by walking cms.gov's
navigation. There may be a CMS index of crosswalk files that would make next
year's lookup quicker.
