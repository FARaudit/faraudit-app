// Layer-3 (Brain card 265/267, own Rule-61 step) — GROUNDED AGENTIC SECTION-FINDER.
//
// The deterministic header-regex detector (section-boundary-detector.ts) is the PRIMARY and runs first
// unchanged. L3 fires ONLY on the required PROPOSAL sections §L/§M that the deterministic pass did NOT locate —
// the narrative notice-body §L/§M that L1 ingested into fullSource but that carry no "SECTION L/M" header. The
// model LOCATES (returns a DISTINCTIVE verbatim anchor copied from where the section begins), NEVER summarizes.
//
// FAIL-SAFE GATE (Brain Ruling-2, hardened after adversarial review):
//   • the anchor must appear EXACTLY ONCE in the (normalized) source — 0 ⇒ fabricated, >1 ⇒ ambiguous position.
//     Either way REJECTED. Uniqueness is what makes "at the offset" unambiguous: a phrase that also occurs in
//     §C can't silently resolve to the §C copy, because a §C-and-§L phrase is ambiguous ⇒ rejected.
//   • the located section TEXT is the span from its anchor to the NEXT located section's anchor (or EOF) — a
//     boundary PARTITION, never a fixed window. It never truncates a long section (which would hide obligations
//     past the cut from the completeness proof = a false-COMPLETE) and never bleeds ACROSS a located boundary.
//     Worst case is over-capture to EOF, which is fail-safe for completeness (the proof reads MORE, so an
//     obligation is never invisible). The text is verbatim source, never model prose.
// A rejected / absent / errored / unparseable locate changes nothing ⇒ the section stays missing ⇒ INCOMPLETE.
// The model can therefore never mint a false-COMPLETE; its worst case is an honest INCOMPLETE.
//
// SCOPE: §L and §M only (the ruling's scope). Locating them flips coreMissingFor's "unknown-format" branch to
// anyCore=true, which drops the §C requirement — so §C never needs an L3 locate, and we never over-clear the
// (typically largest) §C off a single anchor.

/** What each locatable proposal section contains — handed to the finder so it knows what to look for. */
import { isEnvOn } from "./env-flags";
const SECTION_INTENT: Record<string, string> = {
  L: "the instructions to offerors — how to prepare and submit a proposal/quote (proposal contents, volumes, page limits, submission format)",
  M: "the evaluation factors / basis for award — how the Government will evaluate quotes and select an awardee (best value, LPTA, technical vs price)",
};
/** L3's scope — the ruling's §L/§M. §C is intentionally excluded (see header). */
export const FINDER_KEYS = ["L", "M"] as const;

/** Minimum non-whitespace chars an anchor must carry to be a trustworthy locate. A too-short anchor (e.g. a
 *  single common word) could recur / coincidentally match → treat as NOT located (fail-safe). */
const MIN_ANCHOR_NONWS = 24;

/** Fold to a comparison form: unify dash/quote/space variants that pdftotext + a model's "verbatim" copy differ
 *  on (mirrors audit-tools' norm so a legitimately-copied anchor isn't false-rejected), collapse whitespace,
 *  lowercase. Whitespace is DROPPED entirely so the anchor matches across arbitrary source line-wrapping. */
const foldChar = (s: string): string =>
  s.replace(/[‐-―−]/g, "-")            // hyphen/dash variants → "-"
   .replace(/[‘’‛′]/g, "'")       // curly/prime single quotes → '
   .replace(/[“”″]/g, '"')             // curly/prime double quotes → "
   .toLowerCase();
const foldNoWs = (s: string): string => foldChar(s).replace(/\s/g, "");

/** Build a whitespace-stripped folded view of the source + a parallel map from each folded char back to its RAW
 *  offset. Lets us find an anchor whitespace-insensitively AND recover its exact raw position — O(n), no
 *  backtracking matcher (the earlier hand-rolled scan had a repeated-prefix bug). */
function buildFoldedIndex(fullSource: string): { folded: string; rawAt: number[] } {
  let folded = "";
  const rawAt: number[] = [];
  for (let i = 0; i < fullSource.length; i++) {
    const ch = fullSource[i];
    if (/\s/.test(ch)) continue;
    folded += foldChar(ch);
    rawAt.push(i);
  }
  return { folded, rawAt };
}

/** The finder's typed contract — inject a stub in tests ($0), the real LLM caller in prod (PAID). */
export type SectionFinderCall = (args: {
  fullSource: string;
  sectionKey: string;
  sectionIntent: string;
}) => Promise<{ located: boolean; anchor?: string | null }>;

export interface LocateAttempt {
  key: string;
  located: boolean;      // finder said located AND the anchor was substantive + UNIQUE in source
  rejected: boolean;     // finder claimed located but the anchor was absent, too short, or AMBIGUOUS (>1 hit)
  reason: string;        // machine-readable outcome for the run log (never silent)
}

export interface SectionFinderResult {
  /** key → verbatim section text, for §L/§M the finder LOCATED and we VERIFIED. Merge over the base map. */
  located: Record<string, string>;
  /** Per-key audit trail (located / rejected / not-located / error) — surfaced, never silent. */
  attempts: LocateAttempt[];
}

/** Verify an anchor against a prebuilt folded index. Returns the RAW offset iff the anchor is substantive AND
 *  occurs EXACTLY ONCE; -1 otherwise (fabricated=0, ambiguous>1, or too short). Pure → $0 unit-testable. */
export function locateUniqueAnchor(fullSource: string, anchor: string | null | undefined, idx?: { folded: string; rawAt: number[] }): number {
  const a = (anchor ?? "").trim();
  if (a.replace(/\s/g, "").length < MIN_ANCHOR_NONWS) return -1;      // too thin to trust
  const { folded, rawAt } = idx ?? buildFoldedIndex(fullSource);
  const needle = foldNoWs(a);
  if (needle.length === 0) return -1;
  const first = folded.indexOf(needle);
  if (first < 0) return -1;                                          // not present (fabricated) → REJECTED
  if (folded.indexOf(needle, first + 1) >= 0) return -1;             // appears >1× (ambiguous position) → REJECTED
  return rawAt[first];                                               // the one unambiguous raw offset
}

/** Run the finder over the not-located §L/§M keys, verify each anchor UNIQUELY, then PARTITION the source by the
 *  verified anchor offsets so each section spans to the next located boundary (or EOF) — no truncation, no
 *  cross-boundary bleed. Deterministic given a `finder` stub → $0 test. A finder error is caught (fail-safe). */
export async function runSectionFinder(opts: {
  fullSource: string;
  targetKeys: string[];
  finder: SectionFinderCall;
  signal?: AbortSignal;
}): Promise<SectionFinderResult> {
  const attempts: LocateAttempt[] = [];
  const idx = buildFoldedIndex(opts.fullSource);
  const keys = opts.targetKeys.filter((k) => (FINDER_KEYS as readonly string[]).includes(k));
  const hits: Array<{ key: string; offset: number }> = [];
  for (const key of keys) {
    if (opts.signal?.aborted) { attempts.push({ key, located: false, rejected: false, reason: "aborted" }); continue; }
    const intent = SECTION_INTENT[key] ?? `section ${key}`;
    let res: { located: boolean; anchor?: string | null };
    try {
      res = await opts.finder({ fullSource: opts.fullSource, sectionKey: key, sectionIntent: intent });
    } catch (e) {
      attempts.push({ key, located: false, rejected: false, reason: `finder error: ${(e as Error)?.message ?? String(e)}` });
      continue;
    }
    if (!res.located) { attempts.push({ key, located: false, rejected: false, reason: "finder: not located" }); continue; }
    const offset = locateUniqueAnchor(opts.fullSource, res.anchor, idx);
    if (offset < 0) {
      attempts.push({ key, located: false, rejected: true, reason: "anchor absent / too short / ambiguous in source (rejected)" });
      continue;
    }
    hits.push({ key, offset });
    attempts.push({ key, located: true, rejected: false, reason: "located + verified (unique)" });
  }

  // Partition: each located section spans from its anchor to the NEXT located anchor's offset (or EOF). Non-
  // overlapping, self-sizing, never truncated below the true section extent. Distinct anchors ⇒ distinct offsets;
  // a degenerate empty span (shouldn't happen with distinct anchors) is dropped as not-located (fail-safe).
  const sorted = [...hits].sort((x, y) => x.offset - y.offset);
  const located: Record<string, string> = {};
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].offset;
    const end = i + 1 < sorted.length ? sorted[i + 1].offset : opts.fullSource.length;
    const text = opts.fullSource.slice(start, end).trim();
    if (text.length > 0) located[sorted[i].key] = text;
  }
  return { located, attempts };
}

const FINDER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    located: { type: "boolean", description: "true ONLY if the section's content is genuinely present in the document" },
    anchor: {
      type: "string",
      description: "A DISTINCTIVE VERBATIM phrase (copy exact characters, ≥ ~10 words) unique to where the section's content BEGINS — one that appears NOWHERE ELSE in the document. Empty string when not located.",
    },
  },
  required: ["located", "anchor"],
} as const;

/** Build the real (PAID) finder — a locate-only structured call. Constructed ONLY when AUDIT_SECTION_FINDER is on
 *  (auditPackage), so flag-OFF is byte-identical (finder undefined ⇒ L3 never runs). Locate, never summarize. */
export function makeSectionFinderCaller(
  callStructured: (args: { model: string; system: string; user: string; schema: object; maxTokens: number; signal?: AbortSignal; cachedSystemPrefix?: string }) => Promise<string>,
  model: string,
  signal?: AbortSignal,
): SectionFinderCall {
  return async ({ fullSource, sectionKey, sectionIntent }) => {
    const system =
      "You are a locator, not a summarizer. You are given the FULL TEXT of a federal solicitation. Find where a " +
      "specific required section's content begins. Return a DISTINCTIVE VERBATIM anchor: copy the exact characters " +
      "(at least ~10 words) from the sentence where that content starts — a phrase that appears NOWHERE ELSE in " +
      "the document, so it pins the location unambiguously. Do not paraphrase, summarize, invent, or lightly edit " +
      "the text — copy it exactly. If the content is genuinely NOT present, return located=false and an empty " +
      "anchor. Never guess.";
    // CACHING (unified flag AUDIT_PROMPT_CACHE): runSectionFinder calls this SEQUENTIALLY once per target key
    // (§L then §M) with the SAME fullSource. Un-cached, each call re-bills the whole document. When the flag is
    // on, carry the document as a SHARED cached system prefix (identical across §L/§M) so the FIRST locate writes
    // it and the SECOND reads it (~10% of input price). The section-specific ask stays in the (tiny) user turn.
    // Flag-OFF ⇒ document rides the user turn exactly as before (BYTE-IDENTICAL prompt — no behavior change).
    const cacheOn = isEnvOn(process.env.AUDIT_PROMPT_CACHE);
    const docBlock = `---DOCUMENT---\n${fullSource}`;
    const user = cacheOn
      ? `Required section §${sectionKey} contains ${sectionIntent}.\n\n` +
        `Locate §${sectionKey} in the DOCUMENT provided in the system context above. Return a distinctive verbatim ` +
        `anchor where its content begins, copied exactly. If it is not present, located=false.`
      : `Required section §${sectionKey} contains ${sectionIntent}.\n\n` +
        `Locate §${sectionKey} in the document below. Return a distinctive verbatim anchor where its content begins, ` +
        `copied exactly. If it is not present, located=false.\n\n${docBlock}`;
    const text = await callStructured({ model, system, user, schema: FINDER_SCHEMA, maxTokens: 1024, signal, ...(cacheOn ? { cachedSystemPrefix: docBlock } : {}) });
    try {
      const parsed = JSON.parse(text) as { located?: boolean; anchor?: string };
      return { located: parsed.located === true, anchor: parsed.anchor ?? null };
    } catch {
      return { located: false, anchor: null }; // unparseable → not located (fail-safe)
    }
  };
}
