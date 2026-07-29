(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════
  // Past Audits / Dashboard live wiring — NON-INVASIVE MODE.
  //
  // Principle: dashboard-design.html is the source of truth for STRUCTURE.
  // This script only updates DATA VALUES inside existing elements. Never
  // cloneNode, never replace structural wrappers, never change class names
  // on layout elements.
  //
  // What we update:
  //   - #ledgerBody innerHTML (the design's inline JS does this too, same pattern)
  //   - .kpi-val × 4 (textContent / innerHTML where the design itself uses inner HTML)
  //   - .dist-bar segment widths (inline style.width only)
  //   - .dist-legend .dl b textContent
  //   - .fbtn .n textContent
  //   - .page-header .sub innerHTML (it already contains <b>N records</b>)
  //   - #visCount textContent
  //   - #filters click handler (additive — runs AFTER inline handler;
  //     re-renders our live data on top of inline's static render)
  //   - th.sortable click handler (additive — same pattern)
  //   - .search input swap-on-click
  //   - tr click → /audit/{sol}
  // ═══════════════════════════════════════════════════════

  // ONE reset writer for the slicer set. Every place that clears filters calls
  // this — the slicer-bar #paClear, the no-match "clear filters" link, and the
  // STATE initializer below. Card #769 re-keyed the slicers (Status → Window,
  // Recommendation → the verdict rail) and updated #paClear but not the
  // no-match link, which kept resetting the retired rec/status keys and dropped
  // `window`. STATE.f.window became undefined, rowMatchesBar's
  // `f.window !== "all"` then rejected EVERY row, and syncSlicers hid the
  // working clear — so the control offering to rescue you from the empty state
  // emptied the ledger with no way back but a reload. Adding a slicer here
  // fixes every reset at once. Gated by public/_past-audits-filter-reset.test.ts.
  function defaultFilters() {
    return { time: "all", window: "all", agency: "all", type: "all", naics: "all", setAside: "all" };
  }

  var STATE = {
    rows: [],
    // card #769 — the verdict rail owns the verdict axis (one field, one control)
    seg: "all",
    f: defaultFilters(),
    // Default order: most recently audited first (CEO ruling 2026-07-28).
    // 'audited' sorts on age-hours; dir 1 = ascending age = newest first.
    sortKey: "audited",
    sortDir: 1,
    search: "",
    loadError: null
  };

  // ── Helpers ──
  function relativeAgo(iso) {
    if (!iso) return { label: "—", ageHours: Infinity };
    var ms = new Date(iso).getTime();
    if (isNaN(ms)) return { label: "—", ageHours: Infinity };
    var diffMs = Date.now() - ms;
    var ageHours = diffMs / 3600000;
    if (diffMs < 60 * 1000)                return { label: "just now",                                          ageHours: ageHours };
    if (diffMs < 60 * 60 * 1000)           return { label: Math.max(1, Math.round(diffMs / 60000)) + "m ago",   ageHours: ageHours };
    if (diffMs < 24 * 60 * 60 * 1000)      return { label: Math.round(diffMs / (60 * 60 * 1000)) + "h ago",     ageHours: ageHours };
    if (diffMs < 48 * 60 * 60 * 1000)      return { label: "Yesterday",                                         ageHours: ageHours };
    if (diffMs < 7 * 24 * 60 * 60 * 1000)  return { label: Math.round(diffMs / (24 * 60 * 60 * 1000)) + "d ago",ageHours: ageHours };
    if (diffMs < 30 * 24 * 60 * 60 * 1000) return { label: Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)) + "w ago", ageHours: ageHours };
    return { label: Math.round(diffMs / (30 * 24 * 60 * 60 * 1000)) + "mo ago", ageHours: ageHours };
  }

  // Card 366 Phase-1 — agency column. office_display is the buying-office code
  // (FA4427 60 CONS LGC), NOT the agency; the real agency is the last '·'
  // segment of the raw `agency` field. Normalize the common branches; else
  // Title-Case the cleaned segment.
  // Resolve any raw agency org-chain (dot- or middot-separated, e.g.
  // "Defense.Dept Of The Army.Amc.Acc.…419th Csb.W6qm Micc Fdo Ft Bragg") to a clean
  // 1-2 word agency — the RECOGNIZABLE agency, never the buying office / DoDAAC code.
  // Feeds both the Agency column cell AND the fAgency slicer (both read r.agency, so they match).
  function normalizeAgency(raw) {
    if (!raw) return "—";
    var s = String(raw);
    var u = s.toUpperCase();
    if (/\bSPACE FORCE\b/.test(u)) return "Space Force";
    if (/\bAIR FORCE\b/.test(u)) return "Air Force";
    if (/\bMARINE\b/.test(u)) return "Marine Corps";
    if (/\bNAV(Y|AL)\b/.test(u)) return "Navy";
    if (/\bARMY\b/.test(u)) return "Army";
    if (/GEOSPATIAL|\bNGA\b/.test(u)) return "NGA";
    if (/VETERANS|\bVA\b/.test(u)) return "VA";
    if (/FEDERAL AVIATION|\bFAA\b/.test(u)) return "FAA";
    if (/CUSTOMS AND BORDER|\bCBP\b|HOMELAND SECURITY/.test(u)) return "Homeland Security";
    if (/FOREST SERVICE/.test(u)) return "Forest Service";
    if (/AGRICULTURE/.test(u)) return "Agriculture";
    if (/ARCHITECT OF THE CAPITOL/.test(u)) return "Architect of the Capitol";
    if (/GENERAL SERVICES|\bGSA\b/.test(u)) return "GSA";
    if (/^DEFENSE[.·]/.test(u) || /\bDEFENSE\b/.test(u.split(/[.·]/)[0])) return "Defense";
    // Fallback: parent dept = first segment; strip DEPARTMENT/DEPT OF + trailing office/DoDAAC codes; Title-Case.
    var parent = s.split(/[.·]/)[0].trim();
    parent = parent.replace(/,?\s*DEPARTMENT OF\s*$/i, "").replace(/^DEPARTMENT OF\s+/i, "").replace(/^DEPT OF\s+/i, "").trim();
    parent = parent.replace(/\s*\b[A-Z0-9]{5,7}\b\s*$/, "").trim();
    var MAP = { "THE AIR FORCE": "Air Force", "THE ARMY": "Army", "THE NAVY": "Navy" };
    if (MAP[parent.toUpperCase()]) return MAP[parent.toUpperCase()];
    return parent.toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }) || "—";
  }

  // Card 366 Phase-1 — due (response_deadline) column, short readable date.
  function dueLabel(iso) {
    if (!iso) return "—";
    var ms = new Date(iso).getTime();
    if (isNaN(ms)) return "—";
    var d = new Date(ms);
    var MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return MO[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  // SIX-POLE VOCABULARY (ARC #747) — v3_verdict is the AUTHORITATIVE pole, read
  // FIRST; the legacy enums are consulted only for rows that predate it. Nothing
  // falls back to a sibling pole, and a score is not a verdict — the retired
  // score-band guess asserted decisions the engine never issued on every
  // INCOMPLETE / NEEDS_HUMAN_REVIEW row that carried a number.
  var POLE_REC = {
    BID: "Bid", BID_WITH_CAUTION: "Bid · caution", NO_BID: "No-bid", INELIGIBLE: "Ineligible",
    NEEDS_HUMAN_REVIEW: "Needs review", INCOMPLETE: "Incomplete", OUT_OF_SCOPE: "Out of scope"
  };
  function recommendationBucket(audit) {
    if ((audit.status || "").toLowerCase() !== "complete") return null;
    var pole = String(audit.v3_verdict || "").toUpperCase().replace(/[\s-]+/g, "_");
    if (POLE_REC[pole]) return POLE_REC[pole];
    if (pole) return "Unresolved"; // a pole we do not recognise — say so, never borrow a neighbour's word
    // Legacy rows only (no v3 pole recorded): these enums ARE engine-computed
    // for their era, so mapping them is faithful; guessing past them is not.
    var stored = (audit.recommendation || "").toUpperCase();
    if (stored === "PROCEED") return "Bid";
    if (stored === "PROCEED_WITH_CAUTION") return "Bid · caution";
    if (stored === "DECLINE") return "No-bid";
    var ev = String(audit.exec_verdict || "").toUpperCase().replace(/[\s_]+/g, "-");
    if (ev === "NO-BID" || ev === "NOBID") return "No-bid";
    if (ev === "CAUTION") return "Bid · caution";
    if (ev === "PROCEED" || ev === "GO" || ev === "BID") return "Bid";
    return null; // absent, not guessed — renders as an em dash
  }

  // ── card #769: ONE precedence chain owns the partition — verdict first, run
  // state second, never two independent fields. And ONE window derivation feeds
  // the row flag, the Deadline-passed tag, the Window slicer AND the Still Open
  // KPI (R9a) — the F6 bug was two code paths disagreeing on one field.
  var SEG = [
    { k: "bid", label: "Bid" }, { k: "caution", label: "Bid \u00b7 caution" },
    { k: "nobid", label: "No-bid" }, { k: "inelig", label: "Ineligible" },
    { k: "review", label: "Needs review" }, { k: "incomplete", label: "Incomplete" },
    { k: "inflight", label: "In flight" }, { k: "failed", label: "Run failed" }
  ];
  var SL = {}; SEG.forEach(function (s) { SL[s.k] = s.label; });
  var RECMAP = { "Bid": "bid", "Bid \u00b7 caution": "caution", "No-bid": "nobid", "Ineligible": "inelig", "Needs review": "review", "Incomplete": "incomplete" };
  function segOf(rec, status) {
    if (rec && RECMAP[rec]) return RECMAP[rec];
    return status === "failed" ? "failed" : "inflight";
  }
  function windowOf(dueTs) {
    if (dueTs === Infinity) return "none";
    return dueTs < Date.now() ? "passed" : "open";
  }

  function statusBucket(audit) {
    var s = (audit.status || "").toLowerCase();
    if (s === "complete") return "complete";
    if (s === "failed" || s === "error") return "failed";
    return "pending";
  }

  function mapAuditToRow(audit) {
    var ago = relativeAgo(audit.completed_at || audit.created_at);
    var dueTs = audit.response_deadline ? new Date(audit.response_deadline).getTime() : Infinity;
    var st = statusBucket(audit);
    // Card 366 Phase-2 needs-attention (LOGIC ONLY — visual is Design's): a failed
    // audit OR a live audit whose response deadline has already passed.
    // WIRE-MAP #456 Ruling 2 — expose the trigger so the row picks the reason:
    // failed → red status badge is the reason; deadline → keep truthful badge + amber tag.
    // card #769 R9a — needs-attention derives from the SAME windowOf/seg chain
    // as the tag, the Window slicer and the Still Open KPI (Design ruling
    // supersedes the earlier pending-only narrowing).
    var w = windowOf(dueTs);
    var attn = (st === "failed") || (w === "passed");
    var attnType = (st === "failed") ? "failed" : (w === "passed" ? "deadline" : null);
    return {
      // uuid is the row's OWN audit — row navigation uses it so a clicked row
      // opens that report, not the newest audit sharing its solicitation number.
      uuid:   String(audit.id || ""),
      id:     audit.solicitation_number || audit.notice_id || audit.id || "—",
      // Can the failed-state page actually offer a retry? It strips both retry
      // CTAs when the audit has no SAM notice behind it (upload-sourced,
      // notice_id "pdf-…") — see _render-states.ts. Mirrored here so a row
      // never advertises "Re-run" and lands on a page with nothing to click.
      retryable: !!audit.notice_id && !/^pdf-/i.test(String(audit.notice_id)),
      title:  (audit.title || "Untitled").trim(),
      agency: normalizeAgency(audit.agency),
      naics:  audit.naics_code || "—",
      setAside: audit.set_aside || "—",
      // Audited column shows the real date (CEO ruling 2026-07-28) — the
      // relative "1w ago" label is gone; age survives only for the time filter.
      date:   dueLabel(audit.completed_at || audit.created_at),
      age:    ago.ageHours,
      type:   audit.document_type || "—",
      due:    dueLabel(audit.response_deadline),
      dueTs:  dueTs,
      rec:    recommendationBucket(audit),
      status: st,
      _s:     segOf(recommendationBucket(audit), st),
      _w:     w,
      attn:   attn,
      attnType: attnType
    };
  }

  function esc(s) {
    if (s == null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Build the EXACT row markup the design's inline render() uses (verbatim copy).
  function buildRowHTML(a) {
    var slug = encodeURIComponent(a.uuid || a.id);
    var attnFlag = a.attn
      ? '<span class="attn-flag" title="Needs attention"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.3L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></span>'
      : "";
    var failed = a._s === "failed";
    var stInner = failed ? '<span class="failed-badge">RUN FAILED</span>'
      : (a.status === "pending" ? "running" : "complete");
    if (a._w === "passed") stInner += '<span class="deadline-tag">Deadline passed</span>';
    return '<tr data-pole="' + esc(a._s) + '" data-rec="' + esc(a.rec || "") + '" data-sol="' + esc(a.id) + '" data-uuid="' + esc(a.uuid) + '"' + (a.attn ? ' class="needs-attention" data-attn="' + esc(a.attnType) + '"' : "") + '>'
      + '<td class="cell-id">' + esc(a.id) + attnFlag + '</td>'
      + '<td class="cell-title" title="' + esc(a.title) + '">' + esc(a.title) + '</td>'
      + '<td class="cell-agency">' + esc(a.agency) + '</td>'
      + '<td>' + (a.type && a.type !== "\u2014" ? '<span class="doctype">' + esc(a.type) + '</span>' : '<span class="cell-date">\u2014</span>') + '</td>'
      + '<td class="cell-due">' + esc(a.due) + '</td>'
      + '<td class="cell-date">' + esc(a.date) + '</td>'
      + '<td><span class="vcell" data-pole="' + esc(a._s) + '"><i class="pd ' + esc(a._s) + '"></i>' + esc(SL[a._s]) + '</span></td>'
      + '<td><span class="stcell">' + stInner + '</span></td>'
      + '<td class="right"><a class="view-link" href="/audit/' + slug + '">' + (failed && a.retryable ? "Re-run" : "View") + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></td>'
      + '</tr>';
  }

  // ── Filter + sort + search pipeline ──
  function rowMatchesFilter(a) {
    return STATE.seg === "all" || a._s === STATE.seg;
  }
  // Card 366 Phase-2 filter bar — AND across time / agency / type / rec / status.
  function rowMatchesBar(a) {
    var f = STATE.f;
    if (f.time !== "all") {
      var maxH = f.time === "30" ? 720 : (f.time === "quarter" ? 2160 : 8760);
      if (!(a.age <= maxH)) return false;
    }
    if (f.window !== "all" && a._w !== f.window) return false;
    if (f.agency !== "all" && a.agency !== f.agency) return false;
    if (f.type   !== "all" && a.type   !== f.type)   return false;
    if (f.naics  !== "all" && a.naics  !== f.naics)  return false;
    if (f.setAside !== "all" && a.setAside !== f.setAside) return false;
    return true;
  }
  function rowMatchesSearch(a) {
    if (!STATE.search) return true;
    var q = STATE.search;
    // Placeholder promises "audits, notice IDs, NAICS…" — match notice/sol id, title, type, NAICS, agency.
    return (a.id     && a.id.toLowerCase().indexOf(q)    !== -1)
        || (a.title  && a.title.toLowerCase().indexOf(q) !== -1)
        || (a.type   && a.type.toLowerCase().indexOf(q)  !== -1)
        || (a.naics  && String(a.naics).toLowerCase().indexOf(q) !== -1)
        || (a.agency && a.agency.toLowerCase().indexOf(q) !== -1);
  }
  function sortedRows() {
    var copy = STATE.rows.slice();
    copy.sort(function (x, y) {
      if (STATE.sortKey === "date") {
        return STATE.sortDir * (x.age - y.age);
      }
      if (STATE.sortKey === "due") {
        return STATE.sortDir * (x.dueTs - y.dueTs);
      }
      if (STATE.sortKey === "audited") {
        return STATE.sortDir * (x.age - y.age);
      }
      if (STATE.sortKey === "agency" || STATE.sortKey === "type" || STATE.sortKey === "rec" || STATE.sortKey === "status") {
        var xa = (x[STATE.sortKey] || "").toString().toLowerCase();
        var ya = (y[STATE.sortKey] || "").toString().toLowerCase();
        return STATE.sortDir * xa.localeCompare(ya);
      }
      var xi = (x.id || "").toLowerCase();
      var yi = (y.id || "").toLowerCase();
      return STATE.sortDir * xi.localeCompare(yi);
    });
    return copy;
  }

  // ── Data writes (no structure changes) ──
  function writeTable() {
    var body = document.getElementById("ledgerBody");
    if (!body) return;
    // Rule 61 — a failed load is a VISIBLE failure state, never an empty ledger
    // (an empty ledger reads as "no audits yet", which the page cannot vouch for).
    if (STATE.loadError) {
      body.innerHTML = '<tr><td colspan="9" style="padding:36px 16px;text-align:center;color:var(--mute);font-size:13px">'
        + 'Could not load your audits (' + esc(STATE.loadError) + '). Reload to try again.'
        + '</td></tr>';
      var vce = document.getElementById("visCount");
      if (vce) vce.textContent = "";
      writeSelfCheck([]);
      return;
    }
    syncSlicers();
    var sorted = sortedRows();
    // Filter-bar + search define the working set the chips act on; chip narrows it.
    var mset = sorted.filter(function (a) { return rowMatchesSearch(a) && rowMatchesBar(a); });
    var visible = mset.filter(rowMatchesFilter);

    if (sorted.length === 0) {
      body.innerHTML = '<tr><td colspan="9" style="padding:36px 16px;text-align:center;color:var(--mute);font-size:13px">'
        + 'No audits yet — <a href="/audit" style="color:var(--blue-600);font-weight:600;text-decoration:none">run your first audit →</a>'
        + '</td></tr>';
    } else if (visible.length === 0) {
      // R10 — honest empty: name the combination, offer clear. Never a blank
      // region that looks like data loaded.
      body.innerHTML = '<tr><td colspan="9" style="padding:34px 18px;text-align:center">'
        + '<span style="display:block;font-size:13px;font-weight:700;color:var(--ink);margin-bottom:5px">No audits match this combination</span>'
        + '<span style="display:block;font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:var(--mute)">' + esc(describeFilters().join(" + ") || "no filters") + ' \u2014 <a href="#" class="cc-clear-filters" style="color:var(--blue-600);font-weight:600;text-decoration:none">clear filters</a></span>'
        + '</td></tr>';
    } else {
      body.innerHTML = visible.map(buildRowHTML).join("");
    }
    var vc = document.getElementById("visCount");
    if (vc) {
      var bits = describeFilters();
      vc.textContent = visible.length + " of " + STATE.rows.length + (bits.length ? " \u00b7 " + bits.join(" \u00b7 ") : "");
    }
    wireRowClicks();
    writeSelfCheck(visible);
  }

  // R6 — the filter description lands in the EXISTING readout; no second count.
  function describeFilters() {
    var bits = [];
    if (STATE.seg !== "all") bits.push(SL[STATE.seg]);
    if (STATE.f.window !== "all") bits.push({ open: "still open", passed: "window passed", none: "no due date" }[STATE.f.window]);
    ["agency", "type", "naics", "setAside"].forEach(function (k) { if (STATE.f[k] !== "all") bits.push(STATE.f[k]); });
    if (STATE.search) bits.push('"' + STATE.search + '"');
    return bits;
  }

  // card #769 C1–C5 — computed on every render so a broken port reports itself.
  function writeSelfCheck(visible) {
    var el = document.getElementById("integ");
    if (!el) return;
    if (STATE.loadError) { el.innerHTML = "Self-check suspended \u2014 audits could not be loaded."; return; }
    var rows = STATE.rows.filter(function (a) { return rowMatchesSearch(a) && rowMatchesBar(a); });
    var c = segCounts(rows);
    var railSum = SEG.reduce(function (a, g) { return a + c[g.k]; }, 0);
    var c1 = railSum === rows.length;
    var dbl = STATE.rows.filter(function (r) { return r.rec && RECMAP[r.rec] && (r.status === "failed" || r.status === "pending"); }).length;
    var c2 = dbl === 0;
    var rail = document.getElementById("poleRail"), c3 = true;
    if (rail) {
      var rr = rail.getBoundingClientRect();
      c3 = rail.scrollWidth <= rail.clientWidth + 1 && [].every.call(rail.querySelectorAll(".pole"), function (p) { var b = p.getBoundingClientRect(); return b.right <= rr.right + 1 && b.bottom <= rr.bottom + 1; });
    }
    // C4 \u2014 active states are TINTS over the unchanged card colour, never fills
    // (Design's isTint: low-alpha background OR low-alpha gradient layer over
    // the card colour). This was the check missing from the first port \u2014 named
    // in card #771; the count read "4 of 4" because this one wasn't running.
    var c4 = true;
    var inactive = document.querySelector("#poleRail .pole:not(.is-active)");
    if (inactive) {
      var cardBg = getComputedStyle(inactive).backgroundColor;
      var isTint = function (e) {
        var cs = getComputedStyle(e), m = cs.backgroundColor.match(/[\d.]+/g);
        var a = m ? (m.length > 3 ? parseFloat(m[3]) : 1) : 1;
        if (a <= 0.2) return true;
        var g = cs.backgroundImage.match(/rgba?\(([^)]*)\)/);
        if (!g) return false;
        var gm = g[1].split(",").map(parseFloat), ga = gm.length > 3 ? gm[3] : 1;
        return ga <= 0.2 && cs.backgroundColor === cardBg;
      };
      var act = document.querySelectorAll("#poleRail .pole.is-active, #paFilterbar .pa-slicer.is-active");
      c4 = [].every.call(act, isTint);
    }
    var pv = visible.filter(function (r) { return r._w === "passed"; }).length;
    var flagged = [].filter.call(document.querySelectorAll("#ledgerBody tr.needs-attention"), function (tr) { return tr.querySelector(".deadline-tag"); }).length;
    var c5 = flagged === pv;
    var checks = [c1, c2, c3, c4, c5];
    var pass = checks.filter(Boolean).length;
    el.innerHTML = "Self-check \u00b7 <b>" + pass + " of " + checks.length + "</b> computed checks pass"
      + (pass < checks.length ? ' \u00b7 <b style="color:var(--red-600)">' + (checks.length - pass) + " FAIL</b>" : "")
      + " \u2014 rail sums to the ledger count (" + railSum + "=" + rows.length + "), every row in exactly one segment, nothing clipped, active states are tints not fills, every passed deadline flagged (" + flagged + "/" + pv + ").";
  }

  function writeKPIs() {
    var kpis = document.querySelectorAll(".kpi-strip .kpi");
    function setKPI(i, val, footHTML) {
      if (!kpis[i]) return;
      var v = kpis[i].querySelector(".kpi-val");
      if (v) v.textContent = val;
      if (footHTML != null) {
        var f = kpis[i].querySelector(".foot");
        if (f) f.innerHTML = footHTML;
      }
    }
    // Rule 61 — on a failed load every KPI shows a dash, never a zero: "0 audits"
    // is a claim about the customer's history the page cannot make.
    if (STATE.loadError) {
      setKPI(0, "—", "could not load");
      setKPI(1, "—", "could not load");
      setKPI(2, "—", "could not load");
      setKPI(3, "—", "could not load");
      return;
    }
    var rows = STATE.rows;
    var c = segCounts(rows);
    var verdicts = c.bid + c.caution + c.nobid + c.inelig + c.review + c.incomplete;
    var open = rows.filter(function (r) { return r._w === "open"; }).length;
    var last30 = rows.filter(function (r) { return r.age <= 720; }).length;
    function pdi(k) { return '<i class="pd ' + k + '"></i>'; }
    setKPI(0, String(rows.length), "<b>" + last30 + "</b> in the last 30 days");
    // R4 — the aggregate names the poles it sums; no unnamed percentage, ever.
    setKPI(1, String(c.bid + c.caution), '<span class="agg"><span class="t">' + pdi("bid") + "Bid " + c.bid + '</span><span class="op">+</span><span class="t">' + pdi("caution") + "Bid\u00b7caution " + c.caution + '</span><span class="den">\u00b7 of ' + verdicts + ' with a verdict</span></span>');
    setKPI(2, String(c.nobid + c.inelig), '<span class="agg"><span class="t">' + pdi("nobid") + "No-bid " + c.nobid + '</span><span class="op">+</span><span class="t">' + pdi("inelig") + "Ineligible " + c.inelig + '</span><span class="den">\u00b7 committal declines</span></span>');
    setKPI(3, String(open), 'response window still open \u2014 <b>you can still bid</b>');
  }

  function writeDistribution() {
    var bar = document.getElementById("distBar") || document.querySelector(".dist-bar");
    if (!bar) return;
    if (STATE.loadError) { bar.innerHTML = ""; return; }
    var rows = STATE.rows.filter(function (a) { return rowMatchesSearch(a) && rowMatchesBar(a); });
    var c = segCounts(rows), total = rows.length || 1, h = "";
    SEG.forEach(function (g) {
      if (c[g.k]) h += '<span class="s-' + g.k + '" style="width:' + (c[g.k] / total * 100).toFixed(2) + '%" title="' + g.label + " " + c[g.k] + '"></span>';
    });
    bar.innerHTML = h;
  }

  function segCounts(rows) {
    var c = {}; SEG.forEach(function (g) { c[g.k] = 0; });
    rows.forEach(function (r) { c[r._s]++; });
    return c;
  }
  function renderRail() {
    var rail = document.getElementById("poleRail");
    if (!rail) return;
    var rows = STATE.rows.filter(function (a) { return rowMatchesSearch(a) && rowMatchesBar(a); });
    var c = segCounts(rows);
    var h = '<button class="pole' + (STATE.seg === "all" ? " is-active" : "") + '" data-seg="all"><span class="pl">All</span><span class="pn">' + (STATE.loadError ? "\u2014" : rows.length) + "</span></button>";
    SEG.forEach(function (g) {
      h += '<button class="pole' + (STATE.seg === g.k ? " is-active" : "") + '" data-seg="' + g.k + '"' + (c[g.k] === 0 ? ' data-empty="1"' : "")
        + (g.k === "inflight" ? ' title="Past this boundary: no verdict was issued"' : "")
        + '><i class="pd ' + g.k + '"></i><span class="pl">' + g.label + '</span><span class="pn">' + (STATE.loadError ? "\u2014" : c[g.k]) + "</span></button>";
    });
    rail.innerHTML = h;
    [].forEach.call(rail.querySelectorAll(".pole"), function (b) {
      b.addEventListener("click", function () {
        STATE.seg = (b.dataset.seg === "all" || STATE.seg === b.dataset.seg) ? "all" : b.dataset.seg;
        writeAll();
      });
    });
    // R3 — the band prints its own measured width + one-row threshold so a wrapped
    // rail is never mistaken for a defect.
    var rn = document.getElementById("railNote");
    if (rn) {
      var wrap0 = rail.style.flexWrap; rail.style.flexWrap = "nowrap";
      var natural = rail.scrollWidth; rail.style.flexWrap = wrap0;
      var railRows = Math.max(1, Math.round(rail.getBoundingClientRect().height / 39));
      var tbl = document.querySelector("table.dash"), twrap = document.querySelector(".table-wrap");
      rn.innerHTML = "Control band <b>" + rail.clientWidth + "px</b> \u00b7 one row at <b>\u2265" + natural + "px</b> \u00b7 "
        + (railRows === 1 ? "<b>one row</b> here" : "<b>" + railRows + " rows</b> here \u2014 the band is narrower than the rail needs, nothing is hidden")
        + (tbl && twrap ? " \u00b7 table needs <b>" + tbl.scrollWidth + "px</b>, has <b>" + twrap.clientWidth + "px</b>" : "");
    }
  }

  function writeHeaderSub() {
    var sub = document.querySelector(".page-header .sub");
    if (!sub) return;
    if (STATE.loadError) {
      sub.innerHTML = 'Your audit history could not be loaded — reload to try again.';
      return;
    }
    var n = STATE.rows.length;
    sub.innerHTML = 'Every solicitation FARaudit has audited for you — <b>'
      + n + ' record' + (n === 1 ? '' : 's') + '</b>, newest first.';
  }

  // Card #450 — live sidebar badge: replace the rail's hardcoded "15" on the
  // Past Audits item with the real OPEN count (response deadline not yet passed)
  // from the loaded audits. Client-side so no shared server-rail change; targets
  // the injectRail markup by href (rail renamed Past Audits → /past-audits).
  // WIRE-MAP #456 Ruling 3 — keep the neutral `count` badge; disambiguate "open" =
  // response-deadline-not-yet-passed, and bind open/total live with explanatory titles.
  function writeSidebarBadge() {
    if (STATE.loadError) return; // markup ships an empty badge — leave it empty, never "0"
    var open = STATE.rows.filter(function (r) { return r.dueTs !== Infinity && r.dueTs > Date.now(); }).length;
    var total = STATE.rows.length;
    var link = document.querySelector('.sb-icon[href="/past-audits"], .sb-icon[href="/dashboard"]');
    if (!link) return;
    link.setAttribute("title", "Past Audits — " + open + " open (response deadline not yet passed) of " + total + " total");
    var el = link.querySelector(".sb-badge");
    if (!el) {
      // The served rail renders no pill when it has no real number — create it
      // here, where the number exists.
      el = document.createElement("span");
      el.className = "sb-badge count";
      var label = link.querySelector(".sb-label");
      if (label && label.nextSibling) link.insertBefore(el, label.nextSibling);
      else link.appendChild(el);
    }
    el.style.display = "";
    el.textContent = String(open);
    el.setAttribute("title", open + " open — response deadline not yet passed (of " + total + " total)");
    var tip = link.querySelector(".sb-tip");
    if (tip) tip.textContent = "Past Audits · " + open + " open";
  }

  function writeAll() {
    populateFilterBar();
    writeSidebarBadge();
    // Card 366 Phase-2 — expose needs-attention count for a later Today rollup
    // (do NOT build Today here). failed OR deadline-passed.
    window.__paNeedsAttention = STATE.rows.filter(function (r) { return r.attn; }).length;
    writeKPIs();
    renderRail();
    writeDistribution();
    writeHeaderSub();
    writeTable();
  }

  // ── Wires — this script is the page's ONLY writer (the duplicate inline
  // wiring was removed; two listeners per control meant the last writer won
  // and the ARC #747 six-pole fix never reached the screen). ──
  // card #769 R1 — the chip row is deleted; the verdict rail (renderRail) owns
  // the verdict axis. No field is filterable from two controls.

  function wireSort() {
    document.querySelectorAll("th.sortable").forEach(function (th) {
      if (th.dataset.ccWired) return;
      th.dataset.ccWired = "1";
      th.addEventListener("click", function () {
        var k = th.dataset.sort;
        if (STATE.sortKey === k) {
          STATE.sortDir *= -1;
        } else {
          STATE.sortKey = k;
          // First click gives the intuitive order: newest first for date-like
          // columns, A→Z for text columns.
          STATE.sortDir = (k === "audited" || k === "date" || k === "due" || k === "id") ? 1 : 1;
        }
        document.querySelectorAll("th.sortable").forEach(function (x) {
          x.classList.remove("sorted");
          var a = x.querySelector(".arr");
          if (a) a.remove();
        });
        th.classList.add("sorted");
        var arr = document.createElement("span");
        arr.className = "arr";
        // For age-based keys dir=1 is newest-first — show ▼ for that (newest at top).
        var newestFirst = (k === "audited" || k === "date");
        arr.textContent = (STATE.sortDir === (newestFirst ? 1 : -1)) ? "▼" : "▲";
        th.appendChild(arr);
        writeTable();
      });
    });
  }

  function wireSearch() {
    var sb = document.querySelector(".search");
    if (!sb || sb.dataset.ccWired) return;
    sb.dataset.ccWired = "1";
    sb.style.cursor = "text";
    // Activate = swap the placeholder span for a live input that filters STATE.rows on keyup.
    // Invoked by BOTH a click on the search shelf AND ⌘K / Ctrl+K (the masthead hint).
    function activateSearch() {
      var existing = sb.querySelector(".cc-search-input");
      if (existing) { existing.focus(); return; }
      var placeholder = null;
      sb.querySelectorAll("span").forEach(function (s) {
        if (!s.classList.contains("kbd") && placeholder === null) placeholder = s;
      });
      if (!placeholder) return;
      var input = document.createElement("input");
      input.type = "text";
      input.className = "cc-search-input";
      input.placeholder = (placeholder.textContent || "").trim() || "Search audits…";
      input.style.cssText = "background:transparent;border:none;outline:none;color:inherit;font:inherit;flex:1;min-width:0;padding:0;margin:0;";
      placeholder.replaceWith(input);
      input.focus();
      input.addEventListener("keyup", function () {
        STATE.search = (input.value || "").trim().toLowerCase();
        writeTable();
      });
    }
    sb.addEventListener("click", activateSearch);
    window.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        activateSearch();
      } else if (e.key === "Escape") {
        var input = sb.querySelector(".cc-search-input");
        if (input && document.activeElement === input) {
          input.value = ""; STATE.search = ""; writeTable(); input.blur();
        }
      }
    });
  }

  function wireRowClicks() {
    document.querySelectorAll("#ledgerBody tr[data-sol]").forEach(function (row) {
      if (row.dataset.ccWired) return;
      row.dataset.ccWired = "1";
      // Navigate by the row's OWN audit uuid — a solicitation number audited more
      // than once resolves server-side to the NEWEST audit, which would silently
      // open a different report than the row the customer clicked.
      var target = row.getAttribute("data-uuid") || row.getAttribute("data-sol") || "";
      row.querySelectorAll(".view-link").forEach(function (link) {
        link.addEventListener("click", function (e) { e.stopPropagation(); });
      });
      row.style.cursor = "pointer";
      row.addEventListener("click", function () {
        if (target) window.location.href = "/audit/" + encodeURIComponent(target);
      });
    });
    var clear = document.querySelector(".cc-clear-filters");
    if (clear && !clear.dataset.ccWired) {
      clear.dataset.ccWired = "1";
      clear.addEventListener("click", function (e) {
        e.preventDefault();
        STATE.seg = "all";
        STATE.search = "";
        STATE.f = defaultFilters();
        document.querySelectorAll(".pa-filter").forEach(function (s) { s.value = "all"; });
        document.querySelectorAll(".fbtn").forEach(function (b) {
          b.classList.toggle("active", b.dataset.filter === "all");
        });
        var input = document.querySelector(".cc-search-input");
        if (input) input.value = "";
        writeAll();
      });
    }
  }

  // Card 366 Phase-2 — populate the dynamic filter-bar selects (agency/type)
  // from the live rows. Rec/Status/Time options are static in the markup.
  function populateFilterBar() {
    function distinct(key) {
      var seen = {}, out = [];
      STATE.rows.forEach(function (r) {
        var v = r[key];
        if (v != null && v !== "—" && !seen[v]) { seen[v] = 1; out.push(v); }
      });
      return out.sort();
    }
    // WIRE-MAP #456 Ruling 1 — set-aside decode: show the SAM display name, filter on the raw value.
    var SETASIDE_LABELS = { SBA: "Small Business", "8A": "8(a)", "8AN": "8(a)", HZC: "HUBZone", HZS: "HUBZone", SDVOSBC: "SDVOSB", SDVOSBS: "SDVOSB", WOSBC: "WOSB", WOSBSS: "WOSB", EDWOSBC: "EDWOSB", EDWOSBSS: "EDWOSB", VOSBC: "VOSB", VOSBS: "VOSB" };
    function setAsideLabel(v) { if (v == null || v === "—" || v === "" || v === "NONE" || v === "None" || v === "none") return "—"; return SETASIDE_LABELS[v] || v; }
    function fill(id, values, allLabel, labelFn) {
      var el = document.getElementById(id);
      if (!el) return;
      var cur = el.value;
      var opts = '<option value="all">' + allLabel + '</option>';
      values.forEach(function (v) { opts += '<option value="' + esc(v) + '">' + esc(labelFn ? labelFn(v) : v) + '</option>'; });
      el.innerHTML = opts;
      if (cur && (cur === "all" || values.indexOf(cur) !== -1)) el.value = cur;
    }
    // Window slicer options carry counts from the ONE windowOf derivation (R8)
    var wc = { open: 0, passed: 0, none: 0 };
    STATE.rows.forEach(function (r) { wc[r._w]++; });
    var fw = document.getElementById("fWindow");
    if (fw) {
      var cur = fw.value || "all";
      fw.innerHTML = '<option value="all">All windows</option>'
        + '<option value="open">Still open (' + wc.open + ')</option>'
        + '<option value="passed">Passed (' + wc.passed + ')</option>'
        + '<option value="none">No date (' + wc.none + ')</option>';
      fw.value = cur;
    }
    fill("fAgency", distinct("agency"), "All agencies");
    fill("fType", distinct("type"), "All types");
    // NAICS: bare code — no title in the audits row payload (WIRE-MAP fallback: "no title on file → bare code").
    fill("fNaics", distinct("naics"), "All NAICS");
    fill("fSetAside", distinct("setAside"), "All set-asides", setAsideLabel);
  }

  // WIRE-MAP #456 Ruling 1 — pill "active" state + Clear visibility. A slicer glows
  // blue when its value ≠ all; Clear appears only when ANY slicer / quick-chip / search
  // is constraining the set. Called from writeTable() so every re-render stays in sync.
  function syncSlicers() {
    var anyActive = false;
    document.querySelectorAll(".pa-filter").forEach(function (sel) {
      var active = sel.value !== "all" && sel.value !== "";
      if (active) anyActive = true;
      var slicer = sel.closest(".pa-slicer");
      if (slicer) slicer.classList.toggle("is-active", active);
    });
    if (STATE.seg && STATE.seg !== "all") anyActive = true;
    if (STATE.search && STATE.search !== "") anyActive = true;
    var clr = document.getElementById("paClear");
    if (clr) clr.hidden = !anyActive;
  }

  function wireFilterBar() {
    [["fTime", "time"], ["fWindow", "window"], ["fAgency", "agency"], ["fType", "type"], ["fNaics", "naics"], ["fSetAside", "setAside"]].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (!el || el.dataset.ccWired) return;
      el.dataset.ccWired = "1";
      el.addEventListener("change", function () {
        STATE.f[pair[1]] = el.value || "all";
        writeAll();
      });
    });
    var clr = document.getElementById("paClear");
    if (clr && !clr.dataset.ccWired) {
      clr.dataset.ccWired = "1";
      clr.addEventListener("click", function () {
        STATE.f = defaultFilters();
        STATE.seg = "all";
        STATE.search = "";
        document.querySelectorAll(".pa-filter").forEach(function (s) { s.value = "all"; });
        document.querySelectorAll(".fbtn").forEach(function (b) { b.classList.toggle("active", b.dataset.filter === "all"); });
        var input = document.querySelector(".cc-search-input");
        if (input) input.value = "";
        writeAll();
      });
    }
  }

  // ── Main ──
  async function wireDashboard() {
    // Attach additive listeners FIRST (before fetch).
    // Inline handlers are already in place from parse-time; ours run after.
    wireSort();
    wireSearch();
    wireFilterBar();

    // Loading state before the fetch — the markup ships placeholders, never numbers.
    var body = document.getElementById("ledgerBody");
    if (body) {
      body.innerHTML = '<tr><td colspan="9" style="padding:22px 12px;color:var(--mute)">Loading your audits…</td></tr>';
    }

    // Fetch and map. Rule 61 — a failed request becomes a VISIBLE failure state,
    // never an empty ledger and never zeroed KPIs ("0 audits" is a claim this
    // page cannot make when the request failed).
    var data;
    try {
      var r = await fetch("/api/audits?limit=200", { credentials: "include" });
      if (!r.ok) {
        console.warn("[dashboard-live] /api/audits returned", r.status);
        STATE.loadError = "HTTP " + r.status;
        STATE.rows = [];
      } else {
        data = await r.json();
        var audits = (data && data.audits) || [];
        STATE.loadError = null;
        STATE.rows = audits.map(mapAuditToRow);
      }
    } catch (e) {
      console.warn("[dashboard-live] fetch failed", e);
      STATE.loadError = (e && e.message) || "network error";
      STATE.rows = [];
    }

    // Write all data into existing elements
    writeAll();
    console.log("[dashboard-live] rendered " + STATE.rows.length + " audits" + (STATE.loadError ? " (LOAD ERROR: " + STATE.loadError + ")" : ""));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireDashboard);
  } else {
    wireDashboard();
  }
})();
