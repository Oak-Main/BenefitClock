---
title: AEP 2027 — copy made stale by the real CMS plan data
status: applied
prepared-by: construction lane M1 (BenefitDial)
prepared-on: 2026-10-29
approved-by: owner, 2026-10-29
applied-in: M1b-2 (branch mm/aep-2027-plans, draft PR #27)
---

> **STATUS UPDATE — 2026-10-29.** The owner reviewed this file and approved
> the wording. It was **applied in M1b-2**, typed exactly as approved, with
> every existing passage kept inside a `{{#sample}}` branch and the approved
> text in a `{{#real}}` branch so that both states stay true.
>
> This file is kept as the record of **what changed and why**. The "drafted
> replacement" blocks below are the wording that was approved and shipped.
> The final section's new user-facing string ("Not published by CMS in this
> file") was also **approved as written** on 2026-10-29, after being applied
> in M1b-1/M1b-3 — the lane's specification fixed its meaning, and the owner
> has now confirmed the wording.

# Copy that the real CMS plan data made false

The plan-comparison tool stopped running on the generated SAMPLE dataset on
2026-10-29. The official CMS CY2026 Landscape Source File, the official CMS
CY2027 Landscape Source File and the official CMS CY2027 Part C/D Plan Crosswalk
are now loaded (`src/data/manifest.json` → `parts` → all three `sample: false`).

**Six passages still tell readers the opposite of the truth.** They are listed
below with the exact file:line, why each one is now false, and a drafted
replacement for the owner to approve. **The pages themselves were not edited**
— every replacement below is copy, and copy changes are the owner's call.

> **As applied in M1b-2:** the owner approved the wording on 2026-10-29 and it
> was applied exactly, in `{{#sample}}` / `{{#real}}` branches. The file:line
> references below are the positions **before** the branches were added; the
> wording is unchanged.

## How to apply these

Each block below gives the current line, the reason it is stale, and a
drafted replacement. The drafted replacement is marked
`status: approved` (owner, 2026-10-29) and was applied in M1b-2.

Two of the passages need a **build-time switch** rather than a straight swap,
because the correct sentence depends on whether the dataset is sample or real.
The switch already exists — `{{#sample}} … {{/sample}}` and
`{{#real}} … {{/real}}` blocks, resolved in `scripts/lib/sample-blocks.mjs`
from the manifest's per-part flags. Wrapping the passage in `{{#sample}}` /
`{{#real}}` and pasting the approved wording into each branch is all that is
required.

---

## 1. `src/pages/open-enrollment.html:260` — live, and the most urgent

**Current**

> **Sample data.** The tool runs on clearly-labeled sample plans until CMS publishes the {{PLAN_YEAR_NEXT}} plan landscape files (expected October {{AEP_SEASON_YEAR}}). The comparison process is real — the specific plan details are examples.

**Why it is stale**

This paragraph ships on the Open Enrollment hub and tells every visitor the
tool is running on made-up plans. It is not. The tool is running on the
official CMS Landscape and Crosswalk files, so the plan names, premiums,
deductibles, MOOP amounts and star ratings on that page are the real ones.
The sentence also promises a future event that has already happened.

**Drafted replacement** — `status: approved` (owner, 2026-10-29)

> **Real plan data.** The tool now runs on the official CMS Landscape and Crosswalk files, published in October {{AEP_SEASON_YEAR}}. The plan names, premiums, deductibles, maximum out-of-pocket amounts and star ratings you compare are the real published ones, and the same files the government publishes.

**Note for the owner** — this paragraph sits inside a block that reads
"until CMS publishes" *and* names an expected month. If a future plan year
ever ships only partly (for example the Crosswalk is late), the "real" wording
would be wrong in the same way the current wording is now. Consider wrapping
this paragraph in `{{#sample}}` / `{{#real}}` at the same time as approving
the copy, so the two states can never disagree.

---

## 2. `src/pages/how-it-works.html:144-145` — the honesty callout, now backwards

**Current (title, line 144)**

> An honest note about {{PLAN_YEAR_NEXT}}

**Current (body, line 145)**

> Until CMS publishes the official {{PLAN_YEAR_NEXT}} files (late September / early October), our plan tool runs on a **structurally identical sample dataset** — same fields, same layout, real behavior — so you can see exactly how the comparison works before the real numbers exist. The moment CMS posts the actual files, we load them and the tool becomes live. We would rather tell you this plainly than pretend the {{PLAN_YEAR_NEXT}} numbers are already final.

**Why it is stale**

Every clause is now false: the files are published, the sample dataset is
gone, and the numbers *are* final (they are CMS's published figures). The
last sentence in particular — "we would rather tell you this plainly than
pretend the numbers are already final" — now reads as a confession that the
numbers are not final.

**Drafted replacement** — `status: approved` (owner, 2026-10-29)

Title:

> Where the {{PLAN_YEAR_NEXT}} plan numbers come from

Body:

> The {{PLAN_YEAR_NEXT}} files are published, so the plan tool is live on the real numbers. Our "What Changed" tool reads CMS's Landscape file — the record of which plans are offered in each county, at what premium, with what deductible, out-of-pocket limit and star rating — and CMS's Plan Crosswalk file, which says what happens to each plan this year: it renews, it merges into another plan, it shrinks its service area, or it ends. Every figure in the comparison comes from those two files and nothing else.

---

## 3. `src/pages/how-it-works.html:157-159` — the timeline entry, written in the future

**Current**

> **Late Sep – early Oct 2026** — CMS releases the {{PLAN_YEAR_NEXT}} Landscape, Crosswalk, PUF, and PBP files. We load them, replacing the sample dataset, so the "What Changed" tool shows real plan changes.

**Why it is stale**

The event is in the past as of 2026-10-29: the Landscape and Crosswalk files
were published in October 2026 and loaded. In the present tense this reads as
a plan for something that has already been done. It is also a timeline of
*upcoming* dates, so a past-dated entry in that list is a category error.

**Drafted replacement** — `status: approved` (owner, 2026-10-29)

Option A — keep it in the timeline and move it to the past tense:

> **Late Sep – early Oct 2026** — CMS released the {{PLAN_YEAR_NEXT}} Landscape, Crosswalk, PUF and PBP files. We loaded them, so the "What Changed" tool shows real plan changes.

Option B — drop the entry from the upcoming-dates list and leave the history
to the CMS file itself. The owner should pick one; the lane has not assumed
which.

---

## 4. `src/pages/medicare-plan-changes.html:206-208` — the FAQ question is now wrong

**Current (summary, line 206)**

> Why don't I see {{PLAN_YEAR_NEXT}} numbers yet?

**Current (answer, line 208)**

> CMS releases the {{PLAN_YEAR_NEXT}} Landscape and Crosswalk files in late September or early October. Until the official files are published, this tool runs on a structurally identical sample dataset so you can see exactly how the comparison works. The moment CMS posts the real files, we load them and the numbers become live. See [How it works].

**Why it is stale**

The reader can see the numbers. The question presupposes a state the site is
no longer in, so the answer tells them something untrue about the page they
are looking at.

**Drafted replacement** — `status: approved` (owner, 2026-10-29)

Question:

> Where do the {{PLAN_YEAR_NEXT}} numbers come from?

Answer:

> From CMS's Landscape and Crosswalk files, published in October {{AEP_SEASON_YEAR}} and loaded in full. The Landscape file gives each plan's premium, drug deductible, out-of-pocket limit and star rating in each county; the Crosswalk file says whether your plan renews, merges, shrinks or ends. We publish both the figures and where they came from. See [How it works].

---

## 5. `src/pages/medicare-plan-changes.html:233` — the same stale answer in the structured data

**Current**

> { "@type": "Question", "name": "Why don't I see {{PLAN_YEAR_NEXT}} numbers yet?", "acceptedAnswer": { "@type": "Answer", "text": "CMS releases the 2027 Landscape and Crosswalk files in late September or early October. Until the official files are published, this tool runs on a structurally identical sample dataset so you can see exactly how the comparison works. The moment CMS posts the real files, we load them and the numbers become live. See How it works." } }

**Why it is stale**

Two separate problems in one line.

1. It says the same thing the visible FAQ now says falsely, and it is
   published to search engines as structured data, so it is the version most
   likely to be quoted out of context.
2. It hardcodes **2027** where the visible copy uses `{{PLAN_YEAR_NEXT}}`.
   That literal will silently become wrong the moment the tool rolls to the
   next plan year, while the visible copy rolls correctly. This is the same
   class of bug the `AEP_LITERALS` guard in `scripts/build.mjs` exists to
   catch for enrolment dates, extended to the plan year.

**Drafted replacement** — `status: approved` (owner, 2026-10-29)

> { "@type": "Question", "name": "Where do the {{PLAN_YEAR_NEXT}} numbers come from?", "acceptedAnswer": { "@type": "Answer", "text": "From CMS's Landscape and Crosswalk files, published in October {{AEP_SEASON_YEAR}} and loaded in full. We publish both the figures and where they came from. See How it works." } }

---

## 6. `src/pages/medicare-plan-changes.html:40` — the sample banner's explanation, now only sometimes true

**Current (inside the `{{#sample}}` block)**

> The plan names, plan IDs and dollar amounts here are **made up**. They show how the comparison works until CMS publishes the official {{PLAN_YEAR_NEXT}} plan files. Every plan name starts with the word **“Sample”**.

**Why it is stale**

This block is not on the page today — it is inside `{{#sample}}`, and the
dataset is entirely real. It comes back the moment *any* part is sample, and
by then the sentence can be false in two ways:

- "until CMS publishes the official {{PLAN_YEAR_NEXT}} plan files" — CMS has
  published them. A partially-real dataset happens when one of the three
  files (current landscape, next landscape, crosswalk) is missing, not when
  CMS has not spoken.
- "Every plan name starts with the word **“Sample”**" — true only when the
  *generated* part is the one supplying the names. With a real current-year
  file and a generated next-year file, the names on screen are real carrier
  names and this sentence would be false.

**Drafted replacement** — `status: approved` (owner, 2026-10-29)

> The plan names, plan IDs and dollar amounts here are **made up**. They show how the comparison works until the official CMS plan files are loaded.

**Note for the owner** — if the plan data is ever partly real, the honest
wording has to name *which* part is generated. The manifest already knows:
`src/data/manifest.json` → `parts` → each part's `sample` flag. A build-time
branch per part (rather than one blanket "sample" branch) would be the way to
do it. The lane did not build that, because it needs new sentences to be
useful and those sentences are the owner's to write.

---

## 7. `src/pages/medicare-plan-changes.html:101` — the inline disclosure, same problem

**Current (inside the `{{#sample}}` block)**

> Sample numbers — these figures are made up to show how the tool works. They are not your plan's real numbers.

**Why it is stale**

Not on the page today (it is inside `{{#sample}}`), and it becomes wrong in
the same partly-real case as #6: if the next-year landscape is real and the
crosswalk is generated, the premium and deductible figures on screen *are*
your plan's real numbers, and only the status line is not.

**Drafted replacement** — `status: approved` (owner, 2026-10-29)

> Sample numbers — some of these figures are made up to show how the tool works. They are not your plan's real numbers.

---

## Also checked, and found still true

These were in scope for the audit and need no change. Recorded so the next
person does not re-open them:

| File:line | Why it is still true |
|---|---|
| `src/pages/open-enrollment.html:223, 229` — "Not yet announced" (Part B premium, Part B deductible) | The 2027 Part B figures are genuinely not published. `src/data/medicare-figures.csv` line 32 has the 2027 row's Part B cells empty on purpose. |
| `src/pages/medicare-plan-changes.html:89` — "We compare only the public numbers CMS publishes" | Still true, and now more literally so. |
| `src/pages/guide-medicare-changes.html` (whole guide) | No sample-data promises; every claim is about the CY2027 Final Rule and CMS files that are published. |
| `src/pages/medicare-plan-changes.html:48-49` — the `{{#real}}` provenance badges | Rendered correctly with real data; they name the CMS Landscape & Crosswalk files as the source. |
| `src/pages/how-it-works.html:75, 78` — "Every fall, CMS publishes…" | A statement about CMS's annual process, not about what is loaded now. |

---

## Drafted new user-facing string introduced by this lane

**`src/assets/js/lib/plandiff-core.js` → `fmtBool()`**

> Not published by CMS in this file

This is the text the dental, vision and hearing rows show when CMS published
the flag for one year and not the other. The combined Landscape file has no
such columns, so without this the site would have to print "Not included" — a
claim about the plan that the file does not support.

**status: APPROVED AS WRITTEN** — owner decision, 2026-10-29. It was applied
as part of M1b-1/M1b-3 because the lane's specification fixed its meaning;
the wording and capitalisation are now settled and need no further review.

**Build-time provenance badges** (moved from runtime-only to build-time, so
the page is truthful before any script runs):

> Source: CMS Landscape & Crosswalk files · Public CMS plan data

These are the exact strings `src/assets/js/plan-diff.js` already produced at
runtime; they were moved into the build rather than newly written. The
runtime rewrite is still in place, so the two must be kept in step.
