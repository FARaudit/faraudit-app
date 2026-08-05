// $0 CEILING SWEEP — which limit actually binds, from ingest to verdict, on a REAL package.
// No model call, no paid run. Downloads + deterministic assembly only.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { assembleSamDocumentSet, MAX_DOCS, MAX_TOTAL_TOKENS, MAX_TOTAL_PAGES, MAX_DOC_TOKENS, MAX_DOWNLOAD_BYTES } from "../../src/lib/sam-attachments";
import { buildAgenticDocs, MAX_FULLSOURCE_CHARS, assembleFullSource } from "../../src/lib/agentic-executor";
import { assembleFullSourceLossless } from "../../src/lib/agentic-lossless-ingest";

const NOTICE = "8799e548c40f4ecb91187408ce877023", SOL = "W911SG27BA002";
(async () => {
  const KEY = process.env.SAM_API_KEY!;
  const r = await fetch(`https://sam.gov/api/prod/opportunities/v2/search?api_key=${KEY}&postedFrom=07/15/2026&postedTo=08/05/2026&limit=100&offset=0&ptype=o,k,r&solnum=${SOL}`, { headers: { Accept: "application/json" } });
  const links = ((await r.json()).opportunitiesData ?? [])[0]?.resourceLinks ?? [];
  const set = await assembleSamDocumentSet(NOTICE, SOL, links);
  if (!set) { console.error("assembly null"); process.exit(1); }

  // Same shape production uses (audit-executor-v3.ts:251) — never a hand-rolled doc list.
  const docs = await buildAgenticDocs({
    primaryName: set.primary?.name ?? "primary solicitation",
    primaryBytes: set.primary?.buffer ?? null,
    primaryText: set.primary?.text ?? null,
    attachments: set.attachments.map((a) => ({ name: a.name, base64: a.base64, text: a.text ?? null })),
    noticeBody: null,
  });
  const whole = assembleFullSource(docs);
  const lossless = assembleFullSourceLossless(docs);

  console.log(`\n── CEILINGS, measured against this ONE real package ──`);
  const row = (name: string, limit: string, actual: string, binds: boolean) =>
    console.log(`  ${binds ? "⛔ BINDS" : "   ok   "}  ${name.padEnd(28)} limit ${limit.padStart(12)}   actual ${actual.padStart(12)}`);

  row("MAX_DOCS (ingest count)", String(MAX_DOCS), `${set.ingestion.files_ingested}/${set.ingestion.files_total}`, set.ingestion.files_ingested < set.ingestion.files_total);
  row("MAX_DOWNLOAD_BYTES", `${(MAX_DOWNLOAD_BYTES/1048576).toFixed(0)}MB`, "—", false);
  row("MAX_TOTAL_TOKENS", `${(MAX_TOTAL_TOKENS/1000).toFixed(0)}k`, `~${Math.round(whole.length/4/1000)}k`, whole.length/4 > MAX_TOTAL_TOKENS);
  row("MAX_TOTAL_PAGES (vision)", String(MAX_TOTAL_PAGES), "—", false);
  row("MAX_FULLSOURCE_CHARS", MAX_FULLSOURCE_CHARS.toLocaleString(), whole.length.toLocaleString(), whole.length > MAX_FULLSOURCE_CHARS);

  console.log(`\n── WHAT THE LOSSLESS ASSEMBLER ACTUALLY DID ──`);
  console.log(`  whole (pre-cap)      ${whole.length.toLocaleString()} chars from ${docs.length} docs`);
  console.log(`  final source         ${lossless.source.length.toLocaleString()} chars`);
  console.log(`  truncated            ${lossless.truncated}`);
  console.log(`  keptDocs             ${lossless.keptDocs}`);
  console.log(`  droppedDocs (${lossless.droppedDocs.length})     ${lossless.droppedDocs.slice(0,6).join(" · ") || "(none)"}`);
  console.log(`  contentLossDocs (${lossless.contentLossDocs.length}) ${lossless.contentLossDocs.slice(0,6).join(" · ") || "(none)"}`);
  console.log(`  noise-filtered (${lossless.filteredDocs.length})  ${lossless.filteredDocs.slice(0,4).join(" · ") || "(none)"}`);
  console.log(`\n  ⇒ documents_complete would be ${lossless.truncated ? "FALSE (honest INCOMPLETE)" : "true"}`);
})();
