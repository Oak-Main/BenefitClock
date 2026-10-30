# OWNER STEPS — what only the owner can do

**Lane:** M1 (+ M1b) · **Repo:** Oak-Main/BenefitClock · **Branch:** `mm/aep-2027-plans`
**Draft PR:** https://github.com/Oak-Main/BenefitClock/pull/27
**Written:** 2026-10-29 · **Updated after the owner's M1 and M1b reviews**
**Status: the lane is closed.** Both open product decisions are made; only the
org-wide CI billing unlock remains, and that is the owner's.

Everything on this list needs a decision, an approval, or an account action
that a construction lane cannot take. Nothing here blocks the build: the lane
built around all of it, and **the local gate is green on `752e52b`; GitHub CI
is pending the org billing unlock**.

---

## 0. UNBLOCK CI — GitHub Actions is locked on a billing issue (ORG-WIDE)

**The draft PR cannot go green until this is resolved, and only the owner can
resolve it.** The M1b commits are not the cause.

At 22:02 UTC on 2026-10-29, every GitHub-hosted job on PR #27 failed
**without executing a single step**:

> `The job was not started because your account is locked due to a billing issue.`

- `build-and-test` ×2, `Analyze (actions)`, `Analyze (javascript-typescript)`
  — all failed in 2–3 seconds with zero steps run.
- A **re-run** of the failed job (`attempt 2`) failed identically.
- **The `Cloudflare Pages` check PASSED** on the same commit — it runs on
  Cloudflare's infrastructure, not a GitHub runner, so it is not affected. A
  real build of the M1b commit succeeded on real infrastructure.
- Every run on this branch **before 22:02 was green**, including the run on
  the last M1 commit (`89d34c6`).
- **Owner, 2026-10-29 18:46 PT:** this is an **account billing lock across the
  whole Oak-Main org** — `utility-engine`'s workflows fail the same way since
  22:49 UTC — not this branch and not this code. **The owner is clearing it.
  Do not re-request runs.**

**What the owner does:** clear the GitHub Actions billing hold on the account
(update the payment method, or raise the Actions spending limit / convert to
a plan that includes the minutes). Once it is cleared the runs will report
themselves; **this lane does not re-request them.**

**Evidence that the code itself is sound** — every CI step was run locally
against the M1b commit and passed, and the owner independently re-ran the gate
on `752e52b` with the same result:

| CI step | Local result |
|---|---|
| `node --test` | exit 0 — 128 tests, 128 pass |
| `node scripts/dry-run-flip.mjs` | exit 0 |
| `npm run build` | exit 0 — 16 pages |
| Sanity-check the build output | exit 0 — 16 pages, no unresolved `{{` tokens |
| `node scripts/verify-build-output.mjs` | exit 0 |
| Check every internal link and asset resolves | exit 0 — all targets resolve across 16 pages |

---

## 1. STAND-ALONE PART D (PDP) — DECIDED: MA-only for the 2026 AEP season

**Owner decision, 2026-10-29: MA-only for the 2026 AEP season**, as the lane
recommended. The site covers Medicare Advantage plans in the counties you can
pick in the tool, and the approved copy already says exactly that.

**Nothing is built for PDPs.** The scope rule in
**`docs/PDP-SCOPE-ANALYSIS.md`** — the encoding, the 96 plans in our 10
states, the proposed scope rule, the cost (232 rows, 2,137 → 2,369), the
crosswalk re-scope (680 rows), and the two traps the implementer must know —
is **queued as a separate lane to run before the CY2028 files publish**.

The numbers behind the decision, for whoever picks that lane up:

- The CY2027 file holds **476 stand-alone Part D plans**. Their geography is
  the **state** plus a **PDP Region** — `County Name` is `All Counties` on
  every one of them.
- **96 fall in our 10 states**: FL 11, TX 10, CA 10, NY 9, PA 8, AZ 9, OH 9,
  NC 11, GA 9, IL 10.
- A national PDP has **one contract ID and a state-specific plan ID**, and
  its **premium is state-specific for the same brand** (Humana Basic Rx is
  $6.30 in Alabama and Georgia, $118.30 in California, $90.30 in Florida).
- Two traps the implementer must know: a PDP's premium is in
  `Part D Total Premium` (the consolidated column is `Not Applicable`), and
  the plan-type rule has to key on `Contract Category Type` rather than
  `National PDP` or the 62 regional PDPs become `MAPD`.

---

## 2. THE NEW USER-FACING STRING — APPROVED as written

`src/assets/js/lib/plandiff-core.js` → `fmtBool()` renders:

> Not published by CMS in this file

**Owner decision, 2026-10-29: approved as written.** That is what the dental
/ vision / hearing rows say when **one** year published the flag and the
other did not. (When **both** years are unpublished, the row is no longer
rendered at all — M1b-3.) The wording and capitalisation are now settled and
need no further review.

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
**local gate is green on `752e52b`; GitHub CI is pending the org billing
unlock** (§0). Cloudflare Pages deploys from `main` automatically once the PR
is merged.

---

## Closed since the last review

- ~~Approve the stale copy~~ — **approved by the owner on 2026-10-29 and
  applied** in M1b-2, in `{{#sample}}` / `{{#real}}` branches so both states
  stay true.
- ~~The blocking premium defect~~ — **fixed in M1b-1** and re-verified: the
  consolidated Part C+D premium now wins whenever it parses as a number.
- ~~Approve "Not published by CMS in this file"~~ — **approved as written**,
  2026-10-29. See §2.
- ~~Decide the stand-alone Part D question~~ — **decided: MA-only for the
  2026 AEP season**, 2026-10-29. See §1. The PDP scope rule is queued as a
  separate lane before the CY2028 files publish; **build nothing now**.

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
