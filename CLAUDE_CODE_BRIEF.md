# CLAUDE_CODE_BRIEF — finalization list for lane M1 (+ M1b)

**Repo:** Oak-Main/BenefitClock · **Branch:** `mm/aep-2027-plans`
**Draft PR:** https://github.com/Oak-Main/BenefitClock/pull/27
**Written:** 2026-10-29 · **Updated after the owner's M1 and M1b reviews**
**Status: the lane is closed.** The tool runs on real CMS data, with the
premium a member actually pays. The owner's review of M1 found one blocking
defect (the premium) and five follow-ups; all five are done, and both open
product decisions are made.

**CI status: the local gate is green on `752e52b`; GitHub CI is pending the
org billing unlock** (see Priority 2).

---

## Priority 1 — DECIDED: stand-alone Part D (PDP) stays out for the 2026 AEP season

**Owner decision, 2026-10-29: MA-only for the 2026 AEP season**, as the lane
recommended. The site covers Medicare Advantage plans in the counties you can
pick in the tool, and the approved copy already says exactly that.

**Build nothing now.** The full analysis, the numbers and the proposed scope
rule are in **`docs/PDP-SCOPE-ANALYSIS.md`**, and that scope rule is **queued
as a separate lane to run before the CY2028 files publish**.

The short version, for whoever picks that lane up: the CY2027 file has **476
stand-alone Part D plans**, encoded with `Contract Category Type = "PDP"` and
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

**Why not now:** adding PDPs is a **scope increase, not a bug fix**, and it
changes what the numbers mean (two of the four premium/rating columns are
different for a PDP) plus the "Star rating" label. It belongs before a plan
year, not during one.

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

**The local gate is green on `752e52b`; GitHub CI is pending the org billing
unlock.** Every CI step was run locally against the pushed commit and passed;
GitHub's own gate could not start because of an **org-wide** Actions billing
lock (`utility-engine`'s workflows fail the same way since 22:49 UTC). The
owner is clearing it — **this lane does not re-request runs.**

This lane never merges, never deploys and never creates cloud resources.
Cloudflare Pages deploys from `main` once merged.

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

## Owner decisions — all made

1. **"Not published by CMS in this file" — APPROVED as written** (2026-10-29).
   It is the string the dental / vision / hearing rows show when one year
   published the flag and the other did not. No further review needed.
2. **Stand-alone Part D — MA-only for the 2026 AEP season** (2026-10-29).
   The PDP scope rule is a separate lane before the CY2028 files publish.
3. **CI — an org-wide billing lock, not this branch.** The owner is clearing
   it. **Do not re-request runs.**

---

## Open questions

1. **If PDPs are added in the next lane, what should the "Star rating" row
   say?** For a PDP the rating is the *Part D drug* rating, not an overall
   rating. That is copy, and copy is the owner's.
2. **The partially-real case.** Today the disclosure is one blanket
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
