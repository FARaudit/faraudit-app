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
import { checkManifest, type ManifestResult } from "./agentic-panel";
import { detectDocumentClass, checkBiddableContent, routeCommercialSections, FALLBACK_BUNDLE_KEYS, type DocumentClass } from "./panel-doc-class";
import { LENS_SECTIONS_COMMERCIAL } from "./agentic-sections";

// #525 fix (Brain card #629 shape-(i)) — the keys routeCommercialSections can actually produce. The no-lens-starved
// predicate below only considers a lens "starved" if it owns one of THESE and got none (H/J/A never route
// commercially, so a lens owning only those is not starvable via routing — it rides the source it always did).
const PRODUCIBLE_COMMERCIAL_KEYS = new Set(["B", "C", "I", "L", "M"]);

/** #525 fix — routing is SAFE (route per-slice) iff NO reading lens is STARVED: every lens that owns at least one
 *  producible key received at least one of them. Falling back to whole-source is BETTER than starving a lens of its
 *  owned content (Brain #629). Fall back (whole-source, LOGGED) only when a lens would otherwise get nothing. */
export function commercialRoutingSafe(placedKeys: string[]): boolean {
  const placed = new Set(placedKeys);
  for (const assigned of Object.values(LENS_SECTIONS_COMMERCIAL)) {
    const ownedProducible = assigned.filter((k) => PRODUCIBLE_COMMERCIAL_KEYS.has(k));
    if (ownedProducible.length > 0 && !ownedProducible.some((k) => placed.has(k))) return false; // this lens is starved
  }
  return true;
}

export interface PanelInputs {
  /** UCF key ("L","M",…) → that section's source text. UCF path: from detectSections; commercial path: content-routed
   *  (routeCommercialSections) or the whole-source single-bundle fallback. */
  sectionText: Record<string, string>;
  /** the set of UCF keys populated in sectionText — feeds the panel manifest gate ONLY (never the verdict). */
  detectedSections: Set<string>;
  /** binding-obligation lines routed to NO section — surfaced so the panel never loses binding content. */
  unroutedBinding: string[];
  // card #525 (Brain ruling) — CLASS-AWARE FIRING. `documentClass` is the dispatch; `manifest` is the class-appropriate
  // FIRING GATE (UCF → checkManifest over detected UCF sections; commercial → checkBiddableContent over source). The
  // runner fires iff `manifest.ok`. Honest-fail preserved on both paths (genuinely incomplete → !ok, no fabrication).
  documentClass: DocumentClass;
  manifest: ManifestResult;
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

/** binding lines present in fullSource but in NONE of the routed section texts (conservative substring containment). */
function computeUnrouted(src: string, routedTexts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (line.length < 12 || !BINDING_LINE_RE.test(line)) continue;
    if (seen.has(line)) continue;
    if (routedTexts.some((t) => t.includes(line))) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/** P1a + card #525 (class-aware) — build the panel's inputs from the executor's assembled fullSource. Dispatches on
 *  DOCUMENT CLASS: a UCF §A–M solicitation uses the boundary detector + checkManifest gate (unchanged); a commercial/
 *  non-UCF (SF-1449) package uses content-routed sections + the biddable-content gate, with a whole-source single-bundle
 *  fallback when content routing can't place the core L/M content. Deterministic; safe on any input. */
export function buildPanelInputs(fullSource: string): PanelInputs {
  const src = fullSource ?? "";
  const bag = detectSections(asExtractedDoc(src));
  const ucfSectionText: Record<string, string> = {};
  for (const [key, sec] of Object.entries(bag.sections)) {
    if (sec?.text && sec.text.trim().length > 0) ucfSectionText[key] = sec.text;
  }

  // ── UCF path — a genuine §A–M solicitation (canonical uppercase headers). Boundary-detector sections +
  //    checkManifest gate, UNCHANGED (Brain ruling). ──
  if (detectDocumentClass(src) === "ucf") {
    const detectedSections = new Set(Object.keys(ucfSectionText));
    return {
      sectionText: ucfSectionText,
      detectedSections,
      unroutedBinding: computeUnrouted(src, Object.values(ucfSectionText)),
      documentClass: "ucf",
      manifest: checkManifest(detectedSections),
    };
  }

  // ── commercial / non-UCF path — biddable-content gate + content routing. Any sections the boundary detector DID
  //    find (e.g. mixed-case "Section L/M" labels) are OVERLAID on the routed base as higher-quality slices. ──
  const manifest = checkBiddableContent(src);
  // #525 fix (Brain card #629 shape-(i), flag AUDIT_COMMERCIAL_ROUTING_V2 default-OFF ⇒ byte-identical). V2 = the
  // strengthened RFQ/SF-1449 anchors + the no-lens-starved predicate (route whenever every lens gets its owned
  // content; fall back to whole-source — LOGGED — only when a lens would be STARVED, which is worse than
  // whole-source). OFF ⇒ legacy anchors + the §L-AND-§M predicate exactly as before.
  const routingV2 = process.env.AUDIT_COMMERCIAL_ROUTING_V2 === "true";
  const routed = routeCommercialSections(src, { v2: routingV2 });
  const routeOk = routingV2 ? commercialRoutingSafe(routed.placedKeys) : routed.routed;
  // whole-source single-bundle fallback when routing is not safe (assembleLensPasses dedupes identical section text
  // across a lens's assigned keys, so every lens reads the full source ONCE). A degenerate/empty source populates NO
  // sections (no phantom keys) — the biddable-content gate already !ok.
  const base = routeOk
    ? routed.sectionText
    : src.trim().length > 0
      ? Object.fromEntries(FALLBACK_BUNDLE_KEYS.map((k) => [k, src]))
      : {};
  const sectionText = { ...base, ...ucfSectionText };
  const detectedSections = new Set(Object.keys(sectionText));
  // ROUTING-INTEGRITY LOG (Brain card #614 addition-1, 2026-07-21) — PERMANENT, every commercial run. Whether
  // routeCommercialSections SLICED or fell back to whole-source (#525) decides if the cost-model slope is
  // intrinsic or bug-inflated (a lens reading the full source pays for content outside its ownership). Never
  // inferable-only again; the AUDIT_COST_PRESCREEN arm-card gates on this line reading "fallback: none".
  const _charsPerLens = Object.entries(sectionText).map(([k, v]) => `${k}:${(v ?? "").length}`).join(",");
  console.log(`[routing] sections routed: [${Object.keys(sectionText).join(",")}] · chars/lens: [${_charsPerLens}] · fallback: ${routeOk ? "none" : `WHOLE-SOURCE (#525 — a lens would be starved${routingV2 ? "" : "; legacy L&M predicate"}; each lens reads full source; cost-slope INFLATED)`}`);
  return {
    sectionText,
    detectedSections,
    unroutedBinding: computeUnrouted(src, Object.values(sectionText)),
    documentClass: "commercial",
    manifest,
  };
}
