# BenefitDial

**An independent, ad-supported public utility for the fall benefits season.**
BenefitDial helps U.S. Medicare beneficiaries do two things in under a minute — with
no phone number, no lead form, and no data selling:

1. **Estimate their Social Security COLA raise** and see the amount they actually keep
   after the Medicare Part B premium is withheld.
2. **See exactly what changed in their Medicare plan** year over year — premium,
   deductible, maximum out-of-pocket, star rating, and dropped extras — using the public
   CMS Landscape and Crosswalk files.

The whole product is a **static site** (HTML/CSS/vanilla JS) with **zero runtime
dependencies**, built for near-zero hosting cost on Cloudflare Pages and monetized
purely through **programmatic display advertising** — never carrier/broker commissions,
lead sales, or captured PII. That business-model choice is deliberate: it keeps the site
outside the CMS "chain of enrollment" (TPMO) definition and out of the insurance sales
funnel entirely.

---

## Quick start

```bash
npm run build      # regenerate data + assemble dist/
npm run serve      # preview at http://localhost:4321
npm test           # unit tests for the COLA + plan-diff math (node --test)
```

No `npm install` is required to build or run the site — there are **no dependencies**.
(`playwright-core` is used only by the optional browser verification and is installed
transiently, never committed.)

## How it's built

A tiny, purpose-built static-site generator (`scripts/build.mjs`, ~200 lines, no deps):

- **Pages** live in `src/pages/*.html`. Each starts with an HTML-comment front-matter
  block (`title`, `description`, `slug`, `nav`, `scripts`, …) followed by body sections.
- **Layout** (`src/layout.html`) wraps every page; **partials** (`src/partials/*.html`)
  provide the header, footer, independence disclaimer, and ad slots via `{{> name }}`
  includes. Shared figures/dates are injected as `{{TOKENS}}`.
- **Assets** (`src/assets`) and generated **data** (`src/data/*.json`) are copied to
  `dist/`. `sitemap.xml`, `_headers`, `_redirects`, and `robots.txt` are emitted too.

```
src/
  layout.html            # document shell (head, OG, JSON-LD, skip link)
  partials/              # header, footer, disclaimer, ad slots
  pages/                 # one file per page (front-matter + body)
  assets/
    css/site.css         # the entire design system (senior-first, WCAG-minded)
    js/
      lib/cola-core.js       # pure COLA math  (shared by browser + tests)
      lib/plandiff-core.js   # pure diff logic (shared by browser + tests)
      cola.js / plan-diff.js # progressive-enhancement UI wiring
      nav.js
  data/                  # CSV sources (committed) -> JSON (generated, gitignored)
scripts/                 # build.mjs, build-*-data.mjs, serve.mjs, verify-browser.mjs
tests/                   # node --test unit tests
```

### The build fails fast on purpose

Every figure the pages quote about someone's money comes from the data layer, and
the build refuses to substitute a plausible-looking literal when the data stops
carrying one. `npm run build` exits non-zero — it does not warn — when:

- **a required figure is missing**: the confirmed or projected COLA, the COLA
  announcement date, the Part B premium/deductible, the Part D cap, or the
  current enrolment season. The
  historical failure this prevents: promoting the projection to `official` in
  `cola-history.csv` without adding the *next* year's projection row used to
  leave the site quoting the previous estimate (`3.6%`) in 41 places, including
  "A 3.6% COLA on a $2,000 benefit adds about $72 a month". Build exited 0 and
  every test passed. Now it stops, and the error names the CSV row to add.
- **a `{{TOKEN}}` survives into the output**, which would otherwise ship literal
  braces in front of a reader.
- **`SITE_URL` is not an absolute origin.** It must include the scheme —
  `https://benefitdial.com`, not `benefitdial.com`. A protocol-less value used to
  build cleanly while emitting relative canonicals and `og:image`, non-absolute
  sitemap `<loc>` entries and broken JSON-LD `@id`s.

## Data sources (all public domain)

| Source | Powers | Cadence |
| --- | --- | --- |
| CMS **Landscape** files | Plan availability, premiums, org names | Late Sep / early Oct, annual |
| CMS **Crosswalk** files | Prior→next plan ID mapping + status (the diff engine) | With Landscape |
| CMS **PUF / PBP** files | Drug tiers, deductibles, supplemental benefits | Monthly / annual |
| BLS **CPI-W** (`CWUR0000SA0`) | COLA calculation | Monthly |
| SSA **COLA** announcement | Confirmed COLA figure | Announced Oct 14, 2026 |
| CMS **Parts A & B premiums and deductibles** fact sheet | Part B standard premium + annual deductible | Published Nov, effective Jan 1 |
| CMS **Part D redesign / annual parameters** | Part D out-of-pocket cap (IRA; indexed annually) | Annual |
| CMS **Medicare & You** / 42 CFR 422.62 | Annual Enrollment Period window dates | Annual |

### Updating the data each fall

Four data sets make up the whole annual update. Every CSV below is committed;
the JSON they produce is generated and gitignored.

- **COLA — `src/data/cola-history.csv`.** After the SSA announcement, promote the
  estimate row to `status=official` **and add a new `status=projected` row for the
  following year**, with its `source`. Both steps are required: the build now
  *fails* when there is no projected row rather than silently reusing the previous
  year's estimate in money copy. The error message names the row to add.
- **Statutory Medicare figures — `src/data/medicare-figures.csv`.** One row per
  year carrying `part_b_premium`, `part_b_deductible` and `part_d_oop_cap`. All
  three are **indexed annually**, so none of them may be typed into page markup;
  pages reference `{{PART_B_PREMIUM}}`, `{{PART_B_DEDUCTIBLE}}`,
  `{{PART_D_OOP_CAP}}` and `{{MEDICARE_FIGURES_YEAR}}` instead. Add the new row
  each November with `status=official` and the publication date in
  `source_updated`; `scripts/build-medicare-figures.mjs` takes the latest official
  row as current. The build fails if that row has no Part B premium.

  > **2026 row confirmed first-hand (2026-09-28).** From a networked
  > environment, the Federal Register notice **2025-20251** (published
  > 2025-11-19, read via GPO's govinfo.gov republication) states the standard
  > monthly Part B premium for 2026 is `$202.90` and the annual deductible is
  > `$283.00`; CMS's *CY 2026 Part D Redesign Program Instructions* carry the
  > `$2,100` out-of-pocket threshold. The row matches all three. The earlier
  > caveat (secondary-source corroboration only) is closed. Each autumn's new
  > row should get the same first-hand check against that year's FR notice and
  > Part D parameters.
- **Enrolment season — `src/data/aep.csv`.** One row per Annual Enrollment Period,
  carrying the window dates, the coverage year they take effect in, and the
  following MA Open Enrollment window. Add next season's row and move
  `status=current` onto it. Exactly one row may be `current`: the build fails on
  zero (the site would keep advertising a window that has closed) and on more than
  one (it would have to guess). The season rolls on its own schedule, so pages use
  `{{AEP_SEASON_YEAR}}`, `{{AEP_COVERAGE_YEAR}}`, `{{AEP_WINDOW_RANGE_LONG}}` and
  friends rather than borrowing the COLA or Medicare-figures year — those roll at
  different moments, and borrowing one used to roll a page title while its body
  stayed pinned to the old season.
- **Medicare plans — `src/data/landscape-current.csv`, `landscape-next.csv`,
  `crosswalk.csv`.** These are **generated from the official CMS archives**
  by the two normalizers, and the generated files *plus a provenance sidecar
  each* are committed:

  ```
  node scripts/normalize-landscape.mjs --year 2027 --src <extracted csv> \
    --out landscape-next.csv --zip <zip> --file-name <name> \
    --release-label "<label>" --download-date <YYYY-MM-DD>
  node scripts/normalize-crosswalk.mjs --year 2027 --src <extracted .txt> \
    --out crosswalk.csv --zip <zip> --file-name <name> \
    --release-label "<label>" --download-date <YYYY-MM-DD>
  ```

  The raw archives are **not** committed (`raw-cms/` and `*.zip` are
  gitignored) — only the county-scoped output is. Every source URL, release
  label, download date and SHA-256 is recorded in `docs/CMS-2027-SOURCES.md`
  and in the per-file `*.provenance.json` sidecar, and `manifest.json`
  quotes it under `parts`. **A data file with no sidecar fails the build**:
  a number nobody can trace does not ship.

  `scripts/build-plan-data.mjs` ingests the three files independently. The
  dataset is sample if **any** part is sample (`manifest.sample`), and the
  sample banner on `/medicare-plan-changes/` shows if and only if that is
  true — decided at build time, so the shipped HTML is right before any
  script runs. **If a part is missing**, that part alone falls back to the
  deterministic, structurally-faithful sample dataset (every generated plan
  is flagged `sample: true` and every generated carrier name starts with
  "Sample"), and the banner comes back.

## Deploying to Cloudflare Pages

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Environment:** set `SITE_URL` to the production **origin including the scheme**
  (`https://benefitdial.com` — the default). A protocol-less value is rejected by
  the build, because it would otherwise emit relative canonicals and `og:image`,
  non-absolute sitemap `<loc>` entries, and broken JSON-LD `@id`s while exiting 0.

`_headers` sets security headers (HSTS, `X-Content-Type-Options`, a restrictive
`Permissions-Policy`, etc.) and cache policies. `_redirects` maps friendly aliases.

**Cache policy note.** Assets are *not* content-hashed — `/assets/css/site.css`
keeps its URL forever — so `/assets/*` and `/data/*` are served
`max-age=0, must-revalidate`: bytes stay in cache, but every request revalidates,
so an unchanged file costs a 304 and a changed one can never lag the HTML that
references it. The previous `stale-while-revalidate=604800` meant a returning
visitor could get up to **8 days** of new HTML rendered against old CSS. If asset
filenames ever gain content hashes, switch those blocks to
`max-age=31536000, immutable` (there is a note in `_headers` at the spot).

There are two ways to deploy; either alone is sufficient:

1. **Cloudflare Git integration** — connect the Pages project to this GitHub repo
   (production branch `main`) with the build command/output directory above.
2. **CI deploy (`.github/workflows/deploy.yml`)** — pushes `dist/` to Pages with
   wrangler on every push to `main`, independent of the Git integration. Enable it
   by adding two repository secrets: `CLOUDFLARE_API_TOKEN` (Pages: Edit permission)
   and `CLOUDFLARE_ACCOUNT_ID`; optionally set the `CLOUDFLARE_PAGES_PROJECT`
   repository variable if the Pages project isn't named `benefitdial`, and
   `SITE_URL` if the origin isn't `https://benefitdial.com`.

   **If those secrets are missing the workflow fails.** It used to finish green
   with only a `::notice`, which meant `main` showed a passing check while
   production kept serving the previous build. If you do not want CI deploys yet,
   disable the workflow (Settings → Actions) rather than leaving it reporting a
   success it never performed.

### How CI gates the deploy

`deploy.yml` does not duplicate the checks — it *calls* `ci.yml` as a reusable
workflow (`verify`), and its `deploy` job `needs: verify`. So:

- a red CI genuinely blocks production, instead of racing it in a parallel workflow;
- there is one gate definition, so deploy's checks cannot drift out of sync with
  CI's (deploy's copy had already lost the COLA-calculator / plan-diff page
  existence checks and the unresolved-`{{`-token grep);
- both use the Node version in `.nvmrc`, not one pinned literal each;
- checkout uses `fetch-depth: 0`, because sitemap `<lastmod>` is read from
  `git log -1 --format=%cs` per page and is omitted entirely at depth 1;
- `verify` uploads the `dist/` it validated and `deploy` downloads *that*
  artifact, so the bytes published are the bytes that passed.

The gate is: unit tests, a clean build, the five must-exist output files, ≥13
pages, no unresolved `{{TOKEN}}` in the emitted HTML, and a check that every
internal `href`/`src` in the built pages resolves to a real file — which is what
catches a typo'd `slug:` that still produces 13 pages while the nav link to one
of them 404s.

## Monetization & compliance stance

BenefitDial is **not** a broker, agent, or Third-Party Marketing Organization (TPMO):

- It takes **no** carrier or broker commissions / CPA and sells **no** leads or data.
- It captures **no** personal information — no name, email, or phone number — and the
  calculators run entirely in the browser.
- It never recommends a specific plan for compensation and always points users to the
  official **Medicare Plan Finder** or **1-800-MEDICARE** to enroll.

Ad-network loader scripts (AdSense/Mediavine/Raptive/etc.) attach at the single marked
spot in `src/layout.html`. See `/how-it-works` and `/privacy` on the site itself.

## Not affiliated with the U.S. government

BenefitDial is an independent educational utility and is not connected with or endorsed
by the U.S. government, the federal Medicare program, CMS, or the SSA. Figures for future
years are estimates until the official government announcements. Nothing here is
financial, legal, or medical advice.

## License

MIT — see [LICENSE](./LICENSE).
