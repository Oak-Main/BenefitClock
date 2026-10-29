# CLAUDE_CODE_BRIEF — finalization list for lane M1 (+ M1b)

**Repo:** Oak-Main/BenefitClock · **Branch:** `mm/aep-2027-plans`
**Draft PR:** https://github.com/Oak-Main/BenefitClock/pull/27 (green)
**Written:** 2026-10-29 · **Updated after the owner's M1 review**

The tool now runs on real CMS data, with the premium a member actually pays.
The owner's review of M1 found one blocking defect (the premium) and five
follow-ups; all five are done. **What is left is below.**

---

## Priority 1 — decide the stand-alone Part D (PDP) question

**M1b-5 reported it; the owner decides.** Full analysis, numbers and the
proposed scope rule: **`docs/PDP-SCOPE-ANALYSIS.md`**.

The short version: the CY2027 file has **476 stand-alone Part D plans**,
encoded with `Contract Category Type = "PDP"` and
`County Name = "All Counties"` — geography comes from the state column plus
`PDP Region`, never a county. **96 of them fall in our 10 states**
(FL 11, TX 10, CA 10, NY 9, PA 8, AZ 9, OH 9, NC 11, GA 9, IL 10).

The proposed rule: include every PDP row whose state is one of ours, fanned
out into every county of that state. Cost: **232 extra rows** (2,137 →
2,369), a normalizer change (the premium comes from `Part D Total Premium`
and the rating from `Part D Summary Star Rating`, because the consolidated
premium and the overall star rating are both `Not Applicable` for a PDP), a
plan-type rule that has to key on `Contract Category Type` rather than
`National PDP`, and a crosswalk re-scope (**680** of the 9,144 national
crosswalk rows involve a PDP contract and are currently dropped).

**The lane's recommendation:** the current MA-only scope is defensible and
honest for this AEP season — the site already says "It covers Medicare
Advantage plans in the counties you can pick in the tool". Adding PDPs is a
**scope increase, not a bug fix**, and it is worth doing before the next plan
year rather than during this one.

---

## Priority 2 — the November 2027 Part B job (not this lane)

1. Fill `part_b_premium` and `part_b_deductible` on the 2027 row of
   `src/data/medicare-figures.csv` from the Federal Register notice, and
   change `status` from `announced` to `official`.
2. Replace the hand-typed 2027 projection figures (`~$209.50`, `~+$6.60`) —
   full hit list in `HANDOFF.md` §4. They are correct today (verified against
   https://www.cms.gov/oact/tr/2026) and must not survive the official
   number.

---

## Priority 3 — merge and deploy

The draft PR is green. This lane never merges, never deploys and never
creates cloud resources. Cloudflare Pages deploys from `main` once merged.

---

## Closed in M1b

- **M1b-1 (BLOCKER) — the premium.** Fixed and re-verified: the consolidated
  Part C+D premium now wins whenever it parses as a number. 1,947 of 2,137
  CY2027 rows showed $0 before, 1,585 after. Largest single-row difference
  $212.60.
- **M1b-2 — the owner-approved copy**, typed exactly in `{{#sample}}` /
  `{{#real}}` branches.
- **M1b-3 — the benefit rows**: dropped when both years are unpublished.
- **M1b-4 — the guard**, proven in both directions.
- **M1b-5 — the PDP analysis**, read-only.

---

## Open questions

1. **Should stand-alone Part D plans be shown in the picker?** See Priority
   1. The lane has the numbers; the decision is the owner's.
2. **If PDPs are added, what should the "Star rating" row say?** For a PDP
   the rating is the *Part D drug* rating, not an overall rating. That is
   copy, and copy is the owner's.
3. **The partially-real case.** Today the disclosure is one blanket
   "sample" state. If a single file ever goes missing, the honest wording
   has to name which part — the manifest already knows. The `{{#sample}}` /
   `{{#real}}` machinery is in place; per-part branches would need new
   sentences.

## Things worth knowing

- **The premium bug is a class of bug worth remembering.** `money()` returns
  the string `"0"` for a `$0.00` cell, and `"0"` is truthy in JavaScript, so
  a `||` chain over money strings silently prefers a `$0` over a real
  number. `selectPremium()` checks **parsability**, never truthiness. The
  same trap exists in the PDP columns, one column over.
- **The three CMS files are hashed.** `docs/CMS-2027-SOURCES.md` has the page
  URL, release label, download date, and SHA-256 for both the archive and the
  extracted CSV of each. `src/data/manifest.json` quotes all of it. A data
  file without a provenance sidecar now **fails the build** — a number nobody
  can trace does not ship.
- **The banner is decided at build time**, so the shipped HTML is correct
  before any script runs. `verify:build` fails if the banner is present with
  real data, if it is missing with sample data, or if any of the three
  "this is sample data" sentences appears in a real build.
- **Every JSON-LD block in every built page must parse** — a new gate, added
  because the `{{#sample}}` / `{{#real}}` resolver now runs inside a
  JSON-LD script tag, where a malformed result would be invisible to every
  other check.
- **The 2027 Part B projection was verified against CMS's primary source**
  before being left in place: the 2026 Medicare Trustees Report states
  $209.50 for 2027.
