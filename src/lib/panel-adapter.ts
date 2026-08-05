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
import { detectDocumentClass, checkBiddableContent, routeCommercialSections, ucfHeaderCount, FALLBACK_BUNDLE_KEYS, type DocumentClass } from "./panel-doc-class";
import { LENS_SECTIONS, LENS_SECTIONS_COMMERCIAL, lensAssignedSections, type PanelLensKey } from "./agentic-sections";
import { isEnvOn } from "./env-flags";

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

// ── SEQ5-ROOTS root (b) — THE BLIND-APERTURE FALLBACK (flag AUDIT_UCF_BLIND_SECTION_FALLBACK, default-OFF) ──
// Forensic (banked run 150c3ab3 / 36C25626Q1137, panel-F gate-4): this SF1449 package prints five literal
// "SECTION A"…"SECTION E" headers, so `detectDocumentClass` scores it **ucf** (5 distinct ≥ 3) — but the STRICT
// `detectSections` slicer produces **ZERO** sections. The UCF branch below has no fallback of any kind (the
// commercial branch has three: content routing, the whole-source bundle, and the biddable-content gate), so
// `sectionText` was `{}` and EVERY lens read empty text. All four panel-F omissions (WD wage · submission
// email/format kill-gates · questions-deadline 0900 · size standard $22.0M) were present in fullSource and IN NO
// SLICE — reachable only by exact-phrase guessing. The loss was PRE-MODEL and STRUCTURAL, not a lens failure.
//
// The trigger is a CLASS/SLICER DISAGREEMENT — two detectors reading the same headers and disagreeing on whether
// any section exists. That is unambiguously a bug state, never a document property: a genuine UCF solicitation
// with ≥3 canonical headers HAS sections, so zero usable slices means the slicer failed. Deliberately NARROW —
// "core sections missing" would re-dispatch legitimately-partial UCF packages and could mask a real INCOMPLETE.
//
// The rescue FAILS TOWARD COVERAGE via the commercial machinery, with two doctrine constraints:
//   (1) The gate is `checkBiddableContent` (a CONTENT scan), NEVER `checkManifest` over the rescued keys.
//       checkManifest counts POPULATED KEYS, so a whole-source bundle would flip manifest.ok false→true purely
//       because we populated the keys — manufacturing a confident verdict out of a phantom. The biddable-content
//       scan is immune: a package genuinely missing pricing/eval/submission content still honest-fails (no charge).
//   (2) The bundle spans the **LIVE** lens map's key union (`lensAssignedSections`), not the commercial one.
//       This is the card #549 trap: LENS_SECTIONS_COMMERCIAL applies ONLY when AUDIT_LENS_EMISSION_INTEGRITY is
//       ON, which is OFF in production and was ABSENT on this very run. Under the UCF map `proposal_compliance`
//       owns {H,I} — keys the commercial router and FALLBACK_BUNDLE_KEYS {B,C,L,M} never produce — so rescuing
//       into those four keys alone would trade a blind PANEL for a blind LENS. Spanning the live union instead
//       means no lens can read nothing, whichever map is armed. `assembleLensPasses` dedupes identical section
//       text across a lens's assigned keys, so the wider key set costs no extra tokens beyond the whole-source
//       read itself — each lens still reads the source once.
const UCF_BLIND_FALLBACK = () => isEnvOn(process.env.AUDIT_UCF_BLIND_SECTION_FALLBACK);

/** Every UCF key the LIVE lens map assigns to at least one lens (respects AUDIT_LENS_EMISSION_INTEGRITY +
 *  documentClass exactly as the runner does). The rescue's whole-source bundle spans these so no lens starves. */
export function liveLensKeyUnion(docClass?: DocumentClass): string[] {
  const keys = new Set<string>();
  for (const lens of Object.keys(LENS_SECTIONS) as PanelLensKey[]) {
    for (const k of lensAssignedSections(lens, docClass)) keys.add(k);
  }
  return [...keys].sort();
}

/** Would ANY lens read nothing if these were the only populated keys, under the LIVE map? (card #549-aware:
 *  a lens is starved iff it is assigned ≥1 key and received NONE of them.) The rescue below spans the full live
 *  union so it cannot starve a lens by construction; this is the ASSERTION helper the $0 gate checks that with,
 *  and the predicate to reuse if a cheaper routed rescue is ever attempted. Pure. */
export function anyLensStarvedUnderLiveMap(placedKeys: string[], docClass?: DocumentClass): boolean {
  const placed = new Set(placedKeys);
  for (const lens of Object.keys(LENS_SECTIONS) as PanelLensKey[]) {
    const assigned = lensAssignedSections(lens, docClass);
    if (assigned.length > 0 && !assigned.some((k) => placed.has(k))) return true;
  }
  return false;
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
    // SEQ5-ROOTS root (b) — CLASS/SLICER DISAGREEMENT ⇒ fail toward coverage instead of returning a blind panel.
    // Narrow by design: ≥3 canonical headers scored the doc UCF, yet the strict slicer produced zero usable
    // slices. Flag-OFF ⇒ this whole block is skipped ⇒ byte-identical to the pre-fix path.
    const ucfSlicerBlind = UCF_BLIND_FALLBACK()
      && Object.keys(ucfSectionText).length === 0
      && src.trim().length > 0;
    if (ucfSlicerBlind) {
      // Gate on CONTENT (never on populated keys — see the doctrine note above).
      const manifest = checkBiddableContent(src);
      // WHOLE-SOURCE, deliberately — content routing is NOT used on the rescue path, and this probe leg is why:
      // `routeCommercialSections` slices from the FIRST ANCHOR to EOF, so everything before that anchor is DROPPED
      // (the R4 pre-first-anchor head drop, _redteam-pr271-routing-gauntlet.ts). On this very fixture routing placed
      // [B,C,L,I] and starved no lens, yet the questions-deadline kill-gate at 3% of the document — a SUBMISSION
      // fact — landed in no slice at all. A PARTIAL rescue is worse than the blind state it replaces: blind
      // honest-failed (NHR/coverage), whereas partial can return a CONFIDENT verdict that silently omits a
      // kill-gate. "No lens starved" is not "no content lost", so the rescue buys COMPLETE coverage or does not
      // claim to be a rescue. Cost is the conscious price: every lens reads the full source (the #525
      // "cost-slope INFLATED" case), which is why this ships flag-OFF and is armed on a CEO cost decision.
      const bundleKeys = liveLensKeyUnion("ucf");
      const sectionText = Object.fromEntries(bundleKeys.map((k) => [k, src]));
      const detectedSections = new Set(Object.keys(sectionText));
      console.log(`[routing] UCF BLIND-APERTURE RESCUE (#SEQ5-ROOTS root b) — class=ucf (${ucfHeaderCount(src)} canonical headers) but the slicer produced ZERO sections; rescued via whole-source bundle across the live lens-key union [${bundleKeys.join(",")}] · every lens reads full source (cost-slope INFLATED, accepted: coverage over cost on a blind aperture) · gate=biddable-content(${manifest.ok ? "ok" : `INCOMPLETE: ${manifest.missing.join(" · ")}`})`);
      return {
        sectionText,
        detectedSections,
        unroutedBinding: computeUnrouted(src, Object.values(sectionText)),
        documentClass: "ucf",
        manifest,
      };
    }
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
  const routingV2 = isEnvOn(process.env.AUDIT_COMMERCIAL_ROUTING_V2);
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
  // HEAD DROP visibility — reported on BOTH poles (see routeCommercialSections). Measured over the banked corpus,
  // 20 of 20 routed commercial packages with a >=100-char head lost it entirely, worst 9,120 chars. That region
  // carries the deadline, questions deadline, set-aside, NAICS and submission POC, so its size belongs in the
  // permanent routing line whether or not AUDIT_ROUTING_HEAD_COVERAGE is recovering it yet.
  // Three distinct states, never collapsed into two: injected · below the 20-char injection threshold · dropped.
  // Reporting "not injected" as "RECOVERED" (or a negligible head as a loss) would make this line assert something
  // it did not measure.
  const _head = routed.headChars === 0
    ? ""
    : routed.headCovered
      ? ` · head(pre-first-anchor): ${routed.headChars} chars RECOVERED→A,L`
      : routed.headChars < 20
        ? ` · head(pre-first-anchor): ${routed.headChars} chars (below the 20-char injection threshold; not routed)`
        : ` · head(pre-first-anchor): ${routed.headChars} chars DROPPED (unread by every lens; AUDIT_ROUTING_HEAD_COVERAGE off)`;
  console.log(`[routing] sections routed: [${Object.keys(sectionText).join(",")}] · chars/lens: [${_charsPerLens}] · fallback: ${routeOk ? "none" : `WHOLE-SOURCE (#525 — a lens would be starved${routingV2 ? "" : "; legacy L&M predicate"}; each lens reads full source; cost-slope INFLATED)`}${_head}`);
  return {
    sectionText,
    detectedSections,
    unroutedBinding: computeUnrouted(src, Object.values(sectionText)),
    documentClass: "commercial",
    manifest,
  };
}
