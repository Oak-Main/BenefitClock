/* ==========================================================================
   landscape-money.mjs — the pure money/rating parsing the CMS Landscape
   ingestion needs, kept separate from normalize-landscape.mjs (which reads
   and writes files) so the rules can be unit-tested without a CMS file on
   disk.
   ========================================================================== */

/**
 * A CMS money cell: "$1,234.50", "0.00", "Not Applicable", "($52.20)".
 * Returns a plain number string, or "" when the cell is not a number —
 * which is the difference between "unknown" and "zero".
 * @param {unknown} v
 * @returns {string}
 */
export function money(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const neg = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/^\(|\)$/g, '').replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return '';
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return '';
  return String(neg ? -n : n);
}

/**
 * The monthly premium a beneficiary actually pays for a plan.
 *
 * `Monthly Consolidated Premium (Part C + D)` is the figure Medicare shows a
 * member: what they pay for the medical benefit PLUS the drug benefit. For
 * a plan with Part D it is the number that matters, and it is often the only
 * non-zero figure (the Part C premium is frequently waived to $0.00 on a
 * MAPD, with the member paying the drug premium instead).
 *
 * `Part C Premium` is the medical benefit alone. On a plan with no Part D at
 * all, CMS writes "Not Applicable" in the consolidated column, so Part C
 * Premium is the only figure there is.
 *
 * So: consolidated first, whenever it parses as a NUMBER; Part C Premium
 * otherwise.
 *
 * The check is on PARSABILITY, not truthiness. `money()` returns the string
 * "0" for a $0.00 cell, and "0" is truthy in JavaScript — so a `||` chain
 * over these strings silently prefers a $0 Part C premium over a real
 * consolidated one. Never use `||` to choose between these two columns.
 *
 * @param {unknown} consolidated  `Monthly Consolidated Premium (Part C + D)`
 * @param {unknown} partC         `Part C Premium`
 * @returns {string} a number string, or "" when neither cell is a number
 */
export function selectPremium(consolidated, partC) {
  const c = money(consolidated);
  if (c !== '') return c;
  return money(partC);
}

/**
 * A CMS star rating: 4.5, or "Plan Too New To Be Measured" /
 * "Not Enough Data Available". Anything that is not a number is "not rated".
 * @param {unknown} v
 * @returns {string}
 */
export function stars(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return '';
  return s;
}
