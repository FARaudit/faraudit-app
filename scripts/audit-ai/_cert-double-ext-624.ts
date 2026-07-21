/**
 * CERT — double-extraction fix (Brain #624-1).
 *
 * PROVES, at $0 (no network, no model calls):
 *   A. The assembler (assembleUploadedDocumentSet — twin of assembleSamDocumentSet) now
 *      CARRIES the already-extracted text on primary + attachments.
 *   B. The carried text is BYTE-IDENTICAL to a fresh extraction of the delivered buffer
 *      (so reuse cannot change what the panel reads).
 *   C. buildAgenticDocs with the carried text produces doc text BYTE-IDENTICAL to the
 *      old (text-dropped) path → panel inputs unchanged, flag-independent byte-identity.
 *   D. The reuse branch does NOT re-extract (poison-buffer sentinel: a doc whose bytes
 *      would extract to nothing still yields the carried text → the 2nd parse+OCR is gone).
 *   E. Truncation/image safety: when text is absent, buildAgenticDocs falls back to
 *      extraction exactly as before (no crash, matches old path).
 *
 * Run: npx tsx scripts/audit-ai/_cert-double-ext-624.ts
 */
import { assembleUploadedDocumentSet } from "@/lib/sam-attachments";
import { buildAgenticDocs } from "@/lib/agentic-executor";
import { extractText } from "@/lib/pdf-text-extractor";
import { textToPdfBuffer } from "@/lib/nonpdf-extractor";
import { createHash } from "crypto";

const h = (s: string) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails++;
};

// Realistic solicitation-shaped text, comfortably over the 200-char text-block floor.
const solText = [
  "SOLICITATION TESTQ0001 — COMBINED SYNOPSIS/SOLICITATION",
  "This is a combined synopsis/solicitation for commercial products prepared in accordance",
  "with FAR Subpart 12.6 and FAR 13. The Government intends to award a firm-fixed-price purchase order.",
  "SECTION L — Instructions: submit a quote by the response deadline. SECTION M — Evaluation: lowest price technically acceptable.",
  "The applicable NAICS code is 541519 with a small business size standard of $34.0 million.",
  "Clauses incorporated by reference: 52.212-1, 52.212-4, 52.212-5, 52.219-6, 52.222-3.",
].join("\n").repeat(3);
const sowText = [
  "ATTACHMENT 1 — STATEMENT OF WORK",
  "The contractor shall provide all labor, materials, and supervision to deliver the services described herein.",
  "Period of performance is twelve (12) months from date of award. Deliverables are due monthly.",
  "All work shall conform to the specifications in the referenced technical exhibits.",
].join("\n").repeat(3);

async function main() {
  const files = [
    { name: "Solicitation - TESTQ0001.pdf", buffer: textToPdfBuffer(solText, "Solicitation TESTQ0001") },
    { name: "Attachment 1 - SOW.pdf", buffer: textToPdfBuffer(sowText, "Attachment 1 SOW") },
  ];
  const set = await assembleUploadedDocumentSet(files, "TESTQ0001");

  // ── A: assembler carries text ─────────────────────────────────────────────
  ok("A1 primary carries text", !!set.primary?.text && set.primary.text.length > 0,
    `primary.text len=${set.primary?.text?.length ?? 0}`);
  ok("A2 every attachment carries text", set.attachments.length > 0 && set.attachments.every((a) => !!a.text && a.text!.length > 0),
    `attachments=${set.attachments.length}`);

  // ── B: carried text === fresh extraction of the delivered buffer ───────────
  const primFresh = (await extractText(set.primary!.buffer)).rawText ?? "";
  ok("B1 primary carried text is byte-identical to fresh extract", h(set.primary!.text!) === h(primFresh),
    `carried=${h(set.primary!.text!)} fresh=${h(primFresh)}`);
  for (const a of set.attachments) {
    const fresh = (await extractText(a.buffer)).rawText ?? "";
    ok(`B2 attachment "${a.name}" carried === fresh`, h(a.text!) === h(fresh),
      `carried=${h(a.text!)} fresh=${h(fresh)}`);
  }

  // ── C: buildAgenticDocs reuse path === old (text-dropped) path ─────────────
  const common = {
    primaryName: set.primary!.name,
    primaryBytes: set.primary!.buffer,
    noticeBody: null,
  };
  const docsReuse = await buildAgenticDocs({
    ...common,
    primaryText: set.primary!.text ?? null,
    attachments: set.attachments.map((a) => ({ name: a.name, base64: a.base64, text: a.text ?? null })),
  });
  const docsOld = await buildAgenticDocs({
    ...common,
    primaryText: null,
    attachments: set.attachments.map((a) => ({ name: a.name, base64: a.base64 })),
  });
  ok("C0 same doc count", docsReuse.length === docsOld.length, `${docsReuse.length} vs ${docsOld.length}`);
  for (let i = 0; i < docsReuse.length; i++) {
    ok(`C1 doc[${i}] "${docsReuse[i].name}" text byte-identical (reuse vs old)`,
      h(docsReuse[i].text) === h(docsOld[i].text),
      `reuse=${h(docsReuse[i].text)} old=${h(docsOld[i].text)} len=${docsReuse[i].text.length}`);
  }

  // ── D: reuse branch does NOT re-extract (poison buffer) ────────────────────
  // Bytes that extract to nothing usable; a carried text ≥ floor must survive verbatim.
  const SENTINEL = "SENTINEL_REUSE_MARKER — this exact string proves textOf returned the carried text without re-extracting. ".repeat(3);
  // A VALID PDF that extracts to (near-)empty text: proves reuse skips extraction (D) and
  // the absent-text fallback extracts cleanly to empty (E) without the pdf-parse garbage-buffer throw.
  const poison = textToPdfBuffer("   ", "blank");
  const docsPoison = await buildAgenticDocs({
    primaryName: "poison-primary",
    primaryBytes: poison,
    primaryText: SENTINEL,
    attachments: [{ name: "poison-att", base64: poison.toString("base64"), text: SENTINEL }],
    noticeBody: null,
  });
  ok("D1 primary reuse skips extraction (poison bytes → carried text survives)",
    docsPoison[0]?.text === SENTINEL);
  ok("D2 attachment reuse skips extraction (poison bytes → carried text survives)",
    docsPoison.some((d) => d.name === "poison-att" && d.text === SENTINEL));

  // ── E: no carried text → falls back to extraction (no crash) ───────────────
  const docsNoText = await buildAgenticDocs({
    primaryName: "poison-primary",
    primaryBytes: poison,
    primaryText: null,
    attachments: [{ name: "poison-att", base64: poison.toString("base64") }],
    noticeBody: null,
  });
  ok("E1 absent-text fallback returns without crash", Array.isArray(docsNoText) && docsNoText.length >= 1);
  ok("E2 absent-text poison extracts to empty (unchanged old behavior)",
    (docsNoText.find((d) => d.name === "poison-att")?.text ?? "") === "");

  console.log(`\n${fails === 0 ? "✅ ALL PASS" : `❌ ${fails} FAIL`} — double-extraction fix cert (Brain #624-1)`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
