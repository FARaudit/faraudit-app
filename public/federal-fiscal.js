/* THE FEDERAL FISCAL BOUNDARY — ONE DEFINITION, AND THIS IS IT.
 *
 * A federal fiscal year is NAMED FOR THE CALENDAR YEAR IT ENDS IN, and starts on
 * 1 October of the previous one: FY2026 runs 1 Oct 2025 through 30 Sep 2026. The
 * calendar year is therefore incremented ONLY from October onward, and that single
 * conditional is what this file exists to state once.
 *
 * Every surface that names a fiscal year or quarter derives it from here.
 */
(function (root) {
  "use strict";

  /** Month index of 1 October. The boundary, stated once. */
  var FY_START_MONTH = 9; // 0 = January

  /** The fiscal year a date falls in. Oct–Dec belong to the NEXT fiscal year. */
  function fyOf(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + (d.getMonth() >= FY_START_MONTH ? 1 : 0);
  }

  /** Federal quarter: Q1 Oct–Dec · Q2 Jan–Mar · Q3 Apr–Jun · Q4 Jul–Sep. */
  function quarterOf(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    var m = d.getMonth();
    return m >= FY_START_MONTH ? 1 : m <= 2 ? 2 : m <= 5 ? 3 : 4;
  }

  /** Local noon, so a date never shifts across a day boundary on a DST edge. */
  function at(y, m, d) { return new Date(y, m, d, 12, 0, 0); }

  /** 30 September of the fiscal year `fy` — the day that fiscal year's money closes. */
  function endOfFY(fy) { return at(fy, 8, 30); }

  /** 1 July of the fiscal year `fy` — the day its fourth quarter opens. */
  function startOfQ4(fy) { return at(fy, 6, 1); }

  /** Whole days from `now` to `when`, never negative. */
  function daysUntil(when, now) {
    return Math.max(0, Math.ceil((when.getTime() - now.getTime()) / 86400000));
  }

  /* THE OBLIGATION DEADLINE. The date and its label derive from ONE fiscal year and
   * are returned together — a caller cannot roll the date forward and leave the year
   * behind, which is the only way these two can disagree. */
  function obligationDeadline(now) {
    var n = now || new Date();
    var fy = fyOf(n);
    var when = endOfFY(fy);
    // Past 30 Sep the current FY has already closed; the next one to close is fy+1.
    if (when.getTime() < n.getTime()) { fy = fy + 1; when = endOfFY(fy); }
    return { fy: fy, when: when, days: daysUntil(when, n) };
  }

  /* Q4 runs 1 Jul – 30 Sep, and carries its STATE. A window already open reports the
   * time left in it; only a window that has not opened reports a start. "Begins" is
   * a false claim while the surge is running. */
  function q4Window(now) {
    var n = now || new Date();
    var fy = fyOf(n);
    var opens = startOfQ4(fy);
    var closes = endOfFY(fy);
    if (n.getTime() >= opens.getTime() && n.getTime() <= closes.getTime()) {
      return { fy: fy, state: "in-progress", when: closes, days: daysUntil(closes, n), opens: opens };
    }
    // Not inside it: the next Q4 to open belongs to whichever FY we are now in.
    // Before 1 Jul that is this FY; after 30 Sep, fyOf has already advanced.
    if (opens.getTime() < n.getTime()) { fy = fy + 1; opens = startOfQ4(fy); closes = endOfFY(fy); }
    return { fy: fy, state: "upcoming", when: opens, days: daysUntil(opens, n), opens: opens };
  }

  /** FY26 from 2026 — the two-digit form the card prints. */
  function shortFY(fy) { return "FY" + String(fy % 100).padStart(2, "0"); }

  var api = {
    FY_START_MONTH: FY_START_MONTH,
    fyOf: fyOf, quarterOf: quarterOf,
    endOfFY: endOfFY, startOfQ4: startOfQ4, daysUntil: daysUntil,
    obligationDeadline: obligationDeadline, q4Window: q4Window, shortFY: shortFY
  };

  // Browser asset: one global, no module system. Tests load it by evaluating the
  // file against a stub root, which is also how the browser gets it.
  root.FedFiscal = api;
})(typeof window !== "undefined" ? window : globalThis);
