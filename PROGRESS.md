# PROGRESS — lane M1 (BenefitDial, real CMS 2027 plan data)

**Repo:** Oak-Main/BenefitClock · **Branch:** `mm/aep-2027-plans` (cut from
`origin/main` at `0fe531a`) · **Draft PR:** https://github.com/Oak-Main/BenefitClock/pull/27
**Lane opened:** 2026-10-29

Exit codes below are the real exit codes of the real commands, run in the
branch worktree with Node v24.18.0.

---

## 2026-10-29 — lane opened, sources located

- Located the official CMS **CY2027 Landscape Source File** and the official
  **CY2027 Plan C/D Plan Crosswalk**. Both downloaded; SHA-256 of each archive
  and each extracted file recorded in `docs/CMS-2027-SOURCES.md`.
- Read every file named in the lane's READ FIRST list, plus the whole diff of
  `origin/trueapi/real-2026-landscape` against `origin/main`.

## 2026-10-29 — task 1: normalizer + real CY2026 current-year file

- Brought forward `scripts/normalize-landscape.mjs` from the trueapi branch
  and resolved it by hand against `main`.
- **Resolved by hand:** `main` changed after Sep 11, so every generated
  carrier name must start with "Sample". `main`'s generator was kept as-is
  and the trueapi branch's generator was not taken — the "Sample" naming rule
  is preserved for any part that is still generated.
- **Fixed three data defects the trueapi branch shipped** (all would have
  produced `NaN` in the JSON):
  - 246 CY2026 rows carried the literal `Not Applicable` in `premium`
    (the consolidated Part C+D premium is `Not Applicable` on every plan
    without Part D). Premium now comes from `Part C Premium`, which CMS fills
    in on every row.
  - 18 rows carried `Not Applicable` in `drug_deductible`; 217 rows carried
    `Plan Too New To Be Measured` / `Not Enough Data Available` in `moop`;
    6 rows carried the same strings in `star_rating`. All are now empty
    (unknown), never `NaN` and never `0`.
- Added `network` and `fips` to the normalized shape, and mapped CMS's
  `Contract Category Type` / `Part D Coverage Indicator` onto the site's
  `PDP` / `MAPD` / `MA` vocabulary so a stand-alone drug plan stays
  identifiable and a MAPD stays distinguishable from a plain MA plan.
- Re-normalized CY2026 from the official CMS archive with the final
  normalizer, so both plan years come out of the same code and the same
  schema.
- Added the `.gitignore` lines for the raw national extracts
  (`scripts/CY*_Landscape_*.csv`, `scripts/PlanCrosswalk*.txt`) and exempted
  the per-file provenance sidecars from the generated-JSON ignore rule.
- Exit codes: `build:data=0` `build=0` `test=0` `verify:build=0`

## 2026-10-29 — task 2: the official CY2027 landscape

- Downloaded `cy2027-landscape-202610.zip` from cms.gov.
- `node scripts/normalize-landscape.mjs --year 2027 --src <extracted csv>
  --out landscape-next.csv --zip … --file-name … --release-label … --download-date 2026-10-29`
  → **2,137 plans** across AZ, CA, FL, GA, IL, NC, NY, OH, PA, TX.
- Wrote `docs/CMS-2027-SOURCES.md`: page URL, file name, CMS release label,
  download date, SHA-256 of the ZIP and of the extracted CSV, the full field
  mapping, and the two things the file does not publish.
- Exit codes: `build:data=0` `build=0` `test=0` `verify:build=0`

## 2026-10-29 — task 3: the official CY2027 crosswalk

- Downloaded `plan-crosswalk-2027.zip` and read CMS's own readme PDF for the
  status definitions.
- Wrote `scripts/normalize-crosswalk.mjs` + `scripts/lib/crosswalk-map.mjs`.
  The mapping is in the pure module so it can be unit-tested without a CMS
  file on disk.
- Scoped the national file to the plan identities the site's counties serve:
  9,144 national rows → **1,845 kept** (renewal 938, consolidation 313,
  termination 235, new 201, service-area-reduction 158); 7,299 dropped as out
  of scope; 0 dropped as unmapped.
- Wrote `tests/crosswalk.test.mjs` covering renewal, service-area expansion,
  service-area reduction, consolidation, termination, new plan, initial
  contract, plan-id padding, sentinel handling and the unknown-status case.
- Exit codes: `build:data=0` `build=0` `test=0` `verify:build=0`

## 2026-10-29 — task 4: the manifest now carries real provenance

- `src/data/manifest.json` → `parts.current`, `parts.next`, `parts.crosswalk`
  each carry `sample: false`, the source page URL, the CMS release label, the
  download date, the ZIP SHA-256, the extracted-CSV SHA-256, the normalized
  file's own SHA-256 and the row count.
- Top-level `sample` is `true` if **any** part is sample.
- A data file with no provenance sidecar now **fails the build** rather than
  shipping a number nobody can trace.
- Exit codes: `build:data=0` `build=0` `test=0` `verify:build=0`

## 2026-10-29 — task 5: the sample banner is now an iff

- The decision lives in one place — `isSampleDataset()` in
  `src/assets/js/lib/plandiff-core.js` — and the build, the browser and the
  tests all call it.
- The banner is resolved at **build time** (`{{#sample}}` / `{{#real}}`
  blocks in `scripts/lib/sample-blocks.mjs`), so the shipped HTML is correct
  before any script runs: with real data there is no banner in the page at
  all; with a sample part the banner ships visible and the script can only
  ever hide it.
- `scripts/verify-build-output.mjs` now fails the build if the banner is
  present with an all-real dataset, or absent with a sample part.
- New `tests/plan-sample-disclosure.test.mjs` (7 tests) covers both
  directions, the stale-top-level-flag case and the unresolved-block case.
- Exit codes: `build:data=0` `build=0` `test=0` `verify:build=0`

## 2026-10-29 — task 6: dental / vision / hearing read as "not published"

- Confirmed the CY2027 combined Landscape file has **no** dental, vision or
  hearing columns (and neither does CY2026).
- The build now maps an empty flag cell to `null` (unknown) rather than
  `false`. `fmtBool()` renders `null` as **"Not published by CMS in this
  file"**; a published flag still reads "Included" / "Not included".
- An unpublished flag on one side is never compared against a published one
  — that would have reported "Newly added" for a plan whose next-year row
  simply came from a different file.
- New `tests/plan-benefit-flags.test.mjs` (4 tests).
- Exit codes: `build:data=0` `build=0` `test=0` `verify:build=0`

## 2026-10-29 — task 7: the Part B 2027 audit

- Grepped every page, script and the COLA calculator for Part B dollar
  figures. Full hit list with file:line in `HANDOFF.md` §4.
- Verified the 2027 projection against the primary source
  (https://www.cms.gov/oact/tr/2026): the 2026 Medicare Trustees Report
  projects **$209.50** for 2027, up **$6.60** from $202.90. The site's copy
  matches the primary source exactly.
- Confirmed the calculator's **math** uses only figures the reader types — no
  2027 Part B figure enters any calculation.
- Replaced six hand-typed `$202.90` literals with `{{PART_B_PREMIUM}}`. The
  built output is byte-identical for those strings.
- Did **not** fill the 2027 Part B row in `src/data/medicare-figures.csv`.
- Exit codes: `build:data=0` `build=0` `test=0` `verify:build=0`

## 2026-10-29 — task 8: the stale copy

- Six passages now say the opposite of the truth. Listed with file:line,
  the reason, and a drafted replacement in `content/drafts/aep-2027-copy.md`.
  **The pages were not edited** — every replacement is copy, and copy is the
  owner's call.
- Exit codes: `build:data=0` `build=0` `test=0` `verify:build=0`

## 2026-10-29 — task 9: the gate and the spot check

- Full gate, final run, real exit codes:
  **`build:data=0` `build=0` `test=0` `verify:build=0`**
- Test suite: **112 tests, 112 pass, 0 fail** (was 91 before this lane).
- Spot check: five real CY2027 plans — one each in FL, TX, CA, NY and AZ —
  compared field by field against their rows in the raw CMS archive.
  **5/5 match on plan name, premium, drug deductible, MOOP and star rating.**
  Table in `HANDOFF.md` §5.
- Draft PR opened: https://github.com/Oak-Main/BenefitClock/pull/27

## 2026-10-29 — finalization

- **Fallback path exercised, not just written.** With
  `src/data/landscape-next.csv` moved aside and rebuilt:
  `current=real next=SAMPLE crosswalk=real`, top-level `sample=true`, the
  next-year part generated (472 rows), the banner back in the built page and
  shipping visible, and `verify:build` green. The files were then restored
  and the real dataset rebuilt (`current=real next=real crosswalk=real`,
  `sample=false`, banner absent).
- `HANDOFF.md`, `CLAUDE_CODE_BRIEF.md`, `OWNER_STEPS.md` and this file
  written. Branch pushed. Draft PR refreshed.
- **CI on the draft PR: green** — `build-and-test` pass, `Analyze (actions)`
  pass, `Analyze (javascript-typescript)` pass, `CodeQL` pass, `Cloudflare
  Pages` (PR preview) pass.
- **Not done, by lane design:** merging, deploying, the 2027 Part B row, the
  stale copy edits, the stand-alone PDP question.

---

# M1b — owner review follow-up (2026-10-29)

The owner reviewed M1 and found one blocking defect plus five follow-ups.
All five are done. Exit codes below are real, run in the branch worktree.

## M1b-1 (BLOCKER) — the premium was wrong for every plan with drug coverage

**The defect:** `normalize-landscape.mjs` read `Part C Premium` first. For an
MAPD that is the medical benefit alone, and CMS very often writes `$0.00`
there because the Part C premium is waived — the member pays the drug
premium instead. The fallback to the consolidated column could not fire,
because `money('$0.00')` returns the string `"0"`, and `"0"` is truthy in
JavaScript, so a `||` chain silently preferred a `$0` Part C premium over a
real consolidated one.

**The fix:** `selectPremium()` in the new `scripts/lib/landscape-money.mjs`.
The consolidated column wins whenever it **parses as a number**; `Part C
Premium` is used only where the consolidated column reads `Not Applicable`
(the 209 CY2027 / 237 CY2026 plans with no Part D at all). The check is on
parsability, never truthiness.

**The impact, from the same archives with the same SHA-256:**

| | CY2026 | CY2027 |
|---|---|---|
| rows where the two columns differ | 876 | 501 |
| largest single-row difference | $190.00 | **$212.60** |
| $0 premiums **before** | 2,127 | **1,947** |
| $0 premiums **after** | 1,382 | **1,585** |
| rows where neither column parses | 0 | 0 |

Largest CY2027 difference: `Independent Health's Encompass 65 RED 045 (HMO)`
— $286.00 consolidated against a $73.40 Part C premium. Largest CY2026
difference: `Independent Health's Encompass 65 RED 043 (HMO)`, $190.00
consolidated against a $0.00 Part C premium.

**What was done:** both years re-normalized from the same archives (hashes
unchanged) with the fixed code; the provenance sidecars regenerated; the
field-mapping table and a new "Which premium?" section added to
`docs/CMS-2027-SOURCES.md`; the README's data section rewritten to describe
the normalizer workflow; `tests/landscape-money.test.mjs` added (8 tests)
covering Part C $0 + consolidated $12.40 → 12.4, consolidated `Not
Applicable` + Part C $35 → 35, both $0 → 0, both non-numeric → empty.

**The 5-plan spot check was redone** against the raw archive with BOTH
columns shown — see `HANDOFF.md` §5.

One of my own tests caught a subtlety worth recording: `Number("")` is `0`,
not `NaN`. The empty premium string is exactly why the build's `numOrNull()`
checks for `""` before it coerces.

Exit codes: `build:data=0` `build=0` `test=0` `verify:build=0`

## M1b-2 — the owner-approved copy, typed exactly

Every passage kept its existing wording inside a `{{#sample}}` branch, with
the approved text in a `{{#real}}` branch, so both states stay true:
A `open-enrollment.html:260` · B `how-it-works.html:143-146` ·
C `how-it-works.html:157-160` (existing timeline entry wrapped, no new
words) · D `medicare-plan-changes.html:205-211` · E `medicare-plan-changes.html`
JSON-LD (line 236) · F `medicare-plan-changes.html:40` and `:101` (the
drafted replacements #6 and #7, approved as written).

The resolver works **inside the JSON-LD script tag** — the FAQPage parses as
JSON in both states. New `tests/plan-faq-parity.test.mjs` (4 tests) asserts
the visible FAQ question and answer match the JSON-LD question and answer in
both states, that the JSON-LD answer carries no HTML, and that neither
state's JSON-LD hardcodes a plan year (the sample branch's literal `2027` is
now `{{PLAN_YEAR_NEXT}}`).

`scripts/verify-build-output.mjs` gained a new gate: **every JSON-LD block in
every built page must parse** — 52 blocks across 16 pages. A JSON-LD block
that does not parse is invisible to every other check on the page.

Exit codes: `build:data=0` `build=0` `test=0` `verify:build=0`

## M1b-3 — the benefit rows

A dental / vision / hearing row is now **not rendered when both years are
unpublished**. The rows still carry `fmtBool`'s "Not published by CMS in this
file" for a **one-sided** null, because that row still says something. A
published `false` is still a fact about the plan and still gets a row.

Four new tests in `tests/plan-benefit-flags.test.mjs` (now 8 total).

Exit codes: `build:data=0` `build=0` `test=0` `verify:build=0`

## M1b-4 — the guard, proven in both directions

`scripts/verify-build-output.mjs` now checks three sentences that tell a
reader the tool runs on made-up data — `sample plans`,
`structurally identical sample dataset` and `Why don't I see` — across
**every built page**, not just the tool page.

**Real direction:** with all three parts real, all three phrases are absent
from every built page. Verified.

**Sample direction:** with `src/data/landscape-next.csv` moved aside and
rebuilt, all three phrases are present (in `dist/open-enrollment.html`,
`dist/how-it-works.html` and `dist/medicare-plan-changes.html`), the banner
ships visible, and `verify:build` is green. `npm test` is green in that state
too. The files were then restored and the real dataset rebuilt.

Exit codes (real state): `build:data=0` `build=0` `test=0` `verify:build=0`
Exit codes (sample state): `build:data=0` `build=0` `test=0` `verify:build=0`

## M1b-5 — stand-alone Part D, READ-ONLY

Reported in `docs/PDP-SCOPE-ANALYSIS.md`. **Nothing was built.** The numbers:

- The CY2027 file encodes a PDP with `Contract Category Type = "PDP"`
  (476 rows nationally), `Plan Type = "PDP"`, `Organization Type = "Medicare
  Prescription Drug Plan"`.
- **`County Name` is `All Counties` on all 476 rows** — never a real county.
  Geography comes from `State Territory Abbreviation` (56 states) plus
  `PDP Region Code` / `PDP Region` (39 regions).
- `National PDP` = `Yes` on 414 (every state) and `No` on 62 (regional PDPs).
- A national PDP has **one contract ID and a state-specific plan ID**:
  `Wellcare Classic (PDP)` is `S4802-071` in Alabama and `S4802-083` in
  Florida. All PDP contract IDs start with `S`; MA contracts start with `H`
  or `R`.
- **PDP rows in our 10 states: 96** (FL 11, TX 10, CA 10, NY 9, PA 8, AZ 9,
  OH 9, NC 11, GA 9, IL 10) — 96 distinct `contract|plan`, none offered in
  two of our states.
- **The premium is state-specific for the same brand**: Wellcare Classic is
  $7.30 in AL/AZ/CA, $21.30 in CT, $28.30 in HI; Humana Basic Rx is $6.30 in
  AL/GA but $118.30 in CA and $90.30 in FL.
- **Four columns a PDP row cannot answer**: `Part C Premium`,
  `Monthly Consolidated Premium (Part C + D)`, `In-Network MOOP` and
  `Overall Star Rating` are all `Not Applicable`. The member-facing figures
  are in `Part D Total Premium` and `Part D Summary Star Rating` — the same
  column trap as M1b-1, one column over.
- **Proposed scope rule:** include every PDP row whose state is one of ours,
  fanned out into every county of that state, with `plan_type`/`network` =
  `PDP`, premium from `Part D Total Premium`, star rating from
  `Part D Summary Star Rating`, MOOP empty, and the crosswalk re-scoped to
  match (680 of the 9,144 national crosswalk rows involve an `S` contract
  and are currently dropped). Size: **232 extra rows**, 2,137 → 2,369.
- Two things the owner should weigh: the normalizer's plan-type rule keys on
  `National PDP` today and would mislabel the 62 regional PDPs as `MAPD`; and
  the "Star rating" label would be a Part D rating for a PDP.

Exit codes: `build:data=0` `build=0` `test=0` `verify:build=0`

## M1b — final

- Full gate, final run, real exit codes:
  **`build:data=0` `build=0` `test=0` `verify:build=0`**
- Test suite: **128 tests, 128 pass, 0 fail** (112 after M1, 91 before it).
- Draft PR refreshed: https://github.com/Oak-Main/BenefitClock/pull/27
- **Out of scope, untouched:** the 2027 Part B projection literals (the
  November job), merging, deploying.

