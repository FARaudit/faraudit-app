// $0 pin for the NAMED NHR reason-line (Card #477 ruling 3, flag AUDIT_REASON_LINE_NAMED).
// Run: npx tsx src/lib/audit-decide-reason-line.test.ts
//
// When grounded eligibility bars drive the notice-body NHR, the reason NAMES them instead of the generic B3 boilerplate.
// Fixtures = the real 6a67c0f1 showStopper requirements (BOA/vehicle-holder + concluded site visit). Empty ⇒ null ⇒ the
// caller keeps the generic string (byte-identical).
import { namedEligibilityReason, clampToWord, dedupBandGates } from "./audit-decide";
import type { DecidedFinding } from "./audit-decide";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const mk = (requirement: string): DecidedFinding => ({ requirement, citation: "SAM Notice Body", excerpt: "", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "orchestrator", disposition: "disqualifying" } as unknown as DecidedFinding);

// The real 6a67c0f1 grounded bars.
const stoppers = [
  mk("Order restricted to vehicle HOLDERS ONLY (BOA/IDIQ/BPA/GWAC/MAS) stated in the SAM notice body — this ITO/order can only be proposed by an existing holder of the underlying vehicle; a firm that does not hold it CANNOT bid."),
  mk("Mandatory site visit stated in the SAM notice body was held/concluded may 28, 2026; attendance is non-retroactive — this BARS AWARD unless the firm's attendance at the concluded site visit is confirmed."),
];

console.log("── named reason from the real bars ──");
const reason = namedEligibilityReason(stoppers);
assert(!!reason, "produces a named reason (not null)");
assert(!/could not be confirmed as analyzed/.test(reason ?? ""), "does NOT use the generic B3 boilerplate");
assert(/HOLDERS ONLY|holder of the underlying vehicle/i.test(reason ?? ""), "names the vehicle-holder bar");
assert(/site visit/i.test(reason ?? "") && /concluded|may 28/i.test(reason ?? ""), "names the concluded site-visit bar");
assert(/\(1\)/.test(reason ?? "") && /\(2\)/.test(reason ?? ""), "enumerates the bars (1)…(2)");
console.log("  →", reason);

console.log("\n── card #480 — the vehicle-holder bar renders as a COMPLETE thought (no dangling '…holder of…') ──");
assert(!/holder of…|holder of \.|of…\./i.test(reason ?? ""), "does NOT end the clause on the dangling preposition 'holder of…' (the e8b616df blocker)");
assert(/existing holder of the underlying vehicle/i.test(reason ?? ""), "renders the full clause '…existing holder of the underlying vehicle' as a complete thought");
{
  // if a bar DOES elide (pathological long clause), it must not end on a function word before the ellipsis
  const veryLong = mk("Order restricted to holders only — " + "the offeror must be an existing holder of ".repeat(8) + "the vehicle and cannot otherwise bid");
  const r = namedEligibilityReason([veryLong]);
  assert(!/\s(?:of|the|a|an|to|by|for|in|on)…/i.test(r ?? ""), "on elision, no trailing dangling function-word before '…'");
}

console.log("\n── dedup: identical requirements collapse ──");
const dupReason = namedEligibilityReason([stoppers[0], mk(stoppers[0].requirement)]);
assert((dupReason?.match(/\(\d\)/g) || []).length === 1, "duplicate bar is deduped to a single entry");

console.log("\n── card #479 — a long requirement trims to a WORD BOUNDARY, never mid-word + fake period ──");
const longReason = namedEligibilityReason([mk(stoppers[1].requirement /* the ~200ch vehicle-holder bar */)]);
assert(!/ an e[.;]/.test(longReason ?? ""), "does NOT truncate mid-word to '…an e.' (the 69dbbe9e blocker)");
assert(!/[a-z]…?[.;] /.test((longReason ?? "").replace(/\bconfirm\b/g, "")) || /…/.test(longReason ?? ""), "long phrase carries an ellipsis, not a fake terminal period mid-word");
{
  const m = (longReason ?? "").match(/\(1\)\s(.+?)$/);
  const phrase = (m?.[1] ?? "").replace(/\.$/, "");
  const endsMidWord = /\b[a-z]$/i.test(phrase) && !/…$/.test(phrase) && phrase.length >= 155;
  assert(!endsMidWord, "phrase ends on a whole word or an explicit ellipsis, never a bare partial word");
}

console.log("\n── no bars ⇒ null (caller keeps generic string, byte-identical) ──");
assert(namedEligibilityReason([]) === null, "empty stoppers → null");
assert(namedEligibilityReason([mk("")]) === null, "blank-requirement stopper → null");

console.log("\n── card #479 class-regression — clampToWord never cuts mid-word / adds a fake period ──");
assert(clampToWord("short string", 100) === "short string", "under limit → as-is");
{
  const long = "this ITO order can only be proposed by an existing holder of the underlying vehicle and a firm that does not hold it cannot bid on this order at all whatsoever";
  const c = clampToWord(long, 140);
  assert(c.length <= 141 && c.endsWith("…"), "over limit → ends with an ellipsis");
  assert(!/ [a-z]…$/i.test(c) === false || / \S+…$/.test(c), "elision falls on a whole-word boundary");
  assert(!/[a-z]\.$/i.test(c), "no fake terminal period after a mid-word cut");
  const lastWord = c.replace(/…$/, "").trim().split(" ").pop() || "";
  assert(long.split(" ").includes(lastWord), `last kept token '${lastWord}' is a WHOLE source word (no mid-word split)`);
}

console.log("\n── card #480 band dedup — MAC-BOA + vehicle-holder collapse to ONE gate, both citations preserved ──");
const mkc = (requirement: string, citation: string, requiredAttribute?: string): DecidedFinding => ({ requirement, citation, excerpt: "", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "orchestrator", disposition: "disqualifying", ...(requiredAttribute ? { requiredAttribute } : {}) } as unknown as DecidedFinding);
const band = [
  mkc("This ITO is issued against a pre-existing Multiple Award Contract (MAC) Basic Ordering Agreement (BOA)", "Section L §1.1–1.2", "contract:MAC-BOA-holder"),
  mkc("Mandatory site visit stated in the SAM notice body was held/concluded may 28, 2026", "SAM Notice Body"),
  mkc("Order restricted to vehicle HOLDERS ONLY (BOA/IDIQ/BPA/GWAC/MAS) stated in the SAM notice body", "SAM Notice Body"),
];
{
  process.env.AUDIT_BAND_DEDUP = "true";
  const deduped = dedupBandGates(band);
  assert(deduped.length === 2, `band collapses 3 → 2 distinct gates (got ${deduped.length})`);
  const holderGate = deduped.find((f) => !/site visit/i.test(f.requirement)); // the collapsed MAC-BOA/vehicle-holder gate
  assert(!!holderGate, "the MAC-BOA/vehicle-holder gate survives as one bar");
  assert(/Section L/.test(holderGate?.citation ?? "") && /SAM Notice Body/.test(holderGate?.citation ?? ""), "BOTH citations preserved on the survivor (Section L + SAM Notice Body)");
  assert(deduped.some((f) => /site visit/i.test(f.requirement)), "the concluded-site-visit gate stays distinct");
}
{
  // red-team regression: a SITE-VISIT bar that ALSO mentions "MAC BOA Holders" must NOT collapse into the holder gate
  process.env.AUDIT_BAND_DEDUP = "true";
  const tricky = [
    mkc("This posting is for Tinker AFB - MAC BOA Holders ONLY. Mandatory site visit was held/concluded may 28, 2026", "SAM Notice Body"),
    mkc("Order restricted to vehicle HOLDERS ONLY (BOA/IDIQ/BPA/GWAC/MAS)", "SAM Notice Body"),
  ];
  const d2 = dedupBandGates(tricky);
  assert(d2.length === 2, "a site-visit bar mentioning 'MAC BOA Holders' stays DISTINCT from the holder bar (no false collapse)");
  assert(d2.some((f) => /site visit/i.test(f.requirement)), "the site-visit gate survives (checked first)");
}
{
  process.env.AUDIT_BAND_DEDUP = "";
  const off = dedupBandGates(band);
  assert(off.length === 3, "flag OFF: band unchanged (3) — byte-identical");
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : "❌ " + failures + " FAIL"} — named reason-line + band-dedup pin`);
process.exit(failures === 0 ? 0 : 1);
