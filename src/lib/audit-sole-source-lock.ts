// audit-sole-source-lock.ts
// ─────────────────────────────────────────────────────────────────────────────
// Brain card #746 · ④ CERT-5 sole-source lock → NHR-CONDITIONAL. Flag
// AUDIT_SOLE_SOURCE_LOCK (default-OFF, gated at the orchestrator + deriveVerdict).
//
// PURE, deterministic, title-anchored DETECTION of a named-vendor sole-source lock,
// plus the over-fire CARVE-OUT pre-gate — the actual work per the Tier-V design panel
// (card #746): "The real work is the over-fire guard (not the detection). A named
// vendor appears in many BIDDABLE solicitations." Detection fires LIBERALLY (recall);
// the carve-out SUPPRESSES the over-fires (precision).
//
// GROUND TRUTH — T1 live run a7727dfc (SPRRA2-26-R-0034 "24K Environmental Control
// Unit (ECU) Sole Source to Raytheon"): the sole-source signal is NOT a classic J&A —
// the source carries NO "6.302" / "only known source" / "justification and approval"
// language at all. The signal is:
//   (a) the NOTICE TITLE / masthead line: "...Sole Source to Raytheon"; and
//   (b) OFFEROR-OBLIGATION PROSE naming the vendor as the presumptive offeror:
//       "Raytheon shall submit a mitigation plan", "if Raytheon intends to subcontract".
// The lens field `sole_source_named_vendor_raw` came back EMPTY (the compliance-lens
// prompt never instructed the model to fill it) and is therefore NOT relied on. This
// module keys on the STRUCTURED source signals instead — the same doctrine as
// extractSoleSourceVendor / deriveSetAsideBackstop (deterministic, gate-testable).
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
// Reject bare common nouns that follow "sole source to" but are not a company (e.g.
// "the Government", "a single source"). A proper-noun HEAD is required by the capture
// regex ([A-Z] first letter); this list rejects capitalized non-vendors.
const VENDOR_STOPWORDS = new Set([
  "The", "This", "That", "These", "Those", "A", "An", "All", "Any", "Award", "Contract",
  "Contractor", "Offeror", "Offerors", "Vendor", "Vendors", "Government", "Agency",
  "Acquisition", "Procurement", "Provide", "Provider", "Perform", "Be", "Support",
  "Meet", "Satisfy", "Fulfill", "Deliver", "Furnish", "Supply", "Source", "Sources",
  "One", "Only", "Such", "Their", "Its", "Our", "Fulfil",
]);

// "sole source ... to <VendorName>" — the primary signal (notice title/masthead + prose).
// Lazy 0-25 chars between "source" and "to" absorbs "-source award", "source contract",
// etc. The vendor head must be Capitalized; connectors (and/of/&/Company suffixes) may
// follow. Bounded to a single line ([^.\n]) so it never spills across the masthead break.
const SOLE_SOURCE_TO_RE =
  // Case-tolerant on the LITERAL "sole source"/"to" parts (masthead is Title Case) but the
  // vendor capture stays UPPERCASE-anchored ([A-Z]) so a proper-noun head is required — do
  // NOT use the /i flag, which would let [A-Z] match "to be determined" → a false vendor.
  // Multi-token continuation uses [ \t]+ (NOT \s+) so the vendor name never crosses a newline
  // into the next sentence ("...to Raytheon\nThe Government..." → "Raytheon", not the run-on); and
  // no "." in the token class so a sentence period ("Acme Systems. Brand...") is not absorbed.
  /\b[Ss]ole[-\s]?[Ss]ource\b[^.\n]{0,25}?\b[Tt]o[ \t]+([A-Z][A-Za-z0-9&'’\-]*(?:[ \t]+(?:[A-Z][A-Za-z0-9&'’\-]*|and|of|&|de|la)){0,4})/g;

// Classic J&A / FAR 6.302 / only-known-source structural signal (the OTHER trigger).
const JA_SIGNAL_RE =
  /\bJ&A\b|justification\s+and\s+approval|\b6\.302(?:-\d)?\b|only\s+(?:known\s+)?(?:responsible\s+)?source|single[-\s]source\s+(?:acquisition|award|justification)|no\s+other\s+source\s+(?:can|is\s+capable)/i;

// Legacy "only known source is <Vendor>" name extraction (belt for the J&A branch when the
// title lacks a "sole source to" phrasing). Company-suffix anchored (unlike the title path).
const COMPANY_SUFFIX = "(?:Inc|LLC|L\\.L\\.C|Corp|Corporation|Ltd|Co|Company|Industries|Aerospace|Avionics|Aviation|Systems|Technologies|Technology|Defense|Manufacturing|Engineering|Labs|Laboratories|Group)";
const ONLY_SOURCE_NAME_RE = new RegExp(`only\\s+(?:known\\s+)?(?:responsible\\s+)?source[^.\\n]*?\\bis\\b[^.\\n]*?([A-Z][A-Za-z0-9 ,.&'\\-]+?${COMPANY_SUFFIX})\\b`, "i");

/** First proper-noun token of a vendor name (for prose corroboration: "Raytheon" of "Raytheon Company"). */
function vendorHead(vendor: string): string {
  return vendor.split(/\s+/)[0] ?? vendor;
}

function cleanVendor(raw: string): string | null {
  // strip trailing connectors/punctuation the greedy capture may have absorbed
  let v = raw.replace(/[\s,.;:'"()\-]+$/g, "").replace(/\s+(?:and|of|&|de|la)$/i, "").trim();
  if (!v) return null;
  const head = vendorHead(v);
  if (VENDOR_STOPWORDS.has(head)) return null;
  if (head.length < 3) return null;              // "to X Inc" noise
  return v;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect a named-vendor sole-source lock from the assembled source. Liberal by design —
 * the carve-out pre-gate (soleSourceCarveOut) is the precision layer. Returns null when
 * no named-vendor sole-source signal is present.
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

  // FIRE gate: a lock requires a NAMED VENDOR anchored to a real sole-source signal
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

  if (!excerpt) excerpt = proseSignals[0] ?? `sole source to ${vendor}`;
  return { vendor, titleSignal, jaSignal, proseSignals, excerpt };
}

// ── over-fire CARVE-OUT pre-gate — the real work ─────────────────────────────
// Each carve-out is a solicitation-level SIGNAL that a named vendor appears but the buy
// is BIDDABLE. When any fires, the lock is SUPPRESSED and the verdict flows normally.

// Brand-name-OR-EQUAL (permissive) — mirror of audit-decide's OREQUAL_RE / restrictive veto.
const OREQUAL_RE = /\bor[-\s]equal\b|salient characteristic|prove(?:n)? equivalen|approved equal|brand name or equal/i;
const OREQUAL_RESTRICTIVE_RE = /\bno\s+(?:acceptable\s+)?substitut|\bbrand[-\s]?name\s+only\b|\bno\s+(?:or.?)?equals?\b|\bor[-\s]equal\b[^.\n]{0,30}\b(?:not\s+(?:permitted|allowed|authorized|accepted|acceptable|considered)|prohibit|will\s+not)|\bsubstitut\w*[^.\n]{0,20}\b(?:prohibit|not\s+(?:permitted|allowed|accepted|acceptable|authorized))|\bno\s+exceptions?\b|\b(?:mandatory|designated|directed)\s+source\b|non[-\s]?competit|directed\s+award/i;

// FAR 5.207 intent-to-sole-source synopsis that INVITES capability responses — the live
// chance to break the lock (the best small-biz play).
const INTENT_SYNOPSIS_RE =
  /\b(?:notice|synopsis)\s+of\s+intent\b|intent\s+to\s+(?:sole[-\s]?source|negotiate|award|issue\s+a\s+sole)|\b5\.207\b|sources[-\s]sought|market\s+research|capabilit\w+\s+(?:statement|package|response)s?\b[^.\n]{0,80}(?:consider|submit|welcome|invited|respond|entertain)|(?:responses?|submissions?)\b[^.\n]{0,50}\b(?:will\s+be\s+)?(?:consider|entertain)|any\s+(?:responsible|interested|capable)\s+(?:source|offeror|business|party|firm|concern)\b[^.\n]{0,80}(?:may\s+(?:submit|respond|identify)|considered|invited)/i;

// Descriptive-incumbent mention on an OPEN recompete (vendor named as the current
// contractor, not as the addressee of the buy).
const INCUMBENT_RE = /\bincumbent\b|current\s+(?:contractor|provider|awardee|vendor|supplier)|presently\s+(?:performed|held|provided)|predecessor\s+contract/i;
const COMPETITIVE_FRAME_RE = /full[-\s]and[-\s]open|competitive\s+(?:procurement|acquisition|solicitation|proposal)|set[-\s]aside|100%\s+small\s+business|unrestricted\s+competition/i;

// Positive set-aside program in source (the T2 SDVOSB/8(a) mirror — a set-aside must
// never be killed by a co-occurring vendor mention; the set-aside pool is the biddable path).
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

  // (a) FIRM IS THE VENDOR — the customer's own firm is the named awardee. Requires a firm
  //     identity operand, which the production BidderProfile deliberately does NOT carry
  //     (name/UEI/CAGE excluded by the safety contract). So under a null/anonymous profile
  //     this NEVER fires — correct: the lock stands as a CONDITIONAL "if your firm is not
  //     <vendor>, no-bid — confirm". Only a caller that supplies firmIdentity can clear it.
  const firmId = (opts?.firmIdentity ?? "").trim();
  if (firmId && new RegExp(`\\b${escapeRe(vendorHead(lock.vendor))}\\b`, "i").test(firmId)) {
    return { kind: "firm_is_vendor", reason: `Your firm (${firmId}) is the named vendor (${lock.vendor}) — this sole source is award TO you.`, excerpt: firmId };
  }

  // (b) BRAND-NAME OR EQUAL — a permissive spec you can meet with an approved equal.
  if (OREQUAL_RE.test(src) && !OREQUAL_RESTRICTIVE_RE.test(src)) {
    const m = src.match(OREQUAL_RE);
    return { kind: "or_equal", reason: `Brand-name-or-equal spec — an approved equal meeting the salient characteristics is biddable; this is not a closed sole source.`, excerpt: (m?.[0] ?? "or equal").slice(0, 160) };
  }

  // (c) FAR 5.207 INTENT-TO-SOLE-SOURCE SYNOPSIS that invites capability responses — a live
  //     chance to break the lock. NOT a closed award.
  const intent = src.match(INTENT_SYNOPSIS_RE);
  if (intent) {
    return { kind: "intent_synopsis_5207", reason: `Intent-to-sole-source synopsis (FAR 5.207-class) invites capability responses — submit a capability statement to challenge the lock before it closes.`, excerpt: intent[0].replace(/\s+/g, " ").trim().slice(0, 160) };
  }

  // (d) DESCRIPTIVE INCUMBENT on an OPEN recompete — the vendor is named as the current
  //     contractor, not as the addressee of the buy. Excluded when the TITLE asserts the lock
  //     ("sole source to X") or the vendor bears offeror obligations ("X shall submit") — those
  //     are a real lock, not a descriptive mention.
  if (!lock.titleSignal && lock.proseSignals.length === 0 && INCUMBENT_RE.test(src) && COMPETITIVE_FRAME_RE.test(src)) {
    const m = src.match(INCUMBENT_RE);
    return { kind: "descriptive_incumbent", reason: `The vendor is named only as the incumbent on an open/competitive recompete — the award is competed, not sole-sourced.`, excerpt: (m?.[0] ?? "incumbent").slice(0, 160) };
  }

  // (e) SET-ASIDE the firm can pursue (the T2 SDVOSB/8(a) mirror) — a positive set-aside
  //     program co-occurring with a vendor mention. The set-aside POOL is the biddable path;
  //     a vendor lock must never suppress a set-aside. SAM's setAside metadata is authoritative;
  //     a source-grounded set-aside clause is the belt.
  const samSA = (opts?.samSetAside ?? "").trim();
  const samSetAsidePositive = !!samSA && samSA.toUpperCase() !== "NONE" && SETASIDE_PROGRAM_TOKENS.test(samSA);
  const clauseSetAside = SETASIDE_CLAUSE_RE.exec(src);
  if (samSetAsidePositive || clauseSetAside) {
    return { kind: "setaside_firm_qualifies", reason: `A set-aside program${samSetAsidePositive ? ` (${samSA})` : ""} is present — the set-aside pool is the biddable path; a co-stated vendor mention does not lock out the pool.`, excerpt: (clauseSetAside?.[0] ?? samSA).slice(0, 160) };
  }

  return null;
}
