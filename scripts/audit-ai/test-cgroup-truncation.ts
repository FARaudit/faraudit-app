// C.c — TRUNCATION PROPAGATION / R9 negatives (C-3 / C-4 / C-7 + R9 drop order). $0, deterministic, NO engine calls.
//   npx tsx scripts/audit-ai/test-cgroup-truncation.ts
//
// R9: every truncation of BINDING content surfaces ⇒ the read cannot read COMPLETE. Load-bearing negatives
// (Brain C.c): a >12k §M with a bar past char 12,000 must NOT read COMPLETE; a >25-obligation §C same.

import { completenessOf } from "@/lib/audit-orchestrator";
import { readSection } from "@/lib/audit-tools";
import { bindingContentLossDocs } from "@/lib/audit-executor-v3";
import { assembleFullSourceBudgeted } from "@/lib/agentic-executor";
import type { TypedFinding } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (l: string, c: boolean) => { if (c) pass++; else { fails.push(l); console.log(`  [FAIL] ${l}`); } };
const ing = (f: Record<string, unknown>) => ({ files: [f] }) as never;

// ── C-3: a §M with a bar PAST char 12,000 must NOT read COMPLETE ──
const filler = "padding text with no duty here. ".repeat(430); // ~13,300 chars, no obligation keyword
const barPastCap = "The contractor shall deliver the first article inspection report before any production delivery.";
const mSrc = ["SECTION L - INSTRUCTIONS", "Submit a quote.", "SECTION M - EVALUATION FACTORS FOR AWARD", "Award on a lowest-priced technically acceptable basis.", filler, barPastCap].join("\n");
const mCtx = { fullSource: mSrc };
ok("C-3: readSection(§M) reports truncated (full text exceeds the lens cap)", readSection(mCtx, "M").truncated === true);
const compM = completenessOf(mCtx, ["M"], [], new Set(["M"]));
ok("C-3: §M with an ungrounded bar past char 12,000 → NOT covered (missing)", compM.missing.includes("M"));
ok("C-3: §M attestation is obligations_ungrounded (the past-cap bar surfaced)", compM.attestations[0].status === "obligations_ungrounded");

// ── C-3b: a purely-filler section OVER the lens cap (no obligations) is a truncation event, not read_no_obligation ──
const bigFiller = { fullSource: ["SECTION C - STATEMENT OF WORK", "intro line.", "filler ".repeat(2500)].join("\n") }; // §C ~17k, no obligations
const compBig = completenessOf(bigFiller, ["C"], [], new Set(["C"]));
ok("C-3b: an over-cap filler §C is a truncation event → obligations_ungrounded (not silent read_no_obligation)", compBig.attestations[0].status === "obligations_ungrounded" && compBig.missing.includes("C"));

// ── C-7: a §C with more than 200 obligation sentences → truncation flag → NOT covered ──
const many = Array.from({ length: 215 }, (_, i) => `The contractor shall provide deliverable item number ${i}.`).join("\n");
const cSrc = { fullSource: ["SECTION C - STATEMENT OF WORK", many].join("\n") };
// ground the first 200 so only the >200 overflow is uncovered — proves the CAP (not mere ungrounding) forces incomplete
const groundAll: TypedFinding[] = [{ id: "c#0", requirement: "all items", citation: "§C", excerpt: "The contractor shall provide deliverable as specified in the attached schedule herein", grounded: true, lens: "ko", kind: "technical_spec", controllability: "bidder_controls" }];
const compC = completenessOf(cSrc, ["C"], groundAll, new Set(["C"]));
ok("C-7: §C with >200 obligation sentences → obligations_ungrounded (cap overflow flagged) → missing", compC.attestations[0].status === "obligations_ungrounded" && compC.missing.includes("C"));

// ── C-4: a per-doc MID-DOCUMENT truncated BINDING doc is a content loss (even with has_text=true) ──
ok("C-4: truncated binding doc (has_text:true) → content loss", bindingContentLossDocs(ing({ name: "Statement of Work.pdf", role: "attachment", bytes: 900000, ingested: true, has_text: true, truncated: true })).length === 1);
ok("C-4: truncated NON-binding doc → not a loss", bindingContentLossDocs(ing({ name: "52.204-8 Reps and Certs.pdf", role: "attachment", bytes: 900000, ingested: true, has_text: true, truncated: true })).length === 0);
ok("C-4: a whole (non-truncated) binding doc with text → no loss", bindingContentLossDocs(ing({ name: "SOW.pdf", role: "attachment", bytes: 1000, ingested: true, has_text: true })).length === 0);

// ── R9: over-budget drop is BINDING-PRIORITY — a non-binding doc drops before a binding one ──
const buf = Buffer.from("x");
const primary = { name: "Solicitation.pdf", text: "SECTION C\n" + "a".repeat(300000), bytes: buf };
const repsCerts = { name: "52.204-8 Reps and Certs.pdf", text: "r".repeat(400000), bytes: buf };
const sow = { name: "Statement of Work.pdf", text: "s".repeat(400000), bytes: buf };
const asm = assembleFullSourceBudgeted([primary, repsCerts, sow], 850000); // budget fits primary + one 400k doc only
ok("R9: the NON-binding reps&certs is dropped, not the binding SOW", asm.droppedDocs.includes("52.204-8 Reps and Certs.pdf") && !asm.droppedDocs.includes("Statement of Work.pdf"));
ok("R9: a binding drop / any drop sets truncated ⇒ documents_complete=false", asm.truncated === true);
// byte-identity: everything fits ⇒ original order preserved, no drop
const asmFit = assembleFullSourceBudgeted([primary, sow], 2000000);
ok("R9: nothing dropped when it all fits (order-stable, byte-identical)", asmFit.truncated === false && asmFit.droppedDocs.length === 0);

console.log(`\n${fails.length ? "❌" : "✅"} C.c truncation: ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`   - ${f}`)); process.exit(1); }
