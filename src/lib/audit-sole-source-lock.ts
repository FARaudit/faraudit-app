// audit-sole-source-lock.ts
// ─────────────────────────────────────────────────────────────────────────────
// Brain card #746 · ④ CERT-5 sole-source lock → NHR-CONDITIONAL. Flag
// AUDIT_SOLE_SOURCE_LOCK (default-OFF, gated at the orchestrator + deriveVerdict).
//
// PURE, deterministic, title-anchored DETECTION of a named-vendor sole-source lock,
// plus the over-fire CARVE-OUT pre-gate — the actual work per the Tier-V design panel
// (card #746): "The real work is the over-fire guard (not the detection). A named
// vendor appears in many BIDDABLE solicitations."
//
// DANGER ASYMMETRY (governs every threshold below): a SPURIOUS carve-out that clears a
// REAL closed sole source to BID is worse than a MISSED lock (which just yields a normal
// verdict). And a FABRICATED vendor in a customer-facing reason is zero-tolerance. So:
//   • detection requires CORROBORATION for a title-only vendor (prose subject OR company
//     suffix OR J&A signal) — a bare "Sole Source to <Capitalized-word>" is NOT enough
//     (it captures purpose-verbs: "Sole Source to Maintain the Fleet"); and
//   • every carve-out fails toward KEEPING the lock (fire less readily), never toward
//     clearing it.
//
// GROUND TRUTH — T1 live run a7727dfc (SPRRA2-26-R-0034 "24K Environmental Control
// Unit (ECU) Sole Source to Raytheon"): the sole-source signal is NOT a classic J&A —
// the source carries NO "6.302" / "only known source" / "justification and approval"
// language at all. The signal is (a) the NOTICE TITLE / masthead "...Sole Source to
// Raytheon"; and (b) OFFEROR-OBLIGATION PROSE naming the vendor as the presumptive
// offeror ("Raytheon shall submit a mitigation plan"). The lens field
// `sole_source_named_vendor_raw` came back EMPTY (no prompt instruction) and is NOT
// relied on. This module keys on the STRUCTURED source signals instead — same doctrine
// as extractSoleSourceVendor / deriveSetAsideBackstop (deterministic, gate-testable).
// ─────────────────────────────────────────────────────────────────────────────

/** A detected named-vendor sole-source lock. Absent (null) ⇒ no lock signal. */
export interface SoleSourceLock {
  vendor: string;            // the extracted named vendor, e.g. "Raytheon" / "Raytheon Company"
  titleSignal: boolean;      // "sole source ... to <vendor>" in a title/masthead/prose line
  jaSignal: boolean;         // classic J&A / FAR 6.302 / only-known-source signal
  proseSignals: string[];    // vendor-as-offeror obligation excerpts (corroboration, up to 3)
  excerpt: string;           // the grounded excerpt that names the lock (for the report headline)
}

/** A reason the lock must NOT fire (the solicitation is in fact biddable). Absent ⇒ fire. */
export interface SoleSourceCarveOut {
  kind: "or_equal" | "intent_synopsis_5207" | "descriptive_incumbent" | "setaside_firm_qualifies" | "firm_is_vendor";
  reason: string;
  excerpt: string;
}

// ── vendor-name hygiene ──────────────────────────────────────────────────────
// A denylist can never be COMPLETE (any capitalized purpose-verb — Maintain, Sustain,
// Operate — would slip through), so it is a cheap first filter ONLY; the load-bearing
// guard is the CORROBORATION requirement in detectSoleSourceLock (a title-only vendor
// must also be a proper noun: prose subject OR company suffix). Checked case-INSENSITIVE
// so ALL-CAPS mastheads ("SOLE SOURCE TO BE DETERMINED") are covered.
const VENDOR_STOPWORDS = new Set([
  "THE", "THIS", "THAT", "THESE", "THOSE", "A", "AN", "ALL", "ANY", "AWARD", "CONTRACT",
  "CONTRACTOR", "OFFEROR", "OFFERORS", "VENDOR", "VENDORS", "GOVERNMENT", "AGENCY",
  "ACQUISITION", "PROCUREMENT", "PROVIDE", "PROVIDER", "PERFORM", "BE", "SUPPORT",
  "MEET", "SATISFY", "FULFILL", "FULFIL", "DELIVER", "FURNISH", "SUPPLY", "SOURCE", "SOURCES",
  "ONE", "ONLY", "SUCH", "THEIR", "ITS", "OUR",
  // common capitalized purpose-verbs that appear in Title-Case notice subjects
  "MAINTAIN", "ENSURE", "ESTABLISH", "OPERATE", "INSTALL", "REPAIR", "PRODUCE",
  "MANUFACTURE", "DEVELOP", "DESIGN", "BUILD", "OBTAIN", "ACQUIRE", "UPGRADE",
  "MODERNIZE", "SUSTAIN", "CONTINUE", "CONTINUED", "OVERHAUL", "REPLACE", "REMOVE",
]);

// Company-suffix vocabulary — used BOTH by the only-known-source name extractor AND by the
// corroboration gate (a title-only vendor is a real proper noun if it carries a suffix).
const COMPANY_SUFFIX = "(?:Inc|LLC|L\\.L\\.C|Corp|Corporation|Ltd|Co|Company|Industries|Aerospace|Avionics|Aviation|Systems|Technologies|Technology|Defense|Manufacturing|Engineering|Labs|Laboratories|Group|Holdings|Enterprises|Solutions|International|Associates|Partners)";
const COMPANY_SUFFIX_RE = new RegExp(`\\b${COMPANY_SUFFIX}\\b`, "i");

// "sole source ... to <VendorName>" — the primary signal (notice title/masthead + prose).
// The LITERAL "sole source"/"to" parts are made case-INSENSITIVE with EXPLICIT per-letter
// character classes ([Ss][Oo]…) — NOT inline (?i:…) flag groups, which parse under tsx/tsc
// but are REJECTED by the Next.js/webpack production build (ES2025 pattern-modifiers are not
// supported in that pipeline → "Invalid group" at module load, breaking the build even
// flag-OFF). This keeps ALL-CAPS DoD/DLA mastheads ("SOLE SOURCE TO RAYTHEON") matching while
// the vendor capture stays UPPERCASE-anchored ([A-Z], no /i flag) so a proper-noun head is
// required (a /i flag would let [A-Z] match "to be determined" → a false vendor). Multi-token
// continuation uses [ \t]+ (NOT \s+) so the name never crosses a newline into the next
// sentence; no "." in the token class so a sentence period is not absorbed.
const SOLE_SOURCE_TO_RE =
  /\b[Ss][Oo][Ll][Ee][-\s]?[Ss][Oo][Uu][Rr][Cc][Ee]\b[^.\n]{0,25}?\b[Tt][Oo][ \t]+([A-Z][A-Za-z0-9&'’\-]*(?:[ \t]+(?:[A-Z][A-Za-z0-9&'’\-]*|and|of|&|de|la)){0,4})/g;

// Classic J&A / FAR 6.302 / only-known-source structural signal (the OTHER trigger).
const JA_SIGNAL_RE =
  /\bJ&A\b|justification\s+and\s+approval|\b6\.302(?:-\d)?\b|only\s+(?:known\s+)?(?:responsible\s+)?source|single[-\s]source\s+(?:acquisition|award|justification)|no\s+other\s+source\s+(?:can|is\s+capable)/i;

// Legacy "only known source is <Vendor>" name extraction (belt for the J&A branch when the
// title lacks a "sole source to" phrasing). Company-suffix anchored. BOUNDED quantifiers
// ({0,60}/{1,60}) so it cannot backtrack quadratically on newline-poor extracted-PDF text.
const ONLY_SOURCE_NAME_RE = new RegExp(`only\\s+(?:known\\s+)?(?:responsible\\s+)?source[^.\\n]{0,60}?\\bis\\b[^.\\n]{0,20}?([A-Z][A-Za-z0-9 ,.&'\\-]{1,60}?${COMPANY_SUFFIX})\\b`, "i");

/** First proper-noun token of a vendor name (for prose corroboration: "Raytheon" of "Raytheon Company"). */
function vendorHead(vendor: string): string {
  return vendor.split(/\s+/)[0] ?? vendor;
}

function cleanVendor(raw: string): string | null {
  // strip trailing connectors/punctuation the greedy capture may have absorbed
  const v = raw.replace(/[\s,.;:'"()\-]+$/g, "").replace(/\s+(?:and|of|&|de|la)$/i, "").trim();
  if (!v) return null;
  const head = vendorHead(v);
  if (VENDOR_STOPWORDS.has(head.toUpperCase())) return null;
  if (head.length < 2) return null;              // "to X Inc" noise; ≥2 keeps "L3", "BAE"
  return v;
}

function hasCompanySuffix(vendor: string): boolean {
  return COMPANY_SUFFIX_RE.test(vendor);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect a named-vendor sole-source lock from the assembled source. Liberal on the SIGNAL
 * but STRICT on the vendor: a title-only vendor must be CORROBORATED (prose subject OR
 * company suffix) so a capitalized purpose-verb is never emitted as a fabricated vendor.
 * The carve-out pre-gate (soleSourceCarveOut) is the precision layer for biddability.
 * Returns null when no corroborated named-vendor sole-source signal is present.
 */
export function detectSoleSourceLock(source: string | null | undefined): SoleSourceLock | null {
  const src = source ?? "";
  if (!src) return null;

  // (1) TITLE / masthead / prose "sole source ... to <Vendor>" — the primary, structured signal.
  let vendor: string | null = null;
  let excerpt = "";
  let titleSignal = false;
  SOLE_SOURCE_TO_RE.lastIndex = 0;
  for (let m = SOLE_SOURCE_TO_RE.exec(src); m; m = SOLE_SOURCE_TO_RE.exec(src)) {
    const cand = cleanVendor(m[1]);
    if (cand) {
      vendor = cand;
      titleSignal = true;
      excerpt = m[0].replace(/\s+/g, " ").trim().slice(0, 200);
      break;
    }
  }

  // (2) J&A / only-known-source structural signal (the other independent trigger).
  const jaSignal = JA_SIGNAL_RE.test(src);
  if (!vendor && jaSignal) {
    const nm = src.match(ONLY_SOURCE_NAME_RE);
    if (nm) {
      const cand = cleanVendor(nm[1]);
      if (cand) { vendor = cand; excerpt = nm[0].replace(/\s+/g, " ").trim().slice(0, 200); }
    }
  }

  // FIRE gate part 1: a lock requires a NAMED VENDOR anchored to a real sole-source signal
  // (title OR J&A). Prose ("<Vendor> shall …") alone is NOT a trigger — too common
  // ("the offeror shall") — it only corroborates a vendor the title/J&A already named.
  if (!vendor || (!titleSignal && !jaSignal)) return null;

  // (3) Prose corroboration: the vendor as grammatical subject of an offeror-obligation verb.
  const proseSignals: string[] = [];
  const head = vendorHead(vendor);
  const proseRe = new RegExp(`\\b${escapeRe(head)}\\b\\s+(?:shall|will|must|is\\s+required\\s+to|intends?\\s+to|proposes?\\s+to|is\\s+expected\\s+to)\\b[^.\\n]{0,90}`, "gi");
  for (let m = proseRe.exec(src); m && proseSignals.length < 3; m = proseRe.exec(src)) {
    proseSignals.push(m[0].replace(/\s+/g, " ").trim().slice(0, 160));
  }

  // FIRE gate part 2 — CORROBORATION for a TITLE-ONLY vendor (no J&A structural signal).
  // A bare "Sole Source to <Capitalized-word>" is structurally indistinguishable from a
  // purpose-verb masthead ("Sole Source to Maintain the Fleet"); emitting it would fabricate
  // a customer-facing vendor. So a title-only vendor must ALSO be a proper noun: it carries a
  // company suffix, OR it appears as the subject of an offeror-obligation clause. J&A-anchored
  // vendors skip this (the J&A language is itself the corroboration). A miss here is a SAFE
  // under-fire (normal verdict), never a fabricated NHR.
  if (!jaSignal && proseSignals.length === 0 && !hasCompanySuffix(vendor)) return null;

  // ARC #747 · CEO option A — the SYNTHESIZED-EXCERPT FALLBACK IS DELETED.
  //
  // This line read:  if (!excerpt) excerpt = proseSignals[0] ?? `sole source to ${vendor}`;
  //
  // The second half composed a span out of the vendor's name when no real one was found, and the caller
  // (audit-decide.ts) passes that field straight through as `excerpt` alongside a hardcoded `grounded: true`.
  // So a manufactured quotation reached the customer marked as verbatim source. That is the exact defect
  // this arc exists to close, sitting inside the arc's own most recent shipped unit — and it silently
  // satisfies any "derived sentences must carry a grounded excerpt" rule, which is why the V2 design built
  // on top of it graded F.
  //
  // Now: no real span ⇒ NO LOCK. The failure direction is deliberate and matches the module's own doctrine
  // above — a missed lock is a SAFE under-fire (the run yields a normal verdict), whereas a fabricated
  // excerpt is a customer-facing fabrication with a quotation under it. Falling back to `proseSignals[0]` is
  // retained because that IS a real span lifted from the source; only the invented string is gone.
  if (!excerpt) excerpt = proseSignals[0] ?? "";
  if (!excerpt) return null;
  return { vendor, titleSignal, jaSignal, proseSignals, excerpt };
}

// ── over-fire CARVE-OUT pre-gate — the real work ─────────────────────────────
// Each carve-out is a solicitation-level SIGNAL that a named vendor appears but the buy
// is BIDDABLE. When any fires, the lock is SUPPRESSED and the verdict flows normally.
// EVERY carve-out fails toward KEEPING the lock (clearing a real closed sole source to BID
// is the worst outcome — worse than a false NHR).

// Brand-name-OR-EQUAL (permissive) — requires an actual "or equal"/"approved equal"
// PERMISSION token. NOT bare "salient characteristics": those appear in brand-name-ONLY /
// closed J&A specs too (the item's salient characteristics are described precisely BECAUSE
// no substitute is allowed), so keying on them would clear a real lock (finding #6/#8).
const OREQUAL_PERMISSION_RE = /\bor[-\s]equal\b|approved\s+equal|equivalent\s+(?:item|product|is\s+acceptable|will\s+be\s+accepted)|brand\s+name\s+or\s+equal/i;
const OREQUAL_RESTRICTIVE_RE = /\bno\s+(?:acceptable\s+)?substitut|\bbrand[-\s]?name\s+only\b|\bno\s+(?:or.?)?equals?\b|\bor[-\s]equal\b[^.\n]{0,30}\b(?:not\s+(?:permitted|allowed|authorized|accepted|acceptable|considered)|prohibit|will\s+not)|\bsubstitut\w*[^.\n]{0,20}\b(?:prohibit|not\s+(?:permitted|allowed|accepted|acceptable|authorized))|\bno\s+exceptions?\b|\b(?:mandatory|designated|directed)\s+source\b|non[-\s]?competit|directed\s+award/i;

// FAR 5.207 intent-to-sole-source synopsis that INVITES capability responses — the live
// chance to break the lock. NOTE (finding #1/#5/#7): "market research" and "sources sought"
// are MANDATORY content of every FAR 6.303-2 J&A ("market research confirmed only X is
// capable"; "no responses to the sources sought notice"), so those tokens are gated behind a
// co-required INVITE clause — bare presence is not a carve-out (it would clear a closed J&A).
const INTENT_SYNOPSIS_RE =
  /\b(?:notice|synopsis)\s+of\s+intent\b|intent\s+to\s+(?:sole[-\s]?source|negotiate|award|issue\s+a\s+sole)|\b5\.207\b|capabilit\w+\s+(?:statement|package|response)s?\b[^.\n]{0,80}(?:consider|submit|welcome|invited|respond|entertain)|(?:responses?|submissions?)\b[^.\n]{0,50}\b(?:will\s+be\s+)?(?:consider|entertain)|any\s+(?:responsible|interested|capable)\s+(?:source|offeror|business|party|firm|concern)\b[^.\n]{0,80}(?:may\s+(?:submit|respond|identify)|considered|invited)|(?:market\s+research|sources[-\s]sought)\b[^.\n]{0,80}(?:invite|submit\s+a\s+capabilit|respond\s+by|capabilit\w+\s+(?:statement|package|response)|will\s+be\s+consider|may\s+(?:submit|respond|identify))/i;

// Descriptive-incumbent mention on an OPEN recompete (vendor named as the current
// contractor, not as the addressee of the buy).
const INCUMBENT_RE = /\bincumbent\b|current\s+(?:contractor|provider|awardee|vendor|supplier)|presently\s+(?:performed|held|provided)|predecessor\s+contract/i;
const COMPETITIVE_FRAME_RE = /full[-\s]and[-\s]open|competitive\s+(?:procurement|acquisition|solicitation|proposal)|set[-\s]aside|100%\s+small\s+business|unrestricted\s+competition/i;

// Positive set-aside program in source (canonical SAM token or a source-grounded clause).
const SETASIDE_CLAUSE_RE = /\b52\.219-(?:6|7|14|27|29|30|3|33)\b|total\s+small\s+business\s+set[-\s]aside|100%\s+set[-\s]aside|(?:8\(a\)|SDVOSB|HUBZone|WOSB|EDWOSB|service[-\s]disabled\s+veteran)\b[^.\n]{0,40}set[-\s]aside/i;
const SETASIDE_PROGRAM_TOKENS = /^(?:8A|8\(A\)|SDVOSB|SDVOSBC|HUBZONE|HZ|HZC|WOSB|EDWOSB|WOSBSS|SBA|SBP|SB|TOTAL_SMALL_BUSINESS|SMALL_BUSINESS)/i;

/**
 * The over-fire pre-gate. Returns the FIRST carve-out that fires (the lock is biddable →
 * suppress), or null (the lock stands → NHR-conditional). Pure; $0 gate-testable.
 */
export function soleSourceCarveOut(
  lock: SoleSourceLock,
  source: string | null | undefined,
  opts?: { samSetAside?: string | null; firmIdentity?: string | null },
): SoleSourceCarveOut | null {
  const src = source ?? "";
  // A vendor asserted by the TITLE ("sole source to X") or bearing OFFEROR OBLIGATIONS
  // ("X shall submit") is a DIRECTED award — descriptive/incidental-mention carve-outs
  // (descriptive_incumbent, setaside_firm_qualifies) must not clear it (findings #9): an
  // 8(a)/SDVOSB SOLE-SOURCE directed award IS a real lock even though a set-aside is present.
  const directedAward = lock.titleSignal || lock.proseSignals.length > 0;

  // (a) FIRM IS THE VENDOR — the customer's own firm is the named awardee. Requires a firm
  //     identity operand, which the production BidderProfile deliberately does NOT carry
  //     (name/UEI/CAGE excluded by the safety contract). So under a null/anonymous profile
  //     this NEVER fires — correct: the lock stands as a CONDITIONAL "if your firm is not
  //     <vendor>, no-bid — confirm". Only a caller that supplies firmIdentity can clear it.
  const firmId = (opts?.firmIdentity ?? "").trim();
  if (firmId && new RegExp(`\\b${escapeRe(vendorHead(lock.vendor))}\\b`, "i").test(firmId)) {
    return { kind: "firm_is_vendor", reason: `Your firm (${firmId}) is the named vendor (${lock.vendor}) — this sole source is award TO you.`, excerpt: firmId };
  }

  // (b) BRAND-NAME OR EQUAL — a permissive spec you can meet with an approved equal. Requires
  //     an "or equal" PERMISSION token and NO restrictive/no-substitution veto.
  if (OREQUAL_PERMISSION_RE.test(src) && !OREQUAL_RESTRICTIVE_RE.test(src)) {
    const m = src.match(OREQUAL_PERMISSION_RE);
    return { kind: "or_equal", reason: `Brand-name-or-equal spec — an approved equal meeting the salient characteristics is biddable; this is not a closed sole source.`, excerpt: (m?.[0] ?? "or equal").slice(0, 160) };
  }

  // (c) FAR 5.207 INTENT-TO-SOLE-SOURCE SYNOPSIS that invites capability responses — a live
  //     chance to break the lock. NOT a closed award.
  const intent = src.match(INTENT_SYNOPSIS_RE);
  if (intent) {
    return { kind: "intent_synopsis_5207", reason: `Intent-to-sole-source synopsis (FAR 5.207-class) invites capability responses — submit a capability statement to challenge the lock before it closes.`, excerpt: intent[0].replace(/\s+/g, " ").trim().slice(0, 160) };
  }

  // (d) DESCRIPTIVE INCUMBENT on an OPEN recompete — the vendor is named as the current
  //     contractor, not as the addressee of the buy. Only when NOT a directed award.
  if (!directedAward && INCUMBENT_RE.test(src) && COMPETITIVE_FRAME_RE.test(src)) {
    const m = src.match(INCUMBENT_RE);
    return { kind: "descriptive_incumbent", reason: `The vendor is named only as the incumbent on an open/competitive recompete — the award is competed, not sole-sourced.`, excerpt: (m?.[0] ?? "incumbent").slice(0, 160) };
  }

  // (e) SET-ASIDE the firm can pursue (the T2 SDVOSB/8(a) mirror) — a positive set-aside
  //     program co-occurring with a PURELY INCIDENTAL vendor mention. The set-aside POOL is
  //     the biddable path. GUARDED by !directedAward: an 8(a)/SDVOSB SOLE-SOURCE DIRECTED
  //     award (title or offeror-obligation prose naming the vendor) is a real lock under a
  //     set-aside authority, NOT a competitive pool → must NOT be cleared (finding #9).
  if (!directedAward) {
    const samSA = (opts?.samSetAside ?? "").trim();
    const samSetAsidePositive = !!samSA && samSA.toUpperCase() !== "NONE" && SETASIDE_PROGRAM_TOKENS.test(samSA);
    const clauseSetAside = SETASIDE_CLAUSE_RE.exec(src);
    if (samSetAsidePositive || clauseSetAside) {
      return { kind: "setaside_firm_qualifies", reason: `A set-aside program${samSetAsidePositive ? ` (${samSA})` : ""} is present and the vendor is only incidentally named — the set-aside pool is the biddable path.`, excerpt: (clauseSetAside?.[0] ?? samSA).slice(0, 160) };
    }
  }

  return null;
}
