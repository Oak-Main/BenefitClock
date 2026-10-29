# CMS CY2027 source files — what the "What Changed" tool is built from

Every number the plan-comparison tool shows comes from one of two public CMS
files. This page records exactly which files, from which page, on which date,
with which SHA-256 — so any figure on the site can be traced back to the row
it came from, and so the next person knows what to re-download when CMS
publishes the next plan year.

Both files are public domain (US Government works). Neither is committed to
this repository: the archives are large and the national files are not what
the site ships. What IS committed is the county-scoped, normalized output
plus a provenance sidecar per file:

| Shipped file | Provenance sidecar | Rows |
|---|---|---|
| `src/data/landscape-current.csv` (CY2026) | `src/data/landscape-current.provenance.json` | 2,288 |
| `src/data/landscape-next.csv` (CY2027) | `src/data/landscape-next.provenance.json` | 2,137 |
| `src/data/crosswalk.csv` (CY2026 → CY2027) | `src/data/crosswalk.provenance.json` | 1,845 |

`src/data/manifest.json` quotes all three records under `parts`, and its
top-level `sample` flag is `true` if **any** part is still generated sample
data.

---

## 1. CY2027 Medicare Advantage / Part D Landscape Source File

| | |
|---|---|
| **Page URL** | https://www.cms.gov/medicare/coverage/prescription-drug-coverage |
| **Link on that page** | `CY2027 Landscape (202610) (ZIP)` → `/files/zip/cy2027-landscape-202610.zip` |
| **Direct download URL** | https://www.cms.gov/files/zip/cy2027-landscape-202610.zip |
| **CMS release label** | `CY2027 Landscape (202610) (ZIP)` |
| **Download date** | 2026-10-29 |
| **ZIP SHA-256** | `7681605e98b518e3e5c93b9a9424cc148451a60fdcf0f3273c409b85570e40db` |
| **ZIP size** | 12,746,875 bytes |
| **Extracted CSV** | `CY2027_Landscape_202610.csv` (inside `CY2027_Landscape_202610/`) |
| **Extracted CSV SHA-256** | `b1c8f33deb7a37c44eea003a49f24669ff2e11b73332d69f95225bc5ccbd8227` |

Reproduce:

```
curl -L -o cy2027-landscape-202610.zip \
  https://www.cms.gov/files/zip/cy2027-landscape-202610.zip
sha256sum cy2027-landscape-202610.zip
unzip cy2027-landscape-202610.zip

node scripts/normalize-landscape.mjs --year 2027 \
  --src  raw-cms/landscape-2027/CY2027_Landscape_202610/CY2027_Landscape_202610.csv \
  --out  landscape-next.csv \
  --zip  raw-cms/cy2027-landscape-202610.zip \
  --file-name cy2027-landscape-202610.zip \
  --release-label "CY2027 Landscape (202610) (ZIP)" \
  --download-date 2026-10-29
```

### Field mapping (Landscape Source File → `src/data/landscape-next.csv`)

| Site column | CMS column | Note |
|---|---|---|
| `contract_id` | `Contract ID` | verbatim |
| `plan_id` | `Plan ID` | zero-padded to 3 digits |
| `segment_id` | `Segment ID` | verbatim |
| `organization_name` | `Organization Marketing Name` | falls back to `Contract Name` |
| `plan_type` | derived | `PDP` if `National PDP` = Yes; `MAPD` if `Part D Coverage Indicator` = Yes; otherwise `MA` |
| `network` | `Plan Type` | `HMO`, `HMO-POS`, `PPO`, `Regional PPO`, `PFFS`, SNP variants |
| `plan_name` | `Plan Name` | verbatim |
| `premium` | `Part C Premium` | fallback `Monthly Consolidated Premium (Part C + D)` |
| `drug_deductible` | `Annual Part D Deductible Amount` | empty when CMS writes `Not Applicable` |
| `moop` | `In-Network Maximum Out-of-Pocket (MOOP) Amount` | verbatim |
| `star_rating` | `Overall Star Rating` | fallback `Part C Summary Star Rating`; empty when CMS writes `Plan Too New To Be Measured` / `Not Enough Data Available` |
| `has_drug` | `Part D Coverage Indicator` | `1` when Yes |
| `has_dental` / `has_vision` / `has_hearing` | **not published** | always empty — see below |
| `state` | `State Territory Abbreviation` | verbatim |
| `county` | `County Name` | verbatim |
| `fips` | from the site's own GEO table | the CMS Landscape file has no FIPS column |

### Two things this file does NOT publish

1. **Dental / vision / hearing benefit flags.** The combined Landscape file
   has no such columns for any plan year. The normalizer emits them empty and
   the site renders those rows as "Not published by CMS in this file" — never
   as "No", which would be a claim about the plan that the file does not
   support. See `src/assets/js/lib/plandiff-core.js` (`fmtBool`).

2. **Stand-alone Part D (PDP) plans.** They are national, not county-based,
   so the county-scoped Landscape rows contain none of them (`National PDP` =
   `Not Applicable` on every scoped row). The tool therefore compares
   Medicare Advantage plans only. Recorded in `OWNER_STEPS.md` as a known
   scope limitation, not silently dropped.

### Numeric cells that are not numbers

CMS writes text into money and rating cells. These must land as *empty*
(unknown), never as `NaN` (which compares as "no change" and prints as a
dash) and never as `0` (which reads as a genuinely free plan):

- `Not Applicable` — e.g. the Part D deductible on a plan with no Part D
  (209 of the 2,137 CY2027 scoped rows), and the consolidated Part C+D
  premium on those same rows.
- `Plan Too New To Be Measured` / `Not Enough Data Available` — star ratings
  for plans with no rating history (182 of the 2,137 CY2027 scoped rows).

This is why the premium comes from `Part C Premium` and not from
`Monthly Consolidated Premium (Part C + D)`: the consolidated column is
`Not Applicable` on every plan without Part D.

---

## 2. CY2027 Part C/D Plan Crosswalk

| | |
|---|---|
| **Page URL** | https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/plan-crosswalks/2027-part-cd-plan-crosswalk |
| **Direct download URL** | https://www.cms.gov/files/zip/plan-crosswalk-2027.zip |
| **CMS release label** | `Contract Year (CY) 2027 Plan Crosswalk: Read Me`, October 1, 2026 |
| **Download date** | 2026-10-29 |
| **ZIP SHA-256** | `55a392afc9144475c15993885a56177867457910a9527b14dda47640fcaf1329` |
| **ZIP size** | 676,272 bytes |
| **Extracted file used** | `PlanCrosswalk2027_10012026.txt` (tab-delimited) |
| **Extracted file SHA-256** | `cdd432e623f5968e562a26c797da32d9228dc1023a62c2fe66e48363b0ba7a48` |
| **Also in the archive** | `PlanCrosswalk2027_10012026.xlsx` (same data), `2027_plan_crosswalk_readme.pdf` |

Reproduce:

```
curl -L -o plan-crosswalk-2027.zip https://www.cms.gov/files/zip/plan-crosswalk-2027.zip
sha256sum plan-crosswalk-2027.zip
unzip plan-crosswalk-2027.zip

node scripts/normalize-crosswalk.mjs --year 2027 \
  --src  raw-cms/crosswalk-2027/PlanCrosswalk2027_10012026.txt \
  --out  crosswalk.csv \
  --zip  raw-cms/plan-crosswalk-2027.zip \
  --file-name plan-crosswalk-2027.zip \
  --release-label "Contract Year (CY) 2027 Plan Crosswalk: Read Me, October 1, 2026" \
  --download-date 2026-10-29
```

### Field mapping (crosswalk → `src/data/crosswalk.csv`)

| Site column | CMS column |
|---|---|
| `previous_contract_id` | `PREVIOUS_CONTRACT_ID` |
| `previous_plan_id` | `PREVIOUS_PLAN_ID` |
| `contract_id` | `CURRENT_CONTRACT_ID` |
| `plan_id` | `CURRENT_PLAN_ID` |
| `status` | `STATUS` (mapped — see below) |

### CMS status → the site's five crosswalk states

CMS's own definitions, from `2027_plan_crosswalk_readme.pdf`:

| CMS `STATUS` | Site `status` | Why |
|---|---|---|
| `Renewal Plan` | `renewal` | links to a 2026 plan and keeps its whole service area |
| `Renewal Plan with an SAE` | `renewal` | keeps its plan ID and all its counties and *adds* more — an expansion, and the site's only service-area state is a reduction |
| `Renewal Plan with a SAR` | `service-area-reduction` | keeps its plan ID but keeps only part of its counties |
| `Consolidated Renewal Plan` | `consolidation` | two or more 2026 plans merge into one 2027 plan; the successor's plan ID is one of the consolidating IDs |
| `Terminated/Non-renewed Contract` | `termination` | the 2026 plan is not offered in 2027 |
| `New Plan` | `new` | a new plan under an existing contract, not linked to a 2026 plan |
| `Initial Contract` | `new` | a new plan under a new contract; no link to a 2026 plan at all |

CMS writes the literal token `NEW` in the previous-plan columns when there is
no predecessor, and `TERMINATED` in the current-plan columns when there is no
successor. Both become empty cells, which is how the build knows a row has no
other end.

### Scoping

The national crosswalk has 9,144 rows. The site serves 24 counties in 10
states, so the normalizer keeps only rows whose previous **or** current
contract+plan identity appears in the site's county-scoped landscape files:
**1,845 rows** (renewal 938, consolidation 313, termination 235, new 201,
service-area-reduction 158). 7,299 rows were dropped as out of scope and 0 as
unmapped.

---

## 3. CY2026 Landscape Source File (the current plan year)

The current-year file is the same kind of source and is the baseline every
comparison starts from.

| | |
|---|---|
| **Page URL** | https://www.cms.gov/medicare/coverage/prescription-drug-coverage |
| **Link on that page** | `CY2026 Landscape (202609) (ZIP)` → `/files/zip/cy2026-landscape-202609.zip` |
| **Direct download URL** | https://www.cms.gov/files/zip/cy2026-landscape-202609.zip |
| **CMS release label** | `CY2026 Landscape (202609) (ZIP)` |
| **Download date** | 2026-10-29 |
| **ZIP SHA-256** | `75f2797b510449fc0d376bbbbeb3c129f6091a697555281559ca28e6e4b8d882` |
| **ZIP size** | 13,567,495 bytes |
| **Extracted CSV** | `CY2026_Landscape_202609.csv` (inside `CY2026_Landscape_202609/`) |
| **Extracted CSV SHA-256** | `0e530c2352f9481b25ed7ed995d4a1703bfe7547691aebc22dfaf6fcb757277a` |
| **Normalized rows** | 2,288 (same field mapping as CY2027 above) |

---

## When the next plan year arrives

The site compares two plan years, so the annual job is:

1. CMS publishes the next Landscape file (late September / early October).
2. CMS publishes the next Plan Crosswalk (same window).
3. `node scripts/normalize-landscape.mjs --year <new> --src <csv> --out landscape-next.csv --zip <zip> …`
4. `node scripts/normalize-crosswalk.mjs --year <new> --src <txt> --out crosswalk.csv --zip <zip> …`
5. Move the old `landscape-current.csv` to be the new current year, bump
   `CURRENT_YEAR` / `NEXT_YEAR` in `scripts/build-plan-data.mjs`, and re-run
   `npm run build:data && npm run build && npm test && npm run verify:build`.

Until step 3 and 4 land, the manifest's `parts` record the missing file as
sample, `manifest.sample` stays `true`, and the banner stays on the page.
