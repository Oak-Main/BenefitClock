/* ==========================================================================
   provenance.mjs — the shared, small piece of machinery that lets a
   normalization run record WHERE ITS DATA CAME FROM.

   Every CMS file the site ships is public domain, and every one of them can
   be re-downloaded and re-verified. Recording the source URL, the release
   label, the download date and the SHA-256 of both the archive and the
   extracted CSV is what turns "we built this from CMS" into something a
   reader (or the next agent) can actually check.

   The sidecar is written next to the normalized CSV as
   <name>.provenance.json and is read back by scripts/build-plan-data.mjs,
   which puts it in src/data/manifest.json.
   ========================================================================== */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** SHA-256 of a file, lower-case hex. "" when the file is not there. */
export function fileSha256(path) {
  if (!path || !existsSync(path)) return '';
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** SHA-256 of a string, lower-case hex. */
export function textSha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Write the sidecar provenance file for a normalized data file.
 * @param {string} csvPath      the normalized CSV that was just written
 * @param {object} info         provenance fields (see below)
 * @returns {object} the provenance object that was written
 */
export function writeProvenance(csvPath, info) {
  const body = readFileSync(csvPath, 'utf8');
  const provenance = {
    part: info.part,
    planYear: info.planYear ?? null,
    sample: false,
    sourcePage: info.sourcePage || null,
    releaseLabel: info.releaseLabel || null,
    fileName: info.fileName || null,
    downloadDate: info.downloadDate || null,
    zipSha256: info.zipSha256 || null,
    sourceCsvSha256: info.sourceCsvSha256 || null,
    normalizedFile: info.normalizedFile || null,
    normalizedSha256: textSha256(body),
    rows: info.rows ?? null,
    notes: info.notes || null,
  };
  const out = csvPath.replace(/\.csv$/, '.provenance.json');
  writeFileSync(out, JSON.stringify(provenance, null, 2) + '\n');
  return provenance;
}
