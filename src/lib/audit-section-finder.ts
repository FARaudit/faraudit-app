// Layer-3 (Brain card 265/267, own Rule-61 step) — GROUNDED AGENTIC SECTION-FINDER.
//
// The deterministic header-regex detector (section-boundary-detector.ts) is the PRIMARY and runs first
// unchanged. L3 fires ONLY on a required section that the deterministic pass did NOT locate — the narrative
// notice-body §L/§M that L1 ingested into fullSource but that carry no "SECTION L/M" header. The model LOCATES
// (returns a VERBATIM anchor phrase copied from where the section begins), it NEVER summarizes.
//
// FAIL-SAFE BY CONSTRUCTION (Ruling-2): the returned anchor must string-match verbatim in fullSource or the
// locate is REJECTED. We verify by finding the anchor with indexOf over normalized source (more robust than
// trusting a model-reported integer offset — LLMs miscount characters; a hallucinated anchor simply isn't found).
// A rejected/absent locate leaves the section missing → coreMissingFor keeps it → INCOMPLETE. The model can
// therefore never mint a false-COMPLETE; its worst case is an honest INCOMPLETE. The located section TEXT is
// sliced verbatim from source at the verified anchor (never model-generated), so downstream grounding holds.

/** What each locatable UCF section contains — handed to the finder so it knows what to look for. */
const SECTION_INTENT: Record<string, string> = {
  C: "the statement of work / specifications / description of the requirement (what the contractor must deliver or perform)",
  L: "the instructions to offerors — how to prepare and submit a proposal/quote (proposal contents, volumes, page limits, submission format)",
  M: "the evaluation factors / basis for award — how the Government will evaluate quotes and select an awardee (best value, LPTA, technical vs price)",
};

/** Minimum non-whitespace chars an anchor must carry to be a trustworthy locate. A too-short anchor (e.g. a
 *  single common word) could coincidentally string-match anywhere → treat as NOT located (fail-safe). */
const MIN_ANCHOR_NONWS = 24;
/** Bounded window of verbatim source captured as the located section's text (read by experts + completeness
 *  proof). Large enough to hold the section's substance, bounded so a locate can't drag in the whole document. */
const LOCATE_WINDOW_CHARS = 6000;

const norm = (s: string): string => s.replace(/\s+/g, " ").toLowerCase().trim();
const nonWsLen = (s: string): number => s.replace(/\s/g, "").length;

/** The finder's typed contract — inject a stub in tests ($0), the real LLM caller in prod (PAID). */
export type SectionFinderCall = (args: {
  fullSource: string;
  sectionKey: string;
  sectionIntent: string;
}) => Promise<{ located: boolean; anchor?: string | null }>;

export interface LocateAttempt {
  key: string;
  located: boolean;      // finder said located AND the anchor verified in source
  rejected: boolean;     // finder claimed located but the anchor did NOT verify (fabricated/mis-located)
  reason: string;        // machine-readable outcome for the run log (never silent)
}

export interface SectionFinderResult {
  /** key → verbatim section text, for the sections the finder LOCATED and we VERIFIED. Merge over the base map. */
  located: Record<string, string>;
  /** Per-key audit trail (located / rejected / not-located / error) — surfaced, never silent. */
  attempts: LocateAttempt[];
}

/** Deterministic verify+extract — the fail-safe gate. Returns the verbatim section text when the anchor is
 *  substantive AND found verbatim in source; null (REJECTED) otherwise. Pure; no model call → unit-testable at $0. */
export function verifyAndExtract(fullSource: string, anchor: string | null | undefined): string | null {
  const a = (anchor ?? "").trim();
  if (nonWsLen(a) < MIN_ANCHOR_NONWS) return null;          // too thin to trust → REJECTED
  const idx = norm(fullSource).indexOf(norm(a));
  if (idx < 0) return null;                                  // anchor not in source (fabricated) → REJECTED
  // Map the normalized hit back to a RAW offset by locating the anchor's first token in the raw source at/after
  // a proportional position — but simplest robust: find the anchor's leading word run in raw source directly.
  const rawIdx = findRawOffset(fullSource, a);
  if (rawIdx < 0) return null;                               // belt-and-suspenders — raw locate failed → REJECTED
  const text = fullSource.slice(rawIdx, rawIdx + LOCATE_WINDOW_CHARS).trim();
  return text.length > 0 ? text : null;
}

/** Find the RAW (un-normalized) offset of `anchor` in `fullSource`, whitespace-insensitively. Returns -1 if not
 *  found. Walks the source once, matching the anchor's non-whitespace char sequence, so it tolerates the
 *  formatting/whitespace differences between the model's copied anchor and the source's exact bytes. */
function findRawOffset(fullSource: string, anchor: string): number {
  const target = anchor.replace(/\s/g, "").toLowerCase();
  if (target.length === 0) return -1;
  let ti = 0, start = -1;
  for (let i = 0; i < fullSource.length; i++) {
    const ch = fullSource[i];
    if (/\s/.test(ch)) continue;
    const c = ch.toLowerCase();
    if (c === target[ti]) {
      if (ti === 0) start = i;
      ti++;
      if (ti === target.length) return start;
    } else {
      // restart; re-test the current char as a fresh start
      ti = 0;
      if (c === target[0]) { start = i; ti = 1; }
    }
  }
  return -1;
}

/** Run the finder over the required-but-not-located section keys. Deterministic given a `finder` stub → $0 test.
 *  Only single-letter UCF keys (A–M) are locatable here; commercial clause tokens (52.212-1/-2) are a separate
 *  clause-presence concern. A finder error is caught → that key is NOT located (fail-safe), logged, never thrown. */
export async function runSectionFinder(opts: {
  fullSource: string;
  targetKeys: string[];
  finder: SectionFinderCall;
  signal?: AbortSignal;
}): Promise<SectionFinderResult> {
  const located: Record<string, string> = {};
  const attempts: LocateAttempt[] = [];
  const keys = opts.targetKeys.filter((k) => /^[A-M]$/.test(k));
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
    const text = verifyAndExtract(opts.fullSource, res.anchor);
    if (text == null) {
      // Claimed located but the anchor did not verify verbatim in source → REJECTED (the fail-safe gate).
      attempts.push({ key, located: false, rejected: true, reason: "anchor did not verify in source (rejected)" });
      continue;
    }
    located[key] = text;
    attempts.push({ key, located: true, rejected: false, reason: "located + verified" });
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
      description: "A VERBATIM phrase (copy exact characters, ≥ ~8 words) from where the section's content BEGINS. Empty string when not located.",
    },
  },
  required: ["located", "anchor"],
} as const;

/** Build the real (PAID) finder — a locate-only structured call. Constructed ONLY when AUDIT_SECTION_FINDER is on
 *  (auditPackage), so flag-OFF is byte-identical (finder undefined ⇒ L3 never runs). Locate, never summarize. */
export function makeSectionFinderCaller(
  callStructured: (args: { model: string; system: string; user: string; schema: object; maxTokens: number; signal?: AbortSignal }) => Promise<string>,
  model: string,
  signal?: AbortSignal,
): SectionFinderCall {
  return async ({ fullSource, sectionKey, sectionIntent }) => {
    const system =
      "You are a locator, not a summarizer. You are given the FULL TEXT of a federal solicitation. Find where a " +
      "specific required section's content begins. Return a VERBATIM anchor: copy the exact characters (at least " +
      "~8 words) from the sentence where that content starts — do not paraphrase, summarize, or invent text. If " +
      "the content is genuinely NOT present in the document, return located=false and an empty anchor. Never guess.";
    const user =
      `Required section §${sectionKey} contains ${sectionIntent}.\n\n` +
      `Locate §${sectionKey} in the document below. Return the verbatim anchor where its content begins, copied ` +
      `exactly from the text. If it is not present, located=false.\n\n---DOCUMENT---\n${fullSource}`;
    const text = await callStructured({ model, system, user, schema: FINDER_SCHEMA, maxTokens: 1024, signal });
    try {
      const parsed = JSON.parse(text) as { located?: boolean; anchor?: string };
      return { located: parsed.located === true, anchor: parsed.anchor ?? null };
    } catch {
      return { located: false, anchor: null }; // unparseable → not located (fail-safe)
    }
  };
}
