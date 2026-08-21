// DOCUMENT PURPOSE — which documents belong in a LENS seat, and which are read for coverage only.
//
// THE PROBLEM THIS SOLVES, measured on W911SG27BA002 (audit c84280f6, the 900s stall):
// UCF §C is "Description / Specifications / Statement of Work", so on a construction solicitation it
// legitimately carries the entire technical specification library. Routing by UCF letter therefore handed
// the capture strategist 2,098,225 chars — 73% of the package — of which 1,642,804 (78%) was how to lay
// asphalt. One NMDOT highway spec was 41.7% of that seat's input on its own; the Statement of Work was 8.4%.
// The router was obeying the Uniform Contract Format exactly. The premise was wrong: UCF section is not a
// unit of ANALYSIS, and no turn budget fixes it — nine reads cannot cover 28 specification documents, and
// reading them would not improve a bid/no-bid judgment if it could.
//
// ⛔ POSITIVE IDENTIFICATION ONLY, AND THE SAFE DIRECTION IS "KEEP".
// A document is withheld from the lens ONLY when it is positively identified as a technical specification.
// Anything unrecognized stays in the lens. A leak in this recognizer therefore costs a spec staying where it
// is today — the status quo — while the opposite failure would drop a Statement of Work out of the analysis.
// The hard negative guard runs FIRST and is unconditional for that reason.
//
// ⛔ WITHHELD ≠ UNREAD. These documents stay in fullSource, stay ingested, stay grounded against, and stay
// credited by extraction as READ. Only the LENS input narrows. The two coverage measures already split on
// exactly this axis: engine coverage asks "was it read", analysed asks "did a grounded finding land in it".
//
// ⚠ ANALYSED COVERAGE WILL FALL FOR CONSTRUCTION when this is armed, because no grounded finding will land
// in the withheld documents. Unless the completeness gate is told that is by design, every construction
// package returns INCOMPLETE. THAT IS A VERDICT-AFFECTING DOCTRINE CHANGE AND IT IS NOT CODE'S TO MAKE —
// it is the same open question as the construction OOS collision. Nothing calls this with withhold=true
// until it is ruled. There is deliberately NO env flag: the decision gets hardcoded once it is made, rather
// than becoming the 206th switch in an engine whose census already found 110 permanently-on branches.

/** Never withhold a document that names itself one of these, whatever else it looks like. */
const LENS_ESSENTIAL_RE =
  /statement of work|\bSOW\b|\bPWS\b|\bSOO\b|performance work statement|wage determination|collective bargaining|\bCBA\b|bid schedule|price schedule|\bCLIN\b|amendment|\bSF[-\s]?30\b|instructions to (bidders|offerors)|evaluation (factors|criteria)|reps? (and|&) certs?|representations and certifications|subcontracting plan/i;

/** CSI MasterFormat 3-part guide-spec structure — the STRUCTURAL signature of a construction specification.
 *  Measured on the flagship: present in 26 of 28 specification documents and in ZERO other documents. */
const CSI_PART_1 = /PART\s+1\s+GENERAL/i;
const CSI_PART_2 = /PART\s+2\s+PRODUCTS/i;
const CSI_PART_3 = /PART\s+3\s+EXECUTION/i;

/** State DOT / agency SPEC BOOKS — compiled standard specifications, not CSI guide specs, so they carry no
 *  3-part structure. Named explicitly because the two on the flagship are 874,858 and 266 chars: the larger
 *  is 41.7% of the busiest lens's entire input. */
const SPEC_BOOK_RE = /\b(NMDOT|TXDOT|CALTRANS|FDOT|GDOT|INDOT|MNDOT|NCDOT|ODOT|PENNDOT|WSDOT)\b.*\bspec/i;

/** UFGS — the DoD Unified Facilities Guide Specifications series. */
const UFGS_RE = /\bUFGS\b/i;

export type LensExclusionSignal = "csi-3part" | "spec-book" | "ufgs" | null;

export interface DocPurpose {
  /** true ⇒ read for coverage, never routed to a lens seat. */
  lensExcluded: boolean;
  signal: LensExclusionSignal;
  reason: string;
}

export function classifyDocPurpose(name: string, text: string): DocPurpose {
  if (LENS_ESSENTIAL_RE.test(name)) {
    return { lensExcluded: false, signal: null, reason: "lens-essential document type — never withheld" };
  }
  const csi = CSI_PART_1.test(text) && CSI_PART_2.test(text) && CSI_PART_3.test(text);
  if (csi) return { lensExcluded: true, signal: "csi-3part", reason: "CSI MasterFormat 3-part guide specification (PART 1 GENERAL / PART 2 PRODUCTS / PART 3 EXECUTION)" };
  if (SPEC_BOOK_RE.test(name)) return { lensExcluded: true, signal: "spec-book", reason: "state DOT standard specification book" };
  if (UFGS_RE.test(name)) return { lensExcluded: true, signal: "ufgs", reason: "UFGS guide specification (named, 3-part structure not detected — possibly truncated)" };
  return { lensExcluded: false, signal: null, reason: "not positively identified as a specification — kept in the lens" };
}

export interface LensPartition {
  /** fullSource with the withheld document regions removed. Feed this to routing. */
  lensSource: string;
  withheld: Array<{ name: string; chars: number; signal: LensExclusionSignal; reason: string }>;
  keptChars: number;
  withheldChars: number;
}

/** Partition an assembled fullSource into the lens-routable part and the coverage-only part.
 *  `regionsOf` is injected so this module stays free of the orchestrator's import graph. */
export function partitionLensSource(
  fullSource: string,
  regionsOf: (src: string) => Array<{ name: string; text: string }>,
): LensPartition {
  const regions = regionsOf(fullSource ?? "");
  const withheld: LensPartition["withheld"] = [];
  const kept: string[] = [];
  for (const r of regions) {
    const p = classifyDocPurpose(r.name, r.text);
    if (p.lensExcluded) withheld.push({ name: r.name, chars: r.text.length, signal: p.signal, reason: p.reason });
    else kept.push(r.text);
  }
  // No region markers parsed (single-document source) ⇒ nothing to partition; return the source untouched
  // rather than an empty lensSource, which would blind every lens while reporting a large "saving".
  if (regions.length <= 1) return { lensSource: fullSource ?? "", withheld: [], keptChars: (fullSource ?? "").length, withheldChars: 0 };
  const lensSource = kept.join("\n\n");
  return { lensSource, withheld, keptChars: lensSource.length, withheldChars: withheld.reduce((a, w) => a + w.chars, 0) };
}
