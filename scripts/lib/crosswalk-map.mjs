/* ==========================================================================
   crosswalk-map.mjs — the pure part of the CMS crosswalk ingestion: how one
   row of CMS's Plan Year Crosswalk file maps onto the five columns
   scripts/build-plan-data.mjs reads.

   Kept separate from normalize-crosswalk.mjs (which reads and writes files)
   so the mapping can be unit-tested without a CMS file on disk.
   ========================================================================== */

/* CMS status text -> the site's crosswalk vocabulary. */
export const STATUS_MAP = {
  'renewal plan': 'renewal',
  'renewal plan with an sae': 'renewal',
  'renewal plan with sae': 'renewal',
  'renewal plan with a sar': 'service-area-reduction',
  'renewal plan with sar': 'service-area-reduction',
  'consolidated renewal plan': 'consolidation',
  'terminated/non-renewed contract': 'termination',
  'terminated/non renewed contract': 'termination',
  'new plan': 'new',
  'initial contract': 'new',
};

/* A CMS plan/contract id that is a real id. CMS uses "NEW" and "TERMINATED"
   as sentinels for "there is no such plan on the other side". */
export const realId = (v) => {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^(new|terminated|none|n\/a|na)$/i.test(s)) return '';
  return s;
};

/**
 * Map one CMS crosswalk row onto the site's five columns.
 * @param {object} cells  { prevContract, prevPlan, currContract, currPlan, status }
 * @returns {object|null} the mapped row, or null when the status is unknown
 */
export function mapCrosswalkRow(cells) {
  const prevContract = realId(cells.prevContract);
  const prevPlan = realId(cells.prevPlan);
  const currContract = realId(cells.currContract);
  const currPlan = realId(cells.currPlan);
  const rawStatus = String(cells.status == null ? '' : cells.status).trim();
  const status = STATUS_MAP[rawStatus.toLowerCase()];
  if (!status) return null;

  return {
    previous_contract_id: prevContract,
    previous_plan_id: prevPlan ? prevPlan.padStart(3, '0') : '',
    contract_id: currContract,
    plan_id: currPlan ? currPlan.padStart(3, '0') : '',
    status,
  };
}
