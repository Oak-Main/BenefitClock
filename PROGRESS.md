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

- `HANDOFF.md`, `CLAUDE_CODE_BRIEF.md`, `OWNER_STEPS.md` and this file
  written. Branch pushed. Draft PR refreshed.
- **Not done, by lane design:** merging, deploying, the 2027 Part B row, the
  stale copy edits, the stand-alone PDP question.
