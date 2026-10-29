# Stand-alone Part D (PDP) in the CMS CY2027 Landscape — read-only analysis

**Lane:** M1b · **Repo:** Oak-Main/BenefitClock · **Branch:** `mm/aep-2027-plans`
**Written:** 2026-10-29 · **Status: report only. Nothing was built.**

**Source:** `CY2027_Landscape_202610.csv`, the official CMS CY2027 Landscape
Source File, SHA-256 `b1c8f33deb7a37c44eea003a49f24669ff2e11b73332d69f95225bc5ccbd8227`
(downloaded 2026-10-29 — see `docs/CMS-2027-SOURCES.md`).

**The question:** the site's plan tool compares Medicare Advantage plans only,
because the county-scoped Landscape rows contain no stand-alone Part D plans.
What would it take to show them, and how many are there?

---

## 1. How the file encodes a stand-alone Part D plan

The national file has **130,307 rows** across 53 columns. **476 of them are
stand-alone Part D plans**, and they are identifiable three ways that always
agree:

| Column | PDP value | Notes |
|---|---|---|
| `Contract Category Type` | `PDP` | **476 of 476** — the definitive identifier |
| `Plan Type` | `PDP` | 476 of 476 |
| `Part D Coverage Indicator` | `Yes` | 476 of 476 |
| `National PDP` | `Yes` (414) / `No` (62) | `Yes` = offered in every state; `No` = a **regional** PDP serving a subset of states |
| `Organization Type` | `Medicare Prescription Drug Plan` | 96 of 96 in our states |

### Geography

| Column | What a PDP row carries |
|---|---|
| `County Name` | **`All Counties`** — one single value across all 476 PDP rows. Never blank, never a real county. |
| `State Territory Abbreviation` | the state the contract is filed in — 56 distinct values |
| `PDP Region Code` / `PDP Region` | the CMS drug-benefit region — 39 distinct regions ("Alabama, Tennessee", "Central New England (Connecticut, Massachusetts, Rhode Island, and Vermont)", …) |
| `MA Region Code` / `MA Region` | present on MA rows; the PDP equivalent is the PDP Region pair |

**So a PDP row's geography is its state plus its PDP region — never a county.**
The county is "All Counties" on every one of them.

### The plan identity is state-specific

A national PDP has **one contract ID and a different plan ID in each state**.
`Wellcare Classic (PDP)` is contract `S4802` with plan `071` in Alabama,
`083` in Florida, `094` in California, `096` in Alaska. `Humana Basic Rx Plan
(PDP)` is contract `S5884`, plan `106` in Alabama and `105` in Florida.

Two consequences:

- The tool's `contract|plan` key is already state-scoped for PDPs. Two states
  never collide on the same key.
- The **premium is state-specific** for the same brand: Wellcare Classic is
  $7.30/month in Alabama, Arizona and California, $21.30 in Connecticut,
  $28.30 in Hawaii. Humana Basic Rx is $6.30 in Alabama and Georgia but
  **$118.30 in California** and **$90.30 in Florida**. The deductible
  ($700) and the Part D star rating (3.0) are plan-level and do not vary by
  state.

### The columns a PDP row cannot answer

| Column | PDP value | Consequence |
|---|---|---|
| `Part C Premium` | `Not Applicable` | no medical premium |
| `Monthly Consolidated Premium (Part C + D)` | `Not Applicable` | **the consolidated premium does not work for a PDP either** |
| `In-Network Maximum Out-of-Pocket (MOOP) Amount` | `Not Applicable` | no medical out-of-pocket limit |
| `Overall Star Rating` | `Not Applicable` | no combined rating |

The member-facing figures for a PDP live in different columns:

| Figure | The column that carries it | Values across our 96 rows |
|---|---|---|
| Monthly premium | **`Part D Total Premium`** (or `Part D Basic Premium` + `Part D Supplemental Premium`) | $5.30 … $191.50 |
| Drug deductible | `Annual Part D Deductible Amount` | $0 / $200 / $300 / $350 / $687 / $700 |
| Star rating | **`Part D Summary Star Rating`** | 2.5 (26), 3.0 (40), 4.5 (30) |
| Out-of-pocket limit | — | none; `Not Applicable` on all 96 |

> **This is the same trap as the MAPD premium defect, one column over.** If
> PDPs are ever added, `Monthly Consolidated Premium (Part C + D)` must not be
> the premium source: it reads `Not Applicable` on every PDP row.

---

## 2. How many PDP rows fall in our 10 states

96 of the 476 national PDP rows land in a state the site serves. **Each is a
distinct `contract|plan`** — no key is offered in two of our states, because
the plan ID is state-specific.

| State | PDP rows | Distinct `contract|plan` | MA rows the site ships today | PDP as a share |
|---|---|---|---|---|
| FL | 11 | 11 | 318 | 3.3% |
| TX | 10 | 10 | 281 | 3.4% |
| CA | 10 | 10 | 320 | 3.0% |
| NY | 9 | 9 | 204 | 4.2% |
| PA | 8 | 8 | 193 | 4.0% |
| AZ | 9 | 9 | 180 | 4.8% |
| OH | 9 | 9 | 178 | 4.8% |
| NC | 11 | 11 | 152 | 6.7% |
| GA | 9 | 9 | 183 | 4.7% |
| IL | 10 | 10 | 128 | 7.2% |
| **Total** | **96** | **96** | **2,137** | **4.5%** |

The 380 remaining PDP rows are in states the site does not serve.

**PDP contract IDs all start with `S`** (16 distinct contracts nationally).
MA contracts start with `H` (123,593 rows) or `R` (6,238 rows).

---

## 3. One proposed scope rule

> **Include every PDP row whose `State Territory Abbreviation` is one of the
> site's 10 states, in every county of that state.**

A PDP is offered in every county of the state it is filed in — that is what
`County Name = "All Counties"` means, and it is what the PDP region encodes.

The rule in mechanical terms:

1. **Select** rows where `Contract Category Type == "PDP"` and
   `State Territory Abbreviation` is one of the site's states. 96 rows for
   CY2027.
2. **Fan out** each selected row into one row per county of that state, using
   the site's own GEO table for the county names and FIPS. `County Name` is
   replaced with the real county; `fips` is filled in per county.
3. **Map the figures** — the four columns a PDP row cannot answer:
   - `plan_type` = `PDP`
   - `network` = `PDP`
   - `premium` = **`Part D Total Premium`** (not the consolidated column)
   - `drug_deductible` = `Annual Part D Deductible Amount`
   - `star_rating` = **`Part D Summary Star Rating`** (not `Overall Star Rating`)
   - `moop` = empty (unknown) — there is no medical out-of-pocket limit
4. **Leave everything else alone.** The MA rows, their fields and their
   county scoping are untouched.

**Size of the change for CY2027:** 96 plans → **232 additional rows**
(FL 33, TX 30, CA 30, NY 27, PA 16, AZ 18, OH 18, NC 22, GA 18, IL 20),
taking `landscape-next.csv` from 2,137 rows to **2,369**.

---

## 4. What the owner should weigh before deciding

These are the consequences of that rule, found by reading the data rather
than by building anything.

1. **The crosswalk has to be re-scoped too — and it is not a small addition.**
   The scoped crosswalk currently holds **1,845** rows and contains **zero**
   PDP contract IDs, because the scoping filter only kept rows whose
   `contract|plan` appears in the county-scoped landscape files, and PDPs
   were never in them. The national crosswalk has 9,144 rows, of which **680
   involve an `S` (PDP) contract** and are currently dropped. Adding PDPs
   means the crosswalk gains those rows too, and each PDP row's key
   (`contract|plan`) must line up with the state-specific plan ID.

2. **The normalizer's plan-type rule has to change with it.** Today
   `plan_type` is derived from `National PDP` — `PDP` if Yes, else
   `MAPD`/`MA`. That is **wrong for the 62 regional PDPs** (`National PDP =
   No`), which would be labelled `MAPD` and shown as a Medicare Advantage
   plan with drug coverage. The rule has to key on
   `Contract Category Type == "PDP"`. This is harmless today (PDP rows are
   filtered out before they reach the normalizer, because "All Counties"
   matches no county) but it is a live landmine for whoever implements the
   scope rule.

3. **A PDP plan's premium is not comparable to an MA plan's.** A $191.50
   PDP premium and a $0 MAPD premium are both real numbers about different
   kinds of coverage. The tool's "What Changed" view compares a plan against
   *itself* across years, so a PDP row would only ever be compared with its
   own prior-year PDP row — which is safe — but any cross-plan sorting or
   "cheapest plan" view would not be. **There is no such view today**: the
   tool is a year-over-year diff for one plan at a time.

4. **The MOOP row for a PDP is empty, not zero.** The tool already renders
   medical rows as "Not applicable" for a drug-only plan (there is an
   existing test for exactly that), so a null MOOP is handled — but it does
   mean a PDP comparison shows three blank medical rows.

5. **The star rating for a PDP is a Part D rating, not an overall rating.**
   The site labels the metric "Star rating". For a PDP that would be the
   Part D drug rating (2.5 / 3.0 / 4.5 in our rows). The label may need to
   say which rating it is — which is copy, and therefore the owner's call.

6. **The tool's "the numbers CMS published" framing still holds.** Nothing
   here requires an estimate or an interpolation; every PDP figure comes
   straight from the Landscape file. That is the same standard the MA rows
   are held to, and PDPs would meet it.

---

## 5. Recommendation

For the AEP season, **the current MA-only scope is defensible and safe**:
it is complete, it is honest about what it covers, and the site already says
so in the owner-approved copy ("It covers Medicare Advantage plans in the
counties you can pick in the tool").

Adding PDPs is a **scope increase, not a bug fix**, and it is worth doing
before the next plan year rather than during this one — the mapping changes
in §3 (premium column, star-rating column, plan-type rule) and the crosswalk
re-scoping in §4.1 both change what the numbers mean, and the tool's labels
in §4.5 would need new words.

The cost of doing it: one normalizer change, one crosswalk re-scope, 232
extra rows, and the label question. The benefit: the tool covers the drug-only
plans that roughly 4.5% of the plans in its own counties are.

**The owner's decision, not the lane's.**
