// $0 proof for the budgeted fullSource assembler (limits N3/N4).
// Run: npx tsx src/lib/agentic-fullsource-budget.test.ts
//
// Invariants: whole-doc degrade (NEVER a mid-document cut), named drops, honest
// `truncated` flag, first-doc always kept, and a true no-op under budget.

import { assembleFullSourceBudgeted, assembleFullSource, type AssembledSource } from "./agentic-executor";

const mk = (name: string, len: number) => ({ name, bytes: Buffer.from(""), text: "X".repeat(len) });

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// 1 — under budget → identical to plain assembleFullSource, no truncation
{
  const docs = [mk("a.pdf", 100), mk("b.pdf", 100), mk("c.pdf", 100)];
  const r: AssembledSource = assembleFullSourceBudgeted(docs, 1_000_000);
  check("T1 · under budget → not truncated", r.truncated === false, `truncated=${r.truncated}`);
  check("T2 · under budget → source identical to plain assembler", r.source === assembleFullSource(docs), "differs");
  check("T3 · under budget → all docs kept, none dropped", r.keptDocs === 3 && r.droppedDocs.length === 0, `kept=${r.keptDocs} dropped=${r.droppedDocs.length}`);
}

// 2 — over budget → drop WHOLE overflow docs, named; kept docs' text intact (no mid-cut)
{
  const docs = [mk("keep1.pdf", 400), mk("keep2.pdf", 400), mk("drop1.pdf", 400), mk("drop2.pdf", 400)];
  // Budget fits ~2 docs worth (each piece ≈ 400 + banner). 1000 keeps the first two.
  const r = assembleFullSourceBudgeted(docs, 1000);
  check("T4 · over budget → truncated flagged", r.truncated === true, `truncated=${r.truncated}`);
  check("T5 · over budget → overflow docs dropped by name", r.droppedDocs.includes("drop1.pdf") && r.droppedDocs.includes("drop2.pdf"), `dropped=[${r.droppedDocs.join(",")}]`);
  // Every KEPT doc keeps its FULL text — no mid-document truncation.
  const keptFull = r.source.includes("X".repeat(400)) && !r.source.includes("drop1.pdf") && !r.source.includes("drop2.pdf");
  check("T6 · over budget → kept docs uncut, dropped docs absent (no mid-cut)", keptFull, "mid-cut or leak");
  check("T7 · over budget → at least the first doc survives", r.keptDocs >= 1 && r.source.includes("keep1.pdf"), `kept=${r.keptDocs}`);
}

// 3 — a single doc larger than the ceiling → kept WHOLE; NOT truncated (it is the complete
//     content — nothing was dropped; a false honest-fail on a fully-read doc is the bug).
{
  const docs = [mk("giant.pdf", 5000)];
  const r = assembleFullSourceBudgeted(docs, 1000);
  check("T8 · single oversized doc → kept whole (non-empty source)", r.source.length >= 5000, `len=${r.source.length}`);
  check("T9 · single oversized doc → NOT truncated (kept whole = complete, no false honest-fail)", r.truncated === false, `truncated=${r.truncated}`);
  check("T10 · single oversized doc → nothing named-dropped (only one doc)", r.droppedDocs.length === 0, `dropped=${r.droppedDocs.length}`);
}

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
