# HANDOFF — lane M1: real CMS 2027 plan data for AEP

**Repo:** Oak-Main/BenefitClock (site: benefitdial.com)
**Branch:** `mm/aep-2027-plans` · **Draft PR:** https://github.com/Oak-Main/BenefitClock/pull/27
**Base:** `origin/main` @ `0fe531a` · **Written:** 2026-10-29
**Never merged, never deployed, no cloud resources created.**
**Lane status: CLOSED** — M1 and M1b accepted by the owner on 2026-10-29, both
open product decisions made. **Local gate green on `752e52b`; GitHub CI
pending the org billing unlock** (§7).

---

## 1. What this lane did

The `/medicare-plan-changes/` "What Changed" tool was running on a generated
SAMPLE dataset. It now runs on the official CMS files.

| Part | Before | After | Rows |
|---|---|---|---|
| Current plan year (2026) | generated sample | **official CMS CY2026 Landscape Source File** | 2,288 |
| Next plan year (2027) | generated sample | **official CMS CY2027 Landscape Source File** | 2,137 |
| Crosswalk (2026 → 2027) | generated sample | **official CMS CY2027 Part C/D Plan Crosswalk** | 1,845 |

`src/data/manifest.json` → `parts` carries each part's source page URL, CMS
release label, download date, ZIP SHA-256, extracted-CSV SHA-256, normalized
file SHA-256 and row count. Top-level `sample` is `false`; the top-level flag
is `true` if **any** part is sample.

Full source records: `docs/CMS-2027-SOURCES.md`.

## 2. How to run it

```
git clone https://github.com/Oak-Main/BenefitClock.git
cd BenefitClock
git checkout mm/aep-2027-plans
npm run build:data     # regenerates src/data/*.json from the committed CSVs
npm run build          # 16 pages into dist/
npm test               # 128 tests
npm run verify:build   # content-level gate against the built output
node scripts/serve.mjs # local preview
```

There are zero runtime dependencies. Nothing to install.

**To re-normalize from CMS** (the raw archives are not committed; `raw-cms/`
and `*.zip` are gitignored):

```
curl -L -o cy2027-landscape-202610.zip \
  https://www.cms.gov/files/zip/cy2027-landscape-202610.zip
curl -L -o plan-crosswalk-2027.zip \
  https://www.cms.gov/files/zip/plan-crosswalk-2027.zip
unzip cy2027-landscape-202610.zip && unzip plan-crosswalk-2027.zip

node scripts/normalize-landscape.mjs --year 2027 \
  --src raw-cms/CY2027_Landscape_202610/CY2027_Landscape_202610.csv \
  --out landscape-next.csv --zip raw-cms/cy2027-landscape-202610.zip \
  --file-name cy2027-landscape-202610.zip \
  --release-label "CY2027 Landscape (202610) (ZIP)" --download-date 2026-10-29

node scripts/normalize-crosswalk.mjs --year 2027 \
  --src raw-cms/PlanCrosswalk2027_10012026.txt \
  --out crosswalk.csv --zip raw-cms/plan-crosswalk-2027.zip \
  --file-name plan-crosswalk-2027.zip \
  --release-label "Contract Year (CY) 2027 Plan Crosswalk: Read Me, October 1, 2026" \
  --download-date 2026-10-29
```

Both normalizers write a `<name>.provenance.json` sidecar next to their CSV.
`scripts/build-plan-data.mjs` refuses to build if a data file exists without
one.

## 3. DONE

- [x] **Task 1** — `scripts/normalize-landscape.mjs` brought forward from
      `origin/trueapi/real-2026-landscape` and resolved by hand against
      `main`; the "Sample" carrier-naming rule kept for any generated part;
      `src/data/landscape-current.csv` regenerated from the official CY2026
      archive with the final normalizer; `.gitignore` lines added; per-part
      provenance logic in `scripts/build-plan-data.mjs`.
- [x] **Task 2** — official CMS CY2027 Landscape located, downloaded, hashed,
      documented in `docs/CMS-2027-SOURCES.md` and normalized into
      `src/data/landscape-next.csv`.
- [x] **Task 3** — official CMS CY2027 crosswalk located, downloaded, hashed
      and documented; `scripts/normalize-crosswalk.mjs` +
      `scripts/lib/crosswalk-map.mjs` written; `tests/crosswalk.test.mjs`
      covers renewal, service-area expansion, service-area reduction,
      consolidation, termination, new plan and initial contract.
- [x] **Task 4** — data rebuilt; `manifest.json` shows real provenance for all
      three parts and `sample: false`.
- [x] **Task 5** — the banner renders **if and only if** a part is sample,
      decided at build time by one shared function
      (`isSampleDataset()` in `src/assets/js/lib/plandiff-core.js`). Tested in
      both directions in `tests/plan-sample-disclosure.test.mjs`, and gated in
      `scripts/verify-build-output.mjs`.
- [x] **Task 6** — dental / vision / hearing are `null` and render as
      **"Not published by CMS in this file"**, never "No". Tested in
      `tests/plan-benefit-flags.test.mjs`.
- [x] **Task 7** — Part B audit run; token-only fixes applied; every hit
      listed in §4 below.
- [x] **Task 8** — stale copy listed with file:line and reasons in
      `content/drafts/aep-2027-copy.md`. Pages not edited.
- [x] **Task 9** — the full gate run after every task with real exit codes in
      `PROGRESS.md`; the five-plan spot check in §5 below.
- [x] Draft PR opened; **local gate green on `752e52b`; GitHub CI pending the
      org billing unlock**.

**M1b (owner review follow-up, 2026-10-29)**
- [x] **M1b-1 (BLOCKER) — the premium fix.** The consolidated Part C+D
      premium now wins whenever it parses as a number; `Part C Premium` is
      used only where the consolidated cell is `Not Applicable`. **1,947 of
      2,137 CY2027 rows showed $0 before and 1,585 after**; 501 CY2027 rows
      and 876 CY2026 rows had different values in the two columns, the
      largest difference being $212.60. Both years re-normalized from the
      same archives with the same SHA-256; sidecars and the mapping table
      updated; 8 unit tests added.
- [x] **M1b-2 — the owner-approved copy**, typed exactly, in `{{#sample}}` /
      `{{#real}}` branches so both states stay true. Visible FAQ and JSON-LD
      FAQ now provably match in both states.
- [x] **M1b-3 — the benefit rows**: not rendered when both years are
      unpublished; "Not published by CMS in this file" kept for a one-sided
      null.
- [x] **M1b-4 — the guard**: the three "this is sample data" sentences must
      be present in every sample build and absent from every real one, and
      every JSON-LD block in every built page must parse. **Both directions
      proven.**
- [x] **M1b-5 — the PDP analysis**, read-only, in
      `docs/PDP-SCOPE-ANALYSIS.md`. Nothing built.

**Owner decisions, 2026-10-29 — the lane is closed**

1. **"Not published by CMS in this file" — APPROVED as written.** It is the
   string the dental / vision / hearing rows show when one year published the
   flag and the other did not.
2. **Stand-alone Part D — MA-only for the 2026 AEP season.** The PDP scope
   rule is a separate lane before the CY2028 files publish.
3. **CI — an org-wide billing lock, not this branch.** The owner is clearing
   it. **Do not re-request runs.**

## 4. NOT DONE — with reasons

The owner reviewed M1 on 2026-10-29 and approved the copy. Items 1, 5 and 6
below are the M1b follow-ups; item 3 is the only remaining open item.

| # | Not done | Why |
|---|---|---|
| 1 | ~~**The stale copy is not fixed.**~~ **FIXED in M1b-2.** | The owner approved the wording on 2026-10-29. Every passage is now in a `{{#sample}}` branch with the approved text in a `{{#real}}` branch, so both states stay true. Applied: `open-enrollment.html:260`, `how-it-works.html:143-146`, `how-it-works.html:157-160`, `medicare-plan-changes.html:205-211`, the JSON-LD FAQ, and the two sample-banner sentences. |
| 2 | **The 2027 Part B row is not filled.** `src/data/medicare-figures.csv` line 32 keeps `part_b_premium` and `part_b_deductible` empty. | Out of scope for this lane: that row is filled from the Federal Register notice on the day it publishes (~November 2026). The Part D cells on that row (`2400`, `700`) are filled because CMS published those. |
| 3 | **The hand-typed 2027 Part B projection (`~$209.50`, `~+$6.60`) is still in the copy** on `src/pages/guide-premiums.html` and `src/pages/guides.html`. | **Still open — the November job, explicitly out of scope for M1b.** There is no token for it and the 2027 Part B row must stay empty, so it cannot be driven from the data layer. The figure is correct today — it matches the 2026 Medicare Trustees Report exactly (https://www.cms.gov/oact/tr/2026) — and must be replaced when the official number lands. Every hit is listed below. |
| 4 | **`src/assets/js/lib/cola-core.js:192` and `:314` still contain the literal `202.90`.** | It is a money-format example in a parse-error message, not a 2027 figure, and a pure browser module has no build-token path into it. The HTML layer around it is tokenised. |
| 5 | **Stand-alone Part D (PDP) plans are still not in the tool.** | **DECIDED (owner, 2026-10-29): MA-only for the 2026 AEP season**, as the lane recommended. The county-scoped Landscape file carries no PDP rows (`County Name` is `All Counties` on all 476 of them), and the site says so in the approved copy. The full analysis, the numbers and the proposed scope rule are in `docs/PDP-SCOPE-ANALYSIS.md`; that scope rule is **queued as a separate lane before the CY2028 files publish. Nothing was built now.** 96 PDP plans fall in our 10 states; including them would be a scope increase of 232 rows (2,137 → 2,369) plus a crosswalk re-scope of 680 rows. |
| 6 | ~~**`medicare-plan-changes.html:233` hardcodes "2027".**~~ **FIXED in M1b-2.** | The JSON-LD FAQ now has matching `{{#sample}}` and `{{#real}}` branches, and a test asserts that neither state's JSON-LD hardcodes a plan year. |
| 7 | **No merge, no deploy, no cloud resources, no registrations.** | Out of scope for this lane. |
| 8 | **No page copy was written, rewritten or polished.** | The only prose applied is the wording the owner approved verbatim in M1b-2. |

### The Part B hit list (task 7)

Every Part B dollar figure found in a live page, script or the calculator.

**2027 figures (the Trustees Report projection — correct today, no token
available, must be replaced when the official number lands):**

| File:line | Figure | Note |
|---|---|---|
| `src/pages/guide-premiums.html:3` | `$209.50` | front-matter description |
| `src/pages/guide-premiums.html:18` | `$209.50` | the hero badge |
| `src/pages/guide-premiums.html:30` | `$209.50`, `$6.60`, `3.3%` | the projection bullet |
| `src/pages/guide-premiums.html:44` | `~$209.50`, `~+$6.60` | the table row |
| `src/pages/guide-premiums.html:50` | `~$6.60` | used in the net-raise sentence |
| `src/pages/guide-premiums.html:63` | `~$209.50` | the "don't budget the projection" bullet |
| `src/pages/guide-premiums.html:77` | `$209.50` | the visible FAQ answer |
| `src/pages/guide-premiums.html:118` | `$209.50` | the JSON-LD description |
| `src/pages/guide-premiums.html:138` | `$209.50` | the JSON-LD FAQ answer |
| `src/pages/guides.html:55` | `$209.50` | the guides-hub teaser |

Verified against the primary source on 2026-10-29: the 2026 Medicare Trustees
Report states *"The estimated monthly premium for 2027 is $209.50"*, up from
$202.90 — https://www.cms.gov/oact/tr/2026. The site's copy is accurate.

**2026 figures that were hand-typed where a token existed — FIXED:**

| File:line | Before | After |
|---|---|---|
| `src/pages/guide-premiums.html:3` | `$202.90` | `{{PART_B_PREMIUM}}` |
| `src/pages/guide-premiums.html:18` | `$202.90` | `{{PART_B_PREMIUM}}` |
| `src/pages/guide-premiums.html:77` | `$202.90` | `{{PART_B_PREMIUM}}` |
| `src/pages/guide-premiums.html:118` | `$202.90` | `{{PART_B_PREMIUM}}` |
| `src/pages/guide-premiums.html:138` | `$202.90` | `{{PART_B_PREMIUM}}` |
| `src/pages/guides.html:55` | `$202.90` | `{{PART_B_PREMIUM}}` |
| `src/pages/cola-calculator.html:82` | `like 202.90` | `like {{PART_B_PREMIUM}}` |

The built output is byte-identical for every one of these strings.

**2026 figures left as literals on purpose:**

| File:line | Figure | Why |
|---|---|---|
| `src/pages/guide-premiums.html:40-44` | `$164.90`, `$174.70`, `$185.00`, `+$17.90` | official historical years; no token exists for them, and the 2026 row's own `+$17.90` delta is derived from the token row next to it |
| `src/assets/js/lib/cola-core.js:192, 314` | `202.90` | a money-format example in a pure browser module; no build-token path |
| `src/data/benefit-examples.csv:20-21` | `202.90` | the data layer itself, sourced from the SSA 2026 COLA fact sheet |

**The calculator's math was audited and is clean.** `src/assets/js/lib/cola-core.js`
reads the premium the reader typed; `newPartB` defaults to the prior premium
when the "next year" field is blank (`src/assets/js/cola-core.js:105-107`).
No 2027 Part B figure enters any calculation.

## 5. The five-plan spot check (task 9, redone after M1b-1)

Five real CY2027 plans — one each in FL, TX, CA, NY and AZ — taken from
`src/data/landscape-next.csv` and compared field by field against their rows
in the **raw CMS archive**
(`raw-cms/landscape-2027/CY2027_Landscape_202610/CY2027_Landscape_202610.csv`),
using the documented field mapping. Both premium columns are shown, because
the M1b-1 defect was in exactly that choice.

| State | Contract / Plan | Plan name (CMS) | Consolidated premium | Part C premium | **Shipped premium** | Drug deductible | MOOP | Stars | Matches CMS |
|---|---|---|---|---|---|---|---|---|---|
| FL | H5434-002 | BlueMedicare Select (PPO) | $173.00 | $18.60 | **$173.00** | $700 | $7,500 | 3.0 | **yes** |
| TX | H0028-059 | Humana Gold Plus H0028-059 (HMO) | $30.00 | $30.00 | **$30.00** | $700 | $3,700 | 4.5 | **yes** |
| CA | H0543-013 | AARP Medicare Advantage from UHC CA-0001 (HMO-POS) | $29.00 | $29.00 | **$29.00** | $355 | $5,300 | 3.0 | **yes** |
| NY | H3305-015 | MVP Medicare Preferred Gold with Part D (HMO-POS) | $157.90 | $157.90 | **$157.90** | $400 | $6,800 | 3.5 | **yes** |
| AZ | H0302-001 | Blue Best Life Plus (HMO) | $49.00 | $20.00 | **$49.00** | $500 | $3,000 | 3.5 | **yes** |

**5/5 match on all five fields**, and every MAPD row's shipped premium
equals the **consolidated** column, which is the M1b-1 rule.

The FL row is the one that proves the fix: `BlueMedicare Select (PPO)` has a
**$18.60** Part C premium and a **$173.00** consolidated premium. Before
M1b-1 the site showed **$18.60** for that plan — the medical benefit alone,
without the drug benefit the member actually pays for.

Source columns compared: `Plan Name`;
`Monthly Consolidated Premium (Part C + D)` (falling back to `Part C Premium`
only where the consolidated cell is `Not Applicable`);
`Annual Part D Deductible Amount`;
`In-Network Maximum Out-of-Pocket (MOOP) Amount`; `Overall Star Rating`
(falling back to `Part C Summary Star Rating`).

One plan per state was chosen deterministically: the lowest contract id, then
the lowest plan id, among the plans in that state with a non-zero premium and
a published star rating.

## 6. What changed, file by file

**New**
- `scripts/normalize-landscape.mjs` — CMS Landscape → `landscape-*.csv`
- `scripts/normalize-crosswalk.mjs` — CMS Plan Crosswalk → `crosswalk.csv`
- `scripts/lib/crosswalk-map.mjs` — the pure status mapping (unit-testable)
- `scripts/lib/landscape-money.mjs` — the pure money parsing + the premium
  selection rule (unit-testable) — **added by M1b-1**
- `scripts/lib/provenance.mjs` — the sidecar writer
- `scripts/lib/sample-blocks.mjs` — the `{{#sample}}` / `{{#real}}` resolver
- `src/data/landscape-current.csv`, `landscape-next.csv`, `crosswalk.csv` and
  their three `.provenance.json` sidecars
- `tests/crosswalk.test.mjs`, `tests/plan-sample-disclosure.test.mjs`,
  `tests/plan-benefit-flags.test.mjs`, `tests/landscape-money.test.mjs`,
  `tests/plan-faq-parity.test.mjs`
- `docs/CMS-2027-SOURCES.md`, `docs/PDP-SCOPE-ANALYSIS.md`,
  `content/drafts/aep-2027-copy.md`, `PROGRESS.md`, `HANDOFF.md`,
  `CLAUDE_CODE_BRIEF.md`, `OWNER_STEPS.md`

**Changed**
- `scripts/build-plan-data.mjs` — per-part provenance, `numOrNull()` /
  `flagOrNull()`, per-part sample flags in the manifest
- `scripts/build.mjs` — resolves the sample blocks; fails on an unresolved
  conditional block
- `scripts/verify-build-output.mjs` — the banner must be **absent** with
  real data and **present** with sample data; the three "this is sample
  data" sentences must be present in every sample build and absent from
  every real one; **every JSON-LD block in every built page must parse**
- `src/assets/js/lib/plandiff-core.js` — `isSampleDataset()`, `fmtBool()` for
  unpublished flags, unpublished flags are never compared, and a benefit row
  unpublished on **both** sides is not rendered at all
- `src/assets/js/plan-diff.js` — uses `isSampleDataset()`
- `src/pages/medicare-plan-changes.html` — the disclosure is build-time
  conditional; the owner-approved copy is in the `{{#real}}` branches
- `src/pages/how-it-works.html`, `src/pages/open-enrollment.html` — the
  owner-approved copy in the `{{#real}}` branches
- `src/pages/guide-premiums.html`, `src/pages/guides.html`,
  `src/pages/cola-calculator.html` — the Part B token swaps
- `.gitignore` — raw CMS extracts ignored; provenance sidecars committed
- `README.md` — the data section now describes the normalizer workflow

**Not committed, by design:** `raw-cms/`, `*.zip`, the raw national CSVs.

## 7. Verification actually run

| Check | Result |
|---|---|
| `npm run build:data` | exit 0 — `current=real next=real crosswalk=real · REAL CMS dataset` |
| `npm run build` | exit 0 — 16 pages |
| `npm test` | exit 0 — 128 tests, 128 pass, 0 fail |
| `npm run verify:build` | exit 0 — including "#pd-sample-banner is absent from the built page (real CMS data)", the three "sample data" sentences absent from every built page, and "52 JSON-LD block(s) across 16 pages parse" |
| Sample-state gate (next-year file moved aside) | exit 0 on all four — the banner returned, all three sentences returned, `verify:build` green, `npm test` green |
| `node scripts/dry-run-flip.mjs` | exit 0 — run by CI (the COLA flip rehearsal) |
| CI's sanity check (5 required files, ≥13 pages, no `{{` in the output) | exit 0 — 16 pages, no unresolved tokens |
| CI's internal link/asset check | exit 0 — all targets resolve across 16 pages |
| CI on the draft PR | **BLOCKED — org-wide billing lock, not this branch.** All four GitHub-hosted jobs failed at 22:02 UTC with *"The job was not started because your account is locked due to a billing issue"*, zero steps executed, and a re-run failed identically. The `Cloudflare Pages` check **passed** on the same commit (it does not run on a GitHub runner). Every run on this branch before 22:02 was green. **Owner, 2026-10-29: this is an account billing lock across the whole Oak-Main org — `utility-engine`'s workflows fail the same way since 22:49 UTC — and the owner is clearing it. Do not re-request runs.** See `OWNER_STEPS.md` §0. |

**CI status, stated plainly:** the M1b commits have **not** passed CI. They
could not run. Every CI step was executed locally against the pushed commit
and every one passed — the table above is the proof, and the owner
independently re-ran the gate on `752e52b` with the same result — but the
authoritative gate is GitHub's, and it is blocked on an org-wide billing hold
that only the owner can clear. **The local gate is green on `752e52b`; GitHub
CI is pending the org billing unlock.** Do not read this branch as green until
CI says so.

The exit codes above are the real ones, recorded after every task in
`PROGRESS.md`.

**What was NOT independently verified:** the spot check compared the shipped
CSV against the raw CMS archive, which proves the pipeline is faithful — it
does not re-verify CMS's own figures against the CMS web pages. The file
hashes in `docs/CMS-2027-SOURCES.md` let anyone do that.
