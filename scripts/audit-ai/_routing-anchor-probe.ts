// $0 READ-ONLY ROUTING PROBE — reassembles one notice's fullSource through the SAME entry points the
// worker uses (downloads only, NO model call, NO audit, NO paid run) and prints, anchor by anchor, what
// stage-04 routing actually locates.
//
// WHY: run e5f177aa (W911SG27BA002) logged
//   [routing] sections routed: [B,C,L,M] · chars/lens: [B:2825434,C:2825434,L:12075,M:2825434]
//             · fallback: WHOLE-SOURCE (#525 — a lens would be starved; legacy L&M predicate)
// Three lenses each received the entire 2.8M-char package. The open question is whether that is a
// PREDICATE problem (fixable by arming AUDIT_COMMERCIAL_ROUTING_V2) or an ANCHOR-DETECTION problem
// (needs code). Only the anchors themselves answer it. Rule 68 forbids re-firing the audit to look.
//
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_routing-anchor-probe.ts
//
// The assembled source is cached to PROBE_CACHE so re-runs are instant and cost nothing at all.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import fs from "node:fs";
import path from "node:path";
import { assembleSamDocumentSet } from "../../src/lib/sam-attachments";
import { buildAgenticDocs, NOTICE_BODY_DOC_NAME } from "../../src/lib/agentic-executor";
import { assembleFullSourceLossless } from "../../src/lib/agentic-lossless-ingest";
import { detectSections } from "../../src/lib/section-boundary-detector";
import {
  detectDocumentClass,
  ucfHeaderKeys,
  ucfHeaderCount,
  checkBiddableContent,
  routeCommercialSections,
} from "../../src/lib/panel-doc-class";
import { commercialRoutingSafe, anyLensStarvedUnderLiveMap } from "../../src/lib/panel-adapter";
import { LENS_SECTIONS_COMMERCIAL } from "../../src/lib/agentic-sections";

const NOTICE = process.env.PROBE_NOTICE_ID ?? "8799e548c40f4ecb91187408ce877023";
const SOL = process.env.PROBE_SOL ?? "W911SG27BA002";
const CACHE = process.env.PROBE_CACHE ?? `/tmp/routing-probe-${SOL}.fullsource.txt`;

// The live anchor sets, transcribed from panel-doc-class.ts. Kept here (rather than exported) so the probe
// reports PER-ANCHOR positions, which routeCommercialSections only returns in aggregate. Every claim the
// probe makes about placement is cross-checked against the module's own routeCommercialSections output
// below, so a stale transcription cannot silently mislead.
const V1: Array<{ key: string; re: RegExp }> = [
  { key: "L", re: /instructions? to (?:offerors|quoters)|submission (?:instructions|requirements)|section l\b/i },
  { key: "M", re: /evaluation (?:criteria|factors?)|basis (?:for|of) award|section m\b/i },
  { key: "C", re: /statement of work|performance work statement|scope of work|description\/specifications|section c\b/i },
  { key: "B", re: /schedule of (?:items|supplies|prices)|supplies\/services|price schedule|section b\b|supplies or services and prices/i },
  { key: "I", re: /contract clauses|clauses incorporated (?:by reference)?|section i\b/i },
];
const V2: Array<{ key: string; re: RegExp }> = [
  { key: "L", re: /instructions? to (?:offerors|quoters)|submission (?:instructions|requirements)|section l\b|proposal shall (?:contain|include|consist)|offerors?\s+shall\s+(?:submit|furnish|provide)|\bvolume\s+(?:[ivx]+|[1-9])\s*[:\-.]|(?:shall|must)\s+(?:provide|furnish|submit)[^.]{0,50}(?:as part of|with)\s+(?:its|the|your)?\s*(?:offer|quote|proposal)/i },
  { key: "M", re: /evaluation (?:criteria|factors?)|basis (?:for|of) award|section m\b|lowest[- ]priced?[, ]+technically acceptable|award (?:will|shall) be made/i },
  { key: "C", re: /statement of work|performance work statement|scope of work|description\/specifications|section c\b/i },
  { key: "B", re: /schedule of (?:items|supplies|prices)|supplies\/services|price schedule|section b\b|supplies or services and prices|contract line items?\s+(?:number|schedule)/i },
  { key: "I", re: /contract clauses|clauses incorporated (?:by reference)?|section i\b/i },
];

const SEARCH = "postedFrom=07/01/2026&postedTo=08/06/2026&limit=100&offset=0&ptype=o,k,r";

async function noticeRecord(): Promise<Record<string, unknown> | null> {
  const KEY = process.env.SAM_API_KEY;
  if (!KEY) return null;
  const r = await fetch(`https://sam.gov/api/prod/opportunities/v2/search?api_key=${KEY}&${SEARCH}&solnum=${SOL}`, { headers: { Accept: "application/json" } });
  if (!r.ok) return null;
  const j = await r.json();
  return (j.opportunitiesData ?? [])[0] ?? null;
}

/** The notice body exactly as FA-148 resolves it — a noticedesc URL is dereferenced, never used as text. */
async function noticeDescription(rec: Record<string, unknown> | null): Promise<string> {
  const KEY = process.env.SAM_API_KEY;
  const d = rec?.description;
  if (!KEY || typeof d !== "string" || !d.trim()) return "";
  if (!/^https?:\/\//i.test(d.trim())) return d;
  const rr = await fetch(`${d}${d.includes("?") ? "&" : "?"}api_key=${KEY}`, { headers: { Accept: "application/json" } });
  if (!rr.ok) return "";
  const jj = await rr.json().catch(() => null);
  return typeof jj?.description === "string" ? jj.description : "";
}

/** Every match position for one anchor, with a short verbatim context window. */
function matches(src: string, re: RegExp, cap = 6): Array<{ pos: number; text: string }> {
  const out: Array<{ pos: number; text: string }> = [];
  for (const m of src.matchAll(new RegExp(re.source, "ig"))) {
    const pos = m.index ?? 0;
    out.push({ pos, text: out.length < cap ? src.slice(pos, pos + 70).replace(/\s+/g, " ") : "" });
  }
  return out;
}

function report(label: string, src: string, anchors: Array<{ key: string; re: RegExp }>, v2: boolean) {
  console.log(`\n══ ${label} — PER-ANCHOR PLACEMENT ══`);
  for (const a of anchors) {
    const ms = matches(src, a.re);
    if (ms.length === 0) { console.log(`  §${a.key}  ✗ NO MATCH ANYWHERE IN SOURCE`); continue; }
    console.log(`  §${a.key}  ✓ ${ms.length} hit(s) · first @ ${ms[0].pos} (${((ms[0].pos / src.length) * 100).toFixed(1)}% in)`);
    for (const h of ms.slice(0, 3)) if (h.text) console.log(`        @${String(h.pos).padStart(8)}  "${h.text}"`);
  }
  const routed = routeCommercialSections(src, { v2 });
  const sizes = Object.entries(routed.sectionText).map(([k, v]) => `${k}:${v.length}`).join(", ");
  console.log(`  ── routeCommercialSections(v2=${v2}) → placedKeys=[${routed.placedKeys.join(",")}] · sizes {${sizes}}`);
  console.log(`     legacy predicate  routed (L AND M placed) : ${routed.routed}`);
  console.log(`     #525 predicate    commercialRoutingSafe   : ${commercialRoutingSafe(routed.placedKeys)}`);
  console.log(`     head(pre-first-anchor) : ${routed.headChars} chars · covered=${routed.headCovered}`);
  // WHICH lens would starve, NAMED — the live log only ever says "a lens would be starved".
  const placed = new Set(routed.placedKeys);
  for (const [lens, assigned] of Object.entries(LENS_SECTIONS_COMMERCIAL)) {
    const own = assigned.filter((k) => ["B", "C", "I", "L", "M"].includes(k));
    if (own.length > 0 && !own.some((k) => placed.has(k))) console.log(`     ⚠ STARVED: ${lens} owns [${own.join(",")}], received none of them`);
  }
  console.log(`     anyLensStarvedUnderLiveMap(placedKeys) : ${anyLensStarvedUnderLiveMap(routed.placedKeys)}`);
  return routed;
}

async function main() {
  let src: string;
  if (fs.existsSync(CACHE)) {
    src = fs.readFileSync(CACHE, "utf8");
    console.log(`fullSource from CACHE ${CACHE} — ${src.length} chars (delete the file to re-download)`);
  } else {
    const rec = await noticeRecord();
    const links = (rec?.resourceLinks as string[] | undefined) ?? [];
    console.log(`v2 resourceLinks advertised: ${links.length}`);
    const set = await assembleSamDocumentSet(NOTICE, SOL, links);
    if (!set?.primary) { console.error("assembleSamDocumentSet returned no primary — cannot build fullSource"); process.exit(1); }
    console.log(`ingest: ${set.ingestion.files_ingested}/${set.ingestion.files_total} · primary=${set.primary.name}`);
    const body = await noticeDescription(rec);
    const docs = await buildAgenticDocs({
      primaryName: set.primary.name,
      primaryBytes: set.primary.buffer,
      primaryText: set.primary.text ?? null,
      attachments: set.attachments?.map((a) => ({ name: a.name, base64: a.base64, text: a.text ?? null })) ?? null,
      noticeBody: body.trim() ? { text: body, name: NOTICE_BODY_DOC_NAME } : null,
    });
    const maxChars = Number(process.env.AGENTIC_LOSSLESS_MAX_CHARS) || 3_000_000;
    const la = assembleFullSourceLossless(docs, maxChars);
    src = la.source;
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, src);
    console.log(`fullSource assembled: ${src.length} chars · keptDocs=${la.keptDocs} · truncated=${la.truncated} · cached → ${CACHE}`);
  }

  console.log(`\n══ CLASS DISPATCH ══`);
  console.log(`  ucfHeaderCount (loose)          : ${ucfHeaderCount(src)}`);
  console.log(`  ucfHeaderKeys  (strict, no TOC) : [${[...ucfHeaderKeys(src, { excludeToc: true })].sort().join(",")}]`);
  console.log(`  AUDIT_UCF_CLASS_STRICT          : ${process.env.AUDIT_UCF_CLASS_STRICT ?? "(unset)"}`);
  console.log(`  detectDocumentClass             : ${detectDocumentClass(src)}`);
  const bg = checkBiddableContent(src);
  console.log(`  checkBiddableContent            : ok=${bg.ok}${bg.missing.length ? ` missing=[${bg.missing.join(" · ")}]` : ""}`);

  const lines = src.split("\n").map((l) => l.trim()).filter(Boolean);
  const bag = detectSections({ pages: [{ pageNum: 1, text: src, lines }], rawText: src, pageCount: 1, extractionMethod: "fallback", warnings: [] });
  const ucf = Object.entries(bag.sections).filter(([, s]) => s?.text?.trim()).map(([k, s]) => `${k}:${s!.text.length}`);
  console.log(`\n══ DETERMINISTIC UCF SLICER (detectSections) ══\n  populated: {${ucf.join(", ")}}`);

  report("V1 legacy anchors — THIS IS WHAT PRODUCTION RUNS (AUDIT_COMMERCIAL_ROUTING_V2=false)", src, V1, false);
  report("V2 anchors (AUDIT_COMMERCIAL_ROUTING_V2=true)", src, V2, true);
}

main().catch((e) => { console.error(e); process.exit(1); });
