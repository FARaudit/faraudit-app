// A4 · SNAPSHOT EMITTER — prints a deterministic Decision snapshot over every banked run-record, HONOURING the
// ambient env exactly as given (unlike _ultra-b4-flagoff-identity, which hard-clears the arc flags).
// Used by _a4-collateral-inventory.ts, which spawns this once per measured configuration so that MODULE-LOAD
// flags (e.g. GATE_V2_ENABLED) are captured correctly — an in-process toggle cannot do that.
import * as fs from "fs";
import * as path from "path";

(async () => {
  const { deriveVerdict } = await import("../../src/lib/audit-decide");
  const DIR = path.join(__dirname, "run-records");
  const out: any[] = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".run-record.json")).sort()) {
    let rec: any;
    try { rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { continue; }
    const inp = rec?.result?.inputs;
    if (!inp) continue;
    let d: any;
    try { d = deriveVerdict(inp); } catch (e) { d = { THREW: String(e instanceof Error ? e.message : e) }; }
    out.push({
      file: f,
      verdict: d.verdict, eligible: d.eligible, reason: d.reason,
      showStoppers: (d.showStoppers ?? []).map((x: any) => x.citation),
      dispositions: (d.dispositions ?? []).map((x: any) => `${x.citation}|${x.disposition}|${x.kind}|${x.controllability}`),
    });
  }
  console.log(JSON.stringify(out));
})();
