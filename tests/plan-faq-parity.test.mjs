import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isSampleDataset } from "../src/assets/js/lib/plandiff-core.js";
import { applySampleBlocks } from "../scripts/lib/sample-blocks.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = readFileSync(join(ROOT, "src", "pages", "medicare-plan-changes.html"), "utf8");

/* A stand-in for the build's token substitution, so the comparison is made
   on final text rather than on unresolved {{TOKEN}} markers. */
const TOKENS = {
  PLAN_YEAR_NEXT: "2027",
  PLAN_YEAR_CURRENT: "2026",
  AEP_SEASON_YEAR: "2026",
  DATA_UPDATED: "September 28, 2026",
};
const substitute = (html) =>
  html.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (m, k) => (k in TOKENS ? TOKENS[k] : m));

const manifestWith = (flags) => ({
  sample: Object.values(flags).some((f) => f === true),
  parts: {
    current: { sample: flags.current },
    next: { sample: flags.next },
    crosswalk: { sample: flags.crosswalk },
  },
});

/* The visible FAQ text, with the markup a reader never sees removed. */
function visibleText(fragment) {
  const entities = { "&nbsp;": " ", "&amp;": "&", "&mdash;": "—", "&rsquo;": "’" };
  return fragment
    .split(/<[^>]+>/g).join("")      // compare text; this is not an HTML sanitizer
    .replace(/&(?:nbsp|amp|mdash|rsquo);/g, (entity) => entities[entity])
    .replace(/\s+/g, " ")
    .trim();
}

/* The last <details class="faq"> block — the plan-year FAQ. */
function lastFaqBlock(html) {
  const blocks = [...html.matchAll(/<details class="faq">([\s\S]*?)<\/details>/g)];
  assert.ok(blocks.length, "no FAQ blocks found");
  return blocks[blocks.length - 1][1];
}

/* The FAQPage JSON-LD block, parsed. */
function faqPageJson(html) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const s of scripts) {
    try {
      const parsed = JSON.parse(s[1]);
      if (parsed["@type"] === "FAQPage") return parsed;
    } catch {
      /* a script tag that is not valid JSON in this state is a failure, and
         the caller asserts on the FAQPage being found */
    }
  }
  return null;
}

for (const [label, flags] of [
  ["sample", { current: false, next: true, crosswalk: false }],
  ["real", { current: false, next: false, crosswalk: false }],
]) {
  test(`the visible FAQ and the JSON-LD FAQ say the same thing (${label} state)`, () => {
    const manifest = manifestWith(flags);
    const html = substitute(applySampleBlocks(PAGE, isSampleDataset(manifest)));

    /* The resolver must work inside the JSON-LD script tag: the FAQPage has
       to parse as JSON in both states. */
    const page = faqPageJson(html);
    assert.ok(page, "the FAQPage JSON-LD did not parse in the " + label + " state");

    const block = lastFaqBlock(html);
    const summary = block.match(/<summary>([\s\S]*?)<\/summary>/);
    const answer = block.match(/<div class="faq__body">([\s\S]*?)<\/div>/);
    assert.ok(summary, "no <summary> in the last FAQ block");
    assert.ok(answer, "no FAQ body in the last FAQ block");

    const visibleQuestion = visibleText(summary[1]);
    const visibleAnswer = visibleText(answer[1]);

    const questions = page.mainEntity;
    const last = questions[questions.length - 1];
    assert.equal(last["@type"], "Question");
    assert.equal(last.name, visibleQuestion, "the JSON-LD question text differs from the visible one");
    assert.equal(
      last.acceptedAnswer.text,
      visibleAnswer,
      "the JSON-LD answer text differs from the visible one"
    );
  });
}

test("the JSON-LD answer is plain text where the visible answer links", () => {
  const html = substitute(
    applySampleBlocks(PAGE, isSampleDataset(manifestWith({ current: false, next: false, crosswalk: false })))
  );
  const page = faqPageJson(html);
  const last = page.mainEntity[page.mainEntity.length - 1];
  assert.match(last.acceptedAnswer.text, /See How it works\.$/);
  assert.doesNotMatch(last.acceptedAnswer.text, /<a |href=/, "the JSON-LD text must not carry HTML");
});

test("neither state's JSON-LD hardcodes a plan year", () => {
  /* Checked on the SOURCE, with the tokens left unresolved: a literal year
     in the template is what would silently go wrong at the next roll, while
     the substituted text is supposed to contain the year. */
  for (const flags of [
    { current: false, next: true, crosswalk: false },
    { current: false, next: false, crosswalk: false },
  ]) {
    const html = applySampleBlocks(PAGE, isSampleDataset(manifestWith(flags)));
    const page = faqPageJson(html);
    assert.ok(page, "the FAQPage JSON-LD did not parse in this state");
    for (const q of page.mainEntity) {
      assert.doesNotMatch(q.name, /\b20\d\d\b/, `question hardcodes a year: ${q.name}`);
      assert.doesNotMatch(
        q.acceptedAnswer.text,
        /\b20\d\d\b/,
        `answer hardcodes a year: ${q.acceptedAnswer.text}`
      );
    }
  }
});
