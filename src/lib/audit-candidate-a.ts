// ── ENGINE BAKE-OFF (F) · CANDIDATE A — LLM-native judgment, grounded via the Citations API ───────────
// Brain card 303 (F BAKE-OFF APPROVED) + card 308 ("cheap PROVES, correct FIXES"). Master doc:
// ceo/ENGINE-BAKEOFF.md. Candidate A REPLACES the JUDGMENT LAYER ONLY — how coverage/grounding of the
// binding obligations is judged. It NEVER emits a verdict: it FEEDS VerdictInputs to deriveVerdict
// (audit-decide.ts), which stays the SOLE verdict authority (audit-findings.ts:152).
//
// WHY CITATIONS (card 308 ruling): grounding uses the NATIVE Citations API (`citations:{enabled:true}` on
// the document block). The API returns API-verified `cited_text` spans anchored to the exact source. Those
// spans ARE the evidence objects — each finding carries an API-anchored source span; NO hand-rolled n-gram
// matcher is layered on top (the MiniCheck-style secondary signal is SUPERSEDED). A finding with no backing
// citation is DROPPED (native grounding is the gate — same fail-safe as isGrounded, now native).
//
// WHY PARSE-FROM-TEXT (fork a): Citations × structured-outputs (`output_config.format`) are INCOMPATIBLE —
// the API returns 400 (verified in the Citations docs: "citations require interleaving citation blocks with
// text output, incompatible with the strict JSON schema constraints of structured outputs"). So Candidate A
// uses Citations and PARSES its typed findings from a strict `<finding>` tag convention in the response text;
// a deterministic validator + ONE bounded retry → then a HARD honest-fail for that record (a scored bake-off
// cost, never a silently degraded result).
//
// BINDING FRAME (card 303, carried UNCHANGED into A): four-walls NO_BID · citation-grounded committal
// findings · NO numeric confidence scores · fail-toward-disqualifier (ambiguous importance → NHR). The
// MANIFEST / READABILITY GATE stays DETERMINISTIC + PRE-VERDICT + UPSTREAM in BOTH candidates — Candidate A
// never touches documentsComplete / manifestComplete / detectedUnverifiableEligibilityGate; the bake-off
// runner carries those verbatim from the deterministic engine.
//
// AMENDMENT A (card 304): Candidate A may emit citation-grounded `unreadEvidence[]` (referenced material it
// observes absent from the input). NO verdict authority — deriveVerdict routes it to NEEDS_HUMAN_REVIEW
// (audit-decide.ts:1c). Already built into VerdictInputs.
//
// FLAG: AUDIT_CANDIDATE_A (default OFF). Nothing is wired into the orchestrator yet — the bake-off runs A on
// already-captured records (ingest FROZEN for the bake-off). Flag OFF ⇒ this module is inert.

import type { RequirementKind, Controllability, TypedFinding, VerdictInputs } from "./audit-findings";
import { isEnvOn } from "./env-flags";

export const CANDIDATE_A_ENABLED = isEnvOn(process.env.AUDIT_CANDIDATE_A);

// ── Native Citations response shape (local mirror; mirrors audit-expert.ts SdkBlock — no SDK type coupling).
//    Only the fields Candidate A reads are modeled. document_title is nullable per the API.
export type CitationLoc =
  | { type: "char_location"; cited_text: string; document_index: number; document_title?: string | null; start_char_index: number; end_char_index: number }
  | { type: "page_location"; cited_text: string; document_index: number; document_title?: string | null; start_page_number: number; end_page_number: number }
  | { type: "content_block_location"; cited_text: string; document_index: number; document_title?: string | null; start_block_index: number; end_block_index: number };

/** One text block of a Citations response — carries the model's text and any API-verified spans it grounds. */
export interface CitedTextBlock { type: string; text?: string; citations?: CitationLoc[] | null }

/** The judgment Candidate A produces for ONE package. FEEDS VerdictInputs — never a verdict. */
export interface CandidateAJudgment {
  findings: TypedFinding[];                        // grounded (native citation-backed) typed facts
  unreadEvidence: Array<{ citation: string; note: string }>; // Amendment A (card 304) — no verdict authority
  coverageComplete: boolean;                       // the JUDGMENT-layer coverage call (replaces the verbatim-veto)
  coverageReason: string;
  parseFailed: boolean;                            // true ⇒ HARD honest-fail for this record (a scored bake-off cost)
  parseFailReason?: string;
  citationsBound: number;                          // API-verified spans bound to a surviving finding
  droppedUngrounded: number;                       // findings the model asserted but NO citation backed → dropped
}

const KINDS = new Set<RequirementKind>([
  "eligibility_bar", "technical_spec", "pricing", "submission", "past_performance",
  "clause_flowdown", "boilerplate", "procedural_obligation", "other",
]);
const CONTROLS = new Set<Controllability>([
  "bidder_controls", "bidder_cannot_move", "no_one_can_move", "already_satisfied",
]);

/** Normalize whitespace for grounding-overlap comparison (the API's cited_text and the model's inline quote
 *  may differ only in whitespace runs). Lowercased so a case-only difference never fails grounding. */
const norm = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

/** A finding's inline evidence quote is GROUNDED iff an API citation's cited_text overlaps it materially:
 *  one contains the other after whitespace/case normalization, and the shared span is ≥ 12 chars (a floor
 *  that stops a stray common word from counting as grounding — same spirit as isGrounded's length gate). */
function citationGroundsQuote(quote: string, cited: string): boolean {
  const q = norm(quote), c = norm(cited);
  if (c.length < 12 || q.length < 12) return false;
  return q.includes(c) || c.includes(q);
}

interface ParsedFindingTag {
  attrs: Record<string, string>;
  requirement: string;
  citation: string;
  evidence: string;
  range: [number, number]; // [start, end) in the concatenated response text
}

const FINDING_RE = /<finding\b([^>]*)>([\s\S]*?)<\/finding>/gi;
const COVERAGE_RE = /<coverage\b([^>]*)\/?>/i;
const UNREAD_RE = /<unread\b([^>]*)\/?>/gi;
const ATTR_RE = /([a-zA-Z_]+)\s*=\s*"([^"]*)"/g;

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(raw)) !== null) out[m[1].toLowerCase()] = m[2];
  return out;
}

/** Pull a `label: value` line out of a finding body (single line; stops at the next `label:` or tag end). */
function field(body: string, label: string): string {
  const re = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*[a-z_]+\\s*:|$)`, "i");
  const m = re.exec(body);
  return m ? m[1].trim() : "";
}

/** Strip surrounding quotes from an evidence value the model wrapped in "..." (the convention). */
function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("“") && t.endsWith("”")))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/**
 * PURE parser + native grounder. Takes the raw Citations response blocks and produces the Candidate-A
 * judgment. Deterministic — NO model call, so the bake-off can $0-unit-test every branch with fixtures.
 *
 * Algorithm:
 *  1. Concatenate every text block into one string, recording each block's [offset,end) span + its citations.
 *  2. Regex-scan the concatenation for <finding …>…</finding> tags → typed fields + the tag's char range.
 *  3. Bind citations to a finding when the OWNING block overlaps the finding's tag range (the Citations API
 *     splits the response at citation boundaries, so a finding's inline quote lands in its own cited block).
 *  4. GROUND: keep a finding only if ≥1 bound citation's cited_text overlaps the finding's evidence quote;
 *     adopt that cited_text as the authoritative `excerpt` (the native evidence object). Drop otherwise.
 *  5. Read the <coverage complete=…/> judgment and any <unread …/> (Amendment A) tags.
 *  6. parseFailed ⇒ NO parseable <coverage> tag (can't extract the judgment contract) OR zero well-formed
 *     <finding> tags AND no coverage tag. An empty-but-coverage-tagged response is NOT a failure (a clean
 *     package legitimately yields no findings; deriveVerdict's verified-floor handles the empty set).
 */
export function parseCandidateAResponse(blocks: CitedTextBlock[]): CandidateAJudgment {
  // 1. Concatenate; record per-block [offset,end) + citations.
  const parts: Array<{ start: number; end: number; citations: CitationLoc[] }> = [];
  let full = "";
  for (const b of blocks) {
    const text = typeof b.text === "string" ? b.text : "";
    const start = full.length;
    full += text;
    parts.push({ start, end: full.length, citations: Array.isArray(b.citations) ? b.citations : [] });
  }

  // 5a. Coverage judgment — the JUDGMENT-layer contract. Its absence is a parse failure.
  const covM = COVERAGE_RE.exec(full);
  const coverageAttrs = covM ? parseAttrs(covM[1]) : null;

  // 2. Finding tags.
  const tags: ParsedFindingTag[] = [];
  let fm: RegExpExecArray | null;
  FINDING_RE.lastIndex = 0;
  while ((fm = FINDING_RE.exec(full)) !== null) {
    const body = fm[2];
    tags.push({
      attrs: parseAttrs(fm[1]),
      requirement: field(body, "requirement"),
      citation: field(body, "citation"),
      evidence: unquote(field(body, "evidence")),
      range: [fm.index, fm.index + fm[0].length],
    });
  }

  // Parse-failure gate (6): no coverage tag is fatal — we cannot extract the judgment.
  if (!coverageAttrs || (coverageAttrs.complete !== "true" && coverageAttrs.complete !== "false")) {
    return {
      findings: [], unreadEvidence: [], coverageComplete: false, coverageReason: "",
      parseFailed: true, parseFailReason: "no parseable <coverage complete=\"true|false\"…> judgment tag",
      citationsBound: 0, droppedUngrounded: 0,
    };
  }

  // 3 + 4. Bind citations by block overlap, then ground.
  const findings: TypedFinding[] = [];
  let citationsBound = 0, droppedUngrounded = 0;
  tags.forEach((tag, i) => {
    const [fs, fe] = tag.range;
    const bound: CitationLoc[] = [];
    for (const p of parts) {
      if (p.start < fe && p.end > fs) bound.push(...p.citations); // block overlaps the finding tag range
    }
    // Native grounding: a citation whose cited_text overlaps the finding's inline evidence quote.
    const backing = bound.find((c) => citationGroundsQuote(tag.evidence, c.cited_text));
    if (!backing) { droppedUngrounded++; return; } // NO citation backs it → drop (native grounding gate)
    citationsBound++;

    const kind = (KINDS.has(tag.attrs.kind as RequirementKind) ? tag.attrs.kind : "other") as RequirementKind;
    const controllability = (CONTROLS.has(tag.attrs.controllability as Controllability)
      ? tag.attrs.controllability : "bidder_controls") as Controllability;
    const requirement = tag.requirement || tag.evidence.slice(0, 160);
    const f: TypedFinding = {
      id: `candidate-a#${i}`,
      requirement,
      citation: tag.citation,
      excerpt: backing.cited_text,   // the API-VERIFIED span IS the evidence object
      kind,
      controllability,
      grounded: true,                // native citation-backed (never a model prior)
      lens: "candidate-a",
    };
    if (tag.attrs.requiredattribute) f.requiredAttribute = tag.attrs.requiredattribute;
    // curableInWindow: REQUIRED for a bidder_cannot_move bar; undefined ⇒ deriveVerdict fails-closed to NHR.
    if (tag.attrs.curableinwindow === "true") f.curableInWindow = true;
    else if (tag.attrs.curableinwindow === "false") f.curableInWindow = false;
    if (tag.attrs.severity === "P0" || tag.attrs.severity === "P1" || tag.attrs.severity === "P2") {
      f.severity = tag.attrs.severity;
    }
    findings.push(f);
  });

  // 5b. Amendment A — unread/missing referenced material the model observed.
  const unreadEvidence: Array<{ citation: string; note: string }> = [];
  let um: RegExpExecArray | null;
  UNREAD_RE.lastIndex = 0;
  while ((um = UNREAD_RE.exec(full)) !== null) {
    const a = parseAttrs(um[1]);
    if (a.note) unreadEvidence.push({ citation: a.citation || "", note: a.note });
  }

  return {
    findings,
    unreadEvidence,
    coverageComplete: coverageAttrs.complete === "true",
    coverageReason: coverageAttrs.reason || "",
    parseFailed: false,
    citationsBound,
    droppedUngrounded,
  };
}

// ── The Citations request builder + the paid judgment call ────────────────────────────────────────────

/** System prompt for Candidate A. Encodes the binding frame (card 303) + the strict tag convention the parser
 *  reads. Deliberately prescriptive on OUTPUT SHAPE only — the JUDGMENT is the model's. */
export const CANDIDATE_A_SYSTEM = [
  "You are the judgment layer of a federal-solicitation audit engine. A trusted document is provided with the",
  "Citations API enabled. Read the ACTUAL source. Identify every BINDING obligation and emit it as a typed",
  "finding, GROUNDED by a VERBATIM quote from the source (the Citations API will anchor each quote to the",
  "document). Then render a single coverage judgment. You do NOT decide the final verdict — a deterministic",
  "layer does. Your job is grounded FACTS + a coverage judgment.",
  "",
  "Emit ONE <finding> block per binding obligation, in this EXACT shape (attributes then a body):",
  '  <finding kind="KIND" controllability="CONTROL" requiredAttribute="…" curableInWindow="true|false" severity="P0|P1|P2">',
  "  requirement: <the obligation in plain language>",
  "  citation: <FAR/DFARS clause or section reference, exactly as it appears in the source>",
  '  evidence: "<EXACT verbatim span copied from the source that proves this obligation exists>"',
  "  </finding>",
  "",
  "KIND ∈ eligibility_bar | technical_spec | pricing | submission | past_performance | clause_flowdown | boilerplate | other.",
  "CONTROL ∈ bidder_controls (do-the-work gate) | bidder_cannot_move (PROFILE-dependent bar this firm must HOLD —",
  "  REQUIRES requiredAttribute AND curableInWindow) | no_one_can_move (UNIVERSAL impossibility disqualifying every",
  "  offeror) | already_satisfied. When importance/typing is ambiguous, type conservatively toward the more",
  "  disqualifying reading — never downplay a possible bar (fail toward the disqualifier).",
  "Do NOT emit numeric confidence scores. Do NOT decide BID/NO_BID/INCOMPLETE. Ground EVERY finding — an",
  "obligation you cannot quote verbatim from THIS source must not be emitted.",
  "",
  "If you observe a referenced attachment/exhibit/document that is NOT present in the provided source, emit:",
  '  <unread citation="<what is referenced>" note="<why it appears missing>"/>',
  "",
  "Finally, emit EXACTLY ONE coverage judgment tag (this is mandatory — the parser fails the run without it):",
  '  <coverage complete="true|false" reason="<one line: was every binding section/obligation readable and grounded?>"/>',
  'Set complete="false" only when a binding portion of the source was genuinely unreadable/absent — NOT merely',
  "because some routine boilerplate went unquoted.",
].join("\n");

const CANDIDATE_A_TASK =
  "Audit this solicitation. Emit grounded <finding> blocks for every binding obligation, any <unread> tags, " +
  "and exactly one <coverage> judgment. Ground every finding in a verbatim source quote.";

export interface CandidateAUsage { model: string; input_tokens: number; output_tokens: number; cache_write: number; cache_read: number; }
type SdkUsage = { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
type SdkResp = { content: CitedTextBlock[]; stop_reason?: string; usage?: SdkUsage };
type SdkClient = { messages: { create: (a: Record<string, unknown>, opts?: { signal?: AbortSignal }) => Promise<SdkResp> } };

/** Build the Citations-enabled Messages request. Source as a plain-text document block with
 *  `citations:{enabled:true}` (sentence chunking → char_location spans) + `cache_control` so a re-rep reads
 *  the source from cache. NO output_config.format (Citations ⊥ structured outputs → 400). */
export function buildCandidateARequest(source: string, model: string, opts?: { maxTokens?: number; title?: string }): Record<string, unknown> {
  return {
    model,
    max_tokens: opts?.maxTokens ?? 16000,
    system: CANDIDATE_A_SYSTEM,
    thinking: { type: "adaptive" }, // opus-4-8 judgment call — adaptive thinking (Citations is compatible with thinking)
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "text", media_type: "text/plain", data: source },
            title: opts?.title ?? "Solicitation",
            context: "The full assembled solicitation package under audit.",
            citations: { enabled: true },
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: CANDIDATE_A_TASK },
        ],
      },
    ],
  };
}

/**
 * The PAID Candidate-A judgment call for ONE package. Calls Citations once → parses; on parseFailed, ONE
 * bounded retry; still failed ⇒ hard honest-fail (parseFailed:true, a scored bake-off cost). Usage from BOTH
 * attempts is tallied. Never throws on a parse failure — it RECORDS it (the bake-off scores parse failures).
 */
export async function runCandidateA(
  client: SdkClient,
  model: string,
  args: { source: string; title?: string; signal?: AbortSignal; onUsage?: (u: CandidateAUsage) => void; maxTokens?: number },
): Promise<CandidateAJudgment & { attempts: number }> {
  const req = buildCandidateARequest(args.source, model, { maxTokens: args.maxTokens, title: args.title });
  const tally = (r: SdkResp) => {
    if (!r.usage || !args.onUsage) return;
    try {
      args.onUsage({
        model,
        input_tokens: r.usage.input_tokens ?? 0,
        output_tokens: r.usage.output_tokens ?? 0,
        cache_write: r.usage.cache_creation_input_tokens ?? 0,
        cache_read: r.usage.cache_read_input_tokens ?? 0,
      });
    } catch { /* never let cost capture break a run */ }
  };

  let attempts = 0;
  let last: CandidateAJudgment | null = null;
  for (attempts = 1; attempts <= 2; attempts++) {
    const resp = await client.messages.create(req, args.signal ? { signal: args.signal } : undefined);
    tally(resp);
    const judged = parseCandidateAResponse(resp.content ?? []);
    last = judged;
    if (!judged.parseFailed) return { ...judged, attempts };
    // parseFailed → ONE bounded retry (same request), then hard honest-fail on the 2nd failure.
  }
  return { ...(last as CandidateAJudgment), attempts };
}

// ── VerdictInputs assembly + HARD GUARDRAIL + Amendment B (all PURE — the bake-off runner uses these) ──

/** The DETERMINISTIC manifest/readability-gate signals, carried VERBATIM into both candidates (card 303).
 *  Candidate A never computes these — the deterministic engine does (documentsComplete, manifestComplete,
 *  detectedUnverifiableEligibilityGate). They fire INCOMPLETE PRE-VERDICT identically in A and B. */
export interface DeterministicGate {
  bidderProfile: VerdictInputs["bidderProfile"];
  manifestComplete?: boolean;
  documentsComplete?: boolean;
  detectedUnverifiableEligibilityGate?: boolean;
  source?: string;
}

/** Assemble the VerdictInputs Candidate A FEEDS to deriveVerdict. A supplies ONLY the judgment layer
 *  (findings + coverageComplete + unreadEvidence); every manifest/readability signal is carried verbatim
 *  from the deterministic gate. verifierSound=true (native Citations grounding IS the verification — a
 *  finding that survived is API-anchored) and conflict=false (single judgment, no multi-lens reconciliation).
 *  deriveVerdict remains the sole verdict authority. */
export function assembleVerdictInputs(judgment: CandidateAJudgment, gate: DeterministicGate): VerdictInputs {
  return {
    findings: judgment.findings,
    bidderProfile: gate.bidderProfile,
    coverageComplete: judgment.coverageComplete,
    verifierSound: true,
    conflict: false,
    manifestComplete: gate.manifestComplete,
    documentsComplete: gate.documentsComplete,
    detectedUnverifiableEligibilityGate: gate.detectedUnverifiableEligibilityGate,
    source: gate.source,
    unreadEvidence: judgment.unreadEvidence.length ? judgment.unreadEvidence : undefined,
  };
}

/** A finding is COMMITTAL-SHAPED when it could drive a committal pole (a disqualifying bar or a universal
 *  impossibility). boilerplate / already_satisfied / bidder_controls are gates-to-clear, not committal. */
export function isCommittalShaped(f: TypedFinding): boolean {
  return f.controllability === "bidder_cannot_move" || f.controllability === "no_one_can_move";
}

/** HARD GUARDRAIL (card 304): if the DETERMINISTIC manifest gate flagged the package (unreadable/incomplete),
 *  Candidate A must NOT have produced a committal-shaped judgment over it — a package the gate flagged cannot
 *  be decided over. If it did (coverageComplete AND a committal-shaped finding), that is a HARD RUN FAILURE
 *  (assertion), NOT a scored result. Throws so the bake-off runner records a run failure, never a data point. */
export function assertManifestGuardrail(judgment: CandidateAJudgment, manifestFlagged: boolean, packageId: string): void {
  if (!manifestFlagged) return;
  if (judgment.coverageComplete && judgment.findings.some(isCommittalShaped)) {
    throw new Error(
      `Candidate-A HARD GUARDRAIL (card 304): package '${packageId}' was FLAGGED by the deterministic manifest/readability ` +
      "gate, yet Candidate A emitted a committal-shaped judgment (coverageComplete + a bidder_cannot_move/no_one_can_move " +
      "finding). A flagged package cannot be decided over — this is a run failure, not a scored result.",
    );
  }
}

/** AMENDMENT B (card 304): two reps of the same record DISAGREE on a committal-relevant judgment when they
 *  differ on coverageComplete OR on the multiset of committal-shaped findings' (kind, controllability). Such a
 *  record resolves in the AMBIGUOUS → NHR direction and increments the candidate's `instability` count
 *  (a tie-breaker metric alongside OVER_ABSTAIN). Pure — the runner calls this across rep pairs. */
export function repsDisagreeOnCommittal(a: CandidateAJudgment, b: CandidateAJudgment): boolean {
  if (a.parseFailed !== b.parseFailed) return true;
  if (a.coverageComplete !== b.coverageComplete) return true;
  const key = (j: CandidateAJudgment) =>
    j.findings.filter(isCommittalShaped).map((f) => `${f.kind}:${f.controllability}`).sort().join("|");
  return key(a) !== key(b);
}
