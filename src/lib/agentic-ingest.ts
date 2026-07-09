// Agentic ingestion — Stage 1 foundation (deterministic, no LLM, flag-gated OFF).
//
// This is the coverage ledger + SAFE dedup the agentic engine rests on. The
// agentic MAP loop (per-document extraction on a cheap model) iterates THIS
// manifest; the report's "complete review" claim is gated on the ledger.
//
// Adversarially validated (2026-06-22 panel, federal-procurement counsel):
//   - default KEEP. Exclude a version ONLY on byte-identical hash, or an
//     Item-14-proven full replacement (the latter needs the amendment-resolution
//     pass — not done here; here such groups are FLAGGED, never dropped).
//   - SF-30 amendments are mostly incremental patches; dropping a base by
//     filename loses every untouched clause. So version groups => version_unresolved.
//
// Nothing in this module runs an LLM or changes prod behavior. It is consumed
// only when the agentic path is enabled (AUDIT_AGENTIC === "true").

import { createHash } from "node:crypto";
import { classifySectionRoles } from "./sam-attachments";
import { isEnvOn } from "./env-flags";

export type FileRole = "C" | "H" | "L" | "M";

export type CoverageStatus =
  | "operative"            // the single read-worthy copy of its logical doc
  | "duplicate"            // byte-identical to an operative copy → read once
  | "version_unresolved"   // a different version in a multi-version group → KEEP, resolve via Item-14
  | "superseded";          // proven-replaced by a later amendment (resolveAmendments) — excluded with proof

export interface PackageFileInput {
  name: string;
  bytes: Buffer;
}

export interface LedgerEntry {
  name: string;
  hash: string;        // sha256, first 16 hex
  sizeKb: number;
  anchorKey: string;   // logical-document cluster key
  roles: FileRole[];   // section roles inferred from the filename
  isSf30: boolean;     // SF-30 amendment cover sheet
  status: CoverageStatus;
  note: string;
}

export interface CoverageLedger {
  entries: LedgerEntry[];
  logicalDocs: number;
  identicalGroups: number;    // groups with byte-identical copies (safe single-read)
  versionGroups: number;      // groups with differing versions (must resolve, never drop)
  sf30Count: number;
  /** TRUE only when no logical doc has an unresolved version group — i.e. every
   *  doc maps to one operative copy. Gates any "complete review" claim. */
  fullyResolved: boolean;
}

const SECTION_CODE_RE = /\b([jc])[-\s]?(\d{6,7})(?:-(\d{2}))?\b/i;
// Matches common SAM amendment/SF-30 filename shapes, in any order:
// "SF30_Amendment_0001.pdf", "SF-30.pdf", "Amendment 0011.pdf", "Amd_0001.pdf",
// "Mod_0002.pdf", "Solicitation Amendment N0040.pdf". "amendment" must be followed
// by a number (optionally "No."/"N") so a benign "Amendment_to_PWS_guidance.pdf"
// does NOT match; word-boundaries on amd/mod avoid "model"/"amduat".
const SF30_RE = /sf[\s_-]?30|amendment[\s_-]*(?:no\.?\s*|n)?\d|\bamd[\s_-]?\d|\bmod[\s_-]?\d/i;

/** Logical-document cluster key. A version GROUP is formed ONLY by a stable
 *  attachment code (J-…/C-… — a doc-specific identity that survives across
 *  amendments). Without one, we DO NOT cluster on a section-letter or a stripped
 *  stem: two different "Section C" files, or two distinct SF-30 amendment covers,
 *  must never be treated as versions of each other (that path silently
 *  supersedes/drops a binding doc — review finding, 2026-06-22). Fall back to the
 *  FULL normalized filename: identical names still cluster (real re-attachment),
 *  different names never do. Missed version pairs are just read in full (SAFE);
 *  false clusters (which drop binding docs) are eliminated. Pure + deterministic. */
export function anchorKey(name: string): string {
  const n = name.toLowerCase().replace(/\.(pdf|xlsx|docx?|txt)$/i, "");
  const code = SECTION_CODE_RE.exec(n);
  if (code) return `${code[1]}-${code[2]}${code[3] ? "-" + code[3] : ""}`.toUpperCase();
  return n.replace(/[^a-z0-9]+/g, " ").trim().toUpperCase() || "UNKEYED";
}

export const isSf30 = (name: string): boolean => SF30_RE.test(name);

/** Build the coverage ledger for a package. Deterministic, no LLM. Clusters by
 *  logical doc, then within each cluster distinguishes byte-identical copies
 *  (safe to read once) from differing versions (KEEP all; flag for resolution). */
export function buildCoverageLedger(files: PackageFileInput[]): CoverageLedger {
  const recs = files.map((f) => ({
    name: f.name,
    hash: createHash("sha256").update(f.bytes).digest("hex").slice(0, 16),
    sizeKb: Math.round(f.bytes.length / 1024),
    anchorKey: anchorKey(f.name),
    roles: classifySectionRoles(f.name) as FileRole[],
    isSf30: isSf30(f.name),
  }));

  // cluster by logical-doc key
  const clusters = new Map<string, typeof recs>();
  for (const r of recs) {
    const g = clusters.get(r.anchorKey) ?? [];
    g.push(r);
    clusters.set(r.anchorKey, g);
  }

  const entries: LedgerEntry[] = [];
  let identicalGroups = 0;
  let versionGroups = 0;

  for (const [, group] of clusters) {
    const hashes = new Set(group.map((g) => g.hash));
    if (group.length === 1) {
      const r = group[0];
      entries.push({ ...r, status: "operative", note: "single copy" });
      continue;
    }
    if (hashes.size === 1) {
      // byte-identical copies → read ONE, mark the rest duplicate (safe)
      identicalGroups++;
      group.forEach((r, i) =>
        entries.push({
          ...r,
          status: i === 0 ? "operative" : "duplicate",
          note: i === 0 ? `${group.length} byte-identical copies — read once` : "byte-identical duplicate",
        })
      );
      continue;
    }
    // differing versions → KEEP ALL, flag for Item-14 amendment-resolution. NEVER drop by filename.
    versionGroups++;
    group.forEach((r) =>
      entries.push({
        ...r,
        status: "version_unresolved",
        note: `${group.length} differing versions (${hashes.size} distinct) — resolve via SF-30 Item 14; never drop blind`,
      })
    );
  }

  return {
    entries,
    logicalDocs: clusters.size,
    identicalGroups,
    versionGroups,
    sf30Count: recs.filter((r) => r.isSf30).length,
    fullyResolved: versionGroups === 0,
  };
}

// ── Binding-content classifier (panel-validated 2026-06-22) ──────────────────
// A binding "shall" wears an .xlsx costume routinely — wage determinations ARE
// the binding wage floor, custodial inventories hide per-room frequencies, QASP
// tables set payment-deduction thresholds. So: DEFAULT FULL-READ. A document is
// summarize-eligible ONLY when it is a pure-data file (inventory/list) with zero
// obligation language and is not a hard never-summarize type. ADVISORY / NOT YET
// WIRED: the live MAP currently reads EVERY operative doc in full, so this gates
// nothing today. When the summarize-eligible optimization is built, a text=null
// input MUST force full-read (filename alone can't clear a binding obligation).

export interface BindingClassification {
  mustFullRead: boolean;
  reason: string;
  /** WHY mustFullRead was decided — lets a consumer distinguish a POSITIVELY-identified
   *  binding doc ("type" = never-summarize doc type · "obligation" = obligation language in
   *  the body) from the conservative "default" fallback (full-read because not provably
   *  inert) and a "pure-data" summarize candidate. The vacuous-binding honest-fail demotes
   *  ONLY positively-binding docs, so a generically-named legitimately-empty file is not
   *  wrongly flagged a read-failure. */
  source: "type" | "obligation" | "pure-data" | "default";
}

// Hard never-summarize: these carry obligations regardless of format/length.
const NEVER_SUMMARIZE_RE =
  /wage determination|\bwd\b|\bsca\b|\bdba\b|collective bargaining|\bcba\b|statement of work|\bsow\b|\bpws\b|\bsoo\b|performance work statement|\bqasp\b|\bprs\b|\baql\b|performance requirement|\bcdrl\b|deliverable|specification|\bspec\b|service level|special contract requirement/i;

// Obligation language anywhere in the body flips a file to full-read.
const OBLIGATION_LEXICON_RE =
  /\bshall\b|\bmust\b|\bminimum\b|no less than|\brequired\b|\bfrequenc|\bdaily\b|\bweekly\b|\bmonthly\b|\bquarterly\b|\baql\b|acceptable quality|\bwage\b|\bfringe\b|per hour|response time|\bstaffing\b|\bpenalty\b|\bdeduct\b/i;

// A file that LOOKS like pure reference data — only these may be summarized, and
// only when no obligation language is present.
const PURE_DATA_HINT_RE =
  /inventory|\blist\b|schedule of|asset|equipment|furnished property|\belin/i;

/** Decide whether a package document must be read IN FULL or is eligible for a
 *  structured summary. Conservative by construction: full-read unless provably
 *  inert. `text` may be null (not yet extracted) — then we judge on the name and
 *  default to full-read. */
export function classifyBindingContent(name: string, text: string | null): BindingClassification {
  if (NEVER_SUMMARIZE_RE.test(name)) {
    return { mustFullRead: true, reason: "never-summarize document type (WD/CBA/PWS/SOW/QASP/AQL/spec/CDRL/SLA)", source: "type" };
  }
  if (text && OBLIGATION_LEXICON_RE.test(text)) {
    return { mustFullRead: true, reason: "obligation language present (shall/must/frequency/AQL/wage/penalty)", source: "obligation" };
  }
  if (PURE_DATA_HINT_RE.test(name)) {
    return { mustFullRead: false, reason: "pure-data file (inventory/list) with no obligation signals — summarize candidate; still verify columns before summarizing", source: "pure-data" };
  }
  return { mustFullRead: true, reason: "default full-read — not provably inert", source: "default" };
}

// ── Amendment resolution (panel-validated 2026-06-22; FLAG-ONLY) ─────────────
// SF-30 amendments are MOSTLY incremental patches, not full replacements — the
// form itself says everything not named in Item 14 "remains unchanged and in
// full force and effect." Dropping a base by filename loses every untouched
// clause. So this pass NEVER drops: it DETECTS likely full-replacement (Item-14
// language near a doc's code) and records it as a HINT (proofFound /
// likelyOperative / likelySuperseded) for a future LLM Item-14 pass to confirm.
// A deterministic regex over concatenated SF-30 text is too cross-bleed-prone to
// silently supersede a binding document on. All versions stay version_unresolved
// → READ IN FULL (completeness-first). Higher amendment number is a hint only.

export interface AmendmentResolution {
  anchorKey: string;
  proofFound: boolean;            // Item-14 full-replacement language detected near this code
  likelyOperative: string | null; // HINT (latest-amended file) — NOT applied; all versions still read
  likelySuperseded: string[];      // HINT for the future LLM Item-14 pass — NOT dropped here
  proof: string | null;            // verbatim Item-14 evidence (or null)
}

export interface ResolvedLedger extends CoverageLedger {
  resolutions: AmendmentResolution[];
}

/** Parse an amendment number from a filename ("Amendment 0011 …" → 11). Null when
 *  the file carries no amendment number (a base or a plain "revised" copy). */
export function parseAmendmentNumber(name: string): number | null {
  // Real SAM filename shapes: "Amendment 0011", "Amd 0001", "Amd_0001",
  // "Mod 0002", "Modification 3". A bare number after the marker, with common
  // separators (space/underscore/dot/dash) between marker and digits.
  const m = /(?<![a-z])(?:amendment|amend|amd|modification|mod)[\s_.\-]*0*(\d{1,4})\b/i.exec(name);
  return m ? parseInt(m[1], 10) : null;
}

// Explicit full-replacement language. Requires "in its entirety" adjacent to a
// replace/delete/supersede/reissue verb, or "complete(ly) reissued/replaced".
const FULL_REPLACE_RE =
  /(?:delet|supersed|replac|reissu)[a-z]*[\s\S]{0,60}\bin its entiret(?:y|ies)\b|\bin its entiret(?:y|ies)\b[\s\S]{0,60}(?:delet|supersed|replac|reissu)[a-z]*|complete(?:ly)?\s+(?:reissu|replac|supersed)[a-z]*/i;

/** Build a regex that finds this logical doc's section/attachment code in prose. */
function codeMatcher(anchorKey: string): RegExp | null {
  const code = /^([JC])-(\d{6,7})(?:-(\d{2}))?$/.exec(anchorKey);
  if (code) {
    const [, letter, num, suf] = code;
    const sufPart = suf ? `(?:[-\\s]?${suf})?` : "";
    return new RegExp(`${letter}[-\\s]?${num}${sufPart}`, "i");
  }
  const sec = /^SECTION-([A-Z])$/.exec(anchorKey);
  if (sec) return new RegExp(`section\\s+${sec[1]}\\b`, "i");
  return null; // SOLICITATION-FORM / SF30 covers / UNKEYED — not resolvable by code
}

/** Scan version_unresolved groups against the concatenated SF-30 Item-14 text.
 *  FLAG-ONLY: returns the ledger with entries UNCHANGED plus a per-group hint trail
 *  (proofFound / likelyOperative / likelySuperseded). Supersedes NOTHING — all
 *  versions stay read-in-full; the hints feed a future LLM Item-14 confirm pass. */
export function resolveAmendments(ledger: CoverageLedger, amendmentText: string): ResolvedLedger {
  const groups = new Map<string, LedgerEntry[]>();
  for (const e of ledger.entries) {
    if (e.status !== "version_unresolved") continue;
    const g = groups.get(e.anchorKey) ?? [];
    g.push(e);
    groups.set(e.anchorKey, g);
  }

  const resolutions: AmendmentResolution[] = [];
  for (const [anchorKey, group] of groups) {
    const matcher = codeMatcher(anchorKey);
    let proof: string | null = null;
    if (matcher) {
      let m: RegExpExecArray | null;
      const re = new RegExp(matcher.source, "gi");
      while ((m = re.exec(amendmentText)) !== null) {
        const window = amendmentText.slice(Math.max(0, m.index - 250), m.index + 250);
        if (FULL_REPLACE_RE.test(window)) {
          proof = window.replace(/\s+/g, " ").trim().slice(0, 240);
          break;
        }
      }
    }
    // likelyOperative = highest-amendment-numbered file — a HINT only.
    let likelyOperative: string | null = null;
    let maxNum = -1;
    for (const e of group) {
      const n = parseAmendmentNumber(e.name);
      if (n !== null && n > maxNum) { maxNum = n; likelyOperative = e.name; }
    }
    const proofFound = proof !== null;
    resolutions.push({
      anchorKey,
      proofFound,
      likelyOperative,
      likelySuperseded: proofFound && likelyOperative ? group.filter((e) => e.name !== likelyOperative).map((e) => e.name) : [],
      proof,
    });
  }

  // FLAG-ONLY (completeness-first, per CEO mandate + review finding 2026-06-22):
  // nothing is superseded deterministically. All versions stay version_unresolved
  // → READ IN FULL. The likelySuperseded hints feed a future LLM Item-14 pass that
  // can CONFIRM before any drop. A regex proof-match (loose code matcher + a
  // ±250-char window over concatenated SF-30 text) is too cross-bleed-prone to
  // silently drop a binding document on. Coverage never suffers; cost-trim waits.
  return { ...ledger, resolutions };
}

// ── #1 Amendment supersession (Brain #344 — flag AUDIT_AMENDMENT_SUPERSESSION) ─
// resolveAmendments (above) produces HINTS only and drops NOTHING. This pass turns
// a hint into an ACTUAL doc-level drop, but ONLY behind a HARD bar plus a POSITIVE
// FULL-CONTENT subsumption proof — the exact opposite discipline of a filename-only
// drop. It fails TOWARD keep-and-label: a superseded-looking doc we cannot PROVE is
// wholly contained in its successor is RETAINED (read in full) with a "possibly
// superseded" label, never silently dropped.
//
// SCOPE (pre-live review, Gauntlet 2026-07-08): this pass safely handles an ADDITIVE
// amendment — a later complete re-issue whose text is a strict SUPERSET of the base
// (base kept verbatim + new content appended). It DELIBERATELY does NOT drop a base
// whose fields were CHANGED (a moved deadline/POC/CLIN), because the old values are
// by definition absent from the successor → subsumption fails → keep-and-label. A
// changed-field full-replacement drop requires an explicit Item-14 "in its entirety"
// proof (resolveAmendments.proofFound) and is a SEPARATE follow-on (not this pass).
// Flag-OFF ⇒ never runs.
export const AMENDMENT_SUPERSESSION_ENABLED = isEnvOn(process.env.AUDIT_AMENDMENT_SUPERSESSION);

// SF-30 form header language — the markers of the amendment COVER SHEET (block 14 patch form),
// distinct from a complete re-issued document that merely quotes amendment language.
const SF30_FORM_RE = /standard form 30|amendment of solicitation|modification of contract|the above[\s-]?numbered solicitation is amended|item 14/i;
/** Classify a package doc as an SF-30 COVER SHEET (a short field-patch form → field-level #1B,
 *  never a doc-level successor) vs a COMPLETE document. STRICTER than isSf30(name): a long doc
 *  named "Amendment 02.pdf" is a complete re-issue (a valid successor), NOT a cover — the
 *  name-only regex conflates the two and would make #1A no-op on real amendment naming (Gauntlet
 *  F1). A cover is identified by SF-30 form-header language OR a name match on a SHORT file. */
export function isSf30Cover(name: string, text: string): boolean {
  const body = text ?? "";
  if (SF30_FORM_RE.test(body.slice(0, 4000))) return body.length < 20000; // form language + short ⇒ cover; long ⇒ a complete doc that quotes it
  return isSf30(name) && body.length < 6000;                              // name says amendment AND short ⇒ cover; long ⇒ complete re-issue
}

/** Version-cluster key — anchorKey with an AMENDMENT/MOD marker+number stripped
 *  from the free-text stem, so "Synopsis" and "Synopsis Amendment 01" share a key.
 *  SEPARATE from anchorKey (which stays conservative for the coverage ledger — it
 *  deliberately does NOT cluster differently-named versions). Used ONLY to nominate
 *  doc-level supersession CANDIDATES; the 4-part bar + subsumption proof gate any
 *  real drop, and the default is keep-and-label — so a false cluster here can, at
 *  worst, LABEL a retained doc, never drop a binding one. Coded (J-/C-/SECTION-)
 *  keys are left untouched: their "-NN" is a section suffix, not an amendment tag. */
export function versionClusterKey(name: string): string {
  const ak = anchorKey(name);
  if (/^[JC]-/.test(ak) || /^SECTION-/.test(ak)) return ak;
  // Strip a real amendment/mod version marker (marker + number — a bare "AMENDMENT"
  // with no number is not a version tag and is NOT stripped, so "Amendment to PWS"
  // keeps its identity). anchorKey uppercases, so match uppercase markers.
  const stripped = ak
    .replace(/\b(?:AMENDMENT|AMEND|AMD|MODIFICATION|MOD)[\s_.\-]*0*\d{1,4}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || ak;
}

export interface SupersessionInput {
  name: string;
  text: string;
  isSf30: boolean;
}

export interface SupersessionDecision {
  name: string;
  /** superseded → excluded from fullSource (proven fully contained in a later,
   *  higher-numbered complete doc). possibly_superseded → RETAINED + labelled
   *  (a candidate we could not PROVE is subsumed). operative → unaffected. */
  status: "superseded" | "possibly_superseded" | "operative";
  supersededBy: string | null;
  reason: string;
}

// A SUBSTANTIVE line is any real content line (not blank, not a rule/divider). We require the
// successor to contain EVERY substantive line of the base — not just its obligation lines — so a
// base whose unique content is non-obligation DATA (a delivery schedule, CLIN quantities, a POC,
// pricing) can never be silently dropped as "provably superseded" when that data is absent from
// the successor (Gauntlet F4). Obligation-lexicon-only containment was unsafe: it ignored data.
function substantiveLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim().toLowerCase())
    .filter((l) => l.length >= 15 && /[a-z0-9]/.test(l) && !/^[=_\-·•*\s.]+$/.test(l));
}

/** POSITIVE full-content subsumption proof — is `lower` a strict CONTENT SUBSET of `higher`?
 *  TRUE only when EVERY substantive line of the lower appears verbatim (whitespace-normalized) in
 *  the higher — i.e. the higher is an ADDITIVE superset of the lower. A lower with no substantive
 *  lines cannot be proven subsumed (return false → keep) — we never drop on absence of evidence.
 *  ANY line changed/reworded/removed in the later doc fails containment → keep-and-label (the SAFE
 *  direction). Requiring ALL lines (not one boilerplate line) also defeats a coincidental single
 *  substring match — a genuinely distinct doc will not have EVERY line coincidentally present. */
function higherSubsumesLower(higher: string, lower: string): boolean {
  const H = higher.replace(/\s+/g, " ").toLowerCase();
  const lines = substantiveLines(lower);
  if (lines.length === 0) return false;
  // Perf guard (security review 2026-07-08) — full-content containment is O(lines · |H|). On a pathological
  // multi-MB pair, BAIL toward KEEP (the safe direction — never a silent drop, never a quadratic-scan perf
  // cliff) rather than run the scan. ~50M char-ops ≈ well under 100ms; real docs are far below this.
  if (lines.length * H.length > 50_000_000) return false;
  return lines.every((l) => H.includes(l));
}

/** Doc-level (#1A) supersession decision. Clusters docs by versionClusterKey, then
 *  within each multi-version cluster nominates the highest-amendment-numbered COMPLETE
 *  doc as operative and evaluates each lower COMPLETE doc against the HARD bar:
 *    (1) same version cluster · (2) both are complete docs (neither an SF-30 cover, per
 *    isSf30Cover — a CONTENT check, not the name-only isSf30) · (3) strictly-higher
 *    amendment number on the successor · (4) the successor is an ADDITIVE superset —
 *    it contains EVERY substantive line of the lower (full-content subsumption).
 *  ALL four ⇒ superseded (drop with proof). Any missing ⇒ possibly_superseded when a
 *  version marker is present (keep + label), else operative. Pure + deterministic.
 *  SF-30 covers are field-level (#1B) — routed out here, never doc-level dropped.
 *  NOTE: `isSf30` on SupersessionInput means "is an SF-30 COVER" (compute via isSf30Cover). */
export function resolveDocSupersession(docs: SupersessionInput[]): SupersessionDecision[] {
  const clusters = new Map<string, SupersessionInput[]>();
  for (const d of docs) {
    const k = versionClusterKey(d.name);
    const g = clusters.get(k) ?? [];
    g.push(d);
    clusters.set(k, g);
  }

  const byName = new Map<string, SupersessionDecision>();
  for (const d of docs) byName.set(d.name, { name: d.name, status: "operative", supersededBy: null, reason: "" });

  for (const group of clusters.values()) {
    if (group.length < 2) continue;
    // The successor: highest amendment-numbered COMPLETE doc in the cluster.
    let successor: SupersessionInput | null = null;
    let maxNum = -1;
    for (const d of group) {
      if (d.isSf30) continue; // (2) an SF-30 cover is never a doc-level successor — #1B handles its field patches
      const n = parseAmendmentNumber(d.name);
      if (n !== null && n > maxNum) { maxNum = n; successor = d; }
    }
    if (!successor) continue; // no numbered complete successor → nothing to supersede against
    for (const d of group) {
      if (d.name === successor.name) continue;
      const dec = byName.get(d.name)!;
      const n = parseAmendmentNumber(d.name);
      // (2) SF-30 cover in the cluster stays operative (field-level #1B, not dropped here).
      if (d.isSf30) { dec.reason = "SF-30 cover — field-level (#1B), retained"; continue; }
      // (3) strictly-higher successor number.
      if (n !== null && n >= maxNum) continue; // same/greater number → not a lower version
      // (4) positive subsumption proof.
      if (higherSubsumesLower(successor.text, d.text)) {
        dec.status = "superseded";
        dec.supersededBy = successor.name;
        dec.reason = `fully subsumed by higher amendment ${successor.name} (every substantive line present — additive superset) — dropped with proof`;
      } else {
        dec.status = "possibly_superseded";
        dec.supersededBy = successor.name;
        dec.reason = `later version ${successor.name} present but does not provably contain all content (changed/removed line) — RETAINED + labelled (fail-toward-keep)`;
      }
    }
  }

  return Array.from(byName.values());
}

/** Flag-gate for the agentic path. OFF by default — prod is unchanged until the
 *  full build is reviewed (code-review + expert panels) and proven on a live run. */
export const AGENTIC_INGEST_ENABLED = isEnvOn(process.env.AUDIT_AGENTIC);
