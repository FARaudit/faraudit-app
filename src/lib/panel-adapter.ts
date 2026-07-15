// PANEL WIRING ARC (card #523, P1a) — deterministic fullSource → panel inputs adapter.
//
// The customer executor holds a FLAT `fullSource` string; `runPanelJudge` needs a per-UCF-section map
// (`sectionText`), the detected-section key set, and any binding content that routed to no section. This
// adapter bridges that gap by REUSING the existing UCF boundary detector (`detectSections`) — no new
// section-detection heuristics. It is PURE and DETERMINISTIC (testable, bankable), so a $0 projection can
// replay it. IMPORTANT (architecture of record): `detectedSections` feeds ONLY the panel's manifest-gate
// visibility — it is NOT a coverage authority. Coverage/INCOMPLETE stays the executor's C-1 signal
// (`agenticManifestComplete` → deriveVerdict). The panel's own coverage floors are RETIRED, not wired.
import { detectSections } from "./section-boundary-detector";
import type { ExtractedDocument } from "./pdf-text-extractor";

export interface PanelInputs {
  /** UCF key ("L","M",…) → that section's source text (from detectSections). */
  sectionText: Record<string, string>;
  /** the set of UCF keys detected in source — feeds the panel manifest gate ONLY (never the verdict). */
  detectedSections: Set<string>;
  /** binding-obligation lines the detector routed to NO section — surfaced so the panel never loses
   *  binding content (verifier/narrative visibility); does not affect the pole. */
  unroutedBinding: string[];
}

/** Local string→ExtractedDocument shim (mirrors agentic-sections.asExtractedDoc — kept local so the adapter
 *  has no cross-module coupling to that file's private helper). */
function asExtractedDoc(text: string): ExtractedDocument {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  return { pages: [{ pageNum: 1, text, lines }], rawText: text, pageCount: 1, extractionMethod: "fallback", warnings: [] };
}

// A binding obligation (shall/must/furnish/…) — used ONLY to decide which UNROUTED lines are worth surfacing
// (binding content that landed in no section). Not a bar detector; purely a salience filter for visibility.
const BINDING_LINE_RE = /\b(?:shall|must|will\s+(?:be\s+)?required|furnish|install|provide|submit|deliver|require[sd]?|mandatory|no\s+later\s+than)\b/i;

/** P1a — build the panel's inputs from the executor's assembled fullSource. Deterministic; safe on any input
 *  (a source with no detectable UCF headers yields an empty sectionText + the whole binding set as unrouted). */
export function buildPanelInputs(fullSource: string): PanelInputs {
  const src = fullSource ?? "";
  const bag = detectSections(asExtractedDoc(src));
  const sectionText: Record<string, string> = {};
  for (const [key, sec] of Object.entries(bag.sections)) {
    if (sec?.text && sec.text.trim().length > 0) sectionText[key] = sec.text;
  }
  const detectedSections = new Set(Object.keys(sectionText));

  // unroutedBinding — binding lines present in fullSource but in NONE of the routed section texts. Conservative
  // substring containment (a line is "routed" if it appears verbatim inside any section text).
  const routed = Object.values(sectionText);
  const seen = new Set<string>();
  const unroutedBinding: string[] = [];
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (line.length < 12 || !BINDING_LINE_RE.test(line)) continue;
    if (seen.has(line)) continue;
    if (routed.some((t) => t.includes(line))) continue;
    seen.add(line);
    unroutedBinding.push(line);
  }
  return { sectionText, detectedSections, unroutedBinding };
}
