// STAGE 4 — independent ground-truth PROPOSER (PAID). The non-circular first half of
// the SME-validated hybrid: an ensemble that is STRUCTURALLY UNLIKE the engine-under-
// test (N high-effort WHOLE-PACKAGE full-reads, not the per-doc MAP) proposes a
// candidate binding inventory. CEO + Code (lead SME) then ADJUDICATE — the human is the
// final arbiter, so the gold set isn't "AI grading AI."
//
// Output: scripts/audit-ai/gold-sets/<packageId>.proposed.json with adjudicated:false.
// A human reviews, marks plantedHard items, trims false positives, sets adjudicated:true.
//
// SPEND GATE: ~3 Opus full-reads per package (~$50–100 across 4 pkgs). ANNOUNCED +
// CEO-greenlit; never run from a gate. Run:
//   npx tsx scripts/audit-ai/ab-propose.ts --audit-id <uuid> --package-id <id> [--passes 3]
//
// See ceo/AGENTIC-ENGINE-REBUILD-PLAN.md Stage 4.
import dotenv from "dotenv";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Solicitation } from "@/lib/sam";
import { GATE_TOKENS, clauseNumber } from "./ab-extract-adapter";

dotenv.config({ path: ".env.local", quiet: true });

const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const auditId = arg("--audit-id");
const packageId = arg("--package-id");
const passes = Number(arg("--passes") ?? "3");
if (!auditId || !packageId) throw new Error("usage: ab-propose.ts --audit-id <uuid> --package-id <id> [--passes 3]");

// Whole-package budget — the proposer's ONE job is full-coverage breadth, so it reads
// generously, but never silently: an over-budget package is trimmed with a VISIBLE note
// in the proposed file so the adjudicator knows coverage was partial.
const MAX_INPUT_CHARS = Number(process.env.PROPOSE_MAX_CHARS ?? 600_000);

const PROPOSER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["clauses", "requirements", "evalFactors", "gates"],
  properties: {
    clauses: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["number", "binding"],
        properties: {
          number: { type: "string", description: "FAR/DFARS clause number, e.g. 52.204-7 or 252.204-7012" },
          binding: { type: "boolean", description: "true if a miss could lose the bid (gates award/eligibility/compliance)" },
          rationale: { type: "string" },
        },
      },
    },
    requirements: { type: "array", items: { type: "string" }, description: "binding submission + performance obligations, one short signature each" },
    evalFactors: { type: "array", items: { type: "string" }, description: "Section M evaluation factor names" },
    gates: { type: "array", items: { type: "string", enum: [...GATE_TOKENS] }, description: "named hard gates present, from the controlled list ONLY" },
  },
} as const;

interface ProposerPass {
  clauses: Array<{ number: string; binding: boolean; rationale?: string }>;
  requirements: string[];
  evalFactors: string[];
  gates: string[];
}

async function main() {
  const { fetchSolicitationByNoticeId } = await import("@/lib/sam");
  const { assembleSamDocumentSet } = await import("@/lib/sam-attachments");
  const { buildAgenticDocs } = await import("@/lib/agentic-executor");
  const { callStructuredClaude } = await import("@/lib/anthropic-structured");

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const { data: row, error } = await admin
    .from("audits").select("notice_id, solicitation_number, naics_code, set_aside, response_deadline, title")
    .eq("id", auditId).single();
  if (error || !row) throw new Error(`cannot read audit ${auditId}: ${error?.message ?? "missing"}`);

  let solicitation = await fetchSolicitationByNoticeId(row.notice_id).catch(() => null);
  if (!solicitation) {
    solicitation = {
      noticeId: row.notice_id, solicitationNumber: row.solicitation_number, title: row.title || "Untitled",
      department: null, subTier: null, fullParentPathName: null, naicsCode: row.naics_code, type: null,
      typeOfSetAside: row.set_aside, postedDate: null, responseDeadLine: row.response_deadline,
      description: "", resourceLinks: [],
    } as Solicitation;
  }
  const assembled = await assembleSamDocumentSet(row.notice_id, row.solicitation_number).catch(() => null);
  if (!assembled?.primary) throw new Error("no ingestible primary from SAM — aborting (no $ spent)");

  const docs = await buildAgenticDocs({
    primaryName: assembled.primary.name, primaryBytes: assembled.primary.buffer,
    primaryText: null, attachments: assembled.attachments,
  });
  let packageText = docs.map((d) => `\n\n===== DOCUMENT: ${d.name} =====\n${d.text}`).join("");
  let truncatedNote = "";
  if (packageText.length > MAX_INPUT_CHARS) {
    truncatedNote = `PARTIAL: package text ${packageText.length} chars trimmed to ${MAX_INPUT_CHARS} — adjudicator must verify tail coverage.`;
    packageText = packageText.slice(0, MAX_INPUT_CHARS);
    console.warn(`[propose] ${truncatedNote}`);
  }

  const system =
    "You are an independent senior contracts SME building a GROUND-TRUTH inventory for a federal " +
    "solicitation package. Read the ENTIRE package. List EVERY binding FAR/DFARS clause, EVERY binding " +
    "submission + performance requirement, EVERY Section M evaluation factor, and EVERY named hard gate. " +
    "Be exhaustive on BINDING items (a miss loses a bid) and precise on clause numbers. Mark binding=true " +
    "only for items that gate award, eligibility, or compliance. Gates MUST come from the provided enum only.";

  // N independent passes, each told to be exhaustive — union below reduces single-pass omission.
  const results: ProposerPass[] = [];
  for (let i = 0; i < passes; i++) {
    console.log(`[propose] pass ${i + 1}/${passes} (Opus full-read)...`);
    const r = await callStructuredClaude({
      apiKey, model: "claude-opus-4-8", system,
      userPrompt: `Package: ${row.solicitation_number} — ${row.title}\nControlled gate vocabulary: ${GATE_TOKENS.join(", ")}\n\n${packageText}`,
      schema: PROPOSER_SCHEMA, maxTokens: 16_000, label: `propose-pass-${i + 1}`,
    });
    results.push(JSON.parse(r.text) as ProposerPass);
  }

  // ── Union the passes (breadth) — clause by canonical number, text by normalized key ──
  const clauseMap = new Map<string, { number: string; binding: boolean; votes: number; rationale?: string }>();
  for (const pass of results) {
    for (const c of pass.clauses) {
      const num = clauseNumber(c.number) ?? c.number.trim();
      const prev = clauseMap.get(num);
      if (prev) { prev.votes++; prev.binding = prev.binding || c.binding; }
      else clauseMap.set(num, { number: num, binding: c.binding, votes: 1, rationale: c.rationale });
    }
  }
  const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
  const unionText = (key: (p: ProposerPass) => string[]) => {
    const seen = new Map<string, string>();
    for (const p of results) for (const s of key(p)) { const k = norm(s).toLowerCase(); if (k && !seen.has(k)) seen.set(k, norm(s)); }
    return [...seen.values()];
  };
  const gates = [...new Set(results.flatMap((p) => p.gates))].filter((g) => (GATE_TOKENS as readonly string[]).includes(g));

  const proposed = {
    _README: "PROPOSED by ab-propose.ts — NOT adjudicated. CEO + Code must review: mark plantedHard items, trim false positives, confirm binding flags, then set adjudicated:true. Gates are controlled-vocab. votes = how many of the N independent passes surfaced each clause (low votes = scrutinize).",
    packageId, auditId, adjudicated: false,
    proposerPasses: passes,
    truncatedNote: truncatedNote || undefined,
    groundTruth: {
      clauses: [...clauseMap.values()].sort((a, b) => b.votes - a.votes).map((c) => ({ number: c.number, binding: c.binding, _votes: c.votes, _rationale: c.rationale })),
      requirements: unionText((p) => p.requirements),
      evalFactors: unionText((p) => p.evalFactors),
      gates,
    },
  };

  const out = path.join(__dirname, "gold-sets", `${packageId}.proposed.json`);
  writeFileSync(out, JSON.stringify(proposed, null, 2));
  console.log(`\nwrote ${out}`);
  console.log(`  clauses=${clauseMap.size} (binding=${[...clauseMap.values()].filter((c) => c.binding).length}) · requirements=${proposed.groundTruth.requirements.length} · evalFactors=${proposed.groundTruth.evalFactors.length} · gates=${gates.join(",") || "none"}`);
  console.log(`NEXT (human, non-circular): review → mark plantedHard → trim → set adjudicated:true → rename to ${packageId}.json`);
}

main().catch((e) => { console.error("FATAL:", e instanceof Error ? e.message : e); process.exit(1); });
