import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isSampleDataset } from "../src/assets/js/lib/plandiff-core.js";
import { applySampleBlocks } from "../scripts/lib/sample-blocks.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = readFileSync(join(ROOT, "src", "pages", "medicare-plan-changes.html"), "utf8");

/* The disclosure markup in the page source. */
const BANNER = /id="pd-sample-banner"/;
const INLINE = /id="pd-sample-inline"/;

const manifestWith = (flags) => ({
  currentYear: 2026,
  nextYear: 2027,
  sample: Object.values(flags).some((f) => f === true),
  parts: {
    current: { part: "current", sample: flags.current },
    next: { part: "next", sample: flags.next },
    crosswalk: { part: "crosswalk", sample: flags.crosswalk },
  },
});

/* The built page for a given manifest: the same block resolution the build
   performs, applied to the real page source. */
const render = (manifest) => applySampleBlocks(PAGE, isSampleDataset(manifest));

test("the banner renders when a part of the dataset is sample", () => {
  for (const flags of [
    { current: true, next: false, crosswalk: false },
    { current: false, next: true, crosswalk: false },
    { current: false, next: false, crosswalk: true },
    { current: true, next: true, crosswalk: true },
  ]) {
    const manifest = manifestWith(flags);
    assert.equal(isSampleDataset(manifest), true, `expected sample for ${JSON.stringify(flags)}`);
    const html = render(manifest);
    assert.match(html, BANNER, `banner missing for ${JSON.stringify(flags)}`);
    assert.match(html, INLINE, `inline disclosure missing for ${JSON.stringify(flags)}`);
    /* It must be visible in the shipped markup: a banner that only appears
       when a script runs is a banner that disappears when the script fails. */
    const bannerTag = html.match(/<div[^>]*id="pd-sample-banner"[^>]*>/);
    assert.ok(bannerTag, "banner element not found");
    assert.doesNotMatch(bannerTag[0], /\shidden[\s>=]/, "banner must not ship hidden");
  }
});

test("the banner does NOT render when every part is real", () => {
  const manifest = manifestWith({ current: false, next: false, crosswalk: false });
  assert.equal(isSampleDataset(manifest), false);
  const html = render(manifest);
  assert.doesNotMatch(html, BANNER, "banner must be absent from an all-real page");
  assert.doesNotMatch(html, INLINE, "inline disclosure must be absent from an all-real page");
  assert.doesNotMatch(html, /These are sample numbers/, "sample wording must be absent from an all-real page");
  /* The real-data provenance line is what ships instead. */
  assert.match(html, /Source: CMS Landscape &amp; Crosswalk files/);
});

test("one sample part is enough to require the banner", () => {
  /* The whole point of per-part provenance: a dataset built from two real
     files and one generated one still contains made-up numbers. */
  const mixed = manifestWith({ current: false, next: false, crosswalk: true });
  assert.equal(isSampleDataset(mixed), true);
  assert.match(render(mixed), BANNER);
});

test("isSampleDataset falls back to the top-level flag for an older manifest", () => {
  assert.equal(isSampleDataset({ sample: false }), false);
  assert.equal(isSampleDataset({ sample: true }), true);
  assert.equal(isSampleDataset(null), true);
  assert.equal(isSampleDataset(undefined), true);
});

test("isSampleDataset trusts the per-part flags over a stale top-level flag", () => {
  /* A manifest whose summary says "real" but whose parts say otherwise must
     still show the disclosure. */
  const manifest = { sample: false, parts: { current: { sample: false }, next: { sample: true } } };
  assert.equal(isSampleDataset(manifest), true);
});

test("a sample block that is not resolved fails the build instead of shipping a marker", () => {
  assert.throws(
    () => applySampleBlocks("{{#sample}}unclosed", true),
    /Unbalanced, nested or unknown sample block marker/
  );
  assert.throws(
    () => applySampleBlocks("{{#sample}}a{{#real}}b{{/real}}{{/sample}}", true),
    /Unbalanced, nested or unknown sample block marker/
  );
});
