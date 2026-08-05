// INGEST SHORTFALL DISCLOSURE — CI gate. Run: npx tsx src/lib/sam-attachments-shortfall.test.ts
//
// THE DEFECT (measured, live run 58c612f5 / W911SG27BA002, 2026-08-05): the worker logged one line,
// "document set assembled · 36/55 ingested", and nothing else. Nineteen documents were dropped — 17 to
// the MAX_DOCS cap, 2 as unsupported types — and ALL NINETEEN were binding, including UFGS Earthwork,
// Cast-in-Place Concrete, Electrical, and SF 1413 (a form the bidder must submit). The reasons were
// already recorded per-file; nothing printed them. The run then aborted on the 360s budget, and the
// abort path persists nothing, so the reasons were lost with the process too.
//
// WHAT IS ASSERTED: the shortfall is DISCLOSED — count, binding count, every reason, and every binding
// document by name. Not that the package is rescued: dropping is a capacity decision (MAX_DOCS), and the
// completeness guard already caps such a run to INCOMPLETE. This gate is about visibility.
//
// The fixture mirrors the real disposition rather than inventing a shape.

import assert from "node:assert";
import { logIngestShortfall } from "./sam-attachments";
import type { IngestionMeta } from "./sam-attachments";

let passed = 0;
const ok = (label: string, cond: boolean) => { assert.ok(cond, `FAIL — ${label}`); console.log(`  ✓ ${label}`); passed++; };

function capture(meta: IngestionMeta): string {
  const lines: string[] = [];
  const real = console.warn;
  console.warn = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
  try { logIngestShortfall(meta); } finally { console.warn = real; }
  return lines.join("\n");
}

const f = (name: string, ingested: boolean, reason?: string, role: "form" | "amendment" | "attachment" = "attachment") =>
  ({ name, role, bytes: 1000, ingested, ...(reason ? { reason } : {}), section_roles: [] });

// The real W911SG27BA002 disposition, in miniature.
const meta = {
  files_total: 55,
  files_ingested: 36,
  form_identified: true,
  form_name: "W911SG27BA002 Instructions to Bidders (Revised).pdf",
  overflow: "19 of 55 files not ingested (budget: 36 docs / ...)",
  files: [
    f("W911SG27BA002 Instructions to Bidders (Revised).pdf", true, undefined, "form"),
    f("Attachment N - UFGS 31 00 00 Earthwork.pdf", false, "document cap (36) reached"),
    f("Attachment N - UFGS 26 00 00 Electrical.pdf", false, "document cap (36) reached"),
    f("Attachment J - SF 1413 Statement and Acknowledgement for Subcontractors.pdf", false, "document cap (36) reached"),
    f("TXDOT SpecSheet Link", false, "unsupported attachment type (not PDF/DOCX/XLSX)"),
  ],
} as unknown as IngestionMeta;

console.log("── ingest shortfall disclosure ──");
const out = capture(meta);

ok("the headline states how many were dropped", /4 of 55 document\(s\) NOT ingested/.test(out));
ok("the headline states how many were BINDING — the number that decides soundness", /BINDING/.test(out) && /4 of them BINDING/.test(out));
ok("it says completeness already caps the verdict, so the line is not mistaken for the guard",
  /caps to INCOMPLETE/.test(out));
ok("every distinct reason is reported", /document cap \(36\) reached/.test(out) && /unsupported attachment type/.test(out));
ok("the reason counts are grouped, not per-file spam", /3× document cap/.test(out));

// THE CORE ASSERTION: a binding specification cannot vanish without being named.
for (const name of [
  "Attachment N - UFGS 31 00 00 Earthwork.pdf",
  "Attachment N - UFGS 26 00 00 Electrical.pdf",
  "Attachment J - SF 1413 Statement and Acknowledgement for Subcontractors.pdf",
  "TXDOT SpecSheet Link",
]) ok(`named individually: ${name.slice(0, 52)}`, out.includes(name));

// THE COMPLEMENT — silence when nothing was dropped. Without this the gate would pass on a version that
// shouts on every run, which is its own failure: an always-on warning is read as noise and stops working.
const clean = { files_total: 2, files_ingested: 2, form_identified: true, form_name: "x", files: [f("a.pdf", true), f("b.pdf", true)] } as unknown as IngestionMeta;
ok("a fully-ingested package logs NOTHING (the warning must stay rare enough to be read)", capture(clean) === "");

// A drop with NO reason must be loud, not swallowed — every drop carries one or we want to know.
const noReason = { files_total: 2, files_ingested: 1, form_identified: true, form_name: "x", files: [f("a.pdf", true), f("b.pdf", false)] } as unknown as IngestionMeta;
ok("a drop with no recorded reason is flagged for investigation", /NO REASON RECORDED/.test(capture(noReason)));

// ── WIRING — the leg this gate did not have, and needed. ─────────────────────────────────────────
// Caught by its own red-proof: deleting the `logIngestShortfall(ingestion)` CALL from the assembly
// paths left every assertion above GREEN, because they exercise the helper directly. A correct helper
// nothing calls is the placebo shape — the fix reads as shipped and the log stays silent.
//
// This reads the source and asserts the call exists in BOTH assembly paths (SAM + upload). It is a
// structural check and it is honest about its limit: it proves the call is WRITTEN, not that it RAN.
// A behavioural check would need a live SAM fetch, which this gate deliberately does not do.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./sam-attachments.ts", import.meta.url), "utf8");
const callSites = (src.match(/^\s*logIngestShortfall\(ingestion\);/gm) ?? []).length;
ok(`the helper is CALLED from both assembly paths (found ${callSites}) — a helper nobody calls is a placebo`,
  callSites >= 2);

console.log(`\n✓ ${passed}/${passed} passed — ingest shortfall disclosure`);
