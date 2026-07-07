// $0 deterministic gate for Tier 1 route + ingest fixes (engine line-audit 2026-07-06).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier1-route-ingest.ts
//
// T1-3 route.ts SAM-not-found guard: 404 only when there is genuinely no input.
//   A valid JSON+storage upload (pdf File null, safeName+pdfBuffer set) must NOT
//   404 before the safeName fallback synthesizes the solicitation.
// T1-4 sam-attachments.ts upload arm: mirror the SAM arm's FA-INGEST3 page
//   exemption — a text-deliverable doc contributes 0 VISION pages and is never
//   page-dropped. Both arms now share isTextDeliverableForPageBudget (no drift).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { applyPageBudget, isTextDeliverableForPageBudget } from "@/lib/sam-attachments";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTE = readFileSync(resolve(HERE, "../../src/app/api/audit/route.ts"), "utf8");
const SAM = readFileSync(resolve(HERE, "../../src/lib/sam-attachments.ts"), "utf8");

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };
const eq = (label: string, got: unknown, exp: unknown) => { JSON.stringify(got) === JSON.stringify(exp) ? pass++ : fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };

// ── T1-3: the SAM-not-found 404 predicate (pure) ──
// Fired only when NOTHING to audit: !solicitation && !pdf && !safeName && !pdfBuffer.
const fire404 = (sol: unknown, pdf: unknown, safeName: unknown, pdfBuffer: unknown) => !sol && !pdf && !safeName && !pdfBuffer;
eq("T1-3 R1: storage upload (pdf File null, safeName+bytes set), SAM miss → NO 404 (falls to upload path)",
  fire404(null, null, "upload.pdf", Buffer.from("x")), false);
eq("T1-3 R2: multi-file upload (pdf null, safeName set) → NO 404", fire404(null, null, "Solicitation.pdf", null), false);
eq("T1-3 R3: single multipart (pdf File set) → NO 404", fire404(null, {}, null, null), false);
eq("T1-3 R4: bare noticeId, SAM miss, ZERO uploaded input → 404 (correct)", fire404(null, null, null, null), true);
eq("T1-3 R5: SAM hit → never 404 regardless of upload", fire404({}, null, null, null), false);
ok("T1-3 R6: route source gates on all upload signals, not stale !pdf alone",
  /if \(!solicitation && !pdf && !safeName && !pdfBuffer\) \{/.test(ROUTE));

// ── T1-4: real applyPageBudget + shared exemption predicate ──
// MAX_TOTAL_PAGES defaults to a few hundred; use an explicit small ceiling to force a drop.
const CEIL = 10;
const pageInput = (text: string, pages: number, role: "form" | "attachment" = "attachment") =>
  ({ resourceId: text.slice(0, 4) + pages, role, name: "d", pages: isTextDeliverableForPageBudget(text) ? 0 : pages });
const bigText = "A".repeat(5000); // meaningful, > MIN_TEXT_CHARS_FOR_TEXT_BLOCK
const failedText = "[PDF_EXTRACTION_FAILED] scanned image";

eq("T1-4 R7: a big text-deliverable doc is exempt (0 pages) → survives the page ceiling",
  applyPageBudget([pageInput("form", 3, "form"), pageInput(bigText, 40)], CEIL).ingest.length, 2);
eq("T1-4 R8: an image-only doc (extraction failed) keeps its pages → dropped over ceiling",
  applyPageBudget([pageInput("form", 3, "form"), pageInput(failedText, 40)], CEIL).ingest.length, 1);
eq("T1-4 R9: predicate — meaningful text is deliverable", isTextDeliverableForPageBudget(bigText), true);
eq("T1-4 R10: predicate — failed-extraction sentinel is NOT deliverable", isTextDeliverableForPageBudget(failedText), false);
eq("T1-4 R11: predicate — empty text is NOT deliverable", isTextDeliverableForPageBudget(""), false);

// ── T1-4: both arms call the SHARED predicate (no inlined pages:c.pages) ──
ok("T1-4 R12: upload arm Pass 2 uses the shared exemption (no unconditional pages:c.pages)",
  /pages: isTextDeliverableForPageBudget\(c\.text\) \? 0 : c\.pages/.test(SAM) && !/name: c\.entry\.name, pages: c\.pages \}/.test(SAM));
ok("T1-4 R13: SAM arm Pass 2 also uses the shared exemption",
  /pages: isTextDeliverableForPageBudget\(f\.text\) \? 0 : f\.pages/.test(SAM));

console.log(`\nTier1 route+ingest (T1-3 · T1-4): ${pass}/${pass + fails.length} PASS`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
