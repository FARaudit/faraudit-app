// C.a — SECTION-BOUNDARY INTEGRITY negatives (C-6 / C-9 / C-11). $0, deterministic, NO engine calls.
//   npx tsx scripts/audit-ai/test-cgroup-boundaries.ts
//
// Load-bearing on the REAL T-38 FA301626Q0068 manifest shape: the §J list names 3 attachments — Statement of
// Need (SoN), Insignias & Markings, Base Access Request Form. Here a primary solicitation (§L/§M) is assembled
// via the REAL assembleFullSource with a Statement-of-Need attachment (real T-38 SoN text) that carries a POISON
// "SECTION M" header + a distinctive binding obligation. The verdict-facing readSection() path must NOT let that
// attachment text bleed into §M (C-6), and the attachment-internal "SECTION M" must NOT mint/win a UCF boundary
// (C-11). Plus a prose-heading detection (C-9) and a single-doc byte-identity guard (the Option-A protection).

import { readSection } from "@/lib/audit-tools";
import { assembleFullSource } from "@/lib/agentic-executor";

let pass = 0; const fails: string[] = [];
const ok = (l: string, c: boolean) => { if (c) pass++; else { fails.push(l); console.log(`  [FAIL] ${l}`); } };

// Real T-38 SoN attachment content (verbatim excerpt from FA301626Q0068) + a POISON UCF header + a distinctive
// binding obligation that must never be read as part of §M.
const T38_SON = [
  "Statement of Need (SoN)                          02 Apr 2026",
  "Insignias and Markings                           02 Apr 2026",
  "Base Access Request Form",
  "SECTION M - EVALUATION FACTORS FOR AWARD (THIS LINE IS INSIDE THE ATTACHMENT AND MUST NOT WIN)",
  "The contractor shall deliver three T-38 pitot probes within 45 days after receipt of order.",
].join("\n");

const PRIMARY = [
  "SECTION L - INSTRUCTIONS TO OFFERORS",
  "Submit your quote by email no later than the closing date.",
  "SECTION M - EVALUATION FACTORS FOR AWARD",
  "Award will be made on a lowest-priced technically acceptable basis; price is the only factor.",
].join("\n");

const assembled = assembleFullSource([
  { name: "Solicitation - FA301626Q0068", text: PRIMARY, bytes: Buffer.from(PRIMARY) },
  { name: "Attachment 1 - Statement of Need", text: T38_SON, bytes: Buffer.from(T38_SON) },
]);
const ctx = { fullSource: assembled };
const m = readSection(ctx, "M");

// ── C-6: §M ends at the first attachment delimiter, never EOF ──
ok("C-6: §M detected in the primary solicitation", m.present && /lowest-priced technically acceptable/i.test(m.text));
ok("C-6: SON binding obligation does NOT bleed into §M", !/pitot probes within 45 days/i.test(m.text));
ok("C-6: attachment delimiter block not swallowed into §M", !/DOCUMENT:\s*Attachment/i.test(m.text));
// ── C-11: attachment-internal "SECTION M" does NOT mint/extend the UCF boundary ──
ok("C-11: attachment-internal 'SECTION M' did not win/extend §M", !/MUST NOT WIN/i.test(m.text));

// ── C-9: prose heading "M - BASIS FOR AWARD" (no 'SECTION' prefix) is detected ──
const proseCtx = { fullSource: ["SECTION L - INSTRUCTIONS", "Submit a quote.", "M - BASIS FOR AWARD", "Award is made to the lowest priced technically acceptable offer."].join("\n") };
const pm = readSection(proseCtx, "M");
ok("C-9: prose heading 'M - BASIS FOR AWARD' detected as §M", pm.present && /lowest priced technically acceptable offer/i.test(pm.text));
// negative guard: a bare "A - COVER" (no matching title) must NOT mint a section
const noFalse = { fullSource: ["A - COVER PAGE", "Nothing here.", "SECTION C - SCOPE", "Do the work."].join("\n") };
ok("C-9 guard: 'A - COVER PAGE' does NOT false-mint §A", !readSection(noFalse, "A").present);

// ── Byte-identity (Option-A guard): a single-doc source carries NO delimiter ⇒ §M runs to EOF, unchanged ──
const singleCtx = { fullSource: ["SECTION L - INSTRUCTIONS", "Submit.", "SECTION M - EVALUATION", "Award on price.", "Some trailing appendix text here."].join("\n") };
ok("byte-identity: single-doc §M still runs to EOF (unchanged behavior)", /trailing appendix text/i.test(readSection(singleCtx, "M").text));

console.log(`\n${fails.length ? "❌" : "✅"} C.a boundaries: ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`   - ${f}`)); process.exit(1); }
