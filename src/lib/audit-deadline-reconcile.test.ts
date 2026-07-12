// $0 GAUNTLET for D2-A — amendment-supersession deadline RECONCILIATION (Brain card 441, flag AUDIT_DEADLINE_RECONCILE).
// Run (reconciler + extractor, flag ON): AUDIT_DEADLINE_RECONCILE=true npx tsx src/lib/audit-deadline-reconcile.test.ts
//
// Charter: the V1 extractor took the FIRST offer-due-labeled date (stale original in an original+amendment concatenation)
// and the V4 renderer showed SAM + a stale doc date co-equal ("verify"). reconcileOfferDueDeadlines resolves the CONTROLLING
// (current) offer-due date honoring amendment supersession — dead-date exclusion, amendment-narrow (an amendment may move the
// deadline EARLIER), latest-wins — and returns the demoted priors for a labeled note. SAFETY RAIL (RULED, pinned below):
// display-only — a parsed doc date may NEVER close/expire a live solicitation; SAM stays authoritative for open/closed.
import { reconcileOfferDueDeadlines, extractDocumentDeadlines } from "./audit-deadline-extract";
import { offerDueFact } from "./v4-report/build-data";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const dl = (label: string, date: string) => ({ label, date });

// ── 1 · MULTI-AMENDMENT LATEST-WINS: orig → amd1 → amd2, controlling = the latest amendment ──
console.log("\n── 1 · multi-amendment latest-wins ──");
{
  const r = reconcileOfferDueDeadlines([
    dl("Offer due date (original)", "2026-06-24"),
    dl("Revised offer due date (Amendment 0001)", "2026-07-10"),
    dl("Revised offer due date (Amendment 0002)", "2026-07-31"),
  ]);
  assert(r.controlling?.date === "2026-07-31", "controlling = latest amendment (2026-07-31)");
  assert(r.supersession === true, "supersession detected");
  assert(r.demoted.some((d) => d.date === "2026-06-24") && r.demoted.some((d) => d.date === "2026-07-10"), "both priors demoted");
}

// ── 2 · OUT-OF-ORDER amendment dates: order in the array must not matter ──
console.log("\n── 2 · out-of-order amendment entries ──");
{
  const r = reconcileOfferDueDeadlines([
    dl("Revised offer due date (Amendment 0002)", "2026-07-31"),
    dl("Offer due date (original)", "2026-06-24"),
    dl("Revised offer due date (Amendment 0001)", "2026-07-10"),
  ]);
  assert(r.controlling?.date === "2026-07-31", "controlling still 2026-07-31 regardless of array order");
}

// ── 3 · EXTENSION-THEN-SHORTENING: an amendment moves the deadline EARLIER — the amended date wins, NOT the later original ──
console.log("\n── 3 · extension-then-shortening (amendment moves EARLIER) ──");
{
  const r = reconcileOfferDueDeadlines([
    dl("Offer due date (original)", "2026-07-31"),
    dl("Revised offer due date (Amendment 0001)", "2026-07-10"),
  ]);
  assert(r.controlling?.date === "2026-07-10", "amendment-narrow: the amended (earlier) date wins over the superseded later original");
  assert(r.demoted.some((d) => d.date === "2026-07-31"), "the later original is demoted (not controlling despite being later)");
}

// ── 4 · CANCELLATION / SUPERSEDED LATER date must be EXCLUDED (the FA487726 customer-fatal class) ──
console.log("\n── 4 · cancellation: a DEAD later date never controls ──");
{
  const r = reconcileOfferDueDeadlines([
    dl("Offer due date", "2026-07-10"),
    dl("Prior offer due date (superseded by Amendment 0005)", "2026-07-31"),
  ]);
  assert(r.controlling?.date === "2026-07-10", "dead-date exclusion: the live 07-10 controls, the superseded LATER 07-31 is dropped");
  assert(r.demoted.some((d) => d.date === "2026-07-31"), "the superseded date is demoted, not controlling");
}

// ── 5 · bd605b88 THREE-WAY ANCHOR: SAM 18 Jul (metadata) · doc 06-24 (stale) · doc reset 31 Jul ──
console.log("\n── 5 · bd605b88 three-way anchor ──");
{
  // The reconciler sees the DOCUMENT dates (SAM is applied at the renderer). Doc has the stale 06-24 + the amendment reset 31 Jul.
  const r = reconcileOfferDueDeadlines([
    dl("Offers due", "2026-06-24"),
    dl("Revised offers due (Amendment 0001)", "2026-07-31"),
  ]);
  assert(r.controlling?.date === "2026-07-31", "controlling doc date = the amendment reset 31 Jul (not the stale 06-24)");
  assert(r.demoted.some((d) => d.date === "2026-06-24"), "the stale 06-24 is demoted");
}

// ── 6 · SAFETY RAIL (PINNED, RULED): a parsed doc date may NEVER close/expire a live sol; reconciler is display-only ──
console.log("\n── 6 · SAFETY-RAIL pinned regression ──");
{
  // 6a — a lone DEAD/cancelled date must NOT become controlling (it would have "closed" the sol in the old bug). controlling=null.
  const dead = reconcileOfferDueDeadlines([dl("Prior proposal due date (superseded by Amendment 0005)", "2026-02-17")]);
  assert(dead.controlling === null, "a lone superseded/cancelled date → controlling NULL (never drives a close/expire)");
  // 6b — an interim milestone (site visit / PoP end) is never controlling.
  const interim = reconcileOfferDueDeadlines([dl("Period of performance end date", "2031-06-30"), dl("Site visit date", "2026-05-15")]);
  assert(interim.controlling === null, "interim/PoP/site-visit dates never control (no false 2031 'quote due')");
  // 6c — the reconciler returns only display data (controlling + demoted + supersession) — it has no open/closed field by construction.
  const r = reconcileOfferDueDeadlines([dl("Offers due", "2026-07-10")]);
  assert(!("open" in r) && !("closed" in r) && !("expired" in r), "reconciler carries NO open/closed/expired field — display-only (SAM stays authoritative)");
}

// ── 7 · NO-SUPERSESSION: a lone plain offer-due date → supersession=false (renderer keeps SAM authoritative) ──
console.log("\n── 7 · lone plain date → no supersession ──");
{
  const r = reconcileOfferDueDeadlines([dl("Offers due", "2026-07-10")]);
  assert(r.supersession === false, "a single plain offer-due date is not a supersession (renderer will not override SAM)");
}

// ── 8 · EXTRACTOR (flag ON) captures the rich label so the reconciler can read amendment context ──
console.log("\n── 8 · extractor rich-label capture (flag ON) ──");
{
  const src = [
    "COMBINED SYNOPSIS/SOLICITATION",
    "Offers are due: 2026-06-24 14:00 local time.",
    "AMENDMENT 0001 (SF-30)",
    "Revised offer due date: 2026-07-31 14:00 local time.",
  ].join("\n");
  const ex = extractDocumentDeadlines(src);
  const r = reconcileOfferDueDeadlines(ex);
  // flag ON ⇒ labels carry "Revised offer due date" → reconciler resolves 31 Jul as controlling.
  const flagOn = process.env.AUDIT_DEADLINE_RECONCILE === "true";
  if (flagOn) {
    assert(ex.some((e) => /revised/i.test(e.label)), "flag ON: extractor preserved the 'Revised offer due date' label");
    assert(r.controlling?.date === "2026-07-31", "end-to-end (extract→reconcile): controlling = 31 Jul amendment reset");
  } else {
    assert(ex.every((e) => e.label === "Offers due (from document)"), "flag OFF: constant label preserved (byte-identical)");
  }
}

// ── 9 · V4 RENDERER (offerDueFact) — the real masthead function on the live agentic_v3 path ──
console.log("\n── 9 · V4 renderer offerDueFact ──");
{
  const flagOn = process.env.AUDIT_DEADLINE_RECONCILE === "true";
  // bd605b88-shaped: SAM 18 Jul (response_deadline) · doc deadlines [06-24 stale, 31-Jul amendment reset].
  const sam = "2026-07-18T14:00:00-05:00";
  const cj = { deadlines: [dl("Offers due", "2026-06-24"), dl("Revised offers due (Amendment 0001)", "2026-07-31")] };
  const od = offerDueFact(sam, cj);
  if (flagOn) {
    assert(/31 Jul 2026/.test(od.value), "flag ON: masthead shows the CURRENT date (31 Jul), not the stale 18 Jul/06-24");
    assert(!!od.sub && /demoted/i.test(od.sub) && /18 Jul 2026/.test(od.sub) && /24 Jun 2026/.test(od.sub), "flag ON: SAM 18 Jul + doc 24 Jun demoted to a labeled note (never co-equal 'verify')");
    assert(!/verify/i.test(od.sub || ""), "flag ON: no co-equal 'verify' caveat when superseded");
    // lone plain doc date matching SAM → no override (SAM authoritative), no spurious note.
    const plain = offerDueFact(sam, { deadlines: [dl("Offers due", "2026-07-18")] });
    assert(/18 Jul 2026/.test(plain.value), "flag ON: lone plain date matching SAM → SAM value retained (no override)");
  } else {
    // flag OFF ⇒ byte-identical to the prior masthead: SAM value + the old 'verify' caveat.
    assert(/18 Jul 2026/.test(od.value), "flag OFF: masthead = SAM date (byte-identical)");
    assert(!!od.sub && /verify/i.test(od.sub), "flag OFF: the prior co-equal 'verify' caveat is unchanged (byte-identical)");
  }
}

// ── 10 · SAM-FLOOR GUARD (D-3, card #444/#448) — a controlling doc date EARLIER than SAM must NEVER win the masthead ──
console.log("\n── 10 · SAM-floor guard (earlier-than-SAM doc date never wins) ──");
{
  const flagOn = process.env.AUDIT_DEADLINE_RECONCILE === "true";
  // 64b79916 shape when the 31-Jul reset is IMAGE-ONLY (unextractable): deadlines carry only earlier dates, with
  // supersession evidence (≥2 distinct submission dates). SAM 18 Jul must keep the masthead; 06-24 must NOT win.
  const sam = "2026-07-18T14:00:00-05:00";
  const cj = { deadlines: [dl("Offers due", "2026-06-24"), dl("Offers due", "2026-06-10")] };
  const od = offerDueFact(sam, cj);
  if (flagOn) {
    assert(/18 Jul 2026/.test(od.value), "flag ON + SAM-floor: masthead = SAM 18 Jul (an earlier doc date 06-24 never wins)");
    assert(!/24 Jun 2026/.test(od.value) && !/10 Jun 2026/.test(od.value), "flag ON + SAM-floor: the stale earlier doc date is NOT the masthead value");
    assert(!!od.sub && /unreconciled/i.test(od.sub) && /verify/i.test(od.sub), "flag ON + SAM-floor: 'deadline unreconciled — verify the amendment' caveat (not a confident wrong date)");
    // control: the genuine-reset case (doc LATER than SAM) still wins — the guard only blocks earlier-than-SAM.
    const reset = offerDueFact(sam, { deadlines: [dl("Offers due", "2026-06-24"), dl("Revised offers due (Amendment 0001)", "2026-07-31")] });
    assert(/31 Jul 2026/.test(reset.value), "flag ON: a genuine LATER reset (31 Jul) still wins the masthead (floor blocks only earlier dates)");
  } else {
    assert(/18 Jul 2026/.test(od.value), "flag OFF: masthead = SAM date (byte-identical)");
  }
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
