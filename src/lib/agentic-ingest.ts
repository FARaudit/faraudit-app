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
// "Mod_0002.pdf", "Solicitation Amendment N0040.pdf". Word-boundaries on the
// short tokens (amd/mod) avoid matching "model"/"amduat" etc.
const SF30_RE = /sf[\s_-]?30|amendment|solicitation amendment|\bamd[\s_-]?\d|\bmod[\s_-]?\d/i;

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

const isSf30 = (name: string): boolean => SF30_RE.test(name);

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
    return { mustFullRead: true, reason: "never-summarize document type (WD/CBA/PWS/SOW/QASP/AQL/spec/CDRL/SLA)" };
  }
  if (text && OBLIGATION_LEXICON_RE.test(text)) {
    return { mustFullRead: true, reason: "obligation language present (shall/must/frequency/AQL/wage/penalty)" };
  }
  if (PURE_DATA_HINT_RE.test(name)) {
    return { mustFullRead: false, reason: "pure-data file (inventory/list) with no obligation signals — summarize candidate; still verify columns before summarizing" };
  }
  return { mustFullRead: true, reason: "default full-read — not provably inert" };
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

/** Flag-gate for the agentic path. OFF by default — prod is unchanged until the
 *  full build is reviewed (code-review + expert panels) and proven on a live run. */
export const AGENTIC_INGEST_ENABLED = process.env.AUDIT_AGENTIC === "true";
