/* =============================================================================
   v5 Report ("The Gate Brief") — SHARED CORE
   Ported from the Design v5 package (_v5-PORT-READY, 2026-07-05).

   This module is the single source of truth for the verdict / eligibility / tone /
   masthead helpers AND the F3 scorecard-tile derivation, consumed VERBATIM by all
   three renderers (web · Executive Brief PDF · Gate Deck PDF).

   WHY IT EXISTS (Brain F3 relay + port-prompt §6.1): the Design mock patched the
   noVerdict "Not determined" tile logic in THREE places (render-v5 / render-deck /
   render-pdf) — parallel edits that drift. Consolidating scorecardTiles() + the
   STAMP/EYEBROW/ICON maps + eligInfo() here means a doctrine change lands ONCE and
   every surface inherits it by construction, not by parallel edit.

   Doctrine invariants enforced here: no score/numeric confidence; "Not determined"
   (never "None") on any noVerdict pole; tri-state eligibility is a top-line value.
   ============================================================================= */
import type { Tone, V4Data, V4Verdict } from "@/lib/v4-report/render";

export const esc = (s: unknown): string =>
  String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Tone → verdict stamp word (the mono chip beside the verdict). SINGLE map — the
// Design pass found the deck's copy had drifted (missing stop:BLOCKED); one home fixes that.
export const TONE_LABEL: Record<Tone, string> = { go: "CLEARED", caution: "CONDITIONAL", stop: "BLOCKED", slate: "NO VERDICT" };
export const SEVLAB = { p0: "Show-stopper", p1: "Gate", p2: "Advisory" } as const;

// No-verdict eyebrow wording, keyed on the pole (shared so web + both PDFs read identically).
export const NOVERDICT_EYEBROW: Record<string, string> = {
  NEEDS_HUMAN_REVIEW: "No verdict — human adjudication",
  INCOMPLETE: "No verdict — coverage incomplete",
  OUT_OF_SCOPE: "No verdict — outside audit scope",
};
export const eyebrowFor = (v: V4Verdict): string =>
  v.noVerdict ? (NOVERDICT_EYEBROW[v.pole] || "No verdict reached") : "Gate decision";

export type EligInfo = { cls: "ok" | "no" | "nd"; label: string } | null;
export function eligInfo(v: V4Verdict): EligInfo {
  if (!("eligible" in v) || v.eligible === undefined) return null;
  if (v.eligible === true) return { cls: "ok", label: "Eligible" };
  if (v.eligible === false) return { cls: "no", label: "Ineligible" };
  return { cls: "nd", label: "Not determined" };
}

export const plur = (n: number, one: string, many: string): string => n + " " + (n === 1 ? one : many);
export const cap = (s: unknown): string => { const t = String(s || ""); return t.charAt(0).toUpperCase() + t.slice(1); };

export interface ScorecardTile { k: string; v: string; tone: Tone; sub: string; textv: boolean; }

/** F3 (Brain 2026-07-05) — the executive-bento tiles, SINGLE-SOURCED for all three
 *  renderers. On ANY verdict.noVerdict pole the Show-stoppers AND Gates tiles render
 *  "Not determined" (slate) — never "None"/"None found": a partial or halted read never
 *  earned that certainty. "None" survives only on a committal call. Consuming this one
 *  derivation is what makes the three-surface F3 fix drift-proof by construction. */
export function scorecardTiles(d: V4Data): ScorecardTile[] {
  const v = d.verdict, cov = d.coverage, f = d.findings;
  const p0 = (f.p0 || []).length, p1 = (f.p1 || []).length, p2 = (f.p2 || []).length;
  const pct = cov.total ? Math.round((cov.read / cov.total) * 100) : null;
  const nv = !!v.noVerdict;
  const elig = eligInfo(v);
  const tiles: ScorecardTile[] = [
    { k: "Show-stoppers", v: nv ? "Not determined" : (p0 ? String(p0) : "None"), tone: nv ? "slate" : (p0 ? "stop" : "go"), sub: nv ? "not determined" : (p0 ? "block award" : "no blockers found"), textv: nv },
    { k: "Gates to clear", v: nv ? "Not determined" : String(p1), tone: nv ? "slate" : (p1 ? "caution" : "go"), sub: nv ? "not determined" : "before you submit", textv: nv },
    { k: "Coverage", v: pct == null ? "—" : pct + "%", tone: cov.state === "COMPLETE" ? "go" : "slate", sub: cov.read + "/" + cov.total + " docs · " + cov.state.toLowerCase(), textv: false },
    elig
      ? { k: "Eligibility", v: elig.label, tone: elig.cls === "ok" ? "go" : elig.cls === "no" ? "stop" : "slate", sub: "set-aside / status", textv: true }
      : { k: "Advisories", v: String(p2), tone: "slate", sub: "clause flow-downs", textv: false },
  ];
  return tiles;
}
