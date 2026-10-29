/* ==========================================================================
   plan-diff.js — wires the Medicare "What Changed" tool to plandiff-core.js
   Loads the public-data-derived JSON, guides the user State -> County -> Plan,
   and renders a year-over-year diff. No PII, no accounts, nothing is sent out.

   Two rules this file exists to enforce:
   1. When the manifest says the dataset is sample data, the page says so —
      loudly, in the visible text, on screen and on paper — and never claims
      the figures were verified against CMS files.
   2. Colour comes from a change's MEANING (`tone`), never from whether the
      number went up or down: a falling star rating is bad news, not good.
   ========================================================================== */
import {
  indexPlans, indexCrosswalk, listStates, listCounties, plansInCounty,
  buildDiff, planTypeLabel, isSampleDataset,
} from "./lib/plandiff-core.js";

const $ = (id) => document.getElementById(id);
const DATA_BASE = "/data";
const LOAD_TIMEOUT_MS = 15000;

/* Plain state names read better than two-letter codes for this audience. */
const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", PR: "Puerto Rico",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const stateName = (code) => STATE_NAMES[String(code).toUpperCase()] || String(code);

function ready(fn) {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

/* The stylesheet correctly sets scroll-behavior:auto under
   prefers-reduced-motion, but an explicit behavior:"smooth" passed to
   scrollIntoView overrides the CSS — so the one place the site animates a
   long scroll ignored the setting entirely. Ask the media query directly. */
function scrollBehavior() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

async function loadJSON(path, signal) {
  const res = await fetch(path, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

ready(async () => {
  const form = $("plandiff-form");
  if (!form) return;

  const els = {
    state: $("f-state"),
    county: $("f-county"),
    plan: $("f-plan"),
    planId: $("f-planid"),
    status: $("plandiff-status"),
    results: $("plandiff-results"),
    empty: $("plandiff-empty"),
    error: $("plandiff-error"),
    retry: $("plandiff-retry"),
    retryBtn: $("pd-retry"),
    headline: $("pd-headline"),
    statusBadge: $("pd-status"),
    planName: $("pd-plan-name"),
    nextName: $("pd-next-name"),
    note: $("pd-note"),
    notes: $("pd-notes"),
    tbody: $("pd-tbody"),
    meta: $("pd-meta"),
    live: $("pd-live"),
    coverage: $("pd-coverage"),
    banner: $("pd-sample-banner"),
    bannerInline: $("pd-sample-inline"),
    provenance: $("pd-provenance"),
  };

  function setStatus(msg) { if (els.status) els.status.textContent = msg; }
  function announce(msg) { if (els.live) els.live.textContent = msg; }

  function showError(msg, { retry = false } = {}) {
    if (els.error) { els.error.textContent = msg; els.error.hidden = false; }
    if (els.results) els.results.hidden = true;
    if (els.empty) els.empty.hidden = true;
    if (els.retry) els.retry.hidden = !retry;
    announce(msg);
  }

  function clearError() {
    if (els.error) { els.error.hidden = true; els.error.textContent = ""; }
    if (els.retry) els.retry.hidden = true;
  }

  let meta = { currentIndex: null, nextIndex: null, crosswalk: null, currentYear: 2026, nextYear: 2027, sample: true };

  /* ---- Sample-data disclosure ----------------------------------------
     The page ships the disclosure only when the build decided the dataset is
     (partly) sample, so this only ever has to turn the warning OFF — and
     only when the manifest positively says every part came from real CMS
     files. The decision itself is isSampleDataset() in plandiff-core.js, so
     the browser, the build and the tests all answer it the same way. */
  function applyProvenance(manifest) {
    const isSample = isSampleDataset(manifest);
    meta.sample = isSample;
    if (els.banner) els.banner.hidden = !isSample;
    if (els.bannerInline) els.bannerInline.hidden = !isSample;
    if (els.provenance && !isSample) {
      const verified = els.provenance.getAttribute("data-verified") || "";
      els.provenance.innerHTML =
        `<span class="badge badge--info">Source: CMS Landscape &amp; Crosswalk files</span> ` +
        `<span class="badge badge--neutral">Public CMS plan data</span>` +
        (verified
          ? ` <span class="datasource__fresh"><svg class="icon" aria-hidden="true" focusable="false"><use href="#ic-clock" xlink:href="#ic-clock"/></svg> Figures verified ${escapeHtml(verified)}</span>`
          : "");
    }
  }

  /* ---- Load data ------------------------------------------------------ */
  async function loadData() {
    clearError();
    if (els.state) {
      els.state.disabled = true;
      els.state.innerHTML = `<option value="">Loading the plan list…</option>`;
    }
    setStatus("Loading the public Medicare plan data…");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT_MS);
    try {
      const [manifest, plansCur, plansNext, xwalk] = await Promise.all([
        loadJSON(`${DATA_BASE}/manifest.json`, ctrl.signal).catch(() => null),
        loadJSON(`${DATA_BASE}/plans-current.json`, ctrl.signal),
        loadJSON(`${DATA_BASE}/plans-next.json`, ctrl.signal),
        loadJSON(`${DATA_BASE}/crosswalk.json`, ctrl.signal),
      ]);
      clearTimeout(timer);
      if (manifest) {
        meta.currentYear = manifest.currentYear || meta.currentYear;
        meta.nextYear = manifest.nextYear || meta.nextYear;
      }
      applyProvenance(manifest);
      meta.currentIndex = indexPlans(plansCur);
      meta.nextIndex = indexPlans(plansNext);
      meta.crosswalk = indexCrosswalk(xwalk);
      setStatus("");
      populateStates();
      hideResult();
      return true;
    } catch (err) {
      clearTimeout(timer);
      // Never leave "Loading…" sitting next to an error, and never leave an
      // enabled-but-empty dropdown pretending the tool is ready.
      setStatus("");
      if (els.state) {
        els.state.disabled = true;
        els.state.innerHTML = `<option value="">Plan data unavailable</option>`;
      }
      showError(
        err && err.name === "AbortError"
          ? "The plan data is taking too long to load. Your connection may be slow. Please try again."
          : "We could not load the plan data right now. Please try again in a moment. You can also use the official Medicare Plan Finder at medicare.gov/plan-compare or call 1-800-MEDICARE.",
        { retry: true }
      );
      return false;
    }
  }

  /* ---- Coverage: say what we have, and where to go if we don't --------- */
  function populateStates() {
    const states = listStates(meta.currentIndex);
    if (els.state) {
      const sorted = [...states].sort((a, b) => stateName(a).localeCompare(stateName(b)));
      els.state.innerHTML =
        `<option value="">Select your state…</option>` +
        sorted
          .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(stateName(s))} (${escapeHtml(s)})</option>`)
          .join("");
      els.state.disabled = false;
    }
    if (els.coverage) {
      const counties = new Set(meta.currentIndex.all.map((p) => `${p.state}|${p.county}`)).size;
      const names = [...states].map(stateName).sort((a, b) => a.localeCompare(b));
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] || "";
      els.coverage.innerHTML =
        `Right now this checker covers ${counties} counties in ${names.length} states: ${escapeHtml(list)}. ` +
        `If your state or county is not on the list, use the official ` +
        `<a href="https://www.medicare.gov/plan-compare/" rel="nofollow noopener" target="_blank">Medicare Plan Finder</a> ` +
        `or call 1-800-MEDICARE (TTY 1-877-486-2048).`;
    }
  }

  function resetSelect(sel, placeholder) {
    if (!sel) return;
    sel.innerHTML = `<option value="">${placeholder}</option>`;
    sel.disabled = true;
  }

  function onState() {
    resetSelect(els.county, "Select your county…");
    resetSelect(els.plan, "Select your plan…");
    hideResult();
    const s = els.state.value;
    if (!s) return;
    const counties = listCounties(meta.currentIndex, s);
    els.county.innerHTML =
      `<option value="">Select your county…</option>` +
      counties.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    els.county.disabled = false;
  }

  function onCounty() {
    resetSelect(els.plan, "Select your plan…");
    hideResult();
    const s = els.state.value, c = els.county.value;
    if (!s || !c) return;
    const plans = plansInCounty(meta.currentIndex, s, c);
    els.plan.innerHTML =
      `<option value="">Select your plan…</option>` +
      plans
        .map((p) => {
          const id = `${p.contractId}-${p.planId}`;
          return `<option value="${p.contractId}|${p.planId}">${escapeHtml(p.planName)} — ${id}</option>`;
        })
        .join("");
    els.plan.disabled = false;
  }

  function onPlan() {
    if (!els.plan.value) { hideResult(); return; }
    runDiff();
  }

  /* Optional: direct plan-ID entry like "H1234-001" selects the option.
     Every exit from this function has to leave the page in a state the user
     can read: silently doing nothing left the PREVIOUS plan's comparison on
     screen as if it were the answer to what they just typed. */
  function onPlanIdEntry() {
    if (!meta.currentIndex) return; // data never loaded; its own error stands
    const raw = String(els.planId.value || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!raw) { clearError(); setStatus(""); return; }

    if (!els.plan || els.plan.disabled) {
      hideResult();
      const msg = "Choose your state and county first, then we can look up that plan ID.";
      setStatus(msg);
      announce(msg);
      return;
    }

    const m = raw.match(/([HRS]\d{3,4})[-\s]?(\d{1,3})/i);
    if (!m) {
      showError(
        `We could not read “${els.planId.value.trim()}” as a plan ID. Plan IDs look like H1234-001 — a letter, four numbers, a dash, then three numbers. You can also pick your plan by name in the list above.`
      );
      setStatus("");
      return;
    }

    const target = `${m[1].toUpperCase()}|${m[2].padStart(3, "0")}`;
    for (const opt of els.plan.options) {
      if (opt.value.toUpperCase() === target) {
        els.plan.value = opt.value;
        setStatus("");
        runDiff();
        return;
      }
    }

    /* Echo what the person typed, not what we padded it to. Reporting
       "H1234-001 not found" to someone who typed H1234-1 sends them to check
       their card against a number that was never on it — and hides that the
       padding is where the lookup may have gone wrong. */
    const typed = els.planId.value.trim();
    const normalised = `${m[1].toUpperCase()}-${m[2].padStart(3, "0")}`;
    const asRead = typed.toUpperCase() === normalised ? "" : ` (we read that as ${normalised})`;
    const county = els.county && els.county.value ? `${els.county.value} County` : "this county";
    showError(
      `We could not find plan ${typed}${asRead} in ${county}. Check the ID on your member card or Annual Notice of Change, or pick your plan by name in the list above.`
    );
    setStatus("");
  }

  function hideResult() {
    if (els.results) els.results.hidden = true;
    if (els.empty) els.empty.hidden = false;
    clearError();
  }

  function runDiff() {
    clearError();
    const [contractId, planId] = String(els.plan.value).split("|");
    const state = els.state.value;
    const county = els.county.value;
    if (!contractId || !planId) return;

    const diff = buildDiff({
      currentIndex: meta.currentIndex,
      nextIndex: meta.nextIndex,
      crosswalk: meta.crosswalk,
      contractId, planId, state, county,
      currentYear: meta.currentYear,
      nextYear: meta.nextYear,
    });

    if (!diff.ok) {
      showError("We couldn't find that plan in this county's file. Double-check your plan ID against your member card or Annual Notice of Change.");
      return;
    }
    renderDiff(diff);
  }

  /* Colour comes from `tone` (what the change MEANS), not `direction` (which
     way the number moved). The stylesheet's class names are directional, so
     map meaning onto them here: good -> green, bad -> red, everything else
     stays neutral rather than being coloured by accident. */
  const TONE_CLASS = { good: "cell-change--down", bad: "cell-change--up", warn: "cell-change--warn", flat: "cell-change--flat" };

  function renderDiff(diff) {
    if (els.empty) els.empty.hidden = true;
    if (els.results) els.results.hidden = false;

    if (els.headline) els.headline.textContent = diff.headline;

    if (els.statusBadge) {
      const toneClass = { good: "badge--good", warn: "badge--warn", bad: "badge--bad", info: "badge--info", flat: "badge--neutral" }[diff.statusInfo.tone] || "badge--neutral";
      els.statusBadge.className = `badge ${toneClass}`;
      els.statusBadge.textContent = diff.statusInfo.label;
    }
    if (els.note) els.note.textContent = diff.statusInfo.note;

    if (els.planName) els.planName.textContent = `${diff.prior.planName} (${diff.prior.contractId}-${diff.prior.planId})`;
    if (els.nextName) {
      if (diff.next) els.nextName.textContent = `${diff.next.planName} (${diff.next.contractId}-${diff.next.planId})`;
      else if (diff.ambiguous) els.nextName.textContent = "More than one plan matches — see the note below";
      else els.nextName.textContent = `No ${meta.nextYear} successor plan`;
    }
    if (els.meta) {
      els.meta.textContent = `${diff.prior.orgName} · ${planTypeLabel(diff.prior)} · ${diff.prior.county}, ${diff.prior.state}`;
    }

    if (els.tbody) {
      if (diff.ambiguous) {
        els.tbody.innerHTML = `<tr><td colspan="4">We are not showing a comparison for this plan. See the note above.</td></tr>`;
      } else if (!diff.next) {
        els.tbody.innerHTML = `<tr><td colspan="4">This plan is not offered in ${meta.nextYear}. Use Medicare Plan Finder or your county's plan list to choose a replacement during Open Enrollment.</td></tr>`;
      } else {
        els.tbody.innerHTML = diff.metrics
          .map((m) => {
            const toneClass = TONE_CLASS[m.tone] || "cell-change--flat";
            const arrow = { up: "▲", down: "▼", added: "＋", removed: "✕", flat: "—", changed: "→", na: "" }[m.direction] || "";
            return `<tr>
              <th scope="row">${escapeHtml(m.label)}</th>
              <td class="num">${escapeHtml(m.priorText)}</td>
              <td class="num">${escapeHtml(m.nextText)}</td>
              <td class="num cell-change ${toneClass}">${arrow} ${escapeHtml(m.deltaText)}</td>
            </tr>`;
          })
          .join("");
      }
    }

    if (els.notes) {
      const notes = diff.notes || [];
      els.notes.innerHTML = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
      els.notes.hidden = notes.length === 0;
    }

    announce(
      `${diff.prior.planName}: ${diff.headline}` +
        (meta.sample ? " These are sample numbers, not real plan data." : "")
    );
    /* Only a pointer commit scrolls. This form has no submit button, so
       `change` on the plan <select> is the only path to a comparison — and on
       a keyboard that fires on every ArrowDown. Scrolling then carried the
       select the person is still operating right off the top of the screen.
       cola.js draws the same distinction for the same reason (presetIntent).
       The result is announced either way, so a screen-reader user loses
       nothing by the page staying put. */
    if (els.results && planIntent === "pointer") {
      els.results.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
    }
  }

  /* How the plan choice arrived: a click commits, an arrow key is still
     browsing. See the scroll guard in renderDiff. Submitting the form counts
     as a commit however it was triggered. */
  let planIntent = "keyboard";
  if (els.plan) {
    els.plan.addEventListener("pointerdown", () => { planIntent = "pointer"; });
    els.plan.addEventListener("keydown", () => { planIntent = "keyboard"; });
  }

  els.state && els.state.addEventListener("change", onState);
  els.county && els.county.addEventListener("change", onCounty);
  els.plan && els.plan.addEventListener("change", onPlan);
  els.planId && els.planId.addEventListener("change", onPlanIdEntry);
  els.planId && els.planId.addEventListener("blur", onPlanIdEntry);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    planIntent = "pointer"; // an explicit submit is a commit, however it arrived
    const typed = els.planId && String(els.planId.value || "").trim();
    if (typed) onPlanIdEntry();
    else onPlan();
  });
  const printBtn = $("pd-print");
  if (printBtn) printBtn.addEventListener("click", () => window.print());
  if (els.retryBtn) els.retryBtn.addEventListener("click", () => { loadData(); });

  const loaded = await loadData();

  // Column headers reflect the actual data years.
  if (loaded) {
    document.querySelectorAll("[data-year-current]").forEach((n) => (n.textContent = String(meta.currentYear)));
    document.querySelectorAll("[data-year-next]").forEach((n) => (n.textContent = String(meta.nextYear)));
  }
});
