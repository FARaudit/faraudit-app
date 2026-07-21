/**
 * $0 PRE-FIRE PRE-SCREEN (Build C model) — N0016726Q1089 (NAVFAC/NAVSUP Hydraulic Hardline Piping, Total SB).
 *   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_prescreen-buildC-N0016726Q1089.ts
 *
 * Uses the SHIPPED Build C pipeline (censusPackage / pipelinePrescreen / projectWallClockSeconds) — the SAME model
 * the executor gate runs — against the ACTUAL fetched document set. Emits:
 *   (1) PER-DOC CENSUS from the assembler's authoritative has_text (item-6 direct doc listing);
 *   (2) census reconciliation — the pre-screen census cross-checked vs the direct listing (Brain #624-4 / pre-fire item 6);
 *   (3) COMMERCIAL vs UCF routing (detectDocumentClass on the assembled source);
 *   (4) pipelinePrescreen verdict — $ cost gate AND wall-clock gate — with a 20%-headroom read of the 360s budget.
 * NO Claude calls (SAM fetch + pdf-parse only).
 */
import { assembleSamDocumentSet } from "@/lib/sam-attachments";
import { detectDocumentClass, ucfHeaderCount } from "@/lib/panel-doc-class";
import { pipelinePrescreen, projectWallClockSeconds, type PackageCensus } from "@/lib/cost-prescreen";

const NOTICE = "fc808094a7504061a4539003d21f887c", SOL = "N0016726Q1089";
const BUDGET_MS = 360_000, HEADROOM = 0.20;

(async () => {
  console.log(`=== BUILD-C PRE-SCREEN ${SOL} (notice ${NOTICE.slice(0, 8)}…) ===\n`);
  const set = await assembleSamDocumentSet(NOTICE, SOL);
  if (!set?.primary) { console.log("❌ manifest fetch FAILED / no ingestible primary"); process.exit(1); }
  const ing = set.ingestion;
  const files = ing.files.filter((f) => f.ingested);

  // (1) PER-DOC CENSUS — the direct doc-by-doc listing with the authoritative machine-readable signal.
  console.log(`--- (1) DIRECT DOC LISTING — ${files.length}/${ing.files_total} ingested (authoritative has_text) ---`);
  let scannedByListing = 0, bytesByListing = 0;
  for (const f of files) {
    const scanned = f.has_text !== true;
    if (scanned) scannedByListing++;
    bytesByListing += f.bytes ?? 0;
    console.log(`  ${scanned ? "▩ SCANNED    " : "✓ machine-read"} ${(f.name || "?").slice(0, 50).padEnd(50)} bytes=${String(f.bytes ?? 0).padStart(9)} has_text=${f.has_text === true}`);
  }

  // Assembled text the panel reads (primary + notice-body + attachments), mirroring the executor's fullSource.
  const assembled = [set.primary, ...set.attachments].map((d, i) =>
    (set.attachments.length ? `\n\n==== DOCUMENT: ${d.name} ====\n\n` : "") + (d.text ?? "")).join("\n\n").trim();
  const chars = assembled.length;

  // Build the census EXACTLY as the executor gate does (ingestion-authoritative).
  const census: PackageCensus = {
    docCount: files.length,
    machineReadableChars: chars,
    scannedDocCount: files.filter((f) => f.has_text !== true).length,
    totalBytes: files.reduce((a, f) => a + (f.bytes ?? 0), 0),
    imageBytes: files.filter((f) => f.has_text !== true).reduce((a, f) => a + (f.bytes ?? 0), 0),
  };

  // (2) RECONCILIATION — census must equal the direct listing (item 6 = the 36C miscount never self-certifies again).
  console.log(`\n--- (2) CENSUS ↔ DIRECT-LISTING RECONCILIATION (pre-fire item 6) ---`);
  const recOk = census.scannedDocCount === scannedByListing && census.totalBytes === bytesByListing && census.docCount === files.length;
  console.log(`  docs        census=${census.docCount}      listing=${files.length}`);
  console.log(`  scannedDocs census=${census.scannedDocCount}      listing=${scannedByListing}`);
  console.log(`  totalBytes  census=${census.totalBytes} listing=${bytesByListing}`);
  console.log(`  chars(panel-readable) = ${census.machineReadableChars.toLocaleString()}`);
  console.log(`  → ${recOk ? "✅ RECONCILED (census matches the actual fetched set)" : "❌ MISMATCH — do NOT trust the projection"}`);

  // (3) ROUTING.
  const hdrs = ucfHeaderCount(assembled), klass = detectDocumentClass(assembled);
  console.log(`\n--- (3) ROUTING ---`);
  console.log(`  canonical UCF §A–M headers = ${hdrs} → detectDocumentClass = ${klass.toUpperCase()} ${klass === "commercial" ? "✅ (rides the commercial routing-line arm-proof)" : "(UCF)"}`);

  // (4) PIPELINE PRE-SCREEN — the shipped Build C gate.
  const p = pipelinePrescreen(census, { budgetMs: BUDGET_MS, headroom: HEADROOM });
  const projS = projectWallClockSeconds(census);
  console.log(`\n--- (4) BUILD-C PIPELINE PRE-SCREEN (budget ${BUDGET_MS / 1000}s · ≥${HEADROOM * 100}% headroom) ---`);
  console.log(`  COST       $${p.cost.projectedUsd.toFixed(2)}  vs gate $${p.cost.gateUsd.toFixed(2)}  → ${p.cost.pass ? "PASS" : "REFUSE"}`);
  console.log(`  WALL-CLOCK ${projS.toFixed(0)}s vs limit ${p.wallClock.effectiveLimitSeconds.toFixed(0)}s (budget ${p.wallClock.budgetSeconds}s) → headroom ${(100 * (1 - projS / p.wallClock.budgetSeconds)).toFixed(0)}% → ${p.wallClock.pass ? "PASS" : "REFUSE"}`);

  const fireReady = recOk && p.pass && klass === "commercial" && chars >= 2000;
  console.log(`\n=== VERDICT: ${fireReady ? "✅ FIRE-READY" : "❌ NOT fire-ready"} · route=${klass.toUpperCase()} · refusedBy=${p.refusedBy ?? "none"} ===`);
  process.exit(fireReady ? 0 : 1);
})().catch((e) => { console.error("HARNESS THREW:", e instanceof Error ? e.message : e); process.exit(2); });
