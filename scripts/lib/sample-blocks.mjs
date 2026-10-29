/* ==========================================================================
   sample-blocks.mjs — build-time conditional blocks for the plan data's
   sample disclosure.

   The rule the site has to keep: the "these are not real plan numbers"
   banner is shown if and only if ANY part of the plan dataset is sample.
   Deciding that at build time (rather than only in the browser) means the
   shipped HTML already says the right thing before any script runs, and it
   means a test can read the built page and know the answer.

     {{#sample}} ... {{/sample}}   kept when the dataset is (partly) sample
     {{#real}}   ... {{/real}}     kept when every part is real CMS data

   Blocks do not nest, exactly like the COLA status blocks in
   scripts/lib/status-blocks.mjs.
   ========================================================================== */

/* A marker that is unbalanced, nested or misspelled fails the build rather
   than reaching a reader as literal "{{#sample}}" text. */
const BLOCK = /\{\{#(sample|real)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
const STRAY = /\{\{[#/](sample|real)\}\}/g;

/**
 * Resolve the sample/real conditional blocks in a page.
 * @param {string} html
 * @param {boolean} isSample  true when any part of the dataset is sample
 */
export function applySampleBlocks(html, isSample) {
  const out = html.replace(BLOCK, (_match, kind, body) =>
    kind === "sample" ? (isSample ? body : "") : isSample ? "" : body
  );
  const stray = [...new Set(out.match(STRAY) || [])];
  if (stray.length) {
    throw new Error(
      `Unbalanced, nested or unknown sample block marker(s) in template: ${stray.join(", ")}`
    );
  }
  return out;
}
