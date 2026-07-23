// SCOPE B4 — ADVERSARIAL FLAG-OFF BYTE-IDENTITY. Serializes the FULL Decision object (not just the verdict word)
// for every banked run-record input, with every arc flag explicitly OFF. Run this in the working tree AND in a
// detached worktree at main, then diff the two JSON outputs: any difference is a byte-identity violation.
//   npx tsx scripts/audit-ai/_ultra-b4-flagoff-identity.ts > /tmp/<label>.json
import * as fs from "fs";
import * as path from "path";
import { deriveVerdict } from "../../src/lib/audit-decide";

// Hard-clear EVERY arc flag — flag-OFF must mean OFF regardless of ambient env.
for (const k of ["AUDIT_SETASIDE_BACKSTOP", "AUDIT_TEMPORAL_VERDICT", "AUDIT_INCOMPLETE_PRECEDENCE", "AUDIT_RETIRE_VERBATIM_VETO", "AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD", "AUDIT_BAR_SIGNAL_REGISTER_TOKENS", "AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM", "AUDIT_BANNER_BAR_RANKING", "AUDIT_VETO_NARROW_UNIVERSAL"]) delete process.env[k];

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
    temporalClosed: d.temporalClosed ?? null,                 // must be ABSENT/null with the flag off
    showStoppers: (d.showStoppers ?? []).map((x: any) => x.citation),
    dispositions: (d.dispositions ?? []).map((x: any) => `${x.citation}|${x.disposition}|${x.kind}|${x.controllability}`),
  });
}
console.log(JSON.stringify(out, null, 1));
