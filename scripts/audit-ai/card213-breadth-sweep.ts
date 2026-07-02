// Card 213 — PRE-FLIP BREADTH SWEEP ($0, deterministic-only, NO paid calls, NO grounding changes).
//   npx tsx scripts/audit-ai/card213-breadth-sweep.ts
//
// Runs every stored candidate package (*-FULL-SOURCE.txt) through the DETERMINISTIC stages under simulated
// flag-ON defaults: procurementPart → buildManifest → coreMissingFor (honest-fail gate) → proceduralCoveragePass
// (§L/§M extractor) → completenessOf. Per doc: format · sections found · procedural findings · L/M grounding ·
// deterministic disposition (would honest-fail vs committal-eligible). Prints a billable-rate estimate + the
// named failure patterns (which section classes the deterministic extractor misses). Evidence only — no engine
// or grounding changes, no registry writes.

import { readFileSync, readdirSync } from "fs";
import { buildManifest, completenessOf, coreMissingFor } from "@/lib/audit-orchestrator";
import { proceduralCoveragePass } from "@/lib/audit-procedural-coverage";
import { readSection, procurementPart, type AuditToolContext } from "@/lib/audit-tools";

// simulate the four flags ON (this run's env only — never touches prod)
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
process.env.AUDIT_SETASIDE_OVERTYPE_GUARD = "true";
process.env.AUDIT_PROCEDURAL_COVERAGE_LENS = "true";
process.env.AUDIT_PROCUREMENT_TYPE_SECTIONS = "true";

const GS = "scripts/audit-ai/gold-sets";
const ALL_SECTIONS = "ABCDEFGHIJKLM".split("");
// prefer the .complete.txt variant when both exist; one row per distinct package
const files = readdirSync(GS).filter((f) => f.endsWith("-FULL-SOURCE.txt") || f.endsWith("-FULL-SOURCE.complete.txt"));
const byPkg = new Map<string, string>();
for (const f of files) {
  const pkg = f.replace(/-FULL-SOURCE(\.complete)?\.txt$/, "");
  const cur = byPkg.get(pkg);
  if (!cur || (f.includes(".complete") && !cur.includes(".complete"))) byPkg.set(pkg, f);
}

type Row = {
  pkg: string; part: string; sectionsFound: string; required: string[]; procFindings: number;
  coreMissing: string[]; lStatus: string; mStatus: string; lmGrounded: boolean; disposition: string;
};

async function sweep() {
  const rows: Row[] = [];
  for (const [pkg, f] of [...byPkg.entries()].sort()) {
    const fullSource = readFileSync(`${GS}/${f}`, "utf8");
    const ctx: AuditToolContext = { fullSource };
    const part = procurementPart(ctx);
    const required = buildManifest(ctx);
    const sectionsRead = new Set(ALL_SECTIONS.filter((s) => readSection(ctx, s).present));
    const proc = await proceduralCoveragePass(ctx); // deterministic extractor; [] unless part12-commercial
    const coreMissing = coreMissingFor(ctx, { commercialHonestFail: true });
    const { attestations } = completenessOf(ctx, required, proc, sectionsRead, { sectionMDepth: true });
    const att = (s: string) => attestations.find((a) => a.section === s);
    const lStatus = att("L")?.status ?? (required.includes("L") ? "unread" : "n/a");
    const mStatus = att("M")?.status ?? (required.includes("M") ? "unread" : "n/a");
    const covered = (st: string) => st === "covered_direct" || st === "covered_attested" || st === "read_no_obligation";
    const lmGrounded = covered(lStatus) && covered(mStatus);

    let disposition: string;
    if (coreMissing.length) disposition = `HONEST-FAIL (core missing: ${coreMissing.join("/")})`;
    else if (part === "part12-commercial") disposition = lmGrounded ? "committal-eligible (L/M grounded)" : "L/M UNGROUNDED";
    else if (part === "part15-ucf") disposition = lmGrounded ? "committal-eligible (L/M present)" : "needs-AI (procedural extractor is part-12-only)";
    else disposition = `other-format (${part})`;

    rows.push({ pkg, part, sectionsFound: [...sectionsRead].join(""), required, procFindings: proc.length, coreMissing, lStatus, mStatus, lmGrounded, disposition });
  }

  // ── report ──
  console.log(`\n════ CARD 213 · PRE-FLIP BREADTH SWEEP · ${rows.length} packages · deterministic, flags simulated ON ════\n`);
  for (const r of rows) {
    console.log(`▪ ${r.pkg}`);
    console.log(`    format=${r.part}  sectionsFound=${r.sectionsFound || "(none)"}  required=[${r.required.join("")}]  procFindings=${r.procFindings}`);
    console.log(`    L=${r.lStatus}  M=${r.mStatus}  coreMissing=[${r.coreMissing.join("")}]  →  ${r.disposition}`);
  }

  // ── aggregate: billable-rate estimate + failure patterns ──
  const n = rows.length;
  const committal = rows.filter((r) => r.disposition.startsWith("committal-eligible"));
  const honestFail = rows.filter((r) => r.disposition.startsWith("HONEST-FAIL"));
  const ungrounded = rows.filter((r) => r.disposition.includes("UNGROUNDED"));
  const needsAI = rows.filter((r) => r.disposition.startsWith("needs-AI"));
  const other = rows.filter((r) => r.disposition.startsWith("other-format"));
  const byPart = (p: string) => rows.filter((r) => r.part === p).length;

  console.log(`\n──── AGGREGATE ────`);
  console.log(`  format mix: part12-commercial=${byPart("part12-commercial")} · part15-ucf=${byPart("part15-ucf")} · other=${n - byPart("part12-commercial") - byPart("part15-ucf")}`);
  console.log(`  DETERMINISTIC billable-rate estimate: ${committal.length}/${n} committal-eligible (${((committal.length / n) * 100).toFixed(0)}%)`);
  console.log(`    committal-eligible: ${committal.map((r) => r.pkg).join(", ") || "(none)"}`);
  console.log(`    honest-fail (core missing): ${honestFail.length} — ${honestFail.map((r) => r.pkg).join(", ") || "(none)"}`);
  console.log(`\n──── NAMED FAILURE PATTERNS (which section classes the deterministic stages miss) ────`);
  console.log(`  1. Part-15 UCF docs get ZERO procedural findings — proceduralCoveragePass is Part-12-only; §L/§M grounding for part-15 needs the AI lens: ${needsAI.length} docs [${needsAI.map((r) => r.pkg).join(", ") || "none"}]`);
  console.log(`  2. Part-12 docs with §L/§M present but extractor grounds nothing (UNGROUNDED): ${ungrounded.length} docs [${ungrounded.map((r) => r.pkg).join(", ") || "none"}]`);
  console.log(`  3. Core sections absent (deterministic honest-fail — correct, no-charge): ${honestFail.length} docs [${honestFail.map((r) => `${r.pkg}:${r.coreMissing.join("/")}`).join(", ") || "none"}]`);
  console.log(`  4. Non-UCF / non-commercial formats (manifest may under-detect): ${other.length} docs [${other.map((r) => r.pkg).join(", ") || "none"}]`);
  console.log(`\n(Deterministic-only: full multi-section coverage still requires the agentic lenses; this measures the flag-gated deterministic contribution — core honest-fail gate + §L/§M procedural grounding — NOT the whole audit.)\n`);
}

sweep().catch((e) => { console.error("SWEEP ERROR:", e); process.exit(1); });
