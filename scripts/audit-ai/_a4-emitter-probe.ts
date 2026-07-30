// ── A4 · EMITTER-LAYER PROBE (Brain step-4 envelope item 3) ─────────────────────────────────────────────────
// THE THIRD LAYER. The A4 inventory measured two layers and named a third it could not reach:
//   phase 1 — verdict-time replay        → blind to everything upstream of the FROZEN coverageV2 (30/40 records)
//   phase 2 — importanceOf classification → blind to the ORCHESTRATOR'S EMITTERS
//   phase 3 — THIS PROBE                 → `completenessOf`, where AUDIT_COVERED_DIRECT_BAR_FLOOR and
//                                          AUDIT_ELIG_BAR_PASSIVE_FRAME actually live
// Without this, those two flags read "0 effect" in both earlier layers purely because the harness could not see
// them — absence of measurement, which D3 forbids reporting as safety.
//
// METHOD: replay every banked record's REAL source through the exported `completenessOf` with a minimal ctx
// (verified by enumeration: the function touches only `ctx.fullSource` and `ctx.constructionManifest`), toggling
// each flag and diffing the emitted attestations/obligations. Executed, not grepped (L40-D2).
//   npx tsx scripts/audit-ai/_a4-emitter-probe.ts
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const FLAGS = [
  "AUDIT_COVERED_DIRECT_BAR_FLOOR",
  "AUDIT_ELIG_BAR_PASSIVE_FRAME",
  "AUDIT_AMBIGUOUS_SIGNAL_DEMOTION",
  "AUDIT_BENIGN_RECITAL_COVERED",
  "AUDIT_PERFORMANCE_UPKEEP_CAVEAT",
  "AUDIT_CREDENTIAL_CONDITIONAL_REASON",
  "AUDIT_LPTA_CONSEQUENCE_AMBIGUOUS",
  "AUDIT_LEDGER_BROAD_AMBIGUOUS",
  "AUDIT_BOND_PAPER_NONBAR",
  "AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD",
  "AUDIT_BAR_SIGNAL_REGISTER_TOKENS",
];

(async () => {
  const { completenessOf } = await import("../../src/lib/audit-orchestrator");
  const DIR = path.join(__dirname, "run-records");
  const recs: Array<{ file: string; source: string; findings: any[] }> = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".run-record.json")).sort()) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      const source = r?.result?.inputs?.source || r?.input?.fullSource || "";
      const findings = r?.result?.inputs?.findings || [];
      if (source) recs.push({ file: f, source, findings });
    } catch { /* skip */ }
  }
  // Section keys the emitters gate on; `sectionsRead` is what marks a section analyzed.
  const SECTIONS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];

  const snapshot = (): string => {
    const out: string[] = [];
    for (const r of recs) {
      const ctx: any = { fullSource: r.source, constructionManifest: null };
      try {
        const res = completenessOf(ctx, SECTIONS, r.findings as any, new Set(SECTIONS));
        // capture the EMITTED ledger surface: attestations + their obligation lists
        out.push(`${r.file}|${(res.covered || []).join(",")}|${(res.missing || []).join(",")}|` +
          (res.attestations || []).map((a: any) => `${a.section}:${(a.obligations || []).length}:${(a.obligations || []).join("~").slice(0, 400)}`).join(";"));
      } catch (e) { out.push(`${r.file}|THREW:${String(e instanceof Error ? e.message : e)}`); }
    }
    return crypto.createHash("sha256").update(out.join("\n")).digest("hex").slice(0, 16);
  };

  // Live parity baseline (D3).
  const LIVE: Record<string, string> = {
    AUDIT_GATE_V2: "true", AUDIT_AMBIGUOUS_SIGNAL_DEMOTION: "true",
    AUDIT_COVERED_DIRECT_BAR_FLOOR: "true", AUDIT_ELIG_BAR_PASSIVE_FRAME: "true",
  };
  for (const [k, v] of Object.entries(LIVE)) if (process.env[k] === undefined) process.env[k] = v;

  console.log(`── A4 PHASE 3 · EMITTER LAYER — ${recs.length} banked records through the real completenessOf ──\n`);
  const rows: Array<{ flag: string; active: boolean }> = [];
  for (const flag of FLAGS) {
    const prev = process.env[flag];
    process.env[flag] = "false"; const off = snapshot();
    process.env[flag] = "true";  const on = snapshot();
    if (prev === undefined) delete process.env[flag]; else process.env[flag] = prev;
    const active = off !== on;
    rows.push({ flag, active });
    console.log(`${flag.padEnd(38)} ${active ? "● ACTIVE at the emitter layer" : "○ no effect at this layer"}`);
  }

  const active = rows.filter((r) => r.active);
  console.log("\n" + "═".repeat(76));
  console.log(`EMITTER-LAYER ACTIVE: ${active.length}${active.length ? " → " + active.map((r) => r.flag).join(", ") : ""}`);
  console.log("\nA flag ACTIVE here emits into the coverage ledger, so its output lands in `disqualifierUncovered`");
  console.log("— the bucket veto retirement de-authorizes. Per L40-D2 each needs an explicit disposition:");
  console.log("keep-alive path, or ruled retirement. NO SILENT DEATHS.");
  console.log("\nA flag with no effect across ALL THREE layers is measured-inert ON THIS CORPUS — which is an");
  console.log("A1-class UNOWNED stamp for the corpus, NOT proof it does nothing in production (D3).");
})();
