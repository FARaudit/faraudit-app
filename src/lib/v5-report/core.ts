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
import { isEnvOn } from "@/lib/env-flags";

// REPORT-TRUTH #3 — compute-or-absent for panel columns, shared by every v5 surface (web · deck · pdf) so they cannot
// disagree about which columns exist. `undefined` on every row means the engine never typed that attribute → the
// column is dropped WHOLE; `""` on any row is a computed-empty → the column renders (flag-OFF byte-identical).
// An empty cell under a printed header reads as "we looked, and the source says nothing" — never a claim we made.
export const hasCol = <T,>(rows: T[], pick: (r: T) => string | undefined): boolean => rows.some((r) => pick(r) !== undefined);

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
  const nv = !!v.noVerdict;
  const elig = eligInfo(v);
  // Vehicle F · D3 (flag AUDIT_NHR_NARRATIVE_TRUE_CAUSE) — on an ELIGIBILITY-cause NHR the gate(s) ARE determined (the
  // engine named a grounded eligibility bar), so Show-stoppers/Eligibility surface the conditional gate instead of the
  // blanket "Not determined". Flag-OFF / other causes ⇒ eligGate false ⇒ exact legacy tiles ⇒ byte-identical.
  const eligGate = isEnvOn(process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE) && (v as { noVerdictCause?: string }).noVerdictCause === "eligibility" && p0 > 0;
  const tiles: ScorecardTile[] = [
    eligGate
      ? { k: "Show-stoppers", v: String(p0), tone: "caution", sub: "eligibility gate — confirm your firm's status", textv: false }
      : { k: "Show-stoppers", v: nv ? "Not determined" : (p0 ? String(p0) : "None"), tone: nv ? "slate" : (p0 ? "stop" : "go"), sub: nv ? "not determined" : (p0 ? "block award" : "no blockers found"), textv: nv },
    { k: "Gates to clear", v: nv ? "Not determined" : String(p1), tone: nv ? "slate" : (p1 ? "caution" : "go"), sub: nv ? "not determined" : "before you submit", textv: nv },
    // Coverage = read / total (never a bare %). Gate-2 ruling (Design, 2026-07-07): a
    // percentage is score-adjacent on a score-free artifact, and it contradicted the deck
    // cover console + provenance panel, which already speak "X / Y". read/total unifies all.
    // Coverage sub is a one-line EXPLANATION, not a bare "· incomplete" (card #612-(3e)):
    // "5 / 5 · incomplete" reads as a contradiction. Resolve WHY in one line — a partial read,
    // or a full read with a section still to confirm (LBJ 653570ea: all 5 read, §L flagged).
    { k: "Coverage", v: (cov.read == null || cov.total == null) ? "—" : cov.read + " / " + cov.total, tone: cov.state === "COMPLETE" ? "go" : "slate", sub: coverageSub(cov), textv: false },
    elig
      // Eligibility sub explains the tri-state chip instead of the static "set-aside / status":
      // "Not determined" alone leaves the reader guessing whether it is a problem (card #612-(3e)).
      ? { k: "Eligibility", v: elig.label, tone: elig.cls === "ok" ? "go" : elig.cls === "no" ? "stop" : "slate", sub: elig.cls === "ok" ? "eligible on the facts read" : elig.cls === "no" ? "a verified bar applies" : "confirm before you rely on it", textv: true }
      : { k: "Advisories", v: String(p2), tone: "slate", sub: "clause flow-downs", textv: false },
  ];
  return tiles;
}

// One-line coverage explanation for the scorecard tile (card #612-(3e)). Distinguishes a
// genuine PARTIAL read (read < total) from a full read that left a section unconfirmed
// (read == total but coverage.missing non-empty — the LBJ §L case) so "incomplete" never
// looks like it contradicts a "5 / 5" count.
function coverageSub(cov: V4Data["coverage"]): string {
  if (cov.state === "COMPLETE") return "documents · complete";
  const miss = (cov.missing || []).filter(Boolean);
  if (cov.read != null && cov.total != null && cov.read < cov.total) return "partial read · confirm the unread set";
  if (miss.length) return `all read · ${miss.length} section${miss.length === 1 ? "" : "s"} to confirm`;
  return "read · completeness not certified";
}

// Split a self-clearable-package rationale into a LEDE + the enumerated caveat list
// (card #612-(3c)). The engine inlines the entire self-clearable list after a "confirm
// each before bidding:" intro — a ~50-item semicolon wall dumped verbatim into the bottom
// line, redundant with the Findings section. This lets the renderer show the lede + a
// ranked top-N (engine order = rank), with the remainder grouped ("+N more in Findings").
// A normal single-sentence rationale (no list intro, or a trivial tail) returns unchanged
// with an empty caveat list, so non-package poles are byte-identical.
const CAVEAT_INTRO_RE = /(\bconfirm each before bidding:\s*)([\s\S]+)$/i;
// A self-clearable item ALWAYS opens with a capital letter, a digit (clause number), or a
// bracket. A fragment opening lowercase is a mid-clause CONTINUATION — the engine's semicolon
// list carries clause-internal "; " (52.219-14 "…self-perform at least 50% of the work; it
// will not pay…"), and splitting on "; " would orphan the "it will not pay…" half onto its own
// bullet (Design flag, PR #266). Re-join continuations so every bullet is a whole clause.
const CAVEAT_CONTINUATION_RE = /^[a-z]/;
const CAVEAT_STOP = new Set(["a", "an", "the", "of", "for", "to", "with", "under", "and", "or", "in", "on", "at", "this", "that", "must", "be", "is", "are", "as", "by"]);

// Signature for near-dup collapse = sorted CONTENT tokens of the LEADING clause (up to the first
// . ; :). Two items whose leading clause carries the same substance modulo word-order/filler
// (the reworded set-aside pair "…with a $34 million size standard" vs "…, size standard $34
// million") collide and fold — so a restatement never spends a premium top-5 slot. Short leads
// (<4 content tokens) return "" so distinct terse items are never over-collapsed.
function caveatSignature(s: string): string {
  const lead = (s.split(/[.;:]/)[0] || s).toLowerCase();
  const toks = lead.replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((w) => w && !CAVEAT_STOP.has(w));
  return toks.length < 4 ? "" : toks.sort().join(" ");
}

// Belt: a truncated tail must never render "(" without a matching ")".
function balanceParens(s: string): string {
  const opens = (s.match(/\(/g) || []).length, closes = (s.match(/\)/g) || []).length;
  return opens > closes ? s + ")".repeat(opens - closes) : s;
}

export function splitCaveatRationale(rationale: unknown): { lede: string; caveats: string[] } {
  const t = esc(rationale) === "" ? "" : String(rationale ?? "");
  const m = t.match(CAVEAT_INTRO_RE);
  if (!m) return { lede: t, caveats: [] };
  const lede = t.slice(0, m.index! + m[1].length).trim();
  // (1) split on the item separator, RE-JOINING continuation fragments so a clause with an
  //     internal semicolon stays ONE whole bullet (never a lowercase-leading orphan).
  const merged: string[] = [];
  for (const raw of m[2].split(/\s*;\s*/)) {
    const piece = raw.trim();
    if (!piece) continue;
    if (merged.length && CAVEAT_CONTINUATION_RE.test(piece)) merged[merged.length - 1] += "; " + piece;
    else merged.push(piece);
  }
  // (2) de-dup on exact-normalized OR leading-clause signature (first-seen order = rank), then
  //     (3) balance any dangling paren. Both defects live in the CEO-read top slots (Design flag).
  const seen = new Set<string>();
  const caveats: string[] = [];
  for (const piece of merged) {
    const k1 = piece.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const k2 = caveatSignature(piece);
    if (seen.has(k1) || (k2 && seen.has(k2))) continue;
    seen.add(k1); if (k2) seen.add(k2);
    caveats.push(balanceParens(piece));
  }
  if (caveats.length < 2) return { lede: t, caveats: [] }; // not a real list → leave the sentence whole
  return { lede, caveats };
}
