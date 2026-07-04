// C.f — RULED FORKS C-2 / C-5 / C-8 + C-19 interim guard. $0, deterministic, NO engine calls.
//   npx tsx scripts/audit-ai/test-cgroup-forks.ts
//
// Load-bearing negative (Brain C.f): the real T-38 FA301626Q0068 Statement-of-Need attachment, ingested WITH text
// but UNANALYZED (no finding grounded in it), must NOT read COMPLETE (C-2). Plus the C-8 expanded section set +
// its thin-section relief valve (anti-Option-A), the C-5 unrecognized-format cap, and the C-19 detect+disclose.

import { BINDING_SECTIONS, coreMissingFor, documentsCovered, detectAmendments, findingProvenance } from "@/lib/audit-orchestrator";
import { assembleFullSource } from "@/lib/agentic-executor";
import type { TypedFinding } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (l: string, c: boolean) => { if (c) pass++; else { fails.push(l); console.log(`  [FAIL] ${l}`); } };
const buf = Buffer.from("x");

// ── C-8: BINDING_SECTIONS expanded to {B,C,D,E,F,H,I,K,L,M}; G/J NOT completeness-required ──
ok("C-8: §D/§E/§F/§K are now binding-completeness sections", ["D", "E", "F", "K"].every((s) => (BINDING_SECTIONS as readonly string[]).includes(s)));
ok("C-8: §G and §J are NOT in the completeness set (read-and-attest only)", !(BINDING_SECTIONS as readonly string[]).includes("G") && !(BINDING_SECTIONS as readonly string[]).includes("J"));

// ── C-5: unrecognized format with NO locatable core → cannot certify → coreMissing; a parseable one → [] ──
ok("C-5: an unrecognized structureless blob (no §C/§L/§M) → coreMissing = [C,L,M]", coreMissingFor({ fullSource: "random unstructured text with no solicitation headers whatsoever." }).length === 3);
ok("C-5: an unknown-format package that still has an inline SOW (§C present) is NOT flagged", coreMissingFor({ fullSource: "Statement of Work\nThe contractor shall perform the work as specified." }).length === 0);

// ── C-2: a binding SON attachment with obligations but NO grounding finding → NOT covered ──
const T38_SON = "Statement of Need (SoN)\nThe contractor shall deliver three T-38 pitot probes within 45 days after receipt of order and shall provide a certificate of conformance.";
const PRIMARY = "SECTION L - INSTRUCTIONS\nSubmit a quote.\nSECTION M - EVALUATION\nAward on price.";
const asm = (son: string, extra: { name: string; text: string }[] = []) => assembleFullSource([{ name: "Solicitation - FA301626Q0068", text: PRIMARY, bytes: buf }, { name: "Attachment 1 - Statement of Need", text: son, bytes: buf }, ...extra.map((e) => ({ ...e, bytes: buf }))]);
ok("C-2: SON binding attachment with obligations + NO finding grounded in it → NOT complete", documentsCovered(asm(T38_SON), []).complete === false);
// a finding grounded IN the SON → covered
const sonFinding: TypedFinding = { id: "f#0", requirement: "delivery", citation: "§F", excerpt: "shall deliver three T-38 pitot probes within 45 days", grounded: true, lens: "ko", kind: "technical_spec", controllability: "bidder_controls" };
ok("C-2: SON with a finding grounded in it → complete", documentsCovered(asm(T38_SON), [sonFinding]).complete === true);
// thin binding attachment (no obligation sentence) → relief valve → covered even with no finding
ok("C-2 relief valve: a thin binding attachment (no obligations) → covered", documentsCovered(asm("Insignia and Markings reference sheet. See specification drawing."), []).complete === true);
// non-binding attachment (reps & certs) → exempt even with obligations + no finding
ok("C-2: a non-binding reps&certs attachment is exempt", documentsCovered(assembleFullSource([{ name: "Solicitation", text: PRIMARY, bytes: buf }, { name: "52.204-8 Reps and Certs", text: "The offeror shall complete and shall submit all representations.", bytes: buf }]), []).complete === true);
// single-doc package → always covered (section completeness governs)
ok("C-2: single-doc package → covered (no per-doc split)", documentsCovered(PRIMARY, []).complete === true);

// ── C-19 interim guard: detect + disclose + provenance, NO verdict cap ──
const amended = assembleFullSource([{ name: "Solicitation", text: PRIMARY, bytes: buf }, { name: "SF-30 Amendment 0001", text: "AMENDMENT OF SOLICITATION. The closing date is extended.", bytes: buf }]);
ok("C-19: an SF-30 amendment is detected", detectAmendments(amended) === true);
ok("C-19: a package with no amendment is not flagged", detectAmendments(asm(T38_SON)) === false);
const prov = findingProvenance(asm(T38_SON), [sonFinding]);
ok("C-19: finding provenance maps the finding to its source document", prov.length === 1 && /Statement of Need/.test(prov[0].doc));

console.log(`\n${fails.length ? "❌" : "✅"} C.f forks: ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`   - ${f}`)); process.exit(1); }
