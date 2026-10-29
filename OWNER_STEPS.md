# OWNER STEPS — what only the owner can do

**Lane:** M1 (+ M1b) · **Repo:** Oak-Main/BenefitClock · **Branch:** `mm/aep-2027-plans`
**Draft PR:** https://github.com/Oak-Main/BenefitClock/pull/27
**Written:** 2026-10-29 · **Updated after the owner's M1 review**

Everything on this list needs a decision, an approval, or an account action
that a construction lane cannot take. Nothing here blocks the build: the lane
built around all of it and the draft PR is green.

---

## 1. DECIDE THE STAND-ALONE PART D (PDP) QUESTION — the only open item

**M1b-5 reported it. Nothing was built.** The analysis, the numbers and the
proposed scope rule are in **`docs/PDP-SCOPE-ANALYSIS.md`**.

The numbers that matter:

- The CY2027 file holds **476 stand-alone Part D plans**. Their geography is
  the **state** plus a **PDP Region** — `County Name` is `All Counties` on
  every one of them.
- **96 fall in our 10 states**: FL 11, TX 10, CA 10, NY 9, PA 8, AZ 9, OH 9,
  NC 11, GA 9, IL 10.
- A national PDP has **one contract ID and a state-specific plan ID**, and
  its **premium is state-specific for the same brand** (Humana Basic Rx is
  $6.30 in Alabama and Georgia, $118.30 in California, $90.30 in Florida).
- The proposed rule would add **232 rows** (2,137 → 2,369) and re-scope the
  crosswalk to pick up **680** currently-dropped PDP rows.
- Two traps the implementer must know: a PDP's premium is in
  `Part D Total Premium` (the consolidated column is `Not Applicable`), and
  the plan-type rule has to key on `Contract Category Type` rather than
  `National PDP` or the 62 regional PDPs become `MAPD`.

**The lane's recommendation:** the MA-only scope is defensible and honest for
this AEP season — the site already says "It covers Medicare Advantage plans
in the counties you can pick in the tool". PDPs are a scope increase, better
made before the next plan year.

**Owner decides.** If yes, the implementation is a normalizer change, a
crosswalk re-scope, and one label question ("Star rating" would be a Part D
rating for a PDP).

---

## 2. APPROVE ONE NEW USER-FACING STRING

`src/assets/js/lib/plandiff-core.js` → `fmtBool()` renders:

> Not published by CMS in this file

That is what the dental / vision / hearing rows say when **one** year
published the flag and the other did not. (When **both** years are
unpublished, the row is no longer rendered at all — M1b-3.)

The wording and capitalisation are the owner's call. It is flagged
`status: needs-human-review` at the bottom of
`content/drafts/aep-2027-copy.md`.

---

## 3. THE 2027 PART B FIGURES — no action yet, but not this lane's to do

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

## 4. MERGE AND DEPLOY — out of this lane's scope

This lane never merges, never deploys, never creates cloud resources. The
draft PR is green and ready for review. Cloudflare Pages deploys from `main`
automatically once the PR is merged.

---

## Closed since the last review

- ~~Approve the stale copy~~ — **approved by the owner on 2026-10-29 and
  applied** in M1b-2, in `{{#sample}}` / `{{#real}}` branches so both states
  stay true.
- ~~The blocking premium defect~~ — **fixed in M1b-1** and re-verified: the
  consolidated Part C+D premium now wins whenever it parses as a number.

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
